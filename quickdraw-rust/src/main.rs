use std::sync::{Arc, OnceLock, RwLock};
use anyhow::Result;
use tokio::sync::mpsc;
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

use quickdraw_core::{
    commands::Command,
    pipeline::{self, SideEffect},
    state::{AppSnapshot, AppState},
    types::{DetectionEvent, DetectionSource, Point, TokenPrice},
};
use quickdraw_detection::enricher::{DetectionEnricher, RawDetection};
use quickdraw_ui::app::QuickdrawApp;
use quickdraw_ai::{
    provider::{AIProvider, AIRequest, Message},
    providers::haiku::HaikuProvider,
    task::AITask,
};
use solana_sdk::pubkey::Pubkey;

fn main() -> Result<()> {
    // Load .env from the project root (one level up from quickdraw-rust/)
    let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.join(".env"));
    if let Some(path) = env_path {
        let _ = dotenvy::from_path(path);
    }

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env()
                .add_directive("quickdraw=info".parse()?),
        )
        .init();

    let demo_mode     = std::env::args().any(|a| a == "--demo");
    let settings_mode = std::env::args().any(|a| a == "--settings");
    info!("Quickdraw starting{}{}", if demo_mode { " [DEMO]" } else { "" }, if settings_mode { " [SETTINGS]" } else { "" });

    // Remove WAYLAND_DISPLAY so winit uses X11 (XWayland) for rendering. Wayland rendering
    // on GNOME Mutter causes screen-wide flicker due to frame-timing conflicts.
    // Save the value first so spawn_webview_popup can restore it for the child —
    // webkit2gtk renders correctly as a native Wayland client.
    if let Ok(wd) = std::env::var("WAYLAND_DISPLAY") {
        SAVED_WAYLAND_DISPLAY.set(wd).ok();
        std::env::remove_var("WAYLAND_DISPLAY");
        info!("Using XWayland for rendering (WAYLAND_DISPLAY cleared for winit)");
    }

    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(4)
        .enable_all()
        .build()?;

    // Shared snapshot — UI reads this, fetch tasks write directly to it.
    // engine_task owns AppState and is the source of truth; initial snapshot matches.
    let initial = if demo_mode { quickdraw_ui::app::demo_snapshot() } else {
        let mut s = AppState::default();
        if settings_mode { s.settings_visible = true; }
        s.snapshot()
    };
    let snapshot: Arc<RwLock<AppSnapshot>> = Arc::new(RwLock::new(initial));

    // Single command channel: UI → engine
    let (cmd_tx, cmd_rx) = mpsc::channel::<Command>(256);

    // Repaint trigger: engine/tasks → UI
    let (repaint_tx, repaint_rx) = std::sync::mpsc::channel::<()>();

    // ── Detection pipeline ───────────────────────────────────────────────────
    let (detection_tx, mut detection_rx) = mpsc::channel::<DetectionEvent>(64);
    let enricher = Arc::new(DetectionEnricher::new(detection_tx));

    if !demo_mode {
        // Wait for eframe before starting OS-level watchers
        let startup_delay = std::time::Duration::from_secs(2);

        // Clipboard watcher — fires on Ctrl+C / copy
        let enricher_clip = enricher.clone();
        rt.spawn(async move {
            tokio::time::sleep(startup_delay).await;
            let mut rx = quickdraw_platform::linux::clipboard::spawn_clipboard_watcher();
            while let Some(text) = rx.recv().await {
                // Read cursor position at copy time so the popup appears near the user's cursor
                let position = quickdraw_platform::linux::clipboard::cursor_position()
                    .unwrap_or(Point { x: 100.0, y: 100.0 });
                enricher_clip.process(RawDetection {
                    text,
                    position,
                    source: DetectionSource::Accessibility { app_name: "clipboard".into() },
                }).await;
            }
        });

        // Selection watcher — fires when the user highlights text (no copy needed)
        let enricher_sel = enricher.clone();
        rt.spawn(async move {
            tokio::time::sleep(startup_delay).await;
            let mut rx = quickdraw_platform::linux::clipboard::spawn_selection_watcher();
            while let Some((text, position)) = rx.recv().await {
                enricher_sel.process(RawDetection {
                    text,
                    position,
                    source: DetectionSource::Selection,
                }).await;
            }
        });

        let cmd_tx_detect = cmd_tx.clone();
        rt.spawn(async move {
            while let Some(event) = detection_rx.recv().await {
                let _ = cmd_tx_detect.send(Command::TokenDetected(event)).await;
            }
        });
    }

    // ── Unix socket listener (browser extension → native host → here) ────────
    let cmd_tx_host = cmd_tx.clone();
    rt.spawn(host_socket_task(cmd_tx_host));

    // ── Reown auth callback server (localhost:9427) ───────────────────────────
    let cmd_tx_auth = cmd_tx.clone();
    rt.spawn(auth_callback_server(cmd_tx_auth));

    // ── Engine ───────────────────────────────────────────────────────────────
    let snap_engine   = snapshot.clone();
    let repaint_engine = repaint_tx.clone();
    rt.spawn(engine_task(cmd_rx, snap_engine, repaint_engine, settings_mode));

    // ── eframe ───────────────────────────────────────────────────────────────
    let native_opts = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("Quickdraw")
            .with_inner_size([quickdraw_ui::design::Tokens::PANEL_WIDTH, quickdraw_ui::design::Tokens::PANEL_HEIGHT])
            .with_resizable(false)
            .with_decorations(false)
            .with_visible(true)
            .with_window_level(egui::WindowLevel::AlwaysOnTop),
        ..Default::default()
    };

    let snap_ui   = snapshot.clone();
    let cmd_tx_ui = cmd_tx.clone();

    eframe::run_native(
        "Quickdraw",
        native_opts,
        Box::new(move |cc| {
            // Repaint whenever the engine signals a state change
            let ctx = cc.egui_ctx.clone();
            std::thread::spawn(move || {
                while repaint_rx.recv().is_ok() {
                    ctx.request_repaint();
                }
            });
            Box::new(QuickdrawApp::new(cc, snap_ui, cmd_tx_ui, demo_mode))
        }),
    )
    .map_err(|e| anyhow::anyhow!("eframe: {e}"))?;

    // Background tasks (clipboard watcher, fetch tasks) run forever — exit cleanly
    std::process::exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine — pure command loop, no dual-channel select
// ─────────────────────────────────────────────────────────────────────────────

async fn engine_task(
    mut cmd_rx: mpsc::Receiver<Command>,
    snapshot: Arc<RwLock<AppSnapshot>>,
    repaint_tx: std::sync::mpsc::Sender<()>,
    settings_mode: bool,
) {
    info!("ENGINE: started");

    let mut state = AppState::default();
    if settings_mode { state.settings_visible = true; }
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .expect("http client");

    let worker_url  = std::env::var("WORKER_URL").unwrap_or_default();
    let app_secret  = std::env::var("APP_SECRET").unwrap_or_default();
    let haiku = if worker_url.is_empty() {
        warn!("WORKER_URL not set — AI narration disabled");
        None::<HaikuProvider>
    } else if app_secret.is_empty() {
        warn!("APP_SECRET not set — AI narration disabled (worker requires HMAC auth)");
        None::<HaikuProvider>
    } else {
        Some(HaikuProvider::new(&worker_url, &app_secret))
    };
    let haiku = Arc::new(haiku);

    while let Some(cmd) = cmd_rx.recv().await {
        let cmd_name = match &cmd {
            Command::TokenDetected(e)    => format!("TokenDetected({})", e.address),
            Command::DismissOverlay      => "DismissOverlay".into(),
            Command::FetchQuotes { .. }  => "FetchQuotes".into(),
            Command::SelectQuote(_)      => "SelectQuote".into(),
            Command::ConfirmSwap         => "ConfirmSwap".into(),
            Command::CancelSwap          => "CancelSwap".into(),
            Command::StartListening      => "StartListening".into(),
            Command::StopListening       => "StopListening".into(),
            Command::SetAiMode(_)        => "SetAiMode".into(),
            Command::ToggleSettings      => "ToggleSettings".into(),
            Command::ToggleDetection     => "ToggleDetection".into(),
            Command::ConnectWallet       => "ConnectWallet".into(),
            Command::DisconnectWallet    => "DisconnectWallet".into(),
            Command::WalletConnected(pk) => format!("WalletConnected({})", pk),
            Command::SwapSigned(sig)     => format!("SwapSigned({}..)", &sig[..8.min(sig.len())]),
            Command::FetchYield          => "FetchYield".into(),
            Command::Shutdown            => "Shutdown".into(),
        };
        info!("ENGINE: {cmd_name}");

        let effects = pipeline::process(&mut state, cmd);
        info!("ENGINE: overlay={} effects={}", state.overlay_visible, effects.len());

        // Publish snapshot
        *snapshot.write().unwrap() = state.snapshot();
        let _ = repaint_tx.send(());

        // Fire side effects — fetch tasks write directly to snapshot
        for effect in effects {
            dispatch_effect(effect, snapshot.clone(), repaint_tx.clone(), &http, haiku.clone());
        }
    }

    info!("ENGINE: cmd_rx closed — exiting");
}

fn default_safety_report() -> quickdraw_core::types::SafetyReport {
    quickdraw_core::types::SafetyReport {
        score: 0,
        ticker: None,
        decimals: 6,
        jupiter_listed: false,
        mint_authority_disabled: false,
        freeze_authority_disabled: false,
        top_holder_pct: 0.0,
        liquidity_usd: 0.0,
        rugcheck_ok: false,
        summary: "Safety check unavailable".into(),
    }
}

/// Helper: update snapshot only if the given address is still the active token.
/// Returns true if update was applied, false if token changed.
fn update_if_current<F>(
    snapshot: &Arc<RwLock<AppSnapshot>>,
    address: Pubkey,
    repaint: &std::sync::mpsc::Sender<()>,
    update_fn: F,
) -> bool
where
    F: FnOnce(&mut AppSnapshot),
{
    let mut s = snapshot.write().unwrap();
    if s.token_address == Some(address) {
        update_fn(&mut s);
        s.version += 1;
        let _ = repaint.send(());
        true
    } else {
        false
    }
}

fn dispatch_effect(
    effect: SideEffect,
    snapshot: Arc<RwLock<AppSnapshot>>,
    repaint_tx: std::sync::mpsc::Sender<()>,
    http: &reqwest::Client,
    haiku: Arc<Option<HaikuProvider>>,
) {
    match effect {
        SideEffect::FetchPrice { address } => {
            let http = http.clone();
            let snap = snapshot.clone();
            let rep  = repaint_tx.clone();
            tokio::spawn(async move {
                let price = fetch_price(&http, address).await.unwrap_or_else(|e| {
                    warn!("price fetch failed: {e}");
                    TokenPrice { price_usd: 0.0, change_24h_pct: 0.0, volume_24h_usd: 0.0, market_cap_usd: None }
                });
                update_if_current(&snap, address, &rep, |s| {
                    s.token_price = Some(price);
                });
            });
        }

        SideEffect::DispatchAiNarration { address } => {
            let snap   = snapshot.clone();
            let rep    = repaint_tx.clone();
            let haiku  = haiku.clone();
            tokio::spawn(async move {
                let Some(ref provider) = *haiku else { return };

                // Wait up to 600ms for price fetch to complete before building context
                let mut waited = 0u64;
                while waited < 600 {
                    let has_price = snap.read().unwrap().token_price.is_some();
                    if has_price { break; }
                    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                    waited += 100;
                }

                // Bail if a newer token was detected while we waited
                if snap.read().unwrap().token_address != Some(address) { return; }

                let token_ctx = {
                    let s = snap.read().unwrap();
                    let ticker = s.token_ticker.as_deref().unwrap_or("unknown");
                    let price_str = s.token_price.as_ref().map(|p| format!(
                        "${:.6} ({:+.2}% 24h, vol ${:.0}, mcap {})",
                        p.price_usd, p.change_24h_pct, p.volume_24h_usd,
                        p.market_cap_usd.map(|m| format!("${:.0}", m)).unwrap_or_else(|| "unknown".into())
                    )).unwrap_or_else(|| "price unavailable".into());
                    let safety_str = s.safety_report.as_ref().map(|r| format!(
                        "score {}/100, jupiter={}, liquidity=${:.0}, {}",
                        r.score, r.jupiter_listed, r.liquidity_usd, r.summary
                    )).unwrap_or_else(|| "safety unavailable".into());
                    format!("Token: {ticker} ({address})\nPrice: {price_str}\nSafety: {safety_str}")
                };

                let req = AIRequest {
                    task: AITask::TokenNarration,
                    system_static: "You are a concise DeFi analyst for Solana tokens. \
                        Reply with exactly 2 bullet points using • as the bullet character. \
                        Each bullet max 12 words. First bullet: safety + liquidity verdict. \
                        Second bullet: price action + trade signal. \
                        No disclaimers, no markdown, no headers.".into(),
                    market_pulse: None,
                    messages: vec![Message { role: "user".into(), content: token_ctx }],
                    images: vec![],
                    max_tokens: AITask::TokenNarration.max_tokens(),
                    temperature: 0.3,
                };

                match provider.complete(req).await {
                    Ok(resp) => {
                        update_if_current(&snap, address, &rep, |s| {
                            s.ai_narration = Some(resp.text);
                            s.ai_streaming = false;
                        });
                    }
                    Err(e) => warn!("AI narration failed: {e}"),
                }
            });
        }

        SideEffect::FetchSafetyScore { address } => {
            let http  = http.clone();
            let snap  = snapshot.clone();
            let rep   = repaint_tx.clone();
            let haiku = haiku.clone();
            tokio::spawn(async move {
                let report = fetch_jupiter_safety(&http, address).await.unwrap_or_else(|e| {
                    warn!("safety fetch failed: {e}");
                    default_safety_report()
                });

                let updated = update_if_current(&snap, address, &rep, |s| {
                    if let Some(tk) = report.ticker.clone() {
                        s.token_ticker = Some(tk.clone());
                        s.last_seen_ticker = Some(tk);
                    }
                    s.safety_report = Some(report);
                    s.ai_streaming = haiku.is_some();
                });

                if !updated { return; } // Token changed — discard

                // Fire AI narration now — safety ready, price likely ready too
                dispatch_effect(
                    SideEffect::DispatchAiNarration { address },
                    snap,
                    rep,
                    &http,
                    haiku,
                );
            });
        }

        SideEffect::OpenWalletConnect => {
            let worker_url = std::env::var("WORKER_URL").unwrap_or_default();
            if !worker_url.is_empty() {
                open_reown_auth_browser(&worker_url);
            } else {
                warn!("WORKER_URL not set — cannot open Reown auth");
            }
        }

        SideEffect::FetchQuotes { token_in, token_out, amount } => {
            let snap = snapshot.clone();
            let rep  = repaint_tx.clone();
            tokio::spawn(async move {
                use quickdraw_defi::adapters::jupiter::JupiterAdapter;
                use quickdraw_defi::adapter::DefiAdapter;
                let adapter = JupiterAdapter::new();
                match adapter.get_quote(token_in, token_out, amount).await {
                    Ok(quote) => {
                        update_if_current(&snap, token_out, &rep, |s| {
                            s.quotes = vec![quote];
                            s.quote_error = None;
                        });
                    }
                    Err(e) => {
                        warn!("FetchQuotes failed: {e}");
                        push_quote_error(&snap, &rep, format!("Quote failed: {e}"));
                    }
                }
            });
        }

        SideEffect::SignTransaction { selected_quote } => {
            let snap = snapshot.clone();
            let rep  = repaint_tx.clone();
            tokio::spawn(async move {
                use quickdraw_defi::adapters::jupiter::JupiterAdapter;
                use quickdraw_defi::adapter::DefiAdapter;

                let wallet = snap.read().unwrap().wallet_pubkey;
                let Some(wallet) = wallet else {
                    push_quote_error(&snap, &rep, "No wallet connected".into());
                    return;
                };

                // Build the unsigned transaction via Jupiter /swap
                let adapter = JupiterAdapter::new();
                let raw_tx = match adapter.build_transaction(&selected_quote, wallet).await {
                    Ok(b) => b,
                    Err(e) => {
                        warn!("build_transaction: {e}");
                        push_quote_error(&snap, &rep, format!("Build tx failed: {e}"));
                        return;
                    }
                };

                // Encode as base64 and open the browser to sign.
                // The auth page calls signAndSendTransaction via Reown AppKit,
                // then redirects to /sign-result?sig=<signature>.
                let tx_b64 = base64::Engine::encode(
                    &base64::engine::general_purpose::STANDARD,
                    &raw_tx,
                );
                let auth_url = std::env::var("REOWN_AUTH_URL")
                    .unwrap_or_else(|_| "http://localhost:5173".into());
                let callback = format!("http://127.0.0.1:{AUTH_CALLBACK_PORT}");
                let sign_url = format!(
                    "{auth_url}?sign={tx_b64}&callback={callback}"
                );

                // Signing always goes to the system browser — Phantom, Solflare, and other
                // browser extensions inject into the system browser but not into a custom
                // GTK webview. The callback server on port 9427 receives the signature
                // regardless of which context the page runs in.
                info!("Opening system browser for wallet signing");
                if let Err(e) = open::that(&sign_url) {
                    push_quote_error(&snap, &rep, format!("Could not open browser: {e}"));
                }
                // Signature arrives via Command::SwapSigned from auth_callback_server
            });
        }

        SideEffect::ShowOverlay { .. } | SideEffect::DismissOverlay => {
            // Already handled by FSM state — snapshot was published above
            let _ = repaint_tx.send(());
        }

        SideEffect::Shutdown => {
            info!("ENGINE: shutdown");
            std::process::exit(0);
        }

        _ => {}
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API fetchers
// ─────────────────────────────────────────────────────────────────────────────

async fn fetch_jupiter_safety(http: &reqwest::Client, token: Pubkey) -> Result<quickdraw_core::types::SafetyReport> {
    #[derive(serde::Deserialize, Default)]
    struct Audit {
        #[serde(rename = "isSus")]          is_sus:                   Option<bool>,
        #[serde(rename = "mintAuthorityDisabled")]   mint_authority_disabled:  Option<bool>,
        #[serde(rename = "freezeAuthorityDisabled")] freeze_authority_disabled: Option<bool>,
        #[serde(rename = "topHoldersPercentage")]    top_holders_pct:          Option<f64>,
    }
    #[derive(serde::Deserialize)]
    struct JupToken {
        symbol:                                Option<String>,
        decimals:                              Option<u8>,
        #[serde(rename = "isVerified")]        is_verified:    Option<bool>,
        liquidity:                             Option<f64>,
        #[serde(rename = "organicScore")]      organic_score:  Option<f64>,
        #[serde(rename = "organicScoreLabel")] organic_label:  Option<String>,
        audit:                                 Option<Audit>,
    }

    let url = format!(
        "https://lite-api.jup.ag/tokens/v2/search?query={}",
        token
    );
    let results: Vec<JupToken> = http
        .get(&url)
        .send().await?
        .error_for_status()?
        .json().await?;

    let t = results.into_iter().next().unwrap_or(JupToken {
        symbol: None,
        decimals: None,
        is_verified: Some(false),
        liquidity: None,
        organic_score: None,
        organic_label: None,
        audit: None,
    });

    let audit = t.audit.unwrap_or_default();
    let jupiter_listed  = t.is_verified.unwrap_or(false);
    let mint_auth_off   = audit.mint_authority_disabled.unwrap_or(false);
    let freeze_auth_off = audit.freeze_authority_disabled.unwrap_or(false);
    let top_holder_pct  = audit.top_holders_pct.unwrap_or(0.0) / 100.0;
    let liquidity_usd   = t.liquidity.unwrap_or(0.0);
    let is_sus          = audit.is_sus.unwrap_or(false);
    let organic_score   = t.organic_score.unwrap_or(0.0);

    let score = organic_score.clamp(0.0, 100.0) as u8;

    let organic_label = t.organic_label.as_deref().unwrap_or("unknown");
    let summary = build_safety_summary(jupiter_listed, mint_auth_off, freeze_auth_off, is_sus, organic_label, organic_score);

    Ok(quickdraw_core::types::SafetyReport {
        score,
        ticker: t.symbol,
        decimals: t.decimals.unwrap_or(6),
        jupiter_listed,
        mint_authority_disabled: mint_auth_off,
        freeze_authority_disabled: freeze_auth_off,
        top_holder_pct,
        liquidity_usd,
        rugcheck_ok: !is_sus,
        summary,
    })
}

fn build_safety_summary(
    verified: bool,
    mint_off: bool,
    freeze_off: bool,
    is_sus: bool,
    organic_label: &str,
    organic_score: f64,
) -> String {
    if is_sus {
        return "⚠️ Flagged as suspicious by Jupiter.".into();
    }
    let mut parts = Vec::new();
    if verified  { parts.push("Jupiter verified"); }
    if mint_off  { parts.push("mint auth disabled"); }
    if freeze_off { parts.push("freeze auth disabled"); }
    match organic_label {
        "high"   => parts.push("high organic activity"),
        "medium" => parts.push("medium organic activity"),
        _        => {}
    }
    if parts.is_empty() {
        format!("Unverified · organic score {:.0}/100", organic_score)
    } else {
        format!("✓ {} · organic {:.0}/100", parts.join(" · "), organic_score)
    }
}

async fn fetch_price(http: &reqwest::Client, token: Pubkey) -> Result<TokenPrice> {
    #[derive(serde::Deserialize)]
    struct Resp { pairs: Option<Vec<Pair>> }
    #[derive(serde::Deserialize, Default)]
    struct Pair {
        #[serde(rename = "priceUsd")] price_usd: Option<String>,
        volume: Option<Volume>,
        #[serde(rename = "priceChange")] price_change: Option<PriceChange>,
        fdv: Option<f64>,
    }
    #[derive(serde::Deserialize)] struct Volume { h24: f64 }
    #[derive(serde::Deserialize)] struct PriceChange { h24: Option<f64> }

    let url  = format!("https://api.dexscreener.com/latest/dex/tokens/{token}");
    let resp: Resp = http.get(&url).send().await?.error_for_status()?.json().await?;
    let pair = resp.pairs.and_then(|p| p.into_iter().next()).unwrap_or_default();

    Ok(TokenPrice {
        price_usd:      pair.price_usd.as_deref().and_then(|s| s.parse().ok()).unwrap_or(0.0),
        change_24h_pct: pair.price_change.and_then(|c| c.h24).unwrap_or(0.0),
        volume_24h_usd: pair.volume.map(|v| v.h24).unwrap_or(0.0),
        market_cap_usd: pair.fdv,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Unix socket listener — receives length-prefixed JSON from quickdraw-host
// ─────────────────────────────────────────────────────────────────────────────
//
// Flow: browser extension → Chrome native messaging → quickdraw-host binary
//       → Unix socket here → Command::TokenDetected
//
// Message format (same as Chrome native messaging):
//   [4-byte LE length][JSON bytes]
//
// JSON shape:
//   { "type": "token_detected", "address": "<base58>",
//     "position": { "x": 800, "y": 400 } }

async fn host_socket_task(cmd_tx: mpsc::Sender<Command>) {
    use tokio::io::AsyncReadExt;
    use tokio::net::UnixListener;

    let socket_path = host_socket_path();

    // Remove stale socket from a previous run
    let _ = std::fs::remove_file(&socket_path);
    if let Some(dir) = socket_path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }

    let listener = match UnixListener::bind(&socket_path) {
        Ok(l) => { info!("native host socket listening at {}", socket_path.display()); l }
        Err(e) => { warn!("could not bind host socket: {e}"); return; }
    };

    loop {
        let Ok((mut stream, _)) = listener.accept().await else { continue };
        let cmd_tx = cmd_tx.clone();

        tokio::spawn(async move {
            loop {
                // Read 4-byte length prefix
                let mut len_buf = [0u8; 4];
                if stream.read_exact(&mut len_buf).await.is_err() { break; }
                let msg_len = u32::from_ne_bytes(len_buf) as usize;
                if msg_len == 0 || msg_len > 1_048_576 { break; }

                let mut body = vec![0u8; msg_len];
                if stream.read_exact(&mut body).await.is_err() { break; }

                if let Ok(s) = std::str::from_utf8(&body) {
                    handle_host_message(s, &cmd_tx).await;
                }
            }
        });
    }
}

async fn handle_host_message(json: &str, cmd_tx: &mpsc::Sender<Command>) {
    #[derive(serde::Deserialize)]
    struct HostMsg {
        #[serde(rename = "type")]   kind:    String,
        address:                             Option<String>,
        position: Option<HostPos>,
    }
    #[derive(serde::Deserialize)]
    struct HostPos { x: f64, y: f64 }

    let Ok(msg) = serde_json::from_str::<HostMsg>(json) else { return };
    if msg.kind != "token_detected" { return; }
    let Some(addr_str) = msg.address else { return };
    let Ok(pubkey) = addr_str.parse::<Pubkey>() else { return };

    let position = Point {
        x: msg.position.as_ref().map(|p| p.x as f32).unwrap_or(100.0),
        y: msg.position.as_ref().map(|p| p.y as f32).unwrap_or(100.0),
    };

    info!("native host: token_detected {pubkey} at ({}, {})", position.x, position.y);

    let event = DetectionEvent {
        address: pubkey,
        position,
        source: DetectionSource::Accessibility { app_name: "browser-extension".into() },
        raw_text: addr_str,
    };
    let _ = cmd_tx.send(Command::TokenDetected(event)).await;
}

fn host_socket_path() -> std::path::PathBuf {
    let base = std::env::var("XDG_CONFIG_HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            std::path::PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/tmp".into()))
                .join(".config")
        });
    base.join("quickdraw").join("host.sock")
}

// ─────────────────────────────────────────────────────────────────────────────
// Reown auth callback server
//
// Flow: UI opens browser → WORKER_URL/auth?callback=http://localhost:9427
//       User logs in with email via Reown AppKit
//       Browser GETs http://localhost:9427/callback?address=<pubkey>
//       We fire Command::WalletConnected(pubkey)
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_CALLBACK_PORT: u16 = 9427;

async fn auth_callback_server(cmd_tx: mpsc::Sender<Command>) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    let listener = match TcpListener::bind(("127.0.0.1", AUTH_CALLBACK_PORT)).await {
        Ok(l) => { info!("Reown auth callback listening on port {AUTH_CALLBACK_PORT}"); l }
        Err(e) => { warn!("could not bind auth callback port: {e}"); return; }
    };

    loop {
        let Ok((mut stream, _)) = listener.accept().await else { continue };
        let cmd_tx = cmd_tx.clone();

        tokio::spawn(async move {
            let mut buf = Vec::with_capacity(4096);
            let mut tmp = [0u8; 1024];
            loop {
                let n = stream.read(&mut tmp).await.unwrap_or(0);
                if n == 0 { break; }
                buf.extend_from_slice(&tmp[..n]);
                if buf.windows(4).any(|w| w == b"\r\n\r\n") { break; }
                if buf.len() > 16_384 { break; }
            }
            let req = String::from_utf8_lossy(&buf);

            // Parse request line: "GET /path?query HTTP/1.1"
            let first_line = req.lines().next().unwrap_or("");
            let method = first_line.split_whitespace().next().unwrap_or("GET");
            let path   = first_line.split_whitespace().nth(1).unwrap_or("");

            // Chrome Private Network Access sends an OPTIONS preflight before
            // allowing fetch() from a public HTTPS page to http://127.0.0.1.
            // Restrict Allow-Origin to the Pages domain so arbitrary websites
            // cannot trigger wallet-connect or disconnect callbacks.
            let auth_origin = std::env::var("REOWN_AUTH_URL")
                .unwrap_or_else(|_| "https://quickdraw-auth.pages.dev".into());
            if method == "OPTIONS" {
                let preflight = format!(
                    "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: {auth_origin}\r\nAccess-Control-Allow-Private-Network: true\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nContent-Length: 0\r\n\r\n"
                );
                let _ = stream.write_all(preflight.as_bytes()).await;
                return;
            }

            let (status, body) = if let Some(rest) = path.strip_prefix("/callback?address=") {
                // Wallet connect callback
                let addr_str = rest.split('&').next().unwrap_or("");
                if let Ok(pubkey) = addr_str.parse::<Pubkey>() {
                    info!("Reown auth: wallet connected {pubkey}");
                    let _ = cmd_tx.send(Command::WalletConnected(pubkey)).await;
                    ("200 OK", "Connected! You can close this tab.")
                } else {
                    ("400 Bad Request", "Invalid address.")
                }
            } else if let Some(rest) = path.strip_prefix("/sign-result?sig=") {
                // Transaction signing callback — browser signed and sent the tx
                let sig = rest.split('&').next().unwrap_or("").to_string();
                if !sig.is_empty() {
                    info!("Swap signed: {sig}");
                    let _ = cmd_tx.send(Command::SwapSigned(sig)).await;
                    ("200 OK", "Signed! You can close this tab.")
                } else {
                    ("400 Bad Request", "Missing signature.")
                }
            } else if path == "/disconnect" || path.starts_with("/disconnect?") {
                info!("Reown auth: wallet disconnect callback");
                let _ = cmd_tx.send(Command::DisconnectWallet).await;
                ("200 OK", "Disconnected. You can close this tab.")
            } else {
                ("400 Bad Request", "Unknown callback.")
            };

            // Minimal HTTP response with CORS so the Pages auth site can fetch() it.
            // Cache-Control: no-store prevents the browser from caching the callback
            // URL — a cached /callback?address=<old> would replay WalletConnected(old)
            // on tab restore or accidental refresh, overwriting the correct wallet.
            let response = format!(
                "HTTP/1.1 {status}\r\nContent-Type: text/plain\r\nAccess-Control-Allow-Origin: {auth_origin}\r\nCache-Control: no-store\r\nContent-Length: {}\r\n\r\n{body}",
                body.len()
            );
            let _ = stream.write_all(response.as_bytes()).await;
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Write an error into the snapshot's quote_error field and trigger a repaint.
fn push_quote_error(
    snapshot: &Arc<RwLock<AppSnapshot>>,
    repaint: &std::sync::mpsc::Sender<()>,
    msg: String,
) {
    let mut s = snapshot.write().unwrap();
    s.quote_error = Some(msg);
    s.version += 1;
    let _ = repaint.send(());
}

/// Called by the engine when Command::ConnectWallet is received.
/// Opens the Reown auth page in a chromeless webview popup (falls back to
/// the system browser if the quickdraw-webview binary isn't found).
pub fn open_reown_auth_browser(worker_url: &str) {
    let project_id = std::env::var("REOWN_PROJECT_ID").unwrap_or_default();
    let callback   = format!("http://127.0.0.1:{AUTH_CALLBACK_PORT}");
    let auth_base  = std::env::var("REOWN_AUTH_URL")
        .unwrap_or_else(|_| format!("{worker_url}/auth"));
    let url = format!("{auth_base}?projectId={project_id}&callback={callback}");
    info!("Opening Reown auth popup: {url}");
    if let Err(e) = spawn_webview_popup(&url) {
        warn!("webview popup failed ({e}), falling back to system browser");
        if let Err(e2) = open::that(&url) {
            warn!("could not open browser either: {e2}");
        }
    }
}

/// Wayland socket saved before we remove WAYLAND_DISPLAY for winit.
/// Restored when spawning the webview child so webkit2gtk can use native Wayland.
static SAVED_WAYLAND_DISPLAY: OnceLock<String> = OnceLock::new();

/// Persistent webview process handle.
/// Re-used across connect and sign flows so localStorage (AUTH session) survives.
struct WebviewHandle {
    child: std::process::Child,
    stdin: std::process::ChildStdin,
}

static WEBVIEW_HANDLE: OnceLock<std::sync::Mutex<Option<WebviewHandle>>> = OnceLock::new();

fn webview_mutex() -> &'static std::sync::Mutex<Option<WebviewHandle>> {
    WEBVIEW_HANDLE.get_or_init(|| std::sync::Mutex::new(None))
}

/// Show the webview popup for the given URL.
/// First call spawns the process; subsequent calls send the URL via stdin
/// so the existing process reuses its localStorage session.
fn spawn_webview_popup(url: &str) -> std::io::Result<()> {
    use std::io::Write;

    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_default();
    let bin = exe_dir.join("quickdraw-webview");
    if !bin.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("quickdraw-webview not found at {}", bin.display()),
        ));
    }

    let mut guard = webview_mutex().lock().unwrap();

    // Try to reuse an existing live process by sending URL via stdin.
    if let Some(ref mut handle) = *guard {
        match handle.child.try_wait() {
            Ok(None) => {
                // Process still alive — send URL via stdin.
                let line = format!("{url}\n");
                if handle.stdin.write_all(line.as_bytes()).is_ok() {
                    return Ok(());
                }
                // Write failed — process died between the check and write.
            }
            _ => {} // Exited — fall through to respawn.
        }
        *guard = None;
    }

    // Spawn a fresh process. First URL comes as argv[1]; subsequent ones via stdin.
    let mut cmd = std::process::Command::new(&bin);
    cmd.arg(url)
       .stdin(std::process::Stdio::piped())
       .stderr(std::process::Stdio::inherit());
    // Restore the Wayland socket — main process removed it to force winit into
    // X11 mode, but webkit2gtk needs it to render on the Wayland compositor.
    if let Some(wd) = SAVED_WAYLAND_DISPLAY.get() {
        cmd.env("WAYLAND_DISPLAY", wd);
    }

    let mut child = cmd.spawn()?;
    let stdin = child.stdin.take().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::Other, "could not get webview stdin")
    })?;
    *guard = Some(WebviewHandle { child, stdin });
    Ok(())
}

