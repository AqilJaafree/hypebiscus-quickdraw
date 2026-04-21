use anyhow::{bail, Result};
use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use solana_sdk::pubkey::Pubkey;
use std::time::Duration;
use tracing::{debug, warn};

use quickdraw_core::types::AdapterQuote;
use crate::adapter::DefiAdapter;

const JUPITER_API: &str = "https://quote-api.jup.ag/v6";
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
    #[serde(rename = "platformFee")]
    platform_fee: Option<PlatformFee>,
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

#[derive(Debug, Deserialize)]
struct PlatformFee {
    amount: Option<String>,
}

#[derive(Debug, Serialize)]
struct JupiterSwapRequest {
    #[serde(rename = "quoteResponse")]
    quote_response: serde_json::Value,
    #[serde(rename = "userPublicKey")]
    user_public_key: String,
    #[serde(rename = "wrapAndUnwrapSol")]
    wrap_and_unwrap_sol: bool,
    #[serde(rename = "computeUnitPriceMicroLamports")]
    compute_unit_price_micro_lamports: u64,
}

#[derive(Debug, Deserialize)]
struct JupiterSwapResponse {
    #[serde(rename = "swapTransaction")]
    swap_transaction: String,
}

#[derive(Debug, Deserialize)]
struct JupiterPriceResponse {
    data: std::collections::HashMap<String, TokenPriceData>,
}

#[derive(Debug, Deserialize)]
struct TokenPriceData {
    price: f64,
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
            "{}/quote?inputMint={}&outputMint={}&amount={}&slippageBps=50&onlyDirectRoutes=false",
            self.api_base, token_in, token_out, amount
        );

        debug!("Jupiter quote request: {url}");

        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            bail!("Jupiter API error {status}: {body}");
        }

        let raw: serde_json::Value = resp.json().await?;
        let quote: JupiterQuoteResponse = serde_json::from_value(raw.clone())?;

        let route_label = quote.route_plan
            .first()
            .and_then(|r| r.swap_info.label.as_deref())
            .unwrap_or("Jupiter")
            .to_string();

        Ok(AdapterQuote {
            adapter_name: "Jupiter".into(),
            in_amount: quote.in_amount.parse().unwrap_or(amount),
            out_amount: quote.out_amount.parse().unwrap_or(0),
            price_impact_pct: quote.price_impact_pct.parse().unwrap_or(0.0),
            slippage_bps: quote.slippage_bps,
            fee_usd: 0.0, // platform fee in lamports, convert later
            route_label,
        })
    }

    async fn build_transaction(&self, quote: &AdapterQuote, wallet: Pubkey) -> Result<Vec<u8>> {
        // Re-fetch the raw quote to pass back to /swap
        let url = format!(
            "{}/quote?inputMint={}&outputMint={}&amount={}&slippageBps={}",
            self.api_base,
            // Use the amounts from the quote to reconstruct params
            USDC_MINT, // placeholder — Phase 4 will pass full params
            USDC_MINT,
            quote.in_amount,
            quote.slippage_bps,
        );

        // Build swap transaction via Jupiter /swap endpoint
        let swap_url = format!("{}/swap", self.api_base);
        let body = serde_json::json!({
            "userPublicKey": wallet.to_string(),
            "wrapAndUnwrapSol": true,
            "computeUnitPriceMicroLamports": 1000,
            // quoteResponse omitted here — needs the full raw quote object
        });

        let resp = self.client.post(&swap_url).json(&body).send().await?;
        if !resp.status().is_success() {
            bail!("Jupiter /swap error: {}", resp.status());
        }

        let swap: JupiterSwapResponse = resp.json().await?;
        let tx_bytes = base64::Engine::decode(
            &base64::engine::general_purpose::STANDARD,
            &swap.swap_transaction,
        )?;

        Ok(tx_bytes)
    }

    async fn get_price(&self, token: Pubkey) -> Result<f64> {
        let url = format!("{}/price?ids={}", self.api_base, token);
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            bail!("Jupiter price API error: {}", resp.status());
        }

        let price_resp: JupiterPriceResponse = resp.json().await?;
        price_resp
            .data
            .get(&token.to_string())
            .map(|d| d.price)
            .ok_or_else(|| anyhow::anyhow!("token not found in Jupiter price response"))
    }

    async fn health_check(&self) -> bool {
        let url = format!("{}/quote?inputMint={}&outputMint={}&amount=1000000&slippageBps=50",
            self.api_base, USDC_MINT, USDC_MINT);
        self.client.get(&url).send().await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }
}
