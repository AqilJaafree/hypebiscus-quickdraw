use once_cell::sync::Lazy;
use regex::Regex;

pub static SOLANA_ADDRESS: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\b[1-9A-HJ-NP-Za-km-z]{32,44}\b").unwrap()
});

pub static TICKER_DOLLAR: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\$([A-Z]{2,10})\b").unwrap()
});

pub static DEXSCREENER_URL: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"dexscreener\.com/solana/([1-9A-HJ-NP-Za-km-z]{32,44})").unwrap()
});

pub static BIRDEYE_URL: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"birdeye\.so/token/([1-9A-HJ-NP-Za-km-z]{32,44})").unwrap()
});

pub static PUMP_FUN_URL: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"pump\.fun/([1-9A-HJ-NP-Za-km-z]{32,44})").unwrap()
});

pub static SOLSCAN_URL: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"solscan\.io/token/([1-9A-HJ-NP-Za-km-z]{32,44})").unwrap()
});

/// Extract all candidate Solana addresses from arbitrary text.
pub fn extract_addresses(text: &str) -> Vec<String> {
    let mut addrs: Vec<String> = Vec::new();

    for cap in SOLANA_ADDRESS.captures_iter(text) {
        addrs.push(cap[0].to_string());
    }

    for re in [&*DEXSCREENER_URL, &*BIRDEYE_URL, &*PUMP_FUN_URL, &*SOLSCAN_URL] {
        for cap in re.captures_iter(text) {
            addrs.push(cap[1].to_string());
        }
    }

    addrs.sort();
    addrs.dedup();
    addrs
}
