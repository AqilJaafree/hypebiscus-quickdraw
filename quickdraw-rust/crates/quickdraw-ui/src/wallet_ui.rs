use egui::{Margin, RichText, Ui};
use tokio::sync::mpsc;

use quickdraw_core::{commands::Command, state::AppSnapshot};
use crate::design::Colors;

// Empty state kept so callers don't need to change signatures
#[derive(Default)]
pub struct WalletUiState;

pub fn show_wallet_section(
    ui: &mut Ui,
    snap: &AppSnapshot,
    cmd_tx: &mpsc::Sender<Command>,
    _wallet_ui: &mut WalletUiState,
    _ctx: &egui::Context,
) {
    if let Some(pubkey) = snap.wallet_pubkey {
        let addr = pubkey.to_string();
        let short = format!("{}…{}", &addr[..6], &addr[addr.len()-4..]);

        egui::Frame::none()
            .fill(egui::Color32::from_rgb(0x1A, 0x1A, 0x1A))
            .stroke(egui::Stroke::new(1.5, egui::Color32::from_rgb(0x44, 0x44, 0x44)))
            .inner_margin(Margin::symmetric(8.0, 5.0))
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.label(
                        RichText::new(&short)
                            .size(10.0).monospace()
                            .color(egui::Color32::from_rgb(0xAA, 0xAA, 0xAA)),
                    );
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui.add(
                            egui::Button::new(RichText::new("Disconnect").size(10.0).monospace().color(Colors::DANGER))
                                .fill(egui::Color32::TRANSPARENT)
                                .stroke(egui::Stroke::NONE)
                        ).clicked() {
                            let _ = cmd_tx.try_send(Command::DisconnectWallet);
                        }
                    });
                });
            });
    } else {
        if ui.add(
            egui::Button::new(
                RichText::new("Connect with Email / Social")
                    .size(11.0).monospace().color(egui::Color32::BLACK)
            )
            .fill(Colors::ACCENT_YELLOW)
            .stroke(egui::Stroke::new(1.5, egui::Color32::BLACK))
            .rounding(egui::Rounding::ZERO)
            .min_size(egui::vec2(ui.available_width(), 30.0))
        ).clicked() {
            let _ = cmd_tx.try_send(Command::ConnectWallet);
        }

        ui.add_space(4.0);
        ui.label(
            RichText::new("Opens browser — email, Google, or Apple")
                .size(10.0).monospace()
                .color(egui::Color32::from_rgb(0x55, 0x55, 0x55)),
        );
    }
}
