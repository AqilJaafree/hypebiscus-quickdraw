use std::time::{Duration, Instant};

/// Market pulse — small always-present context layer, refreshed every 5 minutes.
pub struct MarketPulse {
    pub sol_price: f64,
    pub sol_change_24h: f64,
    pub btc_change_24h: f64,
    pub sentiment_score: u32,
    pub sentiment_label: String,
    fetched_at: Instant,
}

impl MarketPulse {
    const TTL: Duration = Duration::from_secs(300);

    pub fn is_stale(&self) -> bool {
        self.fetched_at.elapsed() > Self::TTL
    }

    /// Renders the one-line market context for Layer 2.
    /// Must be stable/deterministic so Anthropic's cache key stays consistent.
    pub fn render(&self) -> String {
        format!(
            "Market: SOL ${:.2} ({:+.1}% 24h) · BTC ({:+.1}% 24h) · Sentiment: {} ({})",
            self.sol_price,
            self.sol_change_24h,
            self.btc_change_24h,
            self.sentiment_label,
            self.sentiment_score,
        )
    }

    pub fn placeholder() -> Self {
        Self {
            sol_price: 0.0,
            sol_change_24h: 0.0,
            btc_change_24h: 0.0,
            sentiment_score: 50,
            sentiment_label: "Neutral".into(),
            fetched_at: Instant::now() - Self::TTL - Duration::from_secs(1),
        }
    }
}

/// Layer 1 — static system context, built once per session.
pub struct SystemContext {
    pub wallet_address: Option<String>,
    pub risk_preference: RiskPreference,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RiskPreference {
    Conservative,
    Moderate,
    Aggressive,
}

impl SystemContext {
    pub fn render(&self) -> String {
        let wallet = self.wallet_address
            .as_deref()
            .unwrap_or("not connected");

        let risk = match self.risk_preference {
            RiskPreference::Conservative => "conservative (prioritise safety over yield)",
            RiskPreference::Moderate     => "moderate (balanced risk/reward)",
            RiskPreference::Aggressive   => "aggressive (high risk tolerance)",
        };

        format!(
            "You are Quickdraw, an expert Solana DeFi analyst embedded in the user's desktop. \
            You are concise, honest, and never hype tokens. \
            User wallet: {wallet}. \
            Risk preference: {risk}. \
            Output format: JSON matching the provided schema unless instructed otherwise. \
            Never include warnings, disclaimers, or financial advice boilerplate. \
            Answer in 2-3 sentences maximum for narration tasks."
        )
    }
}

/// Parses structured JSON from AI response text.
/// Handles both bare JSON and markdown code blocks.
pub fn parse_structured<T: serde::de::DeserializeOwned>(text: &str) -> anyhow::Result<T> {
    // Direct parse first
    if let Ok(v) = serde_json::from_str(text) {
        return Ok(v);
    }

    // Extract from markdown code block: ```json ... ``` or ``` ... ```
    if let Some(inner) = extract_json_block(text) {
        if let Ok(v) = serde_json::from_str(&inner) {
            return Ok(v);
        }
    }

    anyhow::bail!("could not parse structured output from: {}", &text[..text.len().min(200)])
}

fn extract_json_block(text: &str) -> Option<String> {
    let start = text.find("```json").or_else(|| text.find("```"))?;
    let after_fence = text[start..].find('\n')? + start + 1;
    let end = text[after_fence..].find("```")? + after_fence;
    Some(text[after_fence..end].trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize, PartialEq, Debug)]
    struct TestStruct { value: u32 }

    #[test]
    fn parses_bare_json() {
        let r: TestStruct = parse_structured(r#"{"value": 42}"#).unwrap();
        assert_eq!(r.value, 42);
    }

    #[test]
    fn parses_markdown_json_block() {
        let text = "Here is the result:\n```json\n{\"value\": 99}\n```\n";
        let r: TestStruct = parse_structured(text).unwrap();
        assert_eq!(r.value, 99);
    }

    #[test]
    fn market_pulse_render_is_deterministic() {
        let pulse = MarketPulse {
            sol_price: 142.30,
            sol_change_24h: -3.2,
            btc_change_24h: -1.8,
            sentiment_score: 28,
            sentiment_label: "Fearful".into(),
            fetched_at: Instant::now(),
        };
        let s1 = pulse.render();
        let s2 = pulse.render();
        assert_eq!(s1, s2);
        assert!(s1.contains("SOL $142.30"));
        assert!(s1.contains("Fearful (28)"));
    }
}
