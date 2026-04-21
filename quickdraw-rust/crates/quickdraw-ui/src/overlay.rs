use egui::{Margin, Rounding, Stroke, Ui};
use tokio::sync::mpsc;

use quickdraw_core::{commands::Command, state::AppSnapshot};
use crate::design::{Colors, Tokens};
use crate::token_card::{show_token_card, CardUiState};
use crate::widgets::ghost_button;

/// Called from inside CentralPanel — renders the token card as plain inline content.
/// No egui::Window, no egui::Area. Both register Sense::click_and_drag on their
/// background rect which keeps egui's needs_repaint() true every frame, causing
/// continuous Vulkan frame presentation and screen-wide flickering on GNOME Wayland.
pub fn show_overlay(ui: &mut Ui, snap: &AppSnapshot, cmd_tx: &mpsc::Sender<Command>) {
    let card_id = egui::Id::new("quickdraw_card_state");
    let mut card: CardUiState = ui.ctx().data_mut(|d| d.get_temp(card_id).unwrap_or_default());

    egui::Frame::none()
        .fill(Colors::OVERLAY_BG)
        .stroke(Stroke::new(Tokens::STROKE_WIDTH, Colors::STROKE))
        .inner_margin(Margin::symmetric(Tokens::PANEL_PADDING.x, Tokens::PANEL_PADDING.y))
        .rounding(Rounding::ZERO)
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label(
                    egui::RichText::new("⚡ QUICKDRAW")
                        .size(11.0)
                        .strong()
                        .color(Colors::ACCENT_YELLOW),
                );
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ghost_button(ui, "✕").clicked() {
                        let _ = cmd_tx.try_send(Command::DismissOverlay);
                    }
                });
            });
            ui.add_space(6.0);
            show_token_card(ui, snap, cmd_tx, &mut card);
        });

    ui.ctx().data_mut(|d| d.insert_temp(card_id, card));

    if ui.ctx().input(|i| i.key_pressed(egui::Key::Escape)) {
        let _ = cmd_tx.try_send(Command::DismissOverlay);
    }
}
