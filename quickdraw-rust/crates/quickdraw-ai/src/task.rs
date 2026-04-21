#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AITask {
    // Fast tier — Haiku / Gemma 4B
    TokenNarration,
    VoiceIntent,
    SwapRiskWarning,
    PriceSummary,
    SafetyNarration,

    // Deep tier — Sonnet / Gemma 27B
    ScreenAnalysis,
    DeepTokenReport,
    YieldStrategy,
    PortfolioAnalysis,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AITier {
    Fast,
    Deep,
}

impl AITask {
    pub fn tier(&self) -> AITier {
        match self {
            Self::TokenNarration
            | Self::VoiceIntent
            | Self::SwapRiskWarning
            | Self::PriceSummary
            | Self::SafetyNarration => AITier::Fast,

            Self::ScreenAnalysis
            | Self::DeepTokenReport
            | Self::YieldStrategy
            | Self::PortfolioAnalysis => AITier::Deep,
        }
    }

    pub fn max_tokens(&self) -> u32 {
        match self.tier() {
            AITier::Fast => 512,
            AITier::Deep => 1024,
        }
    }
}
