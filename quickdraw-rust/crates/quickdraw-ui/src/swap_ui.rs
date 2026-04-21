use egui::{Color32, RichText, Ui};
use tokio::sync::mpsc;

use quickdraw_core::{commands::Command, state::AppSnapshot};
use crate::design::{body, muted, Colors};
use crate::widgets::{brutal_button, ghost_button};

pub fn show_swap_panel(
    ui: &mut Ui,
    snap: &AppSnapshot,
    cmd_tx: &mpsc::Sender<Command>,
    selected: &mut usize,
) {
    if snap.quotes.is_empty() {
        ui.label(muted("… Fetching quotes"));
        return;
    }

    ui.label(body("Best quotes"));
    ui.add_space(4.0);

    for (i, quote) in snap.quotes.iter().enumerate() {
        let is_selected = *selected == i;
        let bg = if is_selected {
            Color32::from_rgb(0x28, 0x28, 0x28)
        } else {
            Color32::from_rgb(0x20, 0x20, 0x20)
        };

        egui::Frame::none()
            .fill(bg)
            .inner_margin(egui::Margin::symmetric(8.0, 6.0))
            .stroke(egui::Stroke::new(
                if is_selected { 2.0 } else { 1.0 },
                if is_selected { Colors::ACCENT_YELLOW } else { Color32::from_rgb(0x44, 0x44, 0x44) },
            ))
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    // Adapter tag
                    ui.label(
                        RichText::new(&quote.adapter_name)
                            .size(12.0)
                            .strong()
                            .color(Colors::ACCENT_CYAN),
                    );

                    ui.add_space(8.0);

                    // Output amount
                    ui.label(
                        RichText::new(format!("{} out", quote.out_amount))
                            .size(12.0)
                            .color(Colors::TEXT_ON_DARK),
                    );

                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        // Impact warning
                        let impact_color = if quote.price_impact_pct > 2.0 {
                            Colors::DANGER
                        } else {
                            Colors::TEXT_MUTED
                        };
                        ui.label(
                            RichText::new(format!("{:.2}% impact", quote.price_impact_pct))
                                .size(11.0)
                                .color(impact_color),
                        );
                    });
                });

                if !is_selected {
                    if ui.add(egui::Button::new(
                        RichText::new("Select").size(11.0).color(Colors::TEXT_ON_DARK)
                    ).fill(Color32::TRANSPARENT)).clicked() {
                        *selected = i;
                        let _ = cmd_tx.try_send(Command::SelectQuote(quote.clone()));
                    }
                }
            });

        ui.add_space(4.0);
    }

    ui.add_space(4.0);

    // Slippage indicator
    if let Some(q) = snap.quotes.get(*selected) {
        ui.label(muted(format!("Slippage: {:.1}bps  ·  Route: {}", q.slippage_bps, q.route_label)));
        ui.add_space(8.0);
    }

    // MEV / high impact warning
    if let Some(q) = snap.quotes.get(*selected) {
        if q.price_impact_pct > 2.0 {
            egui::Frame::none()
                .fill(Color32::from_rgb(0x3A, 0x18, 0x18))
                .inner_margin(egui::Margin::same(8.0))
                .show(ui, |ui| {
                    ui.label(
                        RichText::new(format!("⚠  {:.2}% price impact — high slippage warning", q.price_impact_pct))
                            .size(11.0)
                            .color(Colors::DANGER),
                    );
                });
            ui.add_space(6.0);
        }
    }

    ui.horizontal(|ui| {
        if brutal_button(ui, "Confirm Swap").clicked() {
            let _ = cmd_tx.try_send(Command::ConfirmSwap);
        }
        ui.add_space(6.0);
        if ghost_button(ui, "Cancel").clicked() {
            let _ = cmd_tx.try_send(Command::CancelSwap);
        }
    });
}
