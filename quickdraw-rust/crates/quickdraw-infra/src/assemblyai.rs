/// AssemblyAI real-time streaming transcription.
///
/// Flow:
///   1. GET /transcribe-token via Worker → temporary JWT (300s expiry)
///   2. Open WebSocket to wss://api.assemblyai.com/v2/realtime/ws?token=...
///   3. Send audio frames as binary WebSocket messages (raw i16 PCM at 16kHz)
///   4. Receive JSON transcript events → emit partial/final strings

use anyhow::{bail, Result};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{debug, info, warn};

use crate::audio::capture::AudioFrame;
use crate::worker_client::WorkerClient;

#[derive(Debug, Clone)]
pub struct TranscriptEvent {
    pub text: String,
    pub is_final: bool,
}

#[derive(Deserialize)]
struct AaiMessage {
    #[serde(rename = "message_type")]
    message_type: String,
    text: Option<String>,
}

pub struct AssemblyAiSession {
    worker: WorkerClient,
}

impl AssemblyAiSession {
    pub fn new(worker: WorkerClient) -> Self {
        Self { worker }
    }

    /// Start a streaming transcription session.
    /// Reads PCM frames from `audio_rx`, emits transcript events to the returned receiver.
    pub async fn start(
        &self,
        mut audio_rx: mpsc::Receiver<AudioFrame>,
    ) -> Result<mpsc::Receiver<TranscriptEvent>> {
        // Step 1: Get temporary JWT from Worker
        let token = self.get_token().await?;

        let (transcript_tx, transcript_rx) = mpsc::channel::<TranscriptEvent>(64);

        // Step 2: Open WebSocket
        let url = format!(
            "wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&token={}",
            token
        );

        let (ws_stream, _) = connect_async(&url).await?;
        let (mut ws_tx, mut ws_rx) = ws_stream.split();

        info!("AssemblyAI WebSocket connected");

        // Receive loop — transcript events → channel
        let transcript_tx_clone = transcript_tx.clone();
        tokio::spawn(async move {
            while let Some(msg) = ws_rx.next().await {
                match msg {
                    Ok(Message::Text(text)) => {
                        if let Ok(event) = serde_json::from_str::<AaiMessage>(&text) {
                            if let Some(t) = event.text {
                                if !t.is_empty() {
                                    let is_final = event.message_type == "FinalTranscript";
                                    debug!(is_final, transcript = %t, "AssemblyAI event");
                                    let _ = transcript_tx_clone.send(TranscriptEvent {
                                        text: t,
                                        is_final,
                                    }).await;
                                }
                            }
                        }
                    }
                    Ok(Message::Close(_)) => {
                        info!("AssemblyAI session closed by server");
                        break;
                    }
                    Err(e) => {
                        warn!("AssemblyAI WebSocket error: {e}");
                        break;
                    }
                    _ => {}
                }
            }
        });

        // Send loop — audio frames → WebSocket binary frames
        tokio::spawn(async move {
            while let Some(frame) = audio_rx.recv().await {
                // Convert i16 samples to raw bytes (little-endian)
                let bytes: Vec<u8> = frame.0
                    .iter()
                    .flat_map(|s| s.to_le_bytes())
                    .collect();

                if ws_tx.send(Message::Binary(bytes)).await.is_err() {
                    break;
                }
            }

            // Terminate the session cleanly
            let terminate = serde_json::json!({ "terminate_session": true });
            let _ = ws_tx.send(Message::Text(terminate.to_string())).await;
        });

        Ok(transcript_rx)
    }

    async fn get_token(&self) -> Result<String> {
        let resp = self.worker
            .get("/transcribe-token")
            .send()
            .await?;

        if !resp.status().is_success() {
            bail!("failed to get AssemblyAI token: {}", resp.status());
        }

        let body: serde_json::Value = resp.json().await?;
        body["token"]
            .as_str()
            .map(str::to_owned)
            .ok_or_else(|| anyhow::anyhow!("no token in response"))
    }
}
