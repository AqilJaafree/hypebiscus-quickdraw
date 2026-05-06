use egui::{Color32, Margin, RichText, Stroke, Ui};
use tokio::sync::mpsc;

use quickdraw_core::{commands::Command, state::AppSnapshot};
use solana_sdk::pubkey::Pubkey;
use crate::design::Colors;

// Wrapped SOL mint — token_in for all BUY swaps
const SOL_MINT: &str = "So11111111111111111111111111111111111111112";

// ── Shared colors ────────────────────────────────────────────────────────────
const SWAP_BG:          Color32 = Color32::from_rgb(0x0D, 0x0D, 0x0D);
const INPUT_BG:         Color32 = Color32::from_rgb(0x1E, 0x1E, 0x1E);
const BORDER_DIM:       Color32 = Color32::from_rgb(0x55, 0x55, 0x55);
const TEXT_DIM:         Color32 = Color32::from_rgb(0x55, 0x55, 0x55);
const TEXT_QUOTE:       Color32 = Color32::from_rgb(0x88, 0x88, 0x88);
const BTN_DISABLED_BG:  Color32 = Color32::from_rgb(0x1A, 0x1A, 0x1A);

// ── No-wallet state — muted but readable, matches Pencil design ──────────────
const NW_INPUT_BG:      Color32 = Color32::from_rgb(0x18, 0x18, 0x18);
const NW_INPUT_BORDER:  Color32 = Color32::from_rgb(0x3a, 0x3a, 0x3a);
const NW_TEXT:          Color32 = Color32::from_rgb(0x4a, 0x4a, 0x4a);
const NW_MAX_BG:        Color32 = Color32::from_rgb(0x1a, 0x1a, 0x1a);
const NW_QUOTE_BG:      Color32 = Color32::from_rgb(0x12, 0x12, 0x12);
const NW_QUOTE_BORDER:  Color32 = Color32::from_rgb(0x3a, 0x3a, 0x3a);
const NW_BTN_BG:        Color32 = Color32::from_rgb(0x1a, 0x1a, 0x1a);
const NW_BTN_BORDER:    Color32 = Color32::from_rgb(0x3a, 0x3a, 0x3a);
const NW_HINT:          Color32 = Color32::from_rgb(0x55, 0x55, 0x55);

#[derive(Clone, PartialEq, Default)]
pub enum SwapUiStatus {
    #[default]
    Idle,
    Fetching,
    Ready,
    Confirming,
    Success,
    Error(String),
}

#[derive(Clone, Default)]
pub struct SwapUiState {
    pub amount_str:       String,
    pub status:           SwapUiStatus,
    pub last_fetched:     String,
    pub last_input_time:  f64,  // egui time of most recent keystroke
    pub pending_fetch:    bool, // debounce: fetch queued but not yet sent
    pub confirming_since: f64,  // egui time when Confirming started (0 = not set)
    pub token_address:    Option<Pubkey>, // which token this state belongs to
}

pub fn show_swap_panel(
    ui: &mut Ui,
    snap: &AppSnapshot,
    cmd_tx: &mpsc::Sender<Command>,
) {
    let state_id = egui::Id::new("swap_ui_state");
    let mut state: SwapUiState = ui.ctx().data_mut(|d| d.get_temp(state_id).unwrap_or_default());

    // Reset all swap UI state when the token changes — prevents Confirming/Success
    // status from a previous token bleeding into the new overlay.
    if state.token_address != snap.token_address {
        state = SwapUiState::default();
        state.token_address = snap.token_address;
    }

    let ticker = snap.token_ticker.as_deref()
        .or(snap.safety_report.as_ref().and_then(|r| r.ticker.as_deref()))
        .unwrap_or("TOKEN");

    let has_wallet = snap.wallet_pubkey.is_some();
    let has_amount = !state.amount_str.is_empty()
        && state.amount_str.parse::<f64>().map(|v| v > 0.0).unwrap_or(false);
    let has_quotes = !snap.quotes.is_empty();

    // Derive button state
    let (btn_label, btn_active, btn_bg, btn_text, btn_border) = if !has_wallet {
        ("LOGIN", false, NW_BTN_BG, Color32::from_rgb(0x66, 0x66, 0x66), NW_BTN_BORDER)
    } else if !has_amount {
        ("ENTER AMOUNT", false, BTN_DISABLED_BG, TEXT_DIM, Color32::from_rgb(0x33, 0x33, 0x33))
    } else if state.status == SwapUiStatus::Fetching {
        ("FETCHING…", false, BTN_DISABLED_BG, TEXT_DIM, Color32::from_rgb(0x33, 0x33, 0x33))
    } else if has_quotes && state.status == SwapUiStatus::Ready {
        ("BUY", true, Colors::ACCENT_YELLOW, Color32::BLACK, Color32::BLACK)
    } else if state.status == SwapUiStatus::Confirming {
        ("CONFIRMING…", false, BTN_DISABLED_BG, TEXT_DIM, Color32::from_rgb(0x33, 0x33, 0x33))
    } else if state.status == SwapUiStatus::Success {
        ("✓ SWAPPED", false, Colors::SAFE, Color32::BLACK, Color32::BLACK)
    } else if let SwapUiStatus::Error(_) = &state.status {
        ("RETRY", true, Colors::DANGER, Color32::WHITE, Color32::BLACK)
    } else {
        ("ENTER AMOUNT", false, BTN_DISABLED_BG, TEXT_DIM, Color32::from_rgb(0x33, 0x33, 0x33))
    };

    let show_quote = matches!(
        state.status,
        SwapUiStatus::Ready | SwapUiStatus::Confirming | SwapUiStatus::Success | SwapUiStatus::Error(_)
    ) && has_quotes;

    let input_disabled = !has_wallet
        || state.status == SwapUiStatus::Confirming
        || state.status == SwapUiStatus::Success;

    egui::Frame::none()
        .fill(SWAP_BG)
        .inner_margin(Margin::ZERO)
        .show(ui, |ui| {
            // Drag zone — Wayland requires StartDrag in the same frame as the press
            // (compositor serial expires immediately). Direct pointer check bypasses
            // egui's widget interaction layer which only confirms after movement threshold.
            {
                let drag_rect = egui::Rect::from_min_size(
                    ui.cursor().min,
                    egui::vec2(ui.available_width(), 32.0),
                );
                let in_zone = ui.input(|i| {
                    i.pointer.hover_pos().map_or(false, |p| drag_rect.contains(p))
                });
                // primary_pressed: fires exactly once on the frame the button goes down
                let just_pressed = ui.input(|i| i.pointer.primary_pressed());
                // drag_started fallback for X11 / non-Wayland
                let dr = ui.interact(drag_rect, egui::Id::new("swap_drag"), egui::Sense::drag());
                if (in_zone && just_pressed) || dr.drag_started() {
                    ui.ctx().send_viewport_cmd(egui::ViewportCommand::StartDrag);
                }
            }

            // ── Header ──────────────────────────────────────────────────────
            egui::Frame::none()
                .fill(SWAP_BG)
                .inner_margin(Margin { left: 12.0, right: 12.0, top: 8.0, bottom: 7.0 })
                .show(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.label(
                            RichText::new(format!("BUY {}", ticker))
                                .size(10.0).strong().monospace()
                                .color(Colors::ACCENT_YELLOW),
                        );
                        if !has_wallet {
                            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                                ui.label(RichText::new("wallet req'd").size(9.0).monospace().color(NW_HINT));
                            });
                        }
                    });
                });

            ui.separator();

            // ── Body ────────────────────────────────────────────────────────
            egui::Frame::none()
                .fill(SWAP_BG)
                .inner_margin(Margin { left: 12.0, right: 12.0, top: 8.0, bottom: 10.0 })
                .show(ui, |ui| {
                    ui.set_width(ui.available_width());
                    ui.spacing_mut().item_spacing.y = 7.0;

                    // ── Input row ────────────────────────────────────────────
                    ui.horizontal(|ui| {
                        let (input_fill, input_border) = if !has_wallet {
                            (NW_INPUT_BG, NW_INPUT_BORDER)
                        } else if has_quotes && state.status == SwapUiStatus::Ready {
                            (INPUT_BG, Colors::ACCENT_YELLOW)
                        } else {
                            (INPUT_BG, BORDER_DIM)
                        };

                        let dash_color = if !has_wallet { NW_TEXT } else { TEXT_DIM };
                        let sol_color  = if !has_wallet { NW_TEXT } else { TEXT_QUOTE };

                        // MAX frame = 36px content + 10+10 margins = 56px total
                        // Input frame also has 10+10 margins that must be subtracted
                        let max_frame_w = 36.0 + 20.0; // 56
                        let spacing = ui.spacing().item_spacing.x;
                        let input_frame_margins = 20.0; // left:10 + right:10
                        let input_w = (ui.available_width() - max_frame_w - spacing - input_frame_margins).max(40.0);

                        egui::Frame::none()
                            .fill(input_fill)
                            .stroke(Stroke::new(1.5, input_border))
                            .inner_margin(Margin { left: 10.0, right: 10.0, top: 0.0, bottom: 0.0 })
                            .show(ui, |ui| {
                                ui.set_min_size(egui::vec2(input_w, 30.0));
                                ui.horizontal(|ui| {
                                    if input_disabled {
                                        ui.label(RichText::new("—").size(13.0).strong().monospace().color(dash_color));
                                    } else {
                                        let te = egui::TextEdit::singleline(&mut state.amount_str)
                                            .desired_width((input_w - 30.0).max(20.0))
                                            .font(egui::TextStyle::Monospace)
                                            .text_color(Color32::WHITE)
                                            .frame(false)
                                            .hint_text("0.0");
                                        if ui.add(te).changed() {
                                            // Record keystroke time; fire fetch after 400 ms debounce
                                            state.last_input_time = ui.input(|i| i.time);
                                            state.pending_fetch = true;
                                            state.status = SwapUiStatus::Idle;
                                        }
                                    }
                                    ui.label(RichText::new("SOL").size(10.0).monospace().color(sol_color));
                                });
                            });

                        // MAX button
                        let (max_fill, max_border, max_text) = if !has_wallet {
                            (NW_MAX_BG, NW_INPUT_BORDER, NW_TEXT)
                        } else {
                            (INPUT_BG, BORDER_DIM, Color32::WHITE)
                        };

                        egui::Frame::none()
                            .fill(max_fill)
                            .stroke(Stroke::new(1.5, max_border))
                            .inner_margin(Margin::symmetric(10.0, 0.0))
                            .show(ui, |ui| {
                                ui.set_enabled(has_wallet && !input_disabled);
                                let max_btn = ui.add_sized(
                                    egui::vec2(36.0, 30.0),
                                    egui::Button::new(
                                        RichText::new("MAX").size(10.0).strong().monospace().color(max_text)
                                    )
                                    .fill(Color32::TRANSPARENT)
                                    .stroke(Stroke::NONE),
                                );
                                if max_btn.clicked() {
                                    state.amount_str = "0.5".to_owned();
                                    if dispatch_fetch_quotes(&state.amount_str, snap, cmd_tx).is_ok() {
                                        state.status = SwapUiStatus::Fetching;
                                    }
                                }
                            });
                    });

                    // ── Arrow ────────────────────────────────────────────────
                    let arrow_color = if !has_wallet { NW_TEXT } else { TEXT_QUOTE };
                    ui.with_layout(egui::Layout::top_down(egui::Align::Center), |ui| {
                        ui.label(RichText::new("↓").size(12.0).color(arrow_color));
                    });

                    // ── Quote area ───────────────────────────────────────────
                    if show_quote {
                        if let Some(q) = snap.quotes.first() {
                            let impact_color = if q.price_impact_pct > 2.0 { Colors::DANGER } else { TEXT_QUOTE };
                            // Use decimals from the safety report; fall back to 6 (most SPL tokens)
                            let decimals = snap.safety_report.as_ref()
                                .map(|r| r.decimals)
                                .unwrap_or(6);
                            let out_human = q.out_amount as f64 / 10f64.powi(decimals as i32);
                            let out_str = if decimals <= 2 {
                                format!("{:.0}", out_human)
                            } else {
                                format!("{:.4}", out_human)
                            };
                            ui.vertical(|ui| {
                                ui.label(
                                    RichText::new(format!("~{} {}", out_str, ticker))
                                        .size(12.0).strong().monospace().color(Color32::WHITE),
                                );
                                ui.horizontal(|ui| {
                                    ui.label(RichText::new(format!("Route: {}", q.route_label)).size(9.0).monospace().color(TEXT_QUOTE));
                                    ui.label(RichText::new(format!("• Impact: {:.1}%", q.price_impact_pct)).size(9.0).monospace().color(impact_color));
                                });
                            });
                        }
                    } else {
                        // Fixed-height placeholder (28px) — dashed outline
                        let (ph_fill, ph_dash) = if !has_wallet {
                            (NW_QUOTE_BG, NW_QUOTE_BORDER)
                        } else {
                            (Color32::from_rgb(0x11, 0x11, 0x11), Color32::from_rgb(0x44, 0x44, 0x44))
                        };
                        let ph_text = if !has_wallet { NW_QUOTE_BORDER } else { Color32::from_rgb(0x44, 0x44, 0x44) };

                        let w = ui.available_width();
                        let (rect, _) = ui.allocate_exact_size(egui::vec2(w, 28.0), egui::Sense::hover());
                        ui.painter().rect_filled(rect, 0.0, ph_fill);
                        let stroke = Stroke::new(1.0, ph_dash);
                        let mut shapes = Vec::with_capacity(32);
                        shapes.extend(egui::Shape::dashed_line(&[rect.left_top(),   rect.right_top()],    stroke, 4.0, 4.0));
                        shapes.extend(egui::Shape::dashed_line(&[rect.right_top(),  rect.right_bottom()], stroke, 4.0, 4.0));
                        shapes.extend(egui::Shape::dashed_line(&[rect.right_bottom(), rect.left_bottom()],stroke, 4.0, 4.0));
                        shapes.extend(egui::Shape::dashed_line(&[rect.left_bottom(), rect.left_top()],    stroke, 4.0, 4.0));
                        ui.painter().extend(shapes);
                        ui.painter().text(
                            rect.center(),
                            egui::Align2::CENTER_CENTER,
                            "quote appears here",
                            egui::FontId::new(9.0, egui::FontFamily::Monospace),
                            ph_text,
                        );
                    }

                    // ── Action button ────────────────────────────────────────
                    let action = ui.add(
                        egui::Button::new(
                            RichText::new(btn_label).size(11.0).strong().monospace().color(btn_text)
                        )
                        .fill(btn_bg)
                        .stroke(Stroke::new(if btn_active { 2.0 } else { 1.0 }, btn_border))
                        .rounding(egui::Rounding::ZERO)
                        .min_size(egui::vec2(ui.available_width(), 34.0)),
                    );

                    if action.clicked() && btn_active {
                        if let SwapUiStatus::Error(_) = &state.status {
                            state.status = SwapUiStatus::Fetching;
                        } else if state.status == SwapUiStatus::Ready {
                            if let Some(quote) = snap.quotes.first() {
                                // SelectQuote moves FSM to AwaitingSwapConfirm; ConfirmSwap
                                // then emits SideEffect::SignTransaction from that state.
                                let r1 = cmd_tx.try_send(Command::SelectQuote(quote.clone()));
                                let r2 = cmd_tx.try_send(Command::ConfirmSwap);
                                if r1.is_ok() && r2.is_ok() {
                                    state.status = SwapUiStatus::Confirming;
                                    state.confirming_since = ui.input(|i| i.time);
                                } else {
                                    state.status = SwapUiStatus::Error("Failed to submit swap — try again".into());
                                }
                            }
                        }
                    }

                    // ── Status text ─────────────────────────────────────────
                    if has_wallet {
                        match &state.status {
                            SwapUiStatus::Fetching => {
                                ui.with_layout(egui::Layout::top_down(egui::Align::Center), |ui| {
                                    ui.label(RichText::new("Fetching Jupiter quote…").size(9.0).monospace().color(TEXT_QUOTE));
                                });
                            }
                            SwapUiStatus::Success => {
                                ui.with_layout(egui::Layout::top_down(egui::Align::Center), |ui| {
                                    if let Some(ref sig) = snap.swap_signature {
                                        ui.hyperlink_to(
                                            RichText::new("✓ View on Solscan ↗").size(9.0).monospace().color(Colors::SAFE),
                                            format!("https://solscan.io/tx/{sig}"),
                                        );
                                    } else {
                                        ui.label(RichText::new("✓ Tx confirmed").size(9.0).monospace().color(Colors::SAFE));
                                    }
                                });
                            }
                            SwapUiStatus::Error(msg) => {
                                ui.with_layout(egui::Layout::top_down(egui::Align::Center), |ui| {
                                    ui.label(RichText::new(msg.as_str()).size(9.0).monospace().color(Colors::DANGER));
                                });
                            }
                            _ => {}
                        }
                    }
                });
        });

    // Transition: quotes arrived while fetching → ready
    if state.status == SwapUiStatus::Fetching && has_quotes {
        state.last_fetched = state.amount_str.clone();
        state.status = SwapUiStatus::Ready;
    }
    // Transition: quote fetch failed → error
    if state.status == SwapUiStatus::Fetching {
        if let Some(ref err) = snap.quote_error {
            state.status = SwapUiStatus::Error(err.clone());
        }
    }
    // Transition: swap submitted → success
    if state.status == SwapUiStatus::Confirming && snap.swap_signature.is_some() {
        state.status = SwapUiStatus::Success;
    }
    // Transition: confirming timed out (browser closed / signing rejected) → error
    if state.status == SwapUiStatus::Confirming && state.confirming_since > 0.0 {
        let now = ui.input(|i| i.time);
        if now - state.confirming_since > 90.0 {
            state.status = SwapUiStatus::Error("Sign timed out — try again".into());
            state.confirming_since = 0.0;
        } else {
            ui.ctx().request_repaint_after(std::time::Duration::from_secs(5));
        }
    }
    // Debounce: fire fetch 400 ms after last keystroke
    if state.pending_fetch {
        let now = ui.input(|i| i.time);
        let has_valid_amount = !state.amount_str.is_empty()
            && state.amount_str.parse::<f64>().map(|v| v > 0.0).unwrap_or(false);
        if now - state.last_input_time >= 0.4 {
            state.pending_fetch = false;
            if has_valid_amount && state.amount_str != state.last_fetched {
                if dispatch_fetch_quotes(&state.amount_str, snap, cmd_tx).is_ok() {
                    state.status = SwapUiStatus::Fetching;
                }
            }
        } else {
            ui.ctx().request_repaint_after(std::time::Duration::from_millis(80));
        }
    }

    ui.ctx().data_mut(|d| d.insert_temp(state_id, state));
}

/// Parse the SOL amount string and send FetchQuotes to the engine.
/// Returns Ok(()) only if the command was successfully enqueued.
fn dispatch_fetch_quotes(
    amount_str: &str,
    snap: &AppSnapshot,
    cmd_tx: &mpsc::Sender<Command>,
) -> Result<(), String> {
    let Some(token_out) = snap.token_address else { return Err("no token address".into()) };
    let Ok(sol) = amount_str.parse::<f64>() else { return Err("invalid amount".into()) };
    if sol <= 0.0 { return Err("zero amount".into()); }

    let Ok(token_in) = SOL_MINT.parse::<solana_sdk::pubkey::Pubkey>() else {
        return Err("invalid SOL mint".into())
    };
    let lamports = (sol * 1_000_000_000.0) as u64;

    cmd_tx.try_send(Command::FetchQuotes {
        token_in,
        token_out,
        amount: lamports,
    }).map_err(|e| e.to_string())
}
