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

const BONK: &str = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

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
