use egui::{Color32, Context, Margin, Rounding, Stroke, TextureHandle, Ui};
use tokio::sync::mpsc;

use quickdraw_core::{commands::Command, state::AppSnapshot};
use crate::design::{body, Colors, muted, Tokens};
use crate::widgets::{brutal_button, brutal_card, ghost_button};

/// State for the wallet connect panel (QR code + connection status).
pub struct WalletUiState {
    pub show_connect_panel: bool,
    pub qr_texture: Option<TextureHandle>,
    pub pairing_uri: Option<String>,
    pub error: Option<String>,
}

impl Default for WalletUiState {
    fn default() -> Self {
        Self {
            show_connect_panel: false,
            qr_texture: None,
            pairing_uri: None,
            error: None,
        }
    }
}

impl WalletUiState {
    /// Load the QR code for a pairing URI into an egui texture.
    pub fn load_qr(&mut self, ctx: &Context, uri: &str) {
        use quickdraw_defi::wallet::walletconnect::render_qr_to_rgba;

        match render_qr_to_rgba(uri) {
            Ok((pixels, w, h)) => {
                let image = egui::ColorImage::from_rgba_unmultiplied([w as usize, h as usize], &pixels);
                self.qr_texture = Some(ctx.load_texture("wc_qr", image, egui::TextureOptions::NEAREST));
                self.pairing_uri = Some(uri.to_string());
                self.error = None;
            }
            Err(e) => {
                self.error = Some(format!("QR render failed: {e}"));
            }
        }
    }
}

/// Wallet section shown in the main window toolbar / tray menu.
pub fn show_wallet_section(
    ui: &mut Ui,
    snap: &AppSnapshot,
    cmd_tx: &mpsc::Sender<Command>,
    wallet_ui: &mut WalletUiState,
    ctx: &Context,
) {
    ui.horizontal(|ui| {
        if let Some(pubkey) = snap.wallet_pubkey {
            let addr = pubkey.to_string();
            let short = format!("{}…{}", &addr[..4], &addr[addr.len()-4..]);
            ui.label(body(format!("Wallet: {short}")));
            if ghost_button(ui, "Disconnect").clicked() {
                let _ = cmd_tx.try_send(Command::DisconnectWallet);
            }
        } else {
            ui.label(muted("No wallet"));
            if brutal_button(ui, "Connect Wallet").clicked() {
                wallet_ui.show_connect_panel = true;
            }
        }
    });

    if wallet_ui.show_connect_panel && snap.wallet_pubkey.is_none() {
        show_connect_panel(ui, cmd_tx, wallet_ui, ctx);
    }
}

fn show_connect_panel(
    ui: &mut Ui,
    cmd_tx: &mpsc::Sender<Command>,
    wallet_ui: &mut WalletUiState,
    ctx: &Context,
) {
    egui::Window::new("##wallet_connect")
        .fixed_size([320.0, 400.0])
        .title_bar(false)
        .resizable(false)
        .frame(
            egui::Frame::none()
                .fill(Colors::OVERLAY_BG)
                .stroke(Stroke::new(Tokens::STROKE_WIDTH, Colors::STROKE))
                .inner_margin(Margin::same(16.0))
                .shadow(egui::epaint::Shadow {
                    offset: Tokens::SHADOW_OFFSET,
                    blur: 0.0,
                    spread: 0.0,
                    color: Colors::SHADOW,
                })
                .rounding(Rounding::ZERO),
        )
        .show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.label(
                    egui::RichText::new("CONNECT WALLET")
                        .size(13.0)
                        .strong()
                        .color(Colors::ACCENT_YELLOW),
                );
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ghost_button(ui, "✕").clicked() {
                        wallet_ui.show_connect_panel = false;
                    }
                });
            });

            ui.add_space(12.0);

            // QR code display
            if let Some(texture) = &wallet_ui.qr_texture {
                let size = egui::vec2(240.0, 240.0);
                // White background border around QR
                let (rect, _) = ui.allocate_exact_size(size + egui::vec2(16.0, 16.0), egui::Sense::hover());
                ui.painter().rect_filled(rect, 0.0, Color32::WHITE);
                let qr_rect = rect.shrink(8.0);
                ui.painter().image(texture.id(), qr_rect, egui::Rect::from_min_max(
                    egui::pos2(0.0, 0.0), egui::pos2(1.0, 1.0),
                ), Color32::WHITE);

                ui.add_space(8.0);
                ui.label(muted("Scan with Phantom, Backpack, or any WC v2 wallet"));

                if let Some(uri) = &wallet_ui.pairing_uri {
                    let uri_short = if uri.len() > 48 {
                        format!("{}…", &uri[..48])
                    } else {
                        uri.clone()
                    };
                    ui.add_space(4.0);
                    if ui.small_button("⎘ Copy URI").clicked() {
                        ui.output_mut(|o| o.copied_text = uri.clone());
                    }
                }
            } else if let Some(err) = &wallet_ui.error {
                ui.label(egui::RichText::new(err).size(12.0).color(Colors::DANGER));
            } else {
                ui.add_space(8.0);
                ui.vertical_centered(|ui| {
                    if brutal_button(ui, "Generate QR Code").clicked() {
                        // In the real app the engine generates the URI via WalletConnectBridge.
                        // For the UI demo we create a test URI inline.
                        let demo_uri = "wc:demo_topic@2?relay-protocol=irn&symKey=deadbeef00112233445566778899aabbccddeeff00112233445566778899aabb&projectId=quickdraw";
                        wallet_ui.load_qr(ctx, demo_uri);
                    }
                });
                ui.add_space(8.0);
                ui.label(muted("Supports Phantom, Backpack, Solflare, Ledger"));
            }
        });
}
