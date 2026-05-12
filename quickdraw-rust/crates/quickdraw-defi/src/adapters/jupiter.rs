use anyhow::{bail, Result};
use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;
use solana_sdk::pubkey::Pubkey;
use std::time::Duration;
use tracing::debug;

/// Returns the local bind address for outgoing HTTP connections.
///
/// Defaults to `0.0.0.0` (force IPv4) because several Jupiter/Cloudflare
/// endpoints time out over IPv6 on common Linux network configurations.
/// Override by setting `QUICKDRAW_BIND_ADDR` in the environment:
///   - `""` or unset-equivalent → no binding (OS default, enables IPv6)
///   - `"0.0.0.0"` → force IPv4 (the default)
///   - `"::"` → force IPv6
fn local_bind_addr() -> Option<std::net::IpAddr> {
    match std::env::var("QUICKDRAW_BIND_ADDR").as_deref() {
        Ok("") => None,
        Ok(addr) => addr.parse().ok(),
        Err(_) => "0.0.0.0".parse().ok(),
    }
}

use quickdraw_core::types::AdapterQuote;
use crate::adapter::DefiAdapter;

// Jupiter Swap API v2 — requires x-api-key from portal.jup.ag (JUPITER_API_KEY env var)
const JUPITER_SWAP_API:  &str = "https://api.jup.ag/swap/v2";
const JUPITER_PRICE_API: &str = "https://api.jup.ag/price/v3";
const SOL_MINT:          &str = "So11111111111111111111111111111111111111112";
const USDC_MINT:         &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// v2 /order response — fields are optional because taker-less calls omit `transaction`
// and some routing metadata may vary by router.
#[derive(Debug, Deserialize)]
struct JupiterOrderResponse {
    transaction:                          Option<String>,
    #[serde(rename = "requestId")]
    request_id:                           Option<String>,
    router:                               Option<String>,
    // Quote fields present in v2 order responses
    #[serde(rename = "inAmount")]
    in_amount:                            Option<String>,
    #[serde(rename = "outAmount")]
    out_amount:                           Option<String>,
    #[serde(rename = "priceImpactPct")]
    price_impact_pct:                     Option<String>,
    #[serde(rename = "routePlan")]
    route_plan:                           Option<Vec<RoutePlan>>,
    #[serde(rename = "slippageBps")]
    slippage_bps:                         Option<u16>,
    error:                                Option<String>,
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

pub struct JupiterAdapter {
    client:   Client,
    api_base: String,
}

impl JupiterAdapter {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(8))
                .local_address(local_bind_addr())
                .build()
                .expect("reqwest client"),
            api_base: JUPITER_SWAP_API.to_string(),
        }
    }

    pub fn with_base_url(base_url: impl Into<String>) -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(8))
                .local_address(local_bind_addr())
                .build()
                .expect("reqwest client"),
            api_base: base_url.into(),
        }
    }

    fn get(&self, url: &str) -> reqwest::RequestBuilder {
        let rb = self.client.get(url);
        match std::env::var("JUPITER_API_KEY") {
            Ok(key) if !key.is_empty() => rb.header("x-api-key", key),
            _ => rb,
        }
    }
}

#[async_trait]
impl DefiAdapter for JupiterAdapter {
    fn name(&self) -> &str { "Jupiter" }

    async fn get_quote(&self, token_in: Pubkey, token_out: Pubkey, amount: u64) -> Result<AdapterQuote> {
        // No `taker` — quote-only call for price preview; transaction is built in build_transaction.
        let url = format!(
            "{}/order?inputMint={}&outputMint={}&amount={}&slippageBps=50",
            self.api_base, token_in, token_out, amount
        );

        debug!("Jupiter v2 order (preview): {url}");

        let resp = self.get(&url).send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            bail!("Jupiter /order error {status}: {body}");
        }

        let raw: serde_json::Value = resp.json().await?;
        // Store original params so build_transaction can reconstruct the /order call with taker.
        let raw_response = serde_json::json!({
            "inputMint":  token_in.to_string(),
            "outputMint": token_out.to_string(),
            "amount":     amount,
            "slippageBps": 50,
        }).to_string();

        let order: JupiterOrderResponse = serde_json::from_value(raw)?;

        if let Some(err) = order.error {
            bail!("Jupiter order error: {err}");
        }

        let route_label = order.route_plan.as_ref()
            .and_then(|p| p.first())
            .and_then(|r| r.swap_info.label.as_deref())
            .or(order.router.as_deref())
            .unwrap_or("Jupiter")
            .to_string();

        Ok(AdapterQuote {
            adapter_name: "Jupiter".into(),
            token_in,
            token_out,
            in_amount:        order.in_amount.as_deref().and_then(|s| s.parse().ok()).unwrap_or(amount),
            out_amount:       order.out_amount.as_deref().and_then(|s| s.parse().ok()).unwrap_or(0),
            price_impact_pct: order.price_impact_pct.as_deref().and_then(|s| s.parse().ok()).unwrap_or(0.0),
            slippage_bps:     order.slippage_bps.unwrap_or(50),
            fee_usd:          0.0,
            route_label,
            raw_response,
        })
    }

    async fn build_transaction(&self, quote: &AdapterQuote, wallet: Pubkey) -> Result<Vec<u8>> {
        // Re-call /order with taker to get the assembled versioned transaction.
        let url = format!(
            "{}/order?inputMint={}&outputMint={}&amount={}&slippageBps={}&taker={}",
            self.api_base, quote.token_in, quote.token_out,
            quote.in_amount, quote.slippage_bps, wallet
        );

        debug!("Jupiter v2 order (build tx): {url}");

        let resp = self.get(&url).send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let err = resp.text().await.unwrap_or_default();
            bail!("Jupiter /order (build) error {status}: {err}");
        }

        let order: JupiterOrderResponse = resp.json().await?;

        if let Some(err) = order.error {
            bail!("Jupiter order error: {err}");
        }

        let tx_b64 = order.transaction
            .ok_or_else(|| anyhow::anyhow!("Jupiter /order returned no transaction — ensure taker is valid"))?;

        debug!("Jupiter requestId: {:?}", order.request_id);

        let tx_bytes = base64::Engine::decode(
            &base64::engine::general_purpose::STANDARD,
            &tx_b64,
        )?;

        Ok(tx_bytes)
    }

    async fn get_price(&self, token: Pubkey) -> Result<f64> {
        let url = format!("{}?ids={}", JUPITER_PRICE_API, token);
        let resp = self.get(&url).send().await?;
        if !resp.status().is_success() {
            bail!("Jupiter price API error: {}", resp.status());
        }

        // v3 response is a flat map: { "{mint}": { usdPrice, liquidity, ... } }
        #[derive(Deserialize)]
        struct TokenPrice {
            #[serde(rename = "usdPrice")]
            usd_price: Option<f64>,
        }

        let map: std::collections::HashMap<String, TokenPrice> = resp.json().await?;
        let entry = map.get(&token.to_string())
            .ok_or_else(|| anyhow::anyhow!("token not found in Jupiter price v3 response"))?;

        entry.usd_price
            .filter(|&p| p > 0.0)
            .ok_or_else(|| anyhow::anyhow!("missing or zero price for {token}"))
    }

    async fn health_check(&self) -> bool {
        let url = format!(
            "{}/order?inputMint={}&outputMint={}&amount=1000000000&slippageBps=50",
            self.api_base, SOL_MINT, USDC_MINT
        );
        self.get(&url).send().await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }
}
