use anyhow::Result;
use async_trait::async_trait;
use futures::Stream;
use serde::{Deserialize, Serialize};
use std::pin::Pin;

use crate::task::AITask;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct AIRequest {
    pub task: AITask,
    pub messages: Vec<Message>,
    pub system_static: String,
    pub market_pulse: Option<String>,
    pub images: Vec<Vec<u8>>,
    pub max_tokens: u32,
    pub temperature: f32,
}

#[derive(Debug, Clone)]
pub struct AIResponse {
    pub text: String,
    pub provider_used: String,
    pub latency_ms: u64,
    pub time_to_first_token_ms: u64,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cache_hit: bool,
    pub from_fallback: bool,
}

pub type TokenStream = Pin<Box<dyn Stream<Item = Result<String>> + Send>>;

#[async_trait]
pub trait AIProvider: Send + Sync {
    fn id(&self) -> &str;
    fn display_name(&self) -> &str;
    fn is_local(&self) -> bool;
    fn supports_vision(&self) -> bool;
    fn supports_streaming(&self) -> bool;

    async fn complete(&self, req: AIRequest) -> Result<AIResponse>;
    async fn stream(&self, req: AIRequest) -> Result<TokenStream>;
    async fn health_check(&self) -> bool;
}
