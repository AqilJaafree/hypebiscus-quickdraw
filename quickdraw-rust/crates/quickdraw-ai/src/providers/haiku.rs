use anyhow::{bail, Result};
use async_trait::async_trait;
use futures::{Stream, StreamExt};
use hmac::{Hmac, Mac};
use pin_project_lite::pin_project;
use reqwest::{Client, RequestBuilder};
use sha2::Sha256;
use serde::{Deserialize, Serialize};
use std::pin::Pin;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tracing::{debug, warn};

use crate::provider::{AIProvider, AIRequest, AIResponse, TokenStream};

const MODEL: &str = "claude-haiku-4-5-20251001";

// ──────────────────────────── Request shapes ─────────────────────────────────

#[derive(Serialize)]
struct AnthropicRequest<'a> {
    model: &'a str,
    max_tokens: u32,
    system: Vec<SystemBlock<'a>>,
    messages: Vec<MessageBlock<'a>>,
    stream: bool,
}

#[derive(Serialize)]
struct SystemBlock<'a> {
    #[serde(rename = "type")]
    kind: &'a str,
    text: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    cache_control: Option<CacheControl>,
}

#[derive(Serialize)]
struct CacheControl {
    #[serde(rename = "type")]
    kind: &'static str,
}

impl CacheControl {
    fn ephemeral() -> Self { Self { kind: "ephemeral" } }
}

#[derive(Serialize)]
struct MessageBlock<'a> {
    role: &'a str,
    content: &'a str,
}

// ──────────────────────────── SSE event shapes ───────────────────────────────

#[derive(Deserialize)]
struct SseEvent {
    #[serde(rename = "type")]
    kind: String,
    delta: Option<Delta>,
    usage: Option<UsageInfo>,
}

#[derive(Deserialize)]
struct Delta {
    text: Option<String>,
}

#[derive(Deserialize)]
struct UsageInfo {
    input_tokens: Option<u32>,
    output_tokens: Option<u32>,
    cache_read_input_tokens: Option<u32>,
}

// ─────────────────────────────── Provider ────────────────────────────────────

pub struct HaikuProvider {
    client: Client,
    /// URL of the Cloudflare Worker proxy — never the Anthropic API directly
    worker_url: String,
    app_secret: String,
}

impl HaikuProvider {
    pub fn new(worker_url: impl Into<String>, app_secret: impl Into<String>) -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(30))
                .build()
                .expect("reqwest client"),
            worker_url: worker_url.into(),
            app_secret: app_secret.into(),
        }
    }

    /// Attach HMAC-SHA256 auth headers to a request builder.
    /// Worker verifies: HMAC(app_secret, "{timestamp}.{path}")
    fn sign(&self, rb: RequestBuilder, path: &str) -> RequestBuilder {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            .to_string();
        let msg = format!("{ts}.{path}");
        let mut mac = Hmac::<Sha256>::new_from_slice(self.app_secret.as_bytes())
            .expect("HMAC accepts any key size");
        mac.update(msg.as_bytes());
        let sig = hex::encode(mac.finalize().into_bytes());
        rb.header("X-Quickdraw-Timestamp", &ts)
          .header("X-Quickdraw-Sig", &sig)
    }

    fn build_request<'a>(req: &'a AIRequest) -> AnthropicRequest<'a> {
        // Build the two cacheable system layers.
        // CRITICAL: both must have cache_control: ephemeral so Anthropic caches them.
        let mut system = vec![
            SystemBlock {
                kind: "text",
                text: &req.system_static,
                cache_control: Some(CacheControl::ephemeral()), // Layer 1 — always cached
            },
        ];

        if let Some(pulse) = &req.market_pulse {
            system.push(SystemBlock {
                kind: "text",
                text: pulse,
                cache_control: Some(CacheControl::ephemeral()), // Layer 2 — 5min TTL aligns
            });
        }

        let messages: Vec<MessageBlock> = req.messages.iter()
            .map(|m| MessageBlock { role: &m.role, content: &m.content })
            .collect();

        AnthropicRequest {
            model: MODEL,
            max_tokens: req.max_tokens,
            system,
            messages,
            stream: true,
        }
    }
}

#[async_trait]
impl AIProvider for HaikuProvider {
    fn id(&self) -> &str { "haiku" }
    fn display_name(&self) -> &str { "Claude Haiku" }
    fn is_local(&self) -> bool { false }
    fn supports_vision(&self) -> bool { true }
    fn supports_streaming(&self) -> bool { true }

    async fn complete(&self, req: AIRequest) -> Result<AIResponse> {
        let started = Instant::now();
        let body = Self::build_request(&req);

        let rb = self.client.post(format!("{}/ai/fast", self.worker_url)).json(&body);
        let resp = self.sign(rb, "/ai/fast").send().await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            bail!("Haiku API error {status}: {text}");
        }

        // Collect the SSE stream into a full response
        let mut text_buf = String::new();
        let mut input_tokens = 0u32;
        let mut output_tokens = 0u32;
        let mut cache_hit = false;
        let mut ttft_ms = 0u64;
        let mut first = true;

        let bytes = resp.bytes().await?;
        let body_str = String::from_utf8_lossy(&bytes);

        for line in body_str.lines() {
            let Some(data) = line.strip_prefix("data: ") else { continue };
            if data == "[DONE]" { break; }

            let Ok(event) = serde_json::from_str::<SseEvent>(data) else { continue };

            if first && event.kind == "content_block_delta" {
                ttft_ms = started.elapsed().as_millis() as u64;
                first = false;
            }

            if let Some(delta) = &event.delta {
                if let Some(text) = &delta.text {
                    text_buf.push_str(text);
                }
            }

            if let Some(usage) = &event.usage {
                input_tokens = usage.input_tokens.unwrap_or(input_tokens);
                output_tokens = usage.output_tokens.unwrap_or(output_tokens);
                cache_hit = usage.cache_read_input_tokens.unwrap_or(0) > 0;
            }
        }

        Ok(AIResponse {
            text: text_buf,
            provider_used: MODEL.into(),
            latency_ms: started.elapsed().as_millis() as u64,
            time_to_first_token_ms: ttft_ms,
            input_tokens,
            output_tokens,
            cache_hit,
            from_fallback: false,
        })
    }

    async fn stream(&self, req: AIRequest) -> Result<TokenStream> {
        let body = Self::build_request(&req);

        let rb = self.client.post(format!("{}/ai/fast", self.worker_url)).json(&body);
        let resp = self.sign(rb, "/ai/fast").send().await?;

        if !resp.status().is_success() {
            bail!("Haiku stream error: {}", resp.status());
        }

        let byte_stream = resp.bytes_stream();

        // Convert SSE byte stream into a stream of text deltas
        let text_stream = byte_stream
            .map(|chunk| -> Result<Vec<String>> {
                let bytes = chunk?;
                let text = String::from_utf8_lossy(&bytes);
                let mut deltas = Vec::new();
                for line in text.lines() {
                    let Some(data) = line.strip_prefix("data: ") else { continue };
                    if data == "[DONE]" { break; }
                    if let Ok(event) = serde_json::from_str::<SseEvent>(data) {
                        if let Some(delta) = event.delta {
                            if let Some(t) = delta.text {
                                deltas.push(t);
                            }
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
            .get(format!("{}/health", self.worker_url))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }
}
