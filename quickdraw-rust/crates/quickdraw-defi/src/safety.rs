use anyhow::Result;
use reqwest::Client;
use serde::Deserialize;
use solana_sdk::pubkey::Pubkey;
use std::time::Duration;
use tracing::debug;

use quickdraw_core::safety::{calculate_safety_score, SafetyInput};
use quickdraw_core::types::SafetyReport;
use quickdraw_infra::worker_client::WorkerClient;

#[derive(Debug, Deserialize)]
struct RugCheckReport {
    mint: String,
    token_program: String,
    #[serde(default)]
    risks: Vec<RugRisk>,
    #[serde(rename = "topHolders", default)]
    top_holders: Vec<HolderEntry>,
    #[serde(default)]
    markets: Vec<Market>,
}

#[derive(Debug, Deserialize)]
struct RugRisk {
    name: String,
    score: u32,
}

#[derive(Debug, Deserialize)]
struct HolderEntry {
    pct: f64,
}

#[derive(Debug, Deserialize)]
struct Market {
    liquidity: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct HeliusTokenInfo {
    #[serde(rename = "mintAuthority")]
    mint_authority: Option<String>,
    #[serde(rename = "freezeAuthority")]
    freeze_authority: Option<String>,
}

pub struct SafetyAggregator {
    worker: WorkerClient,
    http: Client,
}

impl SafetyAggregator {
    pub fn new(worker: WorkerClient) -> Self {
        Self {
            worker,
            http: Client::builder()
                .timeout(Duration::from_secs(8))
                .build()
                .expect("reqwest client"),
        }
    }

    /// Aggregate safety data from multiple sources in parallel.
    pub async fn check(&self, token: Pubkey) -> Result<SafetyReport> {
        let token_str = token.to_string();

        // Parallel fetch: RugCheck + Jupiter strict list check via Worker
        let (rugcheck, jupiter_listed) = tokio::join!(
            self.fetch_rugcheck(&token_str),
            self.check_jupiter_listed(&token_str),
        );

        let rugcheck = rugcheck.unwrap_or_else(|e| {
            debug!("RugCheck failed: {e}");
            None
        });

        let jupiter_listed = jupiter_listed.unwrap_or(false);

        // Build safety input from aggregated data
        let (mint_disabled, freeze_disabled, top_holder_pct, liquidity_usd, rugcheck_ok) =
            if let Some(rc) = &rugcheck {
                let top_holder = rc.top_holders.first().map(|h| h.pct / 100.0).unwrap_or(0.5);
                let liquidity = rc.markets.iter()
                    .filter_map(|m| m.liquidity)
                    .sum::<f64>();
                let no_high_risk = rc.risks.iter().all(|r| r.score < 500);
                // RugCheck doesn't directly expose mint/freeze — use heuristic from risks
                let mint_ok = !rc.risks.iter().any(|r| r.name.to_lowercase().contains("mint"));
                let freeze_ok = !rc.risks.iter().any(|r| r.name.to_lowercase().contains("freeze"));
                (mint_ok, freeze_ok, top_holder, liquidity, no_high_risk)
            } else {
                (false, false, 0.5, 0.0, false)
            };

        let input = SafetyInput {
            mint_authority_disabled: mint_disabled,
            freeze_authority_disabled: freeze_disabled,
            jupiter_listed,
            top_holder_pct,
            liquidity_usd,
            rugcheck_ok,
        };

        let score = calculate_safety_score(&input);

        let summary = match score {
            80..=100 => "Low risk — passes key safety checks".into(),
            50..=79  => "Moderate risk — review before trading".into(),
            _        => "High risk — exercise extreme caution".into(),
        };

        Ok(SafetyReport {
            score,
            mint_authority_disabled: mint_disabled,
            freeze_authority_disabled: freeze_disabled,
            jupiter_listed,
            top_holder_pct,
            liquidity_usd,
            rugcheck_ok,
            summary,
        })
    }

    async fn fetch_rugcheck(&self, token: &str) -> Result<Option<RugCheckReport>> {
        let url = format!("https://api.rugcheck.xyz/v1/tokens/{}/report/summary", token);
        let resp = self.http.get(&url).send().await?;
        if !resp.status().is_success() {
            return Ok(None);
        }
        Ok(Some(resp.json().await?))
    }

    async fn check_jupiter_listed(&self, token: &str) -> Result<bool> {
        // Jupiter strict token list via Worker proxy (avoids CORS + rate limits)
        let resp = self.worker
            .get(&format!("/defi/jupiter-strict?mint={}", token))
            .send()
            .await?;
        Ok(resp.status().is_success())
    }
}
