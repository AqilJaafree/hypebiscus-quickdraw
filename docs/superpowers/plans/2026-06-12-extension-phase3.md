# Quickdraw Extension Phase 3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-adapter swap comparison, Twitter/X context enrichment, portfolio snapshot in the badge popup, and site-aware detection rules to the Quickdraw Chrome extension.

**Architecture:** Four independent features, each touching a vertical slice of extension → background → worker. Tasks are ordered so earlier tasks have no dependency on later ones. A bug in the existing worker (extension auth branch returns 404 for `/defi/jupiter/quote`) is fixed as part of Task 1.

**Tech Stack:** TypeScript, esbuild (no bundler changes needed), Chrome MV3 (Service Worker + Content Scripts + Popup), Cloudflare Worker, Raydium REST API (second swap adapter), Helius DAS API (portfolio), `tsx` (test runner for pure functions — new devDep)

**Implementation note — swap adapter:** Orca does not have a REST quote API; accurate quotes require `@orca-so/whirlpools-sdk` (~2MB bundle hit to the Worker). This plan uses Raydium's `transaction-v1.raydium.io/compute/swap-base-in` endpoint instead — same concept (two parallel quotes, ranked by output), zero SDK dependency. Orca can be added post-Phase 3 if the SDK bundle situation improves.

---

## File Map

| Action | File | Change |
|---|---|---|
| Create | `extension/src/__tests__/multi-quote.test.ts` | rankQuotes unit test |
| Create | `extension/src/__tests__/tweet-context.test.ts` | parseEngagement unit test |
| Create | `extension/src/__tests__/detection-rules.test.ts` | defaultMode unit test |
| Create | `extension/src/multi-quote-utils.ts` | pure rankQuotes function |
| Create | `extension/src/tweet-context.ts` | TweetContext type + extractTweetContext + parseEngagement |
| Create | `extension/src/detection-rules.ts` | SiteMode type + defaultMode + getSiteMode + setSiteMode |
| Modify | `extension/src/types.ts` | Add AdapterQuote, MultiAdapterQuote, PortfolioItem; extend BgRequest |
| Modify | `extension/src/background.ts` | Add fetchRaydiumQuote, quote_multi handler, get_portfolio handler |
| Modify | `extension/src/skills/trade.ts` | Replace single quote with multi-adapter UI |
| Modify | `extension/src/content.ts` | Extract tweet context; check site mode; pass context to narration port |
| Modify | `extension/popup.html` | Add portfolio section to STATE pane; add site rules to SKILLS pane |
| Modify | `extension/src/popup.ts` | Load + render portfolio; site-aware rules UI in SKILLS tab |
| Modify | `worker/src/index.ts` | Add /defi/helius/portfolio handler; extend extension auth branch |
| Modify | `extension/package.json` | Add tsx devDependency |

---

## Setup: Test Runner

- [ ] **Step 1: Install tsx**

```bash
cd extension && npm install -D tsx
```

Expected: `tsx` appears in `package.json` devDependencies, `node_modules/tsx` exists.

- [ ] **Step 2: Add test script to package.json**

Open `extension/package.json`. Add a `"test"` script after the existing scripts:

```json
"test": "node --import tsx/esm --test src/__tests__/*.test.ts"
```

The full scripts block becomes:
```json
"scripts": {
  "build": "...(existing)...",
  "watch": "...(existing)...",
  "build:prod": "...(existing)...",
  "test": "node --import tsx/esm --test src/__tests__/*.test.ts"
}
```

- [ ] **Step 3: Create test directory**

```bash
mkdir -p extension/src/__tests__
```

---

## Task 1: Multi-Adapter Swap Comparison

Replace the single Jupiter quote in the TRADE panel with a parallel Jupiter + Raydium fetch. Show a ranked list (best rate highlighted). SWAP NOW opens the winning adapter's URL.

**Files:**
- Create: `extension/src/__tests__/multi-quote.test.ts`
- Create: `extension/src/multi-quote-utils.ts`
- Modify: `extension/src/types.ts`
- Modify: `extension/src/background.ts`
- Modify: `extension/src/skills/trade.ts`
- Modify: `worker/src/index.ts`

---

- [ ] **Step 1: Write the failing test**

Create `extension/src/__tests__/multi-quote.test.ts`:

```typescript
import assert from "node:assert/strict";
import { test } from "node:test";
import { rankQuotes } from "../multi-quote-utils.js";
import type { AdapterQuote } from "../types.js";

test("rankQuotes: higher outAmount sorts first", () => {
  const jupiter: AdapterQuote = {
    adapter: "jupiter",
    outAmount: "1000000",
    priceImpactPct: 0.1,
    routeLabel: "Orca-Jupiter",
  };
  const raydium: AdapterQuote = {
    adapter: "raydium",
    outAmount: "1050000",
    priceImpactPct: 0.05,
    routeLabel: "Raydium",
  };
  const ranked = rankQuotes([jupiter, raydium]);
  assert.equal(ranked[0].adapter, "raydium");
  assert.equal(ranked[0].outAmount, "1050000");
});

test("rankQuotes: equal amounts preserves order", () => {
  const a: AdapterQuote = { adapter: "jupiter", outAmount: "1000000", priceImpactPct: 0.1, routeLabel: "Jupiter" };
  const b: AdapterQuote = { adapter: "raydium", outAmount: "1000000", priceImpactPct: 0.1, routeLabel: "Raydium" };
  const ranked = rankQuotes([a, b]);
  assert.equal(ranked.length, 2);
});

test("rankQuotes: single quote returns single-element array", () => {
  const q: AdapterQuote = { adapter: "jupiter", outAmount: "999", priceImpactPct: 0.0, routeLabel: "Jupiter" };
  const ranked = rankQuotes([q]);
  assert.equal(ranked[0].outAmount, "999");
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd extension && npm test
```

Expected: `ERR_MODULE_NOT_FOUND` or `Cannot find module '../multi-quote-utils.js'`

- [ ] **Step 3: Add AdapterQuote and MultiAdapterQuote types to types.ts**

Open `extension/src/types.ts`. After the `SwapQuote` interface (line 27), add:

```typescript
export interface AdapterQuote {
  adapter: "jupiter" | "raydium";
  outAmount: string;
  priceImpactPct: number;
  routeLabel: string;
}

export interface MultiAdapterQuote {
  best: AdapterQuote;
  all: AdapterQuote[];
}

export interface PortfolioItem {
  mint: string;
  symbol: string;
  balance: number;
  decimals: number;
  priceUsd: number | null;
  valueUsd: number | null;
}
```

Also extend `BgRequest` (line 100) — add these two variants to the union:

```typescript
  | { type: "quote_multi"; inputMint: string; outputMint: string; amountLamports: number }
  | { type: "get_portfolio" }
```

The full BgRequest union with additions:
```typescript
export type BgRequest =
  | { type: "fetch_token"; address: string }
  | { type: "get_wallet" }
  | { type: "set_wallet"; wallet: WalletState }
  | { type: "get_detection_enabled" }
  | { type: "set_detection_enabled"; enabled: boolean }
  | { type: "get_alerts" }
  | { type: "set_alerts"; alerts: PriceAlert[] }
  | { type: "get_watchlist" }
  | { type: "set_watchlist"; watchlist: WatchItem[] }
  | { type: "get_watchlist_prices"; mints: string[] }
  | { type: "get_skill_settings" }
  | { type: "set_skill_settings"; settings: SkillSettings }
  | { type: "quote"; inputMint: string; outputMint: string; amountLamports: number }
  | { type: "quote_multi"; inputMint: string; outputMint: string; amountLamports: number }
  | { type: "swap_tx"; inputMint: string; outputMint: string; amountLamports: number; walletAddress: string }
  | { type: "get_portfolio" }
  | { type: "connect_wallet_injected" };
```

- [ ] **Step 4: Create multi-quote-utils.ts**

Create `extension/src/multi-quote-utils.ts`:

```typescript
import type { AdapterQuote } from "./types";

export function rankQuotes(quotes: AdapterQuote[]): AdapterQuote[] {
  return [...quotes].sort((a, b) => {
    const diff = BigInt(b.outAmount) - BigInt(a.outAmount);
    return diff > 0n ? 1 : diff < 0n ? -1 : 0;
  });
}
```

- [ ] **Step 5: Run test — expect pass**

```bash
cd extension && npm test
```

Expected: `multi-quote.test.ts - rankQuotes: higher outAmount sorts first ✓` (all 3 tests pass)

- [ ] **Step 6: Fix worker — add Jupiter quote + portfolio routes to extension auth branch**

Open `worker/src/index.ts`. In the extension auth branch (around line 438), replace:

```typescript
      if (url.pathname === "/ai/fast" && req.method === "POST") {
        return handleAi(req, env, "claude-haiku-4-5-20251001");
      }
      if (url.pathname === "/ai/deep" && req.method === "POST") {
        return handleAiDeepExtension(req, env);
      }
      return err("Not found", 404);
```

with:

```typescript
      if (url.pathname === "/ai/fast" && req.method === "POST") {
        return handleAi(req, env, "claude-haiku-4-5-20251001");
      }
      if (url.pathname === "/ai/deep" && req.method === "POST") {
        return handleAiDeepExtension(req, env);
      }
      if (url.pathname === "/defi/jupiter/quote") {
        return handleJupiterQuote(url);
      }
      if (url.pathname === "/defi/helius/portfolio") {
        return handleHeliusPortfolio(url, env);
      }
      return err("Not found", 404);
```

Then add `handleHeliusPortfolio` after the existing `handleHeliusToken` function (around line 251):

```typescript
async function handleHeliusPortfolio(url: URL, env: Env): Promise<Response> {
  const wallet = url.searchParams.get("wallet");
  if (!wallet) return err("wallet param required");

  const upstream = await fetch(
    `https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "portfolio",
        method: "getAssetsByOwner",
        params: {
          ownerAddress: wallet,
          page: 1,
          limit: 100,
          displayOptions: { showFungible: true, showNativeBalance: false },
        },
      }),
    },
  );

  if (!upstream.ok) return err("Helius error", 502);

  const raw = await upstream.json() as {
    result?: {
      items?: Array<{
        id: string;
        interface: string;
        content: { metadata: { symbol?: string } };
        token_info?: {
          balance: number;
          decimals: number;
          price_info?: { price_per_token?: number };
        };
      }>;
    };
  };

  const items = (raw.result?.items ?? [])
    .filter(a => a.interface === "FungibleToken" && a.token_info)
    .map(a => {
      const ti = a.token_info!;
      const priceUsd = ti.price_info?.price_per_token ?? null;
      const balance = ti.balance / Math.pow(10, ti.decimals);
      return {
        mint: a.id,
        symbol: a.content.metadata.symbol ?? a.id.slice(0, 6),
        balance,
        decimals: ti.decimals,
        priceUsd,
        valueUsd: priceUsd !== null ? balance * priceUsd : null,
      };
    });

  return json(items);
}
```

Also add `handleHeliusPortfolio` to the comment block at the top of the file (line 18):

```
 *   GET  /defi/helius/portfolio      → Helius DAS fungible token holdings
```

- [ ] **Step 7: Add fetchRaydiumQuote and quote_multi handler to background.ts**

Open `extension/src/background.ts`. Add the following imports at the top (after existing imports):

```typescript
import { rankQuotes } from "./multi-quote-utils";
import type { AdapterQuote, MultiAdapterQuote, PortfolioItem } from "./types";
```

Add `fetchRaydiumQuote` after `fetchQuoteFromWorker` (around line 84):

```typescript
async function fetchRaydiumQuote(
  inputMint: string,
  outputMint: string,
  amountLamports: number,
): Promise<AdapterQuote | null> {
  try {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: String(amountLamports),
      slippageBps: "50",
      txVersion: "V0",
    });
    const resp = await fetch(
      `https://transaction-v1.raydium.io/compute/swap-base-in?${params}`,
    );
    if (!resp.ok) return null;
    const data = await resp.json() as {
      success: boolean;
      data?: { outputAmount: string; priceImpactPct: number };
    };
    if (!data.success || !data.data) return null;
    return {
      adapter: "raydium",
      outAmount: data.data.outputAmount,
      priceImpactPct: data.data.priceImpactPct,
      routeLabel: "Raydium",
    };
  } catch {
    return null;
  }
}
```

In `handleMessage`, add the `quote_multi` handler before the existing `quote` handler (around line 450):

```typescript
    if (msg.type === "quote_multi") {
      const [jupiterResult, raydiumResult] = await Promise.allSettled([
        fetchQuoteFromWorker(msg.inputMint, msg.outputMint, msg.amountLamports),
        fetchRaydiumQuote(msg.inputMint, msg.outputMint, msg.amountLamports),
      ]);

      const quotes: AdapterQuote[] = [];

      if (jupiterResult.status === "fulfilled") {
        const jup = jupiterResult.value as {
          outAmount: string;
          priceImpactPct: number;
          routePlan?: Array<{ swapInfo: { label: string } }>;
        };
        quotes.push({
          adapter: "jupiter",
          outAmount: jup.outAmount ?? "0",
          priceImpactPct: jup.priceImpactPct ?? 0,
          routeLabel: jup.routePlan?.[0]?.swapInfo?.label ?? "Jupiter",
        });
      }

      if (raydiumResult.status === "fulfilled" && raydiumResult.value) {
        quotes.push(raydiumResult.value);
      }

      if (!quotes.length) {
        respond({ ok: false, error: "No quotes available" });
        return;
      }

      const ranked = rankQuotes(quotes);
      const result: MultiAdapterQuote = { best: ranked[0], all: ranked };
      respond({ ok: true, data: result });
      return;
    }
```

- [ ] **Step 8: Update TRADE panel to use quote_multi**

Open `extension/src/skills/trade.ts`. Replace the full file contents with:

```typescript
import { DS, brutal } from "../styles";
import { sendBg, esc } from "../shared";
import type { MultiAdapterQuote, AdapterQuote, WalletState } from "../types";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const LAMPORTS_PER_SOL = 1_000_000_000;

export function formatSolAmount(sol: number): string {
  return sol.toFixed(4);
}

export function parseOutputAmount(rawAmount: string, decimals: number): string {
  if (!rawAmount) return "—";
  const num = BigInt(rawAmount);
  const divisor = BigInt(Math.pow(10, decimals));
  const whole = num / divisor;
  const frac = num % divisor;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, decimals === 6 ? 6 : 2);
  return `${whole}.${fracStr}`;
}

interface TradeState {
  solInput: string;
  multiQuote: MultiAdapterQuote | null;
  loading: boolean;
  error: string | null;
}

export function buildTradePanel(
  outputMint: string,
  ticker: string,
  wallet: WalletState,
): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `padding:10px 12px;font-family:${DS.font};`;

  let state: TradeState = { solInput: "0.5", multiQuote: null, loading: false, error: null };

  function render(): void {
    el.innerHTML = buildTradeHTML(ticker, state, wallet);

    const input = el.querySelector<HTMLInputElement>("#qd-trade-sol");
    input?.addEventListener("change", () => {
      state = { ...state, solInput: input.value, multiQuote: null, error: null };
      fetchQuote();
    });

    el.querySelector("#qd-trade-max")?.addEventListener("click", () => {
      if (input) { input.value = "0.5"; state = { ...state, solInput: "0.5" }; fetchQuote(); }
    });

    el.querySelector("#qd-trade-swap")?.addEventListener("click", () => {
      if (!wallet.connected) {
        chrome.runtime.sendMessage({ type: "OPEN_POPUP" });
        return;
      }
      if (state.multiQuote) executeSwap(state.multiQuote.best);
      else fetchQuote();
    });
  }

  async function fetchQuote(): Promise<void> {
    const sol = parseFloat(state.solInput || "0");
    if (sol <= 0) return;
    state = { ...state, loading: true, error: null, multiQuote: null };
    render();
    try {
      const amountLamports = Math.floor(sol * LAMPORTS_PER_SOL);
      const result = await sendBg<MultiAdapterQuote>({
        type: "quote_multi",
        inputMint: SOL_MINT,
        outputMint,
        amountLamports,
      });
      state = { ...state, loading: false, multiQuote: result, error: null };
    } catch (err: unknown) {
      state = { ...state, loading: false, error: err instanceof Error ? err.message : "Quote failed" };
    }
    render();
  }

  function executeSwap(quote: AdapterQuote): void {
    if (quote.adapter === "raydium") {
      window.open(`https://raydium.io/swap/?inputMint=${SOL_MINT}&outputMint=${outputMint}`, "_blank");
    } else {
      window.open(`https://jup.ag/swap/SOL-${outputMint}`, "_blank");
    }
  }

  render();
  return el;
}

function buildTradeHTML(ticker: string, state: TradeState, wallet: WalletState): string {
  const quoteRows = state.multiQuote
    ? state.multiQuote.all.map((q, i) => `
      <div style="display:flex;justify-content:space-between;align-items:center;
        padding:5px 8px;background:${i === 0 ? "#1e2e1e" : "#111"};
        border:1px solid ${i === 0 ? "#8bf542" : "#2a2a2a"};margin-bottom:3px;">
        <span style="font-size:9px;color:${i === 0 ? "#8bf542" : "#888"};">
          ${i === 0 ? "★ " : ""}${esc(q.routeLabel)}
        </span>
        <span style="font-size:11px;font-weight:700;color:#fff;">
          ${parseOutputAmount(q.outAmount, 6)} ${esc(ticker)}
        </span>
        <span style="font-size:9px;color:#555;">${q.priceImpactPct.toFixed(2)}%</span>
      </div>`).join("")
    : (state.loading
        ? `<div style="font-size:10px;color:#555;padding:8px;">fetching quotes…</div>`
        : `<div style="font-size:10px;color:#555;padding:8px;">—</div>`);

  const swapLabel = !wallet.connected ? "CONNECT WALLET FIRST" : "SWAP NOW ↗";

  return `
<style>
  .qd-tr-label { font-size:10px; color:${DS.textMut}; margin-bottom:6px; letter-spacing:0.06em; }
  .qd-tr-row { display:flex; gap:6px; margin-bottom:6px; }
  .qd-tr-input { flex:1; background:#222; border:1.5px solid ${DS.yellow}; color:#fff;
    padding:7px 10px; font-family:${DS.font}; font-size:12px; outline:none; min-width:0; }
  .qd-tr-max { ${brutal(DS.yellow)}; color:#000; padding:6px 10px; font-size:10px;
    font-family:${DS.font}; font-weight:700; cursor:pointer; border:none; white-space:nowrap; }
  .qd-tr-quotes { margin-bottom:6px; }
  .qd-tr-err { font-size:10px; color:${DS.danger}; margin-bottom:6px; }
  .qd-tr-swap { width:100%; ${brutal(DS.yellow)}; color:#000; padding:9px; font-size:11px;
    font-weight:700; letter-spacing:0.06em; cursor:pointer; font-family:${DS.font}; }
</style>
<div class="qd-tr-label">BUY ${esc(ticker)}</div>
<div class="qd-tr-row">
  <input id="qd-trade-sol" class="qd-tr-input" type="number" value="${esc(state.solInput)}" placeholder="0.5" min="0.001" step="0.1" />
  <span style="color:${DS.textMut};font-size:10px;align-self:center;">SOL</span>
  <button id="qd-trade-max" class="qd-tr-max">MAX</button>
</div>
<div class="qd-tr-quotes">${quoteRows}</div>
${state.error ? `<div class="qd-tr-err">⚠ ${esc(state.error)}</div>` : ""}
<button id="qd-trade-swap" class="qd-tr-swap">${esc(swapLabel)}</button>`;
}
```

- [ ] **Step 9: Verify the build compiles**

```bash
cd extension && npm run build
```

Expected: build completes without errors. `dist/background.js` and `dist/content.js` regenerated.

- [ ] **Step 10: Manual verification**

Load the extension in Chrome (`chrome://extensions` → Load unpacked → `extension/`). Open a page with a Solana token address. Trigger the popup. Click TRADE tab. Enter an amount. Verify that:
- Two quote rows appear (Jupiter and Raydium, or one if one adapter fails)
- Best rate is highlighted in green
- SWAP NOW opens the correct URL for the best adapter

- [ ] **Step 11: Commit**

```bash
cd extension && git add src/__tests__/multi-quote.test.ts src/multi-quote-utils.ts src/types.ts src/background.ts src/skills/trade.ts package.json package-lock.json
git add ../worker/src/index.ts
git commit -m "feat: multi-adapter swap comparison (Jupiter + Raydium)"
```

---

## Task 2: Twitter/X Context Enrichment

When a token address is detected inside a tweet on twitter.com or x.com, extract the author, engagement counts, and tweet text. Pass this to the narration port so Haiku can reference social context in its 1–2 sentence analysis.

**Files:**
- Create: `extension/src/__tests__/tweet-context.test.ts`
- Create: `extension/src/tweet-context.ts`
- Modify: `extension/src/content.ts`
- Modify: `extension/src/background.ts`

---

- [ ] **Step 1: Write the failing test**

Create `extension/src/__tests__/tweet-context.test.ts`:

```typescript
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEngagement } from "../tweet-context.js";

test("parseEngagement: parses K suffix", () => {
  assert.equal(parseEngagement("1.2K"), 1200);
  assert.equal(parseEngagement("45K"), 45000);
});

test("parseEngagement: parses M suffix", () => {
  assert.equal(parseEngagement("2.5M"), 2_500_000);
});

test("parseEngagement: parses plain numbers", () => {
  assert.equal(parseEngagement("45"), 45);
  assert.equal(parseEngagement("0"), 0);
});

test("parseEngagement: returns null for empty or non-numeric", () => {
  assert.equal(parseEngagement(""), null);
  assert.equal(parseEngagement("abc"), null);
  assert.equal(parseEngagement("  "), null);
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd extension && npm test
```

Expected: `ERR_MODULE_NOT_FOUND` for `../tweet-context.js`

- [ ] **Step 3: Create tweet-context.ts**

Create `extension/src/tweet-context.ts`:

```typescript
export interface TweetContext {
  authorHandle: string | null;
  verified: boolean;
  tweetText: string | null;
  likes: number | null;
  retweets: number | null;
}

export function parseEngagement(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (t.endsWith("k")) {
    const n = parseFloat(t);
    return isNaN(n) ? null : Math.round(n * 1000);
  }
  if (t.endsWith("m")) {
    const n = parseFloat(t);
    return isNaN(n) ? null : Math.round(n * 1_000_000);
  }
  const n = parseInt(t, 10);
  return isNaN(n) ? null : n;
}

export function extractTweetContext(el: Element | undefined): TweetContext | null {
  if (!el) return null;
  const host = window.location.hostname;
  if (host !== "twitter.com" && host !== "x.com") return null;

  const article = el.closest('article[data-testid="tweet"]');
  if (!article) return null;

  const userNameEl = article.querySelector('[data-testid="User-Name"]');
  const handleLink = userNameEl?.querySelector('a[href^="/"]') as HTMLAnchorElement | null;
  const authorHandle = handleLink?.getAttribute("href")?.replace(/^\//, "") ?? null;

  const verified = !!article.querySelector('[data-testid="icon-verified"]');

  const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
  const tweetText = tweetTextEl?.textContent?.trim().slice(0, 280) ?? null;

  const likeEl = article.querySelector(
    '[data-testid="like"] span[data-testid="app-text-transition-container"]',
  );
  const retweetEl = article.querySelector(
    '[data-testid="retweet"] span[data-testid="app-text-transition-container"]',
  );

  return {
    authorHandle,
    verified,
    tweetText: tweetText || null,
    likes: parseEngagement(likeEl?.textContent ?? ""),
    retweets: parseEngagement(retweetEl?.textContent ?? ""),
  };
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd extension && npm test
```

Expected: all `tweet-context.test.ts` tests pass alongside the multi-quote tests.

- [ ] **Step 5: Update content.ts to extract tweet context and pass source element**

Open `extension/src/content.ts`. Add the import at the top (after existing imports):

```typescript
import { extractTweetContext } from "./tweet-context";
import type { TweetContext } from "./tweet-context";
```

Change `triggerAddress` signature to accept an optional source element and trigger source:

```typescript
async function triggerAddress(
  address: string,
  rawX: number,
  rawY: number,
  sourceEl?: Element,
  source: "selection" | "mutation" = "mutation",
): Promise<void> {
```

Inside `triggerAddress`, after the dedup check and before `clampPosition`, add:

```typescript
  const tweetContext: TweetContext | null = extractTweetContext(sourceEl);
```

Inside the narration port section, add `tweetContext` to the `port.postMessage` call:

```typescript
    port.postMessage({
      address,
      safety: { score: tokenData.safety.score, label: tokenData.safety.label, summary: tokenData.safety.summary },
      price: tokenData.price ? { usd: tokenData.price.usd, symbol: tokenData.price.symbol } : null,
      tweetContext,
    });
```

In `onSelectionChange`, pass the selection's anchor element:

```typescript
function onSelectionChange(): void {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    const detection = detectInSelection();
    if (!detection || detection.type !== "address") return;
    const rect = detection.rect;
    const sel = window.getSelection();
    const sourceEl = sel?.anchorNode?.parentElement ?? undefined;
    triggerAddress(detection.value, rect.left, rect.bottom, sourceEl, "selection");
  }, DEBOUNCE_MS);
}
```

In `processMutations`, pass the parent element:

```typescript
      if (first.type === "address") {
        triggerAddress(first.value, rect.left, rect.bottom, parent, "mutation");
        return;
      }
```

- [ ] **Step 6: Update background.ts narration handler to include tweet context in prompt**

Open `extension/src/background.ts`. Add the import:

```typescript
import type { TweetContext } from "./tweet-context";
```

In the narration port `onMessage` listener (around line 169), update the request type to include `tweetContext`:

```typescript
  port.onMessage.addListener(async (req: {
    address: string;
    safety: { score: number; label: string; summary: string };
    price: { usd: number; symbol: string } | null;
    tweetContext?: TweetContext | null;
  }) => {
```

Replace the `user` string construction with a version that appends tweet context:

```typescript
      const contextLines = [
        `Token address: ${req.address}`,
        `Safety score: ${req.safety.score}/100 (${req.safety.label})`,
        `Details: ${req.safety.summary}`,
        req.price ? `Price: $${req.price.usd.toFixed(6)} (${req.price.symbol})` : "Price: unavailable",
      ];

      if (req.tweetContext) {
        const ctx = req.tweetContext;
        if (ctx.authorHandle) {
          contextLines.push(
            `Mentioned by: @${ctx.authorHandle}${ctx.verified ? " (verified)" : ""}`,
          );
        }
        if (ctx.likes !== null) {
          contextLines.push(
            `Engagement: ${ctx.likes.toLocaleString()} likes, ${(ctx.retweets ?? 0).toLocaleString()} retweets`,
          );
        }
        if (ctx.tweetText) {
          contextLines.push(`Tweet: "${ctx.tweetText.slice(0, 140)}"`);
        }
      }

      const user = contextLines.join("\n");
```

- [ ] **Step 7: Build and verify**

```bash
cd extension && npm run build
```

Expected: no errors. Load the extension. Navigate to twitter.com, find a tweet containing a Solana address. Highlight or wait for it to be detected. Verify the narration mentions the author or engagement if the address was inside a tweet element.

- [ ] **Step 8: Commit**

```bash
cd extension && git add src/__tests__/tweet-context.test.ts src/tweet-context.ts src/content.ts src/background.ts
git commit -m "feat: twitter/x context enrichment for AI narration"
```

---

## Task 3: Portfolio Snapshot

Show the connected wallet's fungible token holdings in the STATE tab of the badge popup, below the wallet connect button. Fetched from Helius DAS via the Worker. Cached 30s in `chrome.storage.session`.

**Files:**
- Modify: `extension/src/background.ts` (get_portfolio handler)
- Modify: `extension/popup.html` (portfolio section in STATE pane)
- Modify: `extension/src/popup.ts` (load + render portfolio)
- (Worker already updated in Task 1)

---

- [ ] **Step 1: Add get_portfolio handler to background.ts**

Open `extension/src/background.ts`. In `handleMessage`, add before the final `respond({ ok: false, error: "Unknown message type" })` line:

```typescript
    if (msg.type === "get_portfolio") {
      if (!walletState.connected || !walletState.address) {
        respond({ ok: false, error: "No wallet connected" });
        return;
      }

      // Check 30s session cache keyed by wallet address
      const cacheKey = `portfolio_${walletState.address}`;
      const cached = await chrome.storage.session.get(cacheKey);
      if (cached[cacheKey]) {
        const entry = cached[cacheKey] as { data: PortfolioItem[]; expiresAt: number };
        if (Date.now() < entry.expiresAt) {
          respond({ ok: true, data: entry.data });
          return;
        }
      }

      const resp = await fetch(
        `${WORKER_URL}/defi/helius/portfolio?wallet=${encodeURIComponent(walletState.address)}`,
        {
          headers: {
            "X-Quickdraw-Client": "extension",
            "Authorization": `Bearer ${EXTENSION_SECRET}`,
          },
        },
      );
      if (!resp.ok) throw new Error("Portfolio fetch failed");
      const data = await resp.json() as PortfolioItem[];

      await chrome.storage.session.set({
        [cacheKey]: { data, expiresAt: Date.now() + 30_000 },
      });

      respond({ ok: true, data });
      return;
    }
```

- [ ] **Step 2: Add portfolio section to popup.html**

Open `extension/popup.html`. In the STATE pane, after the LOGIN section (after `<button id="connect-btn">Connect Wallet</button></div>`), add:

```html
      <div class="sep" id="portfolio-sep" style="display:none;"></div>

      <div class="section" id="portfolio-section" style="display:none;">
        <div class="section-label">PORTFOLIO</div>
        <div id="portfolio-list" style="display:flex;flex-direction:column;gap:2px;"></div>
        <div id="portfolio-total" class="stat-row" style="border-top:1px solid #2a2a2a;margin-top:4px;padding-top:4px;"></div>
      </div>
```

Also add CSS for portfolio rows in the `<style>` block:

```css
    .portfolio-row { display:flex; justify-content:space-between; align-items:center; padding:1px 4px; }
    .portfolio-sym { font-size:10px; color:#888; }
    .portfolio-val { font-size:10px; font-weight:700; color:#fff; }
```

- [ ] **Step 3: Add portfolio load logic to popup.ts**

Open `extension/src/popup.ts`. The top of the file currently reads:

```typescript
import { sendBg } from "./shared";
import type { WalletState } from "./types";
```

Replace those two lines with:

```typescript
import { sendBg, esc } from "./shared";
import type { WalletState, PortfolioItem } from "./types";
```

Add `loadPortfolio` function before `init()`:

```typescript
async function loadPortfolio(wallet: WalletState): Promise<void> {
  const section = document.getElementById("portfolio-section") as HTMLElement;
  const sep = document.getElementById("portfolio-sep") as HTMLElement;
  const list = document.getElementById("portfolio-list") as HTMLElement;
  const total = document.getElementById("portfolio-total") as HTMLElement;

  if (!wallet.connected) {
    section.style.display = "none";
    sep.style.display = "none";
    return;
  }

  section.style.display = "";
  sep.style.display = "";
  list.innerHTML = `<div class="portfolio-row"><span class="portfolio-sym">Loading…</span></div>`;

  try {
    const items = await sendBg<PortfolioItem[]>({ type: "get_portfolio" });

    const sorted = items
      .filter(i => (i.valueUsd ?? 0) > 0.01)
      .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
      .slice(0, 8);

    const totalUsd = items.reduce((s, i) => s + (i.valueUsd ?? 0), 0);

    list.innerHTML = sorted.map(i =>
      `<div class="portfolio-row">
        <span class="portfolio-sym">${esc(i.symbol)}</span>
        <span class="portfolio-val">$${(i.valueUsd ?? 0).toFixed(2)}</span>
      </div>`,
    ).join("") || `<div class="portfolio-row"><span class="portfolio-sym">No tokens found</span></div>`;

    total.innerHTML = `
      <span class="stat-key">Total</span>
      <span class="stat-val">$${totalUsd.toFixed(2)}</span>`;
  } catch {
    list.innerHTML = `<div class="portfolio-row"><span class="portfolio-sym">—</span></div>`;
    sep.style.display = "none";
    section.style.display = "none";
  }
}
```

In `init()`, call `loadPortfolio` after `renderConnectBtn` in the `Promise.allSettled` block. Find the line `if (storage.wallet) renderConnectBtn(storage.wallet);` and add after it:

```typescript
    if (storage.wallet) {
      renderConnectBtn(storage.wallet);
      loadPortfolio(storage.wallet);
    }
```

Also call `loadPortfolio` when the storage watcher fires (wallet connects or disconnects). In the `chrome.storage.onChanged` listener, after `renderConnectBtn(w)`:

```typescript
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.wallet) return;
    const w = (changes.wallet.newValue ?? { address: null, adapter: null, connected: false }) as WalletState;
    renderConnectBtn(w);
    loadPortfolio(w);
  });
```

- [ ] **Step 4: Build and verify**

```bash
cd extension && npm run build
```

Expected: no errors. Load the extension. Connect a wallet with token holdings. Open the badge popup. Verify the portfolio section appears below the connect button with token symbols and USD values.

- [ ] **Step 5: Commit**

```bash
cd extension && git add src/background.ts popup.html src/popup.ts
git commit -m "feat: portfolio snapshot in badge popup via helius das"
```

---

## Task 4: Site-Aware Detection Rules

Add per-domain detection sensitivity (Aggressive / Selection only / Off) configurable from the SKILLS tab. Defaults: all sites Aggressive except Solscan, Birdeye, DexScreener which default to Selection only. Setting persists across browser profiles via `chrome.storage.sync`.

**Files:**
- Create: `extension/src/__tests__/detection-rules.test.ts`
- Create: `extension/src/detection-rules.ts`
- Modify: `extension/src/content.ts`
- Modify: `extension/popup.html`
- Modify: `extension/src/popup.ts`

---

- [ ] **Step 1: Write the failing test**

Create `extension/src/__tests__/detection-rules.test.ts`:

```typescript
import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultMode } from "../detection-rules.js";

test("defaultMode: quiet list sites default to selection", () => {
  assert.equal(defaultMode("solscan.io"), "selection");
  assert.equal(defaultMode("birdeye.so"), "selection");
  assert.equal(defaultMode("dexscreener.com"), "selection");
});

test("defaultMode: all other sites default to aggressive", () => {
  assert.equal(defaultMode("twitter.com"), "aggressive");
  assert.equal(defaultMode("pump.fun"), "aggressive");
  assert.equal(defaultMode("t.me"), "aggressive");
  assert.equal(defaultMode("reddit.com"), "aggressive");
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd extension && npm test
```

Expected: `ERR_MODULE_NOT_FOUND` for `../detection-rules.js`

- [ ] **Step 3: Create detection-rules.ts**

Create `extension/src/detection-rules.ts`:

```typescript
export type SiteMode = "aggressive" | "selection" | "off";

const STORAGE_KEY = "siteRules";

const QUIET_HOSTS = new Set([
  "solscan.io",
  "birdeye.so",
  "dexscreener.com",
]);

export function defaultMode(hostname: string): SiteMode {
  return QUIET_HOSTS.has(hostname) ? "selection" : "aggressive";
}

export async function getSiteMode(hostname: string): Promise<SiteMode> {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  const rules = (result[STORAGE_KEY] ?? {}) as Record<string, SiteMode>;
  return rules[hostname] ?? defaultMode(hostname);
}

export async function setSiteMode(hostname: string, mode: SiteMode): Promise<void> {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  const rules = (result[STORAGE_KEY] ?? {}) as Record<string, SiteMode>;
  rules[hostname] = mode;
  await chrome.storage.sync.set({ [STORAGE_KEY]: rules });
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
cd extension && npm test
```

Expected: all `detection-rules.test.ts` tests pass. All prior tests continue to pass.

- [ ] **Step 5: Update content.ts to check site mode before triggering**

Open `extension/src/content.ts`. Add imports at the top:

```typescript
import { getSiteMode, defaultMode } from "./detection-rules";
import type { SiteMode } from "./detection-rules";
```

Add site mode state after the existing `detectionEnabled` variable:

```typescript
let currentSiteMode: SiteMode = defaultMode(window.location.hostname);

// Initialise from storage, then watch for changes from popup settings.
getSiteMode(window.location.hostname).then(m => { currentSiteMode = m; }).catch(() => {});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.siteRules) return;
  const rules = (changes.siteRules.newValue ?? {}) as Record<string, SiteMode>;
  currentSiteMode = rules[window.location.hostname] ?? defaultMode(window.location.hostname);
});
```

At the top of `triggerAddress` (after the `!detectionEnabled` check), add site mode guards:

```typescript
  if (currentSiteMode === "off") return;
  if (currentSiteMode === "selection" && source !== "selection") return;
```

The full beginning of `triggerAddress` now looks like:

```typescript
async function triggerAddress(
  address: string,
  rawX: number,
  rawY: number,
  sourceEl?: Element,
  source: "selection" | "mutation" = "mutation",
): Promise<void> {
  if (!detectionEnabled) return;
  if (currentSiteMode === "off") return;
  if (currentSiteMode === "selection" && source !== "selection") return;

  const now = Date.now();
  // ...rest unchanged...
```

- [ ] **Step 6: Update popup.html SKILLS pane with site-aware rules UI**

Open `extension/popup.html`. Replace the entire `<!-- SKILLS pane -->` section with:

```html
  <!-- SKILLS pane -->
  <div class="qd-pane" id="pane-skills">
    <div class="content">

      <div class="section">
        <div class="section-label">AI NARRATION</div>
        <div class="stat-row">
          <span class="stat-key">Stream analysis on detect</span>
          <span class="stat-val" id="ai-narration-status">ON</span>
        </div>
      </div>

      <div class="sep"></div>

      <div class="section">
        <div class="section-label">SITE DETECTION</div>
        <div style="font-size:9px;color:#555;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" id="site-hostname">—</div>
        <div class="ai-toggle" id="site-mode-toggle">
          <button class="ai-btn" id="site-aggressive">All</button>
          <button class="ai-btn" id="site-selection">Select</button>
          <button class="ai-btn" id="site-off">Off</button>
        </div>
        <div style="font-size:9px;color:#333;margin-top:4px;line-height:1.5;">
          All: every address · Select: highlight only · Off: disabled
        </div>
      </div>

    </div>
  </div>
```

- [ ] **Step 7: Add site-aware rules UI logic to popup.ts**

Open `extension/src/popup.ts`. Add imports at top:

```typescript
import { defaultMode } from "./detection-rules";
import type { SiteMode } from "./detection-rules";
```

Add the site rules UI logic inside `init()`, after the AI mode toggle block:

```typescript
  // ── Site detection rules ───────────────────────────────────────────────────
  const hostnameEl = document.getElementById("site-hostname") as HTMLElement;
  const siteBtns = [
    document.getElementById("site-aggressive") as HTMLButtonElement,
    document.getElementById("site-selection") as HTMLButtonElement,
    document.getElementById("site-off") as HTMLButtonElement,
  ];
  const siteModes: SiteMode[] = ["aggressive", "selection", "off"];

  function renderSiteMode(mode: SiteMode): void {
    const idx = siteModes.indexOf(mode);
    siteBtns.forEach((b, i) => b.classList.toggle("active", i === idx));
  }

  async function saveSiteMode(hostname: string, mode: SiteMode): Promise<void> {
    const result = await chrome.storage.sync.get("siteRules");
    const rules = (result.siteRules ?? {}) as Record<string, SiteMode>;
    rules[hostname] = mode;
    await chrome.storage.sync.set({ siteRules: rules });
    renderSiteMode(mode);
  }

  async function loadSiteRule(): Promise<void> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    let hostname: string;
    try { hostname = new URL(tab.url).hostname; } catch { return; }
    hostnameEl.textContent = hostname;
    const result = await chrome.storage.sync.get("siteRules");
    const rules = (result.siteRules ?? {}) as Record<string, SiteMode>;
    const mode = rules[hostname] ?? defaultMode(hostname);
    renderSiteMode(mode);
    siteBtns.forEach((btn, i) => {
      btn.addEventListener("click", () => saveSiteMode(hostname, siteModes[i]));
    });
  }

  loadSiteRule();
```

- [ ] **Step 8: Build and verify**

```bash
cd extension && npm run build
```

Expected: no errors. Load the extension. Open the badge popup → SKILLS tab. Verify:
- Current tab's hostname is shown
- Mode buttons render correctly (Solscan/Birdeye/DexScreener show "Select" active by default, others show "All")
- Clicking a mode button updates the active state
- Navigate to Solscan. Verify that tokens are only detected on highlight, not on DOM mutations.
- Navigate to twitter.com. Verify tokens are detected on DOM mutations.

- [ ] **Step 9: Run all tests one final time**

```bash
cd extension && npm test
```

Expected: all tests in `src/__tests__/*.test.ts` pass.

- [ ] **Step 10: Commit**

```bash
cd extension && git add src/__tests__/detection-rules.test.ts src/detection-rules.ts src/content.ts popup.html src/popup.ts
git commit -m "feat: site-aware detection rules (aggressive/selection/off per domain)"
```

---

## Final Verification

- [ ] Load the unpacked extension from `extension/` in a fresh Chrome profile.
- [ ] On twitter.com: find a tweet with a token address → popup appears → narration mentions tweet author.
- [ ] On twitter.com TRADE tab: two adapters shown (Jupiter + Raydium), green star on best rate.
- [ ] Connect a wallet with token holdings → SKILLS tab shows portfolio values.
- [ ] Open SKILLS tab → set solscan.io to Off → navigate to Solscan → no popups trigger.
- [ ] Set solscan.io back to All → popups trigger on Solscan again.
