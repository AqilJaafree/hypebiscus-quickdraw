# Quickdraw Platform — Product Requirements Document

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

**Type:** Living reference doc (platform-wide)
**Created:** 2026-06-12
**Status:** Active

---

## 1. Product Overview

**What it is:** Quickdraw is a passive DeFi intelligence layer for Solana traders. It detects token addresses anywhere — browser DOM, clipboard, X11 selection, trading sites, social feeds — and surfaces a compact neobrutalist overlay with a safety score, live price, AI narration, and an embedded swap panel. Zero context switch. Zero manual lookup.

**Two surfaces, one backend:**

| Surface | Deployment | When to use |
|---|---|---|
| Chrome Extension | Any browser tab (MV3) | Reading alpha on X, Telegram Web, pump.fun, news |
| Rust Desktop App | Linux native (egui) | Clipboard/selection detection across the full OS — terminals, DMs, any app |

Both route through a shared Cloudflare Worker that holds all API keys (Anthropic, Jupiter, RugCheck, Helius). Neither surface contains secrets.

**Target user:** Solana traders who live in their browser or on Linux desktop — reading token mentions in Twitter threads, Telegram groups, or pump.fun — and want to evaluate and act on a token in under 2 seconds without opening a new tab.

**What it is not:**
- Not a portfolio tracker (no persistent dashboard)
- Not a DEX (no orderbook, no limit orders)
- Not a wallet (no key custody)
- Not a mobile app (Phase 3+ territory)

---

## 2. Current State

Both products are fully functional and shippable today.

### Chrome Extension (Phase 1 + Phase 2 complete)

**Detection**
- Scans all DOM text nodes for Solana addresses (32–44 base58 chars) and `$TICKER` symbols
- MutationObserver covers SPA navigation and infinite scroll (Twitter, Telegram Web)
- 30s dedup window per address; blocklist for system programs
- Selection-based detection (highlight text → popup appears)

**Popup UI**
- Shadow DOM — fully isolated from host page styles, no z-index wars
- Header: safety color fill (lime/amber/red) + score + ticker
- Price row + 24h change + AI narration (streamed word-by-word via Haiku)
- TRADE skill tab inline

**Skills**
- **TRADE** — Jupiter quote inline, SOL input, output preview, opens jup.ag/swap for execution

**Wallet**
- `chrome.scripting.executeScript` with `world: "MAIN"` accesses `window.phantom` / `window.solflare` / `window.solana` without a pre-loaded content script
- Wallet state persisted to `chrome.storage.local`, survives service worker restart
- Connected address shown in badge popup; disconnect clears storage

**Extension badge popup (toolbar)**
- STATE tab: detection toggle, wallet connect/disconnect, session timer, last token seen
- SKILLS tab: per-skill enable/disable toggles

**Security**
- `EXTENSION_SECRET` and `REOWN_PROJECT_ID` injected at build time via `--define`, never committed
- Rate limiting: 120 req/60s per IP on the Worker extension auth branch

---

### Rust Desktop App (fully functional)

**Detection pipeline**
- Clipboard watcher (80ms poll via arboard, X11/XWayland)
- Primary-selection watcher (50ms poll — fires on mouse highlight, no copy needed)
- Unix socket listener — receives addresses from the Chrome extension's native host binary
- Solana address regex + DexScreener/Birdeye/pump.fun/Solscan URL patterns
- 30s dedup per address in `DetectionEnricher`

**Core engine**
- Elm-inspired: `AppState` (mutable, engine-owned) → `AppSnapshot` (Arc clone, read by UI) → `Command` → `SideEffect`
- Pure `pipeline::process(state, cmd) -> Vec<SideEffect>` — no I/O, fully testable
- `QuickdrawState` FSM: Idle → TokenDetected → CheckingToken → FetchingQuotes → AwaitingSwapConfirm → AwaitingWalletSign → SwapComplete
- Tokio multi-thread runtime (4 workers); abort handles cancel in-flight effects on new token

**Features**
- Safety score + live price via Jupiter (single call, returns both)
- AI narration streamed from Haiku via HMAC-signed Worker requests
- Voice intent parsing: fast word-matching + Haiku fallback
- Webview popup: persistent handle, reuses `localStorage` session across tokens
- Auth callback HTTP server on `localhost:9427` receives wallet address and swap signatures
- Multi-adapter quotes via Jupiter v2

**AI provider**
- `AIProvider` trait with `complete()` / `stream()` / `health_check()`
- Haiku for fast narration (TokenNarration, VoiceIntent, SafetyNarration)
- Sonnet for deep analysis (DeepTokenReport, ScreenAnalysis, YieldStrategy, PortfolioAnalysis)
- Prompt caching: two-layer system (`system_static` + `market_pulse`) with `cache_control: ephemeral`

---

### Shared Cloudflare Worker

Single proxy for both surfaces. Routes: `/ai/fast` (Haiku SSE), `/ai/deep` (Sonnet SSE), `/market/pulse`, `/defi/jupiter/*`, `/defi/safety/rugcheck`, `/defi/helius/token`, `/auth`, `/health`.

Auth branches:
- **Desktop:** HMAC-SHA256 (`X-Quickdraw-Sig` + `X-Quickdraw-Timestamp`), 30s clock skew tolerance
- **Extension:** Bearer token (`Authorization: Bearer {EXTENSION_SECRET}` + `X-Quickdraw-Client: extension`)

Rate limiting: 120 req/60s per IP via KV on both branches.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  DETECTION SURFACES                                             │
│                                                                 │
│  Chrome Extension          Rust Desktop App                     │
│  ─────────────────         ────────────────                     │
│  DOM text nodes            Clipboard (80ms poll)                │
│  MutationObserver          Primary selection (50ms poll)        │
│  Text selection            Unix socket (from native host)       │
│  content.ts → Shadow DOM   egui overlay popup                   │
└──────────────┬──────────────────────────┬───────────────────────┘
               │                          │
               │   chrome.runtime.send    │   HMAC-signed reqwest
               ▼                          ▼
┌──────────────────────────┐  ┌───────────────────────────────────┐
│  Background Service      │  │  Tokio Engine                     │
│  Worker (MV3)            │  │  AppState FSM + SideEffects       │
│  Wallet state            │  │  AIProvider trait (Haiku/Sonnet)  │
│  Cache + dedup           │  │  DefiAdapter trait (Jupiter)      │
│  chrome.alarms           │  │  Auth callback :9427              │
└──────────────┬───────────┘  └──────────────┬────────────────────┘
               │                              │
               │  Bearer token auth           │  HMAC-SHA256 auth
               └──────────────┬───────────────┘
                              ▼
             ┌────────────────────────────────┐
             │  Cloudflare Worker             │
             │  /ai/fast   → Haiku SSE        │
             │  /ai/deep   → Sonnet SSE       │
             │  /defi/jupiter/*               │
             │  /defi/safety/rugcheck         │
             │  /defi/helius/token            │
             │  /auth      → wallet callback  │
             │  Rate limit: 120 req/60s/IP    │
             └────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
          Anthropic       Jupiter API     RugCheck / Helius
          (API keys       (quotes,        (safety, on-chain
          never in        prices,         metadata)
          client)         safety)
```

**Key decisions:**
- **Secrets never in clients** — all API keys live exclusively in the Worker. Extension and desktop are keyless.
- **Shadow DOM isolation** — extension popup is fully isolated from host page styles; no z-index conflicts on any site.
- **Elm-inspired engine** — pure `process(state, cmd) → Vec<SideEffect>` in the Rust app; no I/O in the core, fully unit-testable without mocks.
- **Prompt caching** — two-layer system (`system_static` + `market_pulse`) with `cache_control: ephemeral`; reduces Haiku cost on repeat token queries.
- **SSE end-to-end** — AI narration is never buffered; streams from Anthropic → Worker → client token-by-token.

---

## 4. Phase 3 — Extension Roadmap

**Goal:** Make Quickdraw the default intelligence layer for every token a browser-based Solana trader encounters. Richer swap decisions, page-aware AI context, portfolio visibility, and per-site noise control.

**Shippable when:** Multi-adapter quotes work on at least two sites, Twitter context appears in narration copy, portfolio view opens from badge popup, and per-site sensitivity settings persist across browser restarts.

---

### 4.1 Multi-Adapter Swap Comparison

Currently the TRADE panel shows a single Jupiter quote. Phase 3 adds Orca in parallel, ranked by output amount.

- Fetch Jupiter and Orca quotes simultaneously on TRADE tab open
- Display ranked list: adapter name · output amount · price impact · fees
- Auto-select best rate; user can override
- `SWAP NOW` opens the winning adapter's swap URL
- Raydium and Meteora as stretch goals after Orca is stable

---

### 4.2 Twitter/X Context Enrichment

When a token address is detected inside a tweet, the content script extracts social metadata and passes it to the narration prompt.

- Extracted fields: author handle, follower count, verified status, likes, retweets, full tweet text
- Passed as additional context in the `/ai/fast` Worker request
- Narration reflects the signal: _"Mentioned by @whale (180K followers, 4.2K likes)"_
- Scoped to `twitter.com` and `x.com` — no other sites

---

### 4.3 Portfolio Snapshot

Accessible from the extension badge popup (not the inline overlay). Read-only in Phase 3.

- Shows: wallet token holdings, USD value per token, total portfolio value
- Data source: Helius DAS API via Worker `/defi/helius/token`
- Refreshes on popup open, cached for 30s in `chrome.storage.session`
- Displayed in the existing STATE tab below wallet status

---

### 4.4 Site-Aware Detection Rules

Prevents noise on address-heavy sites (Solscan, Birdeye, DexScreener) where every address triggering a popup would be unusable.

- Three sensitivity modes per domain: **Aggressive** (every address), **Selection only** (highlighted text only), **Off**
- Settings persisted in `chrome.storage.sync` (follows user across Chrome profiles)
- Configurable from the SKILLS tab in the badge popup
- Default: Aggressive everywhere except a hardcoded quiet list (Solscan, Birdeye, DexScreener → Selection only)

---

### Out of scope for Phase 3
- Ollama local AI mode (deferred)
- Embedded LP position opening
- Sell / short trades
- NFT floor data
- Cross-chain addresses

---

## 5. Success Metrics

| Phase | Signal that it's working |
|---|---|
| Extension Phase 1+2 (shipped) | Popup fires on Twitter, Telegram Web, pump.fun; TRADE tab fetches a Jupiter quote; wallet connects and persists across SW restarts |
| Extension Phase 3 | Multi-adapter quote appears on TRADE tab; Twitter narration reflects author/engagement; portfolio opens from badge popup |
| Rust Desktop | Detection fires within 1s of clipboard copy or mouse highlight on any app; narration streams to overlay; swap executes end-to-end |

---

## 6. Design System

**Language:** Neobrutalism — high contrast, zero rounding, flat fills, hard black borders.

| Token | Value | Use |
|---|---|---|
| `ACCENT_YELLOW` | `#F5E642` | Primary CTA, active states, skill tab indicator |
| `OVERLAY_BG` | `#181818` | Popup and overlay background |
| `SAFE` | `#8BF542` | Score 80–100, popup header fill |
| `CAUTION` | `#F5C842` | Score 50–79, popup header fill |
| `DANGER` | `#F54242` | Score 0–49, popup header fill |
| `TEXT_MUTED` | `#888888` | Labels, metadata |

**Rules:** 2px solid black border on every interactive surface · 4px hard shadow (right + down, no blur) · zero border radius · SpaceMono for all labels and values.

**Reference file:** `design/quickdraw.pen`

---

## 7. Open Questions

| Question | Relevant to |
|---|---|
| Multi-adapter: does Orca have a public quote API or does it require the SDK? | Phase 3 — multi-adapter |
| Portfolio snapshot: does Helius DAS return USD values or does a Jupiter price call need to enrich each holding? | Phase 3 — portfolio |
| Site-aware rules: should the quiet list be user-editable in Phase 3 or hardcoded? | Phase 3 — detection rules |
| Twitter enrichment: does the content script need to handle rate-limited / auth-gated tweet rendering (logged-out X)? | Phase 3 — Twitter context |
