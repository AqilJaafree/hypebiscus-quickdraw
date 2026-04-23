use std::collections::HashMap;
use std::time::{Duration, Instant};
use solana_sdk::pubkey::Pubkey;
use tokio::sync::Mutex;

const COOLDOWN: Duration = Duration::from_secs(30); // 30 seconds — re-show if user copies same token again after 30s

pub struct Deduplicator {
    seen: Mutex<HashMap<Pubkey, Instant>>,
}

impl Deduplicator {
    pub fn new() -> Self {
        Self { seen: Mutex::new(HashMap::new()) }
    }

    /// Returns true if this address should be processed (not seen within cooldown).
    pub async fn should_process(&self, address: Pubkey) -> bool {
        let mut map = self.seen.lock().await;
        let now = Instant::now();
        if let Some(&last) = map.get(&address) {
            if now.duration_since(last) < COOLDOWN {
                return false;
            }
        }
        map.insert(address, now);
        true
    }
}
