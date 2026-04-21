use egui::{Color32, RichText, Ui};
use tokio::sync::mpsc;

use quickdraw_core::{commands::Command, state::AppSnapshot};
use crate::design::{body, heading, muted, mono, Colors};
use crate::widgets::{brutal_button, ghost_button, loading_row, safety_badge, separator_dark};

/// Which swap adapter the user has pinned (persists while card is open).
#[derive(Default, Clone)]
pub struct CardUiState {
    pub show_swap: bool,
    pub show_chart: bool,
    pub selected_quote_idx: usize,
}

pub fn show_token_card(ui: &mut Ui, snap: &AppSnapshot, cmd_tx: &mpsc::Sender<Command>, card: &mut CardUiState) {
    let Some(addr) = snap.token_address else {
        loading_row(ui, "Scanning…");
        return;
    };

    // ── Address header ──────────────────────────────────────────────────────
    let addr_str = addr.to_string();
    let short = format!("{}…{}", &addr_str[..6], &addr_str[addr_str.len()-4..]);

    ui.horizontal(|ui| {
        ui.label(mono(&short));
        // Copy-to-clipboard — no tooltip (tooltips cause continuous repaints)
        if ui.small_button("⎘").clicked() {
            ui.output_mut(|o| o.copied_text = addr_str.clone());
        }
    });

    ui.add_space(8.0);

    // ── Safety badge ────────────────────────────────────────────────────────
    if let Some(report) = &snap.safety_report {
        safety_badge(ui, report.score, "TOKEN");
        ui.add_space(6.0);

        // Concise safety summary
        ui.label(body(&report.summary));
    } else {
        loading_row(ui, "Checking safety…");
    }

    separator_dark(ui);

    // ── Price row ───────────────────────────────────────────────────────────
    if let Some(price) = &snap.token_price {
        ui.horizontal(|ui| {
            ui.label(
                RichText::new(format!("${:.6}", price.price_usd))
                    .size(18.0)
                    .strong()
                    .color(Colors::ACCENT_YELLOW),
            );
            ui.add_space(8.0);

            let change_color = if price.change_24h_pct >= 0.0 { Colors::SAFE } else { Colors::DANGER };
            let arrow = if price.change_24h_pct >= 0.0 { "▲" } else { "▼" };
            ui.label(
                RichText::new(format!("{} {:.2}%", arrow, price.change_24h_pct.abs()))
                    .size(12.0)
                    .color(change_color),
            );
        });

        // Volume
        ui.label(muted(format!("Vol 24h: ${:.0}", price.volume_24h_usd)));
    } else {
        loading_row(ui, "Loading price…");
    }

    // ── AI narration ─────────────────────────────────────────────────────────
    if let Some(narration) = &snap.ai_narration {
        separator_dark(ui);
        ui.label(body(narration));
        if snap.ai_streaming {
            ui.label(muted("… Analyzing"));
        }
    } else if snap.token_price.is_some() {
        separator_dark(ui);
        loading_row(ui, "AI analysis…");
    }

    // ── Action buttons ───────────────────────────────────────────────────────
    if snap.safety_report.is_some() || snap.token_price.is_some() {
        separator_dark(ui);
        ui.horizontal(|ui| {
            if brutal_button(ui, if card.show_swap { "▲ Swap" } else { "Swap" }).clicked() {
                card.show_swap = !card.show_swap;
                card.show_chart = false;
            }
            ui.add_space(6.0);
            if ghost_button(ui, if card.show_chart { "▲ Chart" } else { "Chart" }).clicked() {
                card.show_chart = !card.show_chart;
                card.show_swap = false;
            }
            ui.add_space(6.0);
            if ghost_button(ui, "Explorer").clicked() {
                let _ = open::that(format!("https://solscan.io/token/{}", addr));
            }
        });

        // ── Inline swap panel ────────────────────────────────────────────────
        if card.show_swap {
            separator_dark(ui);
            crate::swap_ui::show_swap_panel(ui, snap, cmd_tx, &mut card.selected_quote_idx);
        }

        // ── Inline chart panel ───────────────────────────────────────────────
        if card.show_chart {
            separator_dark(ui);
            crate::chart::show_price_chart(ui, &[]);  // live data wired in Phase 4+
        }
    }
}
