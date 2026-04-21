use anyhow::Result;
use async_trait::async_trait;
use quickdraw_core::types::AdapterQuote;
use solana_sdk::pubkey::Pubkey;
use std::sync::atomic::{AtomicU32, AtomicU8, Ordering};
use std::sync::Arc;

#[async_trait]
pub trait DefiAdapter: Send + Sync {
    fn name(&self) -> &str;
    async fn get_quote(&self, token_in: Pubkey, token_out: Pubkey, amount: u64) -> Result<AdapterQuote>;
    async fn build_transaction(&self, quote: &AdapterQuote, wallet: Pubkey) -> Result<Vec<u8>>;
    async fn get_price(&self, token: Pubkey) -> Result<f64>;
    async fn health_check(&self) -> bool;
}

#[derive(Debug, Default)]
pub struct CircuitBreaker {
    failures: AtomicU32,
    state: AtomicU8, // 0=closed 1=open 2=half-open
}

impl CircuitBreaker {
    const THRESHOLD: u32 = 3;
    const CLOSED: u8 = 0;
    const OPEN: u8 = 1;

    pub fn is_open(&self) -> bool {
        self.state.load(Ordering::Relaxed) == Self::OPEN
    }

    pub fn record_failure(&self) {
        let prev = self.failures.fetch_add(1, Ordering::Relaxed);
        if prev + 1 >= Self::THRESHOLD {
            self.state.store(Self::OPEN, Ordering::Relaxed);
        }
    }

    pub fn record_success(&self) {
        self.failures.store(0, Ordering::Relaxed);
        self.state.store(Self::CLOSED, Ordering::Relaxed);
    }
}

pub struct AdapterRegistry {
    adapters: Vec<(Arc<dyn DefiAdapter>, Arc<CircuitBreaker>)>,
}

impl AdapterRegistry {
    pub fn new() -> Self {
        Self { adapters: Vec::new() }
    }

    pub fn register(&mut self, adapter: Arc<dyn DefiAdapter>) {
        self.adapters.push((adapter, Arc::new(CircuitBreaker::default())));
    }

    pub fn healthy_adapters(&self) -> Vec<(Arc<dyn DefiAdapter>, Arc<CircuitBreaker>)> {
        self.adapters
            .iter()
            .filter(|(_, cb)| !cb.is_open())
            .cloned()
            .collect()
    }
}
