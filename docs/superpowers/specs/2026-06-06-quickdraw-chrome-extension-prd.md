# Quickdraw Chrome Extension — Product Requirements Document

**Type:** Living reference doc (product-led)
**Created:** 2026-06-06
**Status:** Active

---

## 1. Product Overview

### What it is

Quickdraw is a standalone Chrome extension for Solana traders. It detects any Solana token address on any webpage — Twitter/X, Telegram Web, Reddit, pump.fun, Discord Web, news articles, anywhere — and surfaces a compact neobrutalist popup near the detected text with a safety score, live price, AI narration, and an embedded swap panel. No native app required. Zero context switch.

### The core loop

```
Address detected in DOM
        ↓ ~300ms
Popup appears near token
   [Score] [Price] [AI narration]
        ↓ user action
   [SWAP — default] or [Enable Skill]
```

### Target user

Solana traders who live in their browser — reading alpha in Twitter threads, Telegram groups, pump.fun, DexScreener — and want to evaluate and act on a token without opening a new tab or switching to a DEX.

### What makes it different

- Works on every site, not just a DEX or portfolio tracker
- Passive by default — zero setup to get value after install
- Embedded swap via injected wallet (Phantom, Backpack) + Reown AppKit — no tab switch to execute
- DeFi skills are opt-in — power users unlock yield scanning, deep research, farm harvest; casual users just see info + swap

### What it is not

- Not a portfolio tracker (no dashboard)
- Not a DEX (no orderbook, no limit orders)
- Not a wallet (no key custody, no seed phrase)

---

## 2. Architecture

### Three-layer structure

```
┌─────────────────────────────────────────────────────┐
│  CONTENT SCRIPT  (injected into every page)         │
│  Shadow DOM container — isolated from page styles   │
│  Token detector → popup renderer → swap UI          │
│  Communicates via chrome.runtime.sendMessage        │
└─────────────────────────┬───────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────┐
│  BACKGROUND SERVICE WORKER  (persistent)            │
│  Deduplication · cache · wallet state               │
│  Routes requests to Cloudflare Worker               │
│  Reown AppKit session management                    │
└─────────────────────────┬───────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────┐
│  CLOUDFLARE WORKER  (existing, shared with desktop) │
│  All API keys live here — never in the extension    │
│  /ai/fast → Claude Haiku (narration)                │
│  /adapter/jupiter/* → quotes + swap tx + safety     │
└─────────────────────────────────────────────────────┘
```

### Key technical decisions

- **Shadow DOM** for the popup — complete style isolation from the host page. No z-index wars, no CSS leakage from Twitter or Telegram
- **Reuse the existing Cloudflare Worker** — same proxy the desktop app uses. No new backend needed for Phase 1
- **Injected wallet via `window.solana`** — Phantom, Backpack, Solflare detected at runtime. Reown AppKit as fallback for mobile wallets via QR
- **Detection runs in content script** — DOM text node scanning + MutationObserver for dynamically loaded content (infinite scroll, SPA navigation)
- **Background service worker holds all state** — cache (TTL-based), wallet session, dedup map. Content script is stateless

### Safety scoring — Jupiter only

- Jupiter strict list verification
- Jupiter token metadata (mint authority, freeze authority)
- Jupiter price + liquidity data
- Score 0–100: 80+ safe (lime), 50–79 caution (amber), 0–49 high risk (red)

### What's reused from the existing project

- Cloudflare Worker Jupiter routes — no changes needed for Phase 1
- Design tokens — same neobrutalism colors, typography (SpaceMono), spacing
- V3 popup design from wireframes (score banner header)
- Reown AppKit wallet integration pattern

---

## 3. Phase 1 — MVP

**Goal:** A user installs the extension, connects their wallet, detects any token on any page, sees safety + price + AI narration, and can execute a swap — all without leaving the page.

**Shippable when:** Extension loads on any site, popup appears within 500ms of a valid Solana address appearing in the DOM, swap executes end-to-end with a connected wallet.

### Token Detection

- Scans all text nodes for base58 Solana addresses (32–44 chars)
- MutationObserver for SPA/infinite scroll (Twitter, Telegram Web)
- Deduplication: same address not re-triggered within 30s
- Triggers on: DOM text appearance + user text selection (highlight)
- Phase 1 scope: raw address only (no `$TICKER` symbol detection yet)

### Popup UI (V3 wireframe — score banner header)

- Rendered inside Shadow DOM — fully isolated from host page styles
- Positioned near detected address, edge-clamped to viewport
- **Header:** full-width color block (lime/amber/red) + score number + ticker symbol
- **Body:** price + 24h change + AI narration (1–2 sentences, streamed word-by-word)
- **Footer:** `SWAP` button (default) + `✕` dismiss
- **Dismiss:** manual only — no auto-dismiss in browser context
- **Loading state:** `?` score placeholder + "Fetching…" until data resolves (~300ms)

### Safety Score

- Source: Jupiter strict list + token metadata
- Displayed immediately when Jupiter responds
- Color-codes the entire popup header

### AI Narration

- Claude Haiku via existing `/ai/fast` Worker route
- 1–2 sentence risk + context summary, streamed into popup body
- Appears after score resolves, fills in "Fetching…" placeholder

### Embedded Swap

- Triggered by `SWAP` button — expands inline below narration
- Jupiter quote fetched on expand (not pre-fetched)
- Shows: input amount field, output amount, price impact, slippage
- `CONFIRM SWAP` → prompts injected wallet to sign
- Transaction submitted via Jupiter swap endpoint through Worker

### Wallet Connection

- Injected wallet auto-detected: `window.solana`, `window.phantom`, `window.backpack`
- Reown AppKit as fallback — QR modal opens in popup panel
- Session persists via `chrome.storage.local`
- If no wallet connected: `SWAP` button shows `CONNECT WALLET` instead

### Extension Badge Popup (badge click)

- Minimal panel: wallet status + connect/disconnect, detection toggle on/off

### Out of scope for Phase 1

- `$TICKER` symbol detection
- DeFi skills
- Multi-adapter swap comparison
- Settings persistence beyond wallet session

---

## 4. Phase 2 — DeFi Skills

**Goal:** Users who want more than a quick swap can activate DeFi skills on demand. Skills are opt-in — the default popup stays clean, power users unlock deeper actions.

**Shippable when:** At least 3 skills are activatable from the popup with no page reload. Each skill renders its result inline within the popup or as an expanded panel.

### Skills activation model

A `⚡ SKILLS` button appears in the popup footer alongside `SWAP`. Tapping it opens a skills tray — a small icon row of available skills. User taps a skill icon to activate it. Activated skills persist per-token for the session.

```
Footer (default):      [SWAP]  [⚡ SKILLS]  [✕]
Footer (skills open):  [SWAP] [🔍 DEEP] [📈 YIELD] [🌾 HARVEST] [✕]
```

### Deep Report (`🔍`)

- Trigger: user taps Deep Report skill icon
- Fetches: Jupiter token data + Helius on-chain metadata + price history
- AI: Claude Haiku full due-diligence — team, liquidity, holder concentration, red flags
- Renders: expanded scrollable card below narration
- Expected time: ~2–3s

### Yield Scanner (`📈`)

- Trigger: user taps Yield skill icon
- Fetches: Jupiter pools for detected token
- Shows: top 3 pools ranked by APR — pool name, APR, TVL, risk tier
- CTA: "Open in Jupiter" link per pool (no embedded deposit in Phase 2)
- Expected time: ~1s

### Farm Harvest (`🌾`)

- Trigger: user taps Harvest skill icon
- Requires: wallet connected
- Fetches: pending rewards across user's active positions via Helius DAS
- Shows: list of claimable rewards with USD value
- CTA: `HARVEST ALL` — builds batch transaction, wallet signs
- Expected time: ~1.5s

### `$TICKER` Detection (Phase 2 baseline)

- Extends detector to match `$BONK`, `$JUP`, `$WIF` patterns in addition to raw addresses
- Looks up address from Jupiter token list by symbol before triggering popup

### Out of scope for Phase 2

- Voice commands
- Multi-adapter swap comparison (Orca, Raydium, Meteora)
- Embedded LP position opening
- Portfolio overview

---

## 5. Phase 3 — Advanced

**Goal:** Make Quickdraw the default layer for every on-chain action a browser-based Solana trader takes. Multi-adapter swaps, portfolio awareness, and richer context from the page itself.

**Shippable when:** Users can compare swap quotes across at least 2 adapters, view a portfolio snapshot from the popup, and the extension surfaces page context (tweet author, engagement) to improve AI analysis quality.

### Multi-Adapter Swap Comparison

- Queries Jupiter + Orca in parallel on swap expand
- Shows ranked quote list: adapter name, output amount, price impact, fees
- User can manually select adapter or accept auto-selected best rate
- Raydium + Meteora added as stretch goal

### Twitter/X Context Enrichment

- Content script extracts tweet metadata when address is detected inside a tweet: author handle, follower count, verified status, engagement (likes, retweets), full tweet text
- Passed to Claude Haiku as additional context — narration reflects social signal
- Example framing: "Token mentioned by @whale with 180K followers and 4.2K likes"

### Portfolio Snapshot

- Accessible from extension badge popup (not the inline overlay)
- Shows: wallet token holdings, USD value per token, total portfolio value
- Data source: Helius DAS API via Worker
- Refreshes on open, cached for 30s
- Read-only in Phase 3 — no swap or action from this view

### Site-Aware Detection Rules

- Per-site detection sensitivity: aggressive (every address) / conservative (highlighted only) / off
- Saved per domain in `chrome.storage.sync`
- Prevents noise on address-heavy sites like Solscan or Birdeye

### Ollama Local AI Mode

- Extension settings: AI mode toggle — Online (Haiku via Worker) / Local (Ollama at `localhost:11434`)
- When Local: narration + deep report route to Ollama directly, zero API cost
- Health-check on toggle — graceful fallback to Online if Ollama unreachable

### Out of scope for Phase 3

- Voice commands (browser mic permissions add onboarding friction — revisit post-Phase 3)
- WASM plugin system
- NFT floor data
- Cross-chain (non-Solana addresses)

---

## 6. Success Metrics

| Phase | Signal that it's working |
|-------|--------------------------|
| 1 — MVP | Swap executes end-to-end on 3 different sites (Twitter, Telegram Web, pump.fun) |
| 2 — Skills | Skills activated on >20% of popup opens in personal usage |
| 3 — Advanced | Multi-adapter used on >50% of swaps; portfolio viewed at least once per session |

---

## 7. Design Reference

**Design language:** Neobrutalism — high contrast, zero rounding, flat fills, hard black borders.

| Token | Value | Use |
|-------|-------|-----|
| `ACCENT_YELLOW` | `#F5E642` | Primary CTA, active states |
| `OVERLAY_BG` | `#181818` | Popup background |
| `SAFE` | `#8BF542` | Score 80–100, header fill |
| `CAUTION` | `#F5C842` | Score 50–79, header fill |
| `DANGER` | `#F54242` | Score 0–49, header fill |

**Popup layout:** V3 wireframe (score banner header) — see `design/Quickdraw Wireframes.html`

**Rules:**
- 2px solid black border on every interactive surface
- 4px hard shadow (right + down), no blur
- Zero border radius
- SpaceMono for all labels and values

---

## 8. Open Questions

| Question | Phase relevant | Notes |
|----------|---------------|-------|
| Should the popup reappear if the user scrolls past the same address again? | 1 | Current spec: 30s dedup window |
| How to handle pages with hundreds of addresses (Solscan, Birdeye)? | 1 | Detection toggle per-site solves this in Phase 3; Phase 1 needs a page-level cap |
| Reown AppKit — does the existing desktop implementation port directly to MV3 service worker? | 1 | Needs verification; WalletConnect WebSocket may need a content script relay |
| Should Deep Report use Haiku or Sonnet? | 2 | Haiku keeps cost low; Sonnet gives better analysis. Start with Haiku, add Sonnet as premium toggle |
| Harvest All — what happens if one farm tx fails mid-batch? | 2 | Need clear error state: partial harvest with retry for failed positions |
