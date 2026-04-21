// Tray icon disabled — GTK conflicts with eframe's main thread on Linux.
// Re-enable by adding tray-icon + gtk deps back to Cargo.toml once the
// GTK/winit integration is resolved in a newer eframe version.

use tokio::sync::mpsc;
use egui::Context;
use quickdraw_core::commands::Command;

pub struct TrayManager;

impl TrayManager {
    pub fn new() -> anyhow::Result<Self> {
        Ok(Self)
    }

    pub fn poll(&mut self, _cmd_tx: &mpsc::Sender<Command>, _ctx: &Context) {}
}
