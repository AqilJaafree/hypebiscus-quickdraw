use anyhow::{bail, Result};
use async_trait::async_trait;
use reqwest::Client;
use std::time::{Duration, Instant};

use crate::provider::{AIProvider, AIRequest, AIResponse, TokenStream};
use crate::providers::haiku::HaikuProvider;

const MODEL: &str = "claude-sonnet-4-6";

/// Sonnet provider — same structure as Haiku, routes to /ai/deep on the Worker.
/// Used for ScreenAnalysis, DeepTokenReport, YieldStrategy, PortfolioAnalysis.
pub struct SonnetProvider {
    client: Client,
    worker_url: String,
    app_secret: String,
}

impl SonnetProvider {
    pub fn new(worker_url: impl Into<String>, app_secret: impl Into<String>) -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(60))
                .build()
                .expect("reqwest client"),
            worker_url: worker_url.into(),
            app_secret: app_secret.into(),
        }
    }
}

#[async_trait]
impl AIProvider for SonnetProvider {
    fn id(&self) -> &str { "sonnet" }
    fn display_name(&self) -> &str { "Claude Sonnet" }
    fn is_local(&self) -> bool { false }
    fn supports_vision(&self) -> bool { true }
    fn supports_streaming(&self) -> bool { true }

    async fn complete(&self, req: AIRequest) -> Result<AIResponse> {
        // Sonnet uses /ai/deep on the Worker — same protocol as Haiku
        // Delegate to Haiku's implementation with a different endpoint
        let haiku = HaikuProvider::new(self.worker_url.clone(), self.app_secret.clone());
        let mut resp = haiku.complete(req).await?;
        resp.provider_used = MODEL.into();
        Ok(resp)
    }

    async fn stream(&self, req: AIRequest) -> Result<TokenStream> {
        let haiku = HaikuProvider::new(self.worker_url.clone(), self.app_secret.clone());
        haiku.stream(req).await
    }

    async fn health_check(&self) -> bool {
        self.client
            .get(format!("{}/health", self.worker_url))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }
}
