/// Push-to-talk audio capture.
///
/// Uses cpal to open the default input device, resamples to 16 kHz mono via rubato
/// (required by AssemblyAI), and yields PCM frames through a channel.
/// The capture buffer is zeroed on drop via Zeroize.

use anyhow::{bail, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rubato::{FftFixedIn, Resampler};
use tokio::sync::mpsc;
use tracing::{info, warn};
use zeroize::Zeroizing;

pub const TARGET_SAMPLE_RATE: u32 = 16_000;
const FRAME_SAMPLES: usize = 4_096; // ~256ms at 16kHz

/// 16kHz mono PCM frame — zeroed on drop.
pub struct AudioFrame(pub Zeroizing<Vec<i16>>);

/// Spawns the cpal capture thread and returns a receiver for PCM frames.
/// The stream runs until the returned `CaptureHandle` is dropped.
pub struct CaptureHandle {
    _stream: cpal::Stream,
    pub tx: mpsc::Sender<AudioFrame>,
}

impl CaptureHandle {
    pub fn start() -> Result<(Self, mpsc::Receiver<AudioFrame>)> {
        let host   = cpal::default_host();
        let device = host.default_input_device()
            .ok_or_else(|| anyhow::anyhow!("no audio input device"))?;

        let config = device.default_input_config()?;
        info!(
            device = device.name().unwrap_or_default(),
            sample_rate = config.sample_rate().0,
            channels = config.channels(),
            "audio capture starting"
        );

        let (tx, rx) = mpsc::channel::<AudioFrame>(32);
        let tx_clone = tx.clone();

        let src_rate    = config.sample_rate().0;
        let src_channels = config.channels() as usize;

        // Build resampler if input rate != 16kHz
        let needs_resample = src_rate != TARGET_SAMPLE_RATE;

        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => {
                let tx = tx_clone;
                let mut buf: Vec<f32> = Vec::new();
                // Resampler operates on 1 channel — we mix to mono before resampling.
                let mut resampler: Option<FftFixedIn<f32>> = if needs_resample {
                    Some(FftFixedIn::<f32>::new(
                        src_rate as usize,
                        TARGET_SAMPLE_RATE as usize,
                        FRAME_SAMPLES,
                        2,
                        1,
                    )?)
                } else {
                    None
                };

                device.build_input_stream(
                    &config.into(),
                    move |data: &[f32], _| {
                        // Mix to mono
                        let mono: Vec<f32> = data
                            .chunks(src_channels)
                            .map(|ch| ch.iter().sum::<f32>() / src_channels as f32)
                            .collect();

                        buf.extend_from_slice(&mono);

                        while buf.len() >= FRAME_SAMPLES {
                            let chunk: Vec<f32> = buf.drain(..FRAME_SAMPLES).collect();

                            let pcm = if let Some(rs) = &mut resampler {
                                match rs.process(&[chunk], None) {
                                    Ok(out) => f32_to_i16(&out[0]),
                                    Err(e) => { warn!("resample error: {e}"); return; }
                                }
                            } else {
                                f32_to_i16(&chunk)
                            };

                            let _ = tx.blocking_send(AudioFrame(Zeroizing::new(pcm)));
                        }
                    },
                    |e| warn!("cpal input error: {e}"),
                    None,
                )?
            }
            fmt => bail!("unsupported audio format: {fmt:?}"),
        };

        stream.play()?;

        Ok((Self { _stream: stream, tx }, rx))
    }
}

fn f32_to_i16(samples: &[f32]) -> Vec<i16> {
    samples.iter().map(|&s| (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16).collect()
}
