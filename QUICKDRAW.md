# Quickdraw — Cross-Platform DeFi Companion

## Overview

Quickdraw is a passive DeFi intelligence layer for Solana traders. It runs silently in
the background — no window, no dashboard — and surfaces token analysis the moment you
highlight or copy a token address anywhere on your computer.

It ships in two forms that work together:

### Native Desktop App (laptop / PC)
Runs as an invisible background process on Windows, Linux, and macOS. When you highlight
a Solana token address in **any app** — Discord, Telegram desktop, a terminal, a PDF, a
tweet — a small popup appears near your cursor showing the token's organic score and a
quick action. It auto-dismisses in 5 seconds. You never leave the app you're in.

Detects tokens from:
- **Clipboard** — anything you Ctrl+C
- **Primary selection** — anything you highlight with your cursor (no copy needed)
- **OCR fallback** — screenshots, images, games, anything rendered on screen

### Browser Extension (Chrome / Brave / Arc / Firefox)
For users who primarily trade from the browser. Detects token addresses and `$TICKER`
symbols directly in the DOM on Twitter/X, Telegram Web, Reddit, DexScreener, pump.fun,
and any other site. Passes richer context to the popup — tweet author, engagement, URL
— so the AI analysis is more accurate than clipboard detection alone.

The extension and the native app work together: the extension feeds detections into the
native app, which handles rendering the overlay on top of the browser window at the OS
level (not inside the DOM). If only the extension is installed, it falls back to a
lightweight in-page tooltip.

Both share the same Cloudflare Worker backend. No API keys ever touch the client.

---

## Core UX Philosophy

- **Passive by default** — runs in background like Grass; no interaction required to get value
- **Contextual** — popup appears where you are, not in a separate window
- **Auto-dismissing** — disappears after 5s, never gets in the way
- **Dual surface** — native app covers every desktop app; extension covers every website
- **Zero context switch** — user never leaves Discord/Twitter/their terminal
- **No custody** — Quickdraw never holds private keys; all signing in user's wallet
- **No secrets in binary** — all API keys live on Cloudflare Worker proxy

---

## Design System — Neobrutalism

Neobrutalism is the primary design language. Raw, high-contrast, immediately readable.
No gradients, no blur, no soft shadows — every element has a hard black border and a
flat offset shadow. Built for users who want information fast, not polish.

### Core Principles

- **2px solid black borders** on every interactive surface
- **Hard drop shadow** — 4px right + 4px down, solid black, no blur
- **Zero border radius** — square corners everywhere (max 2px)
- **Flat fills** — solid color, no gradients
- **High contrast text** — black on light fills, off-white on dark fills
- **Bold typography** — weight 700 for labels, 400 for body

### Color Palette

```rust
// quickdraw-ui/src/design.rs

pub struct Colors;

impl Colors {
    // Backgrounds
    pub const PANEL_BG:      Color32 = Color32::from_rgb(0xF5, 0xF0, 0xE8); // warm off-white
    pub const OVERLAY_BG:    Color32 = Color32::from_rgb(0x18, 0x18, 0x18); // near-black (dark overlay)

    // Borders + shadows
    pub const STROKE:        Color32 = Color32::BLACK;
    pub const SHADOW:        Color32 = Color32::BLACK;

    // Accent fills (neobrutalist primary palette)
    pub const ACCENT_YELLOW: Color32 = Color32::from_rgb(0xF5, 0xE6, 0x42); // primary CTA
    pub const ACCENT_CYAN:   Color32 = Color32::from_rgb(0x42, 0xE8, 0xF5); // secondary / info
    pub const ACCENT_LIME:   Color32 = Color32::from_rgb(0x8B, 0xF5, 0x42); // safe / success

    // Token safety states
    pub const SAFE:          Color32 = Color32::from_rgb(0x8B, 0xF5, 0x42); // 80–100 score
    pub const CAUTION:       Color32 = Color32::from_rgb(0xF5, 0xC8, 0x42); // 50–79 score
    pub const DANGER:        Color32 = Color32::from_rgb(0xF5, 0x42, 0x42); // 0–49 score

    // Text
    pub const TEXT_PRIMARY:  Color32 = Color32::BLACK;
    pub const TEXT_ON_DARK:  Color32 = Color32::from_rgb(0xF5, 0xF0, 0xE8);
}
```

### Shape Tokens

```rust
pub struct Tokens;

impl Tokens {
    pub const STROKE_WIDTH:    f32 = 2.0;
    pub const SHADOW_OFFSET:   Vec2 = Vec2::new(4.0, 4.0);
    pub const CORNER_RADIUS:   f32 = 0.0;   // square — neobrutalism has no rounded corners
    pub const PANEL_PADDING:   Vec2 = Vec2::new(12.0, 10.0);
    pub const BUTTON_PADDING:  Vec2 = Vec2::new(14.0, 8.0);
}
```

### egui Visuals Override

Applied once at startup — overrides egui's default rounded, soft style:

```rust
// quickdraw-ui/src/app.rs

pub fn apply_neobrutalism_theme(ctx: &egui::Context) {
    let mut visuals = egui::Visuals::light();

    // All widgets: thick black border, no rounding
    let stroke = egui::Stroke::new(Tokens::STROKE_WIDTH, Colors::STROKE);

    visuals.widgets.inactive.bg_fill     = Colors::PANEL_BG;
    visuals.widgets.inactive.bg_stroke   = stroke;
    visuals.widgets.inactive.rounding    = egui::Rounding::ZERO;

    visuals.widgets.hovered.bg_fill      = Colors::ACCENT_YELLOW;
    visuals.widgets.hovered.bg_stroke    = stroke;
    visuals.widgets.hovered.rounding     = egui::Rounding::ZERO;

    visuals.widgets.active.bg_fill       = Colors::ACCENT_YELLOW;
    visuals.widgets.active.bg_stroke     = stroke;
    // Active (pressed) state: shadow collapses to zero — gives "pressed in" feel
    visuals.widgets.active.expansion     = -1.0;

    visuals.window_fill                  = Colors::PANEL_BG;
    visuals.window_stroke                = stroke;
    visuals.window_rounding              = egui::Rounding::ZERO;

    // No background blur or shadow softness
    visuals.window_shadow = egui::Shadow {
        offset: Tokens::SHADOW_OFFSET.into(),
        blur: 0.0,
        spread: 0.0,
        color: Colors::SHADOW,
    };

    visuals.popup_shadow = visuals.window_shadow;

    ctx.set_visuals(visuals);
}
```

### Component Patterns

#### Token Safety Badge

Color-coded by score. Thick border, hard shadow, safety color as fill:

```rust
pub fn safety_badge(ui: &mut Ui, score: u8, ticker: &str) {
    let fill = match score {
        80..=100 => Colors::SAFE,
        50..=79  => Colors::CAUTION,
        _        => Colors::DANGER,
    };

    let shadow_rect = rect.translate(Tokens::SHADOW_OFFSET);
    ui.painter().rect_filled(shadow_rect, 0.0, Colors::SHADOW);
    ui.painter().rect_filled(rect, 0.0, fill);
    ui.painter().rect_stroke(rect, 0.0, Stroke::new(Tokens::STROKE_WIDTH, Colors::STROKE));
    // Label: ticker + score number in bold black
}
```

#### Button

Default state: yellow fill, black border, hard shadow offset.
Hover: same fill, border thickens to 3px.
Pressed: shadow collapses (button shifts 4px right+down to "land" on the shadow).

```rust
pub fn brutal_button(ui: &mut Ui, label: &str) -> egui::Response {
    let (rect, response) = ui.allocate_exact_size(
        ui.fonts(|f| f.layout_no_wrap(label.into(), FontId::proportional(14.0), Colors::TEXT_PRIMARY).size())
            + Tokens::BUTTON_PADDING * 2.0,
        Sense::click(),
    );

    let offset = if response.is_pointer_button_down_on() {
        Tokens::SHADOW_OFFSET   // pressed: element moves to sit on shadow
    } else {
        Vec2::ZERO              // default: element is offset, shadow sits behind
    };

    let shadow_rect = rect.translate(Tokens::SHADOW_OFFSET);
    let draw_rect   = rect.translate(offset);

    ui.painter().rect_filled(shadow_rect, 0.0, Colors::SHADOW);
    ui.painter().rect_filled(draw_rect,   0.0, Colors::ACCENT_YELLOW);
    ui.painter().rect_stroke(draw_rect,   0.0, Stroke::new(Tokens::STROKE_WIDTH, Colors::STROKE));

    response
}
```

#### Overlay Card (Token Info Panel)

Dark background variant for the floating overlay — readable on any desktop:

```rust
// Dark card — OVERLAY_BG fill, off-white text, same border + shadow rules
visuals.widgets.noninteractive.bg_fill = Colors::OVERLAY_BG;
// Text uses Colors::TEXT_ON_DARK
// Shadow still solid black — visible against dark because panel is offset from desktop
```

### Typography

egui uses system fonts by default. Load a bold font at startup:

```rust
// Recommended: "Space Grotesk" or "Inter" — both work well with neobrutalism
// Load via egui's FontDefinitions at startup
let mut fonts = egui::FontDefinitions::default();
fonts.font_data.insert(
    "SpaceGrotesk".to_owned(),
    egui::FontData::from_static(include_bytes!("../assets/SpaceGrotesk-Bold.ttf")),
);
fonts.families.get_mut(&FontFamily::Proportional).unwrap()
    .insert(0, "SpaceGrotesk".to_owned());
ctx.set_fonts(fonts);
```

### Neobrutalism Do / Don't

| Do | Don't |
|----|-------|
| Flat fills on every surface | Gradients or glassmorphism |
| 2px solid black borders always | Hairline or no borders |
| Hard 4px offset shadow | Blurred/soft shadows |
| Square corners | Rounded corners |
| Bold weight labels | Light or thin type |
| High chroma accent (yellow, cyan, lime) | Muted or desaturated fills |
| Pressed = shadow collapse | Pressed = color darken only |

---

## UX Specification

### Overlay Positioning Algorithm

"Near the cursor" requires a concrete algorithm to handle screen edges and multi-monitor:

```
1. Detect token at screen position (raw_x, raw_y)

2. Preferred position: 20px right + 10px below detection point

3. Edge clamping — measure overlay size (e.g. 340w × 220h) against screen bounds:
   if (raw_x + 20 + 340) > screen.right  → flip: appear left of token
   if (raw_y + 10 + 220) > screen.bottom → flip: appear above token

4. Multi-monitor: determine which screen contains (raw_x, raw_y) — place overlay
   on that screen's coordinate space, never spanning two monitors

5. Final position clamped to [screen.left + 8, screen.right - 348] × [screen.top + 8, screen.bottom - 228]
```

```rust
pub fn compute_overlay_position(
    detection: Point,
    overlay_size: Size,
    screen: Rect,
) -> Point {
    let preferred_x = detection.x + 20.0;
    let preferred_y = detection.y + 10.0;

    let x = if preferred_x + overlay_size.width > screen.right() {
        (detection.x - overlay_size.width - 8.0).max(screen.left + 8.0)
    } else {
        preferred_x
    };

    let y = if preferred_y + overlay_size.height > screen.bottom() {
        (detection.y - overlay_size.height - 8.0).max(screen.top + 8.0)
    } else {
        preferred_y
    };

    Point { x, y }
}
```

---

### Loading States

Parallel fetches (quotes, AI, safety) take 300–800ms. Each piece renders as its fetch
resolves — never wait for all fetches before showing anything:

- **0ms** — badge appears at detection point with spinner
- **~300ms** — safety score + price replace spinner
- **~600ms** — AI narration appended, action buttons appear

---

### Error States

Every error state must tell the user what happened AND give them a recovery action:

| Error | What user sees | Recovery action |
|-------|---------------|-----------------|
| Adapter timeout | "Jupiter is slow right now" | [Try Orca instead] |
| All adapters down | "DEX data unavailable" | [Retry] — shows cached price |
| AI timeout | Safety badge shows, no narration | Retry button on card |
| Wallet disconnected | "Wallet disconnected" banner | [Reconnect] |
| Swap tx rejected by wallet | "Wallet rejected this swap" | [Modify] [Cancel] |
| Swap failed on-chain | "Swap failed · funds safe" + Solscan link | [Try again] |
| Rate limited | "Too many requests · wait 60s" | Auto-retry countdown |
| Network offline | Tray icon turns grey, badge shows cached data | — |

Never show a raw error string to the user. All error messages are human-written.

```rust
pub enum UserFacingError {
    AdapterTimeout    { adapter_name: String },
    AllAdaptersDown,
    AIUnavailable,
    WalletDisconnected,
    WalletRejected,
    SwapFailedOnChain { signature: Signature },
    RateLimited       { retry_after_secs: u32 },
    Offline,
}

impl UserFacingError {
    pub fn message(&self) -> &str { /* human-readable, no technical details */ }
    pub fn recovery(&self) -> Option<RecoveryAction> { /* button label + action */ }
}
```

---

### Onboarding Flow — First Launch

Four steps, each blocking the next:
1. **Accessibility permission** — polls every 2s, auto-advances when granted (macOS: System Settings → Privacy → Accessibility)
2. **Wallet connection** — WalletConnect QR or Ledger USB
3. **Browser extension** (optional) — link to Chrome store, skippable
4. **Done** — tray icon live, panel closes

Onboarding step is persisted in settings — resuming after a closed mid-flow is automatic.


---

## Architecture

### Pattern: Elm-Inspired + Actor Subsystems

```
View (egui) ──Commands──▶ Engine (Elm FSM) ──Events──▶ View
                                │
                    ┌───────────┼───────────┐
                 Actor        Actor       Actor
                (audio)    (network)   (capture)
```

**Why Elm over MVVM:**
- No `Arc<RwLock<T>>` in the render loop — UI reads a cheap `AppSnapshot` clone
- Invalid states unrepresentable — FSM transitions are explicit
- Core engine is pure Rust with zero platform deps — fully unit testable
- Side effects are data, not function calls

### Layer Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│  PRESENTATION  (egui immediate-mode, main thread)               │
│  TokenCard · SwapUI · ChartPopup · SafetyBadge · YieldDashboard │
│  Reads: AppSnapshot (Arc clone, zero locks in render)           │
│  Sends: Command enum via tokio::sync::mpsc                      │
└──────────────────────────────┬───────────────────────────────────┘
                               │ Command
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  CORE ENGINE  (background tokio runtime)                        │
│                                                                  │
│  Pipeline FSM · Swap Router · Skill Dispatcher · AI Analyst     │
│  AppState (Arc<RwLock>) · Event Bus (broadcast) · Cmd Handler   │
└──────────────────────────────┬───────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────────┐
│  ADAPTER         │ │  INFRA ACTORS    │ │  PLATFORM (PAL)      │
│  REGISTRY        │ │                  │ │                      │
│                  │ │  AudioActor      │ │  HotkeyMonitor       │
│  JupiterAdapter  │ │  CaptureActor    │ │  ScreenOCR           │
│  OrcaAdapter     │ │  StorageActor    │ │  AccessibilityReader │
│  MeteoraAdapter  │ │  WalletBridge    │ │  WindowManager       │
│  RaydiumAdapter  │ │                  │ │  PermissionsManager  │
│  [+ plugins]     │ │                  │ │                      │
└──────────────────┘ └──────────────────┘ └──────────────────────┘
          │                    │
          └────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  Cloudflare Worker    │
         │  (all API keys here)  │
         └───────────────────────┘
```

### Elm State Machine

```rust
pub enum QuickdrawState {
    Idle,
    TokenDetected   { address: Pubkey, position: Point, source: DetectionSource },
    CheckingToken   { address: Pubkey, checks: Vec<SafetyCheckStatus> },
    FetchingQuotes  { token_in: Pubkey, token_out: Pubkey, amount: u64, quotes: Vec<AdapterQuote> },
    AwaitingSwapConfirm { selected_quote: AdapterQuote, unsigned_tx: VersionedTransaction },
    AwaitingWalletSign,
    SwapComplete    { signature: Signature, adapter_used: String },
    FetchingYield   { wallet: Pubkey, adapter: String },
    ShowingYield    { positions: Vec<YieldPosition> },
    Listening       { session_id: Uuid },
    Thinking        { transcript: String },
    Responding      { response: String },
    Error           { message: String, recoverable: bool },
}
```

---

## Tech Stack

### Core Crates

| Concern | Crate | Why |
|---------|-------|-----|
| Async runtime | `tokio` | All network crates target it |
| GUI / rendering | `eframe` + `egui` | Immediate-mode, GPU via wgpu, multi-window |
| System tray | `tray-icon` | Same author as winit, all 3 platforms |
| Global hotkey | `rdev` | Listen-only, modifier-only support |
| Audio capture | `cpal` | WASAPI / CoreAudio / ALSA |
| Audio resample | `rubato` | FFT-based resampling to 16kHz |
| Audio playback | `rodio` | MP3 decode via symphonia |
| WebSocket | `tokio-tungstenite` | AssemblyAI streaming |
| HTTP / SSE | `reqwest` | TLS session reuse, bytes streaming |
| Screen capture | `xcap` | ScreenCaptureKit / DXGI / X11 |
| Image encode | `image` | JPEG compress + resize to 1280px max |
| JSON | `serde` + `serde_json` | All API payloads |
| Memory safety | `zeroize` | Zero audio + screenshot buffers on drop |
| Settings persist | `directories` + `toml` | OS config dir |
| OCR fallback | `leptess` | Tesseract bindings |
| Solana tx | `solana-sdk` | Transaction building |
| Solana RPC | `solana-client` | On-chain data |
| Anchor IDLs | `anchor-client` | Protocol program interaction |
| Base58 validate | `bs58` | Pubkey format check |
| WASM plugins | `wasmtime` | Sandboxed adapter plugins |
| Chart rendering | `egui_plot` | Price chart in overlay |
| Wallet deeplink | `open` | Cross-platform URL open |
| Wayland overlay | `smithay-client-toolkit` | wlr-layer-shell |
| macOS perms | `objc2` | AXIsProcessTrusted(), screen capture |
| Retry + backoff | `backon` | Transient AI + network error retry |
| Structured output | `schemars` | JSON schema generation for AI prompts |
| QR code render | `qrcode` | WalletConnect pairing QR |
| Ledger HID | `hidapi` + `ledger-transport-hid` | Hardware wallet signing |
| WalletConnect | `tokio-tungstenite` + WC v2 protocol | Mobile wallet relay |
| GPU VRAM detect | `wgpu` device info | Ollama model auto-selection |

### Why NOT Tauri / Dioxus Desktop
Both use WebView under the hood (WRY). A WebView window cannot reliably be set to
screen-saver level, click-through, and transparent on Windows/Linux — the cursor overlay
is the defining feature of the app and requires raw winit window control.

Dioxus + Freya (Skia renderer) is worth revisiting at 1.0 — better DX, avoids WebView —
but not production-ready today.

---

## AI Layer

### Design: Pluggable Provider with Online/Offline Switch

Every AI call in Quickdraw goes through a single `AIProvider` trait. The active provider
is resolved at runtime from `Settings` — swapping models requires zero code changes.
Users can toggle between cloud and local inference at any time from the tray menu.

```
┌─────────────────────────────────────────────────────────────────┐
│  AI PROVIDER REGISTRY                                          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ProviderRouter                                         │   │
│  │                                                         │   │
│  │  Reads: Settings.ai_mode (Online / Offline / Auto)     │   │
│  │  Reads: Settings.fast_provider                         │   │
│  │  Reads: Settings.deep_provider                         │   │
│  │                                                         │   │
│  │  route(task) → Box<dyn AIProvider>                     │   │
│  └──────────────────────┬──────────────────────────────────┘   │
│                         │                                       │
│          ┌──────────────┼──────────────┐                        │
│          ▼              ▼              ▼                        │
│  ┌──────────────┐ ┌──────────┐ ┌───────────────┐              │
│  │  ONLINE      │ │  ONLINE  │ │  OFFLINE      │              │
│  │  FAST        │ │  DEEP    │ │  LOCAL        │              │
│  │              │ │          │ │               │              │
│  │  Haiku 4.5   │ │ Sonnet   │ │  Ollama       │              │
│  │  (default)   │ │  4.6     │ │  localhost    │              │
│  │              │ │          │ │  :11434       │              │
│  │  via Worker  │ │ via Work │ │               │              │
│  └──────────────┘ └──────────┘ │  gemma4:27b   │              │
│                                │  gemma4:4b    │              │
│                                │  llama3.2     │              │
│                                │  mistral      │              │
│                                │  any model    │              │
│                                └───────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

### Core Trait

```rust
#[async_trait]
pub trait AIProvider: Send + Sync {
    fn id(&self) -> &str;
    fn display_name(&self) -> &str;
    fn is_local(&self) -> bool;
    fn supports_vision(&self) -> bool;
    fn supports_streaming(&self) -> bool;

    // Single-shot response
    async fn complete(&self, req: AIRequest) -> Result<AIResponse>;

    // Streaming response (SSE or Ollama chunks)
    async fn stream(&self, req: AIRequest) -> Result<Pin<Box<dyn Stream<Item = Result<String>> + Send>>>;

    // Health check — used by Auto mode to detect Ollama availability
    async fn health_check(&self) -> bool;
}

pub struct AIRequest {
    pub task: AITask,
    pub messages: Vec<Message>,
    // Split into cacheable vs dynamic — enables Anthropic prompt caching
    pub system_static: String,         // Layer 1: role + rules (cached, ~400 tok)
    pub market_pulse: Option<String>,  // Layer 2: SOL price + sentiment (cached 5min)
    pub images: Vec<Vec<u8>>,          // base64 JPEG, vision tasks only
    pub max_tokens: u32,
    pub temperature: f32,
    pub output_schema: Option<JsonSchema>, // enforce structured JSON output
    pub stream_strategy: StreamStrategy,
}

pub enum StreamStrategy {
    BufferThenParse(JsonSchema),  // structured tasks: buffer → parse JSON
    StreamToOverlay,              // conversational: render word-by-word
}

pub struct AIResponse {
    pub text: String,
    pub provider_used: String,
    pub latency_ms: u64,
    pub time_to_first_token_ms: u64,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cache_hit: bool,               // did prompt cache fire?
    pub from_fallback: bool,
}
```

### Task Types + Default Provider Routing

```rust
pub enum AITask {
    // Fast tier — Haiku / Gemma 4B
    TokenNarration,      // "BONK is a legit meme coin with..."
    VoiceIntent,         // parse "swap 1 SOL to USDC" → SwapIntent struct
    SwapRiskWarning,     // summarise slippage + price impact risk
    PriceSummary,        // "JUP up 4.2% on strong volume today"
    SafetyNarration,     // explain safety score in plain English

    // Deep tier — Sonnet / Gemma 27B
    ScreenAnalysis,      // vision: screenshot → point at element
    DeepTokenReport,     // full due diligence, on-chain + social
    YieldStrategy,       // compare pools, recommend based on risk
    PortfolioAnalysis,   // wallet breakdown + suggestions
}

impl AITask {
    pub fn tier(&self) -> AITier {
        match self {
            Self::TokenNarration
            | Self::VoiceIntent
            | Self::SwapRiskWarning
            | Self::PriceSummary
            | Self::SafetyNarration  => AITier::Fast,

            Self::ScreenAnalysis
            | Self::DeepTokenReport
            | Self::YieldStrategy
            | Self::PortfolioAnalysis => AITier::Deep,
        }
    }
}
```

### Provider Implementations

#### HaikuProvider (Online Fast)

```rust
pub struct HaikuProvider {
    client: reqwest::Client,   // shared, reused across calls
    worker_url: String,
}

// Routes to: POST /ai/fast → Worker → api.anthropic.com
// Model: claude-haiku-4-5-20251001
// Streaming: SSE via response.bytes_stream()
// Vision: Yes
```

#### SonnetProvider (Online Deep)

```rust
pub struct SonnetProvider {
    client: reqwest::Client,
    worker_url: String,
}

// Routes to: POST /ai/deep → Worker → api.anthropic.com
// Model: claude-sonnet-4-6
// Streaming: SSE
// Vision: Yes — used for ScreenAnalysis (screenshot pointing)
```

#### OllamaProvider (Offline / Local)

```rust
pub struct OllamaProvider {
    client: reqwest::Client,
    base_url: String,          // default: http://localhost:11434
    model: String,             // e.g. "gemma4:27b", "gemma4:4b", "llama3.2-vision"
}

// Routes to: POST http://localhost:11434/api/chat
// Streaming: Ollama NDJSON chunks
// Vision: depends on model (gemma4, llama3.2-vision support it)
// Zero network calls — fully local
```

Ollama's streaming format differs from SSE — the provider normalises both into
`Stream<Item = Result<String>>` so the rest of the engine never knows the difference.

```rust
// Ollama chunk: {"model":"gemma4","message":{"content":"hello"},"done":false}
// Normalised:   "hello"   (just the text delta — same as SSE delta)
```

### Provider Router

```rust
pub struct ProviderRouter {
    fast_online: Arc<dyn AIProvider>,    // HaikuProvider
    deep_online: Arc<dyn AIProvider>,    // SonnetProvider
    local: Arc<dyn AIProvider>,          // OllamaProvider
}

impl ProviderRouter {
    pub async fn resolve(&self, task: &AITask, settings: &AISettings) -> Arc<dyn AIProvider> {
        match settings.mode {
            AIMode::Online  => self.pick_online(task),
            AIMode::Offline => self.local.clone(),
            AIMode::Auto    => {
                // Prefer local if Ollama is healthy, fall back to online
                if self.local.health_check().await {
                    self.local.clone()
                } else {
                    self.pick_online(task)
                }
            }
        }
    }

    fn pick_online(&self, task: &AITask) -> Arc<dyn AIProvider> {
        match task.tier() {
            AITier::Fast => self.fast_online.clone(),
            AITier::Deep => self.deep_online.clone(),
        }
    }
}
```

### AI Mode Settings

```toml
# ~/.config/quickdraw/settings.toml

[ai]
mode           = "Auto"        # "Online" | "Offline" | "Auto"
fast_provider  = "Haiku"       # "Haiku" | "Ollama"
deep_provider  = "Sonnet"      # "Sonnet" | "Ollama"
ollama_url     = "http://localhost:11434"
ollama_model   = "gemma4:27b"  # any model the user has pulled
```

**Auto mode behaviour:**
- On startup: ping Ollama health endpoint (`GET /api/tags`)
- If Ollama responds → use local for all tasks
- If Ollama is unavailable → fall back to online providers silently
- Re-checks every 60s — if user starts Ollama mid-session, Auto switches automatically

### Tray Menu — Live Mode Switch

The tray menu exposes AI mode selection (Auto / Online / Offline), Ollama status and
model picker, and per-tier provider dropdowns. Mode change takes effect on the next
AI call — no restart needed.

### Cloudflare Worker — AI Routes

```
POST /ai/fast
  → claude-haiku-4-5-20251001
  → max_tokens: 512
  → Used for: token narration, intent parsing, risk warnings

POST /ai/deep
  → claude-sonnet-4-6
  → max_tokens: 1024
  → Used for: screen analysis (vision), yield strategy, deep reports
  → Streaming: SSE preserved end-to-end

Local Ollama calls bypass the Worker entirely — direct to localhost:11434
```


---

## Context Management

### Two Interaction Modes — Passive vs Active

The critical distinction: passive detection is stateless, active conversation is stateful.
Mixing them into one session model adds noise, not signal.

```
Mode A — Passive Detection (stateless)
  Token appears on screen → badge pops → user glances → dismisses
  No conversation, no follow-up. Every detection is independent.
  Uses: Layer 1 + Layer 2 + Layer 4 (task data) only

Mode B — Active Conversation (stateful)
  User activates hotkey, asks questions, follows up
  "what does mint authority mean?" refers to the previous response
  Uses: all layers including conversation thread
```

### Context Layers

```
┌─────────────────────────────────────────────────────────────────┐
│  CONTEXT MANAGER                                               │
│                                                                 │
│  Layer 1 — SYSTEM CONTEXT       ~400 tok  always included      │
│  Role, wallet address + balance, risk preference, output rules  │
│  Static — cached at Anthropic, 90% cheaper on cache hit        │
│                                                                 │
│  Layer 2 — MARKET PULSE         ~50 tok   refreshed every 5min │
│  SOL price + 24h change, BTC change, Fear & Greed index        │
│  Cached at Anthropic — aligns with 5min TTL                    │
│                                                                 │
│  Layer 3A — PASSIVE TASK DATA   ~600 tok  per-request          │
│  Token data + safety + tweet context. No session history.       │
│  Used for: TokenNarration, SafetyBadge, PriceSummary           │
│                                                                 │
│  Layer 3B — CONVERSATION THREAD ~500 tok  stateful             │
│  Full message history scoped to current token/topic            │
│  Expires after 3min inactivity. Used for: voice + follow-ups   │
│                                                                 │
│  Layer 4 — TASK DATA            ~600–2000 tok  per-request     │
│  Only fields the task needs — fetched in parallel via join!    │
│                                                                 │
│  Layer 5 — SCREEN CONTEXT       ~1200 tok  vision tasks only   │
│  Screenshot JPEG — never sent for text-only tasks              │
└─────────────────────────────────────────────────────────────────┘
```

### Conversation Thread

Scoped per token/topic — resets when user moves to a different token or after 3min idle:

```rust
pub struct ConversationThread {
    pub topic: ConversationTopic,
    pub messages: Vec<Message>,      // alternating user/assistant
    pub token: Option<Pubkey>,
    pub started_at: Instant,
    pub last_activity: Instant,
}

pub enum ConversationTopic {
    Token(Pubkey),
    Swap { from: Pubkey, to: Pubkey },
    Yield(Pubkey),
    General,
}

impl ConversationThread {
    pub fn is_expired(&self) -> bool {
        self.last_activity.elapsed() > Duration::from_secs(180)
    }

    // Compress when thread exceeds token budget
    pub fn maybe_compress(&mut self, budget: usize) {
        if self.estimated_tokens() <= budget { return; }
        let recent = self.messages.split_off(self.messages.len() - 2);
        let summary = self.summarise_older_messages(); // fast Haiku call, ~50 tok out
        self.messages = vec![Message::system(format!("Earlier: {summary}"))];
        self.messages.extend(recent);
    }
}
```

### Market Pulse

Small always-present layer — prevents AI giving advice without market awareness:

```rust
pub struct MarketPulse {
    pub sol_price: f64,
    pub sol_change_24h: f64,
    pub btc_change_24h: f64,
    pub sentiment: Sentiment,     // Fearful / Neutral / Greedy
    pub fetched_at: Instant,      // TTL: 5 minutes
}

// Rendered as one line in prompt:
// "Market: SOL $142.30 (-3.2% 24h) · BTC (-1.8% 24h) · Sentiment: Fearful (28)"
```

Sources: Birdeye (SOL price) + Alternative.me Fear & Greed API.

### Task → Context Mapping

Each task type includes only what it needs — nothing extra:

| Task | System | Market | Thread | Token | Safety | Chart | Wallet | Pools | Screen |
|------|--------|--------|--------|-------|--------|-------|--------|-------|--------|
| `TokenNarration` | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `PriceSummary` | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ 7D | ❌ | ❌ | ❌ |
| `SwapRiskWarning` | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| `VoiceIntent` | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `YieldStrategy` | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ 7D | ✅ | ✅ | ❌ |
| `DeepTokenReport` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 30D | ❌ | ✅ | ❌ |
| `ScreenAnalysis` | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### Token Data Cache — TTLs + Invalidation

```rust
pub struct TokenDataCache {
    token_data: HashMap<Pubkey, CacheEntry<TokenData>>,
    safety:     HashMap<Pubkey, CacheEntry<SafetyReport>>,
    chart:      HashMap<Pubkey, CacheEntry<PriceChart>>,
    wallet:     Option<CacheEntry<Vec<TokenHolding>>>,
    pools:      HashMap<Pubkey, CacheEntry<Vec<Pool>>>,
}

// TTLs
const PRICE_TTL:    Duration = Duration::from_secs(15);
const SAFETY_TTL:   Duration = Duration::from_secs(300);  // rarely changes
const CHART_TTL:    Duration = Duration::from_secs(60);
const WALLET_TTL:   Duration = Duration::from_secs(30);
const POOL_TTL:     Duration = Duration::from_secs(60);

impl TokenDataCache {
    // Force-invalidate after swap — don't wait for TTL
    pub fn on_swap_confirmed(&mut self, token: &Pubkey) {
        self.wallet = None;           // balance changed
        self.token_data.remove(token); // price moved
    }
}
```

### Context Assembly — All Fetches in Parallel

```rust
impl ContextManager {
    pub async fn build(&self, task: &AITask, trigger: &DetectionEvent) -> AIRequest {
        // All task data fetched simultaneously — never sequential
        let (token, safety, chart, wallet, pools) = tokio::join!(
            self.maybe_fetch_token(task, trigger),
            self.maybe_fetch_safety(task, trigger),
            self.maybe_fetch_chart(task, trigger),
            self.maybe_fetch_wallet(task),
            self.maybe_fetch_pools(task, trigger),
        );

        let thread = if task.is_active() {
            self.thread_store.get_or_create(trigger)
        } else {
            None   // passive detection — no thread
        };

        AIRequest {
            system_static:  self.system.render(),     // cached at Anthropic
            market_pulse:   self.market.render(),     // cached at Anthropic
            messages:       thread.map(|t| t.messages.clone()).unwrap_or_default(),
            output_schema:  task.output_schema(),
            stream_strategy: task.stream_strategy(),
            ..task.base_request(token, safety, chart, wallet, pools)
        }
    }
}
```

### Token Budget per Task

```
Passive — TokenNarration (Haiku, max 512 out):
  Layer 1 System:    ~400 tok  (cache hit = ~$0.00003)
  Layer 2 Market:    ~50 tok   (cache hit = ~$0.000004)
  Layer 4 Token+Safety: ~600 tok
  Total input:       ~1,050 tok → ~$0.0008 per badge

Active — DeepTokenReport (Sonnet, max 1024 out):
  Layer 1 System:    ~400 tok  (cache hit)
  Layer 2 Market:    ~50 tok   (cache hit)
  Layer 3B Thread:   ~500 tok
  Layer 4 Full data: ~2,000 tok
  Total input:       ~2,950 tok → ~$0.009 per report

Vision — ScreenAnalysis (Sonnet, max 1024 out):
  Layer 1 System:    ~400 tok  (cache hit)
  Layer 3B Thread:   ~300 tok
  Layer 5 Screenshot: ~1,200 tok
  Total input:       ~1,900 tok → ~$0.006 per call
```

---

## AI Best Practices

### 1. Prompt Caching (Biggest Cost Win)

Layer 1 and Layer 2 marked `cache_control: ephemeral` — Anthropic caches them for 5min.
Cache hits cost 10% of normal price. For a user checking 20 tokens in a session, this
cuts AI cost by ~85%.

```rust
// Worker request body — static layers marked cacheable
{
    "model": "claude-haiku-4-5-20251001",
    "system": [
        {
            "type": "text",
            "text": system_static,
            "cache_control": { "type": "ephemeral" }   // Layer 1
        },
        {
            "type": "text",
            "text": market_pulse,
            "cache_control": { "type": "ephemeral" }   // Layer 2 — 5min TTL aligns
        }
    ],
    "messages": messages    // Layer 3/4/5 — never cached, changes per request
}
```

### 2. Structured Output Enforcement

Free-text responses break the overlay UI — you can't render a safety badge from a paragraph.
Schema injected into prompt, response validated before use:

```rust
pub fn parse_structured<T: DeserializeOwned>(text: &str) -> Result<T> {
    // Direct parse first
    if let Ok(v) = serde_json::from_str(text) { return Ok(v); }
    // Extract if AI wrapped in markdown code block
    let extracted = extract_json_block(text)?;
    serde_json::from_str(&extracted).map_err(Into::into)
}
// Prompt suffix when output_schema present:
// "Respond ONLY with valid JSON matching this schema: {...}
//  Do not include any text outside the JSON block."
```

### 3. Streaming for All Tasks

All calls stream — even structured tasks. Overlay shows typing indicator immediately
instead of blank card for 300ms. Structured tasks buffer the full stream then parse.

### 4. Retry with Exponential Backoff

```rust
let response = (|| async { provider.complete(req.clone()).await })
    .retry(
        ExponentialBuilder::default()
            .with_min_delay(Duration::from_millis(200))
            .with_max_delay(Duration::from_secs(3))
            .with_max_times(3),
    )
    .when(|e| e.is_transient())   // don't retry 4xx auth errors
    .await?;
```

### 5. Request Deduplication

Same token detected 3 times in 1 second = only 1 HTTP call made. Additional requests
join the in-flight future instead of starting new ones:

```rust
pub struct RequestDeduplicator {
    in_flight: HashMap<RequestKey, Shared<BoxFuture<'static, AIResponse>>>,
}
// Key = hash(task_type + token_address + context_hash)
// Same token + same task within 2s → reuse in-flight future
```

### 6. Fallback Chain

Provider fails → degrade gracefully rather than show error:

```rust
// Chain: online provider → Ollama (if available) → degraded response
// Degraded = show cached token data without AI narration
// User sees numbers, no AI summary — better than blank card
pub struct FallbackChain {
    providers: Vec<Arc<dyn AIProvider>>,
}
```

### 7. Telemetry

Every AI response emits metrics to PostHog:

```rust
pub struct AIMetrics {
    pub task: AITask,
    pub provider: String,
    pub time_to_first_token_ms: u64,  // most important for overlay UX
    pub total_latency_ms: u64,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cache_hit: bool,
    pub from_fallback: bool,
}
// Gives: p50/p95 per task, cache hit rate, cost per task, slow task candidates
```

### Best Practices Priority

| Practice | Impact | Effort | Ship When |
|----------|--------|--------|-----------|
| Prompt caching | 🔴 85% cost reduction | Low | v1.0 |
| Structured output | 🔴 prevents crashes | Low | v1.0 |
| Request deduplication | 🔴 prevents duplicate calls | Medium | v1.0 |
| Retry + backoff | 🟡 reliability | Low | v1.0 |
| Streaming all tasks | 🟡 UX latency feel | Medium | v1.0 |
| Fallback chain | 🟡 graceful degradation | Medium | v1.1 |
| Context compression | 🟡 long sessions | Medium | v1.1 |
| Telemetry | 🟡 informs tuning | Low | v1.1 |

---

## DeFi Features

### Token Detection

Detects on any surface, three layers:

| Layer | Surface | Method |
|-------|---------|--------|
| Browser Extension | Twitter/X, Telegram Web, Reddit, any site | DOM-aware, context-rich |
| Accessibility API | Discord, Slack, Telegram desktop, Electron apps | AX / UIA / AT-SPI2 |
| OCR Fallback | PDFs, images, terminals, games, anything else | Tesseract, last resort |

**Detected patterns:**
- Solana addresses (base58, 32–44 chars)
- `$TICKER` symbols
- DexScreener / Birdeye / Solscan URLs containing address
- Pump.fun / Moonshot links
- Jupiter / Orca / Raydium pool URLs

Deduplication: same address not re-fired within 30s.

### Twitter/X Context

When a token is detected in a tweet, context is extracted from DOM and passed to Claude:
- Author handle + follower count + verified status
- Tweet engagement (likes, retweets)
- Full tweet text

A token posted by a verified account with 10K likes is scored differently than one posted
by an anonymous account with 3 followers.

### Token Safety Check

```
Score 0–100:

  ✅ Jupiter strict list             +20
  ✅ Mint authority disabled         +20
  ✅ Freeze authority disabled       +15
  ✅ Liquidity > $100K              +15
  ✅ Liquidity locked               +10
  ✅ Holders > 1000                 +10
  ⚠️  Top 10 wallet concentration    -0 to -15
  ❌ Similar to known scam pattern   -30

  80–100 = 🟢 Safe
  50–79  = 🟡 Caution
  0–49   = 🔴 High Risk
```

Data sources: Jupiter Token List, RugCheck, Helius DAS API.

### Smart Swap Router

Queries all enabled adapters in parallel, shows ranked results:

```
FetchingQuotes state → all adapters queried simultaneously
        │
        ├── Jupiter:  best aggregated route (aggregates all DEXes)
        ├── Orca:     Whirlpool direct
        ├── Raydium:  CLMM direct
        └── Meteora:  DLMM direct

UI shows ranked list, auto-selects best rate.
User can manually pick adapter.
```

---

## Protocol Adapters

### Adapter Trait

Every protocol implements a single trait. Optional methods default to `unimplemented` —
adapters only expose what their protocol actually supports.

```rust
#[async_trait]
pub trait DefiAdapter: Send + Sync {
    // Identity
    fn id(&self) -> &str;
    fn display_name(&self) -> &str;
    fn icon_url(&self) -> &str;
    fn supported_features(&self) -> Vec<DefiFeature>;
    fn api_docs_url(&self) -> &str;

    // Health — used by registry to mark adapter as degraded
    async fn health_check(&self) -> AdapterHealth;

    // Core swap (required)
    async fn get_quote(&self, params: &SwapParams) -> Result<Quote>;
    async fn build_transaction(&self, quote: &Quote, wallet: &Pubkey) -> Result<VersionedTransaction>;

    // Liquidity (optional)
    async fn get_pools(&self, token: &Pubkey) -> Result<Vec<Pool>> {
        Err(AdapterError::NotSupported)
    }
    async fn open_position(&self, params: &PositionParams) -> Result<VersionedTransaction> {
        Err(AdapterError::NotSupported)
    }
    async fn close_position(&self, position: &Position) -> Result<VersionedTransaction> {
        Err(AdapterError::NotSupported)
    }

    // Yield (optional)
    async fn get_yield_positions(&self, wallet: &Pubkey) -> Result<Vec<YieldPosition>> {
        Err(AdapterError::NotSupported)
    }
    async fn get_farms(&self, token: &Pubkey) -> Result<Vec<Farm>> {
        Err(AdapterError::NotSupported)
    }
    async fn harvest_rewards(&self, farm: &Farm, wallet: &Pubkey) -> Result<VersionedTransaction> {
        Err(AdapterError::NotSupported)
    }

    // Lending (optional)
    async fn get_lending_markets(&self, token: &Pubkey) -> Result<Vec<LendingMarket>> {
        Err(AdapterError::NotSupported)
    }
    async fn supply(&self, params: &LendParams) -> Result<VersionedTransaction> {
        Err(AdapterError::NotSupported)
    }
    async fn borrow(&self, params: &BorrowParams) -> Result<VersionedTransaction> {
        Err(AdapterError::NotSupported)
    }

    // Perps (optional)
    async fn get_perp_markets(&self) -> Result<Vec<PerpMarket>> {
        Err(AdapterError::NotSupported)
    }
    async fn open_perp_position(&self, params: &PerpParams) -> Result<VersionedTransaction> {
        Err(AdapterError::NotSupported)
    }

}

pub enum DefiFeature {
    // Swapping
    Swap,
    ConcentratedLiquidity,
    DynamicFees,
    Orderbook,              // CLOB — Phoenix, OpenBook

    // Yield
    Farming,
    Staking,
    AutoCompoundVault,      // deposit-and-forget — Meteora vaults, Kamino

    // Credit
    Lending,
    Borrowing,

    // Derivatives
    Perps,
    Options,                // Zeta, PsyOptions

    // Launch
    Launchpad,

    // Portfolio & Analysis
    Portfolio,
    Bridge,                 // Wormhole, deBridge — cross-chain transfers
    NFT,                    // Tensor, Magic Eden — floor data + sweeping

    // Governance
    Governance,             // JUP DAO, Realms — vote + propose
}

pub enum AdapterHealth {
    Healthy,
    Degraded { reason: String },
    Down,
}
```

### Built-in Adapters

#### Jupiter

```rust
pub struct JupiterAdapter { client: reqwest::Client, worker_url: String }

// Features: Swap, Staking, Launchpad
// APIs used (via Worker):
//   POST /adapter/jupiter/quote    → api.jup.ag/v6/quote
//   POST /adapter/jupiter/swap     → api.jup.ag/v6/swap
//   GET  /adapter/jupiter/price    → price.jup.ag/v2/price
//   GET  /adapter/jupiter/tokens   → token.jup.ag/strict
//   GET  /adapter/jupiter/markets  → api.jup.ag/v6/markets

// Skills exposed:
//   QuickSwap        — best aggregated route across all Solana DEXes
//   TokenLookup      — strict verified token list check
//   PriceFeed        — real-time price for any token
//   StakeJUP         — stake JUP for voting power + rewards
```

#### Orca

```rust
pub struct OrcaAdapter { client: reqwest::Client, worker_url: String }

// Features: Swap, ConcentratedLiquidity, Farming
// APIs used (via Worker):
//   GET  /adapter/orca/pools          → api.mainnet.orca.so/v1/whirlpool/list
//   POST /adapter/orca/quote          → Orca Whirlpool SDK (server-side)
//   GET  /adapter/orca/positions      → user's open Whirlpool positions
//   POST /adapter/orca/open-position  → open CLMM position
//   POST /adapter/orca/close-position → close + collect fees

// Skills exposed:
//   WhirlpoolScanner   — find best fee-tier pool for a pair
//   PositionManager    — view + manage open CLMM positions
//   FeeCollector       — collect accumulated trading fees
//   YieldEstimator     — APR estimate given price range
```

#### Meteora

```rust
pub struct MeteoraAdapter { client: reqwest::Client, worker_url: String }

// Features: Swap, ConcentratedLiquidity, DynamicFees, Farming
// APIs used (via Worker):
//   GET  /adapter/meteora/pairs       → dlmm-api.meteora.ag/pair/all
//   GET  /adapter/meteora/vaults      → app.meteora.ag/api/vaults
//   POST /adapter/meteora/quote       → DLMM quote
//   POST /adapter/meteora/deposit     → add liquidity to DLMM
//   POST /adapter/meteora/withdraw    → remove liquidity
//   GET  /adapter/meteora/positions   → user's active DLMM positions

// Skills exposed:
//   DLMMScanner       — find highest-fee DLMM pools for a pair
//   VaultDeposit      — one-click deposit into auto-compound vault
//   ActiveBinTracker  — show current active bin + fee accrual rate
//   DynamicFeeAlert   — notify when fee rate spikes (high volatility)
```

#### Raydium

```rust
pub struct RaydiumAdapter { client: reqwest::Client, worker_url: String }

// Features: Swap, ConcentratedLiquidity, Farming, Launchpad
// APIs used (via Worker):
//   GET  /adapter/raydium/pools       → api-v3.raydium.io/main/pools/info/list
//   GET  /adapter/raydium/farms       → api-v3.raydium.io/main/farm/info
//   POST /adapter/raydium/quote       → transaction-v3.raydium.io/compute/swap-base-in
//   POST /adapter/raydium/harvest     → harvest all pending rewards
//   GET  /adapter/raydium/positions   → user's CLMM positions

// Skills exposed:
//   FarmDashboard     — all active farms, pending rewards, APR
//   HarvestAll        — batch harvest all pending rewards in one tx
//   CLMMPosition      — open/close concentrated liquidity positions
//   LaunchLabCheck    — check upcoming token launches
```

### Community Adapters — WASM Plugin System

Adapters ship as sandboxed WASM modules via `wasmtime`. The host provides a controlled
API surface — plugins cannot make arbitrary network calls or read the filesystem.

#### Plugin Contract

Every community adapter is a Rust crate compiled to `wasm32-wasi` that implements:

```rust
// Adapter declares itself via exported symbols
#[no_mangle]
pub extern "C" fn quickdraw_adapter_manifest() -> *const u8 {
    // Returns JSON: id, display_name, version, api_domains, features[]
}

// Host imports — the ONLY network access available to the plugin
extern "C" {
    // Make an HTTP request to a domain declared in the manifest
    fn host_http_get(url_ptr: *const u8, url_len: usize) -> HostResponse;
    fn host_http_post(url_ptr: *const u8, url_len: usize, body_ptr: *const u8, body_len: usize) -> HostResponse;

    // Log to Quickdraw's structured logger
    fn host_log(level: u8, msg_ptr: *const u8, msg_len: usize);
}
```

The host enforces:
- **Domain allowlist** — HTTP calls only to domains listed in the manifest
- **Memory cap** — 64MB WASM linear memory max per plugin
- **CPU cap** — 200ms fuel limit per call via `wasmtime`'s epoch interruption
- **No filesystem access** — WASI preopened dirs are empty
- **No RPC access** — plugins cannot call Solana RPC directly; they declare needed data
  in their manifest and the host fetches it before calling into the plugin

#### Plugin Lifecycle

```
Developer writes adapter → compiles to wasm32-wasi
        │
        ▼
Publishes to quickdraw-plugins GitHub registry
  (manifest.json + plugin.wasm + checksum)
        │
        ▼
User opens tray → "Add Protocol" → searches registry
        │
        ▼
Quickdraw downloads .wasm, verifies SHA256
Stores in ~/.config/quickdraw/plugins/
        │
        ▼
On launch: wasmtime loads plugin, calls manifest()
AdapterRegistry registers it alongside built-ins
        │
        ▼
Plugin updates: registry pings manifest.json for new version
User notified in tray → "Update available: Kamino v1.2"
```

#### Plugin Versioning Contract

| Field | Semver rule |
|-------|------------|
| Major bump | Breaking trait changes — host rejects incompatible plugins |
| Minor bump | New optional host APIs added — plugin still runs |
| Patch bump | Bug fixes — auto-updated silently |

The host embeds a `PLUGIN_ABI_VERSION` constant. Plugins declare `min_host_version`.
Incompatible plugins are disabled with a clear tray notification, not silently broken.

#### Planned Community Adapters

| Protocol | Category | Key Feature | Status |
|---------|---------|-------------|--------|
| Kamino | Lending + CLMM | Auto-compounding vaults | v1.1 |
| Drift | Perps + Spot | Orderbook perpetuals | v1.1 |
| MarginFi | Lending | Isolated lending markets | v1.2 |
| Phoenix | Orderbook DEX | Central limit order book | v1.2 |
| Lifinity | AMM | Proactive market making | v1.2 |
| Sanctum | LST | Liquid staking aggregator | v1.2 |
| Tensor | NFT | NFT trading + floor sweeps | v2.0 |
| Zeta | Perps | Options + perpetuals | v2.0 |
| Wormhole | Bridge | Cross-chain asset transfer | v2.0 |
| Realms | Governance | JUP DAO voting + proposals | v2.0 |

---

## Skills System

Skills are the user-facing actions Quickdraw can take. Each skill is independent,
declaratively triggered, and composable — a voice command can chain multiple skills.

### Skill Trait

```rust
#[async_trait]
pub trait QuickdrawSkill: Send + Sync {
    fn id(&self) -> &str;
    fn display_name(&self) -> &str;
    fn description(&self) -> &str;          // shown in skill browser
    fn triggers(&self) -> Vec<Trigger>;
    fn required_adapters(&self) -> Vec<&str>; // ["jupiter"] — checked at install time

    async fn execute(&self, ctx: SkillContext) -> SkillResult;

}

pub enum Trigger {
    OnAddressDetected,          // passive — fires on every detection
    OnTickerClick,              // user clicks $TICKER
    OnDoubleClick,              // double-click address
    OnVoiceCommand(Vec<String>), // intent labels that route here
    OnHotkey(HotkeyCombo),
    OnSwapConfirmed,            // fires after successful swap
    OnSchedule(CronExpr),       // time-based (e.g. daily portfolio report)
}

pub struct SkillContext {
    pub token: Option<TokenData>,
    pub wallet: Option<Pubkey>,
    pub quote: Option<AdapterQuote>,
    pub voice_intent: Option<ParsedIntent>,
    pub adapter_registry: Arc<AdapterRegistry>,
    pub ai: Arc<ProviderRouter>,
    pub conversation: Arc<Mutex<ConversationThread>>,
}

pub enum SkillResult {
    ShowCard(OverlayCard),       // render a card in the overlay
    ShowSwapUI(SwapParams),      // open swap confirmation UI
    ShowChart(ChartData),        // render price chart
    Narrate(String),             // speak + display text
    Chain(Vec<SkillResult>),     // compose multiple results
    Dismiss,
}
```

### Built-in Skills — Full Breakdown

#### TokenVetter
```
Trigger:   OnAddressDetected
Adapters:  Jupiter (token list), RugCheck, Helius
Action:    Aggregate safety score → show badge near detected address
AI:        TokenNarration (Haiku) — 2-sentence summary of risk level
```

#### QuickSwap
```
Trigger:   OnDoubleClick (address or ticker)
Adapters:  Jupiter + Orca + Raydium + Meteora (parallel quotes)
Action:    Fetch all quotes → show ranked swap UI → open wallet on confirm
AI:        SwapRiskWarning (Haiku) — flag high slippage / low liquidity
```

#### PriceChart
```
Trigger:   OnTickerClick
Adapters:  Jupiter (price), Birdeye (OHLCV)
Action:    Render 7D chart in overlay card with timeframe selector
AI:        PriceSummary (Haiku) — trend + RSI + key support/resistance
```

#### VoiceSwap
```
Trigger:   OnVoiceCommand(["swap", "buy", "sell", "trade"])
Adapters:  Jupiter (default), user's preferred protocol
Action:    Parse intent → fetch quote → show confirmation → wallet sign
AI:        VoiceIntent (Haiku) — extract token_in, token_out, amount
```

#### YieldScanner
```
Trigger:   OnVoiceCommand(["yield", "apy", "pool", "farm", "earn"])
Adapters:  Orca + Meteora + Raydium (parallel pool fetch)
Action:    Rank pools by APR for detected token → show comparison card
AI:        YieldStrategy (Sonnet) — recommend pool based on risk preference
```

#### FarmHarvest
```
Trigger:   OnVoiceCommand(["harvest", "claim", "rewards"])
Adapters:  Raydium + Orca (pending rewards fetch)
Action:    Show pending rewards across all farms → batch harvest on confirm
AI:        None — pure data display
```

#### PortfolioCheck
```
Trigger:   OnHotkey / OnVoiceCommand(["portfolio", "balance", "holdings"])
Adapters:  Helius DAS (token accounts), Jupiter (prices)
Action:    Fetch all token holdings → calculate USD value → show breakdown
AI:        PortfolioAnalysis (Sonnet) — suggest rebalancing or exit targets
```

#### DeepReport
```
Trigger:   OnVoiceCommand(["analyze", "research", "deep dive", "is this legit"])
Adapters:  Jupiter + RugCheck + Helius + Birdeye
Action:    Full due diligence card — on-chain + social + price history
AI:        DeepTokenReport (Sonnet) — comprehensive risk + opportunity analysis
```

#### WhaleAlert
```
Trigger:   OnSchedule("*/5 * * * *")  — every 5 min for watchlisted tokens
Adapters:  Helius (large tx webhook)
Action:    Notify if whale wallet moves >$50K of watched token
AI:        TokenNarration (Haiku) — contextualise the whale movement
```

#### PositionManager
```
Trigger:   OnVoiceCommand(["positions", "my lp", "liquidity"])
Adapters:  Orca + Meteora + Raydium (positions fetch)
Action:    Show all open LP positions, fees earned, current range status
AI:        YieldStrategy (Sonnet) — flag out-of-range positions
```

### Skill Composition — Voice Command Chains

A single voice command can activate multiple skills in sequence:

```
User: "check this token and if it's safe swap half my SOL for it"
        │
        ├── VoiceIntent parses: check + conditional swap
        ├── TokenVetter runs → score = 87/100 (safe)
        │   condition met →
        └── VoiceSwap runs → amount = half of SOL balance → swap UI shown
```

```rust
pub struct SkillChain {
    pub steps: Vec<SkillStep>,
}

pub enum SkillStep {
    Always(Box<dyn QuickdrawSkill>),
    ConditionalOn { condition: Condition, skill: Box<dyn QuickdrawSkill> },
}

pub enum Condition {
    SafetyScoreAbove(u8),
    SafetyScoreBelow(u8),
    PriceChangeAbove(f64),
    UserConfirms,
}
```

---

## SDK Integration

How each protocol adapter integrates with its upstream SDK and APIs.
The rule: **HTTP APIs for reads, SDK for building transactions.**

```
Read (quotes, pools, prices, positions)
  → HTTP API via Cloudflare Worker
  → Fast, no Solana node needed, simple reqwest calls

Write (swap, deposit, harvest)
  → SDK builds the instruction set → VersionedTransaction
  → Wallet signs → Helius RPC submits
```

### Solana RPC Setup

All adapters share one `RpcClient`. Use Helius for reliability and
DAS API access — standard public RPC rate-limits will throttle fast
polling (token detection + multi-adapter quote fetching).

```rust
// quickdraw-infra/src/rpc.rs
pub fn create_rpc_client(helius_api_key: &str) -> RpcClient {
    let url = format!("https://mainnet.helius-rpc.com/?api-key={helius_api_key}");
    RpcClient::new_with_commitment(url, CommitmentConfig::confirmed())
}
```

```toml
# Cargo.toml
solana-client    = "1.18"
solana-sdk       = "1.18"
solana-program   = "1.18"
anchor-client    = "0.30"
anchor-lang      = "0.30"
spl-token        = "4.0"
spl-associated-token-account = "3.0"
```

---

### Jupiter Integration

Jupiter is the simplest — their API builds the full transaction for you.
No Anchor IDL needed for swaps.

```
Read:  GET  /quote    → best route across all Solana DEXes
Write: POST /swap     → returns base64 VersionedTransaction
```

```rust
// quickdraw-defi/src/adapters/jupiter.rs

const JUPITER_API: &str = "https://api.jup.ag/swap/v1";

pub struct JupiterAdapter {
    client: reqwest::Client,
    worker_url: String,         // all calls go through Cloudflare Worker
}

impl JupiterAdapter {
    // Step 1 — get best route
    pub async fn get_quote(&self, params: &SwapParams) -> Result<JupiterQuote> {
        let resp = self.client
            .get(format!("{}/quote", JUPITER_API))
            .query(&[
                ("inputMint",        params.token_in.to_string()),
                ("outputMint",       params.token_out.to_string()),
                ("amount",           params.amount_lamports.to_string()),
                ("slippageBps",      (params.slippage_pct * 100.0) as u64.to_string()),
                ("restrictIntermediateTokens", "true".to_string()),
            ])
            .send().await?
            .json::<JupiterQuote>().await?;
        Ok(resp)
    }

    // Step 2 — build unsigned transaction from quote
    pub async fn build_swap_transaction(
        &self,
        quote: &JupiterQuote,
        wallet: &Pubkey,
    ) -> Result<VersionedTransaction> {
        #[derive(Serialize)]
        struct SwapRequest<'a> {
            #[serde(rename = "quoteResponse")]
            quote_response: &'a JupiterQuote,
            #[serde(rename = "userPublicKey")]
            user_public_key: String,
            #[serde(rename = "dynamicComputeUnitLimit")]
            dynamic_compute_unit_limit: bool,
            #[serde(rename = "prioritizationFeeLamports")]
            prioritization_fee_lamports: u64,
        }

        let resp = self.client
            .post(format!("{}/swap", JUPITER_API))
            .json(&SwapRequest {
                quote_response: quote,
                user_public_key: wallet.to_string(),
                dynamic_compute_unit_limit: true,
                prioritization_fee_lamports: 1000,   // ~$0.0001 priority fee
            })
            .send().await?
            .json::<JupiterSwapResponse>().await?;

        // Deserialise base64 transaction Jupiter returns
        let tx_bytes = base64::decode(&resp.swap_transaction)?;
        let tx: VersionedTransaction = bincode::deserialize(&tx_bytes)?;
        Ok(tx)
    }

    // Price feed — used by market pulse + token card
    pub async fn get_price(&self, mint: &Pubkey) -> Result<f64> {
        let resp = self.client
            .get("https://api.jup.ag/price/v2")
            .query(&[("ids", mint.to_string())])
            .send().await?
            .json::<JupiterPriceResponse>().await?;
        Ok(resp.data[&mint.to_string()].price)
    }
}
```

---

### Meteora Integration

Meteora has two products: **DLMM** (dynamic liquidity market maker) and **Vaults**.
Each uses its own Anchor program and SDK.

```toml
# Meteora Rust SDK — published on crates.io
meteora-dlmm    = "0.6"     # DLMM pools
meteora-vaults  = "0.4"     # auto-compound vaults (read via HTTP only)
```

#### DLMM — Pool Data (HTTP Read)

```rust
// quickdraw-defi/src/adapters/meteora.rs

const METEORA_DLMM_API: &str = "https://dlmm-api.meteora.ag";

pub struct MeteoraAdapter {
    client: reqwest::Client,
    rpc: Arc<RpcClient>,
    dlmm_program: Pubkey,    // LBUZKhRxPF3XUpBCjp4YzTKgLLjeyegsnkragJxcJVBi
}

// Fetch all pools for a token pair — HTTP, no RPC needed
pub async fn get_pools(&self, token: &Pubkey) -> Result<Vec<MeteoraPool>> {
    let resp = self.client
        .get(format!("{}/pair/all_with_pagination", METEORA_DLMM_API))
        .query(&[
            ("include_unknown", "false"),
            ("sort_key", "feeApr"),
            ("order_by", "desc"),
            ("limit", "20"),
        ])
        .send().await?
        .json::<MeteoraPoolsResponse>().await?;

    // Filter to pools containing our token
    Ok(resp.pairs.into_iter()
        .filter(|p| p.mint_x == token.to_string() || p.mint_y == token.to_string())
        .collect())
}

// Get user's open DLMM positions — RPC + SDK
pub async fn get_positions(&self, wallet: &Pubkey) -> Result<Vec<DlmmPosition>> {
    use meteora_dlmm::state::Position;

    // Fetch all Position accounts owned by the DLMM program for this wallet
    let accounts = self.rpc.get_program_accounts_with_config(
        &self.dlmm_program,
        RpcProgramAccountsConfig {
            filters: Some(vec![
                RpcFilterType::Memcmp(Memcmp::new_raw_bytes(
                    8,                            // skip anchor discriminator
                    wallet.to_bytes().to_vec(),   // filter by owner pubkey
                )),
            ]),
            ..Default::default()
        },
    ).await?;

    accounts.iter()
        .map(|(pubkey, account)| {
            let position = Position::try_deserialize(&mut &account.data[..])?;
            Ok(DlmmPosition { pubkey: *pubkey, data: position })
        })
        .collect()
}
```

#### DLMM — Build Deposit Transaction (SDK)

```rust
// Add liquidity to a DLMM pool — uses Meteora SDK, not HTTP
pub async fn build_deposit_transaction(
    &self,
    pool: &Pubkey,
    wallet: &Pubkey,
    amount_x: u64,
    amount_y: u64,
    strategy: StrategyType,     // SpotBalanced / CurveBalanced / BidAsk
) -> Result<VersionedTransaction> {
    use meteora_dlmm::{
        instructions::add_liquidity_by_strategy,
        state::LbPair,
        math::price_math,
    };

    // Load pool state from chain
    let pool_account = self.rpc.get_account(pool).await?;
    let lb_pair = LbPair::try_deserialize(&mut &pool_account.data[..])?;

    // Get current active bin for price reference
    let active_bin_price = price_math::get_price_from_id(
        lb_pair.active_id,
        lb_pair.bin_step,
    )?;

    // Build position bounds (±5 bins around active bin)
    let bin_range = BinRange {
        lower_bin_id: lb_pair.active_id - 5,
        upper_bin_id: lb_pair.active_id + 5,
    };

    // Build instruction via SDK
    let ix = add_liquidity_by_strategy(
        &self.dlmm_program,
        pool,
        wallet,
        amount_x,
        amount_y,
        bin_range,
        strategy,
    )?;

    // Wrap in VersionedTransaction with recent blockhash
    let blockhash = self.rpc.get_latest_blockhash().await?;
    let tx = VersionedTransaction::try_new(
        VersionedMessage::Legacy(Message::new(&[ix], Some(wallet))),
        &[],   // unsigned — wallet signs separately
    )?;

    Ok(tx)
}
```

---

### Orca Whirlpools Integration

Orca's CLMM is called Whirlpools. The Rust SDK is maintained by Orca officially.

```toml
orca-whirlpools-client  = "1.0"
orca-whirlpools-core    = "1.0"
```

```rust
// quickdraw-defi/src/adapters/orca.rs

use orca_whirlpools_client::{
    get_whirlpool, get_position, fetch_positions_for_owner,
    open_position_instructions, close_position_instructions,
    swap_instructions,
};
use orca_whirlpools_core::{
    sqrt_price_to_price, tick_index_to_price,
    get_tick_array_start_tick_index,
};

pub struct OrcaAdapter {
    rpc: Arc<RpcClient>,
    whirlpool_program: Pubkey,   // whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc
}

// Get all Whirlpools for a token pair — HTTP (Orca public API)
pub async fn get_pools(&self, token: &Pubkey) -> Result<Vec<WhirlpoolInfo>> {
    let resp = self.client
        .get("https://api.mainnet.orca.so/v1/whirlpool/list")
        .send().await?
        .json::<OrcaPoolsResponse>().await?;

    Ok(resp.whirlpools.into_iter()
        .filter(|p| {
            p.token_a.mint == token.to_string()
            || p.token_b.mint == token.to_string()
        })
        .collect())
}

// Get user's open positions — SDK, on-chain
pub async fn get_positions(&self, wallet: &Pubkey) -> Result<Vec<WhirlpoolPosition>> {
    // Orca SDK fetches all Position NFTs held by wallet via token accounts
    let positions = fetch_positions_for_owner(&self.rpc, wallet).await?;

    positions.iter().map(|(pubkey, position)| {
        let pool = get_whirlpool(&self.rpc, &position.whirlpool).await?;

        // Convert sqrt_price to human-readable price
        let current_price = sqrt_price_to_price(
            pool.sqrt_price,
            pool.token_mint_a,
            pool.token_mint_b,
        );

        let lower_price = tick_index_to_price(position.tick_lower_index, pool.tick_spacing);
        let upper_price = tick_index_to_price(position.tick_upper_index, pool.tick_spacing);

        let in_range = current_price >= lower_price && current_price <= upper_price;

        Ok(WhirlpoolPosition {
            pubkey: *pubkey,
            pool: position.whirlpool,
            liquidity: position.liquidity,
            lower_price,
            upper_price,
            current_price,
            in_range,
            fees_owed_a: position.fee_growth_checkpoint_a,
            fees_owed_b: position.fee_growth_checkpoint_b,
        })
    }).collect()
}

// Build swap transaction — SDK builds instructions, no manual CPI
pub async fn build_swap_transaction(
    &self,
    pool: &Pubkey,
    wallet: &Pubkey,
    amount: u64,
    a_to_b: bool,
    slippage_bps: u16,
) -> Result<VersionedTransaction> {
    let (instructions, _) = swap_instructions(
        &self.rpc,
        pool,
        amount,
        a_to_b,
        slippage_bps,
        wallet,
        None,   // token_owner_account_a — SDK derives it
        None,   // token_owner_account_b
    ).await?;

    let blockhash = self.rpc.get_latest_blockhash().await?;
    Ok(VersionedTransaction::try_new(
        VersionedMessage::Legacy(Message::new(&instructions, Some(wallet))),
        &[],
    )?)
}
```

---

### Raydium Integration

Raydium has two pool types: **AMM v4** (legacy) and **CLMM** (concentrated).
Raydium's API builds transactions for swaps — use SDK only for farm interactions.

```toml
raydium-library  = "1.1"   # Raydium's official Rust crate
spl-token-2022   = "1.0"
```

```rust
// quickdraw-defi/src/adapters/raydium.rs

const RAYDIUM_API: &str = "https://api-v3.raydium.io";

pub struct RaydiumAdapter {
    client: reqwest::Client,
    rpc: Arc<RpcClient>,
    amm_program:  Pubkey,   // 675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8
    clmm_program: Pubkey,   // CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK
    farm_program: Pubkey,   // 9KEPoZmtHUrBbhWN1v1KWLMkkvwY6WLtAVUCPRtRjpzu
}

// Swap quote — Raydium API, not SDK
pub async fn get_quote(&self, params: &SwapParams) -> Result<RaydiumQuote> {
    let resp = self.client
        .get(format!("{}/compute/swap-base-in", RAYDIUM_API))  // NOTE: goes via Worker
        .query(&[
            ("inputMint",   params.token_in.to_string()),
            ("outputMint",  params.token_out.to_string()),
            ("amount",      params.amount_lamports.to_string()),
            ("slippageBps", (params.slippage_pct * 100.0) as u64.to_string()),
            ("txVersion",   "V0".to_string()),
        ])
        .send().await?
        .json::<RaydiumQuote>().await?;
    Ok(resp)
}

// Build swap tx — API returns serialized tx, same pattern as Jupiter
pub async fn build_swap_transaction(
    &self,
    quote: &RaydiumQuote,
    wallet: &Pubkey,
) -> Result<VersionedTransaction> {
    let resp = self.client
        .post(format!("{}/transaction/swap-base-in", RAYDIUM_API))
        .json(&json!({
            "computeUnitPriceMicroLamports": "1000",
            "swapResponse": quote,
            "txVersion": "V0",
            "wallet": wallet.to_string(),
            "wrapSol": true,
            "unwrapSol": true,
        }))
        .send().await?
        .json::<RaydiumTxResponse>().await?;

    let tx_bytes = base64::decode(&resp.data[0].transaction)?;
    Ok(bincode::deserialize(&tx_bytes)?)
}

// Farm rewards — SDK required (no HTTP endpoint for this)
pub async fn get_farm_pending_rewards(
    &self,
    wallet: &Pubkey,
) -> Result<Vec<FarmReward>> {
    use raydium_library::farm;

    // Fetch all farm stake accounts for this wallet
    let stake_accounts = farm::get_stake_accounts_for_owner(
        &self.rpc,
        &self.farm_program,
        wallet,
    ).await?;

    stake_accounts.iter().map(|(farm_id, stake)| {
        let farm_info = farm::load_farm_info(&self.rpc, farm_id).await?;

        let pending = farm::calculate_pending_rewards(
            &farm_info,
            stake,
            self.rpc.get_slot().await?,
        )?;

        Ok(FarmReward { farm_id: *farm_id, pending_lamports: pending })
    }).collect()
}

// Harvest all farms in a single batched transaction
pub async fn build_harvest_transaction(
    &self,
    farms: &[FarmReward],
    wallet: &Pubkey,
) -> Result<VersionedTransaction> {
    use raydium_library::farm;

    let instructions: Vec<Instruction> = farms.iter()
        .map(|f| farm::harvest_instruction(
            &self.farm_program,
            &f.farm_id,
            wallet,
        ))
        .collect::<Result<_>>()?;

    let blockhash = self.rpc.get_latest_blockhash().await?;
    Ok(VersionedTransaction::try_new(
        VersionedMessage::Legacy(Message::new(&instructions, Some(wallet))),
        &[],
    )?)
}
```

---

### Transaction Submit — Shared Logic

All adapters produce an unsigned `VersionedTransaction`. Submission is handled once
in a shared layer, not per adapter:

```rust
// quickdraw-infra/src/tx.rs

pub struct TransactionSubmitter {
    rpc: Arc<RpcClient>,
}

impl TransactionSubmitter {
    // Attach fresh blockhash, submit, poll for confirmation
    pub async fn submit(
        &self,
        mut tx: VersionedTransaction,
        signature: Signature,   // from wallet bridge
    ) -> Result<TransactionStatus> {
        // Inject signature from wallet
        tx.signatures = vec![signature];

        // Send with retries — Solana can drop txs at high load
        let sig = self.rpc
            .send_and_confirm_transaction_with_spinner_and_config(
                &tx,
                CommitmentConfig::confirmed(),
                RpcSendTransactionConfig {
                    skip_preflight: false,
                    preflight_commitment: Some(CommitmentLevel::Confirmed),
                    max_retries: Some(5),
                    ..Default::default()
                },
            ).await?;

        Ok(TransactionStatus::Confirmed(sig))
    }
}
```

---

### SDK Integration Summary

| Protocol | Read (pools, prices, positions) | Write (swap, deposit, harvest) |
|---------|-------------------------------|-------------------------------|
| **Jupiter** | HTTP `api.jup.ag` | HTTP `/swap` returns base64 tx |
| **Meteora DLMM** | HTTP `dlmm-api.meteora.ag` | `meteora-dlmm` SDK builds instructions |
| **Orca Whirlpools** | HTTP `api.mainnet.orca.so` | `orca-whirlpools-client` SDK |
| **Raydium Swap** | HTTP `api-v3.raydium.io` | HTTP `/transaction/swap` returns base64 tx |
| **Raydium Farms** | RPC program accounts scan | `raydium-library` SDK builds harvest ix |

### Crate Additions for SDK Layer

| Crate | Version | Purpose |
|-------|---------|---------|
| `solana-client` | 1.18 | RPC — `get_account`, `send_transaction` |
| `solana-sdk` | 1.18 | `Pubkey`, `Signature`, `VersionedTransaction` |
| `anchor-client` | 0.30 | Anchor program account deserialization |
| `anchor-lang` | 0.30 | `AccountDeserialize` derive macro |
| `spl-token` | 4.0 | Token account helpers |
| `spl-associated-token-account` | 3.0 | ATA derivation |
| `meteora-dlmm` | 0.6 | DLMM position + deposit instructions |
| `orca-whirlpools-client` | 1.0 | Whirlpool position + swap instructions |
| `orca-whirlpools-core` | 1.0 | Price math, tick calculations |
| `raydium-library` | 1.1 | Farm stake accounts + harvest instructions |
| `bincode` | 1.3 | Deserialize base64 transactions from APIs |
| `base64` | 0.22 | Decode API-returned transactions |
---

## Extensibility Guide

How developers add new adapters, skills, and AI providers without touching core.
Each extension type is a trait implementation registered at startup — no forks, no PRs required.

### Adding a New DeFi Adapter

1. Create `crates/quickdraw-defi/src/adapters/yourprotocol.rs`
2. Implement `DefiAdapter` — only implement the optional methods your protocol actually supports
3. Add Cloudflare Worker routes for any upstream APIs in `worker/src/index.ts`
4. Register in `AdapterRegistry::default()` in `adapter.rs`

```rust
// Minimal adapter — swap only
pub struct YourProtocolAdapter {
    client: reqwest::Client,
    worker_url: String,
}

#[async_trait]
impl DefiAdapter for YourProtocolAdapter {
    fn id(&self) -> &str { "yourprotocol" }
    fn display_name(&self) -> &str { "Your Protocol" }
    fn icon_url(&self) -> &str { "https://yourprotocol.com/icon.png" }
    fn supported_features(&self) -> Vec<DefiFeature> { vec![DefiFeature::Swap] }

    async fn health_check(&self) -> AdapterHealth {
        match self.client.get(format!("{}/health", self.worker_url)).send().await {
            Ok(r) if r.status().is_success() => AdapterHealth::Healthy,
            Ok(r) => AdapterHealth::Degraded { reason: r.status().to_string() },
            Err(e) => AdapterHealth::Down,
        }
    }

    async fn get_quote(&self, params: &SwapParams) -> Result<Quote> {
        // your implementation
    }

    async fn build_transaction(&self, quote: &Quote, wallet: &Pubkey) -> Result<VersionedTransaction> {
        // your implementation
    }

    // All other methods default to Err(AdapterError::NotSupported) — don't implement them
}
```

**Checklist for a new adapter:**
- [ ] Add crate deps to `crates/quickdraw-defi/Cargo.toml`
- [ ] Add Worker route to `worker/src/index.ts` (keep API keys server-side)
- [ ] Add Worker secret to `wrangler.toml` if needed
- [ ] Add `health_check` — the registry marks your adapter degraded if it fails
- [ ] Add at least one skill in `crates/quickdraw-defi/src/skills/` that uses your adapter
- [ ] Test against devnet before mainnet (see Testing Strategy)

---

### Adding a New Skill

Skills are the user-visible actions. They're independent of adapters — one skill
can use multiple adapters, and one adapter can power multiple skills.

```rust
// crates/quickdraw-defi/src/skills/your_skill.rs

pub struct YourSkill;

#[async_trait]
impl QuickdrawSkill for YourSkill {
    fn id(&self) -> &str { "your_skill" }
    fn display_name(&self) -> &str { "Your Skill" }
    fn description(&self) -> &str { "What this skill does — shown in skill browser" }

    fn triggers(&self) -> Vec<Trigger> {
        vec![
            Trigger::OnVoiceCommand(vec!["keyword1".into(), "keyword2".into()]),
            Trigger::OnHotkey(HotkeyCombo::ctrl_shift('Y')),
        ]
    }

    fn required_adapters(&self) -> Vec<&str> {
        vec!["jupiter"]   // Quickdraw won't install this skill if Jupiter is missing
    }

    async fn execute(&self, ctx: SkillContext) -> SkillResult {
        let token = ctx.token.ok_or(SkillError::NoToken)?;

        // Use adapters from context — never construct adapters directly
        let adapter = ctx.adapter_registry.get("jupiter")?;
        let quote = adapter.get_quote(&SwapParams { .. }).await?;

        // Use AI from context — never construct providers directly
        let narration = ctx.ai
            .complete(AIRequest { task: AITask::TokenNarration, .. })
            .await?;

        SkillResult::Chain(vec![
            SkillResult::ShowCard(build_your_card(quote)),
            SkillResult::Narrate(narration.text),
        ])
    }
}
```

Register in `SkillDispatcher::default()` in `skill.rs`. Skills are enabled/disabled
per-user in settings — the user controls which skills are active.

---

### Adding a New AI Provider

Any model that can accept a prompt and return text slots into the provider layer.

```rust
// crates/quickdraw-ai/src/providers/your_model.rs

pub struct YourModelProvider {
    client: reqwest::Client,
    api_url: String,
    api_key: String,    // loaded from worker or env — never hardcoded
}

#[async_trait]
impl AIProvider for YourModelProvider {
    fn id(&self) -> &str { "yourmodel" }
    fn display_name(&self) -> &str { "Your Model v1" }
    fn is_local(&self) -> bool { false }
    fn supports_vision(&self) -> bool { true }
    fn supports_streaming(&self) -> bool { true }

    async fn complete(&self, req: AIRequest) -> Result<AIResponse> {
        // Translate AIRequest → your model's API format
        // Translate response → AIResponse
    }

    async fn stream(&self, req: AIRequest) -> Result<Pin<Box<dyn Stream<Item = Result<String>> + Send>>> {
        // Normalise streaming format → Stream<Item = Result<String>> (text deltas only)
    }

    async fn health_check(&self) -> bool {
        self.client.get(format!("{}/health", self.api_url)).send().await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }
}
```

Register in `ProviderRegistry` at startup. The provider appears automatically in the
tray "AI Mode" dropdown — no UI code changes needed.

**Provider tiers:** assign your provider to `AITier::Fast` or `AITier::Deep` in
`ProviderRouter::pick_online()`. Fast tier is for sub-200ms tasks (token narration,
intent parsing). Deep tier is for analysis, vision, and strategy tasks.

---

## Wallet Integration

Quickdraw NEVER holds private keys or seed phrases. All signing happens in the user's wallet.

### Supported Methods (MVP)

| Method | How | Wallets | Priority |
|--------|-----|---------|---------|
| **WalletConnect v2** | QR scan → mobile wallet | Phantom, Solflare, Backpack, Trust | ✅ v1.0 |
| **Ledger USB** | HID → hardware device | Ledger Nano S/X/S Plus | ✅ v1.0 |
| Phantom Deep Link | Opens desktop app | Phantom desktop only | ⏳ v1.1 |
| Keypair File | Local JSON import | — | ❌ Dropped |
| Privy MPC | Embedded wallet | — | ❌ Dropped |

Keypair file dropped (security risk). Privy dropped (MPC custody concerns + web SDK only).
Phantom deep link deferred — WalletConnect already covers Phantom mobile users.

### Signing Flow

```
Quickdraw builds unsigned VersionedTransaction
        │
        ▼
WalletConnect relay  OR  Ledger USB HID
(user approves on phone  OR  presses button on device)
        │
        ▼
Quickdraw receives Signature
        │
        ▼
Confirms on-chain via Helius RPC
Shows: "✅ Swapped · View on Solscan"
```

### WalletConnect v2 Flow

```
User clicks "Connect Wallet" → selects WalletConnect
        │
        ▼
Quickdraw generates pairing URI, renders QR code
        │
        ▼
User scans with Phantom / Solflare / Backpack (mobile)
        │
        ▼
WebSocket session via wss://relay.walletconnect.com
Session persisted — reconnects automatically on relaunch
        │
On swap: Quickdraw sends sign request via relay
       → user sees tx details on phone → approves
       → signature returned to Quickdraw
```

### Ledger USB Flow

```
User plugs in Ledger, opens Solana app on device
        │
        ▼
Quickdraw detects via hidapi crate
Derivation path: m/44'/501'/0'/0' (default Solana)
        │
        ▼
Quickdraw sends serialised tx to Ledger via APDU
User reads tx summary on Ledger screen → presses confirm
        │
        ▼
Signature returned, submitted to RPC
```

### WalletBridge Trait

```rust
#[async_trait]
pub trait WalletBridge: Send + Sync {
    fn id(&self) -> &str;
    fn display_name(&self) -> &str;
    fn is_available(&self) -> bool;        // Ledger plugged in? WC session active?

    async fn connect(&self) -> Result<Pubkey>;
    async fn disconnect(&self) -> Result<()>;
    async fn sign_transaction(&self, tx: VersionedTransaction) -> Result<Signature>;
    async fn sign_all(&self, txs: Vec<VersionedTransaction>) -> Result<Vec<Signature>>;
}

// v1.0 implementations only
pub struct WalletConnectBridge {
    relay_url: String,          // wss://relay.walletconnect.com
    project_id: String,         // WC project ID from cloud.walletconnect.com
    session: Option<WCSession>, // persisted across relaunches
}

pub struct LedgerBridge {
    device: HidDevice,
    derivation_path: DerivationPath,
}
```

### Crate Additions for Wallet Layer

| Concern | Crate |
|---------|-------|
| WalletConnect v2 | `walletconnect-client` or raw `tokio-tungstenite` + WC protocol |
| QR code render | `qrcode` + `egui` texture upload |
| Ledger HID | `hidapi` + `ledger-transport-hid` |
| Session persistence | `serde` + existing `toml` settings file |

---

## Security Architecture

### What Quickdraw Never Does
- Stores private keys or seed phrases
- Signs transactions itself
- Has custody of funds
- Opens local server ports (verified via strace/lsof audit)
- Logs conversation history or financial intent to disk unencrypted

### What Quickdraw Always Does
- Validates all detected token addresses (base58, 32–44 chars) before any API call
- Shows full decoded transaction details before opening wallet
- Verifies the built transaction matches the quote before display
- Warns on high slippage (>2%) and flags MEV sandwich risk
- Warns on low-score tokens before swap, requires explicit confirmation
- Validates on-chain confirmation after swap before marking success
- Zeroes audio, screenshot, and conversation buffers after use (`zeroize`)
- Routes all API calls through Cloudflare Worker (no keys in binary)

---

### Worker Request Authentication

**The biggest attack surface: the Worker URL is baked into the binary.**
If leaked or extracted, anyone can use your Anthropic/Helius/Birdeye keys for free.
Defense: every request from the app includes an HMAC-signed timestamp.

```typescript
// worker/src/index.ts — authenticate every request before proxying

const APP_SECRET = env.APP_SHARED_SECRET;  // wrangler secret — not in binary

async function verifyRequest(request: Request): Promise<boolean> {
  const timestamp = request.headers.get("X-Quickdraw-Timestamp");
  const signature = request.headers.get("X-Quickdraw-Sig");

  if (!timestamp || !signature) return false;

  // Reject requests older than 30 seconds — prevents replay attacks
  const age = Date.now() / 1000 - parseInt(timestamp);
  if (age > 30 || age < -5) return false;

  // HMAC-SHA256(secret, timestamp + method + path)
  const message = `${timestamp}:${request.method}:${new URL(request.url).pathname}`;
  const expected = await computeHmac(APP_SECRET, message);

  return timingSafeEqual(expected, signature);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!(await verifyRequest(request))) {
      return new Response("Unauthorized", { status: 401 });
    }
    // ... proxy logic
  }
}
```

```rust
// quickdraw-infra/src/worker_client.rs — sign every outgoing request

impl WorkerClient {
    fn sign_request(&self, method: &str, path: &str) -> (String, String) {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH).unwrap().as_secs().to_string();
        let message = format!("{timestamp}:{method}:{path}");
        let sig = hmac_sha256(self.app_secret.as_bytes(), message.as_bytes());
        (timestamp, hex::encode(sig))
    }

    pub async fn post(&self, path: &str, body: impl Serialize) -> Result<Response> {
        let (timestamp, sig) = self.sign_request("POST", path);
        self.client
            .post(format!("{}{}", self.worker_url, path))
            .header("X-Quickdraw-Timestamp", timestamp)
            .header("X-Quickdraw-Sig", sig)
            .json(&body)
            .send().await.map_err(Into::into)
    }
}
```

The `APP_SHARED_SECRET` is generated at build time per-distribution, injected via
`env!("APP_SECRET")`, and rotated on each release. It is NOT user-visible.

---

### Worker Rate Limiting

```typescript
// worker/src/index.ts — per-IP sliding window via Cloudflare KV

const RATE_LIMITS: Record<string, { rpm: number }> = {
  "/ai/fast":         { rpm: 60 },   // 1/sec sustained
  "/ai/deep":         { rpm: 20 },   // vision calls are expensive
  "/adapter/jupiter": { rpm: 120 },  // quotes are cheap
  "/token/check":     { rpm: 30 },
};

async function checkRateLimit(ip: string, path: string, env: Env): Promise<boolean> {
  const limit = RATE_LIMITS[path];
  if (!limit) return true;

  const key = `rl:${ip}:${path}:${Math.floor(Date.now() / 60000)}`;
  const current = parseInt(await env.KV.get(key) ?? "0");

  if (current >= limit.rpm) return false;

  await env.KV.put(key, String(current + 1), { expirationTtl: 120 });
  return true;
}
```

Rate limit response: `429 Too Many Requests` with `Retry-After: 60`.
The app surfaces this as a tray notification, not a crash.

---

### Input Validation at Detection Boundary

All token addresses entering the system from ANY source (extension, AX API, OCR)
must pass validation before touching the network:

```rust
// quickdraw-detection/src/validator.rs

pub fn validate_solana_address(raw: &str) -> Result<Pubkey> {
    // Length: Solana base58 addresses are 32–44 chars
    if raw.len() < 32 || raw.len() > 44 {
        return Err(ValidationError::InvalidLength);
    }

    // Base58 character set only (no 0, O, I, l)
    if raw.chars().any(|c| !BASE58_CHARS.contains(c)) {
        return Err(ValidationError::InvalidCharacters);
    }

    // Full parse — catches checksum failures
    Pubkey::from_str(raw).map_err(|_| ValidationError::ParseFailed)
}

// Called immediately in DetectionEnricher before any adapter call
pub fn enrich(&self, raw_detection: RawDetection) -> Option<DetectionEvent> {
    let address = validate_solana_address(&raw_detection.text).ok()?;
    // Only valid addresses reach the FSM
    Some(DetectionEvent { address, .. })
}
```

Similarly, all JSON from upstream APIs is deserialized into typed structs — never
passed raw to AI prompts or rendered directly in the UI.

---

### Swap Transaction Verification

Before displaying the confirmation screen, Quickdraw decodes and verifies the
built transaction matches what the user was quoted:

```rust
// quickdraw-defi/src/tx_verifier.rs

pub struct SwapVerifier;

impl SwapVerifier {
    pub fn verify(
        tx: &VersionedTransaction,
        expected_quote: &Quote,
        wallet: &Pubkey,
    ) -> Result<VerifiedSwap> {
        // 1. Verify fee payer is the user's wallet — not a third party
        let fee_payer = tx.message.static_account_keys().first()
            .ok_or(VerifyError::NoFeePayer)?;
        if fee_payer != wallet {
            return Err(VerifyError::UnexpectedFeePayer);
        }

        // 2. Verify no unexpected signers (only wallet should sign)
        if tx.message.header().num_required_signatures > 1 {
            return Err(VerifyError::UnexpectedSigners);
        }

        // 3. Parse instructions — check token program calls match expected mints
        let (actual_in_mint, actual_out_mint) = extract_swap_mints(tx)?;
        if actual_in_mint != expected_quote.input_mint {
            return Err(VerifyError::MintMismatch { expected: expected_quote.input_mint, actual: actual_in_mint });
        }
        if actual_out_mint != expected_quote.output_mint {
            return Err(VerifyError::MintMismatch { expected: expected_quote.output_mint, actual: actual_out_mint });
        }

        // 4. Verify transaction size is reasonable (< 1232 bytes — Solana limit)
        let serialized = bincode::serialize(tx)?;
        if serialized.len() > 1232 {
            return Err(VerifyError::OversizedTransaction);
        }

        Ok(VerifiedSwap {
            fee_payer: *wallet,
            input_mint: actual_in_mint,
            output_mint: actual_out_mint,
            estimated_out: expected_quote.out_amount,
        })
    }
}

// Called before showing swap confirmation UI — never skip this
pub async fn build_and_verify(
    adapter: &dyn DefiAdapter,
    quote: &Quote,
    wallet: &Pubkey,
) -> Result<(VersionedTransaction, VerifiedSwap)> {
    let tx = adapter.build_transaction(quote, wallet).await?;
    let verified = SwapVerifier::verify(&tx, quote, wallet)?;
    Ok((tx, verified))
}
```

If verification fails, the swap is aborted and the user sees: "Transaction mismatch
— this swap was rejected for safety. Please try again."

---

### MEV / Sandwich Attack Protection

```rust
// quickdraw-defi/src/mev_guard.rs

pub struct MevGuard;

impl MevGuard {
    // Check if current market conditions suggest a sandwich is likely
    pub async fn assess(
        quote: &Quote,
        rpc: &RpcClient,
    ) -> MevRisk {
        // High price impact = large order relative to pool depth = sandwich target
        if quote.price_impact_pct > 1.0 {
            return MevRisk::High {
                reason: format!("Price impact {:.1}% — large orders attract sandwich bots", quote.price_impact_pct),
                recommended_action: MevAction::ReduceAmount,
            };
        }

        // Pool with very low liquidity = easy to move price = sandwich magnet
        if quote.liquidity_usd < 50_000.0 {
            return MevRisk::Medium {
                reason: "Low pool liquidity — consider a different route".into(),
                recommended_action: MevAction::UseAggregator,
            };
        }

        MevRisk::Low
    }

    // Recommend tighter slippage for MEV-resistant swap
    pub fn recommended_slippage(risk: &MevRisk, user_slippage: f64) -> f64 {
        match risk {
            MevRisk::High { .. }   => user_slippage.min(0.5),   // force tight
            MevRisk::Medium { .. } => user_slippage.min(1.0),
            MevRisk::Low           => user_slippage,
        }
    }
}
```

The swap confirmation UI shows MEV risk prominently:
```
⚠️  MEV Risk: Medium
Pool liquidity is low ($32K). A sandwich bot could move
the price before your swap settles.
Slippage tightened to 1.0% automatically.
[Proceed anyway]  [Cancel]
```

---

### Memory Zeroing — Expanded Scope

`zeroize` already covers audio and screenshots. Also covers:

```rust
// Any struct containing financial intent or wallet data must zeroize on drop

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct ParsedSwapIntent {
    pub amount: f64,
    pub token_in: String,
    pub token_out: String,
}

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct ConversationMessage {
    pub role: String,
    pub content: String,   // may contain wallet addresses, amounts, strategy
}

// WalletConnect session — zeroed on disconnect
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct WCSession {
    pub topic: String,
    pub symmetric_key: Vec<u8>,   // WC v2 encryption key
}
```

---

### Binary Hardening

```toml
[profile.release]
lto           = true
codegen-units = 1
panic         = "abort"
strip         = true
opt-level     = 3
```

**Linux privilege minimization:**
Ship a udev rule for `/dev/input` group access — never run as root.
Reference: same approach as `input-remapper`, `keyd`.

**macOS hardened runtime flags:**
```xml
<!-- entitlements.plist -->
<key>com.apple.security.cs.allow-jit</key><false/>
<key>com.apple.security.cs.allow-unsigned-executable-memory</key><false/>
<key>com.apple.security.cs.disable-library-validation</key><false/>
```

**Supply chain:**
- `cargo-audit` runs in CI on every PR — blocks merge if a RUSTSEC advisory matches
- WASM plugins: SHA256 verified at download, re-verified at every load
- Dependency updates: `cargo-deny` enforces license allowlist and duplicate version policy

```bash
# CI security step
cargo audit
cargo deny check
```

---

## Infrastructure Reliability

### RPC Fallback Chain

A single RPC provider is a single point of failure. Helius goes down occasionally:

```rust
// quickdraw-infra/src/rpc.rs

pub struct RpcWithFallback {
    providers: Vec<(String, RpcClient)>,   // ordered by priority
}

impl RpcWithFallback {
    pub fn new(helius_key: &str) -> Self {
        Self {
            providers: vec![
                ("helius".into(),    rpc_client(format!("https://mainnet.helius-rpc.com/?api-key={helius_key}"))),
                ("quicknode".into(), rpc_client("https://api.mainnet-beta.solana.com")),   // public fallback
                ("alchemy".into(),   rpc_client("https://solana-mainnet.g.alchemy.com/v2/demo")),
            ],
        }
    }

    pub async fn get_account(&self, pubkey: &Pubkey) -> Result<Account> {
        for (name, client) in &self.providers {
            match client.get_account(pubkey).await {
                Ok(account) => return Ok(account),
                Err(e) => {
                    tracing::warn!(provider = name, error = %e, "RPC call failed, trying next");
                    continue;
                }
            }
        }
        Err(RpcError::AllProvidersFailed)
    }
}
```

Helius DAS API (token metadata, portfolio) has no public fallback — if it's down,
those features degrade gracefully (show raw address instead of token name/symbol).

---

### Circuit Breaker — Adapter Registry

An adapter that fails 3 times in 60s is auto-disabled. The SmartSwapRouter skips it:

```rust
// quickdraw-defi/src/adapter.rs

pub struct CircuitBreaker {
    failure_count: AtomicU32,
    last_failure:  Mutex<Option<Instant>>,
    state:         AtomicU8,   // 0=Closed, 1=Open, 2=HalfOpen
}

impl CircuitBreaker {
    const FAILURE_THRESHOLD: u32 = 3;
    const RECOVERY_WINDOW: Duration = Duration::from_secs(60);

    pub fn is_open(&self) -> bool {
        if self.state.load(Ordering::Relaxed) != 1 { return false; }
        // Auto-recover after window — transition to HalfOpen
        if self.last_failure.lock().unwrap()
            .map(|t| t.elapsed() > Self::RECOVERY_WINDOW)
            .unwrap_or(false)
        {
            self.state.store(2, Ordering::Relaxed);
            return false;
        }
        true
    }

    pub fn record_failure(&self) {
        let count = self.failure_count.fetch_add(1, Ordering::SeqCst) + 1;
        *self.last_failure.lock().unwrap() = Some(Instant::now());
        if count >= Self::FAILURE_THRESHOLD {
            self.state.store(1, Ordering::Relaxed);  // Open — skip this adapter
            tracing::warn!("Circuit breaker OPEN");
        }
    }

    pub fn record_success(&self) {
        self.failure_count.store(0, Ordering::Relaxed);
        self.state.store(0, Ordering::Relaxed);   // Closed — healthy
    }
}
```

When an adapter's circuit is open, the tray shows a small indicator:
`Jupiter ✅  Orca ✅  Raydium ⚠️ (unavailable)`

---

### Worker-Level Caching

The Cloudflare Worker caches high-traffic read responses to avoid hammering upstream
APIs when many users check the same token simultaneously:

```typescript
// worker/src/cache.ts

const CACHE_TTLS: Record<string, number> = {
  "/market/pulse":    300,   // 5 min — aligns with in-app MarketPulse TTL
  "/token/check":     300,   // safety score — rarely changes
  "/price/chart":     60,    // 1 min — acceptable lag for charting
  "/adapter/jupiter/price": 10,  // 10s — price is fast-moving, short TTL
};

async function withCache(
  request: Request,
  handler: () => Promise<Response>,
  env: Env,
): Promise<Response> {
  const ttl = CACHE_TTLS[new URL(request.url).pathname];
  if (!ttl) return handler();   // no caching for write routes (/ai/*, /adapter/*/swap)

  const cacheKey = request.url;
  const cached = await env.KV.get(cacheKey, "text");
  if (cached) {
    return new Response(cached, {
      headers: { "Content-Type": "application/json", "X-Cache": "HIT" }
    });
  }

  const response = await handler();
  const body = await response.text();
  await env.KV.put(cacheKey, body, { expirationTtl: ttl });
  return new Response(body, response);
}
```

Write routes (`/ai/*`, `*/swap`, `*/deposit`) are never cached.

---

### Error Tracking

PostHog handles analytics. A separate error tracking integration catches crashes
and exceptions with stack traces:

```rust
// quickdraw-infra/src/error_tracker.rs
// Uses Sentry SDK or self-hosted Glitchtip

pub struct ErrorTracker {
    dsn: String,
    app_version: String,
}

impl ErrorTracker {
    pub fn capture(&self, error: &anyhow::Error, context: ErrorContext) {
        // Scrub any wallet addresses or financial data before sending
        let scrubbed = scrub_sensitive_fields(error.to_string());
        // POST to Sentry-compatible DSN
    }
}

// Scrub wallet addresses (base58 44-char strings) before sending to error tracker
fn scrub_sensitive_fields(message: String) -> String {
    let pubkey_regex = Regex::new(r"[1-9A-HJ-NP-Za-km-z]{43,44}").unwrap();
    pubkey_regex.replace_all(&message, "[REDACTED_PUBKEY]").to_string()
}
```

**What is tracked:** crash type, stack trace, OS version, app version, which adapter/skill failed.
**What is NOT tracked:** wallet addresses, transaction amounts, conversation content.

## Cloudflare Worker Routes

The Worker is the only place API keys exist. App only knows the Worker URL, injected
at build time via `env!("WORKER_URL")`.

| Route | Upstream | Purpose |
|-------|----------|---------|
| `POST /ai/fast` | Anthropic — Haiku 4.5 | Fast tier: token narration, intent, risk (SSE, max 512 tok) |
| `POST /ai/deep` | Anthropic — Sonnet 4.6 | Deep tier: vision, yield, deep report (SSE, max 1024 tok) |
| `POST /tts` | ElevenLabs API | Voice response audio |
| `POST /transcribe-token` | AssemblyAI | Temp JWT (480s) for STT WebSocket |
| `POST /token/check` | RugCheck + Helius + Jupiter | Aggregated safety score |
| `GET /market/pulse` | Birdeye + Alternative.me | SOL price + Fear & Greed (cached 5min) |
| `POST /price/chart` | Birdeye | OHLCV chart data |
| `POST /adapter/jupiter/*` | api.jup.ag | Quote + swap + price |
| `POST /adapter/orca/*` | Orca SDK server-side | Whirlpool quote + pools |
| `POST /adapter/meteora/*` | dlmm-api.meteora.ag | DLMM quote + vaults |
| `POST /adapter/raydium/*` | api-v3.raydium.io | Farm info + CLMM quote |

Local Ollama calls (`/ai` mode = Offline) bypass the Worker entirely — direct to `localhost:11434`.

Worker secrets: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `ASSEMBLYAI_API_KEY`,
`JUPITER_API_KEY`, `BIRDEYE_API_KEY`, `HELIUS_API_KEY`, `RUGCHECK_API_KEY`.

---

## Platform Notes

### Linux (v1.0 — primary target)
- **X11**: Global hotkey via XRecord, overlay via `_NET_WM_STATE_ABOVE`
- **Wayland** (v1.2): wlr-layer-shell via `smithay-client-toolkit` (Sway, Hyprland, Wayfire only)
  - GNOME Wayland does NOT implement wlr-layer-shell — documented limitation
  - Global hotkey under pure Wayland requires privileged daemon (`keyd`) or XWayland
- Tray via `libayatana-appindicator` — requires AppIndicator extension on GNOME
- udev rule for `/dev/input` group membership (ships with `.deb`/`.rpm`)
- Distribution: `.deb` + `.rpm` + `.tar.gz`, GPG signed

### Windows (v1.1)
- Global hotkey: `SetWindowsHookEx WH_KEYBOARD_LL` via `rdev`
- Overlay: `HWND_TOPMOST` + `WS_EX_TRANSPARENT` + `WS_EX_LAYERED`
- Screen capture: `xcap` wraps DXGI Desktop Duplication
- Taskbar tray via `tray-icon`
- Distribution: `.msi` installer, Authenticode EV certificate

### macOS (v1.2)
- Global hotkey: CGEvent tap via `rdev` → requires Accessibility permission
- Screen capture: `xcap` wraps ScreenCaptureKit → requires Screen Recording permission
- Overlay window: `NSWindowLevel::screenSaver` via `objc2`
- Hardened Runtime + notarization required for distribution
- Entitlements: `com.apple.security.device.audio-input`, `com.apple.security.screen-recording`
- Distribution: `.dmg` with `.app` bundle, Apple Developer ID

---

## Browser Extension

Companion extension for Chrome/Brave/Arc/Edge (MV3) and Firefox (MV2).

**Detects on Twitter/X specifically:**
- CA addresses in tweet text
- `$TICKER` symbols
- DexScreener / Birdeye / pump.fun URLs
- Tweet context: author, follower count, verified badge, engagement

**Communication:** Extension content script → Chrome native messaging → Quickdraw native app.
Quickdraw renders the overlay on top of the browser window using a system-level overlay
window — not inside the browser's DOM.

### Native Messaging IPC Protocol

Chrome spawns the native host (`quickdraw-native-host`) as a subprocess and communicates
over stdin/stdout with length-prefixed JSON messages.

```
Chrome extension                        Quickdraw native app
      │                                         │
      │  { "type": "token_detected",            │
      │    "address": "...",                    │
      │    "context": {                         │
      │      "tweet_text": "...",               │
      │      "author_handle": "@...",           │
      │      "author_followers": 12000,         │
      │      "verified": true,                  │
      │      "likes": 450,                      │
      │      "retweets": 82                     │
      │    },                                   │
      │    "position": { "x": 800, "y": 400 }, │
      │    "screen": 0                          │
      │  }                                      │
      │────────────────────────────────────────▶│
      │                                         │  FireEvent(TokenDetected)
      │                                         │  into Elm FSM
      │  { "type": "ack", "id": "abc123" }     │
      │◀────────────────────────────────────────│
```

The native host is a thin binary that owns the stdin/stdout loop and forwards
messages into the main Quickdraw process via a Unix domain socket or named pipe.

```rust
// quickdraw-host/src/main.rs
// Reads length-prefixed JSON from stdin (Chrome native messaging format)
// Forwards to main process via tokio::net::UnixStream (macOS/Linux)
// or named pipe (Windows)

pub async fn run_native_host() {
    let mut stdin = tokio::io::stdin();
    let socket_path = socket_path_for_user();   // ~/.config/quickdraw/host.sock
    let stream = UnixStream::connect(socket_path).await.unwrap();

    loop {
        let msg = read_length_prefixed_json(&mut stdin).await?;
        stream.write_all(&msg).await?;
    }
}
```

Native host manifest registered at install time:
```json
{
  "name": "com.quickdraw.host",
  "description": "Quickdraw native bridge",
  "path": "/usr/local/bin/quickdraw-native-host",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://YOUR_EXTENSION_ID/"]
}
```

**Extension structure:**
```
extension/
├── manifest.json          Chrome MV3
├── manifest.firefox.json  Firefox MV2
├── src/
│   ├── content/
│   │   ├── detector.ts    regex + DOM walking
│   │   ├── highlighter.ts underline/badge injection into page
│   │   ├── twitter.ts     Twitter/X specific selectors
│   │   ├── telegram.ts    Telegram Web specific
│   │   └── messenger.ts   → native app bridge
│   ├── background.ts      native messaging host
│   └── popup/             extension settings UI
└── package.json
```

---

## Project Structure

```
quickdraw-rust/
├── Cargo.toml                    workspace root
├── build.rs                      env!("WORKER_URL") injection, icon embedding
├── .cargo/
│   └── config.toml               RUSTFLAGS per platform (RELRO, CFI, PIE)
│
├── crates/
│   ├── quickdraw-core/              pure Rust, zero platform deps, fully testable
│   │   └── src/
│   │       ├── pipeline.rs       FSM, Command, AppEvent, SideEffect
│   │       ├── state.rs          AppState, AppSnapshot
│   │       ├── conversation.rs   ConversationThread, topic scoping, compression
│   │       ├── point_parser.rs   [POINT:x,y:label:screenN] regex
│   │       └── safety.rs         score calculation logic
│   │
│   ├── quickdraw-infra/             networking, audio, capture — no UI, no platform
│   │   └── src/
│   │       ├── audio/            cpal + rubato + rodio
│   │       ├── claude.rs         reqwest SSE streaming
│   │       ├── assemblyai.rs     tokio-tungstenite WebSocket
│   │       ├── tts.rs            ElevenLabs HTTP
│   │       ├── capture.rs        xcap multi-monitor + JPEG compress
│   │       └── worker_client.rs  typed client for all Worker routes
│   │
│   ├── quickdraw-ai/                pluggable AI provider layer
│   │   └── src/
│   │       ├── provider.rs          AIProvider trait + AIRequest/AIResponse
│   │       ├── router.rs            ProviderRouter, AIMode, task-to-tier mapping
│   │       ├── registry.rs          ProviderRegistry, runtime registration
│   │       ├── task.rs              AITask enum + tier + stream strategy
│   │       ├── context/
│   │       │   ├── manager.rs       ContextManager, build() + tokio::join! fetch
│   │       │   ├── system.rs        Layer 1: static system context
│   │       │   ├── market.rs        Layer 2: MarketPulse, 5min TTL
│   │       │   ├── thread.rs        Layer 3B: ConversationThread, expiry, compress
│   │       │   └── cache.rs         TokenDataCache, TTLs, on_swap_confirmed()
│   │       ├── best_practices/
│   │       │   ├── dedup.rs         RequestDeduplicator
│   │       │   ├── fallback.rs      FallbackChain
│   │       │   ├── structured.rs    parse_structured(), schema injection
│   │       │   └── metrics.rs       AIMetrics → PostHog
│   │       ├── providers/
│   │       │   ├── haiku.rs         Claude Haiku 4.5 via Worker (fast tier)
│   │       │   ├── sonnet.rs        Claude Sonnet 4.6 via Worker (deep tier)
│   │       │   └── ollama.rs        Ollama local inference (offline tier)
│   │       └── prompts/
│   │           ├── token_narration_v1.txt
│   │           ├── safety_narration_v1.txt
│   │           ├── swap_risk_v1.txt
│   │           ├── price_summary_v1.txt
│   │           ├── screen_analysis_v1.txt
│   │           └── yield_strategy_v1.txt
│   │
│   ├── quickdraw-defi/              DeFi adapters + swap router + skills
│   │   └── src/
│   │       ├── adapter.rs           DefiAdapter trait + AdapterHealth + AdapterRegistry
│   │       ├── router.rs            parallel quote fetching, best-rate selection
│   │       ├── safety.rs            token safety aggregation + scoring
│   │       ├── skill.rs             QuickdrawSkill trait + Trigger + SkillResult
│   │       ├── skill_chain.rs       SkillChain, SkillStep, Condition
│   │       ├── adapters/
│   │       │   ├── jupiter.rs       swap + price + token list + staking
│   │       │   ├── orca.rs          whirlpools + positions + fee collection
│   │       │   ├── meteora.rs       DLMM + vaults + active bin tracking
│   │       │   └── raydium.rs       CLMM + farms + harvest + launchpad
│   │       ├── skills/
│   │       │   ├── token_vetter.rs  safety score badge
│   │       │   ├── quick_swap.rs    parallel quote + swap UI
│   │       │   ├── price_chart.rs   OHLCV chart + AI summary
│   │       │   ├── voice_swap.rs    intent parse + swap
│   │       │   ├── yield_scanner.rs pool comparison across protocols
│   │       │   ├── farm_harvest.rs  batch reward harvest
│   │       │   ├── portfolio.rs     holdings overview + AI analysis
│   │       │   ├── deep_report.rs   full token due diligence
│   │       │   ├── whale_alert.rs   large tx monitoring
│   │       │   └── position_mgr.rs  open LP positions + range status
│   │       └── wallet/
│   │           ├── bridge.rs           WalletBridge trait
│   │           ├── walletconnect.rs    WC v2 relay, QR pairing, session persist
│   │           └── ledger.rs           USB HID via hidapi, APDU protocol
│   │
│   ├── quickdraw-detection/         surface detection pipeline
│   │   └── src/
│   │       ├── patterns.rs       regex for addresses, tickers, URLs
│   │       ├── deduplicator.rs   30s cooldown per address
│   │       ├── enricher.rs       add context before firing event
│   │       ├── ocr.rs            leptess / Tesseract fallback
│   │       └── accessibility.rs  AX / UIA / AT-SPI2 reader
│   │
│   ├── quickdraw-platform/          PAL implementations per OS
│   │   └── src/
│   │       ├── macos/            objc2, rdev, NSWindowLevel hacks
│   │       ├── windows/          WinAPI, HWND_TOPMOST, WS_EX_TRANSPARENT
│   │       └── linux/            smithay, wlr-layer-shell, evdev, AT-SPI2
│   │
│   └── quickdraw-ui/                egui + winit + tray — zero business logic
│       └── src/
│           ├── app.rs            eframe App impl, AppSnapshot reads
│           ├── overlay.rs        per-screen overlay window management
│           ├── panel.rs          settings panel
│           ├── tray.rs           tray-icon menu
│           ├── cursor.rs         triangle + waveform + bezier animation
│           ├── token_card.rs     safety badge + token info popup
│           ├── swap_ui.rs        swap confirmation UI
│           ├── chart.rs          egui_plot price chart
│           └── yield_ui.rs       pool / farm / vault display
│
│   └── quickdraw-host/              Chrome native messaging host process
│       └── src/
│           └── main.rs           stdin/stdout length-prefixed JSON → Unix socket
│
├── src/
│   └── main.rs                   wire everything, spawn tokio runtime
│
├── plugins/                      community adapter WASM modules (local dev copies)
│   └── example-adapter/
│       ├── Cargo.toml            [lib] crate-type = ["cdylib"], target = wasm32-wasi
│       └── src/
│           └── lib.rs            impl DefiAdapter exported symbols
│
├── extension/                    browser extension
│   ├── manifest.json
│   └── src/
│       ├── content/
│       │   ├── detector.ts
│       │   ├── highlighter.ts
│       │   ├── twitter.ts
│       │   ├── telegram.ts
│       │   └── messenger.ts
│       ├── background.ts
│       └── popup/
│
├── worker/                       Cloudflare Worker (reused from Swift app)
│   └── src/
│       └── index.ts
│
└── platform/
    ├── macos/
    │   ├── entitlements.plist
    │   └── Info.plist
    ├── linux/
    │   ├── quickdraw.desktop
    │   └── 99-quickdraw-input.rules   udev rule
    └── windows/
        └── quickdraw.manifest         DPI awareness, UAC
```

---

## Build & Run

```bash
# Clone and build all crates
git clone <repo>
cd quickdraw-rust
WORKER_URL=https://your-worker.workers.dev cargo build --release

# Run dev build
WORKER_URL=https://your-worker.workers.dev cargo run

# Build native messaging host (separate binary, installed alongside main app)
cargo build --release -p quickdraw-host

# Build browser extension
cd extension
npm install && npm run build
# Load unpacked in chrome://extensions (dev mode)

# Build a community adapter plugin (WASM)
cd plugins/example-adapter
cargo build --target wasm32-wasi --release

# Run tests (unit + mock HTTP — no network required)
cargo test

# Run devnet integration tests (requires RPC)
INTEGRATION=1 cargo test -- --include-ignored

# Deploy Cloudflare Worker (keys stay here)
cd worker
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ASSEMBLYAI_API_KEY
npx wrangler secret put ELEVENLABS_API_KEY
npx wrangler secret put JUPITER_API_KEY
npx wrangler secret put BIRDEYE_API_KEY
npx wrangler secret put HELIUS_API_KEY
npx wrangler secret put RUGCHECK_API_KEY
npx wrangler deploy
```

---

## Reference Open-Source Projects

| Project | What to study |
|---------|--------------|
| `rustdesk` | xcap multi-monitor capture, cpal audio, egui rendering |
| `cosmic-panel` (System76) | Wayland layer-shell in Rust via Smithay |
| `keysound` | rdev global key listening + cpal playback — exact same pattern |
| `tauri/tao` source | Platform window level + transparency hacks documented |
| `alacritty` | Clean winit event loop, terminal state separated from render |
| `input-remapper` | Linux udev + input group privilege model |

---

## Known Platform Limitations

| Limitation | Platform | Ships In | Notes |
|-----------|---------|----------|-------|
| Always-on-top overlay | GNOME Wayland | v1.2 (partial) | GNOME doesn't implement wlr-layer-shell; XWayland fallback |
| Global hotkey (modifier-only) | Pure Wayland | v1.2 (partial) | Requires `keyd` daemon or XWayland |
| System tray | GNOME | v1.0 | Requires AppIndicator GNOME extension — document at install |
| Exclude own windows from screenshot | macOS | v1.2 | Needs `objc2-screen-capture-kit` directly |
| Browser extension Firefox | Firefox | v1.2 | MV2 manifest, slightly different native messaging |

---

## Testing Strategy

### Test Pyramid

```
                    ┌──────────┐
                    │  E2E     │  ~10 tests — full pipeline, macOS CI
                    ├──────────┤
                  ┌─┤Integration├─┐  ~80 tests — adapter mock HTTP + devnet
                  │ └──────────┘ │
              ┌───┤              ├───┐
              │   │   Unit       │   │  ~400 tests — FSM, scoring, validation
              └───┘              └───┘
              Fuzz             Property-based
           (cargo-fuzz)         (proptest)
```

---

### Unit Tests — Core Engine

The Elm FSM in `quickdraw-core` has zero platform dependencies. All state transitions,
skill chains, and context assembly are tested with pure Rust unit tests.

```rust
#[tokio::test]
async fn token_detected_transitions_to_checking() {
    let mut engine = QuickdrawEngine::new_test();
    let cmd = Command::TokenDetected {
        address: test_pubkey(),
        position: Point::zero(),
        source: DetectionSource::Accessibility,
    };
    engine.process(cmd).await;
    assert!(matches!(engine.state(), QuickdrawState::CheckingToken { .. }));
}

#[tokio::test]
async fn low_safety_score_blocks_swap_without_confirmation() {
    let mut engine = QuickdrawEngine::new_test();
    engine.inject_safety_score(23);   // below 50 = high risk
    engine.process(Command::UserRequestedSwap).await;
    // FSM must not reach AwaitingSwapConfirm — requires explicit override
    assert!(!matches!(engine.state(), QuickdrawState::AwaitingSwapConfirm { .. }));
    assert!(matches!(engine.state(), QuickdrawState::ShowingHighRiskWarning { .. }));
}
```

---

### Property-Based Tests — Safety Scorer

The safety score must always be in [0, 100] regardless of input. Use `proptest`:

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn safety_score_always_in_valid_range(
        jupiter_listed in any::<bool>(),
        mint_auth_disabled in any::<bool>(),
        freeze_auth_disabled in any::<bool>(),
        liquidity_usd in 0.0f64..1_000_000_000.0,
        holder_count in 0u64..1_000_000,
        top10_concentration in 0.0f64..1.0,
    ) {
        let input = SafetyInput {
            jupiter_listed,
            mint_authority_disabled: mint_auth_disabled,
            freeze_authority_disabled: freeze_auth_disabled,
            liquidity_usd,
            holder_count,
            top10_concentration,
            scam_pattern_match: false,
        };
        let score = calculate_safety_score(&input);
        prop_assert!(score >= 0 && score <= 100);
    }
}
```

---

### Fuzz Tests — Input Parsing

External data (detected addresses, upstream API responses) can be malformed.
Fuzz the parser and deserializer surfaces with `cargo-fuzz`:

```rust
// fuzz/fuzz_targets/address_validator.rs
#![no_main]
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(s) = std::str::from_utf8(data) {
        // Must never panic — only return Ok or Err
        let _ = validate_solana_address(s);
    }
});

// fuzz/fuzz_targets/jupiter_quote_deserialize.rs
fuzz_target!(|data: &[u8]| {
    // Malformed JSON from a compromised upstream must not crash the app
    let _ = serde_json::from_slice::<JupiterQuote>(data);
});

// fuzz/fuzz_targets/tx_verifier.rs
fuzz_target!(|data: &[u8]| {
    // Malformed transaction bytes must not panic
    if let Ok(tx) = bincode::deserialize::<VersionedTransaction>(data) {
        let _ = SwapVerifier::verify(&tx, &dummy_quote(), &dummy_pubkey());
    }
});
```

Run in CI nightly: `cargo fuzz run address_validator -- -max_total_time=60`

---

### Adapter Tests — Devnet + Mock HTTP

Each adapter has two test modes:

```rust
// 1. Mock HTTP — fast, no network, CI-safe
#[tokio::test]
async fn jupiter_quote_parses_correctly() {
    let mock_server = MockServer::start().await;
    Mock::given(method("GET")).and(path("/quote"))
        .respond_with(ResponseTemplate::new(200).set_body_json(fixture("jupiter_quote.json")))
        .mount(&mock_server).await;

    let adapter = JupiterAdapter::new(mock_server.uri());
    let quote = adapter.get_quote(&test_swap_params()).await.unwrap();
    assert!(quote.out_amount > 0);
}

// 2. Swap transaction verification test — mock HTTP, real verifier
#[tokio::test]
async fn jupiter_swap_tx_passes_verification() {
    let mock_server = setup_jupiter_mock().await;
    let adapter = JupiterAdapter::new(mock_server.uri());
    let quote = adapter.get_quote(&test_swap_params()).await.unwrap();
    let (tx, verified) = build_and_verify(&adapter, &quote, &test_wallet()).await.unwrap();
    assert_eq!(verified.input_mint, quote.input_mint);
    assert_eq!(verified.output_mint, quote.output_mint);
}

// 3. Devnet integration — runs in CI with INTEGRATION=1
#[tokio::test]
#[ignore = "requires devnet RPC"]
async fn jupiter_devnet_quote_round_trip() {
    let adapter = JupiterAdapter::new_devnet();
    let quote = adapter.get_quote(&devnet_swap_params()).await.unwrap();
    // Build tx + verify — do NOT sign or submit
    let (tx, _) = build_and_verify(&adapter, &quote, &test_wallet()).await.unwrap();
    let serialized = bincode::serialize(&tx).unwrap();
    assert!(serialized.len() <= 1232);   // Solana tx size limit
}
```

**Never run mainnet tests in CI.** Devnet only. Real fund flows tested manually with
$1 amounts before releasing a new adapter version.

---

### AI Provider Tests — Structured Output Validation

```rust
#[tokio::test]
async fn token_narration_returns_valid_schema() {
    let provider = HaikuProvider::new_test();
    let response = provider.complete(test_token_narration_request()).await.unwrap();
    let parsed: TokenNarration = parse_structured(&response.text).unwrap();
    assert!(!parsed.summary.is_empty());
    assert!(parsed.risk_level >= 0 && parsed.risk_level <= 100);
    // Summary must be concise — overlay card has limited space
    assert!(parsed.summary.split_whitespace().count() <= 50);
}

// Verify prompt caching header is set correctly
#[tokio::test]
async fn ai_request_sets_cache_control_on_static_layers() {
    let req = build_ai_request(AITask::TokenNarration, &test_context());
    let body = req.to_anthropic_body();
    let system = body["system"].as_array().unwrap();
    assert_eq!(system[0]["cache_control"]["type"], "ephemeral");  // Layer 1
    assert_eq!(system[1]["cache_control"]["type"], "ephemeral");  // Layer 2
}
```

---

### Concurrent Stress Tests — RequestDeduplicator

The deduplicator uses shared futures. Test that concurrent requests for the same
token produce exactly one HTTP call:

```rust
#[tokio::test]
async fn deduplicator_fires_only_one_request_for_concurrent_same_token() {
    let call_count = Arc::new(AtomicU32::new(0));
    let dedup = RequestDeduplicator::new();
    let token = test_pubkey();

    // Simulate 10 concurrent detections of the same token
    let handles: Vec<_> = (0..10).map(|_| {
        let dedup = dedup.clone();
        let count = call_count.clone();
        tokio::spawn(async move {
            dedup.get_or_fetch(token, || async {
                count.fetch_add(1, Ordering::SeqCst);
                mock_token_fetch(token).await
            }).await
        })
    }).collect();

    let results = futures::future::join_all(handles).await;
    assert_eq!(call_count.load(Ordering::SeqCst), 1);   // exactly one fetch
    assert!(results.iter().all(|r| r.is_ok()));
}
```

---

### WASM Plugin Sandbox Tests

Verify that malicious plugins cannot escape the sandbox:

```rust
#[test]
fn wasm_plugin_cannot_access_undeclared_domain() {
    let manifest = PluginManifest { api_domains: vec!["api.kamino.finance".into()], .. };
    let host = WasmHost::new_with_manifest(manifest);

    // Plugin tries to call a domain not in its manifest
    let result = host.call_http_get("https://evil.com/steal-keys");
    assert!(matches!(result, Err(SandboxViolation::UnauthorizedDomain { .. })));
}

#[test]
fn wasm_plugin_cannot_exceed_memory_cap() {
    let host = WasmHost::new_with_limits(MemoryLimit::Mb(64));
    // Plugin that allocates 128MB should be killed, not crash the host
    let result = host.run_plugin_fn("allocate_huge_buffer");
    assert!(matches!(result, Err(SandboxViolation::MemoryExceeded)));
}

#[test]
fn wasm_plugin_cannot_exceed_cpu_time() {
    let host = WasmHost::new_with_limits(CpuLimit::Ms(200));
    // Infinite loop plugin should be interrupted
    let result = host.run_plugin_fn("infinite_loop");
    assert!(matches!(result, Err(SandboxViolation::CpuExceeded)));
}
```

---

### CI Pipeline

```yaml
# .github/workflows/ci.yml

jobs:
  test:
    steps:
      - cargo fmt --check
      - cargo clippy -- -D warnings
      - cargo test                           # unit + mock HTTP
      - cargo audit                          # RUSTSEC advisory check
      - cargo deny check                     # license + duplicate deps
      - INTEGRATION=1 cargo test -- --include-ignored   # devnet tests

  fuzz-nightly:
    schedule: "0 2 * * *"   # 2am UTC nightly
    steps:
      - cargo fuzz run address_validator -- -max_total_time=300
      - cargo fuzz run jupiter_quote_deserialize -- -max_total_time=300
      - cargo fuzz run tx_verifier -- -max_total_time=300

  security-audit:
    steps:
      - cargo audit
      - trivy fs --severity HIGH,CRITICAL .   # container + dep scan
```

### Test Crate Additions

| Crate | Purpose |
|-------|---------|
| `wiremock` | Mock HTTP server for adapter tests |
| `proptest` | Property-based testing for safety scorer |
| `libfuzzer-sys` | Fuzz test harness via `cargo-fuzz` |
| `tokio::test` | Async test runtime |
| `assert_matches` | Ergonomic FSM state assertions |

---

## Distribution & Auto-Update

### Binary Distribution

| Platform | Format | Signing |
|---------|--------|---------|
| macOS | `.dmg` with `.app` bundle | Apple Developer ID + notarization |
| Windows | `.msi` installer | Authenticode EV certificate |
| Linux | `.deb` + `.rpm` + `.tar.gz` | GPG signed |

All releases published to GitHub Releases. Auto-update checked on startup.

### Auto-Update

```rust
// quickdraw-infra/src/updater.rs
// Uses GitHub Releases API — checks for new tag on startup (once per 24h)

pub struct Updater {
    current_version: semver::Version,
    github_repo: String,     // "yourorg/quickdraw"
}

impl Updater {
    pub async fn check(&self) -> Option<AvailableUpdate> {
        let latest = self.fetch_latest_release().await?;
        if latest.version > self.current_version {
            Some(AvailableUpdate { version: latest.version, notes: latest.body })
        } else {
            None
        }
    }
}
```

User sees a tray notification: "Quickdraw v1.2 available — Update now". One-click
download + relaunch. The old binary is kept until the new one launches successfully.

### Plugin Registry Updates

Community adapter manifests are fetched on startup from a GitHub-hosted JSON index:

```
https://raw.githubusercontent.com/yourorg/quickdraw-plugins/main/registry.json
```

```json
{
  "plugins": [
    {
      "id": "kamino",
      "version": "1.2.0",
      "display_name": "Kamino Finance",
      "wasm_url": "https://github.com/...",
      "sha256": "abc123...",
      "min_host_version": "1.0.0",
      "api_domains": ["api.kamino.finance"]
    }
  ]
}
```

---

## Cross-Chain Expansion Path

Quickdraw is Solana-first but architecturally chain-agnostic. The adapter and skill
layers use Solana types today (`Pubkey`, `VersionedTransaction`) — expansion requires
abstracting these behind a chain-neutral interface.

### Phase 1 — Solana (v1.x)

All built-in adapters, all skills, Solana-specific wallet methods.

### Phase 2 — SVM Chains (v2.0)

Eclipse, Sonic, and other SVM chains reuse the same Solana SDK with a different RPC URL.
Each SVM chain is a separate `AdapterRegistry` loaded when the user selects that chain.

```rust
pub enum Chain {
    SolanaMainnet,
    SolanaDevnet,
    Eclipse,
    Sonic,
    // EVM chains — v3.0
}
```

### Phase 3 — EVM Chains (v3.0)

Base, Ethereum mainnet, Arbitrum. Requires:
- `alloy` crate (modern EVM Rust library) replacing `solana-sdk`
- New `EVMWalletBridge` — WalletConnect already supports EVM (MetaMask, Rainbow)
- New adapter set: Uniswap v3, Aave, Curve, Velodrome
- The `DefiAdapter` trait is chain-neutral already — `build_transaction` returns bytes

Chain selection lives in settings. The tray shows which chain is active. All existing
skills work across chains — `QuickSwap` calls the right adapter based on `Chain` in context.

---

## Release Roadmap

### v1.0 — Linux X11 (Foundation)
- Core Elm FSM + actor subsystems
- Linux X11 overlay (`_NET_WM_STATE_ABOVE`) + ALSA/PipeWire audio
- System tray via `libayatana-appindicator`
- udev rule for `/dev/input` group (ships with `.deb`/`.rpm`)
- Jupiter adapter: swap, price, token list
- Token safety score (RugCheck + Helius + Jupiter strict)
- Browser extension: Chrome/Brave, Twitter/X detection + native messaging host
- AI: Haiku fast tier (token narration, risk warning)
- Wallet: WalletConnect v2 + Ledger USB
- Cloudflare Worker proxy (HMAC auth + rate limiting)

### v1.1 — Windows + Remaining Adapters
- Windows overlay (HWND_TOPMOST + WS_EX_TRANSPARENT + WASAPI audio)
- Windows tray via `tray-icon`
- Orca adapter: Whirlpool swap + positions
- Meteora adapter: DLMM + vaults
- Raydium adapter: CLMM + farms + harvest
- AI: Sonnet deep tier (yield strategy, deep token report)
- Ollama offline mode (local inference, manual model selection)
- Voice pipeline: push-to-talk + AssemblyAI + ElevenLabs TTS
- Skills: YieldScanner, FarmHarvest, PortfolioCheck, PositionManager
- Auto-update (GitHub Releases)

### v1.2 — Linux Wayland + macOS + Community Plugins
- Linux Wayland overlay via smithay + wlr-layer-shell (Sway, Hyprland, Wayfire)
- macOS overlay (`NSWindowLevel::screenSaver` via `objc2`) + CoreAudio
- macOS hardened runtime + notarization
- WASM plugin system (wasmtime sandbox + community registry)
- First community adapters: Kamino, Drift, MarginFi, Phoenix
- Browser extension: Firefox MV2

### v2.0 — SVM Chains + NFT + Governance
- Eclipse + Sonic SVM chain support
- NFT skill: Tensor floor data, sweep
- Governance skill: JUP DAO vote + Realms proposals
- Options skill: Zeta markets
- Bridge skill: Wormhole cross-chain transfer
- WhaleAlert websocket (Helius webhooks)
- Phantom desktop deep link signing

### v3.0 — EVM Expansion
- Base, Ethereum, Arbitrum via `alloy` crate
- EVM adapter set: Uniswap v3, Aave v3, Curve
- Chain selector in tray
- Portfolio view aggregated across Solana + EVM

---

## What This Is

```
Quickdraw DeFi =

  Grammarly's UX        (contextual, near cursor, non-intrusive)
+ Uniswap's routing     (best rate across protocols, parallel quotes)
+ RugCheck's scoring    (automated safety, passive detection)
+ Birdeye's charting    (AI-narrated price analysis)
+ VS Code's extensions  (user-installable protocol adapters)

Runs natively on Windows, Linux, macOS.
Works inside any app — Discord, Twitter/X, Telegram, terminal, anywhere.
Zero API keys in binary. Never holds private keys.
```
