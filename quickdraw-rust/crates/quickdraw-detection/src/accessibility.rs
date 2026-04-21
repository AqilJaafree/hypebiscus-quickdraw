/// AT-SPI2 accessibility reader for Linux.
///
/// Watches for text changes in focused windows via the AT-SPI2 D-Bus interface.
/// When text changes, the new content is passed to the enricher to extract addresses.
///
/// Compile-time gated on the `accessibility` feature flag — requires `atspi` crate
/// and the at-spi2-core daemon to be running.

#[cfg(feature = "accessibility")]
mod inner {
    use std::sync::Arc;
    use anyhow::Result;
    use atspi::{connection::AccessibilityConnection, events::EventInterfaces};
    use tokio::sync::mpsc;
    use tracing::{debug, info, warn};

    use quickdraw_core::types::{DetectionSource, Point};
    use crate::enricher::{DetectionEnricher, RawDetection};

    pub async fn run_accessibility_watcher(enricher: Arc<DetectionEnricher>) -> Result<()> {
        info!("Starting AT-SPI2 accessibility watcher");

        let conn = AccessibilityConnection::new().await?;
        conn.register_event::<atspi::events::object::TextChangedEvent>().await?;
        conn.register_event::<atspi::events::focus::FocusEvent>().await?;

        let mut events = conn.event_stream();

        while let Some(event) = events.next().await {
            match event {
                Ok(EventInterfaces::Object(obj_event)) => {
                    if let Some(text) = extract_text_from_event(&obj_event) {
                        enricher.process(RawDetection {
                            text,
                            position: Point { x: 0.0, y: 0.0 }, // cursor pos resolved in enricher if needed
                            source: DetectionSource::Accessibility {
                                app_name: "unknown".into(),
                            },
                        }).await;
                    }
                }
                Err(e) => {
                    debug!("AT-SPI2 event error: {e}");
                }
                _ => {}
            }
        }

        Ok(())
    }

    fn extract_text_from_event(event: &atspi::events::object::ObjectEvents) -> Option<String> {
        // Extract changed text content from text-changed events
        match event {
            atspi::events::object::ObjectEvents::TextChanged(e) => {
                Some(e.detail1.clone())
            }
            _ => None,
        }
    }
}

#[cfg(not(feature = "accessibility"))]
pub mod stub {
    use std::sync::Arc;
    use anyhow::Result;
    use crate::enricher::DetectionEnricher;

    /// No-op stub when AT-SPI2 is not enabled.
    pub async fn run_accessibility_watcher(_enricher: Arc<DetectionEnricher>) -> Result<()> {
        tracing::info!("AT-SPI2 watcher disabled (build without `accessibility` feature)");
        std::future::pending::<()>().await;
        Ok(())
    }
}

#[cfg(feature = "accessibility")]
pub use inner::run_accessibility_watcher;

#[cfg(not(feature = "accessibility"))]
pub use stub::run_accessibility_watcher;
