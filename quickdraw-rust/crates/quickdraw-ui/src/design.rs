use egui::{Color32, FontFamily, FontId, RichText, Vec2};

pub struct Colors;

impl Colors {
    pub const PANEL_BG: Color32      = Color32::from_rgb(0xF5, 0xF0, 0xE8);
    pub const OVERLAY_BG: Color32    = Color32::from_rgb(0x18, 0x18, 0x18);
    pub const STROKE: Color32        = Color32::BLACK;
    pub const SHADOW: Color32        = Color32::BLACK;
    pub const ACCENT_YELLOW: Color32 = Color32::from_rgb(0xF5, 0xE6, 0x42);
    pub const ACCENT_CYAN: Color32   = Color32::from_rgb(0x42, 0xE8, 0xF5);
    pub const ACCENT_LIME: Color32   = Color32::from_rgb(0x8B, 0xF5, 0x42);
    pub const SAFE: Color32          = Color32::from_rgb(0x8B, 0xF5, 0x42);
    pub const CAUTION: Color32       = Color32::from_rgb(0xF5, 0xC8, 0x42);
    pub const DANGER: Color32        = Color32::from_rgb(0xF5, 0x42, 0x42);
    pub const TEXT_PRIMARY: Color32  = Color32::BLACK;
    pub const TEXT_ON_DARK: Color32  = Color32::from_rgb(0xF5, 0xF0, 0xE8);
    pub const TEXT_MUTED: Color32    = Color32::from_rgb(0x88, 0x88, 0x88);

    pub fn safety_color(score: u8) -> Color32 {
        match score {
            80..=100 => Self::SAFE,
            50..=79  => Self::CAUTION,
            _        => Self::DANGER,
        }
    }

    pub fn safety_label(score: u8) -> &'static str {
        match score {
            80..=100 => "SAFE",
            50..=79  => "CAUTION",
            _        => "HIGH RISK",
        }
    }
}

pub struct Tokens;

impl Tokens {
    // Stroke & Shadow
    pub const STROKE_WIDTH: f32    = 2.0;
    pub const SHADOW_OFFSET: Vec2  = Vec2::new(4.0, 4.0);
    pub const CORNER_RADIUS: f32   = 0.0;

    // Padding
    pub const PANEL_PADDING: Vec2  = Vec2::new(14.0, 12.0);
    pub const BUTTON_PADDING: Vec2 = Vec2::new(14.0, 8.0);

    // Popup dimensions
    pub const POPUP_WIDTH: f32     = 260.0;
    pub const POPUP_H_LOADING: f32 = 75.0;
    pub const POPUP_H_FULL: f32    = 100.0;
    pub const OVERLAY_WIDTH: f32   = 340.0; // old overlay, unused now

    // Settings panel
    pub const PANEL_WIDTH: f32     = 260.0;
    pub const PANEL_HEIGHT: f32    = 340.0;
}

/// Convenience: bold label text suitable for neobrutalism headings.
pub fn heading(text: impl Into<String>) -> RichText {
    RichText::new(text).size(13.0).strong().color(Colors::TEXT_ON_DARK)
}

pub fn body(text: impl Into<String>) -> RichText {
    RichText::new(text).size(12.0).color(Colors::TEXT_ON_DARK)
}

pub fn muted(text: impl Into<String>) -> RichText {
    RichText::new(text).size(11.0).color(Colors::TEXT_MUTED)
}

pub fn mono(text: impl Into<String>) -> RichText {
    RichText::new(text)
        .size(11.0)
        .monospace()
        .color(Colors::TEXT_MUTED)
}
