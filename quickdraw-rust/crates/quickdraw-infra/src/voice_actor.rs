/// Voice actor — manages push-to-talk state and bridges audio → transcript → engine command.

use anyhow::Result;
use tokio::sync::{mpsc, oneshot};
use tracing::{info, warn};

use quickdraw_core::commands::Command;
use crate::audio::capture::CaptureHandle;
use crate::assemblyai::AssemblyAiSession;
use crate::worker_client::WorkerClient;

pub enum VoiceActorMsg {
    Start,
    Stop,
}

pub struct VoiceActor {
    worker: WorkerClient,
    cmd_tx: mpsc::Sender<Command>,
    active: Option<(CaptureHandle, oneshot::Sender<()>)>,
}

impl VoiceActor {
    pub fn new(worker: WorkerClient, cmd_tx: mpsc::Sender<Command>) -> Self {
        Self { worker, cmd_tx, active: None }
    }

    pub async fn handle(&mut self, msg: VoiceActorMsg) {
        match msg {
            VoiceActorMsg::Start => {
                if self.active.is_some() {
                    return; // already recording
                }
                match self.start_capture().await {
                    Ok(handle) => {
                        info!("Voice capture started");
                        self.active = Some(handle);
                    }
                    Err(e) => warn!("Failed to start voice capture: {e}"),
                }
            }
            VoiceActorMsg::Stop => {
                if let Some((_, stop_tx)) = self.active.take() {
                    let _ = stop_tx.send(());
                    info!("Voice capture stopped");
                    let _ = self.cmd_tx.send(Command::StopListening).await;
                }
            }
        }
    }

    async fn start_capture(&self) -> Result<(CaptureHandle, oneshot::Sender<()>)> {
        let (capture, audio_rx) = CaptureHandle::start()?;

        let session = AssemblyAiSession::new(self.worker.clone());
        let mut transcript_rx = session.start(audio_rx).await?;

        let cmd_tx = self.cmd_tx.clone();
        let (stop_tx, mut stop_rx) = oneshot::channel::<()>();

        tokio::spawn(async move {
            let mut partial = String::new();

            loop {
                tokio::select! {
                    _ = &mut stop_rx => break,
                    Some(event) = transcript_rx.recv() => {
                        if event.is_final {
                            let transcript = std::mem::take(&mut partial);
                            if !transcript.is_empty() {
                                // The AI layer parses the transcript into a swap intent
                                // Command::VoiceTranscript would go here — Phase 7 extension
                                tracing::info!(transcript = %transcript, "final transcript");
                            }
                        } else {
                            partial = event.text;
                            // Update UI with partial transcript
                        }
                    }
                }
            }
        });

        Ok((capture, stop_tx))
    }
}
