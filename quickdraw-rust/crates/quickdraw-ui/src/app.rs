use std::sync::{Arc, Mutex, RwLock};
use std::sync::atomic::{AtomicBool, Ordering};
use egui::{Margin, Rounding, Stroke};
use tokio::sync::mpsc;

use quickdraw_core::{commands::Command, state::AppSnapshot};
use crate::design::{Colors, Tokens};
use crate::guide_overlay::{CursorAnimState, GuideAnimState, show_guide_cursor, show_guide_overlay};
use crate::panel::draw_panel_content;
use crate::wallet_ui::WalletUiState;
use crate::header;

/// Main window = settings panel (always visible on startup).
/// Token popup  = deferred viewport that appears near cursor on detection.
/// Swap popup   = second deferred viewport below the token popup, opens on BUY.
/// Guide overlay = fullscreen transparent viewport for AI-guided tutorials.
pub struct QuickdrawApp {
    snapshot:      Arc<RwLock<AppSnapshot>>,
    cmd_tx:        mpsc::Sender<Command>,
    demo_mode:     bool,
    wallet_ui:     WalletUiState,
    swap_open:     Arc<AtomicBool>,
    swap_anchored: Arc<AtomicBool>,
    guide_anim:    Arc<Mutex<GuideAnimState>>,
    cursor_anim:   Arc<Mutex<CursorAnimState>>,
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
            wallet_ui:     WalletUiState::default(),
            swap_open:     Arc::new(AtomicBool::new(false)),
            swap_anchored: Arc::new(AtomicBool::new(false)),
            guide_anim:    Arc::new(Mutex::new(GuideAnimState::default())),
            cursor_anim:   Arc::new(Mutex::new(CursorAnimState::new())),
        }
    }
}

impl eframe::App for QuickdrawApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        let snap = self.snapshot.read().unwrap().clone();

        ctx.request_repaint_after(std::time::Duration::from_secs(1));

        // Reset swap state when the token overlay is not visible
        if !snap.overlay_visible {
            self.swap_open.store(false, Ordering::Relaxed);
            self.swap_anchored.store(false, Ordering::Relaxed);
        }

        egui::CentralPanel::default()
            .frame(egui::Frame::none().fill(egui::Color32::from_rgb(0x18, 0x18, 0x18)))
            .show(ctx, |ui| {
                draw_panel_content(ui, &snap, &self.cmd_tx, &mut self.wallet_ui, ctx);
            });

        show_token_popup(ctx, &snap, self.snapshot.clone(), self.cmd_tx.clone(), self.demo_mode, self.swap_open.clone());
        show_swap_popup(ctx, &snap, self.snapshot.clone(), self.cmd_tx.clone(), self.swap_open.clone(), self.swap_anchored.clone());
        show_guide_overlay(ctx, &snap, self.snapshot.clone(), self.cmd_tx.clone(), self.guide_anim.clone());
        show_guide_cursor(ctx, &snap, self.snapshot.clone(), self.cursor_anim.clone());
    }
}

// ─────────────────────────── Token popup viewport ────────────────────────────

thread_local! {
    static SHOWN_AT: std::cell::Cell<Option<std::time::Instant>>
        = std::cell::Cell::new(None);
    static PREV_AI: std::cell::Cell<bool> = std::cell::Cell::new(false);
}

fn show_token_popup(
    ctx: &egui::Context,
    snap: &AppSnapshot,
    snapshot: Arc<RwLock<AppSnapshot>>,
    cmd_tx: mpsc::Sender<Command>,
    demo_mode: bool,
    swap_open: Arc<AtomicBool>,
) {
    if !snap.overlay_visible {
        // Reset the auto-dismiss timer whenever the overlay is hidden — covers
        // manual dismiss (Cancel / Escape / DismissOverlay) in addition to the
        // auto-dismiss path. Without this, re-opening after a manual dismiss
        // uses a stale timestamp and the popup disappears immediately.
        SHOWN_AT.with(|t| t.set(None));
        PREV_AI.with(|t| t.set(false));
        return;
    }

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

            if !snap.overlay_visible {
                ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                return;
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

            // Don't auto-dismiss while the user is interacting with the swap panel
            let swap_is_open = swap_open.load(Ordering::Relaxed);
            if !demo_mode && elapsed >= POPUP_DURATION && !swap_is_open {
                SHOWN_AT.with(|t| t.set(None));
                PREV_AI.with(|t| t.set(false));
                let _ = cmd_tx.try_send(Command::DismissOverlay);
                return;
            }

            if snap.ai_streaming {
                ctx.request_repaint_after(std::time::Duration::from_millis(80));
            } else {
                ctx.request_repaint_after(std::time::Duration::from_millis(500));
            }

            egui::CentralPanel::default()
                .frame(egui::Frame::none().fill(Colors::OVERLAY_BG))
                .show(ctx, |ui| {
                    show_popup(ui, &snap, &cmd_tx, elapsed, &swap_open);
                    if ctx.input(|i| i.key_pressed(egui::Key::Escape)) {
                        swap_open.store(false, Ordering::Relaxed);
                        let _ = cmd_tx.try_send(Command::DismissOverlay);
                    }
                });

            // Resize to actual content — eliminates blank space and clips nothing.
            let used_h = ctx.used_rect().height();
            if used_h > 10.0 {
                ctx.send_viewport_cmd(egui::ViewportCommand::InnerSize(
                    egui::vec2(Tokens::POPUP_WIDTH, used_h)
                ));
            }
        },
    );
}

// ─────────────────────────── Swap popup viewport ─────────────────────────────

fn show_swap_popup(
    ctx: &egui::Context,
    snap: &AppSnapshot,
    snapshot: Arc<RwLock<AppSnapshot>>,
    cmd_tx: mpsc::Sender<Command>,
    swap_open: Arc<AtomicBool>,
    swap_anchored: Arc<AtomicBool>,
) {
    if !swap_open.load(Ordering::Relaxed) {
        swap_anchored.store(false, Ordering::Relaxed);
        return;
    }

    if !snap.overlay_visible { return; }

    let swap_h = 220.0; // tight initial estimate; dynamic InnerSize corrects each frame

    // Set position only on the first open — after that the OS / user controls it
    let already_anchored = swap_anchored.swap(true, Ordering::Relaxed);
    let pos_x = snap.overlay_position.x + 20.0;
    let pos_y = snap.overlay_position.y + 10.0 + popup_height(&snap) + 6.0;

    let mut builder = egui::ViewportBuilder::default()
        .with_title("Quickdraw Swap")
        .with_inner_size([Tokens::POPUP_WIDTH, swap_h])
        .with_resizable(false)
        .with_decorations(false)
        .with_window_level(egui::WindowLevel::AlwaysOnTop);

    if !already_anchored {
        builder = builder.with_position([pos_x, pos_y]);
    }

    ctx.show_viewport_deferred(
        egui::ViewportId::from_hash_of("quickdraw_swap"),
        builder,
        move |ctx, _| {
            let snap = snapshot.read().unwrap().clone();

            if !snap.overlay_visible || !swap_open.load(Ordering::Relaxed) {
                ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                return;
            }

            ctx.request_repaint_after(std::time::Duration::from_millis(500));

            egui::CentralPanel::default()
                .frame(egui::Frame::none().fill(egui::Color32::from_rgb(0x0D, 0x0D, 0x0D)))
                .show(ctx, |ui| {
                    crate::swap_ui::show_swap_panel(ui, &snap, &cmd_tx);

                    // Thin divider
                    let w = ui.available_width();
                    let (line_rect, _) = ui.allocate_exact_size(
                        egui::vec2(w, 1.0), egui::Sense::hover()
                    );
                    ui.painter().hline(
                        line_rect.x_range(),
                        line_rect.center().y,
                        Stroke::new(1.0, egui::Color32::from_rgb(0x1e, 0x1e, 0x1e)),
                    );

                    // X CANCEL — 12px side margins to align with swap panel body content
                    egui::Frame::none()
                        .inner_margin(Margin { left: 12.0, right: 12.0, top: 0.0, bottom: 0.0 })
                        .show(ui, |ui| {
                            if ui.add_sized(
                                egui::vec2(ui.available_width(), 28.0),
                                egui::Button::new(
                                    egui::RichText::new("X  CANCEL")
                                        .size(10.0).strong().monospace()
                                        .color(egui::Color32::from_rgb(0x99, 0x99, 0x99))
                                )
                                .fill(egui::Color32::from_rgb(0x1a, 0x1a, 0x1a))
                                .stroke(Stroke::new(1.0, egui::Color32::from_rgb(0x33, 0x33, 0x33)))
                                .rounding(Rounding::ZERO),
                            ).clicked() {
                                swap_open.store(false, Ordering::Relaxed);
                            }
                        });

                    let r = ctx.screen_rect();
                    ui.painter().rect_stroke(r, 0.0, Stroke::new(2.0, egui::Color32::BLACK));
                });

            // Resize to actual content — eliminates blank space below X CANCEL.
            let used_h = ctx.used_rect().height();
            if used_h > 10.0 {
                ctx.send_viewport_cmd(egui::ViewportCommand::InnerSize(
                    egui::vec2(Tokens::POPUP_WIDTH, used_h)
                ));
            }
        },
    );
}

// ─────────────────────────── Popup layout helpers ────────────────────────────

const POPUP_DURATION: f32 = 12.0;
const BUY_BTN_H: f32     = 34.0;

fn popup_height(snap: &AppSnapshot) -> f32 {
    const HEADER_H: f32         = 54.0;
    const PRICE_H: f32          = 36.0;  // 8 top margin + ~18px label + 10 bottom margin
    const AI_PAD: f32           = 16.0;  // 6 top + 8 bottom + 2 buffer
    const LINE_H: f32           = 14.0;  // SpaceMono 11pt row height ≈ 13.5px
    const CHARS_PER_LINE: usize = 36;    // SpaceMono 11pt at 238px available ≈ 36 chars/line
    const EXTRA_PAD: f32        = 10.0;  // small safety buffer

    let content_h = if snap.safety_report.is_none() {
        Tokens::POPUP_H_LOADING
    } else if let Some(ref n) = snap.ai_narration {
        // Count per \n-segment: each segment may wrap independently.
        // This avoids double-counting char_lines + nl_lines.
        let lines: usize = n.split('\n')
            .map(|seg| ((seg.len() + CHARS_PER_LINE - 1) / CHARS_PER_LINE).max(1))
            .sum();
        (HEADER_H + PRICE_H + lines as f32 * LINE_H + AI_PAD).min(420.0)
    } else if snap.ai_streaming {
        HEADER_H + PRICE_H + LINE_H * 2.0 + AI_PAD
    } else {
        Tokens::POPUP_H_FULL
    };

    // BUY/CANCEL row matches the price row — both safety and price must be loaded
    let btn_h = if snap.safety_report.is_some() && snap.token_price.is_some() { 1.0 + BUY_BTN_H } else { 0.0 };
    content_h + btn_h + EXTRA_PAD
}

fn show_popup(
    ui: &mut egui::Ui,
    snap: &AppSnapshot,
    cmd_tx: &mpsc::Sender<Command>,
    _elapsed: f32,
    swap_open: &Arc<AtomicBool>,
) {
    let loading      = snap.safety_report.is_none();
    let score        = snap.safety_report.as_ref().map(|r| r.score).unwrap_or(0);
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
            // Drag zone — same Wayland serial fix as swap panel: check pointer
            // position directly on the press frame, don't wait for drag threshold.
            let drag_rect = egui::Rect::from_min_size(
                ui.cursor().min,
                egui::vec2(Tokens::POPUP_WIDTH * 0.70, 65.0),
            );
            let in_zone = ui.input(|i| {
                i.pointer.hover_pos().map_or(false, |p| drag_rect.contains(p))
            });
            let just_pressed = ui.input(|i| i.pointer.primary_pressed());
            let dr = ui.interact(drag_rect, egui::Id::new("popup_drag"), egui::Sense::drag());
            if (in_zone && just_pressed) || dr.drag_started() {
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
                        let up    = price.change_24h_pct >= 0.0;
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

    // ── BUY / CANCEL row — same condition as price row ───────────────────────
    if snap.safety_report.is_some() && snap.token_price.is_some() {
        let buy_color  = Colors::safety_color(score);
        let text_color = if score < 50 { egui::Color32::WHITE } else { egui::Color32::BLACK };
        let w = ui.available_width();

        // 1px dark divider (no egui spacing overhead)
        let (line_rect, _) = ui.allocate_exact_size(egui::vec2(w, 1.0), egui::Sense::hover());
        ui.painter().hline(
            line_rect.x_range(),
            line_rect.center().y,
            Stroke::new(1.0, egui::Color32::from_rgb(0x1e, 0x1e, 0x1e)),
        );

        ui.horizontal(|ui| {
            ui.spacing_mut().item_spacing.x = 0.0;
            let half = w / 2.0;

            let buy_resp = ui.add_sized(
                egui::vec2(half, BUY_BTN_H),
                egui::Button::new(
                    egui::RichText::new("BUY").size(11.0).strong().monospace().color(text_color)
                )
                .fill(buy_color)
                .stroke(Stroke::NONE)
                .rounding(Rounding::ZERO),
            );
            let cancel_resp = ui.add_sized(
                egui::vec2(half, BUY_BTN_H),
                egui::Button::new(
                    egui::RichText::new("CANCEL").size(11.0).strong().monospace()
                        .color(egui::Color32::from_rgb(0x99, 0x99, 0x99))
                )
                .fill(egui::Color32::from_rgb(0x28, 0x28, 0x28))
                .stroke(Stroke::new(1.0, egui::Color32::from_rgb(0x44, 0x44, 0x44)))
                .rounding(Rounding::ZERO),
            );

            if buy_resp.clicked() {
                swap_open.store(true, Ordering::Relaxed);
            }
            if cancel_resp.clicked() {
                let _ = cmd_tx.try_send(Command::DismissOverlay);
            }
        });
    }

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
    // Phosphor icon font — renders crisp at small sizes unlike capital letters
    egui_phosphor::add_to_fonts(&mut fonts, egui_phosphor::Variant::Regular);
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
            score: 82, ticker: Some("BONK".into()), decimals: 5,
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
            adapter_name: "Jupiter".into(),
            token_in:  solana_sdk::pubkey::Pubkey::from_str("So11111111111111111111111111111111111111112").unwrap_or_default(),
            token_out: bonk,
            in_amount: 1_000_000_000, out_amount: 46_728_301,
            price_impact_pct: 0.02, slippage_bps: 50, fee_usd: 0.003,
            route_label: "Orca Whirlpool".into(),
            raw_response: String::new(),
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
