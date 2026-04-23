/// Chrome native messaging host for Quickdraw.
///
/// Chrome launches this binary when the extension calls connectNative().
/// Messages arrive on stdin as 4-byte LE length + JSON.
/// We forward them to the main Quickdraw process via a Unix domain socket
/// at ~/.config/quickdraw/host.sock.
///
/// Install:
///   cargo build --release -p quickdraw-host
///   ./install-host.sh   (creates the NativeMessagingHosts manifest for Chrome/Chromium)

use std::io::{self, Read, Write};
use std::os::unix::net::UnixStream;
use std::path::PathBuf;

fn main() {
    let socket_path = socket_path();

    loop {
        // Read 4-byte length prefix (Chrome native messaging protocol)
        let mut len_buf = [0u8; 4];
        if io::stdin().read_exact(&mut len_buf).is_err() {
            break; // stdin closed — Chrome tab closed or extension disabled
        }
        let msg_len = u32::from_ne_bytes(len_buf) as usize;
        if msg_len == 0 || msg_len > 1_048_576 {
            break; // malformed
        }

        let mut msg_buf = vec![0u8; msg_len];
        if io::stdin().read_exact(&mut msg_buf).is_err() {
            break;
        }

        // Forward to main Quickdraw process via Unix socket (best-effort)
        if let Ok(mut stream) = UnixStream::connect(&socket_path) {
            // Send length-prefixed JSON to the main app
            let _ = stream.write_all(&(msg_len as u32).to_ne_bytes());
            let _ = stream.write_all(&msg_buf);
        }

        // Acknowledge to Chrome (required — Chrome kills host if no response)
        let ack = br#"{"status":"ok"}"#;
        let _ = io::stdout().write_all(&(ack.len() as u32).to_ne_bytes());
        let _ = io::stdout().write_all(ack);
        let _ = io::stdout().flush();
    }
}

fn socket_path() -> PathBuf {
    let base = std::env::var("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
            PathBuf::from(home).join(".config")
        });
    base.join("quickdraw").join("host.sock")
}
