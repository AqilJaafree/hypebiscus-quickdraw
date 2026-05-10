/// AssemblyAI v3 streaming transcription.
///
/// Flow:
///   1. GET /transcribe-token via Worker → temporary token (480s expiry)
///   2. Open WebSocket to wss://streaming.assemblyai.com/v3/ws?token=...
///   3. Send audio frames as binary WebSocket messages (raw i16 PCM at 16kHz)
///   4. Receive JSON events:
///      - type="Turn"        → transcript string + end_of_turn bool
///      - type="Begin"       → session started
///      - type="Termination" → session ended

use anyhow::{bail, Result};
use futures::{SinkExt, StreamExt};
use serde::Deserialize;
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

/// v3 WebSocket message — all events share the `type` discriminator.
#[derive(Deserialize)]
struct AaiMessage {
    #[serde(rename = "type")]
    kind: String,
    // Present on Turn events
    transcript:  Option<String>,
    end_of_turn: Option<bool>,
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
        let token = self.get_token().await?;

        let (transcript_tx, transcript_rx) = mpsc::channel::<TranscriptEvent>(64);

        let url = format!(
            "wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&speech_model=universal-streaming-english&token={}",
            token
        );

        let (ws_stream, _) = connect_async(&url).await?;
        let (mut ws_tx, mut ws_rx) = ws_stream.split();

        info!("AssemblyAI v3 WebSocket connected");

        // Receive loop — Turn events → channel
        let transcript_tx_clone = transcript_tx.clone();
        tokio::spawn(async move {
            while let Some(msg) = ws_rx.next().await {
                match msg {
                    Ok(Message::Text(text)) => {
                        if let Ok(event) = serde_json::from_str::<AaiMessage>(&text) {
                            match event.kind.as_str() {
                                "Turn" => {
                                    if let Some(t) = event.transcript {
                                        if !t.is_empty() {
                                            let is_final = event.end_of_turn.unwrap_or(false);
                                            debug!(is_final, transcript = %t, "AssemblyAI Turn");
                                            let _ = transcript_tx_clone.send(TranscriptEvent {
                                                text: t,
                                                is_final,
                                            }).await;
                                        }
                                    }
                                }
                                "Begin" => info!("AssemblyAI session started"),
                                "Termination" => {
                                    info!("AssemblyAI session terminated");
                                    break;
                                }
                                "Error" => {
                                    warn!("AssemblyAI error: {}", text);
                                    break;
                                }
                                other => debug!("AssemblyAI event: {other}"),
                            }
                        }
                    }
                    Ok(Message::Close(frame)) => {
                        info!("AssemblyAI session closed by server: {:?}", frame);
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
                let bytes: Vec<u8> = frame.0
                    .iter()
                    .flat_map(|s| s.to_le_bytes())
                    .collect();

                if ws_tx.send(Message::Binary(bytes)).await.is_err() {
                    break;
                }
            }

            // Terminate the session cleanly
            let terminate = serde_json::json!({ "type": "Terminate" });
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
