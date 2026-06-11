# Quickdraw Extension Phase 2 — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this spec task-by-task.

**Goal:** Harden the Quickdraw Chrome extension with Reown wallet connect, a 4-skill inline panel system (TRADE / ALERT / WATCH / DEEP), price alerts, watchlist, and the neobrutalism UI from `quickdraw-rust`.

**Pencil designs:** `design/quickdraw.pen` — 7 new frames added 2026-06-07:
- Token Popup — Skills (base)
- Token Popup — TRADE Open
- Token Popup — ALERT Open
- Token Popup — WATCH Open
- Token Popup — DEEP Open
- Settings — SKILLS Tab
- Wallet — Connect Modal

---

## 1. Design System

All values derived from `quickdraw-rust/crates/quickdraw-ui/src/design.rs`.

| Token | CSS Value |
|---|---|
| `OVERLAY_BG` | `#181818` |
| `ACCENT_YELLOW` | `#f5e642` |
| `SAFE` | `#8bf542` |
| `CAUTION` | `#f5c842` |
| `DANGER` | `#f54242` |
| `STROKE` | `#000000` (2px outer) |
| `SHADOW` | `#333333` (3px/3px hard offset, no blur) |
| `TEXT_PRIMARY` | `#111111` |
| `TEXT_ON_DARK` | `#ffffff` |
| `TEXT_MUTED` | `#888888` |
| Font | Space Mono (monospace labels), Inter (icons) |
| Border radius | 0px everywhere |
| Shadow | `box-shadow: 3px 3px 0 #333333` |

### CSS helper (add to `extension/src/styles.ts`)

```typescript
export const DS = {
  bg:       "#181818",
  yellow:   "#f5e642",
  safe:     "#8bf542",
  caution:  "#f5c842",
  danger:   "#f54242",
  stroke:   "#000",
  shadow:   "3px 3px 0 #333",
  textDim:  "#555",
  textMut:  "#888",
  border:   "2px solid #333333",
  font:     "'Space Mono', monospace",
} as const;

export const brutal = (bg = DS.yellow) =>
  `background:${bg};border:2px solid ${DS.stroke};box-shadow:${DS.shadow};border-radius:0`;
```

---

## 2. In-Page Popup Redesign

**File:** `extension/src/content.ts` (popup DOM builder)

### 2.1 Structure

```
popup (Shadow DOM)
├── header            — score badge, safety color fill, ticker, gear⚙, ✕
├── price-row         — $price  ▲/▼ change%
├── vol-row           — Vol 24h: $X.XM
├── sep               — 1px #1e1e1e
└── skill-tabs        — TRADE | ALERT | WATCH | DEEP
    └── panel         — inline panel, shown when tab is active
```

### 2.2 Header (safety badge)

```html
<div class="qd-header" style="background:{safetyColor}; padding:12px 10px; display:flex; align-items:center; gap:10px;">
  <span class="qd-score">{score}</span>        <!-- Space Mono 34px bold, TEXT_PRIMARY -->
  <div class="qd-mid">
    <span class="qd-label">{SAFE|CAUTION|HIGH RISK}</span>  <!-- 9px, darker shade of safety color -->
    <span class="qd-ticker">{TICKER}</span>    <!-- 17px bold, TEXT_PRIMARY -->
  </div>
  <div class="qd-btns">
    <button class="qd-gear">⚙</button>        <!-- opens toolbar popup -->
    <button class="qd-close">✕</button>
  </div>
</div>
```

Safety color map: score ≥ 80 → `#8bf542`, ≥ 50 → `#f5c842`, else → `#f54242`.

### 2.3 Skill Tabs

Replace the old BUY/CANCEL action row with 4 equal-width tabs.

```html
<div class="qd-skill-tabs">
  <button class="qd-tab" data-skill="TRADE">TRADE</button>  <!-- active: yellow bottom border -->
  <div class="qd-tab-div"></div>                            <!-- 1px #2a2a2a divider -->
  <button class="qd-tab" data-skill="ALERT">ALERT</button>
  <div class="qd-tab-div"></div>
  <button class="qd-tab" data-skill="WATCH">WATCH</button>
  <div class="qd-tab-div"></div>
  <button class="qd-tab" data-skill="DEEP">DEEP</button>
</div>
<div class="qd-panel"></div>   <!-- injected by active skill -->
```

Active tab: `border-bottom: 2px solid #f5e642; color: #f5e642`. Inactive: `color: #555555`.

---

## 3. Skill Panels

Each skill panel is a self-contained function that returns an HTMLElement. Rendered into `.qd-panel` when the tab is clicked.

### 3.1 TRADE Panel — `extension/src/skills/trade.ts`

Renders inline swap via Jupiter API.

```
BUY {TICKER}                          ← yellow label
[  0.5 SOL              ] [MAX]       ← input, yellow border
        ↓
[ ~12,345 {TICKER}                ]   ← dark output box
  1 SOL = X BONK  •  Impact: 0.2%
[ SWAP NOW ]                          ← yellow brutal button
```

- Input: `<input type="number">` with placeholder `"0.5"` and `" SOL"` suffix label
- MAX button: fills in wallet's SOL balance
- Calls `sendBg({ type: "QUOTE", inputMint, outputMint, amount })` → background fetches Jupiter `/quote`
- SWAP NOW: calls `sendBg({ type: "SWAP", ... })`
- Requires connected wallet; shows "Connect wallet first" ghost state if not connected

### 3.2 ALERT Panel — `extension/src/skills/alert.ts`

```
SET PRICE ALERT
[ ABOVE ] [ BELOW ]                   ← segmented control, ABOVE = yellow active
[ $ 0.000030        ]                 ← price input
[ SET ALERT ]                         ← yellow brutal button
```

- Persisted via `chrome.storage.local` under key `"alerts"` (array of `{mint, condition, price, triggered}`)
- Background service worker polls via `chrome.alarms` every 5 minutes ("qd-alert-check")
- On trigger: `chrome.notifications.create(...)` with title "Quickdraw Alert" and price hit message
- Deduplication: mark `triggered: true`, only re-arm after price reverts

### 3.3 WATCH Panel — `extension/src/skills/watch.ts`

```
WATCHLIST
[ + ADD {TICKER} ]                    ← yellow brutal button
─────────────────────────────────────
WATCHING (N)
SOL    $148.20   ▲ 2.1%
JTO    $3.84     ▼ 0.8%
```

- Persisted via `chrome.storage.local` key `"watchlist"` (array of `{mint, ticker}`)
- Prices for watchlist items fetched from worker `/price` on popup open
- Same list displayed in toolbar popup (Settings STATE tab)

### 3.4 DEEP Panel — `extension/src/skills/deep.ts`

```
DEEP ANALYSIS
┌────────────────────────────────────┐
│ BONK showing bullish momentum...   │  ← AI narration, #cccccc, 9px Space Mono
└────────────────────────────────────┘
● Analyzing…                         ← streaming indicator (yellow dot)
[ RE-ANALYZE ]                        ← ghost button
```

- Calls `sendBg({ type: "DEEP_ANALYSIS", mint })` → background POSTs to `/ai/deep` (claude-sonnet-4-6)
- Response streamed into the text box via port messaging
- RE-ANALYZE clears text and triggers again
- Shows loading state immediately on tab click

---

## 4. Wallet Connect (Reown)

**Remove:** `extension/src/wallet-bridge.ts`, `extension/src/wallet.ts`

**Add:** `extension/src/wallet-reown.ts`

### 4.1 Modal design (see Pencil: "Wallet — Connect Modal")

```
CONNECT WALLET                        ← header, yellow Space Mono
─────────────────────────────────────
EMAIL
[ you@example.com              ]      ← dark input, #444 border
[ CONTINUE ]                          ← yellow brutal button
────── OR ──────
        ⬡                            ← WalletConnect blue hex icon
     QR CODE                          ← placeholder rendered by AppKit
Scan with WalletConnect
Works with Phantom, Solflare & more
─────────────────────────────────────
Powered by Reown AppKit              ← footer, #333, 8px
```

### 4.2 Implementation

- Use `@reown/appkit` + `@reown/appkit-adapter-solana`
- `projectId` injected at build time via `--define:__REOWN_PROJECT_ID__`
- Modal opens via `modal.open()` when "Connect Wallet" button clicked in toolbar popup
- `modal.subscribeState(({ isConnected, address }) => ...)` → updates `chrome.storage.local` key `"wallet"` → dispatches to content script via `chrome.runtime.sendMessage`
- Only `email` and `walletConnect` methods enabled (no `window.solana` injection — popup context cannot access it)

---

## 5. Settings Panel Updates

**File:** `extension/src/popup.ts`

### 5.1 STATE tab (unchanged)

- Active/Paused toggle
- Stats: last seen token, session duration
- AI MODE: Auto / Cloud / Local
- Connect Wallet button (triggers Reown modal)
- Watchlist summary (from `chrome.storage.local`)

### 5.2 SKILLS tab (new, see Pencil: "Settings — SKILLS Tab")

```
SKILLS
[ON] TRADE   Jupiter swap inline
[ON] ALERT   Price notifications
[ON] WATCH   Track tokens
[ON] DEEP    AI deep analysis

Skills appear in the popup when a token is detected on-page.
```

- Each skill has an `enabled` boolean in `chrome.storage.local` key `"skillSettings"`
- Toggle updates storage and sends message to content script to re-render tabs
- Default: all ON

---

## 6. Worker Updates

**File:** `worker/src/index.ts`

Add one new route:

```
POST /ai/deep
Headers: Authorization: Bearer {EXTENSION_SECRET}
Body: { mint: string, ticker: string, price: number, safetyScore: number, volume24h: number }
Response: streaming text (SSE)

Model: claude-sonnet-4-6
Prompt: detailed analysis including on-chain signals, holder distribution, liquidity depth, price action
```

---

## 7. File Map

| Action | File |
|---|---|
| Create | `extension/src/skills/trade.ts` |
| Create | `extension/src/skills/alert.ts` |
| Create | `extension/src/skills/watch.ts` |
| Create | `extension/src/skills/deep.ts` |
| Create | `extension/src/wallet-reown.ts` |
| Create | `extension/src/styles.ts` |
| Modify | `extension/src/content.ts` — rebuild popup DOM |
| Modify | `extension/src/popup.ts` — add SKILLS tab, Reown connect |
| Modify | `extension/src/background.ts` — add DEEP_ANALYSIS, QUOTE, SWAP handlers; chrome.alarms |
| Modify | `extension/src/shared.ts` — add DS tokens |
| Delete | `extension/src/wallet-bridge.ts` |
| Delete | `extension/src/wallet.ts` |
| Modify | `worker/src/index.ts` — add `/ai/deep` SSE route |
| Modify | `extension/package.json` — add Reown deps, build:prod flag for REOWN_PROJECT_ID |

---

## 8. Security

- `EXTENSION_SECRET` and `REOWN_PROJECT_ID` passed only at build time via `--define`, never committed
- Placeholder in `package.json` build:prod: `REPLACE_WITH_SECRET` and `REPLACE_WITH_REOWN_ID`
- DEEP analysis route authenticated via same HMAC bearer scheme

---

## 9. Non-Goals (out of scope for this phase)

- Voice narration
- Native messaging bridge to Rust app (`quickdraw-host`)
- Chart rendering
- Sell/short trades
- Portfolio tracking
