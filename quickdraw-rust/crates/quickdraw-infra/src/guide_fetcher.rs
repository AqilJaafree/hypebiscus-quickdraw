use anyhow::Result;
use futures::StreamExt;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{info, warn};

use quickdraw_core::guide::GuideStep;

type HmacSha256 = Hmac<Sha256>;

const GUIDE_PROMPT: &str = "\
You are a DeFi guide for Solana traders.\n\
Return step-by-step instructions for their request — one step per line, numbered.\n\
You know the standard pixel layout of common DeFi apps at 1280 px wide. \
Use this knowledge to include [POINT:x,y:label] tags for any step that targets a known UI element.\n\
\n\
Known layouts (x,y in 1280-wide coordinate space):\n\
jup.ag — Connect Wallet: [POINT:1130,45:wallet btn] | From-token pill: [POINT:400,285:sell token] | \
Sell amount input: [POINT:840,285:sell amount] | Swap-direction arrow: [POINT:640,365:swap arrow] | \
To-token pill: [POINT:400,385:buy token] | Swap button: [POINT:640,480:swap btn] | \
Slippage gear icon: [POINT:1070,245:slippage]\n\
birdeye.so — Search bar: [POINT:640,60:search] | Swap tab: [POINT:200,130:swap tab]\n\
app.uniswap.org — Swap button: [POINT:640,420:swap btn] | Token selector: [POINT:560,310:token in]\n\
twitter.com / x.com — Post composer: [POINT:590,175:compose] | Search: [POINT:590,60:search]\n\
\n\
Rules:\n\
- Maximum 8 steps\n\
- Keep each step to one sentence\n\
- SKIP generic navigation steps like 'open your browser' — assume the user is already on the page\n\
- Start with the first on-page action\n\
- Include [POINT:x,y:label] for EVERY step — use the layout table above, or estimate if unknown\n\
- Return ONLY the numbered steps — no intro, no conclusion";

pub async fn fetch_guide_steps(
    transcript: &str,
    worker_url: &str,
    app_secret: &str,
) -> Vec<GuideStep> {
    let body = serde_json::json!({
        "max_tokens": 1024,
        "stream": true,
        "system": GUIDE_PROMPT,
        "messages": [{ "role": "user", "content": transcript }]
    });

    match post_and_drain(body, worker_url, app_secret).await {
        Ok(steps) => steps,
        Err(e) => { warn!("guide_fetcher: {e}"); vec![] }
    }
}

async fn post_and_drain(
    body: serde_json::Value,
    worker_url: &str,
    app_secret: &str,
) -> Result<Vec<GuideStep>> {
    let (ts, sig) = sign(app_secret, "/ai/fast");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .local_address("0.0.0.0".parse::<std::net::IpAddr>().ok())
        .build()?;

    let resp = client
        .post(format!("{worker_url}/ai/fast"))
        .header("X-Quickdraw-Timestamp", &ts)
        .header("X-Quickdraw-Sig", &sig)
        .header("Content-Type", "application/json")
        .body(serde_json::to_string(&body)?)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        anyhow::bail!("Worker returned {status}: {text}");
    }

    let full_text = drain_sse(resp).await?;
    info!("guide_fetcher: got {} chars from Claude", full_text.len());
    let steps = GuideStep::parse_response(&full_text);
    for (i, s) in steps.iter().enumerate() {
        info!("  step {}: {:?}  point={:?}", i + 1, s.text, s.point);
    }
    Ok(steps)
}

async fn drain_sse(resp: reqwest::Response) -> Result<String> {
    #[derive(serde::Deserialize)]
    struct SseEvent {
        #[serde(rename = "type")]
        kind: String,
        delta: Option<Delta>,
    }
    #[derive(serde::Deserialize)]
    struct Delta {
        text: Option<String>,
    }

    let mut buf    = String::new();
    let mut stream = resp.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk?;
        let text  = String::from_utf8_lossy(&bytes);
        for line in text.lines() {
            let Some(data) = line.strip_prefix("data: ") else { continue };
            if data == "[DONE]" { break; }
            if let Ok(event) = serde_json::from_str::<SseEvent>(data) {
                if event.kind == "content_block_delta" {
                    if let Some(d) = event.delta {
                        if let Some(t) = d.text { buf.push_str(&t); }
                    }
                }
            }
        }
    }

    Ok(buf)
}

fn sign(secret: &str, path: &str) -> (String, String) {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
        .to_string();

    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC key");
    mac.update(format!("{ts}.{path}").as_bytes());
    let sig = hex::encode(mac.finalize().into_bytes());
    (ts, sig)
}
