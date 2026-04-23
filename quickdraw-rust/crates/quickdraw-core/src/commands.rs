use solana_sdk::pubkey::Pubkey;
use crate::types::{AdapterQuote, DetectionEvent};
use crate::state::AiMode;

#[derive(Debug, Clone)]
pub enum Command {
    TokenDetected(DetectionEvent),
    FetchQuotes { token_in: Pubkey, token_out: Pubkey, amount: u64 },
    SelectQuote(AdapterQuote),
    ConfirmSwap,
    CancelSwap,
    DismissOverlay,
    StartListening,
    StopListening,
    SetAiMode(AiMode),
    ToggleSettings,
    ToggleDetection,
    ConnectWallet,
    DisconnectWallet,
    WalletConnected(Pubkey),
    FetchYield,
    Shutdown,
}
