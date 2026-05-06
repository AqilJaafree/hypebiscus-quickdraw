use anyhow::{bail, Result};
use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use solana_sdk::pubkey::Pubkey;
use std::time::Duration;
use tracing::debug;

use quickdraw_core::types::AdapterQuote;
use crate::adapter::DefiAdapter;

// Jupiter Swap API v1 (current)
const JUPITER_API: &str = "https://lite-api.jup.ag/swap/v1";
const SOL_MINT:  &str = "So11111111111111111111111111111111111111112";
const USDC_MINT: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

#[derive(Debug, Deserialize)]
struct JupiterQuoteResponse {
    #[serde(rename = "inAmount")]
    in_amount: String,
    #[serde(rename = "outAmount")]
    out_amount: String,
    #[serde(rename = "priceImpactPct")]
    price_impact_pct: String,
    #[serde(rename = "routePlan")]
    route_plan: Vec<RoutePlan>,
    #[serde(rename = "slippageBps")]
    slippage_bps: u16,
}

#[derive(Debug, Deserialize)]
struct RoutePlan {
    #[serde(rename = "swapInfo")]
    swap_info: SwapInfo,
}

#[derive(Debug, Deserialize)]
struct SwapInfo {
    label: Option<String>,
}

#[derive(Debug, Serialize)]
struct JupiterSwapRequest {
    #[serde(rename = "quoteResponse")]
    quote_response: serde_json::Value,
    #[serde(rename = "userPublicKey")]
    user_public_key: String,
    #[serde(rename = "wrapAndUnwrapSol")]
    wrap_and_unwrap_sol: bool,
    #[serde(rename = "dynamicComputeUnitLimit")]
    dynamic_compute_unit_limit: bool,
    // "auto" lets Jupiter's Priority Fee API choose the optimal fee
    #[serde(rename = "prioritizationFeeLamports")]
    prioritization_fee_lamports: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct JupiterSwapResponse {
    #[serde(rename = "swapTransaction")]
    swap_transaction: String,
}

pub struct JupiterAdapter {
    client: Client,
    api_base: String,
}

impl JupiterAdapter {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(8))
                .build()
                .expect("reqwest client"),
            api_base: JUPITER_API.to_string(),
        }
    }

    pub fn with_base_url(base_url: impl Into<String>) -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(8))
                .build()
                .expect("reqwest client"),
            api_base: base_url.into(),
        }
    }
}

#[async_trait]
impl DefiAdapter for JupiterAdapter {
    fn name(&self) -> &str { "Jupiter" }

    async fn get_quote(&self, token_in: Pubkey, token_out: Pubkey, amount: u64) -> Result<AdapterQuote> {
        let url = format!(
            "{}/quote?inputMint={}&outputMint={}&amount={}&slippageBps=50&onlyDirectRoutes=false&restrictIntermediateTokens=true",
            self.api_base, token_in, token_out, amount
        );

        debug!("Jupiter quote: {url}");

        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            bail!("Jupiter quote error {status}: {body}");
        }

        // Keep the raw JSON — /swap requires the full quoteResponse object
        let raw: serde_json::Value = resp.json().await?;
        let raw_response = raw.to_string();

        let quote: JupiterQuoteResponse = serde_json::from_value(raw)?;

        let route_label = quote.route_plan
            .first()
            .and_then(|r| r.swap_info.label.as_deref())
            .unwrap_or("Jupiter")
            .to_string();

        Ok(AdapterQuote {
            adapter_name: "Jupiter".into(),
            token_in,
            token_out,
            in_amount:        quote.in_amount.parse().unwrap_or(amount),
            out_amount:       quote.out_amount.parse().unwrap_or(0),
            price_impact_pct: quote.price_impact_pct.parse().unwrap_or(0.0),
            slippage_bps:     quote.slippage_bps,
            fee_usd:          0.0,
            route_label,
            raw_response,
        })
    }

    async fn build_transaction(&self, quote: &AdapterQuote, wallet: Pubkey) -> Result<Vec<u8>> {
        let quote_response: serde_json::Value = serde_json::from_str(&quote.raw_response)
            .map_err(|e| anyhow::anyhow!("invalid raw quote JSON: {e}"))?;

        let swap_url = format!("{}/swap", self.api_base);
        let body = JupiterSwapRequest {
            quote_response,
            user_public_key: wallet.to_string(),
            wrap_and_unwrap_sol: true,
            dynamic_compute_unit_limit: true,
            prioritization_fee_lamports: serde_json::json!("auto"),
        };

        let resp = self.client.post(&swap_url).json(&body).send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let err = resp.text().await.unwrap_or_default();
            bail!("Jupiter /swap error {status}: {err}");
        }

        let swap: JupiterSwapResponse = resp.json().await?;
        let tx_bytes = base64::Engine::decode(
            &base64::engine::general_purpose::STANDARD,
            &swap.swap_transaction,
        )?;

        Ok(tx_bytes)
    }

    async fn get_price(&self, token: Pubkey) -> Result<f64> {
        // Jupiter price API lives at a separate endpoint from the swap API
        let url = format!("https://lite-api.jup.ag/price/v2?ids={}", token);
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            bail!("Jupiter price API error: {}", resp.status());
        }

        #[derive(Deserialize)]
        struct PriceResp { data: std::collections::HashMap<String, TokenPrice> }
        #[derive(Deserialize)]
        struct TokenPrice { price: String }

        let body: PriceResp = resp.json().await?;
        body.data
            .get(&token.to_string())
            .and_then(|d| d.price.parse().ok())
            .ok_or_else(|| anyhow::anyhow!("token not found in Jupiter price response"))
    }

    async fn health_check(&self) -> bool {
        // SOL → USDC quote with 1 SOL (1_000_000_000 lamports)
        let url = format!(
            "{}/quote?inputMint={}&outputMint={}&amount=1000000000&slippageBps=50",
            self.api_base, SOL_MINT, USDC_MINT
        );
        self.client.get(&url).send().await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }
}
