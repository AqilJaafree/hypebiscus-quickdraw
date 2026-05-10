use std::sync::Arc;
use futures::future::join_all;
use solana_sdk::pubkey::Pubkey;
use tracing::warn;

use quickdraw_core::types::AdapterQuote;
use crate::adapter::{AdapterRegistry, CircuitBreaker};

pub struct SmartSwapRouter {
    registry: AdapterRegistry,
}

impl SmartSwapRouter {
    pub fn new(registry: AdapterRegistry) -> Self {
        Self { registry }
    }

    /// Query all healthy adapters in parallel, return sorted by best output amount.
    pub async fn fetch_quotes(
        &self,
        token_in: Pubkey,
        token_out: Pubkey,
        amount: u64,
    ) -> Vec<(AdapterQuote, Arc<CircuitBreaker>)> {
        let healthy = self.registry.healthy_adapters();

        let futures: Vec<_> = healthy.iter().map(|(adapter, cb)| {
            let adapter = adapter.clone();
            let cb = cb.clone();
            async move {
                match adapter.get_quote(token_in, token_out, amount).await {
                    Ok(quote) => {
                        cb.record_success();
                        Some((quote, cb))
                    }
                    Err(e) => {
                        warn!(adapter = adapter.name(), "quote failed: {e}");
                        cb.record_failure();
                        None
                    }
                }
            }
        }).collect();

        let results = join_all(futures).await;
        let mut quotes: Vec<_> = results.into_iter().flatten().collect();

        // Sort best output amount first
        quotes.sort_by(|a, b| b.0.out_amount.cmp(&a.0.out_amount));
        quotes
    }
}
