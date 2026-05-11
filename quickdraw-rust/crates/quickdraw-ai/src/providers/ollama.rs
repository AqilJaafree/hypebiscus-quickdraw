use anyhow::{bail, Result};
use async_trait::async_trait;
use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::provider::{AIProvider, AIRequest, AIResponse, TokenStream};

const DEFAULT_URL: &str = "http://localhost:11434";

#[derive(Serialize)]
struct OllamaRequest<'a> {
    model: &'a str,
    messages: Vec<OllamaMessage<'a>>,
    stream: bool,
    options: OllamaOptions,
}

#[derive(Serialize)]
struct OllamaMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Serialize)]
struct OllamaOptions {
    num_predict: i32,
}

#[derive(Deserialize)]
struct OllamaChunk {
    message: Option<OllamaMessageContent>,
    #[allow(dead_code)]
    done: bool,
}

#[derive(Deserialize)]
struct OllamaMessageContent {
    content: String,
}

pub struct OllamaProvider {
    client: Client,
    base_url: String,
    pub model: String,
}

impl OllamaProvider {
    pub fn new(base_url: impl Into<String>, model: impl Into<String>) -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(120))
                .build()
                .expect("reqwest client"),
            base_url: base_url.into(),
            model: model.into(),
        }
    }

    pub fn default_local() -> Self {
        Self::new(DEFAULT_URL, "gemma4:4b")
    }
}

#[async_trait]
impl AIProvider for OllamaProvider {
    fn id(&self) -> &str { "ollama" }
    fn display_name(&self) -> &str { "Ollama (local)" }
    fn is_local(&self) -> bool { true }
    fn supports_vision(&self) -> bool { self.model.contains("vision") || self.model.contains("gemma4") }
    fn supports_streaming(&self) -> bool { true }

    async fn complete(&self, req: AIRequest) -> Result<AIResponse> {
        let system_msg = OllamaMessage { role: "system", content: &req.system_static };
        let mut messages = vec![system_msg];
        for m in &req.messages {
            messages.push(OllamaMessage { role: &m.role, content: &m.content });
        }

        let body = OllamaRequest {
            model: &self.model,
            messages,
            stream: false,
            options: OllamaOptions { num_predict: req.max_tokens as i32 },
        };

        let resp = self.client
            .post(format!("{}/api/chat", self.base_url))
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            bail!("Ollama error: {}", resp.status());
        }

        let chunk: OllamaChunk = resp.json().await?;
        let text = chunk.message.map(|m| m.content).unwrap_or_default();

        Ok(AIResponse {
            text,
            provider_used: format!("ollama/{}", self.model),
            latency_ms: 0,
            time_to_first_token_ms: 0,
            input_tokens: 0,
            output_tokens: 0,
            cache_hit: false,
            from_fallback: false,
        })
    }

    async fn stream(&self, req: AIRequest) -> Result<TokenStream> {
        let body = serde_json::json!({
            "model": self.model,
            "messages": std::iter::once(serde_json::json!({"role": "system", "content": req.system_static}))
                .chain(req.messages.iter().map(|m| serde_json::json!({"role": m.role, "content": m.content})))
                .collect::<Vec<_>>(),
            "stream": true,
            "options": { "num_predict": req.max_tokens }
        });

        let resp = self.client
            .post(format!("{}/api/chat", self.base_url))
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            bail!("Ollama stream error: {}", resp.status());
        }

        // Ollama NDJSON → normalised text delta stream
        let text_stream = resp.bytes_stream()
            .map(|chunk| -> Result<Vec<String>> {
                let bytes = chunk?;
                let text = String::from_utf8_lossy(&bytes);
                let mut deltas = Vec::new();
                for line in text.lines() {
                    if line.is_empty() { continue; }
                    if let Ok(chunk) = serde_json::from_str::<OllamaChunk>(line) {
                        if let Some(msg) = chunk.message {
                            deltas.push(msg.content);
                        }
                    }
                }
                Ok(deltas)
            })
            .flat_map(|result| {
                let items = match result {
                    Ok(v) => v.into_iter().map(Ok).collect::<Vec<_>>(),
                    Err(e) => vec![Err(e)],
                };
                futures::stream::iter(items)
            });

        Ok(Box::pin(text_stream))
    }

    async fn health_check(&self) -> bool {
        self.client
            .get(format!("{}/api/tags", self.base_url))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }
}
