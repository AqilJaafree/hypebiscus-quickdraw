use anyhow::Result;
use hmac::{Hmac, Mac};
use reqwest::{Client, RequestBuilder};
use sha2::Sha256;
use std::time::{SystemTime, UNIX_EPOCH};

type HmacSha256 = Hmac<Sha256>;

#[derive(Clone)]
pub struct WorkerClient {
    client: Client,
    worker_url: String,
    secret: String,
}

impl WorkerClient {
    pub fn new(worker_url: impl Into<String>, secret: impl Into<String>) -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("reqwest client"),
            worker_url: worker_url.into(),
            secret: secret.into(),
        }
    }

    pub fn post(&self, path: &str) -> RequestBuilder {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            .to_string();

        let sig = self.sign(&ts, path);

        self.client
            .post(format!("{}{}", self.worker_url, path))
            .header("X-Quickdraw-Timestamp", &ts)
            .header("X-Quickdraw-Sig", sig)
    }

    pub fn get(&self, path: &str) -> RequestBuilder {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            .to_string();

        let sig = self.sign(&ts, path);

        self.client
            .get(format!("{}{}", self.worker_url, path))
            .header("X-Quickdraw-Timestamp", &ts)
            .header("X-Quickdraw-Sig", sig)
    }

    fn sign(&self, timestamp: &str, path: &str) -> String {
        let mut mac = HmacSha256::new_from_slice(self.secret.as_bytes())
            .expect("HMAC key");
        mac.update(format!("{}.{}", timestamp, path).as_bytes());
        hex::encode(mac.finalize().into_bytes())
    }
}
