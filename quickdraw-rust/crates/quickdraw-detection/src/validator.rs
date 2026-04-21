use anyhow::{bail, Result};
use solana_sdk::pubkey::Pubkey;
use std::str::FromStr;

const BASE58_CHARS: &str = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

pub fn validate_solana_address(raw: &str) -> Result<Pubkey> {
    let trimmed = raw.trim();

    if trimmed.len() < 32 || trimmed.len() > 44 {
        bail!("address length {} out of range", trimmed.len());
    }

    if !trimmed.chars().all(|c| BASE58_CHARS.contains(c)) {
        bail!("address contains invalid base58 characters");
    }

    Pubkey::from_str(trimmed).map_err(|e| anyhow::anyhow!("invalid pubkey: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_too_short() {
        assert!(validate_solana_address("tooshort").is_err());
    }

    #[test]
    fn rejects_invalid_chars() {
        assert!(validate_solana_address("0OIl111111111111111111111111111111111111111").is_err());
    }

    #[test]
    fn accepts_valid_pubkey() {
        // System program
        assert!(validate_solana_address("11111111111111111111111111111111").is_ok());
    }
}
