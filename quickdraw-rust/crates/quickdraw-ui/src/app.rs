use std::sync::{Arc, RwLock};
use egui::{Margin, Rounding, Stroke};
use tokio::sync::mpsc;

use quickdraw_core::{commands::Command, state::AppSnapshot};
use crate::design::{Colors, Tokens};
use crate::panel::draw_panel_content;
use crate::wallet_ui::WalletUiState;
use crate::header;

/// Main window = settings panel (always visible on startup).
/// Token popup = deferred viewport that appears near cursor on detection.
pub struct QuickdrawApp {
    snapshot:   Arc<RwLock<AppSnapshot>>,
    cmd_tx:     mpsc::Sender<Command>,
    demo_mode:  bool,
    wallet_ui:  WalletUiState,
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
        Self { snapshot, cmd_tx, demo_mode, wallet_ui: WalletUiState::default() }
    }
}

impl eframe::App for QuickdrawApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        let snap = self.snapshot.read().unwrap().clone();

        // Main window always repaints (session timer ticks)
        ctx.request_repaint_after(std::time::Duration::from_secs(1));

        // ── Settings panel — main window content ─────────────────────────────
        egui::CentralPanel::default()
            .frame(egui::Frame::none().fill(egui::Color32::from_rgb(0x18, 0x18, 0x18)))
            .show(ctx, |ui| {
                draw_panel_content(ui, &snap, &self.cmd_tx, &mut self.wallet_ui, ctx);
            });

        // ── Token popup — deferred viewport, positioned at cursor ─────────────
        show_token_popup(ctx, self.snapshot.clone(), self.cmd_tx.clone(), self.demo_mode);
    }
}

// ─────────────────────────── Token popup viewport ────────────────────────────

fn show_token_popup(
    ctx: &egui::Context,
    snapshot: Arc<RwLock<AppSnapshot>>,
    cmd_tx: mpsc::Sender<Command>,
    demo_mode: bool,
) {
    let snap = snapshot.read().unwrap().clone();
    if !snap.overlay_visible { return; }

    let pos_x = snap.overlay_position.x + 20.0;
    let pos_y = snap.overlay_position.y + 10.0;
    let h     = popup_height(&snap);

    let builder = egui::ViewportBuilder::default()
        .with_title("Quickdraw Popup")
        .with_inner_size([Tokens::POPUP_WIDTH, h])
        .with_resizable(false)
        .with_decorations(false)
        .with_position([pos_x, pos_y])
        .with_window_level(egui::WindowLevel::AlwaysOnTop);

    ctx.show_viewport_deferred(
        egui::ViewportId::from_hash_of("quickdraw_popup"),
        builder,
        move |ctx, _| {
            let snap = snapshot.read().unwrap().clone();

            // Close when dismissed
            if !snap.overlay_visible {
                ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                return;
            }

            // Resize as data arrives
            ctx.send_viewport_cmd(egui::ViewportCommand::InnerSize(
                egui::vec2(Tokens::POPUP_WIDTH, popup_height(&snap))
            ));

            // Auto-dismiss timer (reset when AI narration arrives)
            thread_local! {
                static SHOWN_AT: std::cell::Cell<Option<std::time::Instant>>
                    = std::cell::Cell::new(None);
                static PREV_AI: std::cell::Cell<bool> = std::cell::Cell::new(false);
            }

            if SHOWN_AT.with(|t| t.get()).is_none() {
                SHOWN_AT.with(|t| t.set(Some(std::time::Instant::now())));
            }
            let has_ai = snap.ai_narration.is_some();
            let prev_ai = PREV_AI.with(|t| t.get());
            if has_ai && !prev_ai {
                SHOWN_AT.with(|t| t.set(Some(std::time::Instant::now())));
            }
            PREV_AI.with(|t| t.set(has_ai));

            let elapsed = SHOWN_AT.with(|t| {
                t.get().map(|i| i.elapsed().as_secs_f32()).unwrap_or(0.0)
            });

            if !demo_mode && elapsed >= 12.0 {
                // Reset timer state for next popup
                SHOWN_AT.with(|t| t.set(None));
                PREV_AI.with(|t| t.set(false));
                let _ = cmd_tx.try_send(Command::DismissOverlay);
                return;
            }

            ctx.request_repaint_after(std::time::Duration::from_millis(80));

            egui::CentralPanel::default()
                .frame(egui::Frame::none().fill(Colors::OVERLAY_BG))
                .show(ctx, |ui| {
                    show_popup(ui, &snap, &cmd_tx);
                    if ctx.input(|i| i.key_pressed(egui::Key::Escape)) {
                        let _ = cmd_tx.try_send(Command::DismissOverlay);
                    }
                });
        },
    );
}

fn popup_height(snap: &AppSnapshot) -> f32 {
    const HEADER_H: f32      = 54.0;
    const PRICE_H: f32       = 46.0;
    const AI_PAD: f32        = 14.0;
    const LINE_H: f32        = 16.0;
    const CHARS_PER_LINE: usize = 33;

    if snap.safety_report.is_none() { return Tokens::POPUP_H_LOADING; }

    if let Some(ref n) = snap.ai_narration {
        let lines = ((n.len() + CHARS_PER_LINE - 1) / CHARS_PER_LINE).max(1) as f32;
        (HEADER_H + PRICE_H + lines * LINE_H + AI_PAD).min(320.0)
    } else if snap.ai_streaming {
        HEADER_H + PRICE_H + LINE_H + AI_PAD
    } else {
        Tokens::POPUP_H_FULL
    }
}

fn show_popup(ui: &mut egui::Ui, snap: &AppSnapshot, cmd_tx: &mpsc::Sender<Command>) {
    let loading = snap.safety_report.is_none();
    let score   = snap.safety_report.as_ref().map(|r| r.score).unwrap_or(0);
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
            // Drag zone (left 70%, registered before buttons for correct priority)
            let drag_rect = egui::Rect::from_min_size(
                ui.cursor().min,
                egui::vec2(Tokens::POPUP_WIDTH * 0.70, 65.0),
            );
            if ui.interact(drag_rect, egui::Id::new("popup_drag"), egui::Sense::drag()).drag_started() {
                ui.ctx().send_viewport_cmd(egui::ViewportCommand::StartDrag);
            }

            header::render_header(ui, loading, score, ticker, header_color, cmd_tx);

            // Price row
            egui::Frame::none()
                .fill(Colors::OVERLAY_BG)
                .inner_margin(Margin { left: 12.0, right: 10.0, top: 8.0, bottom: 10.0 })
                .show(ui, |ui| {
                    if loading {
                        ui.label(egui::RichText::new("Fetching…").size(12.0).monospace().color(egui::Color32::WHITE));
                    } else if let Some(price) = &snap.token_price {
                        let up = price.change_24h_pct >= 0.0;
                        let arrow = if up { "▲" } else { "▼" };
                        let ccol  = if up { Colors::SAFE } else { Colors::DANGER };
                        ui.horizontal(|ui| {
                            ui.label(egui::RichText::new(format_price(price.price_usd)).size(13.0).strong().monospace().color(egui::Color32::WHITE));
                            ui.label(egui::RichText::new(format!("{} {:.1}%", arrow, price.change_24h_pct.abs())).size(12.0).strong().monospace().color(ccol));
                        });
                    } else {
                        ui.label(egui::RichText::new("Fetching…").size(12.0).monospace().color(egui::Color32::WHITE));
                    }
                });

            // AI narration row
            if snap.ai_streaming {
                egui::Frame::none()
                    .fill(egui::Color32::from_rgb(0x22, 0x22, 0x22))
                    .inner_margin(Margin { left: 12.0, right: 10.0, top: 6.0, bottom: 8.0 })
                    .show(ui, |ui| {
                        ui.label(egui::RichText::new("AI analyzing…").size(11.0).italics().color(egui::Color32::from_rgb(0x88, 0x88, 0x88)));
                    });
            } else if let Some(narration) = &snap.ai_narration {
                egui::Frame::none()
                    .fill(egui::Color32::from_rgb(0x22, 0x22, 0x22))
                    .inner_margin(Margin { left: 12.0, right: 10.0, top: 6.0, bottom: 8.0 })
                    .show(ui, |ui| {
                        ui.set_max_width(Tokens::POPUP_WIDTH - 22.0);
                        ui.label(egui::RichText::new(narration).size(11.0).color(egui::Color32::from_rgb(0xCC, 0xCC, 0xCC)));
                    });
            }
        });

    let r = ui.ctx().screen_rect();
    ui.painter().rect_stroke(r, 0.0, egui::Stroke::new(2.0, egui::Color32::BLACK));
}

fn format_price(p: f64) -> String {
    if p >= 1.0        { format!("${:.2}", p) }
    else if p >= 0.01  { format!("${:.4}", p) }
    else if p >= 0.001 { format!("${:.5}", p) }
    else               { format!("${:.6}", p) }
}

// ─────────────────────────── Theme & Fonts ───────────────────────────────────

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
        offset: Tokens::SHADOW_OFFSET, blur: 0.0, spread: 0.0, color: Colors::SHADOW,
    };
    visuals.popup_shadow = visuals.window_shadow;
    ctx.set_visuals(visuals);
}

fn load_fonts(ctx: &egui::Context) {
    let mut fonts = egui::FontDefinitions::default();
    fonts.font_data.insert("SpaceMono".into(),
        egui::FontData::from_static(include_bytes!("../../../assets/SpaceMono-Regular.ttf")).into());
    fonts.font_data.insert("SpaceMonoBold".into(),
        egui::FontData::from_static(include_bytes!("../../../assets/SpaceMono-Bold.ttf")).into());
    fonts.families.entry(egui::FontFamily::Proportional).or_default().insert(0, "SpaceMonoBold".into());
    fonts.families.entry(egui::FontFamily::Monospace).or_default().insert(0, "SpaceMono".into());
    ctx.set_fonts(fonts);
}

// ─────────────────────────── Demo snapshot ───────────────────────────────────

pub fn demo_snapshot() -> AppSnapshot {
    use quickdraw_core::types::{AdapterQuote, SafetyReport, TokenPrice};
    use quickdraw_core::state::AiMode;
    use solana_sdk::pubkey::Pubkey;
    use std::str::FromStr;

    let bonk = Pubkey::from_str("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263").unwrap_or_default();
    AppSnapshot {
        overlay_visible: true,
        overlay_position: quickdraw_core::types::Point { x: 500.0, y: 200.0 },
        token_address: Some(bonk),
        token_ticker: Some("BONK".into()),
        last_seen_ticker: Some("BONK".into()),
        safety_report: Some(SafetyReport {
            score: 82, ticker: Some("BONK".into()),
            mint_authority_disabled: true, freeze_authority_disabled: true,
            jupiter_listed: true, top_holder_pct: 0.08, liquidity_usd: 4_200_000.0,
            rugcheck_ok: true,
            summary: "✓ Jupiter verified · mint auth disabled · high organic activity · organic 82/100".into(),
        }),
        token_price: Some(TokenPrice {
            price_usd: 0.000_021_4, change_24h_pct: 12.3,
            volume_24h_usd: 38_400_000.0, market_cap_usd: Some(1_430_000_000.0),
        }),
        quotes: vec![AdapterQuote {
            adapter_name: "Jupiter".into(), in_amount: 1_000_000_000, out_amount: 46_728_301,
            price_impact_pct: 0.02, slippage_bps: 50, fee_usd: 0.003, route_label: "Orca Whirlpool".into(),
        }],
        ai_narration: Some("BONK is Solana's flagship meme coin. Up 12.3% today on strong volume.".into()),
        ai_streaming: false,
        ai_mode: AiMode::Auto,
        settings_visible: true,
        detection_enabled: true,
        version: 1,
        ..Default::default()
    }
}
