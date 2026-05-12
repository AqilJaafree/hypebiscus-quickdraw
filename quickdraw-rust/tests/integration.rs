/// End-to-end integration tests that hit real public APIs.
/// Run with: cargo test --test integration -- --nocapture
use std::sync::{Arc, RwLock};
use tokio::sync::{broadcast, mpsc};
use quickdraw_core::{
    commands::Command,
    events::AppEvent,
    pipeline,
    state::{AppSnapshot, AppState},
    types::{DetectionEvent, DetectionSource, Point},
};
use solana_sdk::pubkey::Pubkey;
use std::str::FromStr;

const BONK:      &str = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const SOL_MINT:  &str = "So11111111111111111111111111111111111111112";
const USDC_MINT: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
// 0.01 SOL in lamports — small enough to be safely quotable on mainnet
const AMOUNT_LAMPORTS: u64 = 10_000_000;

fn load_env() {
    let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent().unwrap()
        .join(".env");
    let _ = dotenvy::from_path(env_path);
}

// ── Jupiter v2 integration tests ─────────────────────────────────────────────

#[tokio::test]
async fn jupiter_v2_quote_sol_usdc() {
    load_env();
    use quickdraw_defi::adapters::JupiterAdapter;
    use quickdraw_defi::adapter::DefiAdapter;

    let adapter = JupiterAdapter::new();
    let token_in  = Pubkey::from_str(SOL_MINT).unwrap();
    let token_out = Pubkey::from_str(USDC_MINT).unwrap();

    let quote = adapter.get_quote(token_in, token_out, AMOUNT_LAMPORTS).await
        .expect("Jupiter v2 /order (preview) should succeed");

    println!("adapter:      {}", quote.adapter_name);
    println!("in_amount:    {} lamports", quote.in_amount);
    println!("out_amount:   {} (raw USDC units)", quote.out_amount);
    println!("price_impact: {:.4}%", quote.price_impact_pct);
    println!("slippage_bps: {}", quote.slippage_bps);
    println!("route_label:  {}", quote.route_label);

    assert_eq!(quote.adapter_name, "Jupiter");
    assert!(quote.out_amount > 0, "should receive a non-zero USDC quote");
    assert!(quote.price_impact_pct.abs() < 10.0, "price impact should be within ±10%, got {}", quote.price_impact_pct);
}

#[tokio::test]
async fn jupiter_v2_build_transaction_sol_usdc() {
    load_env();
    use quickdraw_defi::adapters::JupiterAdapter;
    use quickdraw_defi::adapter::DefiAdapter;

    let adapter   = JupiterAdapter::new();
    let token_in  = Pubkey::from_str(SOL_MINT).unwrap();
    let token_out = Pubkey::from_str(USDC_MINT).unwrap();

    let quote = adapter.get_quote(token_in, token_out, AMOUNT_LAMPORTS).await
        .expect("quote step should succeed");

    // Use a known funded mainnet address as taker — we're only checking the API
    // returns a valid assembled transaction, not signing or submitting it.
    let taker = Pubkey::from_str("7VHUFJHWu2CuExkJcJrzhQPJ2oygupTWkL2A2For4BmE").unwrap();

    let tx_bytes = adapter.build_transaction(&quote, taker).await
        .expect("Jupiter v2 /order (taker) should return a versioned transaction");

    println!("tx_bytes len: {} bytes", tx_bytes.len());
    // A versioned transaction is always several hundred bytes minimum
    assert!(tx_bytes.len() > 100, "transaction bytes should be a full versioned transaction, got {} bytes", tx_bytes.len());
}

#[tokio::test]
async fn jupiter_v3_price_bonk() {
    load_env();
    use quickdraw_defi::adapters::JupiterAdapter;
    use quickdraw_defi::adapter::DefiAdapter;

    let adapter = JupiterAdapter::new();
    let bonk    = Pubkey::from_str(BONK).unwrap();

    let price = adapter.get_price(bonk).await
        .expect("Jupiter price v3 should return a price for BONK");

    println!("BONK price (v3): ${price:.8}");
    assert!(price > 0.0, "BONK price should be > 0, got {price}");
}

#[tokio::test]
async fn jupiter_v2_health_check() {
    load_env();
    use quickdraw_defi::adapters::JupiterAdapter;
    use quickdraw_defi::adapter::DefiAdapter;

    let adapter = JupiterAdapter::new();
    let healthy = adapter.health_check().await;

    println!("Jupiter v2 health: {healthy}");
    assert!(healthy, "Jupiter v2 /order health check should return true");
}

// ── Existing API tests ────────────────────────────────────────────────────────

#[tokio::test]
async fn dexscreener_price_fetch() {
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build().unwrap();

    let token = Pubkey::from_str(BONK).unwrap();
    let url = format!("https://api.dexscreener.com/latest/dex/tokens/{}", token);
    let resp = http.get(&url).send().await.unwrap();
    assert!(resp.status().is_success(), "DexScreener should return 200");

    let body: serde_json::Value = resp.json().await.unwrap();
    let price = body["pairs"][0]["priceUsd"].as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .expect("should have a price");

    assert!(price > 0.0, "BONK price should be > 0, got {price}");
    println!("BONK price: ${price:.8}");
}

#[tokio::test]
async fn rugcheck_safety_fetch() {
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build().unwrap();

    let url = format!("https://api.rugcheck.xyz/v1/tokens/{}/report/summary", BONK);
    let resp = http.get(&url).send().await.unwrap();
    assert!(resp.status().is_success(), "RugCheck should return 200");

    let body: serde_json::Value = resp.json().await.unwrap();
    println!("RugCheck risks: {}", body["risks"]);
}

#[tokio::test]
async fn engine_token_detected_updates_snapshot() {
    let snapshot = Arc::new(RwLock::new(AppSnapshot::default()));
    let (cmd_tx, mut cmd_rx) = mpsc::channel::<Command>(16);
    let (_internal_tx, _internal_rx) = mpsc::channel::<AppEvent>(16);
    let (event_tx, _) = broadcast::channel::<AppEvent>(16);

    // Minimal engine loop for the test
    let snap = snapshot.clone();
    let ev_tx = event_tx.clone();
    tokio::spawn(async move {
        let mut state = AppState::default();
        while let Some(cmd) = cmd_rx.recv().await {
            let _effects = pipeline::process(&mut state, cmd);
            *snap.write().unwrap() = state.snapshot();
            let _ = ev_tx.send(AppEvent::StateChanged);
        }
    });

    // Send a TokenDetected command
    let bonk = Pubkey::from_str(BONK).unwrap();
    cmd_tx.send(Command::TokenDetected(DetectionEvent {
        address: bonk,
        position: Point { x: 100.0, y: 100.0 },
        source: DetectionSource::Manual,
        raw_text: BONK.to_string(),
    })).await.unwrap();

    tokio::time::sleep(std::time::Duration::from_millis(50)).await;

    let snap = snapshot.read().unwrap();
    assert!(snap.overlay_visible, "overlay should be visible after detection");
    assert_eq!(snap.token_address, Some(bonk), "token address should be set");
    println!("Engine state after detection: overlay={}, token={:?}", snap.overlay_visible, snap.token_address);
}
