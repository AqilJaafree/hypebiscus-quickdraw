use std::sync::{Arc, RwLock};
use std::time::Instant;
use egui::{Margin, RichText, ViewportBuilder, ViewportId};
use tokio::sync::mpsc;

use quickdraw_core::{commands::Command, state::{AiMode, AppSnapshot}};
use crate::design::{Colors, Tokens};

/// Public entry point for rendering panel content into any Ui
/// (used by the main window which IS the settings panel).
pub fn draw_panel_content(ui: &mut egui::Ui, snap: &AppSnapshot, cmd_tx: &mpsc::Sender<Command>) {
    let session_label = session_label();
    draw_panel(ui, snap, cmd_tx, &session_label);
}

const DARK_BG:     egui::Color32 = egui::Color32::from_rgb(0x18, 0x18, 0x18);
const HEADER_DARK: egui::Color32 = egui::Color32::from_rgb(0x11, 0x11, 0x11);
const SEP:         egui::Color32 = egui::Color32::from_rgb(0x2E, 0x2E, 0x2E);

/// Show the settings panel as a separate always-on-top OS window.
/// Position is locked on first open — does not chase the popup when it moves.
pub fn show_settings_panel(
    ctx: &egui::Context,
    snapshot: Arc<RwLock<AppSnapshot>>,
    cmd_tx: &mpsc::Sender<Command>,
) {
    let visible = snapshot.read().unwrap().settings_visible;

    // Clear stored position so next open re-anchors to popup
    thread_local! {
        static LOCKED_POS: std::cell::Cell<Option<(f32, f32)>> = std::cell::Cell::new(None);
    }
    if !visible {
        LOCKED_POS.with(|p| p.set(None));
        return;
    }

    // On first open: anchor next to the popup. Every frame after: reuse locked pos.
    let (panel_x, panel_y) = LOCKED_POS.with(|p| {
        if let Some(pos) = p.get() {
            pos
        } else {
            let outer = ctx.input(|i| i.viewport().outer_rect);
            let pos = match outer {
                Some(r) if r.min.x > 0.0 => (r.max.x + 8.0, r.min.y),
                _ => (500.0, 100.0),
            };
            p.set(Some(pos));
            pos
        }
    });

    let builder = ViewportBuilder::default()
        .with_title("Quickdraw Settings")
        .with_inner_size([Tokens::PANEL_WIDTH, Tokens::PANEL_HEIGHT])
        .with_resizable(false)
        .with_decorations(false)
        .with_position([panel_x, panel_y])
        .with_window_level(egui::WindowLevel::AlwaysOnTop);

    let cmd_tx = cmd_tx.clone();

    ctx.show_viewport_deferred(
        ViewportId::from_hash_of("quickdraw_settings"),
        builder,
        move |ctx, _| {
            let snap = snapshot.read().unwrap().clone();

            if !snap.settings_visible {
                ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                return;
            }

            if ctx.input(|i| i.key_pressed(egui::Key::Escape)) {
                let _ = cmd_tx.try_send(Command::ToggleSettings);
            }

            let session_label = session_label();
            egui::CentralPanel::default()
                .frame(egui::Frame::none()
                    .fill(DARK_BG)
                    .stroke(egui::Stroke::new(2.0, egui::Color32::BLACK)))
                .show(ctx, |ui| {
                    draw_panel(ui, &snap, &cmd_tx, &session_label);
                });
        },
    );
}

fn draw_panel(
    ui: &mut egui::Ui,
    snap: &AppSnapshot,
    cmd_tx: &mpsc::Sender<Command>,
    session_label: &str,
) {
    // Drag zone (left 75%, registered before header so X button keeps priority)
    let drag_rect = egui::Rect::from_min_size(
        ui.cursor().min,
        egui::vec2(Tokens::PANEL_WIDTH * 0.75, 36.0),
    );
    if ui.interact(drag_rect, egui::Id::new("panel_drag"), egui::Sense::drag()).drag_started() {
        ui.ctx().send_viewport_cmd(egui::ViewportCommand::StartDrag);
    }

    // ── Header ────────────────────────────────────────────────────────────────
    egui::Frame::none()
        .fill(HEADER_DARK)
        .inner_margin(Margin { left: 12.0, right: 10.0, top: 9.0, bottom: 9.0 })
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label(
                    RichText::new("QUICKDRAW")
                        .size(12.0).strong().monospace()
                        .color(Colors::ACCENT_YELLOW),
                );
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui.add(
                        egui::Button::new(RichText::new("X").size(13.0)
                            .color(egui::Color32::from_rgb(0x55, 0x55, 0x55)))
                            .fill(egui::Color32::TRANSPARENT)
                            .stroke(egui::Stroke::NONE)
                    ).clicked() {
                        let _ = cmd_tx.try_send(Command::ToggleSettings);
                    }
                });
            });
        });

    let w = ui.available_width();
    let (sep, _) = ui.allocate_exact_size(egui::vec2(w, 2.0), egui::Sense::hover());
    ui.painter().rect_filled(sep, 0.0, egui::Color32::BLACK);

    // ── Tabs ──────────────────────────────────────────────────────────────────
    thread_local! {
        static ACTIVE_TAB: std::cell::Cell<u8> = std::cell::Cell::new(0);
    }
    let active = ACTIVE_TAB.with(|t| t.get());

    ui.horizontal(|ui| {
        for (i, label) in ["State", "Skills"].iter().enumerate() {
            let is_active = active == i as u8;
            let fill      = if is_active { egui::Color32::from_rgb(0x2A, 0x2A, 0x2A) } else { DARK_BG };
            let text_col  = if is_active { egui::Color32::WHITE } else { egui::Color32::from_rgb(0x55, 0x55, 0x55) };
            let btn = egui::Button::new(
                RichText::new(*label).size(10.0).strong().monospace().color(text_col)
            )
            .fill(fill)
            .stroke(egui::Stroke::NONE)
            .rounding(egui::Rounding::ZERO)
            .min_size(egui::vec2(Tokens::PANEL_WIDTH / 2.0, 30.0));

            if ui.add(btn).clicked() && !is_active {
                ACTIVE_TAB.with(|t| t.set(i as u8));
            }

            if is_active {
                let r = ui.min_rect();
                let line = egui::Rect::from_min_size(
                    egui::pos2(r.min.x, r.max.y - 2.0),
                    egui::vec2(Tokens::PANEL_WIDTH / 2.0, 2.0),
                );
                ui.painter().rect_filled(line, 0.0, Colors::ACCENT_YELLOW);
            }
        }
    });

    let (sep2, _) = ui.allocate_exact_size(egui::vec2(ui.available_width(), 1.0), egui::Sense::hover());
    ui.painter().rect_filled(sep2, 0.0, egui::Color32::from_rgb(0x2E, 0x2E, 0x2E));

    // ── Tab content (scrollable) ───────────────────────────────────────────────
    egui::ScrollArea::vertical()
        .id_source("panel_scroll")
        .auto_shrink([false, false])
        .show(ui, |ui| {
            egui::Frame::none()
                .fill(DARK_BG)
                .inner_margin(Margin::symmetric(12.0, 12.0))
                .show(ui, |ui| {
                    match active {
                        0 => draw_state_tab(ui, snap, cmd_tx, session_label),
                        _ => draw_skills_tab(ui),
                    }
                });

            let (fsep, _) = ui.allocate_exact_size(egui::vec2(ui.available_width(), 1.0), egui::Sense::hover());
            ui.painter().rect_filled(fsep, 0.0, SEP);
            egui::Frame::none()
                .fill(DARK_BG)
                .inner_margin(Margin { left: 12.0, right: 10.0, top: 6.0, bottom: 6.0 })
                .show(ui, |ui| {
                    ui.label(RichText::new("v0.1.0").size(10.0).monospace()
                        .color(egui::Color32::from_rgb(0x33, 0x33, 0x33)));
                });
        });
}

// ── State Tab ────────────────────────────────────────────────────────────────

fn draw_state_tab(ui: &mut egui::Ui, snap: &AppSnapshot, cmd_tx: &mpsc::Sender<Command>, session_label: &str) {
    ui.horizontal(|ui| {
        let (dot_rect, _) = ui.allocate_exact_size(egui::vec2(14.0, 14.0), egui::Sense::hover());
        let dot_color = if snap.detection_enabled { Colors::SAFE } else { egui::Color32::from_rgb(0x55, 0x55, 0x55) };
        ui.painter().circle_filled(dot_rect.center(), 4.0, dot_color);
        ui.label(
            RichText::new(if snap.detection_enabled { "ACTIVE" } else { "PAUSED" })
                .size(13.0).strong().monospace()
                .color(if snap.detection_enabled { egui::Color32::WHITE } else { egui::Color32::from_rgb(0x66, 0x66, 0x66) }),
        );
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            let (lbl, fill) = if snap.detection_enabled { ("Pause", egui::Color32::from_rgb(0x22, 0x22, 0x22)) } else { ("Resume", Colors::SAFE) };
            let tcol = if snap.detection_enabled { egui::Color32::from_rgb(0x88, 0x88, 0x88) } else { egui::Color32::BLACK };
            if ui.add(
                egui::Button::new(RichText::new(lbl).size(11.0).monospace().color(tcol))
                    .fill(fill).stroke(egui::Stroke::new(1.5, egui::Color32::from_rgb(0x44, 0x44, 0x33)))
                    .rounding(egui::Rounding::ZERO)
            ).clicked() {
                let _ = cmd_tx.try_send(Command::ToggleDetection);
            }
        });
    });

    ui.add_space(10.0);
    hsep(ui);
    ui.add_space(8.0);

    slabel(ui, "STATS");
    srow(ui, "Last seen", snap.last_seen_ticker.as_deref().unwrap_or("—"));
    srow(ui, "Session",   session_label);
    ui.add_space(10.0);

    slabel(ui, "AI MODE");
    ui.horizontal(|ui| {
        for mode in [AiMode::Auto, AiMode::Online, AiMode::Offline] {
            let label = match mode { AiMode::Auto => "Auto", AiMode::Online => "Cloud", AiMode::Offline => "Local" };
            let is_active = snap.ai_mode == mode;
            let (fill, tcol, border) = if is_active {
                (Colors::ACCENT_YELLOW, egui::Color32::BLACK, egui::Color32::BLACK)
            } else {
                (egui::Color32::from_rgb(0x28, 0x28, 0x28), egui::Color32::from_rgb(0x66, 0x66, 0x66), egui::Color32::from_rgb(0x44, 0x44, 0x44))
            };
            if ui.add(
                egui::Button::new(RichText::new(label).size(10.0).monospace().color(tcol))
                    .fill(fill).stroke(egui::Stroke::new(1.5, border))
                    .rounding(egui::Rounding::ZERO)
            ).clicked() && !is_active {
                let _ = cmd_tx.try_send(Command::SetAiMode(mode));
            }
        }
    });
    ui.add_space(10.0);

    slabel(ui, "LOGIN");
    if let Some(wallet) = snap.wallet_pubkey {
        let s = wallet.to_string();
        let short = format!("{}…{}", &s[..6], &s[s.len()-4..]);
        egui::Frame::none()
            .fill(egui::Color32::from_rgb(0x1A, 0x1A, 0x1A))
            .stroke(egui::Stroke::new(1.5, egui::Color32::from_rgb(0x44, 0x44, 0x44)))
            .inner_margin(Margin::symmetric(8.0, 5.0))
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.label(RichText::new(&short).size(10.0).monospace().color(egui::Color32::from_rgb(0xAA, 0xAA, 0xAA)));
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui.add(
                            egui::Button::new(RichText::new("Disconnect").size(10.0).monospace().color(Colors::DANGER))
                                .fill(egui::Color32::TRANSPARENT).stroke(egui::Stroke::NONE)
                        ).clicked() {
                            let _ = cmd_tx.try_send(Command::DisconnectWallet);
                        }
                    });
                });
            });
    } else {
        if ui.add(
            egui::Button::new(RichText::new("Connect Wallet").size(11.0).monospace().color(egui::Color32::BLACK))
                .fill(Colors::ACCENT_YELLOW)
                .stroke(egui::Stroke::new(1.5, egui::Color32::BLACK))
                .rounding(egui::Rounding::ZERO)
                .min_size(egui::vec2(ui.available_width(), 30.0))
        ).clicked() {
            let _ = cmd_tx.try_send(Command::ConnectWallet);
        }
    }
}

// ── Skills Tab ───────────────────────────────────────────────────────────────

fn draw_skills_tab(ui: &mut egui::Ui) {
    let skills = [
        ("Jupiter Swap",   "DEX",     true),
        ("Drift Protocol", "PERPS",   false),
        ("MarginFi Lend",  "LENDING", false),
        ("Kamino Earn",    "YIELD",   false),
    ];

    for (name, tag, active) in &skills {
        ui.horizontal(|ui| {
            ui.vertical(|ui| {
                ui.horizontal(|ui| {
                    ui.label(RichText::new(*name).size(12.0).strong().monospace().color(egui::Color32::WHITE));
                    egui::Frame::none()
                        .fill(egui::Color32::from_rgb(0x22, 0x22, 0x22))
                        .stroke(egui::Stroke::new(1.0, egui::Color32::from_rgb(0x44, 0x44, 0x44)))
                        .inner_margin(Margin { left: 4.0, right: 4.0, top: 1.0, bottom: 1.0 })
                        .show(ui, |ui| {
                            ui.label(RichText::new(*tag).size(9.0).strong().monospace().color(Colors::ACCENT_YELLOW));
                        });
                });
            });
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                let fill = if *active { Colors::SAFE } else { egui::Color32::from_rgb(0x33, 0x33, 0x33) };
                let (r, _) = ui.allocate_exact_size(egui::vec2(28.0, 14.0), egui::Sense::click());
                ui.painter().rect_filled(r, 0.0, fill);
                ui.painter().rect_stroke(r, 0.0, egui::Stroke::new(1.5, egui::Color32::from_rgb(0x55, 0x55, 0x55)));
                let dot_x = if *active { r.right() - 7.0 } else { r.left() + 7.0 };
                ui.painter().circle_filled(
                    egui::pos2(dot_x, r.center().y), 4.5,
                    if *active { egui::Color32::BLACK } else { egui::Color32::from_rgb(0x66, 0x66, 0x66) },
                );
            });
        });
        let (sep, _) = ui.allocate_exact_size(egui::vec2(ui.available_width(), 1.0), egui::Sense::hover());
        ui.painter().rect_filled(sep, 0.0, egui::Color32::from_rgb(0x2E, 0x2E, 0x2E));
        ui.add_space(4.0);
    }

    ui.add_space(6.0);
    ui.add(
        egui::Button::new(RichText::new("+ Browse plugins").size(10.0).monospace()
            .color(egui::Color32::from_rgb(0x55, 0x55, 0x55)))
            .fill(egui::Color32::TRANSPARENT)
            .stroke(egui::Stroke::new(1.5, egui::Color32::from_rgb(0x44, 0x44, 0x44)))
            .rounding(egui::Rounding::ZERO)
            .min_size(egui::vec2(ui.available_width(), 28.0)),
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn slabel(ui: &mut egui::Ui, text: &str) {
    ui.label(RichText::new(text).size(10.0).strong().monospace().color(egui::Color32::from_rgb(0x66, 0x66, 0x66)));
    ui.add_space(4.0);
}

fn srow(ui: &mut egui::Ui, label: &str, value: &str) {
    ui.horizontal(|ui| {
        ui.label(RichText::new(label).size(10.0).monospace().color(egui::Color32::from_rgb(0x66, 0x66, 0x66)));
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            ui.label(RichText::new(value).size(11.0).strong().monospace().color(egui::Color32::WHITE));
        });
    });
    let (sep, _) = ui.allocate_exact_size(egui::vec2(ui.available_width(), 1.0), egui::Sense::hover());
    ui.painter().rect_filled(sep, 0.0, egui::Color32::from_rgb(0x2A, 0x2A, 0x2A));
    ui.add_space(3.0);
}

fn hsep(ui: &mut egui::Ui) {
    let (sep, _) = ui.allocate_exact_size(egui::vec2(ui.available_width(), 1.0), egui::Sense::hover());
    ui.painter().rect_filled(sep, 0.0, SEP);
}

fn session_label() -> String {
    use std::sync::OnceLock;
    static START: OnceLock<Instant> = OnceLock::new();
    let start = START.get_or_init(Instant::now);
    let secs = start.elapsed().as_secs();
    if secs < 60        { format!("{}s", secs) }
    else if secs < 3600 { format!("{}m {}s", secs / 60, secs % 60) }
    else                { format!("{}h {}m", secs / 3600, (secs % 3600) / 60) }
}
