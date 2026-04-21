/// Screenshot OCR fallback using xcap + Tesseract (leptess).
///
/// Only fires when no accessibility detection has occurred in the last 5 seconds.
/// Rate-limited to 1 screenshot per 2 seconds to avoid excessive CPU/GPU usage.

use std::sync::Arc;
use std::time::{Duration, Instant};
use anyhow::Result;
use tokio::sync::mpsc;
use tokio::time;
use tracing::{debug, info, warn};

use quickdraw_core::types::{DetectionSource, Point};
use crate::enricher::{DetectionEnricher, RawDetection};

const OCR_INTERVAL: Duration = Duration::from_secs(2);
const ACCESSIBILITY_IDLE_BEFORE_OCR: Duration = Duration::from_secs(5);

pub struct OcrWatcher {
    enricher: Arc<DetectionEnricher>,
    last_accessibility_event: Arc<tokio::sync::Mutex<Instant>>,
}

impl OcrWatcher {
    pub fn new(
        enricher: Arc<DetectionEnricher>,
        last_accessibility_event: Arc<tokio::sync::Mutex<Instant>>,
    ) -> Self {
        Self { enricher, last_accessibility_event }
    }

    pub async fn run(self) {
        info!("OCR watcher running (fires only when accessibility is idle)");
        let mut interval = time::interval(OCR_INTERVAL);

        loop {
            interval.tick().await;

            let idle_for = {
                let last = self.last_accessibility_event.lock().await;
                last.elapsed()
            };

            if idle_for < ACCESSIBILITY_IDLE_BEFORE_OCR {
                debug!("Accessibility active, skipping OCR");
                continue;
            }

            if let Err(e) = self.capture_and_scan().await {
                debug!("OCR scan failed: {e}");
            }
        }
    }

    async fn capture_and_scan(&self) -> Result<()> {
        // Spawn the CPU-heavy work off the async runtime
        let enricher = self.enricher.clone();

        tokio::task::spawn_blocking(move || -> Result<()> {
            let monitors = xcap::Monitor::all()?;
            let Some(monitor) = monitors.first() else { return Ok(()); };

            let image = monitor.capture_image()?;

            // Compress to JPEG at reduced resolution to speed up OCR
            let width = image.width().min(1280);
            let height = (image.height() as f32 * (width as f32 / image.width() as f32)) as u32;

            #[cfg(feature = "ocr")]
            {
                let resized = image::imageops::resize(
                    &image,
                    width,
                    height,
                    image::imageops::FilterType::Lanczos3,
                );

                let mut api = leptess::LepTess::new(None, "eng")?;
                let raw = resized.into_raw();
                api.set_image_from_mem(&raw)?;
                let text = api.get_utf8_text()?;

                // Fire enricher on the async runtime — bridge via std channel
                let rt = tokio::runtime::Handle::current();
                rt.block_on(enricher.process(RawDetection {
                    text,
                    position: Point { x: 0.0, y: 0.0 },
                    source: DetectionSource::Ocr,
                }));
            }

            #[cfg(not(feature = "ocr"))]
            {
                debug!("OCR feature disabled — skipping Tesseract");
            }

            Ok(())
        })
        .await??;

        Ok(())
    }
}
