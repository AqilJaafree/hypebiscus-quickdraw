//! Quickdraw webview popup — persistent process.
//!
//! Chromeless GTK window hosting the Reown AppKit auth/sign page.
//! The process stays alive after each connect/sign so localStorage
//! (AUTH connector session) is preserved between flows — this is what
//! makes real transaction signing work without re-authentication.
//!
//! Protocol:
//!   First URL  : argv[1]  (process is spawned with initial connect URL)
//!   Next URLs  : one line per URL on stdin  (parent sends sign URL here)
//!   On callback: window hides, process keeps running
//!
//! Usage: quickdraw-webview <url>

use glib::Cast;
use gtk::prelude::*;
use webkit2gtk::{
    NavigationPolicyDecision, NavigationPolicyDecisionExt,
    PolicyDecisionExt, PolicyDecisionType,
    URIRequestExt, WebView, WebViewExt,
};

fn main() {
    let url = match std::env::args().nth(1) {
        Some(u) if !u.is_empty() => u,
        _ => {
            eprintln!("usage: quickdraw-webview <url>");
            std::process::exit(1);
        }
    };

    eprintln!("[webview] starting — DISPLAY={:?} WAYLAND_DISPLAY={:?}",
        std::env::var("DISPLAY"), std::env::var("WAYLAND_DISPLAY"));

    gtk::init().expect("failed to init GTK");
    eprintln!("[webview] GTK initialized");

    let window = gtk::Window::new(gtk::WindowType::Toplevel);
    window.set_title("Quickdraw");
    window.set_default_size(440, 660);
    window.set_resizable(false);
    window.set_keep_above(true);
    window.set_position(gtk::WindowPosition::Center);

    let webview = WebView::new();
    webview.load_uri(&url);
    window.add(&webview);

    // Cross-thread channel: background threads → GTK main loop.
    // Payload is either "hide" or a URL string to navigate to.
    let (sender, receiver) = glib::MainContext::channel::<String>(glib::Priority::DEFAULT);

    let window_rx = window.clone();
    let webview_rx = webview.clone();
    receiver.attach(None, move |msg| {
        if msg == "hide" {
            eprintln!("[webview] hiding window");
            window_rx.hide();
        } else {
            eprintln!("[webview] navigating to new url");
            webview_rx.load_uri(&msg);
            window_rx.show_all();
            window_rx.present();
        }
        glib::ControlFlow::Continue
    });

    // Stdin reader — parent Rust process sends sign URLs here after the
    // initial connect flow completes.
    let sender_stdin = sender.clone();
    std::thread::spawn(move || {
        use std::io::BufRead;
        for line in std::io::stdin().lock().lines().flatten() {
            let line = line.trim().to_string();
            if !line.is_empty() {
                eprintln!("[webview] stdin: received url");
                let _ = sender_stdin.send(line);
            }
        }
        eprintln!("[webview] stdin closed — exiting");
        std::process::exit(0);
    });

    // Intercept navigation to the local callback server.
    let sender_nav = sender.clone();
    webview.connect_decide_policy(move |_wv, decision, dtype| {
        if dtype != PolicyDecisionType::NavigationAction {
            return false;
        }
        let Some(nav) = decision.downcast_ref::<NavigationPolicyDecision>() else {
            return false;
        };
        let Some(action) = nav.navigation_action() else {
            return false;
        };
        let Some(req) = action.request() else {
            return false;
        };
        let Some(uri_str) = req.uri() else {
            return false;
        };

        if !uri_str.starts_with("http://127.0.0.1:9427") {
            return false;
        }

        // Cancel webview navigation — we relay it ourselves.
        decision.ignore();

        let owned = uri_str.to_string();
        let sender = sender_nav.clone();
        std::thread::spawn(move || {
            relay_callback(&owned);
            std::thread::sleep(std::time::Duration::from_millis(400));
            // Hide instead of exit — keeps localStorage alive for sign flows.
            let _ = sender.send("hide".to_string());
        });

        true
    });

    // Clicking the window close button hides rather than destroys —
    // same reason: session state must survive between connect and sign.
    window.connect_delete_event(|win, _| {
        win.hide();
        glib::Propagation::Stop
    });

    window.connect_destroy(|_| {
        gtk::main_quit();
    });

    window.show_all();
    eprintln!("[webview] window shown, entering GTK main loop");
    gtk::main();
    eprintln!("[webview] GTK main loop exited");
}

/// Forward the intercepted callback URL to the Rust server via raw TCP.
fn relay_callback(url: &str) {
    use std::io::{Read, Write};
    use std::net::TcpStream;
    use std::time::Duration;

    let path = url.trim_start_matches("http://127.0.0.1:9427");
    if path.is_empty() {
        return;
    }
    let Ok(mut stream) = TcpStream::connect_timeout(
        &"127.0.0.1:9427".parse().unwrap(),
        Duration::from_secs(2),
    ) else {
        return;
    };
    let req = format!("GET {path} HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
    let _ = stream.write_all(req.as_bytes());
    let mut buf = [0u8; 512];
    let _ = stream.read(&mut buf);
}
