use std::sync::{Arc, RwLock};
use egui::{FontDefinitions, Margin, Rounding, Stroke, Vec2};
use tokio::sync::mpsc;
use tracing::info;

use quickdraw_core::{commands::Command, state::AppSnapshot};
use crate::design::{Colors, Tokens};
use crate::overlay::show_overlay;
#[allow(unused_imports)]
use egui::Ui;

pub struct QuickdrawApp {
    snapshot: Arc<RwLock<AppSnapshot>>,
    cmd_tx: mpsc::Sender<Command>,
    address_input: String,
}

impl QuickdrawApp {
    pub fn new(
        cc: &eframe::CreationContext<'_>,
        snapshot: Arc<RwLock<AppSnapshot>>,
        cmd_tx: mpsc::Sender<Command>,
    ) -> Self {
        apply_neobrutalism_theme(&cc.egui_ctx);
        load_fonts(&cc.egui_ctx);

        Self {
            snapshot,
            cmd_tx,
            address_input: String::new(),
        }
    }
}

impl eframe::App for QuickdrawApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // Clone snapshot once — zero lock contention on the render path
        let snap = self.snapshot.read().unwrap().clone();

        // Main status window
        egui::CentralPanel::default()
            .frame(
                egui::Frame::none()
                    .fill(Colors::PANEL_BG)
                    .inner_margin(Margin::symmetric(16.0, 12.0)),
            )
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    ui.label(
                        egui::RichText::new("⚡ Quickdraw")
                            .size(16.0)
                            .strong()
                            .color(Colors::TEXT_PRIMARY),
                    );

                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        let mode_label = format!("{:?}", snap.ai_mode);
                        ui.label(
                            egui::RichText::new(mode_label)
                                .size(10.0)
                                .color(egui::Color32::GRAY),
                        );
                    });
                });

                ui.add_space(4.0);

                let status = if snap.wallet_pubkey.is_some() {
                    let addr = snap.wallet_pubkey.unwrap().to_string();
                    format!("Wallet: {}…{}", &addr[..4], &addr[addr.len()-4..])
                } else {
                    "Wallet: not connected".into()
                };
                ui.label(egui::RichText::new(status).size(11.0).color(egui::Color32::GRAY));

                ui.add_space(4.0);
                ui.label(
                    egui::RichText::new("Watching clipboard for token addresses…")
                        .size(11.0)
                        .color(egui::Color32::GRAY),
                );

                // Manual address input — bypasses clipboard, goes through real engine pipeline
                ui.add_space(6.0);
                ui.horizontal(|ui| {
                    let input = egui::TextEdit::singleline(&mut self.address_input)
                        .hint_text("Paste address here…")
                        .desired_width(200.0);
                    let response = ui.add(input);

                    let submitted = response.lost_focus()
                        && ctx.input(|i| i.key_pressed(egui::Key::Enter));

                    if crate::widgets::brutal_button(ui, "Detect").clicked() || submitted {
                        let addr = self.address_input.trim().to_string();
                        if !addr.is_empty() {
                            let pubkey: solana_sdk::pubkey::Pubkey = addr.parse()
                                .unwrap_or_default();
                            println!("DETECT clicked: addr={addr} pubkey={pubkey}");
                            match self.cmd_tx.try_send(
                                quickdraw_core::commands::Command::TokenDetected(
                                    quickdraw_core::types::DetectionEvent {
                                        address: pubkey,
                                        position: quickdraw_core::types::Point { x: 100.0, y: 100.0 },
                                        source: quickdraw_core::types::DetectionSource::Manual,
                                        raw_text: addr.clone(),
                                    }
                                )
                            ) {
                                Ok(_)  => println!("DETECT: command sent OK"),
                                Err(e) => println!("DETECT ERROR: {e}"),
                            }
                            self.address_input.clear();
                        }
                    }
                });

                ui.add_space(4.0);
                if crate::widgets::ghost_button(ui, "Demo (fake data)").clicked() {
                    let mut lock = self.snapshot.write().unwrap();
                    *lock = demo_snapshot();
                    ctx.request_repaint();
                }

                // Token card rendered inline — no floating Window/Area so no
                // Sense::click_and_drag on a background rect keeping repaint hot.
                if snap.overlay_visible {
                    ui.add_space(8.0);
                    show_overlay(ui, &snap, &self.cmd_tx);
                }
            });


    }
}

/// Test data snapshot — lets us validate the UI without live detection.
pub fn demo_snapshot() -> AppSnapshot {
    use quickdraw_core::types::{AdapterQuote, SafetyReport, TokenPrice};
    use quickdraw_core::state::AiMode;
    use solana_sdk::pubkey::Pubkey;
    use std::str::FromStr;

    let bonk = Pubkey::from_str("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263").unwrap_or_default();

    AppSnapshot {
        overlay_visible: true,
        overlay_position: quickdraw_core::types::Point { x: 80.0, y: 80.0 },
        token_address: Some(bonk),
        safety_report: Some(SafetyReport {
            score: 82,
            mint_authority_disabled: true,
            freeze_authority_disabled: true,
            jupiter_listed: true,
            top_holder_pct: 0.08,
            liquidity_usd: 4_200_000.0,
            rugcheck_ok: true,
            summary: "Low risk — passes all major safety checks. Strong liquidity, no mint authority.".into(),
        }),
        token_price: Some(TokenPrice {
            price_usd: 0.000_021_4,
            change_24h_pct: 12.3,
            volume_24h_usd: 38_400_000.0,
            market_cap_usd: Some(1_430_000_000.0),
        }),
        quotes: vec![
            AdapterQuote {
                adapter_name: "Jupiter".into(),
                in_amount: 1_000_000_000,
                out_amount: 46_728_301,
                price_impact_pct: 0.02,
                slippage_bps: 50,
                fee_usd: 0.003,
                route_label: "Orca Whirlpool".into(),
            },
            AdapterQuote {
                adapter_name: "Orca".into(),
                in_amount: 1_000_000_000,
                out_amount: 46_510_100,
                price_impact_pct: 0.08,
                slippage_bps: 50,
                fee_usd: 0.005,
                route_label: "Orca Direct".into(),
            },
        ],
        ai_narration: Some(
            "BONK is Solana's flagship community meme coin. Strong liquidity and wide exchange listing \
             suggest established market presence. Up 12.3% today on elevated volume — consistent with \
             broader Solana ecosystem momentum.".into()
        ),
        ai_streaming: false,
        ai_mode: AiMode::Auto,
        version: 1,
        ..Default::default()
    }
}

pub fn apply_neobrutalism_theme(ctx: &egui::Context) {
    let mut visuals = egui::Visuals::light();
    let stroke = Stroke::new(Tokens::STROKE_WIDTH, Colors::STROKE);

    visuals.widgets.inactive.bg_fill   = Colors::PANEL_BG;
    visuals.widgets.inactive.bg_stroke = stroke;
    visuals.widgets.inactive.rounding  = Rounding::ZERO;

    visuals.widgets.hovered.bg_fill    = Colors::ACCENT_YELLOW;
    visuals.widgets.hovered.bg_stroke  = stroke;
    visuals.widgets.hovered.rounding   = Rounding::ZERO;

    visuals.widgets.active.bg_fill     = Colors::ACCENT_YELLOW;
    visuals.widgets.active.bg_stroke   = stroke;
    visuals.widgets.active.rounding    = Rounding::ZERO;
    visuals.widgets.active.expansion   = -1.0;

    visuals.window_fill     = Colors::PANEL_BG;
    visuals.window_stroke   = stroke;
    visuals.window_rounding = Rounding::ZERO;

    visuals.window_shadow = egui::epaint::Shadow {
        offset: Tokens::SHADOW_OFFSET,
        blur: 0.0,
        spread: 0.0,
        color: Colors::SHADOW,
    };
    visuals.popup_shadow = visuals.window_shadow;

    ctx.set_visuals(visuals);
}

fn load_fonts(ctx: &egui::Context) {
    // Default egui fonts work fine; Space Grotesk can be added by placing
    // assets/SpaceGrotesk-Bold.ttf and uncommenting the block below.
    //
    // let mut fonts = FontDefinitions::default();
    // fonts.font_data.insert(
    //     "SpaceGrotesk".to_owned(),
    //     egui::FontData::from_static(include_bytes!("../assets/SpaceGrotesk-Bold.ttf")),
    // );
    // fonts.families.get_mut(&egui::FontFamily::Proportional)
    //     .unwrap().insert(0, "SpaceGrotesk".to_owned());
    // ctx.set_fonts(fonts);
}
