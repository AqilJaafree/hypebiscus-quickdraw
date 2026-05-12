 # Quickdraw

**Passive DeFi intelligence for Solana traders.** Highlight or copy a token address anywhere on your desktop — Discord, Telegram, a terminal, a tweet, a PDF — and a compact popup appears near your cursor with the token's safety score, live price, and an AI-written summary. One click to swap, no context switch required.

```
Copy address  →  Safety badge + price  →  AI narration  →  BUY / CANCEL
     0ms              ~300ms                  ~600ms            always visible
```

---

## Quick Start

### Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Rust toolchain | stable ≥ 1.75 | `rustup update stable` |
| Solana CLI | ≥ 2.1.0 | Needed for transaction building |
| Node.js | ≥ 20 | Browser extension + Cloudflare Worker |
| Wrangler CLI | ≥ 3 | Worker deployment: `npm i -g wrangler` |

**Linux only:** egui requires a Wayland or X11 compositor and the following system libraries:

```bash
# Ubuntu / Debian
sudo apt install libgtk-3-dev libxdo-dev libxcb-render0-dev libxcb-shape0-dev \
                 libxcb-xfixes0-dev libxkbcommon-dev libssl-dev

# Arch
sudo pacman -S gtk3 xdotool libxcb xkbcommon openssl
```

**macOS:** No extra libraries needed. Grant Accessibility permission when prompted on first run (`System Settings → Privacy & Security → Accessibility`).

**Windows:** Install the [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).

---

### 1. Clone and build

```bash
git clone https://github.com/wanaqilre/quickdraw.git
cd quickdraw/quickdraw-rust

# Dev build (fast compile, debug logging)
cargo build

# Release build (LTO, stripped, ~10MB binary)
cargo build --release
```

The binary is at `target/release/quickdraw` (or `target/debug/quickdraw`).

---

### 2. Configure environment

Copy the example env file and fill in your keys:

```bash
cp .env.example .env
```

```ini
# .env
WORKER_URL=https://your-worker.workers.dev   # Cloudflare Worker URL
HELIUS_API_KEY=                               # helius.dev — RPC + DAS API
```

> All third-party API keys (Jupiter, RugCheck, Anthropic) live in the Cloudflare Worker, never in the binary.

---

### 3. Deploy the Cloudflare Worker

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars       # fill in API keys for local dev
wrangler dev                          # local dev at http://localhost:8787

# Deploy to production
wrangler deploy
```

Set secrets in production:

```bash
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put HELIUS_API_KEY
wrangler secret put JUPITER_API_KEY
```

---

### 4. Run

```bash
# Regular mode (requires token detection infrastructure)
./target/release/quickdraw

# Demo mode — loads a fake BONK detection to test the UI without real events
./target/release/quickdraw --demo
```

The settings panel opens on startup. Connect your wallet via the **LOGIN** button to enable swapping. The detection engine starts automatically.

---

### 5. Install the browser extension (optional)

```bash
cd extension
npm install
npm run build         # outputs to dist/
```

Load in Chrome / Brave: **chrome://extensions → Load unpacked → select `dist/`**

The extension feeds DOM-detected addresses and tweet context into the native app, improving AI analysis accuracy.

---

## Project Structure

```
quickdraw/
├── quickdraw-rust/          # Native desktop app (Rust workspace)
│   ├── src/main.rs          # Binary entry point — wires all crates together
│   ├── assets/              # Embedded fonts (SpaceMono)
│   └── crates/
│       ├── quickdraw-core       # State machine, commands, snapshot, types
│       ├── quickdraw-ui         # egui UI — popup, swap panel, settings
│       ├── quickdraw-defi       # DeFi adapters (Jupiter, Orca, Raydium, Meteora)
│       ├── quickdraw-ai         # AI provider trait, Haiku/Sonnet/Ollama impls
│       ├── quickdraw-infra      # Audio capture, AssemblyAI, TTS, storage
│       ├── quickdraw-detection  # Clipboard, X11 selection, OCR pipeline
│       ├── quickdraw-platform   # OS-level: hotkeys, screen capture, tray icon
│       └── quickdraw-host       # Wasmtime WASM plugin host for community adapters
│
├── extension/               # Chrome / Firefox extension (TypeScript)
│   ├── src/                 # Background service worker + content scripts
│   └── manifest.json        # MV3 manifest
│
├── worker/                  # Cloudflare Worker (TypeScript)
│   ├── src/                 # Route handlers — proxies all API calls
│   └── wrangler.toml        # Worker config + KV bindings
│
├── design/                  # Pencil.dev design files + exported assets
│   └── quickdraw.pen        # Source of truth for all UI components
│
└── QUICKDRAW.md             # Full specification — architecture, AI layer, adapters
```

---

## Architecture

Quickdraw follows an **Elm-inspired architecture**: the UI only reads data, never mutates it; all state changes flow through an explicit command/event cycle.

```
┌─────────────────────────────────────────────────────────────────┐
│  UI (egui — main thread)                                       │
│  Reads AppSnapshot (cheap Arc clone, zero locks per frame)     │
│  Sends Command via tokio::mpsc                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │ Command
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Core Engine (background tokio runtime)                        │
│  Elm FSM · Swap Router · AI Analyst · Skill Dispatcher         │
│  AppState (Arc<RwLock>) · Event Bus (broadcast)                │
└────────────────────────────┬────────────────────────────────────┘
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       ┌────────────┐ ┌──────────────┐ ┌──────────────┐
       │  DeFi      │ │  Infra       │ │  Platform    │
       │  Adapters  │ │  Actors      │ │  (PAL)       │
       │            │ │              │ │              │
       │  Jupiter   │ │  AudioActor  │ │  Hotkey      │
       │  Orca      │ │  CaptureActor│ │  ScreenOCR   │
       │  Raydium   │ │  Storage     │ │  Tray Icon   │
       │  Meteora   │ │  WalletBridge│ │  Accessibility│
       │  [plugins] │ │              │ │              │
       └────────────┘ └──────────────┘ └──────────────┘
              │                │
              └────────────────┘
                       │
                       ▼
           ┌───────────────────────┐
           │  Cloudflare Worker    │
           │  (all API keys here)  │
           └───────────────────────┘
```

### Key design decisions

**No API keys in the binary.** Every outbound call to Jupiter, RugCheck, Helius, and Anthropic goes through the Cloudflare Worker. The binary only knows the Worker URL.

**Elm state machine.** Invalid UI states (e.g. showing a swap UI before safety data loads) are structurally unrepresentable. The FSM enumerates every valid state explicitly.

**AppSnapshot pattern.** The render loop clones a `AppSnapshot` struct at the start of each frame. No `RwLock` is held during painting — zero lock contention between the UI thread and background actors.

**Pluggable AI.** All AI calls go through a single `AIProvider` trait with three implementations: `HaikuProvider` (online fast), `SonnetProvider` (online deep), and `OllamaProvider` (local). Switching between them requires no code changes — only a settings toggle.

**Prompt caching.** The system prompt and market pulse (SOL price, sentiment) are marked `cache_control: ephemeral` in every Anthropic call. On a warm cache, AI cost drops ~85%.

---

## Crate Reference

| Crate | Responsibility |
|-------|---------------|
| `quickdraw-core` | `AppState`, `AppSnapshot`, `Command` enum, FSM, types |
| `quickdraw-ui` | egui rendering — token popup, swap panel, settings panel |
| `quickdraw-defi` | `DefiAdapter` trait + Jupiter/Orca/Raydium/Meteora impls |
| `quickdraw-ai` | `AIProvider` trait + Haiku/Sonnet/Ollama + context manager |
| `quickdraw-infra` | Audio capture, AssemblyAI WebSocket, TTS, Helius RPC |
| `quickdraw-detection` | Clipboard poller, X11/Wayland selection, OCR fallback |
| `quickdraw-platform` | System tray, global hotkeys, screen capture, OS permissions |
| `quickdraw-host` | Wasmtime host for sandboxed community adapter plugins |

---

## Design System

The UI uses **neobrutalism** — high contrast, zero rounding, flat fills, hard black borders.

### Color tokens

| Token | Hex | Use |
|-------|-----|-----|
| `ACCENT_YELLOW` | `#F5E642` | Primary CTA, active tabs |
| `OVERLAY_BG` | `#181818` | Token popup background |
| `SAFE` | `#8BF542` | Score 80–100 |
| `CAUTION` | `#F5C842` | Score 50–79 |
| `DANGER` | `#F54242` | Score 0–49 |

### Rules
- **2px solid black** border on every interactive surface
- **4px hard shadow** (right + down), no blur
- **Zero border radius** — square corners everywhere
- **SpaceMono** for all labels and values

---

## Design Files — Pencil.dev

All wireframes live in `design/quickdraw.pen`. Open with [Pencil.dev](https://pencil.evopix.net/).

### Frames in the file

| Frame | Contents |
|-------|----------|
| Token Popup — Loading | Spinner state before safety data arrives |
| Token Popup — Safe (82) | Green header, AI narration, BUY/CANCEL buttons |
| Token Popup — Caution (65) | Yellow header variant |
| Token Popup — High Risk (23) | Red header variant |
| Swap Panel — Idle | Input + quote placeholder + BUY button |
| Swap Panel — Ready | Filled quote + active BUY button |
| Settings — State tab | Detection toggle, AI mode, wallet login |
| Settings — Skills tab | Jupiter Swap toggle + future adapter slots |

### Working with the design

1. Open `design/quickdraw.pen` in Pencil.dev
2. Components are in the **Components** page; screens are in **Screens**
3. Color variables match `design.rs` exactly — change a variable and all frames update
4. Export assets via **Export → PNG @2x** for the `assets/` directory

### Design ↔ code mapping

| Pencil component | Rust file |
|-----------------|-----------|
| Token Popup | `crates/quickdraw-ui/src/app.rs` → `show_popup()` |
| Header (score + ticker) | `crates/quickdraw-ui/src/header.rs` |
| Swap Panel | `crates/quickdraw-ui/src/swap_ui.rs` |
| Settings Panel | `crates/quickdraw-ui/src/panel.rs` |
| Design tokens | `crates/quickdraw-ui/src/design.rs` |

---

## Roadmap

### v0.1 — Current (hackathon build)
- [x] Token detection via clipboard + X11 primary selection
- [x] Safety scoring (Jupiter list, RugCheck, Helius)
- [x] Live price + 24h change
- [x] AI narration via Claude Haiku (streamed)
- [x] Jupiter swap UI with quote fetching
- [x] Settings panel — AI mode, wallet login, detection toggle
- [x] Wayland drag + deferred viewports
- [x] Dynamic popup sizing (no clipping, no dead space)
- [x] Neobrutalism design system

### v0.2 — Post-hackathon
- [ ] Swap execution (sign + submit via Helius RPC)
- [ ] Browser extension — DOM detection on Twitter/X, Telegram Web
- [ ] Screen OCR fallback (Tesseract)
- [ ] System tray icon + quick-access menu
- [ ] Settings persistence (`~/.config/quickdraw/settings.toml`)
- [ ] Wallet balance display in swap UI

### v0.3 — DeFi expansion
- [ ] Multi-adapter quote comparison (Orca, Raydium, Meteora)
- [ ] Price chart (7D, egui_plot)
- [ ] Portfolio view (Helius DAS)
- [ ] Voice commands via AssemblyAI
- [ ] Yield scanner — compare pools for detected token

### v1.0 — Production
- [ ] Windows + macOS builds
- [ ] Ollama local AI mode
- [ ] WASM plugin system for community adapters
- [ ] Kamino, Drift, MarginFi community adapters
- [ ] Prompt caching + request deduplication
- [ ] PostHog telemetry

---

## License

MIT — see [LICENSE](LICENSE).

```
Copyright (c) 2025 AqilJaafree

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
