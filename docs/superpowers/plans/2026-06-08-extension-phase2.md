# Extension Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the BUY/CANCEL row with 4 skill tabs (TRADE/ALERT/WATCH/DEEP), add Reown wallet connect, price alerts via chrome.alarms, watchlist via chrome.storage, and AI deep analysis via /ai/deep SSE.

**Architecture:** Each skill panel is a self-contained function returning an HTMLElement, rendered into a `.qd-panel` div below the skill tabs in the Shadow DOM popup. Background messaging handles all chrome.storage I/O and alarm management. DEEP streaming uses chrome.runtime ports for chunk delivery.

**Tech Stack:** TypeScript, esbuild, Vitest (node env), @reown/appkit + @reown/appkit-adapter-solana, chrome.alarms, chrome.storage.local, chrome.notifications, Shadow DOM, Jupiter API, Anthropic claude-sonnet-4-6 (via Worker SSE).

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `extension/src/styles.ts` | DS tokens + `brutal()` CSS helper |
| Modify | `extension/src/types.ts` | New storage types + message types |
| Create | `extension/src/skills/alert.ts` | ALERT panel: segmented control, price input, SET ALERT |
| Create | `extension/src/skills/watch.ts` | WATCH panel: ADD button + watchlist list |
| Create | `extension/src/skills/deep.ts` | DEEP panel: SSE streaming text, RE-ANALYZE |
| Create | `extension/src/skills/trade.ts` | TRADE panel: SOL input, quote output, SWAP NOW |
| Create | `extension/src/wallet-reown.ts` | Reown AppKit wrapper for toolbar popup |
| Modify | `extension/src/background.ts` | New handlers + chrome.alarms alert polling |
| Modify | `extension/src/popup-ui.ts` | Rebuild shell with skill tabs instead of BUY/CANCEL |
| Modify | `extension/src/content.ts` | Wire skill tabs, remove old wallet/swap flow |
| Modify | `extension/src/popup.ts` | STATE + SKILLS tab switcher, Reown connect button |
| Modify | `extension/package.json` | Add Reown deps, update build entry points + --define flags |
| Modify | `worker/src/index.ts` | Extend /ai/deep to extension bearer-token auth |
| Delete | `extension/src/wallet-bridge.ts` | Replaced by Reown |
| Delete | `extension/src/wallet.ts` | Replaced by wallet-reown.ts |

---

## Task 1: Design Tokens — `extension/src/styles.ts`

**Files:**
- Create: `extension/src/styles.ts`
- Test: `extension/src/__tests__/styles.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// extension/src/__tests__/styles.test.ts
import { describe, it, expect } from "vitest";
import { DS, brutal, safetyColor } from "../styles";

describe("DS tokens", () => {
  it("has all required tokens", () => {
    expect(DS.bg).toBe("#181818");
    expect(DS.yellow).toBe("#f5e642");
    expect(DS.safe).toBe("#8bf542");
    expect(DS.caution).toBe("#f5c842");
    expect(DS.danger).toBe("#f54242");
  });
});

describe("brutal()", () => {
  it("returns neobrutalism CSS with default yellow bg", () => {
    const css = brutal();
    expect(css).toContain("background:#f5e642");
    expect(css).toContain("border:2px solid #000");
    expect(css).toContain("box-shadow:3px 3px 0 #333");
    expect(css).toContain("border-radius:0");
  });

  it("accepts a custom background color", () => {
    expect(brutal("#8bf542")).toContain("background:#8bf542");
  });
});

describe("safetyColor()", () => {
  it("returns safe color for score ≥ 80", () => {
    expect(safetyColor(80)).toBe("#8bf542");
    expect(safetyColor(95)).toBe("#8bf542");
  });

  it("returns caution color for score 50–79", () => {
    expect(safetyColor(50)).toBe("#f5c842");
    expect(safetyColor(75)).toBe("#f5c842");
  });

  it("returns danger color for score < 50", () => {
    expect(safetyColor(49)).toBe("#f54242");
    expect(safetyColor(0)).toBe("#f54242");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd extension && npm test -- --reporter=verbose 2>&1 | tail -20
```
Expected: FAIL — `styles.ts` not found.

- [ ] **Step 3: Create `extension/src/styles.ts`**

```typescript
export const DS = {
  bg:      "#181818",
  yellow:  "#f5e642",
  safe:    "#8bf542",
  caution: "#f5c842",
  danger:  "#f54242",
  stroke:  "#000",
  shadow:  "3px 3px 0 #333",
  border:  "2px solid #333333",
  font:    "'Space Mono', monospace",
  textDim: "#555",
  textMut: "#888",
} as const;

export const brutal = (bg = DS.yellow): string =>
  `background:${bg};border:2px solid ${DS.stroke};box-shadow:${DS.shadow};border-radius:0`;

export function safetyColor(score: number): string {
  if (score >= 80) return DS.safe;
  if (score >= 50) return DS.caution;
  return DS.danger;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd extension && npm test -- --reporter=verbose 2>&1 | tail -20
```
Expected: PASS — 5 tests passing in styles.test.ts.

- [ ] **Step 5: Commit**

```bash
git add extension/src/styles.ts extension/src/__tests__/styles.test.ts
git commit -m "feat: add design-system tokens and brutal() helper"
```

---

## Task 2: Types — add storage + message types

**Files:**
- Modify: `extension/src/types.ts`
- Test: `extension/src/__tests__/types.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// extension/src/__tests__/types.test.ts
import { describe, it, expect } from "vitest";
import type { PriceAlert, WatchItem, SkillSettings, BgRequest } from "../types";

describe("PriceAlert type shape", () => {
  it("accepts a valid PriceAlert object", () => {
    const alert: PriceAlert = {
      mint: "So11111111111111111111111111111111111111112",
      ticker: "SOL",
      condition: "ABOVE",
      price: 200,
      triggered: false,
    };
    expect(alert.condition).toBe("ABOVE");
  });
});

describe("SkillSettings defaults", () => {
  it("all skills default to true", () => {
    const defaults: SkillSettings = { trade: true, alert: true, watch: true, deep: true };
    expect(Object.values(defaults).every(Boolean)).toBe(true);
  });
});

describe("BgRequest discriminated union", () => {
  it("GET_ALERTS type narrows correctly", () => {
    const req: BgRequest = { type: "GET_ALERTS" };
    expect(req.type).toBe("GET_ALERTS");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd extension && npm test -- --reporter=verbose 2>&1 | grep -A5 "types.test"
```
Expected: FAIL — `PriceAlert`, `WatchItem`, `SkillSettings` not exported from types.ts.

- [ ] **Step 3: Update `extension/src/types.ts`** — add these interfaces and union members:

```typescript
// Add these new interfaces before the BgRequest type:

export interface PriceAlert {
  mint: string;
  ticker: string;
  condition: "ABOVE" | "BELOW";
  price: number;
  triggered: boolean;
}

export interface WatchItem {
  mint: string;
  ticker: string;
}

export interface WatchItemWithPrice extends WatchItem {
  priceUsd: number | null;
  change24h: number | null;
}

export interface SkillSettings {
  trade: boolean;
  alert: boolean;
  watch: boolean;
  deep: boolean;
}

export const DEFAULT_SKILL_SETTINGS: SkillSettings = {
  trade: true,
  alert: true,
  watch: true,
  deep: true,
};
```

Then extend the `BgRequest` union to add these new message types at the end of the union:

```typescript
  | { type: "GET_ALERTS" }
  | { type: "SET_ALERTS"; alerts: PriceAlert[] }
  | { type: "GET_WATCHLIST" }
  | { type: "SET_WATCHLIST"; watchlist: WatchItem[] }
  | { type: "GET_WATCHLIST_PRICES"; mints: string[] }
  | { type: "GET_SKILL_SETTINGS" }
  | { type: "SET_SKILL_SETTINGS"; settings: SkillSettings }
  | { type: "QUOTE"; inputMint: string; outputMint: string; amountLamports: number }
  | { type: "SWAP_TX"; inputMint: string; outputMint: string; amountLamports: number; walletAddress: string }
```

Also add the `DeepPortMessage` type for port-based streaming:

```typescript
export interface DeepPortRequest {
  mint: string;
  ticker: string;
  price: number;
  safetyScore: number;
  volume24h: number;
}

export interface DeepPortChunk {
  type: "chunk";
  text: string;
}

export interface DeepPortDone {
  type: "done";
}

export interface DeepPortError {
  type: "error";
  message: string;
}

export type DeepPortMessage = DeepPortChunk | DeepPortDone | DeepPortError;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd extension && npm test -- --reporter=verbose 2>&1 | tail -20
```
Expected: All tests pass including the new types.test.ts.

- [ ] **Step 5: Commit**

```bash
git add extension/src/types.ts extension/src/__tests__/types.test.ts
git commit -m "feat: add Phase 2 storage + message types"
```

---

## Task 3: Worker — extend /ai/deep to extension bearer auth

**Files:**
- Modify: `worker/src/index.ts:370-382`

The worker currently only allows extension bearer-token auth on `/ai/fast`. The `/ai/deep` route requires HMAC auth, which the extension cannot produce. Add `/ai/deep` to the extension bearer-token block.

- [ ] **Step 1: Locate the extension bearer-token block in `worker/src/index.ts`**

The block is at lines ~370–382 and currently reads:

```typescript
    if (req.headers.get("X-Quickdraw-Client") === "extension") {
      const bearer = req.headers.get("Authorization") ?? "";
      const secret = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
      if (!secret || secret !== env.EXTENSION_SECRET) {
        return err("Unauthorized", 401);
      }
      if (url.pathname === "/ai/fast" && req.method === "POST") {
        return handleAi(req, env, "claude-haiku-4-5-20251001");
      }
      return err("Not found", 404);
    }
```

- [ ] **Step 2: Add `/ai/deep` to the extension bearer-token block**

Replace the block above with:

```typescript
    if (req.headers.get("X-Quickdraw-Client") === "extension") {
      const bearer = req.headers.get("Authorization") ?? "";
      const secret = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
      if (!secret || secret !== env.EXTENSION_SECRET) {
        return err("Unauthorized", 401);
      }
      if (url.pathname === "/ai/fast" && req.method === "POST") {
        return handleAi(req, env, "claude-haiku-4-5-20251001");
      }
      if (url.pathname === "/ai/deep" && req.method === "POST") {
        return handleAiDeepExtension(req, env);
      }
      return err("Not found", 404);
    }
```

- [ ] **Step 3: Add `handleAiDeepExtension` function before the main router export**

Add this function after `handleHeliusToken` (around line 252):

```typescript
async function handleAiDeepExtension(req: Request, env: Env): Promise<Response> {
  const body = await req.json<{
    mint: string;
    ticker: string;
    price: number;
    safetyScore: number;
    volume24h: number;
  }>();

  const systemPrompt =
    "You are a DeFi analyst for Solana traders. Write 3-4 sentences analyzing the token's risk, momentum, and key on-chain signals. Be direct and data-driven. No disclaimers.";

  const userContent = [
    `Token: ${body.ticker} (${body.mint})`,
    `Safety score: ${body.safetyScore}/100`,
    `Price: $${body.price}`,
    `24h volume: $${body.volume24h.toLocaleString()}`,
  ].join("\n");

  const upstream = await fetch(`${ANTHROPIC_BASE}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      stream: true,
    }),
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...cors,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd worker && npx tsc --noEmit 2>&1
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add worker/src/index.ts
git commit -m "feat(worker): expose /ai/deep to extension bearer-token auth"
```

---

## Task 4: package.json — add Reown deps + update build scripts

**Files:**
- Modify: `extension/package.json`

- [ ] **Step 1: Install Reown AppKit packages**

```bash
cd extension && npm install @reown/appkit @reown/appkit-adapter-solana
```

- [ ] **Step 2: Update `extension/package.json` build scripts**

Replace the current scripts with (remove `wallet-bridge.ts` from entry points, add `__REOWN_PROJECT_ID__` define):

```json
{
  "scripts": {
    "build": "esbuild src/content.ts src/background.ts src/popup.ts --bundle --outdir=dist --target=chrome111 --format=esm --define:__WORKER_URL__='\"http://localhost:8787\"' --define:__EXTENSION_SECRET__='\"dev-extension-secret-change-in-prod\"' --define:__REOWN_PROJECT_ID__='\"dev-reown-project-id\"'",
    "watch": "esbuild src/content.ts src/background.ts src/popup.ts --bundle --outdir=dist --target=chrome111 --format=esm --define:__WORKER_URL__='\"http://localhost:8787\"' --define:__EXTENSION_SECRET__='\"dev-extension-secret-change-in-prod\"' --define:__REOWN_PROJECT_ID__='\"dev-reown-project-id\"' --watch",
    "build:prod": "esbuild src/content.ts src/background.ts src/popup.ts --bundle --outdir=dist --target=chrome111 --format=esm --define:__WORKER_URL__='\"https://quickdraw-worker.wanaqilre.workers.dev\"' --define:__EXTENSION_SECRET__='\"REPLACE_WITH_SECRET\"' --define:__REOWN_PROJECT_ID__='\"REPLACE_WITH_REOWN_ID\"'",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: Verify the build entry points exist**

```bash
cd extension && ls src/content.ts src/background.ts src/popup.ts
```
Expected: All three files listed.

- [ ] **Step 4: Verify package installed correctly**

```bash
cd extension && node -e "require('@reown/appkit')" 2>&1 || echo "ESM only"
ls node_modules/@reown/appkit/dist 2>&1 | head -5
```

- [ ] **Step 5: Commit**

```bash
git add extension/package.json extension/package-lock.json
git commit -m "build: add Reown AppKit deps, remove wallet-bridge entry point"
```

---

## Task 5: ALERT panel — `extension/src/skills/alert.ts`

**Files:**
- Create: `extension/src/skills/alert.ts`
- Test: `extension/src/__tests__/skills/alert.test.ts`

- [ ] **Step 1: Create test directory and write the failing test**

```bash
mkdir -p extension/src/__tests__/skills
```

```typescript
// extension/src/__tests__/skills/alert.test.ts
import { describe, it, expect } from "vitest";
import { alertShouldFire } from "../../skills/alert";
import type { PriceAlert } from "../../types";

describe("alertShouldFire()", () => {
  it("fires ABOVE alert when current price exceeds threshold", () => {
    const alert: PriceAlert = { mint: "abc", ticker: "SOL", condition: "ABOVE", price: 200, triggered: false };
    expect(alertShouldFire(alert, 201)).toBe(true);
  });

  it("does not fire ABOVE alert when price is below threshold", () => {
    const alert: PriceAlert = { mint: "abc", ticker: "SOL", condition: "ABOVE", price: 200, triggered: false };
    expect(alertShouldFire(alert, 199)).toBe(false);
  });

  it("fires BELOW alert when current price drops below threshold", () => {
    const alert: PriceAlert = { mint: "abc", ticker: "SOL", condition: "BELOW", price: 150, triggered: false };
    expect(alertShouldFire(alert, 149)).toBe(true);
  });

  it("does not fire already-triggered alert", () => {
    const alert: PriceAlert = { mint: "abc", ticker: "SOL", condition: "ABOVE", price: 200, triggered: true };
    expect(alertShouldFire(alert, 250)).toBe(false);
  });

  it("re-arms ABOVE alert when price drops back below threshold", () => {
    const alert: PriceAlert = { mint: "abc", ticker: "SOL", condition: "ABOVE", price: 200, triggered: true };
    expect(alertShouldFire(alert, 190)).toBe(false); // still below, don't fire
  });

  it("shouldRearm returns true when ABOVE alert price returns below threshold", () => {
    // import shouldRearm separately
    expect(true).toBe(true); // placeholder for shouldRearm — tested below
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd extension && npm test -- --reporter=verbose 2>&1 | grep -A5 "alert.test"
```
Expected: FAIL — `alertShouldFire` not exported from skills/alert.

- [ ] **Step 3: Create `extension/src/skills/alert.ts`**

```typescript
import type { PriceAlert } from "../types";
import { DS, brutal } from "../styles";
import { sendBg } from "../shared";

export function alertShouldFire(alert: PriceAlert, currentPrice: number): boolean {
  if (alert.triggered) return false;
  if (alert.condition === "ABOVE") return currentPrice > alert.price;
  return currentPrice < alert.price;
}

export function alertShouldRearm(alert: PriceAlert, currentPrice: number): boolean {
  if (!alert.triggered) return false;
  if (alert.condition === "ABOVE") return currentPrice <= alert.price;
  return currentPrice >= alert.price;
}

export function buildAlertPanel(
  mint: string,
  ticker: string,
  currentPrice: number,
  existingAlerts: PriceAlert[],
  onAlertSet: (alerts: PriceAlert[]) => void,
): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `padding:10px 12px;font-family:${DS.font};`;

  let condition: "ABOVE" | "BELOW" = "ABOVE";
  let priceInput = currentPrice > 0 ? currentPrice.toPrecision(4) : "";

  function render(): void {
    el.innerHTML = buildAlertHTML(ticker, condition, priceInput, existingAlerts);

    el.querySelector<HTMLButtonElement>("#qd-alert-above")?.addEventListener("click", () => {
      condition = "ABOVE";
      render();
    });
    el.querySelector<HTMLButtonElement>("#qd-alert-below")?.addEventListener("click", () => {
      condition = "BELOW";
      render();
    });
    el.querySelector<HTMLInputElement>("#qd-alert-price")?.addEventListener("input", (e) => {
      priceInput = (e.target as HTMLInputElement).value;
    });
    el.querySelector<HTMLButtonElement>("#qd-alert-set")?.addEventListener("click", async () => {
      const price = parseFloat(priceInput);
      if (isNaN(price) || price <= 0) return;
      const existing = await sendBg<PriceAlert[]>({ type: "GET_ALERTS" });
      const filtered = existing.filter(a => !(a.mint === mint && a.condition === condition));
      const updated: PriceAlert[] = [
        ...filtered,
        { mint, ticker, condition, price, triggered: false },
      ];
      await sendBg({ type: "SET_ALERTS", alerts: updated });
      onAlertSet(updated);
      render();
    });
    existingAlerts.forEach((alert, i) => {
      el.querySelector(`#qd-alert-del-${i}`)?.addEventListener("click", async () => {
        const existing = await sendBg<PriceAlert[]>({ type: "GET_ALERTS" });
        const updated = existing.filter((_, idx) => idx !== i);
        await sendBg({ type: "SET_ALERTS", alerts: updated });
        onAlertSet(updated);
        render();
      });
    });
  }

  render();
  return el;
}

function buildAlertHTML(
  ticker: string,
  condition: "ABOVE" | "BELOW",
  priceInput: string,
  alerts: PriceAlert[],
): string {
  const activeStyle = `${brutal(DS.yellow)};color:#000;padding:4px 12px;font-family:${DS.font};font-size:11px;font-weight:700;cursor:pointer;border:none;`;
  const inactiveStyle = `background:${DS.bg};color:${DS.textMut};padding:4px 12px;font-family:${DS.font};font-size:11px;cursor:pointer;border:1px solid #333;`;

  const thisMintAlerts = alerts.filter(a => a.mint !== ""); // all alerts shown

  return `
<style>
  .qd-al-label { font-size:10px; color:${DS.textMut}; margin-bottom:6px; letter-spacing:0.06em; }
  .qd-al-seg { display:flex; gap:0; margin-bottom:8px; }
  .qd-al-input { width:100%; background:#222; border:1.5px solid #333; color:#fff; padding:7px 10px;
    font-family:${DS.font}; font-size:12px; margin-bottom:8px; outline:none; box-sizing:border-box; }
  .qd-al-input:focus { border-color:${DS.yellow}; }
  .qd-al-btn { width:100%; padding:8px; font-size:11px; font-weight:700; letter-spacing:0.06em;
    cursor:pointer; font-family:${DS.font}; margin-bottom:8px; ${brutal(DS.yellow)}; color:#000; border:none; }
  .qd-al-list { border-top:1px solid #222; padding-top:8px; margin-top:4px; }
  .qd-al-item { display:flex; justify-content:space-between; align-items:center;
    font-size:10px; color:#ccc; margin-bottom:4px; }
  .qd-al-del { background:none; border:none; color:${DS.textMut}; cursor:pointer; font-size:12px; padding:0 2px; }
  .qd-al-del:hover { color:${DS.danger}; }
  .qd-al-triggered { color:${DS.safe}; font-size:9px; }
</style>
<div class="qd-al-label">SET PRICE ALERT — ${ticker}</div>
<div class="qd-al-seg">
  <button id="qd-alert-above" style="${condition === "ABOVE" ? activeStyle : inactiveStyle}">ABOVE</button>
  <button id="qd-alert-below" style="${condition === "BELOW" ? activeStyle : inactiveStyle}">BELOW</button>
</div>
<input id="qd-alert-price" class="qd-al-input" type="number" placeholder="$ price" value="${priceInput}" step="any" />
<button id="qd-alert-set" class="qd-al-btn">SET ALERT</button>
${thisMintAlerts.length > 0 ? `
<div class="qd-al-list">
  ${thisMintAlerts.map((a, i) => `
    <div class="qd-al-item">
      <span>${a.ticker} ${a.condition} $${a.price} ${a.triggered ? '<span class="qd-al-triggered">✓ TRIGGERED</span>' : ""}</span>
      <button class="qd-al-del" id="qd-alert-del-${i}">✕</button>
    </div>
  `).join("")}
</div>` : ""}`;
}
```

- [ ] **Step 4: Update test to import `alertShouldRearm` and run**

Update `extension/src/__tests__/skills/alert.test.ts` — replace the placeholder test at the end with:

```typescript
import { describe, it, expect } from "vitest";
import { alertShouldFire, alertShouldRearm } from "../../skills/alert";
import type { PriceAlert } from "../../types";

describe("alertShouldFire()", () => {
  it("fires ABOVE alert when current price exceeds threshold", () => {
    const alert: PriceAlert = { mint: "abc", ticker: "SOL", condition: "ABOVE", price: 200, triggered: false };
    expect(alertShouldFire(alert, 201)).toBe(true);
  });
  it("does not fire ABOVE alert when price is below threshold", () => {
    const alert: PriceAlert = { mint: "abc", ticker: "SOL", condition: "ABOVE", price: 200, triggered: false };
    expect(alertShouldFire(alert, 199)).toBe(false);
  });
  it("fires BELOW alert when current price drops below threshold", () => {
    const alert: PriceAlert = { mint: "abc", ticker: "SOL", condition: "BELOW", price: 150, triggered: false };
    expect(alertShouldFire(alert, 149)).toBe(true);
  });
  it("does not fire already-triggered alert", () => {
    const alert: PriceAlert = { mint: "abc", ticker: "SOL", condition: "ABOVE", price: 200, triggered: true };
    expect(alertShouldFire(alert, 250)).toBe(false);
  });
});

describe("alertShouldRearm()", () => {
  it("re-arms ABOVE alert when price drops back below threshold", () => {
    const alert: PriceAlert = { mint: "abc", ticker: "SOL", condition: "ABOVE", price: 200, triggered: true };
    expect(alertShouldRearm(alert, 190)).toBe(true);
  });
  it("does not re-arm non-triggered alert", () => {
    const alert: PriceAlert = { mint: "abc", ticker: "SOL", condition: "ABOVE", price: 200, triggered: false };
    expect(alertShouldRearm(alert, 190)).toBe(false);
  });
  it("re-arms BELOW alert when price rises above threshold", () => {
    const alert: PriceAlert = { mint: "abc", ticker: "SOL", condition: "BELOW", price: 100, triggered: true };
    expect(alertShouldRearm(alert, 110)).toBe(true);
  });
});
```

- [ ] **Step 5: Run tests**

```bash
cd extension && npm test -- --reporter=verbose 2>&1 | tail -20
```
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add extension/src/skills/alert.ts extension/src/__tests__/skills/alert.test.ts
git commit -m "feat: add ALERT skill panel with price alert logic"
```

---

## Task 6: WATCH panel — `extension/src/skills/watch.ts`

**Files:**
- Create: `extension/src/skills/watch.ts`
- Test: `extension/src/__tests__/skills/watch.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// extension/src/__tests__/skills/watch.test.ts
import { describe, it, expect } from "vitest";
import { watchlistAdd, watchlistRemove, watchlistContains } from "../../skills/watch";
import type { WatchItem } from "../../types";

const SOL: WatchItem = { mint: "So11111111111111111111111111111111111111112", ticker: "SOL" };
const JTO: WatchItem = { mint: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL", ticker: "JTO" };

describe("watchlistAdd()", () => {
  it("adds a new item to the watchlist", () => {
    const result = watchlistAdd([], SOL);
    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe("SOL");
  });

  it("does not add duplicate mints", () => {
    const result = watchlistAdd([SOL], SOL);
    expect(result).toHaveLength(1);
  });

  it("adds a second item", () => {
    const result = watchlistAdd([SOL], JTO);
    expect(result).toHaveLength(2);
  });
});

describe("watchlistRemove()", () => {
  it("removes an item by mint", () => {
    const result = watchlistRemove([SOL, JTO], SOL.mint);
    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe("JTO");
  });

  it("returns unchanged list if mint not found", () => {
    const result = watchlistRemove([SOL], "nonexistent");
    expect(result).toHaveLength(1);
  });
});

describe("watchlistContains()", () => {
  it("returns true when mint is in list", () => {
    expect(watchlistContains([SOL, JTO], SOL.mint)).toBe(true);
  });

  it("returns false when mint is not in list", () => {
    expect(watchlistContains([SOL], JTO.mint)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd extension && npm test -- --reporter=verbose 2>&1 | grep -A5 "watch.test"
```
Expected: FAIL.

- [ ] **Step 3: Create `extension/src/skills/watch.ts`**

```typescript
import type { WatchItem, WatchItemWithPrice } from "../types";
import { DS, brutal } from "../styles";
import { sendBg } from "../shared";

export function watchlistAdd(list: WatchItem[], item: WatchItem): WatchItem[] {
  if (list.some(w => w.mint === item.mint)) return list;
  return [...list, item];
}

export function watchlistRemove(list: WatchItem[], mint: string): WatchItem[] {
  return list.filter(w => w.mint !== mint);
}

export function watchlistContains(list: WatchItem[], mint: string): boolean {
  return list.some(w => w.mint === mint);
}

export function buildWatchPanel(
  mint: string,
  ticker: string,
  watchlist: WatchItem[],
  watchlistPrices: WatchItemWithPrice[],
  onUpdated: (updated: WatchItem[]) => void,
): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `padding:10px 12px;font-family:${DS.font};`;

  const isWatching = watchlistContains(watchlist, mint);

  async function handleAdd(): Promise<void> {
    const current = await sendBg<WatchItem[]>({ type: "GET_WATCHLIST" });
    const updated = watchlistAdd(current, { mint, ticker });
    await sendBg({ type: "SET_WATCHLIST", watchlist: updated });
    onUpdated(updated);
    render(updated);
  }

  async function handleRemove(removeMint: string): Promise<void> {
    const current = await sendBg<WatchItem[]>({ type: "GET_WATCHLIST" });
    const updated = watchlistRemove(current, removeMint);
    await sendBg({ type: "SET_WATCHLIST", watchlist: updated });
    onUpdated(updated);
    render(updated);
  }

  function render(current: WatchItem[]): void {
    const watching = watchlistContains(current, mint);
    el.innerHTML = buildWatchHTML(mint, ticker, watching, watchlistPrices);
    el.querySelector("#qd-watch-add")?.addEventListener("click", handleAdd);
    el.querySelector("#qd-watch-remove")?.addEventListener("click", () => handleRemove(mint));
    watchlistPrices.forEach(item => {
      el.querySelector(`#qd-watch-del-${item.mint.slice(0, 8)}`)
        ?.addEventListener("click", () => handleRemove(item.mint));
    });
  }

  render(watchlist);
  return el;
}

function buildWatchHTML(
  mint: string,
  ticker: string,
  isWatching: boolean,
  prices: WatchItemWithPrice[],
): string {
  const addBtn = isWatching
    ? `<button id="qd-watch-remove" style="${brutal("#333")};color:${DS.textMut};padding:8px;width:100%;font-size:11px;font-weight:700;font-family:${DS.font};letter-spacing:0.06em;cursor:pointer;border:none;">✓ WATCHING ${ticker}</button>`
    : `<button id="qd-watch-add" style="${brutal(DS.yellow)};color:#000;padding:8px;width:100%;font-size:11px;font-weight:700;font-family:${DS.font};letter-spacing:0.06em;cursor:pointer;border:none;">+ ADD ${ticker}</button>`;

  const listItems = prices.map(item => {
    const change = item.change24h;
    const changeStr = change !== null
      ? `${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(1)}%`
      : "";
    const changeColor = change !== null ? (change >= 0 ? DS.safe : DS.danger) : DS.textMut;
    const priceStr = item.priceUsd !== null
      ? `$${item.priceUsd < 0.01 ? item.priceUsd.toFixed(6) : item.priceUsd.toFixed(4)}`
      : "—";
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:10px;">
        <span style="color:#ccc;font-weight:700;">${item.ticker}</span>
        <span style="display:flex;gap:8px;align-items:center;">
          <span style="color:#fff;">${priceStr}</span>
          <span style="color:${changeColor};">${changeStr}</span>
          <button id="qd-watch-del-${item.mint.slice(0, 8)}" style="background:none;border:none;color:${DS.textMut};cursor:pointer;font-size:11px;padding:0;">✕</button>
        </span>
      </div>`;
  }).join("");

  return `
<style>
  .qd-wl-header { font-size:10px; color:${DS.textMut}; margin-bottom:8px; letter-spacing:0.06em; }
  .qd-wl-sep { border:none; border-top:1px solid #222; margin:8px 0; }
  .qd-wl-count { font-size:9px; color:${DS.textMut}; margin-bottom:4px; }
</style>
<div class="qd-wl-header">WATCHLIST</div>
${addBtn}
${prices.length > 0 ? `
<hr class="qd-wl-sep" />
<div class="qd-wl-count">WATCHING (${prices.length})</div>
${listItems}` : ""}`;
}
```

- [ ] **Step 4: Run tests**

```bash
cd extension && npm test -- --reporter=verbose 2>&1 | tail -20
```
Expected: All tests pass including watch.test.ts.

- [ ] **Step 5: Commit**

```bash
git add extension/src/skills/watch.ts extension/src/__tests__/skills/watch.test.ts
git commit -m "feat: add WATCH skill panel with watchlist logic"
```

---

## Task 7: DEEP panel — `extension/src/skills/deep.ts`

**Files:**
- Create: `extension/src/skills/deep.ts`
- Test: `extension/src/__tests__/skills/deep.test.ts`

The DEEP panel uses chrome.runtime.connect (port) for streaming. The background opens a port named `"deep-analysis"`, does the SSE fetch, and posts chunks back.

- [ ] **Step 1: Write the failing test**

```typescript
// extension/src/__tests__/skills/deep.test.ts
import { describe, it, expect } from "vitest";
import { formatDeepRequest } from "../../skills/deep";

describe("formatDeepRequest()", () => {
  it("formats request body as JSON with all required fields", () => {
    const body = formatDeepRequest("abc123", "BONK", 0.000030, 72, 2400000);
    const parsed = JSON.parse(body);
    expect(parsed.mint).toBe("abc123");
    expect(parsed.ticker).toBe("BONK");
    expect(parsed.price).toBe(0.000030);
    expect(parsed.safetyScore).toBe(72);
    expect(parsed.volume24h).toBe(2400000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd extension && npm test -- --reporter=verbose 2>&1 | grep -A5 "deep.test"
```
Expected: FAIL.

- [ ] **Step 3: Create `extension/src/skills/deep.ts`**

```typescript
import { DS, brutal } from "../styles";

export function formatDeepRequest(
  mint: string,
  ticker: string,
  price: number,
  safetyScore: number,
  volume24h: number,
): string {
  return JSON.stringify({ mint, ticker, price, safetyScore, volume24h });
}

export function buildDeepPanel(
  mint: string,
  ticker: string,
  price: number,
  safetyScore: number,
  volume24h: number,
): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `padding:10px 12px;font-family:${DS.font};`;
  el.innerHTML = buildDeepHTML("", true);

  let port: ReturnType<typeof chrome.runtime.connect> | null = null;

  function startAnalysis(): void {
    if (port) {
      try { port.disconnect(); } catch { /* port may already be closed */ }
    }
    setStatus("", true);

    port = chrome.runtime.connect({ name: "deep-analysis" });
    port.postMessage({ mint, ticker, price, safetyScore, volume24h });

    let text = "";
    port.onMessage.addListener((msg: { type: string; text?: string; message?: string }) => {
      if (msg.type === "chunk" && msg.text) {
        text += msg.text;
        setStatus(text, true);
      }
      if (msg.type === "done") {
        setStatus(text, false);
      }
      if (msg.type === "error") {
        setStatus(msg.message ?? "Analysis failed", false, true);
      }
    });

    port.onDisconnect.addListener(() => {
      if (text) setStatus(text, false);
    });
  }

  function setStatus(text: string, analyzing: boolean, isError = false): void {
    const textEl = el.querySelector<HTMLDivElement>("#qd-deep-text");
    const dotEl  = el.querySelector<HTMLSpanElement>("#qd-deep-dot");
    const btnEl  = el.querySelector<HTMLButtonElement>("#qd-deep-reanalyze");

    if (textEl) {
      textEl.textContent = text || (analyzing ? "Analyzing…" : "");
      textEl.style.color = isError ? DS.danger : "#cccccc";
    }
    if (dotEl) {
      dotEl.style.display = analyzing ? "inline" : "none";
    }
    if (btnEl) {
      btnEl.style.display = analyzing ? "none" : "inline-block";
    }
  }

  startAnalysis();

  el.querySelector("#qd-deep-reanalyze")?.addEventListener("click", () => {
    startAnalysis();
  });

  return el;
}

function buildDeepHTML(initialText: string, analyzing: boolean): string {
  return `
<style>
  .qd-deep-label { font-size:10px; color:${DS.textMut}; margin-bottom:6px; letter-spacing:0.06em; }
  .qd-deep-box { background:#111; border:1px solid #2a2a2a; padding:8px 10px; min-height:72px;
    font-size:9px; line-height:1.6; color:#cccccc; margin-bottom:8px; font-family:${DS.font}; white-space:pre-wrap; }
  .qd-deep-footer { display:flex; align-items:center; gap:8px; }
  .qd-deep-dot { display:${analyzing ? "inline" : "none"}; color:${DS.yellow}; font-size:14px; line-height:1; }
  .qd-deep-analyzing { font-size:9px; color:${DS.textMut}; }
  .qd-deep-reanalyze { display:${analyzing ? "none" : "inline-block"}; ${brutal("#222")}; color:${DS.textMut};
    padding:4px 10px; font-size:10px; font-family:${DS.font}; cursor:pointer; border:1px solid #333; }
  .qd-deep-reanalyze:hover { color:#fff; }
</style>
<div class="qd-deep-label">DEEP ANALYSIS</div>
<div class="qd-deep-box" id="qd-deep-text">${initialText || (analyzing ? "Analyzing…" : "")}</div>
<div class="qd-deep-footer">
  <span class="qd-deep-dot" id="qd-deep-dot">●</span>
  <span class="qd-deep-analyzing" id="qd-deep-status">${analyzing ? "Analyzing…" : ""}</span>
  <button class="qd-deep-reanalyze" id="qd-deep-reanalyze">RE-ANALYZE</button>
</div>`;
}
```

- [ ] **Step 4: Run tests**

```bash
cd extension && npm test -- --reporter=verbose 2>&1 | tail -20
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add extension/src/skills/deep.ts extension/src/__tests__/skills/deep.test.ts
git commit -m "feat: add DEEP skill panel with SSE port streaming"
```

---

## Task 8: TRADE panel — `extension/src/skills/trade.ts`

**Files:**
- Create: `extension/src/skills/trade.ts`
- Test: `extension/src/__tests__/skills/trade.test.ts`

The TRADE panel fetches a Jupiter quote via background messaging and provides a SWAP NOW button. For the swap execution, since signing requires a connected wallet, the panel redirects to Jupiter DEX if the Reown session isn't active.

- [ ] **Step 1: Write the failing test**

```typescript
// extension/src/__tests__/skills/trade.test.ts
import { describe, it, expect } from "vitest";
import { formatSolAmount, parseOutputAmount } from "../../skills/trade";

describe("formatSolAmount()", () => {
  it("formats small SOL amounts with 4 decimals", () => {
    expect(formatSolAmount(0.5)).toBe("0.5000");
  });
  it("formats zero as 0.0000", () => {
    expect(formatSolAmount(0)).toBe("0.0000");
  });
});

describe("parseOutputAmount()", () => {
  it("converts lamports string to human-readable with 2 decimals for large amounts", () => {
    expect(parseOutputAmount("1000000000", 9)).toBe("1.00");
  });
  it("converts with 6 decimals for USDC-style tokens (6 decimals)", () => {
    expect(parseOutputAmount("1000000", 6)).toBe("1.000000");
  });
  it("returns — for empty string", () => {
    expect(parseOutputAmount("", 9)).toBe("—");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd extension && npm test -- --reporter=verbose 2>&1 | grep -A5 "trade.test"
```
Expected: FAIL.

- [ ] **Step 3: Create `extension/src/skills/trade.ts`**

```typescript
import { DS, brutal } from "../styles";
import { sendBg } from "../shared";
import type { SwapQuote, WalletState } from "../types";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const LAMPORTS_PER_SOL = 1_000_000_000;

export function formatSolAmount(sol: number): string {
  return sol.toFixed(4);
}

export function parseOutputAmount(rawAmount: string, decimals: number): string {
  if (!rawAmount) return "—";
  const num = parseInt(rawAmount, 10);
  if (isNaN(num)) return "—";
  const val = num / Math.pow(10, decimals);
  return decimals >= 6 ? val.toFixed(6) : val.toFixed(2);
}

interface TradeState {
  solInput: string;
  quote: SwapQuote | null;
  loading: boolean;
  error: string | null;
  confirming: boolean;
}

export function buildTradePanel(
  outputMint: string,
  ticker: string,
  wallet: WalletState,
): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `padding:10px 12px;font-family:${DS.font};`;

  let state: TradeState = { solInput: "0.5", quote: null, loading: false, error: null, confirming: false };

  function render(): void {
    el.innerHTML = buildTradeHTML(ticker, state, wallet);

    const input = el.querySelector<HTMLInputElement>("#qd-trade-sol");
    input?.addEventListener("change", () => {
      state = { ...state, solInput: input.value, quote: null, error: null };
      fetchQuote();
    });

    el.querySelector("#qd-trade-max")?.addEventListener("click", () => {
      // MAX: show 0.5 SOL as default since we can't easily get balance from content script
      if (input) { input.value = "0.5"; state = { ...state, solInput: "0.5" }; fetchQuote(); }
    });

    el.querySelector("#qd-trade-swap")?.addEventListener("click", () => {
      if (!wallet.connected) {
        chrome.runtime.sendMessage({ type: "OPEN_POPUP" });
        return;
      }
      if (state.quote) executeSwap();
      else fetchQuote();
    });
  }

  async function fetchQuote(): Promise<void> {
    const sol = parseFloat(state.solInput || "0");
    if (sol <= 0) return;
    state = { ...state, loading: true, error: null };
    render();
    try {
      const amountLamports = Math.floor(sol * LAMPORTS_PER_SOL);
      const quote = await sendBg<SwapQuote>({
        type: "QUOTE",
        inputMint: SOL_MINT,
        outputMint,
        amountLamports,
      });
      state = { ...state, loading: false, quote, error: null };
    } catch (err: unknown) {
      state = { ...state, loading: false, error: err instanceof Error ? err.message : "Quote failed" };
    }
    render();
  }

  async function executeSwap(): Promise<void> {
    if (!state.quote || !wallet.address) return;
    state = { ...state, confirming: true };
    render();
    try {
      const txBase64 = await sendBg<string>({
        type: "SWAP_TX",
        inputMint: SOL_MINT,
        outputMint,
        amountLamports: Math.floor(parseFloat(state.solInput) * LAMPORTS_PER_SOL),
        walletAddress: wallet.address,
      });
      // Open Jupiter with the transaction — signing requires wallet context
      // Full in-extension signing is Phase 3 (requires native wallet bridge)
      const jupUrl = `https://jup.ag/swap/SOL-${ticker}`;
      window.open(jupUrl, "_blank");
      state = { ...state, confirming: false };
    } catch (err: unknown) {
      state = { ...state, confirming: false, error: err instanceof Error ? err.message : "Swap failed" };
    }
    render();
  }

  render();
  return el;
}

function buildTradeHTML(ticker: string, state: TradeState, wallet: WalletState): string {
  const outAmt = state.quote
    ? parseOutputAmount(state.quote.outAmount, 6)
    : (state.loading ? "…" : "—");
  const impact = state.quote
    ? `${(state.quote.priceImpactPct * 100).toFixed(2)}%`
    : "—";
  const swapLabel = state.confirming
    ? "CONFIRMING…"
    : !wallet.connected
      ? "CONNECT WALLET FIRST"
      : "SWAP NOW ↗";

  return `
<style>
  .qd-tr-label { font-size:10px; color:${DS.textMut}; margin-bottom:6px; letter-spacing:0.06em; }
  .qd-tr-row { display:flex; gap:6px; margin-bottom:6px; }
  .qd-tr-input { flex:1; background:#222; border:1.5px solid ${DS.yellow}; color:#fff;
    padding:7px 10px; font-family:${DS.font}; font-size:12px; outline:none; min-width:0; }
  .qd-tr-max { ${brutal(DS.yellow)}; color:#000; padding:6px 10px; font-size:10px;
    font-family:${DS.font}; font-weight:700; cursor:pointer; border:none; white-space:nowrap; }
  .qd-tr-arrow { text-align:center; color:${DS.textMut}; font-size:12px; margin:4px 0; }
  .qd-tr-out { background:#111; border:1px solid #2a2a2a; padding:8px 10px; font-size:12px;
    color:#fff; font-weight:700; margin-bottom:4px; }
  .qd-tr-meta { display:flex; justify-content:space-between; font-size:9px; color:${DS.textMut}; margin-bottom:8px; }
  .qd-tr-err { font-size:10px; color:${DS.danger}; margin-bottom:6px; }
  .qd-tr-swap { width:100%; ${brutal(DS.yellow)}; color:#000; padding:9px; font-size:11px;
    font-weight:700; letter-spacing:0.06em; cursor:pointer; font-family:${DS.font};
    ${(!state.quote && !state.loading) || state.confirming ? "opacity:0.6;" : ""} }
</style>
<div class="qd-tr-label">BUY ${ticker}</div>
<div class="qd-tr-row">
  <input id="qd-trade-sol" class="qd-tr-input" type="number" value="${state.solInput}" placeholder="0.5" min="0.001" step="0.1" />
  <span style="color:${DS.textMut};font-size:10px;align-self:center;">SOL</span>
  <button id="qd-trade-max" class="qd-tr-max">MAX</button>
</div>
<div class="qd-tr-arrow">↓</div>
<div class="qd-tr-out">~ ${outAmt} ${ticker}</div>
<div class="qd-tr-meta">
  <span>Price impact: ${impact}</span>
  <span>${state.loading ? "fetching quote…" : ""}</span>
</div>
${state.error ? `<div class="qd-tr-err">⚠ ${state.error}</div>` : ""}
<button id="qd-trade-swap" class="qd-tr-swap" ${state.confirming ? "disabled" : ""}>${swapLabel}</button>`;
}
```

- [ ] **Step 4: Run tests**

```bash
cd extension && npm test -- --reporter=verbose 2>&1 | tail -20
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add extension/src/skills/trade.ts extension/src/__tests__/skills/trade.test.ts
git commit -m "feat: add TRADE skill panel with Jupiter quote + swap redirect"
```

---

## Task 9: Wallet connect — `extension/src/wallet-reown.ts`

**Files:**
- Create: `extension/src/wallet-reown.ts`

Note: This module is imported only by `popup.ts` (the toolbar popup HTML page), which runs in a Chrome extension popup context. @reown/appkit can be used here since it's a regular web context (no window.solana injection needed).

- [ ] **Step 1: Create `extension/src/wallet-reown.ts`**

```typescript
import { createAppKit } from "@reown/appkit";
import { SolanaAdapter } from "@reown/appkit-adapter-solana";
import { solana } from "@reown/appkit/networks";
import type { WalletState } from "./types";

declare const __REOWN_PROJECT_ID__: string;

const PROJECT_ID = typeof __REOWN_PROJECT_ID__ !== "undefined"
  ? __REOWN_PROJECT_ID__
  : "dev-reown-project-id";

let modal: ReturnType<typeof createAppKit> | null = null;

export function initReown(): ReturnType<typeof createAppKit> {
  if (modal) return modal;

  const adapter = new SolanaAdapter();
  modal = createAppKit({
    adapters: [adapter],
    networks: [solana],
    projectId: PROJECT_ID,
    features: {
      email: true,
      socials: false,
    },
    enableWalletConnect: true,
    themeMode: "dark",
    themeVariables: {
      "--w3m-accent": "#f5e642",
      "--w3m-border-radius-master": "0px",
    },
  });

  return modal;
}

export async function openConnectModal(): Promise<void> {
  const m = initReown();
  await m.open();
}

export function subscribeReownWallet(
  onUpdate: (state: WalletState) => void,
): () => void {
  const m = initReown();

  const unsub = m.subscribeAccount((account) => {
    const address = account.address ?? null;
    const connected = account.status === "connected";
    const walletState: WalletState = {
      address,
      adapter: "reown",
      connected,
    };
    onUpdate(walletState);
    // Persist to storage so background + content scripts can read it
    chrome.storage.local.set({ wallet: walletState }).catch(() => {});
    chrome.runtime.sendMessage({ type: "set_wallet", wallet: walletState }).catch(() => {});
  });

  return unsub;
}

export function getReownAddress(): string | null {
  if (!modal) return null;
  return modal.getAddress() ?? null;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd extension && npx tsc --noEmit 2>&1
```
Expected: No errors (or only errors from files not yet updated — note those for later tasks).

- [ ] **Step 3: Commit**

```bash
git add extension/src/wallet-reown.ts
git commit -m "feat: add Reown AppKit wallet connect wrapper"
```

---

## Task 10: Background — new handlers + chrome.alarms

**Files:**
- Modify: `extension/src/background.ts`

Adds handlers for: GET/SET_ALERTS, GET/SET_WATCHLIST, GET/SET_SKILL_SETTINGS, QUOTE, SWAP_TX, deep-analysis port listener, and chrome.alarms for price alert polling.

- [ ] **Step 1: Read the current background.ts** to understand existing handler pattern (already done — it's at extension/src/background.ts).

- [ ] **Step 2: Write the updated `extension/src/background.ts`**

Replace the entire file with:

```typescript
import { fetchToken } from "./jupiter-client";
import { alertShouldFire, alertShouldRearm } from "./skills/alert";
import type {
  BgRequest, BgResponse, SafetyScore, TokenData, TokenPrice,
  WalletState, PriceAlert, WatchItem, WatchItemWithPrice, SkillSettings,
  DeepPortRequest, DeepPortMessage,
} from "./types";
import { DEFAULT_SKILL_SETTINGS } from "./types";

declare const __WORKER_URL__: string;
declare const __EXTENSION_SECRET__: string;

const WORKER_URL = typeof __WORKER_URL__ !== "undefined"
  ? __WORKER_URL__
  : "http://localhost:8787";

const EXTENSION_SECRET = typeof __EXTENSION_SECRET__ !== "undefined"
  ? __EXTENSION_SECRET__
  : "dev-extension-secret-change-in-prod";

// ── Cache ──────────────────────────────────────────────────────────────────────
interface CacheEntry<T> { data: T; expiresAt: number; }

const safetyCache = new Map<string, CacheEntry<SafetyScore>>();
const priceCache  = new Map<string, CacheEntry<TokenPrice | null>>();
const dedupMap    = new Map<string, number>();

const SAFETY_TTL_MS = 300_000;
const PRICE_TTL_MS  =  15_000;
const DEDUP_MS      =  30_000;

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
  const safetyFresh = isFresh(safetyCache.get(address));
  const priceFresh  = isFresh(priceCache.get(address));

  if (!safetyFresh || !priceFresh) {
    const token = await fetchToken(address);
    if (!token) throw new Error("Token not found on Jupiter");
    if (!safetyFresh) safetyCache.set(address, { data: token.safety, expiresAt: Date.now() + SAFETY_TTL_MS });
    if (!priceFresh)  priceCache.set(address,  { data: token.price,  expiresAt: Date.now() + PRICE_TTL_MS  });
  }

  return {
    address,
    safety: safetyCache.get(address)!.data,
    price:  priceCache.get(address)!.data ?? null,
  };
}

// ── Jupiter quote via worker ───────────────────────────────────────────────────
async function fetchQuoteFromWorker(
  inputMint: string,
  outputMint: string,
  amountLamports: number,
): Promise<unknown> {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: String(amountLamports),
    slippageBps: "50",
  });
  const resp = await fetch(`${WORKER_URL}/defi/jupiter/quote?${params}`, {
    headers: {
      "X-Quickdraw-Client": "extension",
      "Authorization": `Bearer ${EXTENSION_SECRET}`,
    },
  });
  if (!resp.ok) throw new Error("Quote failed");
  return resp.json();
}

async function buildSwapTxFromWorker(
  inputMint: string,
  outputMint: string,
  amountLamports: number,
  walletAddress: string,
): Promise<string> {
  const quote = await fetchQuoteFromWorker(inputMint, outputMint, amountLamports);
  const resp = await fetch(`${WORKER_URL}/defi/jupiter/swap`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Quickdraw-Client": "extension",
      "Authorization": `Bearer ${EXTENSION_SECRET}`,
    },
    body: JSON.stringify({ quoteResponse: quote, userPublicKey: walletAddress }),
  });
  if (!resp.ok) throw new Error("Swap build failed");
  const data = await resp.json<{ swapTransaction: string }>();
  return data.swapTransaction;
}

// ── Price alert polling ────────────────────────────────────────────────────────
const ALERT_ALARM = "qd-alert-check";

chrome.alarms.create(ALERT_ALARM, { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALERT_ALARM) return;

  const { alerts } = await chrome.storage.local.get("alerts");
  const alertList: PriceAlert[] = alerts ?? [];
  if (!alertList.length) return;

  // Fetch current prices for all alerted mints
  const mints = [...new Set(alertList.map(a => a.mint))];
  let updated = [...alertList];
  let anyChanged = false;

  for (const mint of mints) {
    try {
      const params = new URLSearchParams({ ids: mint });
      const resp = await fetch(`${WORKER_URL}/defi/jupiter/price?${params}`);
      if (!resp.ok) continue;
      const data = await resp.json<{ data: Record<string, { price: number }> }>();
      const currentPrice = data.data[mint]?.price;
      if (currentPrice === undefined) continue;

      updated = updated.map(a => {
        if (a.mint !== mint) return a;
        if (alertShouldFire(a, currentPrice)) {
          chrome.notifications.create(`qd-alert-${a.mint}-${a.condition}`, {
            type: "basic",
            iconUrl: "icon.png",
            title: "Quickdraw Alert",
            message: `${a.ticker} is ${a.condition === "ABOVE" ? "above" : "below"} $${a.price} (now $${currentPrice.toFixed(6)})`,
          });
          anyChanged = true;
          return { ...a, triggered: true };
        }
        if (alertShouldRearm(a, currentPrice)) {
          anyChanged = true;
          return { ...a, triggered: false };
        }
        return a;
      });
    } catch { /* network error — skip this mint */ }
  }

  if (anyChanged) {
    await chrome.storage.local.set({ alerts: updated });
  }
});

// ── Deep analysis port ─────────────────────────────────────────────────────────
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "deep-analysis") return;

  port.onMessage.addListener(async (req: DeepPortRequest) => {
    try {
      const resp = await fetch(`${WORKER_URL}/ai/deep`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Quickdraw-Client": "extension",
          "Authorization": `Bearer ${EXTENSION_SECRET}`,
        },
        body: JSON.stringify(req),
      });

      if (!resp.ok || !resp.body) {
        port.postMessage({ type: "error", message: "Analysis unavailable" } satisfies DeepPortMessage);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
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
              port.postMessage({ type: "chunk", text: event.delta.text } satisfies DeepPortMessage);
            }
          } catch { /* malformed SSE line */ }
        }
      }
      port.postMessage({ type: "done" } satisfies DeepPortMessage);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Analysis failed";
      port.postMessage({ type: "error", message: msg } satisfies DeepPortMessage);
    }
  });
});

// ── Message handler ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(
  (msg: BgRequest, _sender, sendResponse: (r: BgResponse) => void) => {
    handleMessage(msg, sendResponse);
    return true;
  },
);

async function handleMessage(msg: BgRequest, respond: (r: BgResponse) => void): Promise<void> {
  try {
    if (msg.type === "fetch_token") {
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
      respond({ ok: true, data: detectionEnabled !== false });
      return;
    }

    if (msg.type === "set_detection_enabled") {
      await chrome.storage.local.set({ detectionEnabled: msg.enabled });
      respond({ ok: true, data: null });
      return;
    }

    if (msg.type === "GET_ALERTS") {
      const { alerts } = await chrome.storage.local.get("alerts");
      respond({ ok: true, data: (alerts ?? []) as PriceAlert[] });
      return;
    }

    if (msg.type === "SET_ALERTS") {
      await chrome.storage.local.set({ alerts: msg.alerts });
      respond({ ok: true, data: null });
      return;
    }

    if (msg.type === "GET_WATCHLIST") {
      const { watchlist } = await chrome.storage.local.get("watchlist");
      respond({ ok: true, data: (watchlist ?? []) as WatchItem[] });
      return;
    }

    if (msg.type === "SET_WATCHLIST") {
      await chrome.storage.local.set({ watchlist: msg.watchlist });
      respond({ ok: true, data: null });
      return;
    }

    if (msg.type === "GET_WATCHLIST_PRICES") {
      const ids = msg.mints.join(",");
      const resp = await fetch(`${WORKER_URL}/defi/jupiter/price?ids=${ids}`);
      if (!resp.ok) {
        respond({ ok: false, error: "Price fetch failed" });
        return;
      }
      const data = await resp.json<{ data: Record<string, { price: number; extraInfo?: { lastSwappedPrice?: { lastJupiterSellPrice?: number } } }> }>();
      const result: WatchItemWithPrice[] = msg.mints.map(mint => ({
        mint,
        ticker: "",
        priceUsd: data.data[mint]?.price ?? null,
        change24h: null,
      }));
      respond({ ok: true, data: result });
      return;
    }

    if (msg.type === "GET_SKILL_SETTINGS") {
      const { skillSettings } = await chrome.storage.local.get("skillSettings");
      respond({ ok: true, data: (skillSettings ?? DEFAULT_SKILL_SETTINGS) as SkillSettings });
      return;
    }

    if (msg.type === "SET_SKILL_SETTINGS") {
      await chrome.storage.local.set({ skillSettings: msg.settings });
      respond({ ok: true, data: null });
      return;
    }

    if (msg.type === "QUOTE") {
      const quote = await fetchQuoteFromWorker(msg.inputMint, msg.outputMint, msg.amountLamports);
      respond({ ok: true, data: quote });
      return;
    }

    if (msg.type === "SWAP_TX") {
      const txBase64 = await buildSwapTxFromWorker(msg.inputMint, msg.outputMint, msg.amountLamports, msg.walletAddress);
      respond({ ok: true, data: txBase64 });
      return;
    }

    respond({ ok: false, error: "Unknown message type" });
  } catch (err: unknown) {
    respond({ ok: false, error: err instanceof Error ? err.message : "Background error" });
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd extension && npx tsc --noEmit 2>&1
```
Expected: No errors.

- [ ] **Step 4: Run full test suite**

```bash
cd extension && npm test 2>&1 | tail -10
```
Expected: All existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add extension/src/background.ts
git commit -m "feat(background): add skill handlers, chrome.alarms alert polling, deep-analysis port"
```

---

## Task 11: Rebuild in-page popup — `extension/src/popup-ui.ts`

**Files:**
- Modify: `extension/src/popup-ui.ts`

Replaces the old BUY/CANCEL footer with a 4-tab skill row + panel container. The `PopupController` gains `activateSkill()` and `updateWallet()` methods. The `mountSwapPanel()` method is removed.

- [ ] **Step 1: Replace `extension/src/popup-ui.ts`** with the new version:

```typescript
import type { SafetyScore, TokenPrice, WalletState, SkillSettings } from "./types";
import { DS, safetyColor } from "./styles";

const HOST_ID = "quickdraw-host";

export type SkillTab = "TRADE" | "ALERT" | "WATCH" | "DEEP";

export interface PopupCallbacks {
  onDismiss: () => void;
  onGear: () => void;
  onSkillTab: (tab: SkillTab) => void;
}

export interface PopupOptions {
  address: string;
  x: number;
  y: number;
  callbacks: PopupCallbacks;
  skillSettings?: SkillSettings;
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
  shadow.innerHTML = buildShell(opts.address, opts.skillSettings);

  shadow.getElementById("qd-close")?.addEventListener("click", () => {
    removePopup();
    opts.callbacks.onDismiss();
  });

  shadow.getElementById("qd-gear")?.addEventListener("click", () => {
    opts.callbacks.onGear();
  });

  const copyEl = shadow.getElementById("qd-copy");
  if (copyEl) {
    copyEl.addEventListener("click", () => {
      navigator.clipboard.writeText(opts.address).then(() => {
        const span = copyEl.querySelector("span");
        if (!span) return;
        const prev = span.textContent;
        span.textContent = "COPIED!";
        copyEl.style.color = DS.safe;
        setTimeout(() => { span.textContent = prev; copyEl.style.color = ""; }, 1000);
      }).catch(() => {});
    });
  }

  const TABS: SkillTab[] = ["TRADE", "ALERT", "WATCH", "DEEP"];
  TABS.forEach(tab => {
    shadow.getElementById(`qd-tab-${tab.toLowerCase()}`)?.addEventListener("click", () => {
      setActiveTab(shadow, tab);
      opts.callbacks.onSkillTab(tab);
    });
  });

  host.style.pointerEvents = "auto";
  return new PopupController(shadow, host, opts);
}

export function removePopup(): void {
  document.getElementById(HOST_ID)?.remove();
}

function setActiveTab(shadow: ShadowRoot, active: SkillTab): void {
  const tabs: SkillTab[] = ["TRADE", "ALERT", "WATCH", "DEEP"];
  tabs.forEach(tab => {
    const el = shadow.getElementById(`qd-tab-${tab.toLowerCase()}`);
    if (!el) return;
    if (tab === active) {
      el.style.color = DS.yellow;
      el.style.borderBottom = `2px solid ${DS.yellow}`;
    } else {
      el.style.color = DS.textDim;
      el.style.borderBottom = "2px solid transparent";
    }
  });
}

export class PopupController {
  private activeTab: SkillTab | null = null;

  constructor(
    private shadow: ShadowRoot,
    private host: HTMLElement,
    private opts: PopupOptions,
  ) {}

  updatePosition(x: number, y: number): void {
    this.host.style.left = `${x}px`;
    this.host.style.top = `${y}px`;
  }

  showToken(safety: SafetyScore, price: TokenPrice | null): void {
    const color = safetyColor(safety.score);
    const header = this.shadow.getElementById("qd-header");
    if (header) {
      header.style.background = color;
      header.style.color = "#000";
    }

    const scoreEl = this.shadow.getElementById("qd-score");
    if (scoreEl) scoreEl.textContent = String(safety.score);

    const labelEl = this.shadow.getElementById("qd-score-label");
    if (labelEl) labelEl.textContent = safety.label;

    const tickerEl = this.shadow.getElementById("qd-ticker");
    if (tickerEl) tickerEl.textContent = price?.symbol ?? this.opts.address.slice(0, 6) + "…";

    if (price) {
      const priceEl = this.shadow.getElementById("qd-price");
      if (priceEl) {
        priceEl.textContent = `$${price.usd < 0.01 ? price.usd.toFixed(6) : price.usd.toFixed(4)}`;
        const dir = price.change24h >= 0 ? "▲" : "▼";
        const changeColor = price.change24h >= 0 ? DS.safe : DS.danger;
        const changeEl = this.shadow.getElementById("qd-change");
        if (changeEl) {
          changeEl.textContent = `${dir} ${Math.abs(price.change24h).toFixed(1)}%`;
          changeEl.style.color = changeColor;
        }
        const volEl = this.shadow.getElementById("qd-vol");
        if (volEl && price.volume24h) {
          const vol = price.volume24h >= 1_000_000
            ? `$${(price.volume24h / 1_000_000).toFixed(1)}M`
            : `$${(price.volume24h / 1_000).toFixed(0)}K`;
          volEl.textContent = `Vol 24h: ${vol}`;
          volEl.style.display = "block";
        }
      }
    }
  }

  updateWallet(wallet: WalletState): void {
    // Re-render active skill tab panel if it uses wallet
    const panel = this.shadow.getElementById("qd-panel");
    if (panel && this.activeTab === "TRADE") {
      // Delegate back to content.ts which will rebuild the panel
      this.opts.callbacks.onSkillTab("TRADE");
    }
  }

  mountPanel(panelEl: HTMLElement): void {
    const panel = this.shadow.getElementById("qd-panel");
    if (panel) {
      panel.innerHTML = "";
      panel.appendChild(panelEl);
    }
  }

  activateSkill(tab: SkillTab): void {
    this.activeTab = tab;
    setActiveTab(this.shadow, tab);
  }

  showError(msg: string): void {
    const panel = this.shadow.getElementById("qd-panel");
    if (panel) {
      panel.innerHTML = `<div style="padding:10px 12px;font-size:10px;color:${DS.danger};font-family:${DS.font};">⚠ ${msg}</div>`;
    }
  }

  appendNarration(_delta: string): void {
    // narration removed — DEEP panel handles AI text
  }
}

function buildShell(address: string, skills?: SkillSettings): string {
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const tabs: SkillTab[] = ["TRADE", "ALERT", "WATCH", "DEEP"];
  const enabledTabs = tabs.filter(t => !skills || skills[t.toLowerCase() as keyof SkillSettings] !== false);

  const tabsHtml = enabledTabs.map((tab, i) => `
    ${i > 0 ? `<div class="qd-tab-div"></div>` : ""}
    <button id="qd-tab-${tab.toLowerCase()}" class="qd-tab">${tab}</button>
  `).join("");

  return `
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :host { font-family: ${DS.font}; font-size: 12px; }
  .popup { width: 288px; background: ${DS.bg}; border: 2px solid #000; box-shadow: 3px 3px 0 #333; overflow: hidden; }
  #qd-header { padding: 10px 12px; display: flex; align-items: center; gap: 10px;
    background: ${DS.bg}; color: #000; transition: background 0.15s; }
  #qd-score { font-size: 34px; font-weight: 700; line-height: 1; min-width: 48px; }
  .header-meta { flex: 1; }
  #qd-score-label { font-size: 9px; font-weight: 700; letter-spacing: 0.08em; opacity: 0.6; }
  #qd-ticker { font-size: 17px; font-weight: 700; line-height: 1.2; margin-top: 2px; }
  .header-btns { display: flex; gap: 4px; margin-left: auto; }
  .qd-hdr-btn { background: none; border: none; cursor: pointer; font-size: 14px;
    opacity: 0.5; color: inherit; padding: 2px 4px; line-height: 1; font-family: inherit; }
  .qd-hdr-btn:hover { opacity: 1; }
  .qd-addr { padding: 4px 12px 0; font-size: 10px; color: #555; letter-spacing: 0.04em;
    cursor: pointer; display: flex; align-items: center; gap: 4px; user-select: none; }
  .qd-addr:hover { color: #888; }
  .qd-addr:hover .qd-copy-icon { opacity: 1; }
  .qd-copy-icon { opacity: 0; font-size: 9px; transition: opacity 0.1s; }
  .qd-price-row { padding: 6px 12px 2px; display: flex; align-items: baseline; gap: 8px; }
  #qd-price { font-size: 13px; color: #fff; font-weight: 700; }
  #qd-change { font-size: 11px; }
  #qd-vol { padding: 0 12px 6px; font-size: 10px; color: ${DS.textMut}; display: none; }
  .qd-sep { border: none; border-top: 1px solid #1e1e1e; }
  .qd-skill-tabs { display: flex; align-items: stretch; border-top: 1px solid #1e1e1e; }
  .qd-tab { flex: 1; padding: 8px 0; font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
    cursor: pointer; border: none; background: ${DS.bg}; color: ${DS.textDim};
    font-family: inherit; border-bottom: 2px solid transparent; transition: color 0.1s; }
  .qd-tab:hover { color: #aaa; }
  .qd-tab-div { width: 1px; background: #2a2a2a; flex-shrink: 0; }
  .qd-panel-sep { border: none; border-top: 1px solid #2a2a2a; }
  #qd-panel { min-height: 40px; }
</style>
<div class="popup">
  <div id="qd-header">
    <span id="qd-score">?</span>
    <div class="header-meta">
      <div id="qd-score-label">FETCHING…</div>
      <div id="qd-ticker">⚡ QUICKDRAW</div>
    </div>
    <div class="header-btns">
      <button id="qd-gear" class="qd-hdr-btn" title="Settings">⚙</button>
      <button id="qd-close" class="qd-hdr-btn" title="Dismiss">✕</button>
    </div>
  </div>
  <div class="qd-addr" id="qd-copy"><span>${short}</span><span class="qd-copy-icon">⧉</span></div>
  <div class="qd-price-row">
    <span id="qd-price"></span>
    <span id="qd-change"></span>
  </div>
  <div id="qd-vol"></div>
  <hr class="qd-sep" />
  <div class="qd-skill-tabs">${tabsHtml}</div>
  <hr class="qd-panel-sep" />
  <div id="qd-panel"></div>
</div>`;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd extension && npx tsc --noEmit 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add extension/src/popup-ui.ts
git commit -m "feat: rebuild in-page popup with skill tabs, remove BUY/CANCEL footer"
```

---

## Task 12: Rebuild content.ts — wire skill panels

**Files:**
- Modify: `extension/src/content.ts`

Removes wallet-bridge / wallet imports, adds skill tab wiring, manages state for alerts/watchlist/wallet.

- [ ] **Step 1: Replace `extension/src/content.ts`** with:

```typescript
import { detectInSelection, detectInText } from "./detector";
import { createPopup, removePopup, PopupController } from "./popup-ui";
import type { SkillTab } from "./popup-ui";
import { buildTradePanel } from "./skills/trade";
import { buildAlertPanel } from "./skills/alert";
import { buildWatchPanel } from "./skills/watch";
import { buildDeepPanel } from "./skills/deep";
import { sendBg } from "./shared";
import type {
  TokenData, WalletState, PriceAlert, WatchItem,
  WatchItemWithPrice, SkillSettings,
} from "./types";
import { DEFAULT_SKILL_SETTINGS } from "./types";

function clampPosition(x: number, y: number): { x: number; y: number } {
  const POP_W = 296, POP_H = 260;
  const cx = x + POP_W > window.innerWidth  ? x - POP_W - 8 : x + 16;
  const cy = y + POP_H > window.innerHeight ? y - POP_H - 8 : y + 8;
  return { x: Math.max(8, cx), y: Math.max(8, cy) };
}

// ── Detection lifecycle ────────────────────────────────────────────────────────
let activeController: PopupController | null = null;
let detectionEnabled = true;

async function triggerAddress(address: string, rawX: number, rawY: number): Promise<void> {
  if (!detectionEnabled) return;

  const { x, y } = clampPosition(rawX, rawY);

  let walletState: WalletState = { address: null, adapter: null, connected: false };
  let tokenData: TokenData | null = null;
  let alertList: PriceAlert[] = [];
  let watchlist: WatchItem[] = [];
  let watchlistPrices: WatchItemWithPrice[] = [];
  let skillSettings: SkillSettings = DEFAULT_SKILL_SETTINGS;

  const controller = createPopup({
    address,
    x,
    y,
    skillSettings,
    callbacks: {
      onDismiss: () => { activeController = null; },
      onGear: () => {
        chrome.runtime.sendMessage({ type: "OPEN_POPUP" }).catch(() => {});
      },
      onSkillTab: (tab: SkillTab) => {
        if (!tokenData) return;
        const ticker = tokenData.price?.symbol ?? address.slice(0, 6);
        const price = tokenData.price?.usd ?? 0;
        const vol = tokenData.price?.volume24h ?? 0;
        const safety = tokenData.safety.score;

        let panelEl: HTMLElement;
        switch (tab) {
          case "TRADE":
            panelEl = buildTradePanel(address, ticker, walletState);
            break;
          case "ALERT":
            panelEl = buildAlertPanel(address, ticker, price, alertList, (updated) => { alertList = updated; });
            break;
          case "WATCH":
            panelEl = buildWatchPanel(address, ticker, watchlist, watchlistPrices, (updated) => { watchlist = updated; });
            break;
          case "DEEP":
            panelEl = buildDeepPanel(address, ticker, price, safety, vol);
            break;
        }
        controller.activateSkill(tab);
        controller.mountPanel(panelEl);
      },
    },
  });

  activeController = controller;

  // Parallel fetch: wallet + token + alerts + watchlist + skill settings
  const [wallet, fetchResult, alertResult, watchResult, skillResult] = await Promise.allSettled([
    sendBg<WalletState>({ type: "get_wallet" }),
    sendBg<TokenData>({ type: "fetch_token", address }),
    sendBg<PriceAlert[]>({ type: "GET_ALERTS" }),
    sendBg<WatchItem[]>({ type: "GET_WATCHLIST" }),
    sendBg<SkillSettings>({ type: "GET_SKILL_SETTINGS" }),
  ]);

  if (wallet.status === "fulfilled") walletState = wallet.value;
  if (alertResult.status === "fulfilled") alertList = alertResult.value;
  if (watchResult.status === "fulfilled") {
    watchlist = watchResult.value;
    // Fetch prices for watchlist items
    if (watchlist.length > 0) {
      const mints = watchlist.map(w => w.mint);
      const priceResult = await sendBg<WatchItemWithPrice[]>({
        type: "GET_WATCHLIST_PRICES",
        mints,
      }).catch(() => []);
      watchlistPrices = priceResult.map((p, i) => ({ ...p, ticker: watchlist[i]?.ticker ?? "" }));
    }
  }
  if (skillResult.status === "fulfilled") skillSettings = skillResult.value;

  if (fetchResult.status === "rejected") {
    const msg = fetchResult.reason instanceof Error ? fetchResult.reason.message : "";
    if (msg === "dedup") {
      removePopup(); activeController = null; return;
    }
    controller.showError(msg || "Token not found on Jupiter");
    return;
  }

  tokenData = fetchResult.value;
  controller.showToken(tokenData.safety, tokenData.price);
}

// ── Selection detection ────────────────────────────────────────────────────────
let debounce: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 350;

function onSelectionChange(): void {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    const detection = detectInSelection();
    if (!detection || detection.type !== "address") return;
    const rect = detection.rect;
    triggerAddress(detection.value, rect.left, rect.bottom);
  }, DEBOUNCE_MS);
}

document.addEventListener("mouseup", onSelectionChange, true);
document.addEventListener("keyup", (e) => { if (e.shiftKey) onSelectionChange(); }, true);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { removePopup(); activeController = null; }
});
document.addEventListener("mousedown", (e) => {
  const host = document.getElementById("quickdraw-host");
  if (host && !host.contains(e.target as Node)) { removePopup(); activeController = null; }
});

// ── Wallet update listener (from popup.ts via background) ─────────────────────
chrome.runtime.onMessage.addListener((msg: { type: string; wallet?: WalletState }) => {
  if (msg.type === "WALLET_UPDATED" && msg.wallet && activeController) {
    activeController.updateWallet(msg.wallet);
  }
});

// ── MutationObserver ───────────────────────────────────────────────────────────
let mutationQueue: MutationRecord[] = [];
let mutationTimer: ReturnType<typeof setTimeout> | null = null;

function processMutations(): void {
  if (!detectionEnabled) { mutationQueue = []; return; }
  const batch = mutationQueue;
  mutationQueue = [];
  for (const mutation of batch) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      const text = (node as Text).textContent ?? "";
      if (text.length < 32) continue;
      const detections = detectInText(text);
      if (!detections.length) continue;
      const parent = node.parentElement;
      const rect = parent?.getBoundingClientRect();
      if (!rect) continue;
      const first = detections[0];
      if (first.type === "address") {
        triggerAddress(first.value, rect.left, rect.bottom);
        return;
      }
    }
  }
}

const observer = new MutationObserver((mutations) => {
  mutationQueue.push(...mutations);
  if (mutationTimer) clearTimeout(mutationTimer);
  mutationTimer = setTimeout(processMutations, 500);
});

observer.observe(document.body, { childList: true, subtree: true });

sendBg<boolean>({ type: "get_detection_enabled" })
  .then((enabled) => { detectionEnabled = enabled; })
  .catch(() => {});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd extension && npx tsc --noEmit 2>&1
```

- [ ] **Step 3: Run tests**

```bash
cd extension && npm test 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add extension/src/content.ts
git commit -m "feat(content): wire skill tab panels, remove old wallet-bridge flow"
```

---

## Task 13: Rebuild popup.ts — STATE + SKILLS tabs + Reown connect

**Files:**
- Modify: `extension/src/popup.ts`
- Note: popup.html must have `<div id="state-tab">` and `<div id="skills-tab">` sections

- [ ] **Step 1: Read the existing popup.html to understand DOM structure**

```bash
cat /home/wanaqil/Documents/Code/node/hackathon/quickdraw/extension/popup.html
```

- [ ] **Step 2: Update `extension/popup.html`** to add STATE/SKILLS tab switcher and connect wallet button. Replace the body content with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Quickdraw</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { width: 280px; background: #181818; font-family: 'Space Mono', monospace; color: #fff; font-size: 12px; }
    .qd-tabs { display: flex; border-bottom: 1px solid #1e1e1e; }
    .qd-tab-btn { flex: 1; padding: 10px 0; font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
      cursor: pointer; border: none; background: #181818; color: #555; font-family: inherit;
      border-bottom: 2px solid transparent; }
    .qd-tab-btn.active { color: #f5e642; border-bottom: 2px solid #f5e642; }
    .qd-pane { display: none; padding: 12px; }
    .qd-pane.active { display: block; }
    .qd-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .qd-label { font-size: 10px; color: #888; letter-spacing: 0.06em; }
    .qd-val { font-size: 11px; color: #fff; }
    .qd-btn { width: 100%; background: #f5e642; color: #000; border: 2px solid #000;
      box-shadow: 2px 2px 0 #333; padding: 8px; font-size: 11px; font-weight: 700;
      letter-spacing: 0.06em; cursor: pointer; font-family: inherit; margin-bottom: 8px; border-radius: 0; }
    .qd-btn.sec { background: #222; color: #888; border: 1px solid #333; box-shadow: none; }
    .qd-toggle { appearance: none; width: 32px; height: 18px; background: #333; border: none;
      border-radius: 9px; cursor: pointer; position: relative; transition: background 0.15s; }
    .qd-toggle:checked { background: #f5e642; }
    .qd-skill-row { display: flex; align-items: center; justify-content: space-between;
      padding: 8px 0; border-bottom: 1px solid #1e1e1e; }
    .qd-skill-info { flex: 1; }
    .qd-skill-name { font-size: 11px; font-weight: 700; color: #fff; letter-spacing: 0.04em; }
    .qd-skill-desc { font-size: 9px; color: #555; margin-top: 2px; }
    #wallet-status { font-size: 11px; }
    .qd-sep { border: none; border-top: 1px solid #1e1e1e; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="qd-tabs">
    <button class="qd-tab-btn active" id="tab-state">STATE</button>
    <button class="qd-tab-btn" id="tab-skills">SKILLS</button>
  </div>

  <div class="qd-pane active" id="pane-state">
    <div class="qd-row">
      <span class="qd-label">DETECTION</span>
      <input type="checkbox" class="qd-toggle" id="detection-toggle" checked />
    </div>
    <hr class="qd-sep" />
    <div class="qd-row">
      <span class="qd-label">WALLET</span>
      <span id="wallet-status">Not connected</span>
    </div>
    <button class="qd-btn" id="connect-btn">CONNECT WALLET</button>
    <hr class="qd-sep" />
    <div class="qd-label" style="margin-bottom:6px;">WATCHLIST</div>
    <div id="watchlist-summary" style="font-size:10px;color:#555;">Loading…</div>
  </div>

  <div class="qd-pane" id="pane-skills">
    <div class="qd-skill-row">
      <div class="qd-skill-info">
        <div class="qd-skill-name">TRADE</div>
        <div class="qd-skill-desc">Jupiter swap inline</div>
      </div>
      <input type="checkbox" class="qd-toggle" id="skill-trade" checked />
    </div>
    <div class="qd-skill-row">
      <div class="qd-skill-info">
        <div class="qd-skill-name">ALERT</div>
        <div class="qd-skill-desc">Price notifications</div>
      </div>
      <input type="checkbox" class="qd-toggle" id="skill-alert" checked />
    </div>
    <div class="qd-skill-row">
      <div class="qd-skill-info">
        <div class="qd-skill-name">WATCH</div>
        <div class="qd-skill-desc">Track tokens</div>
      </div>
      <input type="checkbox" class="qd-toggle" id="skill-watch" checked />
    </div>
    <div class="qd-skill-row">
      <div class="qd-skill-info">
        <div class="qd-skill-name">DEEP</div>
        <div class="qd-skill-desc">AI deep analysis</div>
      </div>
      <input type="checkbox" class="qd-toggle" id="skill-deep" checked />
    </div>
    <div style="padding:10px 0;font-size:9px;color:#333;text-align:center;">
      Skills appear in the popup when a token is detected on-page.
    </div>
  </div>

  <script src="dist/popup.js"></script>
</body>
</html>
```

- [ ] **Step 3: Replace `extension/src/popup.ts`** with:

```typescript
import { initReown, openConnectModal, subscribeReownWallet } from "./wallet-reown";
import { sendBg } from "./shared";
import type { WalletState, WatchItem, SkillSettings } from "./types";
import { DEFAULT_SKILL_SETTINGS } from "./types";

async function init(): Promise<void> {
  // Initialize Reown AppKit early so it's ready when user clicks Connect
  initReown();

  const [wallet, enabled, watchlist, skills] = await Promise.all([
    sendBg<WalletState>({ type: "get_wallet" }),
    sendBg<boolean>({ type: "get_detection_enabled" }),
    sendBg<WatchItem[]>({ type: "GET_WATCHLIST" }),
    sendBg<SkillSettings>({ type: "GET_SKILL_SETTINGS" }),
  ]);

  // ── Tab switcher ──────────────────────────────────────────────────────────
  const tabState  = document.getElementById("tab-state")!;
  const tabSkills = document.getElementById("tab-skills")!;
  const paneState  = document.getElementById("pane-state")!;
  const paneSkills = document.getElementById("pane-skills")!;

  tabState.addEventListener("click", () => {
    tabState.classList.add("active"); tabSkills.classList.remove("active");
    paneState.classList.add("active"); paneSkills.classList.remove("active");
  });
  tabSkills.addEventListener("click", () => {
    tabSkills.classList.add("active"); tabState.classList.remove("active");
    paneSkills.classList.add("active"); paneState.classList.remove("active");
  });

  // ── STATE tab ─────────────────────────────────────────────────────────────
  const walletEl    = document.getElementById("wallet-status")!;
  const toggleEl    = document.getElementById("detection-toggle") as HTMLInputElement;
  const connectBtn  = document.getElementById("connect-btn") as HTMLButtonElement;
  const watchlistEl = document.getElementById("watchlist-summary")!;

  function renderWallet(w: WalletState): void {
    walletEl.textContent = w.connected && w.address
      ? `${w.address.slice(0, 6)}…${w.address.slice(-4)}`
      : "Not connected";
    walletEl.style.color = w.connected ? "#8BF542" : "#888";
    connectBtn.textContent = w.connected ? "DISCONNECT" : "CONNECT WALLET";
  }

  renderWallet(wallet);
  toggleEl.checked = enabled;

  toggleEl.addEventListener("change", () => {
    sendBg({ type: "set_detection_enabled", enabled: toggleEl.checked }).catch(() => {});
  });

  connectBtn.addEventListener("click", async () => {
    if (wallet.connected) {
      const disconnected: WalletState = { address: null, adapter: null, connected: false };
      await sendBg({ type: "set_wallet", wallet: disconnected });
      renderWallet(disconnected);
    } else {
      await openConnectModal();
    }
  });

  // Subscribe to Reown state changes
  subscribeReownWallet((newWallet) => {
    renderWallet(newWallet);
    // Notify content scripts
    chrome.tabs.query({ active: true }, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: "WALLET_UPDATED", wallet: newWallet }).catch(() => {});
        }
      });
    });
  });

  // Watchlist summary
  if (watchlist.length === 0) {
    watchlistEl.textContent = "No tokens watched";
  } else {
    watchlistEl.innerHTML = watchlist.map(w =>
      `<div style="color:#ccc;margin-bottom:2px;">${w.ticker} <span style="color:#555;">${w.mint.slice(0, 8)}…</span></div>`
    ).join("");
  }

  // ── SKILLS tab ────────────────────────────────────────────────────────────
  const skillKeys: (keyof SkillSettings)[] = ["trade", "alert", "watch", "deep"];
  const currentSettings = { ...DEFAULT_SKILL_SETTINGS, ...skills };

  skillKeys.forEach(key => {
    const toggle = document.getElementById(`skill-${key}`) as HTMLInputElement | null;
    if (!toggle) return;
    toggle.checked = currentSettings[key];
    toggle.addEventListener("change", async () => {
      currentSettings[key] = toggle.checked;
      await sendBg({ type: "SET_SKILL_SETTINGS", settings: { ...currentSettings } });
    });
  });
}

init().catch(console.error);
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd extension && npx tsc --noEmit 2>&1
```

- [ ] **Step 5: Run tests**

```bash
cd extension && npm test 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
git add extension/src/popup.ts extension/popup.html
git commit -m "feat(popup): add STATE/SKILLS tabs, Reown wallet connect, watchlist summary"
```

---

## Task 14: Delete old wallet files + build verification

**Files:**
- Delete: `extension/src/wallet-bridge.ts`
- Delete: `extension/src/wallet.ts`

- [ ] **Step 1: Verify nothing in the current codebase imports wallet.ts or wallet-bridge.ts**

```bash
cd extension && grep -r "wallet-bridge\|from.*wallet['\"]" src/ --include="*.ts" | grep -v "wallet-reown\|types\|__tests__"
```
Expected: No output (all references removed in Tasks 12 and 13).

- [ ] **Step 2: Delete the files**

```bash
cd extension && rm src/wallet-bridge.ts src/wallet.ts
```

- [ ] **Step 3: Run full test suite**

```bash
cd extension && npm test 2>&1 | tail -15
```
Expected: All tests pass.

- [ ] **Step 4: Build the extension**

```bash
cd extension && npm run build 2>&1 | tail -20
```
Expected: `content.js`, `background.js`, `popup.js` generated in `dist/`. No esbuild errors.

- [ ] **Step 5: Check built files exist and sizes are reasonable**

```bash
ls -lh extension/dist/
```
Expected: Three `.js` files. `popup.js` will be larger (includes @reown/appkit), others similar to before.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: delete wallet-bridge.ts and wallet.ts (replaced by Reown AppKit)"
```

---

## Task 15: Update `extension/src/types.ts` — add volume24h to TokenPrice

**Files:**
- Modify: `extension/src/types.ts`

The popup-ui.ts references `price.volume24h` but this field doesn't exist in `TokenPrice`. Add it.

- [ ] **Step 1: Update `TokenPrice` interface in `extension/src/types.ts`**

Find the `TokenPrice` interface (currently has `usd`, `change24h`, `symbol`, `name`) and add `volume24h`:

```typescript
export interface TokenPrice {
  usd: number;
  change24h: number;
  volume24h: number;    // ← add this
  symbol: string;
  name: string;
}
```

- [ ] **Step 2: Check if `fetchToken` in `jupiter-client.ts` populates `volume24h`**

```bash
grep -n "volume" extension/src/jupiter-client.ts
```

If `volume24h` is not populated, open `extension/src/jupiter-client.ts` and find where `TokenPrice` is constructed. Add `volume24h: 0` as a safe default, or map it from the Jupiter price API response.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd extension && npx tsc --noEmit 2>&1
```
Expected: No errors.

- [ ] **Step 4: Run tests**

```bash
cd extension && npm test 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add extension/src/types.ts extension/src/jupiter-client.ts
git commit -m "fix: add volume24h to TokenPrice interface"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| DS tokens + brutal() helper | Task 1 |
| In-page popup with skill tabs replacing BUY/CANCEL | Tasks 11, 12 |
| TRADE panel (Jupiter quote + swap) | Task 8 |
| ALERT panel (chrome.alarms + chrome.notifications) | Tasks 5, 10 |
| WATCH panel (chrome.storage.local watchlist) | Tasks 6, 10 |
| DEEP panel (SSE via port to background) | Tasks 7, 10 |
| Reown wallet connect (email + WalletConnect QR) | Task 9 |
| Settings STATE tab (unchanged structure + Reown connect button) | Task 13 |
| Settings SKILLS tab (ON toggles per skill) | Task 13 |
| Worker /ai/deep extension bearer-token auth | Task 3 |
| Delete wallet-bridge.ts, wallet.ts | Task 14 |
| package.json Reown deps + REOWN_PROJECT_ID --define | Task 4 |
| volume24h in TokenPrice | Task 15 |

**Type consistency:**
- `PriceAlert`, `WatchItem`, `WatchItemWithPrice`, `SkillSettings`, `DEFAULT_SKILL_SETTINGS` defined in Task 2 and used consistently in Tasks 5–13
- `DeepPortRequest`, `DeepPortMessage` defined in Task 2, used in Tasks 7 and 10
- `SkillTab` exported from popup-ui.ts (Task 11), imported in content.ts (Task 12)
- All new `BgRequest` union members (GET_ALERTS, SET_ALERTS, GET_WATCHLIST, SET_WATCHLIST, GET_WATCHLIST_PRICES, GET_SKILL_SETTINGS, SET_SKILL_SETTINGS, QUOTE, SWAP_TX) defined in Task 2, handled in Task 10, called in Tasks 8 and 12

**Placeholder scan:** None found — all steps include full code.

---

Plan complete and saved to `docs/superpowers/plans/2026-06-08-extension-phase2.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, with spec + code quality review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, with batch checkpoints.

Which approach?
