use std::sync::{Arc, RwLock};
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
use solana_sdk::pubkey::Pubkey;

fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env()
                .add_directive("quickdraw=info".parse()?),
        )
        .init();

    info!("Quickdraw starting");

    // Remove WAYLAND_DISPLAY so winit uses X11 (XWayland) for rendering. Wayland rendering
    // on GNOME Mutter causes screen-wide flicker due to frame-timing conflicts.
    // XWayland is stable and Mutter composites it cleanly. arboard clipboard detection
    // auto-detects X11 and reads PRIMARY/CLIPBOARD selections natively via xlib.
    if std::env::var("WAYLAND_DISPLAY").is_ok() {
        std::env::remove_var("WAYLAND_DISPLAY");
        info!("Using XWayland for rendering (WAYLAND_DISPLAY cleared for winit)");
    }

    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(4)
        .enable_all()
        .build()?;

    // Shared snapshot — UI reads this, fetch tasks write directly to it
    let snapshot: Arc<RwLock<AppSnapshot>> = Arc::new(RwLock::new(AppSnapshot::default()));

    // Single command channel: UI → engine
    let (cmd_tx, cmd_rx) = mpsc::channel::<Command>(256);

    // Repaint trigger: engine/tasks → UI
    let (repaint_tx, repaint_rx) = std::sync::mpsc::channel::<()>();

    // ── Detection pipeline ───────────────────────────────────────────────────
    let (detection_tx, mut detection_rx) = mpsc::channel::<DetectionEvent>(64);
    let enricher = Arc::new(DetectionEnricher::new(detection_tx));

    // Wait for eframe before starting OS-level watchers
    let startup_delay = std::time::Duration::from_secs(2);

    // Clipboard watcher — fires on Ctrl+C / copy
    let enricher_clip = enricher.clone();
    rt.spawn(async move {
        tokio::time::sleep(startup_delay).await;
        let mut rx = quickdraw_platform::linux::clipboard::spawn_clipboard_watcher();
        while let Some(text) = rx.recv().await {
            enricher_clip.process(RawDetection {
                text,
                position: Point { x: 5.0, y: 5.0 },
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

    // ── Engine ───────────────────────────────────────────────────────────────
    let snap_engine   = snapshot.clone();
    let repaint_engine = repaint_tx.clone();
    rt.spawn(engine_task(cmd_rx, snap_engine, repaint_engine));

    // ── eframe ───────────────────────────────────────────────────────────────
    let native_opts = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("Quickdraw")
            .with_inner_size([350.0, 700.0])
            .with_resizable(true)
            .with_decorations(true),
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
            Box::new(QuickdrawApp::new(cc, snap_ui, cmd_tx_ui))
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
) {
    println!("ENGINE: started");

    let mut state = AppState::default();
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .expect("http client");

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
            Command::ConnectWallet       => "ConnectWallet".into(),
            Command::DisconnectWallet    => "DisconnectWallet".into(),
            Command::WalletConnected(pk) => format!("WalletConnected({})", pk),
            Command::FetchYield          => "FetchYield".into(),
            Command::Shutdown            => "Shutdown".into(),
        };
        println!("ENGINE: {cmd_name}");

        let effects = pipeline::process(&mut state, cmd);
        println!("ENGINE: overlay={} effects={}", state.overlay_visible, effects.len());

        // Publish snapshot
        *snapshot.write().unwrap() = state.snapshot();
        let _ = repaint_tx.send(());

        // Fire side effects — fetch tasks write directly to snapshot
        for effect in effects {
            dispatch_effect(effect, snapshot.clone(), repaint_tx.clone(), &http);
        }
    }

    println!("ENGINE: cmd_rx closed — exiting");
}

fn dispatch_effect(
    effect: SideEffect,
    snapshot: Arc<RwLock<AppSnapshot>>,
    repaint_tx: std::sync::mpsc::Sender<()>,
    http: &reqwest::Client,
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
                {
                    let mut s = snap.write().unwrap();
                    s.token_price = Some(price);
                    s.version += 1;
                }
                let _ = rep.send(());
            });
        }

        SideEffect::DispatchAiNarration { address } => {
            let snap = snapshot.clone();
            let rep  = repaint_tx.clone();
            tokio::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                let text = format!(
                    "Token {} detected. Deploy the Quickdraw Worker to enable live AI narration.",
                    &address.to_string()[..8]
                );
                {
                    let mut s = snap.write().unwrap();
                    s.ai_narration = Some(text);
                    s.ai_streaming = false;
                    s.version += 1;
                }
                let _ = rep.send(());
            });
        }

        SideEffect::ShowOverlay { .. } | SideEffect::DismissOverlay => {
            // Already handled by FSM state — snapshot was published above
            let _ = repaint_tx.send(());
        }

        SideEffect::Shutdown => {
            println!("ENGINE: shutdown");
            std::process::exit(0);
        }

        _ => {}
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API fetchers
// ─────────────────────────────────────────────────────────────────────────────

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

