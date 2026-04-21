use serde::{Deserialize, Serialize};
use solana_sdk::pubkey::Pubkey;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Size {
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl Rect {
    pub fn right(&self) -> f32 { self.x + self.width }
    pub fn bottom(&self) -> f32 { self.y + self.height }
    pub fn left(&self) -> f32 { self.x }
    pub fn top(&self) -> f32 { self.y }
}

/// Computes overlay position near a detection point, clamped to screen bounds.
pub fn compute_overlay_position(detection: Point, overlay_size: Size, screen: Rect) -> Point {
    let preferred_x = detection.x + 20.0;
    let preferred_y = detection.y + 10.0;

    let x = if preferred_x + overlay_size.width > screen.right() {
        (detection.x - overlay_size.width - 8.0).max(screen.left() + 8.0)
    } else {
        preferred_x
    };

    let y = if preferred_y + overlay_size.height > screen.bottom() {
        (detection.y - overlay_size.height - 8.0).max(screen.top() + 8.0)
    } else {
        preferred_y
    };

    Point { x, y }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum DetectionSource {
    BrowserExtension { url: String },
    Accessibility { app_name: String },
    Ocr,
    Manual,
    /// Text highlighted by the cursor — fires without any copy/paste action.
    Selection,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DetectionEvent {
    pub address: Pubkey,
    pub position: Point,
    pub source: DetectionSource,
    pub raw_text: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SafetyReport {
    pub score: u8,
    pub mint_authority_disabled: bool,
    pub freeze_authority_disabled: bool,
    pub jupiter_listed: bool,
    pub top_holder_pct: f64,
    pub liquidity_usd: f64,
    pub rugcheck_ok: bool,
    pub summary: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TokenPrice {
    pub price_usd: f64,
    pub change_24h_pct: f64,
    pub volume_24h_usd: f64,
    pub market_cap_usd: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AdapterQuote {
    pub adapter_name: String,
    pub in_amount: u64,
    pub out_amount: u64,
    pub price_impact_pct: f64,
    pub slippage_bps: u16,
    pub fee_usd: f64,
    pub route_label: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct YieldPosition {
    pub protocol: String,
    pub pool_name: String,
    pub apr: f64,
    pub tvl_usd: f64,
    pub deposited_usd: f64,
    pub pending_rewards_usd: f64,
    pub in_range: Option<bool>,
}
