use solana_sdk::pubkey::Pubkey;
use crate::types::{AdapterQuote, SafetyReport, TokenPrice, YieldPosition};
use crate::types::Point;

#[derive(Debug, Clone)]
pub enum AppEvent {
    OverlayShown { position: Point },
    OverlayDismissed,
    SafetyLoaded(SafetyReport),
    PriceLoaded(TokenPrice),
    QuotesLoaded(Vec<AdapterQuote>),
    AiChunk(String),
    AiDone,
    SwapSigned { signature: String },
    SwapFailed { reason: String },
    YieldLoaded(Vec<YieldPosition>),
    WalletConnected(Pubkey),
    WalletDisconnected,
    TranscriptUpdate(String),
    Error { message: String, recoverable: bool },
    StateChanged,
}
