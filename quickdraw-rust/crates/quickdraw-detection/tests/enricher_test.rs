use std::sync::Arc;
use tokio::sync::mpsc;
use quickdraw_core::types::{DetectionSource, Point};
use quickdraw_detection::enricher::{DetectionEnricher, RawDetection};

#[tokio::test]
async fn detects_solana_address_in_text() {
    let (tx, mut rx) = mpsc::channel(8);
    let enricher = DetectionEnricher::new(tx);

    // System program address embedded in a sentence
    enricher.process(RawDetection {
        text: "Check out 11111111111111111111111111111111 on dexscreener".into(),
        position: Point { x: 0.0, y: 0.0 },
        source: DetectionSource::Manual,
    }).await;

    let event = rx.recv().await.expect("should have received a detection event");
    assert_eq!(event.address.to_string(), "11111111111111111111111111111111");
}

#[tokio::test]
async fn deduplicates_same_address_within_cooldown() {
    let (tx, mut rx) = mpsc::channel(8);
    let enricher = DetectionEnricher::new(tx);

    let raw = RawDetection {
        text: "11111111111111111111111111111111".into(),
        position: Point { x: 0.0, y: 0.0 },
        source: DetectionSource::Manual,
    };

    enricher.process(RawDetection { text: raw.text.clone(), position: raw.position, source: raw.source.clone() }).await;
    enricher.process(RawDetection { text: raw.text.clone(), position: raw.position, source: raw.source.clone() }).await;
    enricher.process(RawDetection { text: raw.text, position: raw.position, source: raw.source }).await;

    // Only one event should come through
    let first = rx.recv().await.expect("first event");
    assert!(rx.try_recv().is_err(), "duplicate should have been suppressed");
}

#[tokio::test]
async fn ignores_invalid_addresses() {
    let (tx, mut rx) = mpsc::channel(8);
    let enricher = DetectionEnricher::new(tx);

    enricher.process(RawDetection {
        text: "not-a-real-address and 0OIl111111 also bad".into(),
        position: Point { x: 0.0, y: 0.0 },
        source: DetectionSource::Manual,
    }).await;

    assert!(rx.try_recv().is_err(), "invalid addresses should not produce events");
}

#[tokio::test]
async fn extracts_address_from_dexscreener_url() {
    let (tx, mut rx) = mpsc::channel(8);
    let enricher = DetectionEnricher::new(tx);

    enricher.process(RawDetection {
        text: "https://dexscreener.com/solana/11111111111111111111111111111111".into(),
        position: Point { x: 0.0, y: 0.0 },
        source: DetectionSource::Manual,
    }).await;

    let event = rx.recv().await.expect("dexscreener url should produce event");
    assert_eq!(event.address.to_string(), "11111111111111111111111111111111");
}
