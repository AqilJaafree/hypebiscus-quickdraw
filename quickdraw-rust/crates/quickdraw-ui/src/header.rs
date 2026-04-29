/// Header rendering module — extracted from app.rs for clarity.
/// Handles the score-first colored header with buttons.

use std::sync::Arc;
use egui::{Color32, FontId, FontFamily, Painter, Rect, Vec2};
use tokio::sync::mpsc;
use quickdraw_core::commands::Command;
use crate::design::Colors;

#[derive(Clone)]
struct HeaderGalleys {
    score: Arc<egui::Galley>,
    label: Arc<egui::Galley>,
    ticker: Arc<egui::Galley>,
}

// Layout constants
const HEADER_HEIGHT: f32 = 54.0;
const PADDING: f32 = 10.0;
const SCORE_SIZE: f32 = 34.0;
const LABEL_SIZE: f32 = 9.0;
const TICKER_SIZE: f32 = 17.0;
const BUTTON_SIZE: f32 = 22.0;
const BUTTON_FONT_SIZE: f32 = 12.0;
const LABEL_TICKER_GAP: f32 = 2.0;
const BUTTON_SPACING: f32 = 2.0;

struct HeaderColors {
    text: Color32,
    muted: Color32,
    btn: Color32,
}

impl HeaderColors {
    fn new(loading: bool, score: u8) -> Self {
        if loading {
            Self {
                text: Color32::from_rgb(0x33, 0x33, 0x33),
                muted: Color32::from_rgb(0x33, 0x33, 0x33),
                btn: Color32::from_rgba_premultiplied(0, 0, 0, 110),
            }
        } else {
            let danger = score < 50;
            Self {
                text: if danger { Color32::WHITE } else { Color32::BLACK },
                muted: if danger {
                    Color32::from_rgba_premultiplied(255, 255, 255, 100)
                } else {
                    Color32::from_rgba_premultiplied(0, 0, 0, 115)
                },
                btn: if danger {
                    Color32::from_rgba_premultiplied(255, 255, 255, 110)
                } else {
                    Color32::from_rgba_premultiplied(0, 0, 0, 110)
                },
            }
        }
    }
}

/// Render header text elements (score, label, ticker) centered vertically
fn render_text(
    p: &Painter,
    ui: &egui::Ui,
    row: Rect,
    score_str: &str,
    label_str: &str,
    ticker: &str,
    colors: &HeaderColors,
) {
    let mid = row.min.y + HEADER_HEIGHT / 2.0;

    // Cache key encodes content + the score byte (which drives colour changes)
    let cache_id = egui::Id::new(("hdr", score_str, label_str, ticker));
    let cached: Option<HeaderGalleys> = ui.ctx().data(|d| d.get_temp(cache_id));
    let galleys = if let Some(g) = cached {
        g
    } else {
        let g_score = ui.fonts(|f| {
            f.layout_no_wrap(
                score_str.into(),
                FontId::new(SCORE_SIZE, FontFamily::Monospace),
                colors.text,
            )
        });
        let g_label = ui.fonts(|f| {
            f.layout_no_wrap(
                label_str.into(),
                FontId::new(LABEL_SIZE, FontFamily::Monospace),
                colors.muted,
            )
        });
        let g_ticker = ui.fonts(|f| {
            f.layout_no_wrap(
                ticker.into(),
                FontId::new(TICKER_SIZE, FontFamily::Monospace),
                colors.text,
            )
        });
        let g = HeaderGalleys { score: g_score, label: g_label, ticker: g_ticker };
        ui.ctx().data_mut(|d| d.insert_temp(cache_id, g.clone()));
        g
    };

    // Position score — capture size before galley is moved into painter
    let x_score  = row.min.x + PADDING + 2.0;
    let y_score  = mid - galleys.score.size().y / 2.0;
    let score_w  = galleys.score.size().x;
    p.galley(egui::pos2(x_score, y_score), galleys.score, colors.text);

    // Position label+ticker block (centered as unit)
    let block_h = galleys.label.size().y + LABEL_TICKER_GAP + galleys.ticker.size().y;
    let x_text   = x_score + score_w + 10.0;
    let y_label  = mid - block_h / 2.0;
    let y_ticker = y_label + galleys.label.size().y + LABEL_TICKER_GAP;

    p.galley(egui::pos2(x_text, y_label),  galleys.label,  colors.muted);
    p.galley(egui::pos2(x_text, y_ticker), galleys.ticker, colors.text);
}

/// Render and handle interactive buttons (gear, X)
fn render_buttons(
    p: &Painter,
    ui: &egui::Ui,
    row: Rect,
    colors: &HeaderColors,
    cmd_tx: &mpsc::Sender<Command>,
) {
    let mid = row.min.y + HEADER_HEIGHT / 2.0;
    let btn_y = mid - BUTTON_SIZE / 2.0;

    let x_rect = Rect::from_min_size(
        egui::pos2(row.max.x - PADDING - BUTTON_SIZE, btn_y),
        Vec2::splat(BUTTON_SIZE),
    );
    let gear_rect = Rect::from_min_size(
        egui::pos2(
            x_rect.min.x - BUTTON_SIZE - BUTTON_SPACING,
            btn_y,
        ),
        Vec2::splat(BUTTON_SIZE),
    );

    let x_resp = ui.interact(x_rect, egui::Id::new("hdr_x"), egui::Sense::click());
    let gear_resp = ui.interact(gear_rect, egui::Id::new("hdr_gear"), egui::Sense::click());

    let f_btn = FontId::new(BUTTON_FONT_SIZE, FontFamily::Proportional);
    for (r, lbl) in [(&x_resp, egui_phosphor::regular::X), (&gear_resp, egui_phosphor::regular::GEAR)] {
        let col = if r.hovered() { Color32::WHITE } else { colors.btn };
        let g = ui.fonts(|f| f.layout_no_wrap(lbl.into(), f_btn.clone(), col));
        let pos = r.rect.min + (r.rect.size() - g.size()) / 2.0;
        p.galley(pos, g, col);
    }

    if x_resp.clicked() {
        let _ = cmd_tx.try_send(Command::DismissOverlay);
    }
    if gear_resp.clicked() {
        let _ = cmd_tx.try_send(Command::ToggleSettings);
    }
}

/// Main entry point: paint the full header with score, ticker, and buttons.
///
/// Returns the response from the frame (unused currently, kept for API consistency).
pub fn render_header(
    ui: &mut egui::Ui,
    loading: bool,
    score: u8,
    ticker: &str,
    header_color: Color32,
    cmd_tx: &mpsc::Sender<Command>,
) -> egui::InnerResponse<()> {
    egui::Frame::none()
        .fill(header_color)
        .inner_margin(egui::Margin::ZERO)
        .show(ui, |ui| {
            let (row, _) = ui.allocate_exact_size(
                Vec2::new(ui.available_width(), HEADER_HEIGHT),
                egui::Sense::hover(),
            );

            let score_str = if loading { "?" } else { &score.to_string() };
            let label_str = if loading {
                "..."
            } else {
                Colors::safety_label(score)
            };
            let colors = HeaderColors::new(loading, score);

            let p = ui.painter();
            render_text(p, ui, row, score_str, label_str, ticker, &colors);
            render_buttons(p, ui, row, &colors, cmd_tx);
        })
}
