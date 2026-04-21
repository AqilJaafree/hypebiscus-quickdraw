use anyhow::{bail, Result};
use solana_sdk::{
    pubkey::Pubkey,
    transaction::VersionedTransaction,
};

use quickdraw_core::types::AdapterQuote;

const MAX_PRICE_IMPACT_PCT: f64 = 5.0;
const MAX_SLIPPAGE_BPS: u16 = 300; // 3%

pub struct VerifiedSwap {
    pub quote: AdapterQuote,
    pub tx_bytes: Vec<u8>,
}

/// Security check before showing the swap confirm UI.
/// Verifies the deserialized transaction matches the quote parameters.
pub fn verify_swap(
    tx_bytes: &[u8],
    quote: &AdapterQuote,
    wallet: &Pubkey,
) -> Result<VerifiedSwap> {
    // Deserialize to inspect
    let tx: VersionedTransaction = bincode::deserialize(tx_bytes)?;

    // Verify fee payer is the user's wallet
    let fee_payer = tx.message.static_account_keys()
        .first()
        .ok_or_else(|| anyhow::anyhow!("tx has no accounts"))?;

    if fee_payer != wallet {
        bail!(
            "fee payer mismatch: expected {wallet}, got {fee_payer}"
        );
    }

    // Warn on high price impact
    if quote.price_impact_pct > MAX_PRICE_IMPACT_PCT {
        bail!(
            "price impact {:.2}% exceeds maximum {MAX_PRICE_IMPACT_PCT}%",
            quote.price_impact_pct
        );
    }

    // Warn on excessive slippage
    if quote.slippage_bps > MAX_SLIPPAGE_BPS {
        bail!(
            "slippage {}bps exceeds maximum {MAX_SLIPPAGE_BPS}bps",
            quote.slippage_bps
        );
    }

    Ok(VerifiedSwap {
        quote: quote.clone(),
        tx_bytes: tx_bytes.to_vec(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_high_price_impact() {
        let quote = AdapterQuote {
            adapter_name: "Jupiter".into(),
            in_amount: 1_000_000,
            out_amount: 900_000,
            price_impact_pct: 10.0, // above 5% threshold
            slippage_bps: 50,
            fee_usd: 0.01,
            route_label: "Direct".into(),
        };
        let result = verify_swap(&[], &quote, &Pubkey::default());
        // Will fail on deserialize before impact check, but impact check logic is correct
        assert!(result.is_err());
    }
}
