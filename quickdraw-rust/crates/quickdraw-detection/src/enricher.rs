use std::sync::Arc;
use anyhow::Result;
use tokio::sync::mpsc;
use tracing::{debug, info, warn};

use quickdraw_core::types::{DetectionEvent, DetectionSource, Point};
use crate::deduplicator::Deduplicator;
use crate::patterns::extract_addresses;
use crate::validator::validate_solana_address;

pub struct RawDetection {
    pub text: String,
    pub position: Point,
    pub source: DetectionSource,
}

pub struct DetectionEnricher {
    dedup: Arc<Deduplicator>,
    out_tx: mpsc::Sender<DetectionEvent>,
}

impl DetectionEnricher {
    pub fn new(out_tx: mpsc::Sender<DetectionEvent>) -> Self {
        Self {
            dedup: Arc::new(Deduplicator::new()),
            out_tx,
        }
    }

    pub async fn process(&self, raw: RawDetection) {
        let candidates = extract_addresses(&raw.text);

        if candidates.is_empty() {
            debug!("no address candidates in {} chars of text", raw.text.len());
            return;
        }

        info!("found {} address candidate(s) in clipboard", candidates.len());

        for candidate in candidates {
            match validate_solana_address(&candidate) {
                Ok(pubkey) => {
                    if self.dedup.should_process(pubkey).await {
                        info!(%pubkey, "token detected — firing overlay");
                        let event = DetectionEvent {
                            address: pubkey,
                            position: raw.position,
                            source: raw.source.clone(),
                            raw_text: raw.text.clone(),
                        };
                        if let Err(e) = self.out_tx.send(event).await {
                            warn!("engine channel closed: {e}");
                        }
                        break;
                    } else {
                        tracing::debug!(%pubkey, "token deduplicated (seen within cooldown)");
                    }
                }
                Err(e) => {
                    info!("candidate '{candidate}' failed validation: {e}");
                }
            }
        }
    }

    pub fn dedup(&self) -> Arc<Deduplicator> {
        self.dedup.clone()
    }
}
