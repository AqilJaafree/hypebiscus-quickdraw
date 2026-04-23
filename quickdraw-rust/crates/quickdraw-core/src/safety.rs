pub struct SafetyInput {
    pub mint_authority_disabled: bool,
    pub freeze_authority_disabled: bool,
    pub jupiter_listed: bool,
    pub top_holder_pct: f64,
    pub liquidity_usd: f64,
    pub rugcheck_ok: bool,
    /// Jupiter organic score 0–100: ratio of real vs bot trading activity.
    pub organic_score: f64,
}

/// Pure scoring function — no I/O, fully unit-testable.
pub fn calculate_safety_score(input: &SafetyInput) -> u8 {
    let mut score: i32 = 0;

    if input.jupiter_listed            { score += 20; }
    if input.mint_authority_disabled   { score += 20; }
    if input.freeze_authority_disabled { score += 15; }
    if input.rugcheck_ok               { score += 15; }

    // Liquidity scoring
    score += match input.liquidity_usd as u64 {
        1_000_000.. => 15,
        100_000..   => 10,
        10_000..    => 5,
        _           => 0,
    };

    // Organic activity score: high = real traders, low = mostly bots/wash trading
    score += match input.organic_score as u32 {
        70..=100 => 15,
        40..=69  => 7,
        _        => 0,
    };

    // Top-holder concentration penalty
    score -= match (input.top_holder_pct * 100.0) as u32 {
        0..=20  => 0,
        21..=40 => 5,
        41..=60 => 15,
        _       => 30,
    };

    score.clamp(0, 100) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn perfect_token_scores_high() {
        let input = SafetyInput {
            mint_authority_disabled: true,
            freeze_authority_disabled: true,
            jupiter_listed: true,
            top_holder_pct: 0.05,
            liquidity_usd: 5_000_000.0,
            rugcheck_ok: true,
            organic_score: 95.0,
        };
        assert_eq!(calculate_safety_score(&input), 100);
    }

    #[test]
    fn scam_token_scores_low() {
        let input = SafetyInput {
            mint_authority_disabled: false,
            freeze_authority_disabled: false,
            jupiter_listed: false,
            top_holder_pct: 0.90,
            liquidity_usd: 500.0,
            rugcheck_ok: false,
            organic_score: 5.0,
        };
        assert!(calculate_safety_score(&input) < 10);
    }

    #[test]
    fn score_never_exceeds_100() {
        let input = SafetyInput {
            mint_authority_disabled: true,
            freeze_authority_disabled: true,
            jupiter_listed: true,
            top_holder_pct: 0.01,
            liquidity_usd: 10_000_000.0,
            rugcheck_ok: true,
            organic_score: 100.0,
        };
        assert!(calculate_safety_score(&input) <= 100);
    }
}
