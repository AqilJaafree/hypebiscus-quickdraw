/// Clipboard and primary-selection watchers using arboard.
///
/// arboard reads X11/XWayland clipboard directly via xlib — no subprocess spawning,
/// no Wayland clients appearing in GNOME's dock, no per-poll compositor round-trips.
///
/// Both watchers poll every 500ms from a single OS thread each. arboard is not
/// async-safe, so we run it on a blocking std::thread and bridge via mpsc.

use std::time::Duration;
use tracing::{debug, info, warn};
use quickdraw_core::types::Point;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

pub fn spawn_clipboard_watcher() -> tokio::sync::mpsc::Receiver<String> {
    let (tx, rx) = tokio::sync::mpsc::channel::<String>(16);
    spawn_arboard_watcher(tx, false);
    rx
}

pub fn spawn_selection_watcher() -> tokio::sync::mpsc::Receiver<(String, Point)> {
    let (tx_outer, rx) = tokio::sync::mpsc::channel::<(String, Point)>(16);
    let (tx_inner, mut rx_inner) = tokio::sync::mpsc::channel::<String>(16);

    spawn_arboard_watcher(tx_inner, true);

    // Attach cursor position and forward
    std::thread::spawn(move || {
        while let Some(text) = rx_inner.blocking_recv() {
            let pos = cursor_position().unwrap_or(Point { x: 5.0, y: 5.0 });
            if tx_outer.blocking_send((text, pos)).is_err() {
                break;
            }
        }
    });

    rx
}

// ─────────────────────────────────────────────────────────────────────────────
// arboard-backed watcher — no subprocesses, no Wayland clients
// ─────────────────────────────────────────────────────────────────────────────

fn spawn_arboard_watcher(tx: tokio::sync::mpsc::Sender<String>, primary: bool) {
    let label = if primary { "primary selection" } else { "clipboard" };

    let mut clipboard = match arboard::Clipboard::new() {
        Ok(c) => c,
        Err(e) => {
            warn!("arboard init failed ({e}) — {label} detection disabled");
            return;
        }
    };

    // Verify we can read at least once before committing to the loop
    let _ = get_text(&mut clipboard, primary);
    info!("{label} watcher started (arboard, 500ms poll)");

    std::thread::spawn(move || {
        // Pre-seed with current content — prevents firing on whatever was already in clipboard
        let mut last: Option<String> = get_text(&mut clipboard, primary)
            .ok()
            .map(|t| t.trim().to_owned())
            .filter(|t| !t.is_empty());

        loop {
            std::thread::sleep(Duration::from_millis(500));
            if let Ok(text) = get_text(&mut clipboard, primary) {
                let text = text.trim().to_owned();
                if text.is_empty() || last.as_deref() == Some(&text) {
                    continue;
                }
                last = Some(text.clone());
                debug!("{label} changed: {} chars", text.len());
                if tx.blocking_send(text).is_err() {
                    break;
                }
            }
        }
    });
}

fn get_text(clipboard: &mut arboard::Clipboard, primary: bool) -> anyhow::Result<String> {
    if primary {
        use arboard::{GetExtLinux, LinuxClipboardKind};
        clipboard
            .get()
            .clipboard(LinuxClipboardKind::Primary)
            .text()
            .map_err(|e| anyhow::anyhow!("{e}"))
    } else {
        clipboard.get_text().map_err(|e| anyhow::anyhow!("{e}"))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cursor position (X11 only via xdotool)
// ─────────────────────────────────────────────────────────────────────────────

pub fn cursor_position() -> Option<Point> {
    let out = std::process::Command::new("xdotool")
        .arg("getmouselocation")
        .output()
        .ok()?;
    let s = String::from_utf8_lossy(&out.stdout);
    let x = s.split_whitespace().find(|p| p.starts_with("X:"))?.trim_start_matches("X:").parse().ok()?;
    let y = s.split_whitespace().find(|p| p.starts_with("Y:"))?.trim_start_matches("Y:").parse().ok()?;
    Some(Point { x, y })
}
