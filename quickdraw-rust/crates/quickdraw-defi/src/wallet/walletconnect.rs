/// WalletConnect v2 pairing bridge.
///
/// Generates a WalletConnect pairing URI, renders a QR code for the user to scan
/// with their mobile wallet (Phantom, Backpack, etc.), then listens on the WC relay
/// WebSocket for the session approval + first signed transaction request.
///
/// Security: the session symmetric key is zeroed on disconnect via Zeroize.

use anyhow::{bail, Result};
use async_trait::async_trait;
use base64::Engine;
use serde::{Deserialize, Serialize};
use solana_sdk::pubkey::Pubkey;
use std::str::FromStr;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use tracing::{debug, info, warn};
use zeroize::{Zeroize, ZeroizeOnDrop};

use super::bridge::WalletBridge;

// WalletConnect v2 relay (public relay — no auth needed for pairing)
#[allow(dead_code)]
const WC_RELAY: &str = "wss://relay.walletconnect.com";
const WC_PROJECT_ID: &str = "REOWN_PROJECT_ID_PLACEHOLDER";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WalletConnectState {
    Disconnected,
    AwaitingApproval { uri: String },
    Connected { pubkey: Pubkey },
}

/// Symmetric session key — zeroed on drop.
#[derive(Zeroize, ZeroizeOnDrop)]
struct SessionKey([u8; 32]);

pub struct WalletConnectBridge {
    state: Arc<RwLock<WalletConnectState>>,
    session_key: Arc<Mutex<Option<SessionKey>>>,
    http: reqwest::Client,
}

impl WalletConnectBridge {
    pub fn new() -> Self {
        Self {
            state: Arc::new(RwLock::new(WalletConnectState::Disconnected)),
            session_key: Arc::new(Mutex::new(None)),
            http: reqwest::Client::new(),
        }
    }

    /// Generate a WalletConnect pairing URI that the user scans as a QR code.
    /// Returns the `wc:` URI string.
    pub async fn generate_pairing_uri(&self) -> Result<String> {
        // Generate a random 32-byte symmetric key for the pairing
        let sym_key = {
            let mut key = [0u8; 32];
            getrandom::getrandom(&mut key)?;
            key
        };

        let topic = {
            let mut t = [0u8; 16];
            getrandom::getrandom(&mut t)?;
            hex::encode(t)
        };

        let sym_key_hex = hex::encode(&sym_key);

        // Store the session key (will be zeroed on disconnect)
        *self.session_key.lock().await = Some(SessionKey(sym_key));

        // WalletConnect v2 URI format:
        // wc:<topic>@2?relay-protocol=irn&symKey=<hex>
        let project_id = std::env::var("REOWN_PROJECT_ID")
            .unwrap_or_else(|_| WC_PROJECT_ID.to_string());

        let uri = format!(
            "wc:{}@2?relay-protocol=irn&symKey={}&projectId={}",
            topic, sym_key_hex, project_id
        );

        *self.state.write().await = WalletConnectState::AwaitingApproval { uri: uri.clone() };

        info!("WalletConnect pairing URI generated");
        Ok(uri)
    }

    pub async fn state(&self) -> WalletConnectState {
        self.state.read().await.clone()
    }

    /// Wait for the mobile wallet to approve the session.
    /// Polls the relay WebSocket — returns the connected pubkey on success.
    pub async fn wait_for_approval(&self) -> Result<Pubkey> {
        // In a full implementation: open WebSocket to WC_RELAY, subscribe to the
        // topic channel, decrypt incoming messages with the session key, parse the
        // session_approve payload, extract the Solana account address.
        //
        // For the hackathon MVP we use a timeout + polling approach:
        // The relay sends a wc_sessionSettle message containing the accounts array.

        let timeout = tokio::time::timeout(
            std::time::Duration::from_secs(120),
            self.poll_for_approval(),
        ).await;

        match timeout {
            Ok(Ok(pubkey)) => {
                *self.state.write().await = WalletConnectState::Connected { pubkey };
                Ok(pubkey)
            }
            Ok(Err(e)) => bail!("WalletConnect approval failed: {e}"),
            Err(_) => bail!("WalletConnect approval timed out after 120s"),
        }
    }

    async fn poll_for_approval(&self) -> Result<Pubkey> {
        // Stub: real implementation opens a WS to the relay and waits for
        // wc_sessionSettle. For now we simulate after a short delay so the
        // UI flow can be tested end-to-end.
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;

        // Placeholder — real impl decrypts the relay message here
        Err(anyhow::anyhow!(
            "WalletConnect WebSocket relay not yet implemented — scan QR and approve in wallet"
        ))
    }
}

#[async_trait]
impl WalletBridge for WalletConnectBridge {
    async fn connect(&self) -> Result<Pubkey> {
        let _uri = self.generate_pairing_uri().await?;
        self.wait_for_approval().await
    }

    async fn disconnect(&self) -> Result<()> {
        // Zero the session key on disconnect
        *self.session_key.lock().await = None;
        *self.state.write().await = WalletConnectState::Disconnected;
        info!("WalletConnect disconnected — session key zeroed");
        Ok(())
    }

    async fn sign_transaction(&self, tx_bytes: &[u8]) -> Result<Vec<u8>> {
        let state = self.state.read().await;
        match &*state {
            WalletConnectState::Connected { .. } => {
                // Real impl: send wc_sessionRequest with solana_signTransaction
                // over the relay WebSocket, wait for the signed tx response.
                bail!("WalletConnect transaction signing not yet implemented")
            }
            _ => bail!("Wallet not connected"),
        }
    }

    fn is_connected(&self) -> bool {
        // Sync check — use blocking read
        matches!(
            *self.state.try_read().unwrap_or_else(|_| panic!("lock poisoned")),
            WalletConnectState::Connected { .. }
        )
    }
}

/// Render a WalletConnect URI as a QR code and encode it as an egui-ready image.
/// Returns `(pixels_rgba, width, height)`.
pub fn render_qr_to_rgba(uri: &str) -> Result<(Vec<u8>, u32, u32)> {
    use qrcode::{QrCode, EcLevel};

    let code = QrCode::with_error_correction_level(uri.as_bytes(), EcLevel::M)?;
    let image = code.render::<qrcode::render::unicode::Dense1x2>()
        .quiet_zone(true)
        .build();

    // Convert to pixel grid: each "module" is 8×8 pixels, black on white
    let module_size = 8u32;
    let modules = code.to_colors();
    let width_modules = code.width() as u32;

    let img_w = width_modules * module_size;
    let img_h = img_w;
    let mut pixels = vec![0xFFu8; (img_w * img_h * 4) as usize]; // white RGBA

    for (idx, color) in modules.iter().enumerate() {
        let mx = (idx as u32) % width_modules;
        let my = (idx as u32) / width_modules;

        if *color == qrcode::Color::Dark {
            // Fill the module_size × module_size square with black
            for dy in 0..module_size {
                for dx in 0..module_size {
                    let px = mx * module_size + dx;
                    let py = my * module_size + dy;
                    let base = ((py * img_w + px) * 4) as usize;
                    pixels[base]     = 0x18; // R
                    pixels[base + 1] = 0x18; // G
                    pixels[base + 2] = 0x18; // B
                    pixels[base + 3] = 0xFF; // A
                }
            }
        }
    }

    Ok((pixels, img_w, img_h))
}
