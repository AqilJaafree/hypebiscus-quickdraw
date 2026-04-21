use anyhow::Result;
use solana_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;

pub struct RpcWithFallback {
    primary: RpcClient,
    fallback: RpcClient,
}

impl RpcWithFallback {
    pub fn new(primary_url: &str, fallback_url: &str) -> Self {
        Self {
            primary: RpcClient::new_with_commitment(
                primary_url.to_string(),
                CommitmentConfig::confirmed(),
            ),
            fallback: RpcClient::new_with_commitment(
                fallback_url.to_string(),
                CommitmentConfig::confirmed(),
            ),
        }
    }

    pub fn primary(&self) -> &RpcClient { &self.primary }
    pub fn fallback(&self) -> &RpcClient { &self.fallback }
}
