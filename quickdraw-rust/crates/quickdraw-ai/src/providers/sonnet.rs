use anyhow::Result;
use async_trait::async_trait;

use crate::provider::{AIProvider, AIRequest, AIResponse, TokenStream};
use crate::providers::haiku::HaikuProvider;

const MODEL: &str = "claude-sonnet-4-6";

/// Sonnet provider — delegates to HaikuProvider (same Worker protocol, same endpoint).
/// Used for ScreenAnalysis, DeepTokenReport, YieldStrategy, PortfolioAnalysis.
pub struct SonnetProvider {
    inner: HaikuProvider,
}

impl SonnetProvider {
    pub fn new(worker_url: impl Into<String>, app_secret: impl Into<String>) -> Self {
        Self { inner: HaikuProvider::new(worker_url, app_secret) }
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
        let mut resp = self.inner.complete(req).await?;
        resp.provider_used = MODEL.into();
        Ok(resp)
    }

    async fn stream(&self, req: AIRequest) -> Result<TokenStream> {
        self.inner.stream(req).await
    }

    async fn health_check(&self) -> bool {
        self.inner.health_check().await
    }
}
