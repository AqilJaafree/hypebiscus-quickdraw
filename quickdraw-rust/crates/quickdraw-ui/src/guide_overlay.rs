/// Guide overlay: compact floating window that positions itself near each step's target.
///
/// Avoids fullscreen transparency (GL backend on X11 does not support it).
/// Instead, a small 320×180 dark window appears near the target coordinate,
/// showing the step text, step counter, and a direction arrow.
/// Voice navigation: "next" / "back" / "done" (or Escape to dismiss).

use std::sync::{Arc, Mutex, RwLock};
use egui::{Color32, Margin, Pos2, Rounding, Stroke, Vec2};
use tokio::sync::mpsc;

use quickdraw_core::{commands::Command, state::AppSnapshot};
use crate::design::Colors;

const W: f32 = 320.0;
const H: f32 = 190.0;
const DOT: f32 = 52.0; // cursor dot window size

/// Animation state — tracks which step was last rendered so the text window
/// moves on step changes without thrashing on every frame.
#[derive(Clone)]
pub struct GuideAnimState {
    pub last_step:    usize,
    pub last_version: u64,
    pub pulse_t:      f32,
}

impl Default for GuideAnimState {
    fn default() -> Self {
        Self { last_step: usize::MAX, last_version: 0, pulse_t: 0.0 }
    }
}

/// Tracks step changes for the cursor-dot viewport independently of the text overlay.
#[derive(Clone, Default)]
pub struct CursorAnimState {
    pub last_step:    usize,
    pub last_version: u64,
}

impl CursorAnimState {
    pub fn new() -> Self { Self { last_step: usize::MAX, last_version: 0 } }
}

/// Call from `QuickdrawApp::update` — creates/destroys the overlay viewport as needed.
pub fn show_guide_overlay(
    ctx: &egui::Context,
    snap: &AppSnapshot,
    snapshot: Arc<RwLock<AppSnapshot>>,
    cmd_tx: mpsc::Sender<Command>,
    anim: Arc<Mutex<GuideAnimState>>,
) {
    if !snap.guide_active && !snap.guide_fetching {
        return;
    }

    // Capture the main window's screen rect for absolute desktop positioning.
    // Inside the deferred viewport callback, ctx.screen_rect() returns the
    // overlay's own 320×190 rect — useless for OuterPosition (absolute coords).
    let desktop_rect = ctx.screen_rect();
    let pos = compute_window_pos(snap, desktop_rect);

    let builder = egui::ViewportBuilder::default()
        .with_title("Quickdraw Guide")
        .with_inner_size([W, H])
        .with_position([pos.x, pos.y])
        .with_decorations(false)
        .with_window_level(egui::WindowLevel::AlwaysOnTop)
        .with_resizable(false);

    ctx.show_viewport_deferred(
        egui::ViewportId::from_hash_of("quickdraw_guide"),
        builder,
        move |ctx, _| {
            let snap = snapshot.read().unwrap().clone();

            if !snap.guide_active && !snap.guide_fetching {
                ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                return;
            }

            // Reposition using the desktop rect captured from the outer (main window) context,
            // not ctx.screen_rect() which here is just the 320×190 overlay viewport.
            {
                let mut a = anim.lock().unwrap();
                if snap.guide_step_index != a.last_step || snap.version != a.last_version {
                    a.last_step    = snap.guide_step_index;
                    a.last_version = snap.version;
                    let new_pos = compute_window_pos(&snap, desktop_rect);
                    ctx.send_viewport_cmd(egui::ViewportCommand::OuterPosition(new_pos));
                }
            }

            // Repaint at ~30 fps for the pulse animation.
            ctx.request_repaint_after(std::time::Duration::from_millis(33));

            egui::CentralPanel::default()
                .frame(egui::Frame::none().fill(Color32::from_rgb(0x11, 0x11, 0x11)))
                .show(ctx, |ui| {
                    // Outer border
                    let rect = ctx.screen_rect();
                    ui.painter().rect_stroke(rect, Rounding::ZERO, Stroke::new(2.0, Color32::BLACK));

                    if snap.guide_fetching {
                        draw_loading(ui);
                        return;
                    }

                    let Some(step) = snap.guide_steps.get(snap.guide_step_index) else { return };
                    let total   = snap.guide_steps.len();
                    let current = snap.guide_step_index + 1;

                    draw_guide_content(ui, &step.text, current, total, step.label.as_deref(), &cmd_tx);

                    if ctx.input(|i| i.key_pressed(egui::Key::Escape)) {
                        let _ = cmd_tx.try_send(Command::GuideDismiss);
                    }
                });
        },
    );
}

// ─────────────────────────── Cursor dot viewport ─────────────────────────────

/// Small pulsing dot window that sits exactly on the step's target coordinate.
/// Uses mouse-passthrough so clicks fall through to the underlying UI element.
pub fn show_guide_cursor(
    ctx: &egui::Context,
    snap: &AppSnapshot,
    snapshot: Arc<RwLock<AppSnapshot>>,
    anim: Arc<Mutex<CursorAnimState>>,
) {
    if !snap.guide_active { return; }

    // Only show when the current step has a target point.
    let Some((tx, ty)) = snap.guide_steps.get(snap.guide_step_index).and_then(|s| s.point) else {
        return;
    };

    let parent_screen = ctx.screen_rect();
    let parent_scale  = parent_screen.width() / 1280.0;
    let init = Pos2::new(
        (tx * parent_scale - DOT / 2.0).clamp(parent_screen.left(), parent_screen.right() - DOT),
        (ty * parent_scale - DOT / 2.0).clamp(parent_screen.top(),  parent_screen.bottom() - DOT),
    );

    let builder = egui::ViewportBuilder::default()
        .with_title("Quickdraw Cursor Dot")
        .with_inner_size([DOT, DOT])
        .with_position([init.x, init.y])
        .with_decorations(false)
        .with_window_level(egui::WindowLevel::AlwaysOnTop)
        .with_resizable(false)
        .with_mouse_passthrough(true);

    ctx.show_viewport_deferred(
        egui::ViewportId::from_hash_of("quickdraw_guide_cursor"),
        builder,
        move |ctx, _| {
            let snap = snapshot.read().unwrap().clone();

            if !snap.guide_active {
                ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                return;
            }

            let Some((tx2, ty2)) = snap.guide_steps.get(snap.guide_step_index).and_then(|s| s.point) else {
                ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                return;
            };

            // Reposition when step changes.
            {
                let mut a = anim.lock().unwrap();
                if snap.guide_step_index != a.last_step || snap.version != a.last_version {
                    a.last_step    = snap.guide_step_index;
                    a.last_version = snap.version;
                    let new_pos = Pos2::new(
                        (tx2 * parent_scale - DOT / 2.0).clamp(parent_screen.left(), parent_screen.right() - DOT),
                        (ty2 * parent_scale - DOT / 2.0).clamp(parent_screen.top(),  parent_screen.bottom() - DOT),
                    );
                    ctx.send_viewport_cmd(egui::ViewportCommand::OuterPosition(new_pos));
                }
            }

            ctx.request_repaint_after(std::time::Duration::from_millis(33));

            egui::CentralPanel::default()
                .frame(egui::Frame::none().fill(Color32::from_rgba_unmultiplied(0x0d, 0x0d, 0x0d, 0xee)))
                .show(ctx, |ui| {
                    let t      = ui.input(|i| i.time) as f32;
                    let center = ui.clip_rect().center();
                    let pulse  = (t * 2.8).sin() * 0.5 + 0.5; // 0..1

                    // Outer pulsing ring
                    let ring_r = 17.0 + pulse * 5.0;
                    let ring_a = (160.0 + pulse * 80.0) as u8;
                    ui.painter().circle_stroke(
                        center, ring_r,
                        Stroke::new(2.5, Color32::from_rgba_unmultiplied(0xF5, 0xE6, 0x42, ring_a)),
                    );
                    // Inner solid ring
                    ui.painter().circle_stroke(
                        center, 8.5,
                        Stroke::new(1.5, Color32::from_rgb(0xF5, 0xE6, 0x42)),
                    );
                    // Crosshair lines (faint)
                    let h = DOT / 2.0;
                    ui.painter().hline(
                        center.x - h..=center.x + h, center.y,
                        Stroke::new(1.0, Color32::from_rgba_unmultiplied(0xF5, 0xE6, 0x42, 60)),
                    );
                    ui.painter().vline(
                        center.x, center.y - h..=center.y + h,
                        Stroke::new(1.0, Color32::from_rgba_unmultiplied(0xF5, 0xE6, 0x42, 60)),
                    );
                    // Centre dot
                    ui.painter().circle_filled(center, 3.5, Color32::from_rgb(0xF5, 0xE6, 0x42));
                });
        },
    );
}

// ─────────────────────────── Layout ──────────────────────────────────────────

fn draw_guide_content(
    ui: &mut egui::Ui,
    text: &str,
    current: usize,
    total: usize,
    label: Option<&str>,
    cmd_tx: &mpsc::Sender<Command>,
) {
    let pad = 12.0;
    egui::Frame::none()
        .inner_margin(Margin::symmetric(pad, pad))
        .show(ui, |ui| {
            // ── Header row ────────────────────────────────────────────────
            ui.horizontal(|ui| {
                ui.label(
                    egui::RichText::new(format!("STEP {current} / {total}"))
                        .size(10.0)
                        .strong()
                        .monospace()
                        .color(Colors::ACCENT_YELLOW),
                );
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let x = egui::RichText::new("✕")
                        .size(10.0)
                        .monospace()
                        .color(Color32::from_rgb(0x55, 0x55, 0x55));
                    if ui.add(egui::Label::new(x).sense(egui::Sense::click())).clicked() {
                        let _ = cmd_tx.try_send(Command::GuideDismiss);
                    }
                });
            });

            // Divider
            ui.add_space(4.0);
            let r = ui.available_rect_before_wrap();
            ui.painter().hline(
                r.left()..=r.right(),
                r.top(),
                Stroke::new(1.0, Color32::from_rgb(0x2a, 0x2a, 0x2a)),
            );
            ui.add_space(6.0);

            // ── Step text ─────────────────────────────────────────────────
            let wrapped = wrap_text(text, 38);
            for line in &wrapped {
                ui.label(
                    egui::RichText::new(line)
                        .size(11.5)
                        .monospace()
                        .color(Color32::from_rgb(0xF0, 0xED, 0xE0)),
                );
            }
            ui.add_space(4.0);

            // ── Target label (if present) ─────────────────────────────────
            if let Some(lbl) = label {
                ui.horizontal(|ui| {
                    ui.label(
                        egui::RichText::new("▶ ")
                            .size(10.0)
                            .monospace()
                            .color(Colors::ACCENT_YELLOW),
                    );
                    ui.label(
                        egui::RichText::new(lbl)
                            .size(10.0)
                            .monospace()
                            .color(Color32::from_rgb(0xF5, 0xE6, 0x42)),
                    );
                });
                ui.add_space(4.0);
            }

            // ── Nav buttons ───────────────────────────────────────────────
            ui.with_layout(egui::Layout::bottom_up(egui::Align::Min), |ui| {
                ui.add_space(4.0);

                // Hint text
                ui.label(
                    egui::RichText::new("say \"next\" · \"back\" · \"done\"")
                        .size(9.5)
                        .monospace()
                        .color(Color32::from_rgb(0x44, 0x44, 0x44)),
                );
            });
        });
}

fn draw_loading(ui: &mut egui::Ui) {
    let t = ui.input(|i| i.time) as f32;
    ui.add_space(50.0);
    ui.with_layout(egui::Layout::top_down(egui::Align::Center), |ui| {
        // Simple spinner
        let center = ui.next_widget_position() + Vec2::new(ui.available_width() / 2.0, 0.0);
        let r = 14.0;
        for i in 0..8u8 {
            let angle = std::f32::consts::TAU / 8.0 * i as f32 + t * 3.0;
            let alpha = 40 + ((215.0 * (i as f32 / 8.0)) as u8);
            let dot   = Pos2::new(center.x + r * angle.cos(), center.y + r * angle.sin());
            ui.painter().circle_filled(dot, 2.5, Color32::from_rgba_unmultiplied(0xF5, 0xE6, 0x42, alpha));
        }
        ui.add_space(20.0);
        ui.label(
            egui::RichText::new("THINKING…")
                .size(11.0)
                .monospace()
                .strong()
                .color(Colors::ACCENT_YELLOW),
        );
    });
}

// ─────────────────────────── Positioning ─────────────────────────────────────

/// Compute the top-left position of the guide window so it sits near the current
/// step's target point without going off-screen.
///
/// Claude's [POINT:x,y] coordinates are in ffmpeg-capture space (1280px wide).
/// The viewport position is in OS logical pixels (physical / ppp).
/// We scale by (screen_logical_width / 1280.0).
/// Position the guide overlay window on the physical desktop.
///
/// `screen` should be the MONITOR rect (absolute pixels), not the app panel rect.
/// When that's unavailable we fall back to a 1920×1080 reference so the clamp
/// never panics (max < min) even if `screen` is smaller than the overlay window.
fn compute_window_pos(snap: &AppSnapshot, screen: egui::Rect) -> Pos2 {
    // Use a reference rect large enough to always produce valid clamp bounds.
    let reference = if screen.width() >= W && screen.height() >= H {
        screen
    } else {
        egui::Rect::from_min_size(egui::Pos2::ZERO, egui::Vec2::new(1920.0, 1080.0))
    };

    let step = snap.guide_steps.get(snap.guide_step_index);

    let Some((tx, ty)) = step.and_then(|s| s.point) else {
        // No POINT — park in bottom-right of reference screen
        return Pos2::new(reference.right() - W - 20.0, reference.bottom() - H - 20.0);
    };

    // The step coords are in 1280-wide capture space. Scale to reference screen.
    let scale = reference.width() / 1280.0;
    let lx    = tx * scale;
    let ly    = ty * scale;

    let x = if lx + W + 50.0 < reference.right() { lx + 40.0 } else { lx - W - 40.0 };
    let y = if ly - H - 20.0 > reference.top()   { ly - H - 10.0 } else { ly + 20.0 };

    let max_x = (reference.right()  - W).max(reference.left());
    let max_y = (reference.bottom() - H).max(reference.top());
    Pos2::new(x.clamp(reference.left(), max_x), y.clamp(reference.top(), max_y))
}

// ─────────────────────────── Word wrap ───────────────────────────────────────

fn wrap_text(text: &str, max_chars: usize) -> Vec<String> {
    let mut lines   = Vec::new();
    let mut current = String::new();
    for word in text.split_whitespace() {
        if current.is_empty() {
            current.push_str(word);
        } else if current.len() + 1 + word.len() <= max_chars {
            current.push(' ');
            current.push_str(word);
        } else {
            lines.push(std::mem::take(&mut current));
            current.push_str(word);
        }
    }
    if !current.is_empty() { lines.push(current); }
    if lines.is_empty() { lines.push(String::new()); }
    lines
}
