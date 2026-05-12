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
            loop {
                tokio::select! {
                    _ = &mut stop_rx => {
                        // Drain any final Turn events that arrived just before stop,
                        // giving AssemblyAI up to 600ms to deliver the last transcript.
                        let deadline = tokio::time::Instant::now()
                            + tokio::time::Duration::from_millis(600);
                        loop {
                            match tokio::time::timeout_at(deadline, transcript_rx.recv()).await {
                                Ok(Some(event)) if event.is_final && !event.text.is_empty() => {
                                    tracing::info!(transcript = %event.text, "final transcript (drained)");
                                    let _ = cmd_tx.send(Command::VoiceTranscript(event.text)).await;
                                }
                                _ => break,
                            }
                        }
                        break;
                    }
                    Some(event) = transcript_rx.recv() => {
                        if event.is_final && !event.text.is_empty() {
                            tracing::info!(transcript = %event.text, "final transcript");
                            let _ = cmd_tx.send(Command::VoiceTranscript(event.text)).await;
                        }
                    }
                }
            }
        });

        Ok((capture, stop_tx))
    }
}
