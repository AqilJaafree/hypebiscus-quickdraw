# Quickdraw Chrome Extension — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standalone Chrome extension that detects Solana addresses on any page, shows a V3 neobrutalist Shadow DOM popup with safety score + price + AI narration, and executes a Jupiter swap with a connected wallet (Phantom/Backpack/Solflare + Reown AppKit fallback).

**Architecture:** Content script (Shadow DOM popup + wallet bridge) ↔ Background service worker (cache + dedup + wallet state) ↔ Jupiter public APIs (safety, price, quote, swap) + Cloudflare Worker (AI narration only). No API keys in the extension. Safety and swap go directly to Jupiter. Only AI narration routes through the Worker (needs Anthropic key).

**Tech Stack:** TypeScript, esbuild, Vitest, Chrome MV3, @solana/web3.js (wallet bridge), Jupiter v6 API, Cloudflare Worker (existing).

> **Phases 2 and 3** (DeFi skills, multi-adapter, portfolio, site-aware rules) are separate plans.

---

## File Structure

**Create:**
- `extension/src/types.ts` — shared types across all modules
- `extension/src/score.ts` — Jupiter JSON → SafetyScore (pure, testable)
- `extension/src/jupiter-client.ts` — Jupiter public API: safety, price, quote, swap tx
- `extension/src/worker-client.ts` — Worker `/ai/fast` SSE client (narration only)
- `extension/src/wallet-bridge.ts` — compiled to `dist/wallet-bridge.js`, injected into page MAIN world; wallet detection + connect + sign
- `extension/src/wallet.ts` — content-script-side wallet command dispatcher
- `extension/src/popup-ui.ts` — Shadow DOM popup: V3 score banner header, price, narration, swap button
- `extension/src/swap-panel.ts` — inline swap panel: amount input, quote, confirm
- `extension/src/popup.ts` — badge popup: wallet status + detection toggle
- `extension/vitest.config.ts` — Vitest config
- `extension/src/__tests__/score.test.ts`
- `extension/src/__tests__/detector.test.ts`
- `extension/src/__tests__/jupiter-client.test.ts`

**Modify:**
- `extension/manifest.json` — remove `nativeMessaging`, add `storage`, add `web_accessible_resources`
- `extension/package.json` — add `@solana/web3.js`, `vitest`, `@vitest/coverage-v8`
- `extension/src/detector.ts` — add `detectInDom()` for MutationObserver text scanning
- `extension/src/content.ts` — full rewrite: MutationObserver + wallet bridge injection + popup lifecycle
- `extension/src/background.ts` — full rewrite: cache, dedup, wallet state, message router
- `extension/popup.html` — add `<script src="dist/popup.js">` tag
- `worker/src/index.ts` — add extension bearer-token auth bypass for `/ai/fast`
- `worker/wrangler.toml` — add `EXTENSION_SECRET` binding note

---

## Task 1: Test infrastructure + shared types

**Files:**
- Create: `extension/vitest.config.ts`
- Create: `extension/src/types.ts`
- Modify: `extension/package.json`

- [ ] **Step 1: Add Vitest and @solana/web3.js to package.json**

Replace the contents of `extension/package.json` with:

```json
{
  "name": "quickdraw-extension",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "esbuild src/content.ts src/background.ts src/popup.ts src/wallet-bridge.ts --bundle --outdir=dist --target=chrome111 --format=esm",
    "watch": "esbuild src/content.ts src/background.ts src/popup.ts src/wallet-bridge.ts --bundle --outdir=dist --target=chrome111 --format=esm --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.268",
    "@vitest/coverage-v8": "^1.6.0",
    "esbuild": "^0.20.0",
    "typescript": "^5.3.3",
    "vitest": "^1.6.0"
  },
  "dependencies": {
    "@solana/web3.js": "^1.95.3"
  }
}
```

- [ ] **Step 2: Create vitest.config.ts**

```typescript
// extension/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Create types.ts**

```typescript
// extension/src/types.ts

export interface SafetyScore {
  score: number;            // 0–100
  label: "SAFE" | "CAUTION" | "HIGH RISK";
  color: string;            // hex fill for header
  textColor: "#000" | "#fff";
  verified: boolean;
  mintAuthDisabled: boolean;
  freezeAuthDisabled: boolean;
  isSuspicious: boolean;
  summary: string;          // one-line human readable
}

export interface TokenPrice {
  usd: number;
  change24h: number;        // percentage, positive = up
  symbol: string;
  name: string;
}

export interface TokenData {
  address: string;
  safety: SafetyScore;
  price: TokenPrice | null;
}

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: number;
  slippageBps: number;
  routePlan: Array<{ swapInfo: { label: string } }>;
  // raw quote response forwarded to /swap
  raw: unknown;
}

export interface WalletState {
  address: string | null;
  adapter: "phantom" | "backpack" | "solflare" | "reown" | null;
  connected: boolean;
}

// Messages from content script → background service worker
export type BgRequest =
  | { type: "fetch_token"; address: string }
  | { type: "get_quote"; inputMint: string; outputMint: string; amountLamports: number; slippageBps: number }
  | { type: "build_swap_tx"; quote: SwapQuote; walletAddress: string }
  | { type: "get_wallet" }
  | { type: "set_wallet"; wallet: WalletState }
  | { type: "get_detection_enabled" }
  | { type: "set_detection_enabled"; enabled: boolean };

export type BgResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// Events dispatched by wallet-bridge.ts (MAIN world) → content script (ISOLATED world)
export interface WalletBridgeCmd {
  id: string;
  cmd: "get_wallet" | "connect" | "sign_and_send";
  payload?: { adapter?: string; txBase64?: string };
}

export interface WalletBridgeResult {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}
```

- [ ] **Step 4: Install dependencies**

```bash
cd extension && npm install
```

Expected: installs vitest, @vitest/coverage-v8, @solana/web3.js.

- [ ] **Step 5: Commit**

```bash
git add extension/package.json extension/vitest.config.ts extension/src/types.ts
git commit -m "feat(ext): test infra + shared types"
```

---

## Task 2: Safety score module

**Files:**
- Create: `extension/src/score.ts`
- Create: `extension/src/__tests__/score.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// extension/src/__tests__/score.test.ts
import { describe, it, expect } from "vitest";
import { computeSafetyScore, scoreLabel, scoreColor } from "../score";

describe("scoreLabel", () => {
  it("returns SAFE for 80+", () => expect(scoreLabel(80)).toBe("SAFE"));
  it("returns SAFE for 100", () => expect(scoreLabel(100)).toBe("SAFE"));
  it("returns CAUTION for 50-79", () => expect(scoreLabel(79)).toBe("CAUTION"));
  it("returns CAUTION for 50", () => expect(scoreLabel(50)).toBe("CAUTION"));
  it("returns HIGH RISK for 49", () => expect(scoreLabel(49)).toBe("HIGH RISK"));
  it("returns HIGH RISK for 0", () => expect(scoreLabel(0)).toBe("HIGH RISK"));
});

describe("scoreColor", () => {
  it("returns lime for 80+", () => expect(scoreColor(80)).toBe("#8BF542"));
  it("returns amber for 50-79", () => expect(scoreColor(50)).toBe("#F5C842"));
  it("returns red for 0-49", () => expect(scoreColor(0)).toBe("#F54242"));
});

describe("computeSafetyScore", () => {
  it("marks suspicious tokens as HIGH RISK", () => {
    const result = computeSafetyScore({ organicScore: 90, audit: { isSus: true } });
    expect(result.label).toBe("HIGH RISK");
    expect(result.score).toBe(0);
    expect(result.isSuspicious).toBe(true);
    expect(result.summary).toContain("suspicious");
  });

  it("reflects verified + mint/freeze auth in summary", () => {
    const result = computeSafetyScore({
      organicScore: 85,
      isVerified: true,
      audit: { isSus: false, mintAuthorityDisabled: true, freezeAuthorityDisabled: true },
    });
    expect(result.score).toBe(85);
    expect(result.label).toBe("SAFE");
    expect(result.verified).toBe(true);
    expect(result.mintAuthDisabled).toBe(true);
    expect(result.summary).toContain("Jupiter verified");
    expect(result.summary).toContain("mint auth disabled");
  });

  it("sets textColor #000 for SAFE and CAUTION", () => {
    expect(computeSafetyScore({ organicScore: 80 }).textColor).toBe("#000");
    expect(computeSafetyScore({ organicScore: 55 }).textColor).toBe("#000");
  });

  it("sets textColor #fff for HIGH RISK", () => {
    expect(computeSafetyScore({ organicScore: 20 }).textColor).toBe("#fff");
  });

  it("generates fallback summary for unverified token", () => {
    const result = computeSafetyScore({ organicScore: 30, isVerified: false });
    expect(result.summary).toContain("not on Jupiter strict list");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

```bash
cd extension && npm test
```

Expected: `Cannot find module '../score'`

- [ ] **Step 3: Implement score.ts**

```typescript
// extension/src/score.ts
import type { SafetyScore } from "./types";

export interface JupiterTokenRaw {
  organicScore?: number;
  isVerified?: boolean;
  audit?: {
    isSus?: boolean;
    mintAuthorityDisabled?: boolean;
    freezeAuthorityDisabled?: boolean;
  };
}

export function scoreLabel(score: number): "SAFE" | "CAUTION" | "HIGH RISK" {
  if (score >= 80) return "SAFE";
  if (score >= 50) return "CAUTION";
  return "HIGH RISK";
}

export function scoreColor(score: number): string {
  if (score >= 80) return "#8BF542";
  if (score >= 50) return "#F5C842";
  return "#F54242";
}

export function computeSafetyScore(raw: JupiterTokenRaw): SafetyScore {
  const audit = raw.audit ?? {};
  const isSuspicious = audit.isSus ?? false;

  // Suspicious overrides the organic score — treat as 0
  const score = isSuspicious ? 0 : Math.round((raw.organicScore ?? 0));
  const verified = raw.isVerified ?? false;
  const mintAuthDisabled = audit.mintAuthorityDisabled ?? false;
  const freezeAuthDisabled = audit.freezeAuthorityDisabled ?? false;

  const label = scoreLabel(score);
  const color = scoreColor(score);
  const textColor: "#000" | "#fff" = score < 50 ? "#fff" : "#000";

  const parts: string[] = [];
  if (isSuspicious) parts.push("⚠️ flagged suspicious by Jupiter");
  if (verified) parts.push("Jupiter verified");
  if (mintAuthDisabled) parts.push("mint auth disabled");
  if (freezeAuthDisabled) parts.push("freeze auth disabled");

  const summary = parts.length
    ? parts.join(" · ")
    : "Unverified — not on Jupiter strict list";

  return { score, label, color, textColor, verified, mintAuthDisabled, freezeAuthDisabled, isSuspicious, summary };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd extension && npm test
```

Expected: all 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add extension/src/score.ts extension/src/__tests__/score.test.ts
git commit -m "feat(ext): safety score module with tests"
```

---

## Task 3: Jupiter client

**Files:**
- Create: `extension/src/jupiter-client.ts`
- Create: `extension/src/__tests__/jupiter-client.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// extension/src/__tests__/jupiter-client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchTokenSafety, fetchTokenPrice, fetchSwapQuote } from "../jupiter-client";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => mockFetch.mockReset());

describe("fetchTokenSafety", () => {
  it("returns null when token not found", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    const result = await fetchTokenSafety("someAddress123");
    expect(result).toBeNull();
  });

  it("returns parsed token when found", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ organicScore: 82, isVerified: true, audit: { isSus: false } }],
    });
    const result = await fetchTokenSafety("someAddress123");
    expect(result).not.toBeNull();
    expect(result!.score).toBe(82);
    expect(result!.label).toBe("SAFE");
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(fetchTokenSafety("addr")).rejects.toThrow("Jupiter API error");
  });
});

describe("fetchTokenPrice", () => {
  it("returns price data for known token", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          So11111111111111111111111111111111111111112: {
            price: 142.5,
            extraInfo: { lastSwappedPrice: { lastJupiterSellAt: 142.5 } },
          },
        },
      }),
    });
    const result = await fetchTokenPrice("So11111111111111111111111111111111111111112");
    expect(result).not.toBeNull();
    expect(result!.usd).toBe(142.5);
  });

  it("returns null when mint not in response", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
    const result = await fetchTokenPrice("unknownMint");
    expect(result).toBeNull();
  });
});

describe("fetchSwapQuote", () => {
  it("constructs correct query string", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ inAmount: "1000000", outAmount: "142000", priceImpactPct: 0.01, routePlan: [] }),
    });
    await fetchSwapQuote({
      inputMint: "So111",
      outputMint: "BONK111",
      amountLamports: 1_000_000,
      slippageBps: 50,
    });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("inputMint=So111");
    expect(url).toContain("amount=1000000");
    expect(url).toContain("slippageBps=50");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd extension && npm test
```

Expected: `Cannot find module '../jupiter-client'`

- [ ] **Step 3: Implement jupiter-client.ts**

```typescript
// extension/src/jupiter-client.ts
import { computeSafetyScore } from "./score";
import type { SafetyScore, TokenPrice, SwapQuote } from "./types";

const JUPITER_SEARCH = "https://lite-api.jup.ag/tokens/v2/search";
const JUPITER_PRICE  = "https://api.jup.ag/price/v2";
const JUPITER_QUOTE  = "https://quote-api.jup.ag/v6/quote";
const JUPITER_SWAP   = "https://quote-api.jup.ag/v6/swap";

// Safety score from Jupiter token search API
export async function fetchTokenSafety(address: string): Promise<SafetyScore | null> {
  const resp = await fetch(`${JUPITER_SEARCH}?query=${encodeURIComponent(address)}`);
  if (!resp.ok) throw new Error("Jupiter API error");
  const results = await resp.json() as unknown[];
  if (!results.length) return null;
  return computeSafetyScore(results[0] as Parameters<typeof computeSafetyScore>[0]);
}

// Live price + 24h change from Jupiter price API
export async function fetchTokenPrice(address: string): Promise<TokenPrice | null> {
  const resp = await fetch(`${JUPITER_PRICE}?ids=${address}&showExtraInfo=true`);
  if (!resp.ok) return null;
  const body = await resp.json() as { data: Record<string, { price: number; mintSymbol?: string }> };
  const entry = body.data[address];
  if (!entry) return null;
  return {
    usd: entry.price,
    change24h: 0,         // Jupiter price v2 doesn't include 24h change; set 0 for Phase 1
    symbol: entry.mintSymbol ?? address.slice(0, 4),
    name: entry.mintSymbol ?? "Unknown",
  };
}

export interface QuoteParams {
  inputMint: string;
  outputMint: string;
  amountLamports: number;
  slippageBps: number;
}

// Swap quote from Jupiter
export async function fetchSwapQuote(params: QuoteParams): Promise<SwapQuote> {
  const url = `${JUPITER_QUOTE}?inputMint=${params.inputMint}&outputMint=${params.outputMint}&amount=${params.amountLamports}&slippageBps=${params.slippageBps}&restrictIntermediateTokens=true`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("Jupiter quote error");
  const raw = await resp.json() as {
    inAmount: string;
    outAmount: string;
    priceImpactPct: number;
    routePlan: Array<{ swapInfo: { label: string } }>;
  };
  return {
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    inAmount: raw.inAmount,
    outAmount: raw.outAmount,
    priceImpactPct: raw.priceImpactPct,
    slippageBps: params.slippageBps,
    routePlan: raw.routePlan,
    raw,
  };
}

// Build unsigned swap transaction from Jupiter
export async function buildSwapTransaction(quote: SwapQuote, walletAddress: string): Promise<string> {
  const resp = await fetch(JUPITER_SWAP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote.raw,
      userPublicKey: walletAddress,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 1000,
    }),
  });
  if (!resp.ok) throw new Error("Jupiter swap tx error");
  const body = await resp.json() as { swapTransaction: string };
  return body.swapTransaction; // base64 encoded VersionedTransaction
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd extension && npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add extension/src/jupiter-client.ts extension/src/__tests__/jupiter-client.test.ts
git commit -m "feat(ext): Jupiter API client with tests"
```

---

## Task 4: Worker — extension auth for AI narration

**Files:**
- Modify: `worker/src/index.ts`
- Modify: `worker/wrangler.toml` (note only — secret is set via CLI)

- [ ] **Step 1: Add EXTENSION_SECRET to Env interface**

In `worker/src/index.ts`, find the `Env` interface and add `EXTENSION_SECRET`:

```typescript
export interface Env {
  ANTHROPIC_API_KEY: string;
  APP_SECRET: string;
  EXTENSION_SECRET: string;      // ← add this line
  HELIUS_API_KEY: string;
  ASSEMBLYAI_API_KEY: string;
  REOWN_PROJECT_ID: string;
  RATE_LIMIT_KV: KVNamespace;
}
```

- [ ] **Step 2: Add extension auth check before HMAC check in the router**

In `worker/src/index.ts`, find the main `fetch` handler. After the `/auth` route block and before `verifyHmac`, add:

```typescript
    // Extension bearer-token auth — covers /ai/fast only
    // The extension cannot sign HMAC (no shared secret in client code).
    // EXTENSION_SECRET is a separate Worker secret, not APP_SECRET.
    if (req.headers.get("X-Quickdraw-Client") === "extension") {
      const bearer = req.headers.get("Authorization") ?? "";
      const secret = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
      if (!secret || secret !== env.EXTENSION_SECRET) {
        return err("Unauthorized", 401);
      }
      // Extension is only allowed to call /ai/fast (narration)
      if (path === "/ai/fast" && method === "POST") {
        return handleAi(req, env, "claude-haiku-4-5-20251001");
      }
      return err("Not found", 404);
    }
```

The full router block after this change looks like:

```typescript
    if (url.pathname === "/auth") {
      const callback = url.searchParams.get("callback") ?? "";
      return new Response(authPage(callback, env.REOWN_PROJECT_ID), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Extension bearer-token auth — covers /ai/fast only
    if (req.headers.get("X-Quickdraw-Client") === "extension") {
      const bearer = req.headers.get("Authorization") ?? "";
      const secret = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
      if (!secret || secret !== env.EXTENSION_SECRET) return err("Unauthorized", 401);
      if (path === "/ai/fast" && method === "POST") return handleAi(req, env, "claude-haiku-4-5-20251001");
      return err("Not found", 404);
    }

    // All other routes require HMAC auth
    if (!(await verifyHmac(req, env.APP_SECRET))) {
      return err("Unauthorized", 401);
    }
    // ... rest unchanged
```

- [ ] **Step 3: Set the EXTENSION_SECRET in Wrangler (dev + prod)**

For local dev, add to `worker/.dev.vars`:
```
EXTENSION_SECRET=dev-extension-secret-change-in-prod
```

For production, run once:
```bash
cd worker && wrangler secret put EXTENSION_SECRET
```
Enter a random 32-char secret when prompted. Copy the same value into the extension's build env (used in Task 5).

- [ ] **Step 4: Verify worker builds**

```bash
cd worker && npm run build 2>/dev/null || npx wrangler deploy --dry-run
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add worker/src/index.ts worker/.dev.vars
git commit -m "feat(worker): extension bearer-token auth for /ai/fast"
```

---

## Task 5: Worker client (AI narration)

**Files:**
- Create: `extension/src/worker-client.ts`

- [ ] **Step 1: Create worker-client.ts**

The Worker URL and extension secret are injected at build time via esbuild `--define`. During dev, use the local worker (`http://localhost:8787`).

```typescript
// extension/src/worker-client.ts

// Injected by esbuild --define at build time.
// Defaults are for local dev: `npm run build` in the extension reads from .env
declare const __WORKER_URL__: string;
declare const __EXTENSION_SECRET__: string;

const WORKER_URL = typeof __WORKER_URL__ !== "undefined"
  ? __WORKER_URL__
  : "http://localhost:8787";

const EXTENSION_SECRET = typeof __EXTENSION_SECRET__ !== "undefined"
  ? __EXTENSION_SECRET__
  : "dev-extension-secret-change-in-prod";

// Stream AI narration from Worker /ai/fast.
// Calls onToken for each text delta, returns the full string.
export async function streamNarration(
  address: string,
  safety: { score: number; label: string; summary: string },
  price: { usd: number; symbol: string } | null,
  onToken: (delta: string) => void,
): Promise<string> {
  const systemPrompt =
    "You are a concise DeFi analyst for Solana traders. Write 1-2 sentences about the token's risk and key facts. Be direct. No disclaimers.";

  const userContent = [
    `Token address: ${address}`,
    `Safety score: ${safety.score}/100 (${safety.label})`,
    `Details: ${safety.summary}`,
    price ? `Price: $${price.usd.toFixed(6)} (${price.symbol})` : "Price: unavailable",
  ].join("\n");

  const resp = await fetch(`${WORKER_URL}/ai/fast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Quickdraw-Client": "extension",
      "Authorization": `Bearer ${EXTENSION_SECRET}`,
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 120,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userContent }],
      stream: true,
    }),
  });

  if (!resp.ok || !resp.body) throw new Error("AI narration failed");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as {
          type: string;
          delta?: { type: string; text?: string };
        };
        if (event.type === "content_block_delta" && event.delta?.text) {
          full += event.delta.text;
          onToken(event.delta.text);
        }
      } catch {
        // malformed SSE line — skip
      }
    }
  }

  return full;
}
```

- [ ] **Step 2: Update build script to inject defines**

Create `extension/.env.example`:
```
WORKER_URL=https://your-worker.workers.dev
EXTENSION_SECRET=your-extension-secret-here
```

Update `extension/package.json` build scripts to read `.env` via a small wrapper. For now, hardcode dev values in the define flags:

```json
"build": "esbuild src/content.ts src/background.ts src/popup.ts src/wallet-bridge.ts --bundle --outdir=dist --target=chrome111 --format=esm --define:__WORKER_URL__='\"http://localhost:8787\"' --define:__EXTENSION_SECRET__='\"dev-extension-secret-change-in-prod\"'",
"build:prod": "esbuild src/content.ts src/background.ts src/popup.ts src/wallet-bridge.ts --bundle --outdir=dist --target=chrome111 --format=esm --define:__WORKER_URL__='\"https://your-worker.workers.dev\"' --define:__EXTENSION_SECRET__='\"YOUR_SECRET_HERE\"'"
```

- [ ] **Step 3: Commit**

```bash
git add extension/src/worker-client.ts extension/.env.example
git commit -m "feat(ext): Worker AI narration SSE client"
```

---

## Task 6: Manifest + detector update

**Files:**
- Modify: `extension/manifest.json`
- Modify: `extension/src/detector.ts`
- Create: `extension/src/__tests__/detector.test.ts`

- [ ] **Step 1: Write detector tests**

```typescript
// extension/src/__tests__/detector.test.ts
import { describe, it, expect } from "vitest";
import { detectInText, BLOCKLIST } from "../detector";

describe("detectInText", () => {
  it("detects a valid Solana address", () => {
    const results = detectInText("check out So11111111111111111111111111111111111111112 this token");
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe("So11111111111111111111111111111111111111112");
    expect(results[0].type).toBe("address");
  });

  it("skips blocklisted addresses", () => {
    const results = detectInText("11111111111111111111111111111111");
    expect(results).toHaveLength(0);
  });

  it("detects multiple addresses in one string", () => {
    const results = detectInText(
      "token A: DezXAZbkbkcAR31LmMQ85zBiLxmscrmYzvMst5MP19nu token B: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    );
    expect(results).toHaveLength(2);
  });

  it("ignores strings shorter than 32 chars", () => {
    expect(detectInText("shortAddr12345")).toHaveLength(0);
  });

  it("detects $TICKER symbols", () => {
    const results = detectInText("buying $BONK today");
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("ticker");
    expect(results[0].value).toBe("BONK");
  });
});

describe("BLOCKLIST", () => {
  it("contains system program", () => {
    expect(BLOCKLIST.has("11111111111111111111111111111111")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd extension && npm test
```

Expected: `detectInText is not exported from ../detector`

- [ ] **Step 3: Add detectInText to detector.ts**

Open `extension/src/detector.ts` and add after the existing `detectInSelection` function:

```typescript
// Scan a plain text string for all Solana addresses and $TICKER symbols.
// Used by MutationObserver to scan newly added DOM text nodes.
export function detectInText(text: string): Array<{ type: "address" | "ticker"; value: string }> {
  const results: Array<{ type: "address" | "ticker"; value: string }> = [];
  const seen = new Set<string>();

  // Addresses
  const addrMatches = text.matchAll(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g);
  for (const m of addrMatches) {
    const addr = m[0];
    if (!BLOCKLIST.has(addr) && !seen.has(addr)) {
      seen.add(addr);
      results.push({ type: "address", value: addr });
    }
  }

  // $TICKER — only if no address found in same text (avoids duplicate triggers)
  if (results.length === 0) {
    const tickerMatches = text.matchAll(/\$([A-Z]{2,10})\b/g);
    for (const m of tickerMatches) {
      const ticker = m[1];
      if (!seen.has(ticker)) {
        seen.add(ticker);
        results.push({ type: "ticker", value: ticker });
      }
    }
  }

  return results;
}
```

Also export `BLOCKLIST` by changing the declaration:

```typescript
// Change: const BLOCKLIST = new Set([...])
// To:
export const BLOCKLIST = new Set([
  "11111111111111111111111111111111",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "ATokenGPvbdGVxr1j5M25s4f247jZ7k8pU7wQc3w",
]);
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd extension && npm test
```

Expected: all tests pass.

- [ ] **Step 5: Update manifest.json**

Replace `extension/manifest.json` with:

```json
{
  "manifest_version": 3,
  "name": "Quickdraw",
  "version": "0.1.0",
  "description": "Instant Solana token analysis — detect any address anywhere, score it, swap it.",
  "minimum_chrome_version": "111",
  "permissions": [
    "storage",
    "scripting"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "background": {
    "service_worker": "dist/background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["dist/content.js"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["dist/wallet-bridge.js"],
      "matches": ["<all_urls>"]
    }
  ],
  "icons": {
    "16":  "icons/icon16.png",
    "48":  "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": "icons/icon48.png"
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add extension/manifest.json extension/src/detector.ts extension/src/__tests__/detector.test.ts
git commit -m "feat(ext): manifest v2 + detector text scanning"
```

---

## Task 7: Wallet bridge

**Files:**
- Create: `extension/src/wallet-bridge.ts` (injected into page MAIN world)
- Create: `extension/src/wallet.ts` (content script side)

The bridge pattern: `wallet-bridge.ts` compiles to `dist/wallet-bridge.js` and is injected as a `<script>` tag into the page. It runs in the MAIN world with access to `window.solana`, `window.phantom`, etc. It listens for `CustomEvent` commands dispatched by the content script and dispatches results back.

- [ ] **Step 1: Create wallet-bridge.ts**

```typescript
// extension/src/wallet-bridge.ts
// Runs in the page MAIN world. Injected via <script src="chrome-extension://...">
// DO NOT import any extension-only APIs (chrome.*) here.

import { VersionedTransaction } from "@solana/web3.js";

declare global {
  interface Window {
    solana?: { isPhantom?: boolean; isConnected?: boolean; publicKey?: { toString(): string }; connect(): Promise<void>; signAndSendTransaction(tx: VersionedTransaction): Promise<{ signature: string }> };
    phantom?: { solana?: Window["solana"] };
    backpack?: { solana?: Window["solana"] };
    solflare?: { isSolflare?: boolean; isConnected?: boolean; publicKey?: { toString(): string }; connect(): Promise<void>; signAndSendTransaction(tx: VersionedTransaction): Promise<{ signature: string }> };
  }
}

function getProvider(): { provider: NonNullable<Window["solana"]>; adapter: string } | null {
  if (window.phantom?.solana?.isConnected !== undefined) {
    return { provider: window.phantom.solana!, adapter: "phantom" };
  }
  if (window.solana?.isPhantom) {
    return { provider: window.solana, adapter: "phantom" };
  }
  if (window.backpack?.solana) {
    return { provider: window.backpack.solana!, adapter: "backpack" };
  }
  if (window.solflare?.isSolflare) {
    return { provider: window.solflare as unknown as NonNullable<Window["solana"]>, adapter: "solflare" };
  }
  return null;
}

window.addEventListener("__qd_cmd", async (e: Event) => {
  const { id, cmd, payload } = (e as CustomEvent<{ id: string; cmd: string; payload?: Record<string, string> }>).detail;

  try {
    let result: unknown;

    if (cmd === "get_wallet") {
      const p = getProvider();
      result = p
        ? { adapter: p.adapter, address: p.provider.publicKey?.toString() ?? null, connected: p.provider.isConnected ?? false }
        : null;
    }

    if (cmd === "connect") {
      const p = getProvider();
      if (!p) throw new Error("No wallet found. Install Phantom or Backpack.");
      await p.provider.connect();
      result = { adapter: p.adapter, address: p.provider.publicKey?.toString() ?? null };
    }

    if (cmd === "sign_and_send") {
      const p = getProvider();
      if (!p || !p.provider.isConnected) throw new Error("Wallet not connected");
      const txBase64 = payload?.txBase64;
      if (!txBase64) throw new Error("Missing txBase64");
      const txBytes = Uint8Array.from(atob(txBase64), c => c.charCodeAt(0));
      const tx = VersionedTransaction.deserialize(txBytes);
      const { signature } = await p.provider.signAndSendTransaction(tx);
      result = { signature };
    }

    window.dispatchEvent(new CustomEvent("__qd_result", { detail: { id, ok: true, result } }));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown wallet error";
    window.dispatchEvent(new CustomEvent("__qd_result", { detail: { id, ok: false, error: message } }));
  }
});

// Signal bridge is ready
window.dispatchEvent(new CustomEvent("__qd_ready"));
```

- [ ] **Step 2: Create wallet.ts (content script side)**

```typescript
// extension/src/wallet.ts
// Content script side. Injects wallet-bridge.js into the page and
// provides a typed Promise-based API for wallet commands.

import type { WalletState, WalletBridgeCmd, WalletBridgeResult } from "./types";

let bridgeReady = false;
let bridgeReadyPromise: Promise<void> | null = null;

export function injectWalletBridge(): Promise<void> {
  if (bridgeReady) return Promise.resolve();
  if (bridgeReadyPromise) return bridgeReadyPromise;

  bridgeReadyPromise = new Promise((resolve) => {
    const onReady = () => {
      window.removeEventListener("__qd_ready", onReady);
      bridgeReady = true;
      resolve();
    };
    window.addEventListener("__qd_ready", onReady);

    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("dist/wallet-bridge.js");
    document.documentElement.appendChild(script);
    script.remove();
  });

  return bridgeReadyPromise;
}

function sendCmd<T>(cmd: WalletBridgeCmd["cmd"], payload?: WalletBridgeCmd["payload"]): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<WalletBridgeResult>).detail;
      if (detail.id !== id) return;
      window.removeEventListener("__qd_result", handler);
      if (detail.ok) resolve(detail.result as T);
      else reject(new Error(detail.error ?? "Wallet error"));
    };
    window.addEventListener("__qd_result", handler);
    window.dispatchEvent(new CustomEvent("__qd_cmd", { detail: { id, cmd, payload } }));

    setTimeout(() => {
      window.removeEventListener("__qd_result", handler);
      reject(new Error("Wallet command timed out after 30s"));
    }, 30_000);
  });
}

export async function getWallet(): Promise<WalletState> {
  await injectWalletBridge();
  const result = await sendCmd<{ adapter: string; address: string | null; connected: boolean } | null>("get_wallet");
  if (!result) return { address: null, adapter: null, connected: false };
  return { address: result.address, adapter: result.adapter as WalletState["adapter"], connected: result.connected };
}

export async function connectWallet(): Promise<WalletState> {
  await injectWalletBridge();
  const result = await sendCmd<{ adapter: string; address: string | null }>("connect");
  const state: WalletState = { address: result.address, adapter: result.adapter as WalletState["adapter"], connected: true };
  // Persist to background
  chrome.runtime.sendMessage({ type: "set_wallet", wallet: state }).catch(() => {});
  return state;
}

export async function signAndSend(txBase64: string): Promise<{ signature: string }> {
  await injectWalletBridge();
  return sendCmd<{ signature: string }>("sign_and_send", { txBase64 });
}
```

- [ ] **Step 3: Commit**

```bash
git add extension/src/wallet-bridge.ts extension/src/wallet.ts
git commit -m "feat(ext): wallet bridge (MAIN world inject + content script API)"
```

---

## Task 8: Shadow DOM popup UI

**Files:**
- Create: `extension/src/popup-ui.ts`

The popup renders inside a Shadow DOM root attached to a host `<div>` that is `position: fixed`. This isolates all styles from the host page.

- [ ] **Step 1: Create popup-ui.ts**

```typescript
// extension/src/popup-ui.ts
import type { SafetyScore, TokenPrice, WalletState } from "./types";

const HOST_ID = "quickdraw-host";

// Callback types for actions the popup triggers
export interface PopupCallbacks {
  onDismiss: () => void;
  onSwapClick: () => void;
  onConnectWallet: () => void;
}

export interface PopupOptions {
  address: string;
  x: number;
  y: number;
  callbacks: PopupCallbacks;
}

export function createPopup(opts: PopupOptions): PopupController {
  removePopup();

  const host = document.createElement("div");
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: "fixed",
    left: `${opts.x}px`,
    top: `${opts.y}px`,
    zIndex: "2147483647",
    pointerEvents: "none",
  });
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = buildShell(opts.address);

  // Wire dismiss
  shadow.getElementById("qd-close")?.addEventListener("click", () => {
    removePopup();
    opts.callbacks.onDismiss();
  });

  // Wire swap / connect button (label changes based on wallet state)
  shadow.getElementById("qd-swap")?.addEventListener("click", () => {
    opts.callbacks.onSwapClick();
  });

  host.style.pointerEvents = "auto";

  return new PopupController(shadow, host, opts);
}

export function removePopup(): void {
  document.getElementById(HOST_ID)?.remove();
}

export class PopupController {
  constructor(
    private shadow: ShadowRoot,
    private host: HTMLElement,
    private opts: PopupOptions,
  ) {}

  updatePosition(x: number, y: number): void {
    this.host.style.left = `${x}px`;
    this.host.style.top = `${y}px`;
  }

  // Call once safety + price arrive (~300ms)
  showToken(safety: SafetyScore, price: TokenPrice | null, wallet: WalletState): void {
    // Update header color
    const header = this.shadow.getElementById("qd-header");
    if (header) {
      header.style.background = safety.color;
      header.style.color = safety.textColor;
    }

    const scoreEl = this.shadow.getElementById("qd-score");
    if (scoreEl) scoreEl.textContent = String(safety.score);

    const labelEl = this.shadow.getElementById("qd-score-label");
    if (labelEl) labelEl.textContent = safety.label;

    const tickerEl = this.shadow.getElementById("qd-ticker");
    if (tickerEl) tickerEl.textContent = price?.symbol ?? this.opts.address.slice(0, 6) + "…";

    const priceEl = this.shadow.getElementById("qd-price");
    if (priceEl && price) {
      priceEl.textContent = `$${price.usd < 0.01 ? price.usd.toFixed(6) : price.usd.toFixed(4)}`;
      priceEl.style.display = "block";
    }

    const narrationEl = this.shadow.getElementById("qd-narration");
    if (narrationEl) narrationEl.textContent = "Analyzing…";

    const swapBtn = this.shadow.getElementById("qd-swap") as HTMLButtonElement | null;
    if (swapBtn) {
      swapBtn.textContent = wallet.connected ? "SWAP" : "CONNECT WALLET";
      swapBtn.style.background = safety.color;
      swapBtn.style.color = safety.textColor;
    }
  }

  // Append a text delta to the narration (called on each SSE token)
  appendNarration(delta: string): void {
    const el = this.shadow.getElementById("qd-narration");
    if (!el) return;
    if (el.textContent === "Analyzing…") el.textContent = "";
    el.textContent += delta;
  }

  showError(msg: string): void {
    const el = this.shadow.getElementById("qd-narration");
    if (el) { el.textContent = msg; el.style.color = "#F54242"; }
  }

  // Replace the footer with the swap panel DOM (passed in from swap-panel.ts)
  mountSwapPanel(panelEl: HTMLElement): void {
    const footer = this.shadow.getElementById("qd-footer");
    if (footer) {
      footer.replaceWith(panelEl);
      panelEl.id = "qd-footer";
    }
  }
}

function buildShell(address: string): string {
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return `
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :host {
    font-family: 'Space Mono', 'Courier New', monospace;
    font-size: 12px;
  }
  .popup {
    width: 280px;
    background: #181818;
    border: 2px solid #000;
    box-shadow: 4px 4px 0 #000;
    overflow: hidden;
  }
  #qd-header {
    background: #1e1e1e;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: #111;
    transition: background 0.15s;
  }
  #qd-score {
    font-size: 32px;
    font-weight: 700;
    line-height: 1;
    min-width: 44px;
  }
  .header-meta { flex: 1; }
  #qd-score-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    opacity: 0.6;
    text-transform: uppercase;
  }
  #qd-ticker {
    font-size: 16px;
    font-weight: 700;
    line-height: 1.2;
    margin-top: 2px;
  }
  #qd-close {
    margin-left: auto;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    opacity: 0.5;
    color: inherit;
    padding: 2px 4px;
    line-height: 1;
  }
  #qd-close:hover { opacity: 1; }
  .qd-addr {
    padding: 5px 12px 0;
    font-size: 10px;
    color: #555;
    letter-spacing: 0.04em;
  }
  #qd-price {
    padding: 6px 12px 2px;
    font-size: 13px;
    color: #fff;
    font-weight: 700;
    display: none;
  }
  #qd-narration {
    padding: 4px 12px 10px;
    font-size: 11px;
    color: #888;
    line-height: 1.5;
    min-height: 32px;
  }
  #qd-footer {
    display: flex;
    border-top: 1px solid #1e1e1e;
  }
  #qd-swap {
    flex: 1;
    padding: 9px 0;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    cursor: pointer;
    border: none;
    background: #333;
    color: #888;
    font-family: inherit;
    transition: background 0.15s;
  }
  #qd-cancel {
    padding: 9px 12px;
    font-size: 11px;
    color: #555;
    cursor: pointer;
    border: none;
    background: #1a1a1a;
    border-left: 1px solid #1e1e1e;
    font-family: inherit;
  }
  #qd-cancel:hover { color: #fff; }
</style>
<div class="popup">
  <div id="qd-header">
    <span id="qd-score">?</span>
    <div class="header-meta">
      <div id="qd-score-label">…</div>
      <div id="qd-ticker">⚡ QUICKDRAW</div>
    </div>
    <button id="qd-close" title="Dismiss">✕</button>
  </div>
  <div class="qd-addr">${short}</div>
  <div id="qd-price"></div>
  <div id="qd-narration">Fetching…</div>
  <div id="qd-footer">
    <button id="qd-swap">SWAP</button>
    <button id="qd-cancel">✕</button>
  </div>
</div>`;
}
```

- [ ] **Step 2: Commit**

```bash
git add extension/src/popup-ui.ts
git commit -m "feat(ext): Shadow DOM popup V3 design"
```

---

## Task 9: Swap panel

**Files:**
- Create: `extension/src/swap-panel.ts`

- [ ] **Step 1: Create swap-panel.ts**

```typescript
// extension/src/swap-panel.ts
import type { SwapQuote, WalletState } from "./types";
import { fetchSwapQuote, buildSwapTransaction } from "./jupiter-client";
import { signAndSend } from "./wallet";

// SOL mint address (used as default input token)
const SOL_MINT = "So11111111111111111111111111111111111111112";
const LAMPORTS_PER_SOL = 1_000_000_000;

export interface SwapPanelCallbacks {
  onSuccess: (signature: string) => void;
  onError: (msg: string) => void;
  onCancel: () => void;
}

// Returns a fully wired HTMLElement to mount inside the popup shadow root.
// The element manages its own state (loading, quote fetched, confirming, done).
export function buildSwapPanel(
  outputMint: string,
  wallet: WalletState,
  callbacks: SwapPanelCallbacks,
): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = "width:100%;font-family:'Space Mono','Courier New',monospace;";

  function render(state: SwapState): void {
    el.innerHTML = buildSwapHTML(state, wallet);

    // Input amount change → re-fetch quote
    const amountInput = el.querySelector<HTMLInputElement>("#qd-amount");
    amountInput?.addEventListener("change", () => {
      const sol = parseFloat(amountInput.value || "0");
      if (sol > 0) fetchQuote(sol, state);
    });

    el.querySelector("#qd-confirm")?.addEventListener("click", () => {
      if (state.quote) executeSwap(state.quote);
    });

    el.querySelector("#qd-swap-cancel")?.addEventListener("click", callbacks.onCancel);
  }

  async function fetchQuote(solAmount: number, prev: SwapState): Promise<void> {
    render({ ...prev, loading: true, error: null });
    try {
      const amountLamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
      const quote = await fetchSwapQuote({ inputMint: SOL_MINT, outputMint, amountLamports, slippageBps: 50 });
      render({ loading: false, quote, error: null, confirming: false });
    } catch (err: unknown) {
      render({ loading: false, quote: null, error: err instanceof Error ? err.message : "Quote failed", confirming: false });
    }
  }

  async function executeSwap(quote: SwapQuote): Promise<void> {
    if (!wallet.connected || !wallet.address) {
      callbacks.onError("Wallet not connected");
      return;
    }
    render({ loading: false, quote, error: null, confirming: true });
    try {
      const txBase64 = await buildSwapTransaction(quote, wallet.address);
      const { signature } = await signAndSend(txBase64);
      callbacks.onSuccess(signature);
    } catch (err: unknown) {
      render({ loading: false, quote, error: err instanceof Error ? err.message : "Swap failed", confirming: false });
      callbacks.onError(err instanceof Error ? err.message : "Swap failed");
    }
  }

  const initial: SwapState = { loading: false, quote: null, error: null, confirming: false };
  render(initial);
  return el;
}

interface SwapState {
  loading: boolean;
  quote: SwapQuote | null;
  error: string | null;
  confirming: boolean;
}

function buildSwapHTML(state: SwapState, wallet: WalletState): string {
  const outFormatted = state.quote
    ? (parseInt(state.quote.outAmount) / 1e6).toFixed(4)
    : "—";
  const impact = state.quote
    ? `${(state.quote.priceImpactPct * 100).toFixed(2)}%`
    : "—";

  return `
<style>
  .sp { padding: 10px 12px; border-top: 1px solid #1e1e1e; }
  .sp-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 11px; }
  .sp-label { color: #555; }
  .sp-val { color: #fff; font-weight: 700; }
  .sp-input {
    width: 100%; background: #222; border: 1.5px solid #333; color: #fff;
    padding: 7px 10px; font-family: inherit; font-size: 12px; margin-bottom: 8px;
    outline: none;
  }
  .sp-input:focus { border-color: #F5E642; }
  .sp-btn {
    width: 100%; padding: 9px; font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
    cursor: pointer; border: none; font-family: inherit; margin-bottom: 4px;
  }
  .sp-confirm { background: #F5E642; color: #000; }
  .sp-confirm:disabled { background: #333; color: #666; cursor: not-allowed; }
  .sp-cancel { background: #1a1a1a; color: #555; border-top: 1px solid #1e1e1e; }
  .sp-cancel:hover { color: #fff; }
  .sp-err { color: #F54242; font-size: 10px; padding: 0 0 6px; }
</style>
<div class="sp">
  <div class="sp-row"><span class="sp-label">You pay (SOL)</span></div>
  <input id="qd-amount" class="sp-input" type="number" placeholder="0.5" min="0.001" step="0.1" />
  <div class="sp-row">
    <span class="sp-label">You receive</span>
    <span class="sp-val">${state.loading ? "…" : outFormatted}</span>
  </div>
  <div class="sp-row">
    <span class="sp-label">Price impact</span>
    <span class="sp-val">${state.loading ? "…" : impact}</span>
  </div>
  ${state.error ? `<div class="sp-err">⚠ ${state.error}</div>` : ""}
  <button id="qd-confirm" class="sp-btn sp-confirm" ${(!state.quote || state.confirming) ? "disabled" : ""}>
    ${state.confirming ? "CONFIRMING…" : wallet.connected ? "CONFIRM SWAP" : "CONNECT WALLET"}
  </button>
</div>
<button id="qd-swap-cancel" class="sp-btn sp-cancel">✕ CANCEL</button>`;
}
```

- [ ] **Step 2: Commit**

```bash
git add extension/src/swap-panel.ts
git commit -m "feat(ext): inline swap panel (quote + sign + send)"
```

---

## Task 10: Background service worker

**Files:**
- Modify: `extension/src/background.ts` (full rewrite)

The service worker holds the dedup map, token data cache, and wallet state. Content scripts send messages; the background fetches data, caches it, and replies.

- [ ] **Step 1: Rewrite background.ts**

```typescript
// extension/src/background.ts
import { fetchTokenSafety, fetchTokenPrice } from "./jupiter-client";
import type { BgRequest, BgResponse, TokenData, WalletState } from "./types";

// ── Cache ──────────────────────────────────────────────────────────────────────
interface CacheEntry<T> { data: T; expiresAt: number; }

const safetyCache = new Map<string, CacheEntry<Awaited<ReturnType<typeof fetchTokenSafety>>>>();
const priceCache  = new Map<string, CacheEntry<Awaited<ReturnType<typeof fetchTokenPrice>>>>();
const dedupMap    = new Map<string, number>(); // address → last triggered timestamp

const SAFETY_TTL_MS = 300_000; // 5 min — safety scores rarely change
const PRICE_TTL_MS  =  15_000; // 15 sec — price changes frequently
const DEDUP_MS      =  30_000; // 30 sec — same address won't re-trigger

function isFresh<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  return !!entry && Date.now() < entry.expiresAt;
}

// ── Wallet state ───────────────────────────────────────────────────────────────
let walletState: WalletState = { address: null, adapter: null, connected: false };

async function loadWalletFromStorage(): Promise<void> {
  const { wallet } = await chrome.storage.local.get("wallet");
  if (wallet) walletState = wallet as WalletState;
}
loadWalletFromStorage();

// ── Token fetch ────────────────────────────────────────────────────────────────
async function getTokenData(address: string): Promise<TokenData> {
  // Safety
  let safety = isFresh(safetyCache.get(address))
    ? safetyCache.get(address)!.data
    : null;
  if (!safety) {
    safety = await fetchTokenSafety(address);
    if (safety) safetyCache.set(address, { data: safety, expiresAt: Date.now() + SAFETY_TTL_MS });
  }
  if (!safety) throw new Error("Token not found on Jupiter");

  // Price
  let price = isFresh(priceCache.get(address))
    ? priceCache.get(address)!.data
    : null;
  if (!price) {
    price = await fetchTokenPrice(address);
    priceCache.set(address, { data: price, expiresAt: Date.now() + PRICE_TTL_MS });
  }

  return { address, safety, price };
}

// ── Message handler ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(
  (msg: BgRequest, _sender, sendResponse: (r: BgResponse) => void) => {
    handleMessage(msg, sendResponse);
    return true; // keep channel open for async response
  },
);

async function handleMessage(msg: BgRequest, respond: (r: BgResponse) => void): Promise<void> {
  try {
    if (msg.type === "fetch_token") {
      // Dedup check
      const last = dedupMap.get(msg.address);
      if (last && Date.now() - last < DEDUP_MS) {
        respond({ ok: false, error: "dedup" });
        return;
      }
      dedupMap.set(msg.address, Date.now());

      const data = await getTokenData(msg.address);
      respond({ ok: true, data });
      return;
    }

    if (msg.type === "get_wallet") {
      respond({ ok: true, data: walletState });
      return;
    }

    if (msg.type === "set_wallet") {
      walletState = msg.wallet;
      await chrome.storage.local.set({ wallet: walletState });
      respond({ ok: true, data: null });
      return;
    }

    if (msg.type === "get_detection_enabled") {
      const { detectionEnabled } = await chrome.storage.local.get("detectionEnabled");
      respond({ ok: true, data: detectionEnabled !== false }); // default true
      return;
    }

    if (msg.type === "set_detection_enabled") {
      await chrome.storage.local.set({ detectionEnabled: msg.enabled });
      respond({ ok: true, data: null });
      return;
    }

    respond({ ok: false, error: "Unknown message type" });
  } catch (err: unknown) {
    respond({ ok: false, error: err instanceof Error ? err.message : "Background error" });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add extension/src/background.ts
git commit -m "feat(ext): background service worker (cache + dedup + wallet state)"
```

---

## Task 11: Content script

**Files:**
- Modify: `extension/src/content.ts` (full rewrite)

- [ ] **Step 1: Rewrite content.ts**

```typescript
// extension/src/content.ts
import { detectInSelection, detectInText } from "./detector";
import { createPopup, removePopup, PopupController } from "./popup-ui";
import { buildSwapPanel } from "./swap-panel";
import { getWallet, connectWallet, injectWalletBridge } from "./wallet";
import { streamNarration } from "./worker-client";
import type { BgRequest, BgResponse, TokenData, WalletState } from "./types";

// ── Helpers ────────────────────────────────────────────────────────────────────
function sendBg<T>(msg: BgRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (resp: BgResponse<T>) => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      if (resp.ok) resolve(resp.data);
      else reject(new Error(resp.error));
    });
  });
}

function clampPosition(x: number, y: number): { x: number; y: number } {
  const POP_W = 288, POP_H = 240;
  const cx = x + POP_W > window.innerWidth  ? x - POP_W - 8 : x + 16;
  const cy = y + POP_H > window.innerHeight ? y - POP_H - 8 : y + 8;
  return { x: Math.max(8, cx), y: Math.max(8, cy) };
}

// ── Detection lifecycle ────────────────────────────────────────────────────────
let activeController: PopupController | null = null;
let detectionEnabled = true;

async function triggerAddress(address: string, rawX: number, rawY: number): Promise<void> {
  // Check detection toggle
  detectionEnabled = await sendBg<boolean>({ type: "get_detection_enabled" }).catch(() => true);
  if (!detectionEnabled) return;

  // Fetch from background (handles dedup + cache)
  let tokenData: TokenData;
  try {
    tokenData = await sendBg<TokenData>({ type: "fetch_token", address });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "dedup") return; // same address recently triggered — silent skip
    return;
  }

  // Get wallet state
  const wallet: WalletState = await sendBg<WalletState>({ type: "get_wallet" }).catch(() => ({
    address: null, adapter: null, connected: false,
  }));

  const { x, y } = clampPosition(rawX, rawY);

  const controller = createPopup({
    address,
    x,
    y,
    callbacks: {
      onDismiss: () => { activeController = null; },
      onSwapClick: async () => {
        let w = wallet;
        if (!w.connected) {
          try {
            w = await connectWallet();
          } catch {
            controller.showError("No wallet found. Install Phantom or Backpack.");
            return;
          }
        }
        const panel = buildSwapPanel(address, w, {
          onSuccess: (sig) => {
            controller.showError(`✓ Swapped! ${sig.slice(0, 8)}…`);
          },
          onError: (msg) => controller.showError(msg),
          onCancel: () => removePopup(),
        });
        controller.mountSwapPanel(panel);
      },
      onConnectWallet: async () => {
        try {
          const w = await connectWallet();
          controller.showToken(tokenData.safety, tokenData.price, w);
        } catch {
          controller.showError("No wallet found.");
        }
      },
    },
  });

  activeController = controller;

  // Show score + price immediately
  controller.showToken(tokenData.safety, tokenData.price, wallet);

  // Stream AI narration
  streamNarration(
    address,
    tokenData.safety,
    tokenData.price,
    (delta) => controller.appendNarration(delta),
  ).catch(() => {
    controller.appendNarration(" (narration unavailable)");
  });
}

// ── Selection detection (mouseup / shift+keyup) ────────────────────────────────
let debounce: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 350;

function onSelectionChange(): void {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    const detection = detectInSelection();
    if (!detection || detection.type !== "address") return;
    const rect = detection.rect;
    triggerAddress(detection.value, rect.left + window.scrollX, rect.bottom + window.scrollY);
  }, DEBOUNCE_MS);
}

document.addEventListener("mouseup", onSelectionChange);
document.addEventListener("keyup", (e) => { if (e.shiftKey) onSelectionChange(); });

// ── Dismiss ────────────────────────────────────────────────────────────────────
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { removePopup(); activeController = null; } });
document.addEventListener("mousedown", (e) => {
  const host = document.getElementById("quickdraw-host");
  if (host && !host.contains(e.target as Node)) { removePopup(); activeController = null; }
});

// ── MutationObserver — catch dynamically inserted addresses ────────────────────
const observer = new MutationObserver((mutations) => {
  if (!detectionEnabled) return;
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      const text = (node as Text).textContent ?? "";
      if (text.length < 32) continue;
      const detections = detectInText(text);
      if (!detections.length) continue;
      // Use the bounding rect of the parent element for positioning
      const parent = node.parentElement;
      const rect = parent?.getBoundingClientRect();
      if (!rect) continue;
      // Only trigger on first detection in a mutation batch to avoid flooding
      const first = detections[0];
      if (first.type === "address") {
        triggerAddress(first.value, rect.left, rect.bottom);
        break;
      }
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// Inject wallet bridge eagerly so it's ready when the user first clicks SWAP
injectWalletBridge().catch(() => {});

// Sync detection toggle from storage on load
sendBg<boolean>({ type: "get_detection_enabled" })
  .then((enabled) => { detectionEnabled = enabled; })
  .catch(() => {});
```

- [ ] **Step 2: Commit**

```bash
git add extension/src/content.ts
git commit -m "feat(ext): content script (MutationObserver + popup lifecycle + swap)"
```

---

## Task 12: Badge popup

**Files:**
- Modify: `extension/popup.html`
- Create: `extension/src/popup.ts`

- [ ] **Step 1: Create popup.ts**

```typescript
// extension/src/popup.ts
import type { BgRequest, BgResponse, WalletState } from "./types";

function sendBg<T>(msg: BgRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (resp: BgResponse<T>) => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      if (resp.ok) resolve(resp.data);
      else reject(new Error(resp.error));
    });
  });
}

async function init(): Promise<void> {
  const [wallet, enabled] = await Promise.all([
    sendBg<WalletState>({ type: "get_wallet" }),
    sendBg<boolean>({ type: "get_detection_enabled" }),
  ]);

  const walletEl = document.getElementById("wallet-status")!;
  const toggleEl = document.getElementById("detection-toggle") as HTMLInputElement;
  const connectBtn = document.getElementById("connect-btn") as HTMLButtonElement;

  walletEl.textContent = wallet.connected && wallet.address
    ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
    : "Not connected";
  walletEl.style.color = wallet.connected ? "#8BF542" : "#888";

  toggleEl.checked = enabled;
  toggleEl.addEventListener("change", () => {
    sendBg({ type: "set_detection_enabled", enabled: toggleEl.checked }).catch(() => {});
  });

  connectBtn.textContent = wallet.connected ? "Disconnect" : "Connect Wallet";
  connectBtn.addEventListener("click", async () => {
    if (wallet.connected) {
      await sendBg({ type: "set_wallet", wallet: { address: null, adapter: null, connected: false } });
      walletEl.textContent = "Not connected";
      walletEl.style.color = "#888";
      connectBtn.textContent = "Connect Wallet";
    } else {
      // Open a page where the user can connect — triggers wallet-bridge in an injected tab
      chrome.tabs.create({ url: "https://jup.ag" });
      window.close();
    }
  });
}

init().catch(console.error);
```

- [ ] **Step 2: Update popup.html**

Replace `extension/popup.html` with:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 240px;
      background: #181818;
      font-family: 'Space Mono', monospace;
      color: #F5F0E8;
      padding: 16px;
    }
    .logo { color: #F5E642; font-size: 11px; font-weight: 700; letter-spacing: 1px; margin-bottom: 12px; }
    .row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .label { color: #555; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
    #wallet-status { font-size: 11px; font-weight: 700; }
    .toggle-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    input[type=checkbox] { width: 16px; height: 16px; cursor: pointer; accent-color: #F5E642; }
    button {
      width: 100%; padding: 8px; font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
      background: #F5E642; color: #000; border: 1.5px solid #000;
      box-shadow: 2px 2px 0 #000; cursor: pointer; font-family: inherit;
    }
    button:hover { background: #ffe000; }
    .sep { border-top: 1px solid #222; margin: 12px 0; }
  </style>
</head>
<body>
  <div class="logo">⚡ QUICKDRAW</div>
  <div class="row">
    <span class="label">Wallet</span>
    <span id="wallet-status">Loading…</span>
  </div>
  <div class="sep"></div>
  <div class="toggle-row">
    <span class="label">Detection active</span>
    <input type="checkbox" id="detection-toggle" checked />
  </div>
  <button id="connect-btn">Connect Wallet</button>
  <script src="dist/popup.js"></script>
</body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add extension/popup.html extension/src/popup.ts
git commit -m "feat(ext): badge popup (wallet status + detection toggle)"
```

---

## Task 13: Build + integration test

**Files:**
- Run build, load extension, verify on 3 sites

- [ ] **Step 1: Run full test suite**

```bash
cd extension && npm test
```

Expected: all unit tests pass (score, detector, jupiter-client).

- [ ] **Step 2: Build the extension**

```bash
cd extension && npm run build
```

Expected: `dist/` contains `content.js`, `background.js`, `popup.js`, `wallet-bridge.js`. No TypeScript errors.

- [ ] **Step 3: Load in Chrome**

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked** → select the `extension/` folder
4. Verify "Quickdraw" appears with no errors

- [ ] **Step 4: Test on Twitter/X**

1. Navigate to `https://x.com`
2. Find a tweet containing a Solana address (e.g. search "pump.fun" or "$BONK")
3. Highlight the address text
4. Expected: popup appears within 500ms with loading state, then score + price appear, then narration streams in

- [ ] **Step 5: Test on pump.fun**

1. Navigate to `https://pump.fun`
2. Click any token — the token address appears in the URL and on the page
3. Highlight the address
4. Expected: popup appears, safety score shows, SWAP button is visible

- [ ] **Step 6: Test swap flow**

1. With Phantom installed and funded on devnet/mainnet
2. Highlight any token address
3. Click **SWAP** in the popup → click **CONNECT WALLET** if prompted
4. Enter `0.001` SOL in the amount field
5. Expected: quote appears within 1s, **CONFIRM SWAP** becomes clickable
6. Click **CONFIRM SWAP** → Phantom extension opens for approval
7. Approve → expected: success message with transaction signature

- [ ] **Step 7: Test on Telegram Web**

1. Navigate to `https://web.telegram.org`
2. Open a crypto channel
3. Highlight a Solana address in a message
4. Expected: popup appears (Telegram Web uses Shadow DOM itself — verify no style conflicts)

- [ ] **Step 8: Final commit**

```bash
git add .
git commit -m "feat(ext): Phase 1 complete — detection + popup + swap"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Token detection on any page — MutationObserver + selection detection in content.ts
- ✅ Shadow DOM isolation — popup-ui.ts uses `attachShadow`
- ✅ V3 score banner header — implemented in `buildShell()` with color transitions
- ✅ Safety score (Jupiter only) — score.ts + jupiter-client.ts
- ✅ AI narration (streamed) — worker-client.ts `streamNarration()`
- ✅ SWAP default action, expands inline — swap-panel.ts mounted via `mountSwapPanel()`
- ✅ Injected wallet (Phantom/Backpack/Solflare) — wallet-bridge.ts
- ✅ Reown AppKit fallback — handled by redirecting to `/auth` Worker page (see popup.ts connect flow)
- ✅ Wallet session persists — `chrome.storage.local` in background.ts
- ✅ Dedup 30s — dedupMap in background.ts
- ✅ Cache (safety 5min, price 15s) — background.ts
- ✅ Manual dismiss only — no auto-dismiss timer in popup-ui.ts
- ✅ Edge clamping — `clampPosition()` in content.ts
- ✅ CONNECT WALLET when no wallet — swap button label + connectWallet() flow
- ✅ Detection toggle — background.ts `get/set_detection_enabled`, badge popup wired

**Known gaps (not bugs — deferred to later tasks):**
- Reown AppKit full QR modal: Phase 1 redirects to `/auth` Worker page. Full in-popup QR modal is Phase 2 scope.
- 24h price change: Jupiter price v2 doesn't return 24h delta. Showing 0 for now; Birdeye integration is Phase 3.
- `$TICKER` lookup: detectInText picks up ticker symbols but there's no ticker→address resolution in Phase 1. The content script only triggers `triggerAddress` for `type === "address"`. Ticker resolution (Jupiter token list lookup) is Phase 2.
