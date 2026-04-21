use thiserror::Error;

#[derive(Debug, Clone, Error)]
pub enum UserFacingError {
    #[error("Jupiter is slow right now")]
    AdapterTimeout { adapter_name: String },

    #[error("DEX data unavailable")]
    AllAdaptersDown,

    #[error("AI analysis unavailable")]
    AiUnavailable,

    #[error("Wallet disconnected")]
    WalletDisconnected,

    #[error("Wallet rejected this swap")]
    WalletRejected,

    #[error("Swap failed · funds safe")]
    SwapFailedOnChain { signature: String },

    #[error("Too many requests · wait {retry_after_secs}s")]
    RateLimited { retry_after_secs: u32 },

    #[error("No internet connection")]
    Offline,
}

#[derive(Debug, Clone)]
pub struct RecoveryAction {
    pub label: String,
    pub action: RecoveryKind,
}

#[derive(Debug, Clone)]
pub enum RecoveryKind {
    RetryWithAdapter(String),
    Retry,
    Reconnect,
    Modify,
    Cancel,
    OpenSolscan(String),
}

impl UserFacingError {
    pub fn recovery(&self) -> Option<RecoveryAction> {
        match self {
            Self::AdapterTimeout { adapter_name } => Some(RecoveryAction {
                label: format!("Try another DEX"),
                action: RecoveryKind::RetryWithAdapter(adapter_name.clone()),
            }),
            Self::AllAdaptersDown => Some(RecoveryAction {
                label: "Retry".into(),
                action: RecoveryKind::Retry,
            }),
            Self::AiUnavailable => Some(RecoveryAction {
                label: "Retry".into(),
                action: RecoveryKind::Retry,
            }),
            Self::WalletDisconnected => Some(RecoveryAction {
                label: "Reconnect".into(),
                action: RecoveryKind::Reconnect,
            }),
            Self::WalletRejected => Some(RecoveryAction {
                label: "Modify".into(),
                action: RecoveryKind::Modify,
            }),
            Self::SwapFailedOnChain { signature } => Some(RecoveryAction {
                label: "View on Solscan".into(),
                action: RecoveryKind::OpenSolscan(signature.clone()),
            }),
            Self::RateLimited { .. } => None,
            Self::Offline => None,
        }
    }
}
