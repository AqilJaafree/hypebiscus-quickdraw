/// Global hotkey monitor using rdev.
///
/// rdev requires its own OS thread (it sets up a platform event loop).
/// We bridge events into a tokio channel via std::sync::mpsc.
///
/// Default hotkey: Ctrl+Shift+Q (activate Quickdraw voice / manual overlay)

#[cfg(feature = "hotkey")]
pub mod inner {
    use std::sync::mpsc as std_mpsc;
    use tokio::sync::mpsc as tokio_mpsc;
    use tracing::{info, warn};

    #[derive(Debug, Clone, PartialEq, Eq)]
    pub enum HotkeyEvent {
        ActivatePressed,
        ActivateReleased,
    }

    pub fn spawn_hotkey_thread(tx: tokio_mpsc::Sender<HotkeyEvent>) {
        std::thread::Builder::new()
            .name("quickdraw-hotkey".into())
            .spawn(move || {
                info!("Hotkey thread started (Ctrl+Shift+Q)");
                let mut ctrl = false;
                let mut shift = false;

                rdev::listen(move |event| {
                    match event.event_type {
                        rdev::EventType::KeyPress(key) => {
                            match key {
                                rdev::Key::ControlLeft | rdev::Key::ControlRight => ctrl = true,
                                rdev::Key::ShiftLeft | rdev::Key::ShiftRight => shift = true,
                                rdev::Key::KeyQ if ctrl && shift => {
                                    let _ = tx.blocking_send(HotkeyEvent::ActivatePressed);
                                }
                                _ => {}
                            }
                        }
                        rdev::EventType::KeyRelease(key) => {
                            match key {
                                rdev::Key::ControlLeft | rdev::Key::ControlRight => ctrl = false,
                                rdev::Key::ShiftLeft | rdev::Key::ShiftRight => shift = false,
                                rdev::Key::KeyQ if !ctrl || !shift => {
                                    let _ = tx.blocking_send(HotkeyEvent::ActivateReleased);
                                }
                                _ => {}
                            }
                        }
                        _ => {}
                    }
                })
                .unwrap_or_else(|e| warn!("rdev listen error: {e:?}"));
            })
            .expect("hotkey thread spawn");
    }
}

#[cfg(not(feature = "hotkey"))]
pub mod inner {
    use tokio::sync::mpsc as tokio_mpsc;

    #[derive(Debug, Clone, PartialEq, Eq)]
    pub enum HotkeyEvent {
        ActivatePressed,
        ActivateReleased,
    }

    pub fn spawn_hotkey_thread(_tx: tokio_mpsc::Sender<HotkeyEvent>) {
        tracing::info!("Hotkey monitor disabled (build with `hotkey` feature to enable)");
    }
}

pub use inner::{spawn_hotkey_thread, HotkeyEvent};
