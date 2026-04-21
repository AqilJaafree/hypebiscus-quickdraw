use egui::{Color32, FontId, Margin, Response, Rounding, Sense, Stroke, Ui, Vec2};
use crate::design::{Colors, Tokens};

/// Neobrutalism button — yellow fill, hard shadow, collapses on press.
pub fn brutal_button(ui: &mut Ui, label: &str) -> Response {
    let font_id = FontId::proportional(13.0);
    let galley = ui.fonts(|f| f.layout_no_wrap(label.to_owned(), font_id.clone(), Colors::TEXT_PRIMARY));
    let desired = galley.size() + Tokens::BUTTON_PADDING * 2.0;
    let (rect, response) = ui.allocate_exact_size(desired, Sense::click());

    if ui.is_rect_visible(rect) {
        let pressed = response.is_pointer_button_down_on();
        let offset = if pressed { Tokens::SHADOW_OFFSET } else { Vec2::ZERO };

        let shadow_r = rect.translate(Tokens::SHADOW_OFFSET);
        let draw_r   = rect.translate(offset);

        ui.painter().rect_filled(shadow_r, 0.0, Colors::SHADOW);

        let fill = if response.hovered() && !pressed {
            // slightly brighter on hover — still flat
            Color32::from_rgb(0xFF, 0xF0, 0x50)
        } else {
            Colors::ACCENT_YELLOW
        };
        ui.painter().rect_filled(draw_r, 0.0, fill);
        ui.painter().rect_stroke(draw_r, 0.0, Stroke::new(Tokens::STROKE_WIDTH, Colors::STROKE));

        let text_pos = draw_r.min + Tokens::BUTTON_PADDING;
        ui.painter().galley(text_pos, galley, Colors::TEXT_PRIMARY);
    }

    response
}

/// Secondary (outline) button — panel_bg fill, black border, no shadow.
pub fn ghost_button(ui: &mut Ui, label: &str) -> Response {
    let font_id = FontId::proportional(13.0);
    let galley = ui.fonts(|f| f.layout_no_wrap(label.to_owned(), font_id, Colors::TEXT_ON_DARK));
    let desired = galley.size() + Tokens::BUTTON_PADDING * 2.0;
    let (rect, response) = ui.allocate_exact_size(desired, Sense::click());

    if ui.is_rect_visible(rect) {
        let fill = if response.hovered() {
            Color32::from_rgb(0x28, 0x28, 0x28)
        } else {
            Color32::from_rgb(0x20, 0x20, 0x20)
        };
        ui.painter().rect_filled(rect, 0.0, fill);
        ui.painter().rect_stroke(rect, 0.0, Stroke::new(1.5, Color32::from_rgb(0x44, 0x44, 0x44)));
        ui.painter().galley(rect.min + Tokens::BUTTON_PADDING, galley, Colors::TEXT_ON_DARK);
    }

    response
}

/// Safety score badge — colour-coded fill, bold label.
/// Uses egui Frame (no manual Sense allocation → no hover tracking → no repaints).
pub fn safety_badge(ui: &mut Ui, score: u8, ticker: &str) {
    let fill = Colors::safety_color(score);
    let label = format!("{} · {}/100  {}", ticker, score, Colors::safety_label(score));

    egui::Frame::none()
        .fill(fill)
        .stroke(Stroke::new(Tokens::STROKE_WIDTH, Colors::STROKE))
        .inner_margin(Margin::symmetric(Tokens::BUTTON_PADDING.x, Tokens::BUTTON_PADDING.y))
        .shadow(egui::epaint::Shadow {
            offset: Tokens::SHADOW_OFFSET,
            blur: 0.0,
            spread: 0.0,
            color: Colors::SHADOW,
        })
        .rounding(Rounding::ZERO)
        .show(ui, |ui| {
            ui.label(
                egui::RichText::new(&label)
                    .size(12.0)
                    .strong()
                    .color(Colors::TEXT_PRIMARY),
            );
        });
}

/// Hard-shadow panel card — the core neobrutalism container.
pub fn brutal_card(ui: &mut Ui, bg: Color32, add_contents: impl FnOnce(&mut Ui)) {
    egui::Frame {
        fill: bg,
        stroke: Stroke::new(Tokens::STROKE_WIDTH, Colors::STROKE),
        inner_margin: Margin::symmetric(Tokens::PANEL_PADDING.x, Tokens::PANEL_PADDING.y),
        outer_margin: Margin::ZERO,
        shadow: egui::epaint::Shadow {
            offset: Tokens::SHADOW_OFFSET,
            blur: 0.0,
            spread: 0.0,
            color: Colors::SHADOW,
        },
        rounding: Rounding::ZERO,
        ..Default::default()
    }
    .show(ui, add_contents);
}

/// Horizontal separator line (dark variant for overlay).
/// Painted directly via the painter — zero Sense allocation, zero hover tracking.
pub fn separator_dark(ui: &mut Ui) {
    ui.add_space(4.0);
    let width = ui.available_width();
    let (rect, _) = ui.allocate_exact_size(Vec2::new(width, 1.0), Sense::hover());
    ui.painter().rect_filled(rect, 0.0, Color32::from_rgb(0x33, 0x33, 0x33));
    ui.add_space(4.0);
}

/// Loading indicator with label (static — no spinner to avoid constant repaints).
pub fn loading_row(ui: &mut Ui, label: &str) {
    ui.label(egui::RichText::new(format!("… {label}")).size(12.0).color(Colors::TEXT_MUTED));
}
