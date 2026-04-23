use solana_sdk::pubkey::Pubkey;
use uuid::Uuid;

use crate::types::{
    AdapterQuote, DetectionSource, Point, SafetyReport, TokenPrice, YieldPosition,
};

#[derive(Debug, Clone, PartialEq)]
pub enum SafetyCheckStatus {
    Pending,
    Done(bool),
    Failed(String),
}

#[derive(Debug, Clone)]
pub enum QuickdrawState {
    Idle,
    TokenDetected {
        address: Pubkey,
        position: Point,
        source: DetectionSource,
    },
    CheckingToken {
        address: Pubkey,
        checks: Vec<SafetyCheckStatus>,
    },
    FetchingQuotes {
        token_in: Pubkey,
        token_out: Pubkey,
        amount: u64,
        quotes: Vec<AdapterQuote>,
    },
    AwaitingSwapConfirm {
        selected_quote: AdapterQuote,
        unsigned_tx: Vec<u8>,
    },
    AwaitingWalletSign,
    SwapComplete {
        signature: String,
        adapter_used: String,
    },
    FetchingYield {
        wallet: Pubkey,
        adapter: String,
    },
    ShowingYield {
        positions: Vec<YieldPosition>,
    },
    Listening {
        session_id: Uuid,
    },
    Thinking {
        transcript: String,
    },
    Responding {
        response: String,
    },
    Error {
        message: String,
        recoverable: bool,
    },
}

impl Default for QuickdrawState {
    fn default() -> Self {
        Self::Idle
    }
}

/// Full mutable truth — owned by the engine task.
#[derive(Debug)]
pub struct AppState {
    pub fsm: QuickdrawState,
    pub wallet_pubkey: Option<Pubkey>,
    pub token_address: Option<Pubkey>,
    pub token_ticker: Option<String>,
    pub last_seen_ticker: Option<String>,
    pub safety_report: Option<SafetyReport>,
    pub token_price: Option<TokenPrice>,
    pub quotes: Vec<AdapterQuote>,
    pub ai_narration: Option<String>,
    pub ai_streaming: bool,
    pub overlay_visible: bool,
    pub overlay_position: Point,
    pub ai_mode: AiMode,
    pub settings_visible: bool,
    pub detection_enabled: bool,
    pub version: u64,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            detection_enabled: true,
            fsm: Default::default(),
            wallet_pubkey: None,
            token_address: None,
            token_ticker: None,
            last_seen_ticker: None,
            safety_report: None,
            token_price: None,
            quotes: Vec::new(),
            ai_narration: None,
            ai_streaming: false,
            overlay_visible: false,
            overlay_position: Default::default(),
            ai_mode: Default::default(),
            settings_visible: false,
            version: 0,
        }
    }
}

impl AppState {
    pub fn snapshot(&self) -> AppSnapshot {
        AppSnapshot {
            fsm: self.fsm.clone(),
            wallet_pubkey: self.wallet_pubkey,
            token_address: self.token_address,
            token_ticker: self.token_ticker.clone(),
            last_seen_ticker: self.last_seen_ticker.clone(),
            safety_report: self.safety_report.clone(),
            token_price: self.token_price.clone(),
            quotes: self.quotes.clone(),
            ai_narration: self.ai_narration.clone(),
            ai_streaming: self.ai_streaming,
            overlay_visible: self.overlay_visible,
            overlay_position: self.overlay_position,
            ai_mode: self.ai_mode,
            settings_visible: self.settings_visible,
            detection_enabled: self.detection_enabled,
            version: self.version,
        }
    }
}

/// Cheap clone for the UI render loop — no locks on the hot path.
#[derive(Debug, Clone, Default)]
pub struct AppSnapshot {
    pub fsm: QuickdrawState,
    pub wallet_pubkey: Option<Pubkey>,
    pub token_address: Option<Pubkey>,
    pub token_ticker: Option<String>,
    pub last_seen_ticker: Option<String>,
    pub safety_report: Option<SafetyReport>,
    pub token_price: Option<TokenPrice>,
    pub quotes: Vec<AdapterQuote>,
    pub ai_narration: Option<String>,
    pub ai_streaming: bool,
    pub overlay_visible: bool,
    pub overlay_position: Point,
    pub ai_mode: AiMode,
    pub settings_visible: bool,
    pub detection_enabled: bool,
    pub version: u64,
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum AiMode {
    #[default]
    Auto,
    Online,
    Offline,
}

impl Default for Point {
    fn default() -> Self {
        Point { x: 0.0, y: 0.0 }
    }
}
