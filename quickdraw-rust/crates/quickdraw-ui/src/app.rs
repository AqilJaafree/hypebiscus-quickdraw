use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};
use egui::{Margin, Rounding, Stroke, Vec2};
#[allow(unused_imports)]
use tokio::sync::mpsc;

use quickdraw_core::{commands::Command, state::AppSnapshot};
use crate::design::{Colors, Tokens};
#[allow(unused_imports)]
use crate::widgets::{safety_badge, ghost_button, loading_row};
use crate::panel::show_settings_panel;
use crate::header;

const AUTO_DISMISS_SECS: f32 = 5.0;

/// Main application state for the Quickdraw egui UI.
///
/// Runs as a single eframe viewport that shows/hides based on token detections.
/// In demo mode, the window is visible immediately; otherwise it starts hidden
/// and appears only when a Solana address is detected.
pub struct QuickdrawApp {
    snapshot:             Arc<RwLock<AppSnapshot>>,
    cmd_tx:               mpsc::Sender<Command>,
    demo_mode:            bool,
    prev_overlay_visible: bool,
    overlay_shown_at:     Option<Instant>,
}

impl QuickdrawApp {
    pub fn new(
        cc: &eframe::CreationContext<'_>,
        snapshot: Arc<RwLock<AppSnapshot>>,
        cmd_tx: mpsc::Sender<Command>,
        demo_mode: bool,
    ) -> Self {
        apply_neobrutalism_theme(&cc.egui_ctx);
        load_fonts(&cc.egui_ctx);
        Self {
            snapshot,
            cmd_tx,
            demo_mode,
            prev_overlay_visible: false,
            overlay_shown_at: None,
        }
    }
}

impl eframe::App for QuickdrawApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        let snap = self.snapshot.read().unwrap().clone();

        // ── Visibility transitions ────────────────────────────────────────────
        if snap.overlay_visible != self.prev_overlay_visible {
            self.prev_overlay_visible = snap.overlay_visible;
            if snap.overlay_visible {
                let x = snap.overlay_position.x + 20.0;
                let y = snap.overlay_position.y + 10.0;
                ctx.send_viewport_cmd(egui::ViewportCommand::Visible(true));
                ctx.send_viewport_cmd(egui::ViewportCommand::OuterPosition(egui::pos2(x, y)));
                ctx.send_viewport_cmd(egui::ViewportCommand::InnerSize(egui::vec2(Tokens::POPUP_WIDTH, Tokens::POPUP_H_LOADING)));
                ctx.send_viewport_cmd(egui::ViewportCommand::WindowLevel(egui::WindowLevel::AlwaysOnTop));
                ctx.send_viewport_cmd(egui::ViewportCommand::Focus);
                self.overlay_shown_at = Some(Instant::now());
            } else {
                ctx.send_viewport_cmd(egui::ViewportCommand::Visible(false));
                self.overlay_shown_at = None;
            }
        }

        // ── Auto-dismiss countdown (skipped in demo mode) ─────────────────────
        let elapsed = self.overlay_shown_at
            .map(|t| t.elapsed().as_secs_f32())
            .unwrap_or(0.0);

        if snap.overlay_visible && !self.demo_mode {
            if elapsed >= AUTO_DISMISS_SECS {
                let _ = self.cmd_tx.try_send(Command::DismissOverlay);
            } else {
                ctx.request_repaint_after(Duration::from_millis(80));
                let h = popup_height(&snap);
                ctx.send_viewport_cmd(egui::ViewportCommand::InnerSize(egui::vec2(Tokens::POPUP_WIDTH, h)));
            }
        } else if snap.overlay_visible {
            // Demo: still repaint for the countdown animation, but don't dismiss
            ctx.request_repaint_after(Duration::from_millis(80));
            let h = popup_height(&snap);
            ctx.send_viewport_cmd(egui::ViewportCommand::InnerSize(egui::vec2(Tokens::POPUP_WIDTH, h)));
        }

        // ── Settings panel (second viewport) ─────────────────────────────────
        show_settings_panel(ctx, self.snapshot.clone(), &self.cmd_tx);

        // ── Render ────────────────────────────────────────────────────────────
        egui::CentralPanel::default()
            .frame(egui::Frame::none().fill(Colors::OVERLAY_BG))
            .show(ctx, |ui| {
                if snap.overlay_visible {
                    show_popup(ui, &snap, &self.cmd_tx, elapsed);
                }
                if ctx.input(|i| i.key_pressed(egui::Key::Escape)) {
                    let _ = self.cmd_tx.try_send(Command::DismissOverlay);
                }
            });
    }
}

fn popup_height(snap: &AppSnapshot) -> f32 {
    if snap.safety_report.is_some() { Tokens::POPUP_H_FULL } else { Tokens::POPUP_H_LOADING }
}

// ─────────────────────────── Popup UI (V3) ───────────────────────────────────
// Design: score fills entire header as safety-colored block.
// Ticker shown (not address). Price below. No buttons. No countdown bar.

fn show_popup(
    ui: &mut egui::Ui,
    snap: &AppSnapshot,
    cmd_tx: &mpsc::Sender<Command>,
    _elapsed: f32,
) {
    let loading = snap.safety_report.is_none();
    let score = snap.safety_report.as_ref().map(|r| r.score).unwrap_or(0);
    let header_color = if loading {
        egui::Color32::from_rgb(0x1E, 0x1E, 0x1E)
    } else {
        Colors::safety_color(score)
    };
    let ticker = snap.token_ticker.as_deref()
        .or(snap.safety_report.as_ref().and_then(|r| r.ticker.as_deref()))
        .unwrap_or("———");

    egui::Frame::none()
        .fill(Colors::OVERLAY_BG)
        .inner_margin(Margin::ZERO)
        .show(ui, |ui| {
            // ── Drag zone (registered first so buttons take priority) ──────
            // Covers left ~70% of header height; right side reserved for buttons.
            let drag_rect = egui::Rect::from_min_size(
                ui.cursor().min,
                egui::vec2(Tokens::POPUP_WIDTH * 0.70, 65.0),
            );
            if ui.interact(drag_rect, egui::Id::new("popup_drag"), egui::Sense::drag())
                .drag_started()
            {
                ui.ctx().send_viewport_cmd(egui::ViewportCommand::StartDrag);
            }

            // ── Score-first header ─────────────────────────────────────────
            let header_resp = header::render_header(
                ui,
                loading,
                score,
                ticker,
                header_color,
                cmd_tx,
            );

            let _ = header_resp;

            // ── Price row ──────────────────────────────────────────────────
            egui::Frame::none()
                .fill(Colors::OVERLAY_BG)
                .inner_margin(Margin { left: 12.0, right: 10.0, top: 8.0, bottom: 10.0 })
                .show(ui, |ui| {
                    if loading {
                        ui.label(
                            egui::RichText::new("Fetching…")
                                .size(12.0)
                                .monospace()
                                .color(egui::Color32::WHITE),
                        );
                    } else if let Some(price) = &snap.token_price {
                        let up = price.change_24h_pct >= 0.0;
                        let change_color = if up { Colors::SAFE } else { Colors::DANGER };
                        let arrow = if up { "▲" } else { "▼" };
                        ui.horizontal(|ui| {
                            ui.label(
                                egui::RichText::new(format_price(price.price_usd))
                                    .size(13.0)
                                    .strong()
                                    .monospace()
                                    .color(egui::Color32::WHITE),
                            );
                            ui.label(
                                egui::RichText::new(format!("{} {:.1}%", arrow, price.change_24h_pct.abs()))
                                    .size(12.0)
                                    .strong()
                                    .monospace()
                                    .color(change_color),
                            );
                        });
                    } else {
                        ui.label(
                            egui::RichText::new("Fetching…")
                                .size(12.0)
                                .monospace()
                                .color(egui::Color32::WHITE),
                        );
                    }
                });
        });

    // 2px black border around entire popup
    let r = ui.ctx().screen_rect();
    ui.painter().rect_stroke(r, 0.0, egui::Stroke::new(2.0, egui::Color32::BLACK));
}


fn format_price(p: f64) -> String {
    if p >= 1.0        { format!("${:.2}", p) }
    else if p >= 0.01  { format!("${:.4}", p) }
    else if p >= 0.001 { format!("${:.5}", p) }
    else               { format!("${:.6}", p) }
}

fn format_large_usd(v: f64) -> String {
    if v >= 1_000_000_000.0 { format!("${:.1}B", v / 1_000_000_000.0) }
    else if v >= 1_000_000.0 { format!("${:.1}M", v / 1_000_000.0) }
    else if v >= 1_000.0     { format!("${:.0}K", v / 1_000.0) }
    else                     { format!("${:.0}", v) }
}

// ─────────────────────────── Theme ───────────────────────────────────────────

pub fn apply_neobrutalism_theme(ctx: &egui::Context) {
    let mut visuals = egui::Visuals::light();
    let stroke = Stroke::new(Tokens::STROKE_WIDTH, Colors::STROKE);

    visuals.widgets.inactive.bg_fill   = Colors::PANEL_BG;
    visuals.widgets.inactive.bg_stroke = stroke;
    visuals.widgets.inactive.rounding  = Rounding::ZERO;

    visuals.widgets.hovered.bg_fill    = Colors::ACCENT_YELLOW;
    visuals.widgets.hovered.bg_stroke  = stroke;
    visuals.widgets.hovered.rounding   = Rounding::ZERO;

    visuals.widgets.active.bg_fill     = Colors::ACCENT_YELLOW;
    visuals.widgets.active.bg_stroke   = stroke;
    visuals.widgets.active.rounding    = Rounding::ZERO;
    visuals.widgets.active.expansion   = -1.0;

    visuals.window_fill     = Colors::PANEL_BG;
    visuals.window_stroke   = stroke;
    visuals.window_rounding = Rounding::ZERO;

    visuals.window_shadow = egui::epaint::Shadow {
        offset: Tokens::SHADOW_OFFSET,
        blur: 0.0,
        spread: 0.0,
        color: Colors::SHADOW,
    };
    visuals.popup_shadow = visuals.window_shadow;

    ctx.set_visuals(visuals);
}

fn load_fonts(ctx: &egui::Context) {
    let mut fonts = egui::FontDefinitions::default();

    // Space Mono Regular
    fonts.font_data.insert(
        "SpaceMono".into(),
        egui::FontData::from_static(include_bytes!(
            "../../../assets/SpaceMono-Regular.ttf"
        )).into(),
    );
    // Space Mono Bold
    fonts.font_data.insert(
        "SpaceMonoBold".into(),
        egui::FontData::from_static(include_bytes!(
            "../../../assets/SpaceMono-Bold.ttf"
        )).into(),
    );

    // Make Space Mono the first choice for both proportional and monospace slots
    fonts.families
        .entry(egui::FontFamily::Proportional)
        .or_default()
        .insert(0, "SpaceMonoBold".into());

    fonts.families
        .entry(egui::FontFamily::Monospace)
        .or_default()
        .insert(0, "SpaceMono".into());

    ctx.set_fonts(fonts);
}

// ─────────────────────────── Demo snapshot ───────────────────────────────────

/// Returns a populated snapshot for demo mode (--demo flag).
///
/// Includes BONK token data, safety score 82, price, and AI narration
/// so the popup appears immediately in a realistic state.
pub fn demo_snapshot() -> AppSnapshot {
    use quickdraw_core::types::{AdapterQuote, SafetyReport, TokenPrice};
    use quickdraw_core::state::AiMode;
    use solana_sdk::pubkey::Pubkey;
    use std::str::FromStr;

    let bonk = Pubkey::from_str("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263").unwrap_or_default();

    AppSnapshot {
        overlay_visible: true,
        overlay_position: quickdraw_core::types::Point { x: 80.0, y: 80.0 },
        token_address: Some(bonk),
        token_ticker: Some("BONK".into()),
        last_seen_ticker: Some("BONK".into()),
        safety_report: Some(SafetyReport {
            score: 82,
            ticker: Some("BONK".into()),
            mint_authority_disabled: true,
            freeze_authority_disabled: true,
            jupiter_listed: true,
            top_holder_pct: 0.08,
            liquidity_usd: 4_200_000.0,
            rugcheck_ok: true,
            summary: "✓ Jupiter verified · mint auth disabled · high organic activity · organic 82/100".into(),
        }),
        token_price: Some(TokenPrice {
            price_usd: 0.000_021_4,
            change_24h_pct: 12.3,
            volume_24h_usd: 38_400_000.0,
            market_cap_usd: Some(1_430_000_000.0),
        }),
        quotes: vec![AdapterQuote {
            adapter_name: "Jupiter".into(),
            in_amount: 1_000_000_000,
            out_amount: 46_728_301,
            price_impact_pct: 0.02,
            slippage_bps: 50,
            fee_usd: 0.003,
            route_label: "Orca Whirlpool".into(),
        }],
        ai_narration: Some(
            "BONK is Solana's flagship meme coin. Up 12.3% today on strong volume.".into()
        ),
        ai_streaming: false,
        ai_mode: AiMode::Auto,
        settings_visible: false,
        detection_enabled: true,
        version: 1,
        ..Default::default()
    }
}
