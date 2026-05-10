use crate::commands::Command;
use crate::state::{AppState, QuickdrawState};
use crate::types::{AdapterQuote, Point};

/// What the engine needs done — interpreted by the actor layer, never by the engine itself.
#[derive(Debug)]
pub enum SideEffect {
    FetchSafetyScore { address: solana_sdk::pubkey::Pubkey },
    FetchQuotes { token_in: solana_sdk::pubkey::Pubkey, token_out: solana_sdk::pubkey::Pubkey, amount: u64 },
    DispatchAiNarration { address: solana_sdk::pubkey::Pubkey },
    ShowOverlay { position: Point },
    DismissOverlay,
    SignTransaction { selected_quote: AdapterQuote },
    OpenWalletConnect,
    FetchYield { wallet: solana_sdk::pubkey::Pubkey },
    StartAudioCapture,
    StopAudioCapture,
    ParseVoiceIntent { transcript: String },
    FetchGuide(String),
    /// Move the system cursor to this point in ffmpeg-capture space (1280px wide).
    MoveCursorTo(f32, f32),
    Shutdown,
}

fn cursor_effect(state: &AppState) -> Vec<SideEffect> {
    match state.guide_steps.get(state.guide_step_index).and_then(|s| s.point) {
        Some((x, y)) => vec![SideEffect::MoveCursorTo(x, y)],
        None => vec![],
    }
}

fn dismiss_overlay(state: &mut AppState) {
    state.fsm = QuickdrawState::Idle;
    state.overlay_visible = false;
    state.token_address = None;
    state.safety_report = None;
    state.token_price = None;
    state.quotes = Vec::new();
    state.quote_error = None;
    state.swap_signature = None;
    state.ai_narration = None;
    state.ai_streaming = false;
    state.version += 1;
}

/// Pure FSM transition — given a command and current state, produce the next state + side effects.
/// No I/O, no async, fully unit-testable.
pub fn process(state: &mut AppState, cmd: Command) -> Vec<SideEffect> {
    match cmd {
        Command::TokenDetected(event) => {
            let address = event.address;
            let position = event.position;

            // Don't pop up for the user's own wallet address
            if state.wallet_pubkey == Some(address) {
                return vec![];
            }

            // While listening, silently note the address for "analyze" voice command.
            // Don't auto-pop the overlay — user controls visibility via voice.
            // If overlay is already open (user is buying), keep current token.
            if matches!(state.fsm, QuickdrawState::Listening { .. }) {
                if !state.overlay_visible {
                    state.token_address = Some(address);
                    state.version += 1;
                }
                return vec![];
            }

            state.fsm = QuickdrawState::TokenDetected {
                address,
                position,
                source: event.source,
            };
            state.token_address = Some(address);
            state.safety_report = None;
            state.token_price = None;
            state.quotes = Vec::new();
            state.quote_error = None;
            state.swap_signature = None;
            state.ai_narration = None;
            state.ai_streaming = false;
            state.overlay_visible = true;
            state.overlay_position = position;
            state.version += 1;

            vec![
                SideEffect::ShowOverlay { position },
                SideEffect::FetchSafetyScore { address },
                // AI narration fires after FetchSafetyScore completes (inside dispatch_effect)
                // so it has price + safety context. Not dispatched here.
            ]
        }

        Command::DismissOverlay => {
            dismiss_overlay(state);
            vec![SideEffect::DismissOverlay]
        }

        Command::FetchQuotes { token_in, token_out, amount } => {
            state.fsm = QuickdrawState::FetchingQuotes {
                token_in,
                token_out,
                amount,
                quotes: Vec::new(),
            };
            state.quotes = Vec::new();
            state.quote_error = None;
            state.version += 1;

            vec![SideEffect::FetchQuotes { token_in, token_out, amount }]
        }

        Command::SelectQuote(quote) => {
            state.fsm = QuickdrawState::AwaitingSwapConfirm {
                selected_quote: quote.clone(),
                unsigned_tx: Vec::new(),
            };
            state.version += 1;
            vec![]
        }

        Command::ConfirmSwap => {
            if let QuickdrawState::AwaitingSwapConfirm { selected_quote, .. } = &state.fsm {
                let fx = SideEffect::SignTransaction { selected_quote: selected_quote.clone() };
                state.fsm = QuickdrawState::AwaitingWalletSign;
                state.version += 1;
                vec![fx]
            } else {
                vec![]
            }
        }

        Command::CancelSwap => {
            dismiss_overlay(state);
            vec![SideEffect::DismissOverlay]
        }

        Command::SetAiMode(mode) => {
            state.ai_mode = mode;
            state.version += 1;
            vec![]
        }

        Command::ConnectWallet => {
            vec![SideEffect::OpenWalletConnect]
        }

        Command::WalletConnected(pubkey) => {
            state.wallet_pubkey = Some(pubkey);
            state.version += 1;
            vec![]
        }

        Command::SwapSigned(sig) => {
            // Only accept the signature when we're actually waiting for one.
            // A stale browser tab completing after cancel would otherwise
            // overwrite state and make the UI show Success for the wrong token.
            if matches!(state.fsm, QuickdrawState::AwaitingWalletSign) {
                state.swap_signature = Some(sig);
                state.version += 1;
            }
            vec![]
        }

        Command::QuotesFetched { token_out, quote, error } => {
            if state.token_address == Some(token_out) {
                state.quotes = quote.map(|q| vec![q]).unwrap_or_default();
                state.quote_error = error;
                state.version += 1;
            }
            vec![]
        }

        Command::DisconnectWallet => {
            state.wallet_pubkey = None;
            state.version += 1;
            vec![]
        }

        Command::FetchYield => {
            if let Some(wallet) = state.wallet_pubkey {
                state.fsm = QuickdrawState::FetchingYield {
                    wallet,
                    adapter: "all".into(),
                };
                state.version += 1;
                vec![SideEffect::FetchYield { wallet }]
            } else {
                vec![]
            }
        }

        Command::StartListening => {
            state.fsm = QuickdrawState::Listening {
                session_id: uuid::Uuid::new_v4(),
            };
            state.version += 1;
            vec![SideEffect::StartAudioCapture]
        }

        Command::StopListening => {
            state.fsm = QuickdrawState::Idle;
            state.version += 1;
            vec![SideEffect::StopAudioCapture]
        }

        Command::ToggleSettings => {
            state.settings_visible = !state.settings_visible;
            state.version += 1;
            vec![]
        }

        Command::ToggleDetection => {
            state.detection_enabled = !state.detection_enabled;
            state.version += 1;
            vec![]
        }

        Command::VoiceTranscript(transcript) => {
            let text  = transcript.trim().to_ascii_lowercase();
            let words: Vec<&str> = text.split_whitespace().collect();

            // While a guide is active, intercept navigation words and skip intent parsing.
            if state.guide_active {
                let is_next = words.iter().any(|w| matches!(*w, "next" | "continue" | "forward" | "proceed" | "go"));
                let is_back = words.iter().any(|w| matches!(*w, "back" | "previous" | "before" | "prior"));
                let is_done = words.iter().any(|w| matches!(*w, "done" | "stop" | "exit" | "quit" | "close" | "finish" | "end"));

                if is_done {
                    state.guide_active = false;
                    state.guide_steps.clear();
                    state.guide_step_index = 0;
                    state.guide_fetching = false;
                    state.fsm = QuickdrawState::Idle;
                    state.version += 1;
                    return vec![SideEffect::StopAudioCapture];
                }
                if is_back {
                    if state.guide_step_index > 0 {
                        state.guide_step_index -= 1;
                    }
                    state.fsm = QuickdrawState::Idle;
                    state.version += 1;
                    let mut fx = cursor_effect(state);
                    fx.push(SideEffect::StopAudioCapture);
                    return fx;
                }
                if is_next {
                    if state.guide_step_index + 1 < state.guide_steps.len() {
                        state.guide_step_index += 1;
                        state.fsm = QuickdrawState::Idle;
                        state.version += 1;
                        let mut fx = cursor_effect(state);
                        fx.push(SideEffect::StopAudioCapture);
                        return fx;
                    } else {
                        // Finished last step — close guide
                        state.guide_active = false;
                        state.guide_steps.clear();
                        state.guide_step_index = 0;
                        state.fsm = QuickdrawState::Idle;
                        state.version += 1;
                    }
                    return vec![SideEffect::StopAudioCapture];
                }
                // Unrecognised word while guide is open — auto-dismiss guide and
                // process the transcript normally so the user isn't stuck.
                state.guide_active = false;
                state.guide_steps.clear();
                state.guide_step_index = 0;
                state.guide_fetching = false;
                state.fsm = QuickdrawState::Thinking { transcript: text.clone() };
                state.version += 1;
                return vec![
                    SideEffect::StopAudioCapture,
                    SideEffect::ParseVoiceIntent { transcript: text },
                ];
            }

            state.fsm = QuickdrawState::Thinking { transcript: text.clone() };
            state.version += 1;
            // Stop the session automatically so the user doesn't have to press the button again.
            // For each command (analyze, buy, etc.) they start fresh with a single press.
            vec![
                SideEffect::StopAudioCapture,
                SideEffect::ParseVoiceIntent { transcript: text },
            ]
        }

        Command::StartGuide(request) => {
            state.guide_fetching = true;
            state.guide_active = false;
            state.guide_steps.clear();
            state.guide_step_index = 0;
            state.fsm = QuickdrawState::Thinking { transcript: request.clone() };
            state.version += 1;
            vec![SideEffect::FetchGuide(request)]
        }

        Command::GuideFetched(steps) => {
            if !state.guide_fetching {
                return vec![]; // dismissed while fetch was in flight — discard
            }
            if steps.is_empty() {
                state.guide_fetching = false;
                state.fsm = QuickdrawState::Idle;
                state.version += 1;
                vec![]
            } else {
                state.guide_active = true;
                state.guide_steps = steps;
                state.guide_step_index = 0;
                state.guide_fetching = false;
                state.fsm = QuickdrawState::Idle;
                state.version += 1;
                cursor_effect(state)
            }
        }

        Command::GuideNext => {
            if state.guide_step_index + 1 < state.guide_steps.len() {
                state.guide_step_index += 1;
                state.version += 1;
                cursor_effect(state)
            } else {
                state.guide_active = false;
                state.guide_steps.clear();
                state.guide_step_index = 0;
                state.version += 1;
                vec![]
            }
        }

        Command::GuideBack => {
            if state.guide_step_index > 0 {
                state.guide_step_index -= 1;
                state.version += 1;
                cursor_effect(state)
            } else {
                vec![]
            }
        }

        Command::GuideDismiss => {
            state.guide_active = false;
            state.guide_steps.clear();
            state.guide_step_index = 0;
            state.guide_fetching = false;
            state.fsm = QuickdrawState::Idle;
            state.version += 1;
            vec![]
        }

        Command::Shutdown => {
            vec![SideEffect::Shutdown]
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::AppState;
    use crate::types::DetectionEvent;

    fn make_detection() -> Command {
        use solana_sdk::pubkey::Pubkey;
        use crate::types::DetectionSource;
        Command::TokenDetected(DetectionEvent {
            address: Pubkey::default(),
            position: Point { x: 100.0, y: 200.0 },
            source: DetectionSource::Manual,
            raw_text: "11111111111111111111111111111111".into(),
        })
    }

    #[test]
    fn token_detected_transitions_to_overlay_visible() {
        let mut state = AppState::default();
        let effects = process(&mut state, make_detection());

        assert!(state.overlay_visible);
        assert!(state.token_address.is_some());
        assert!(effects.iter().any(|e| matches!(e, SideEffect::FetchSafetyScore { .. })));
        // AI narration is deferred until after FetchSafetyScore completes (price bundled with safety)
    }

    #[test]
    fn dismiss_clears_state() {
        let mut state = AppState::default();
        process(&mut state, make_detection());
        process(&mut state, Command::DismissOverlay);

        assert!(!state.overlay_visible);
        assert!(state.token_address.is_none());
        assert!(state.safety_report.is_none());
    }

    #[test]
    fn wallet_connected_stores_pubkey() {
        use solana_sdk::pubkey::Pubkey;
        let mut state = AppState::default();
        let pk = Pubkey::new_unique();
        process(&mut state, Command::WalletConnected(pk));
        assert_eq!(state.wallet_pubkey, Some(pk));
    }

    #[test]
    fn confirm_swap_requires_awaiting_confirm_state() {
        let mut state = AppState::default();
        // ConfirmSwap before SelectQuote → no effects
        let effects = process(&mut state, Command::ConfirmSwap);
        assert!(effects.is_empty());
    }
}
