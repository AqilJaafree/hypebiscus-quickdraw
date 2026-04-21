use anyhow::Result;
use async_trait::async_trait;
use solana_sdk::pubkey::Pubkey;

#[async_trait]
pub trait WalletBridge: Send + Sync {
    async fn connect(&self) -> Result<Pubkey>;
    async fn disconnect(&self) -> Result<()>;
    async fn sign_transaction(&self, tx_bytes: &[u8]) -> Result<Vec<u8>>;
    fn is_connected(&self) -> bool;
}
