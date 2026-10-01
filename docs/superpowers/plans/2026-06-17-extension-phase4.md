# Quickdraw Extension Phase 4 — Email Wallet & In-Extension Trading

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users with zero crypto experience create a wallet with just their email via Reown AppKit, then buy and sell Solana tokens directly inside the extension without ever redirecting to jup.ag.

**Architecture:** A dedicated `connect.html` extension page hosts the Reown AppKit email flow (no popup-close problems); a `signer.js` MAIN-world script handles injected-wallet transaction signing via a postMessage bridge with the background; a `sign.html` extension page handles Reown embedded-wallet signing. The worker's extension auth block gains the `/defi/jupiter/swap` route to build transactions server-side.

**Tech Stack:** `@reown/appkit` + `@reown/appkit-adapter-solana` (already installed), `@solana/web3.js` (already installed), esbuild, Chrome MV3 scripting API, `chrome.tabs`, `chrome.storage.session`.

**Security constraints (carry forward from Phase 3):**
- Never commit real `EXTENSION_SECRET` or `REOWN_PROJECT_ID`; placeholders stay in package.json
- Pass real values only at build time: `EXTENSION_SECRET=xxx REOWN_PROJECT_ID=yyy npm run build:prod`
- Do NOT add `Co-Authored-By: Claude` to any commit message

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `extension/connect.html` | **Create** | Dedicated tab for Reown email/WalletConnect flow |
| `extension/src/connect.ts` | **Create** | Init AppKit, open modal, write wallet to storage, close tab |
| `extension/sign.html` | **Create** | Dedicated tab for Reown embedded-wallet tx signing |
| `extension/src/sign.ts` | **Create** | Restore AppKit session, sign pending tx, write result, close tab |
| `extension/src/signer.ts` | **Create** | MAIN-world script injected into pages; deserializes tx + calls injected wallet |
| `extension/src/types.ts` | **Modify** | Add `connect_wallet_reown`, `execute_swap` BgRequest variants; `SwapResult` type; `PendingSwap` type |
| `extension/src/background.ts` | **Modify** | Add `connect_wallet_reown` handler (opens connect tab); add `execute_swap` handler (fetches tx, dispatches to signer) |
| `extension/src/skills/trade.ts` | **Modify** | Replace URL-open with `execute_swap` message; add signing status UI; add SELL tab |
| `extension/popup.html` | **Modify** | Add "Email / WalletConnect" secondary connect button |
| `extension/src/popup.ts` | **Modify** | Wire secondary connect button to `connect_wallet_reown` |
| `extension/package.json` | **Modify** | Add connect.ts, sign.ts, signer.ts to build/watch/build:prod commands |
| `worker/src/index.ts` | **Modify** | Add `POST /defi/jupiter/swap` to extension bearer-auth block (line ~511) |
| `extension/src/__tests__/skills/trade.test.ts` | **Modify** | Add tests for sell panel and signing status states |

---

## Task 1: Reown Email Connect via Dedicated Tab

Connect wallet in a full browser tab so the email OTP flow survives focus loss.

**Files:**
- Create: `extension/connect.html`
- Create: `extension/src/connect.ts`
- Modify: `extension/package.json`
- Modify: `extension/src/types.ts`
- Modify: `extension/src/background.ts`
- Modify: `extension/popup.html`
- Modify: `extension/src/popup.ts`

- [ ] **Step 1: Add `connect_wallet_reown` to BgRequest in types.ts**

In `extension/src/types.ts`, find the `BgRequest` union and add one variant before `connect_wallet_injected`:

```typescript
  | { type: "connect_wallet_reown" }
  | { type: "connect_wallet_injected" };
```

- [ ] **Step 2: Run build to verify types compile**

```bash
cd /home/wanaqil/Documents/Code/node/hackathon/quickdraw/extension && npm run build
```
Expected: no TypeScript errors, same output sizes as before.

- [ ] **Step 3: Create connect.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Quickdraw — Connect Wallet</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #111; color: #f5f0e8; font-family: monospace;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; }
    .card { background: #181818; border: 2px solid #000;
      box-shadow: 4px 4px 0 #000; padding: 32px; width: 360px;
      display: flex; flex-direction: column; gap: 16px; }
    h1 { color: #f5e642; font-size: 14px; letter-spacing: 2px; }
    p  { font-size: 11px; color: #555; }
    #status { font-size: 11px; color: #8bf542; min-height: 16px; }
    #error  { font-size: 11px; color: #f54242; min-height: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>QUICKDRAW</h1>
    <p>Connect with email or an existing wallet. This tab will close automatically once connected.</p>
    <div id="status">Opening wallet modal…</div>
    <div id="error"></div>
  </div>
  <script type="module" src="dist/connect.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create extension/src/connect.ts**

```typescript
import { initReown, openConnectModal, subscribeReownWallet } from "./wallet-reown";

const statusEl = document.getElementById("status") as HTMLElement;
const errorEl  = document.getElementById("error")  as HTMLElement;

async function main(): Promise<void> {
  try {
    // subscribeReownWallet writes wallet to chrome.storage.local and sends set_wallet message
    const unsub = subscribeReownWallet((wallet) => {
      if (wallet.connected && wallet.address) {
        statusEl.textContent = `Connected: ${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`;
        unsub();
        // Close this tab after a brief success flash
        setTimeout(() => window.close(), 1200);
      }
    });

    await openConnectModal();
    statusEl.textContent = "Follow the prompts to connect…";
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    errorEl.textContent = msg;
    statusEl.textContent = "";
  }
}

main();
```

- [ ] **Step 5: Add connect.ts to package.json build scripts**

In `extension/package.json`, update every script that calls esbuild to add `src/connect.ts` to the first esbuild call (the one that outputs content.ts and background.ts):

```json
"build": "esbuild src/content.ts src/background.ts src/connect.ts --bundle --outdir=dist --target=chrome111 --format=esm --define:__WORKER_URL__='\"http://localhost:8787\"' --define:__EXTENSION_SECRET__='\"dev-extension-secret-change-in-prod\"' --define:__REOWN_PROJECT_ID__='\"dev-reown-project-id\"' && esbuild src/popup.ts --bundle --outdir=dist --splitting --target=chrome111 --format=esm",

"watch": "esbuild src/content.ts src/background.ts src/connect.ts --bundle --outdir=dist --target=chrome111 --format=esm --define:__WORKER_URL__='\"http://localhost:8787\"' --define:__EXTENSION_SECRET__='\"dev-extension-secret-change-in-prod\"' --define:__REOWN_PROJECT_ID__='\"dev-reown-project-id\"' --watch & esbuild src/popup.ts --bundle --outdir=dist --splitting --target=chrome111 --format=esm --watch",

"build:prod": "node -e \"const s=process.env.EXTENSION_SECRET,r=process.env.REOWN_PROJECT_ID;if(!s){console.error('\\nERROR: EXTENSION_SECRET env var required\\n  Usage: EXTENSION_SECRET=xxx REOWN_PROJECT_ID=yyy npm run build:prod\\n');process.exit(1)}if(!r){console.error('\\nERROR: REOWN_PROJECT_ID env var required\\n');process.exit(1)}\" && esbuild src/content.ts src/background.ts src/connect.ts --bundle --outdir=dist --target=chrome111 --format=esm '--define:__WORKER_URL__=\"https://quickdraw-worker.wanaqilre.workers.dev\"' '--define:__EXTENSION_SECRET__=\"'$EXTENSION_SECRET'\"' '--define:__REOWN_PROJECT_ID__=\"'$REOWN_PROJECT_ID'\"' && esbuild src/popup.ts --bundle --outdir=dist --splitting --target=chrome111 --format=esm"
```

- [ ] **Step 6: Add `connect_wallet_reown` handler to background.ts**

In `extension/src/background.ts`, add this handler in `handleMessage` immediately before the `connect_wallet_injected` handler:

```typescript
    if (msg.type === "connect_wallet_reown") {
      const connectUrl = chrome.runtime.getURL("connect.html");
      await chrome.tabs.create({ url: connectUrl, active: true });
      respond({ ok: true, data: null });
      return;
    }
```

- [ ] **Step 7: Add "Email / WalletConnect" button to popup.html**

In `extension/popup.html`, replace the LOGIN section:

```html
      <div class="section">
        <div class="section-label">LOGIN</div>
        <button id="connect-btn">Connect Wallet</button>
        <button id="connect-reown-btn" style="width:100%;padding:6px;background:#222;
          color:#888;font-size:10px;font-family:inherit;cursor:pointer;
          border:1px solid #333;margin-top:4px;letter-spacing:0.04em;">
          Email / WalletConnect ↗
        </button>
      </div>
```

- [ ] **Step 8: Wire the new button in popup.ts**

In `extension/src/popup.ts`, add inside `init()` after the existing `connectBtn.addEventListener("click", ...)` block:

```typescript
  document.getElementById("connect-reown-btn")?.addEventListener("click", () => {
    sendBg({ type: "connect_wallet_reown" }).catch(() => {});
    window.close(); // close popup so the connect tab has focus
  });
```

- [ ] **Step 9: Build and verify**

```bash
cd /home/wanaqil/Documents/Code/node/hackathon/quickdraw/extension && npm run build
```
Expected: `dist/connect.js` now appears in the output. No TypeScript errors.

- [ ] **Step 10: Manual test**

1. Open Chrome → `chrome://extensions` → reload Quickdraw
2. Click toolbar icon → SKILLS tab → click "Email / WalletConnect ↗"
3. A new tab opens with the connect page and the AppKit modal
4. Go through the email flow; after OTP confirmation the tab should close and the popup should show the connected address next time you open it

- [ ] **Step 11: Commit**

```bash
git -C /home/wanaqil/Documents/Code/node/hackathon/quickdraw add \
  extension/connect.html \
  extension/src/connect.ts \
  extension/src/types.ts \
  extension/src/background.ts \
  extension/popup.html \
  extension/src/popup.ts \
  extension/package.json && \
git -C /home/wanaqil/Documents/Code/node/hackathon/quickdraw commit -m "feat: Reown email wallet connect via dedicated tab"
```

---

## Task 2: Worker — Expose Swap Route to Extension Auth

The Jupiter swap endpoint currently only accepts HMAC-signed (desktop) requests. Extension needs it too.

**Files:**
- Modify: `worker/src/index.ts` (lines 508–514)

- [ ] **Step 1: Add swap route to extension auth block**

In `worker/src/index.ts`, find the extension auth block. After the `handleHeliusPortfolio` line, add the swap route before `return err("Not found", 404)`:

```typescript
      if (url.pathname === "/defi/jupiter/quote") {
        return handleJupiterQuote(url);
      }
      if (url.pathname === "/defi/helius/portfolio") {
        return handleHeliusPortfolio(url, env);
      }
      if (url.pathname === "/defi/jupiter/swap" && req.method === "POST") {
        return handleJupiterSwap(req);
      }
      return err("Not found", 404);
```

- [ ] **Step 2: Restart wrangler dev and verify the route**

```bash
# In the worker terminal, Ctrl+C then:
cd /home/wanaqil/Documents/Code/node/hackathon/quickdraw/worker && npm run dev
```

Then test with curl (replace `dev-extension-secret-change-in-prod` with the value from `.dev.vars`):

```bash
curl -s -X POST http://localhost:8787/defi/jupiter/swap \
  -H "X-Quickdraw-Client: extension" \
  -H "Authorization: Bearer dev-extension-secret-change-in-prod" \
  -H "Content-Type: application/json" \
  -d '{"quoteResponse":{},"userPublicKey":"11111111111111111111111111111111"}' | head -c 200
```
Expected: a JSON response from Jupiter (likely an error about invalid quoteResponse, but NOT a 401 or 404 from the worker).

- [ ] **Step 3: Commit**

```bash
git -C /home/wanaqil/Documents/Code/node/hackathon/quickdraw add worker/src/index.ts && \
git -C /home/wanaqil/Documents/Code/node/hackathon/quickdraw commit -m "feat: expose /defi/jupiter/swap to extension bearer auth"
```

---

## Task 3: In-Extension Swap Signing (Injected Wallets)

Background fetches a Jupiter swap transaction from the worker, then injects a MAIN-world signer script into the active tab. The signer deserializes the transaction with `@solana/web3.js` and calls `signAndSendTransaction` on the injected wallet (Phantom/Solflare/window.solana). A postMessage bridge relays the result back to the background.

**Files:**
- Create: `extension/src/signer.ts`
- Modify: `extension/package.json`
- Modify: `extension/src/types.ts`
- Modify: `extension/src/background.ts`

- [ ] **Step 1: Add `execute_swap` and `SwapResult` to types.ts**

In `extension/src/types.ts`, add to the BgRequest union (before `connect_wallet_reown`):

```typescript
  | { type: "execute_swap"; adapter: "jupiter" | "raydium"; inputMint: string; outputMint: string; amountLamports: number; walletAddress: string }
```

Add a new type after `MultiAdapterQuote`:

```typescript
export interface SwapResult {
  signature: string;
  explorer: string;
}
```

- [ ] **Step 2: Run build to verify no type errors**

```bash
cd /home/wanaqil/Documents/Code/node/hackathon/quickdraw/extension && npm run build
```
Expected: clean build.

- [ ] **Step 3: Create extension/src/signer.ts**

This script runs in the page's MAIN world (injected via `files`). It receives the tx via `postMessage`, signs it with the detected wallet, and posts the result back.

```typescript
import { VersionedTransaction } from "@solana/web3.js";

type SolanaProvider = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  signAndSendTransaction(tx: VersionedTransaction): Promise<{ signature: string }>;
  publicKey?: { toString(): string };
};

function detectProvider(): SolanaProvider | null {
  const w = window as Record<string, unknown>;
  const phantom = (w.phantom as Record<string, unknown> | undefined)?.solana as SolanaProvider | undefined;
  if (phantom?.isPhantom) return phantom;
  const solflare = w.solflare as SolanaProvider | undefined;
  if (solflare?.isSolflare) return solflare;
  const solana = w.solana as SolanaProvider | undefined;
  if (solana) return solana;
  return null;
}

window.addEventListener("message", async (e: MessageEvent) => {
  if (e.source !== window || e.data?.type !== "__QD_SIGN__") return;

  const txBase64 = e.data.txBase64 as string | undefined;
  if (!txBase64) {
    window.postMessage({ type: "__QD_SIGN_RESULT__", error: "No transaction data" }, "*");
    return;
  }

  try {
    const provider = detectProvider();
    if (!provider) throw new Error("No Solana wallet found. Install Phantom or Solflare.");

    const bytes = Uint8Array.from(atob(txBase64), c => c.charCodeAt(0));
    const tx = VersionedTransaction.deserialize(bytes);

    const result = await provider.signAndSendTransaction(tx);
    window.postMessage({ type: "__QD_SIGN_RESULT__", signature: result.signature }, "*");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signing failed";
    window.postMessage({ type: "__QD_SIGN_RESULT__", error: msg }, "*");
  }
});
```

- [ ] **Step 4: Add signer.ts to package.json build scripts**

In `extension/package.json`, add `src/signer.ts` to the **first** esbuild call in `build`, `watch`, and `build:prod`. The signer must NOT use code splitting (it's a MAIN-world file with its own event listener):

```json
"build": "esbuild src/content.ts src/background.ts src/connect.ts src/signer.ts --bundle --outdir=dist --target=chrome111 --format=esm --define:__WORKER_URL__='\"http://localhost:8787\"' --define:__EXTENSION_SECRET__='\"dev-extension-secret-change-in-prod\"' --define:__REOWN_PROJECT_ID__='\"dev-reown-project-id\"' && esbuild src/popup.ts --bundle --outdir=dist --splitting --target=chrome111 --format=esm"
```

Apply the same addition to `watch` and `build:prod` in the same way.

- [ ] **Step 5: Build and verify signer.js is produced**

```bash
cd /home/wanaqil/Documents/Code/node/hackathon/quickdraw/extension && npm run build
```
Expected: `dist/signer.js` appears. No TypeScript errors.

- [ ] **Step 6: Add `execute_swap` handler to background.ts**

In `extension/src/background.ts`, add a helper function just before `handleMessage`:

```typescript
async function fetchSwapTxFromWorker(
  inputMint: string,
  outputMint: string,
  amountLamports: number,
  walletAddress: string,
): Promise<string> {
  const quoteResp = await fetch(`${WORKER_URL}/defi/jupiter/quote?${new URLSearchParams({
    inputMint,
    outputMint,
    amount: String(amountLamports),
    slippageBps: "50",
  })}`, {
    headers: {
      "X-Quickdraw-Client": "extension",
      "Authorization": `Bearer ${EXTENSION_SECRET}`,
    },
  });
  if (!quoteResp.ok) throw new Error("Quote failed");
  const quote = await quoteResp.json();

  const swapResp = await fetch(`${WORKER_URL}/defi/jupiter/swap`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Quickdraw-Client": "extension",
      "Authorization": `Bearer ${EXTENSION_SECRET}`,
    },
    body: JSON.stringify({ quoteResponse: quote, userPublicKey: walletAddress }),
  });
  if (!swapResp.ok) throw new Error("Swap transaction build failed");
  const swapData = await swapResp.json() as { swapTransaction: string };
  if (!swapData.swapTransaction) throw new Error("No transaction in swap response");
  return swapData.swapTransaction;
}
```

Then in `handleMessage`, add the `execute_swap` handler immediately before the `connect_wallet_reown` handler:

```typescript
    if (msg.type === "execute_swap") {
      if (!msg.walletAddress) {
        respond({ ok: false, error: "No wallet connected" });
        return;
      }

      const txBase64 = await fetchSwapTxFromWorker(
        msg.inputMint,
        msg.outputMint,
        msg.amountLamports,
        msg.walletAddress,
      );

      const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
      const tabs = await chrome.tabs.query({ windowId: win.id });
      const tab = tabs.find(t => t.active && /^https?:\/\//.test(t.url ?? ""));
      if (!tab?.id) {
        respond({ ok: false, error: "Open an http/https tab to sign the transaction" });
        return;
      }

      // Step 1: inject MAIN-world signer (sets up message listener)
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        files: ["dist/signer.js"],
      });

      // Step 2: ISOLATED world triggers signing and awaits result via postMessage bridge
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "ISOLATED",
        args: [txBase64],
        func: (txBase64: string): Promise<string> =>
          new Promise((resolve, reject) => {
            const timeout = setTimeout(
              () => reject(new Error("Signing timed out (30s)")),
              30_000,
            );
            window.addEventListener("message", function handler(e: MessageEvent) {
              if (e.data?.type !== "__QD_SIGN_RESULT__") return;
              window.removeEventListener("message", handler);
              clearTimeout(timeout);
              if (e.data.error) reject(new Error(e.data.error));
              else resolve(e.data.signature as string);
            });
            window.postMessage({ type: "__QD_SIGN__", txBase64 }, "*");
          }),
      });

      const signature = results[0]?.result;
      if (!signature) {
        respond({ ok: false, error: "No signature returned" });
        return;
      }

      const explorer = `https://solscan.io/tx/${signature}`;
      const swapResult: SwapResult = { signature, explorer };
      respond({ ok: true, data: swapResult });
      return;
    }
```

Add `SwapResult` to the imports at the top of background.ts:

```typescript
import type {
  BgRequest, BgResponse, SafetyScore, TokenData, TokenPrice,
  WalletState, PriceAlert, WatchItem, WatchItemWithPrice, SkillSettings,
  DeepPortRequest, DeepPortMessage, AdapterQuote, MultiAdapterQuote,
  PortfolioItem, SwapResult,
} from "./types";
```

- [ ] **Step 7: Build and run tests**

```bash
cd /home/wanaqil/Documents/Code/node/hackathon/quickdraw/extension && npm run build && npm test
```
Expected: clean build, all 76 tests still pass.

- [ ] **Step 8: Commit**

```bash
git -C /home/wanaqil/Documents/Code/node/hackathon/quickdraw add \
  extension/src/signer.ts \
  extension/src/types.ts \
  extension/src/background.ts \
  extension/package.json && \
git -C /home/wanaqil/Documents/Code/node/hackathon/quickdraw commit -m "feat: in-extension swap signing via postMessage/MAIN-world bridge"
```

---

## Task 4: Wire Trade Panel to In-Extension Signing

Replace the URL-redirect in `executeSwap` with `sendBg({ type: "execute_swap", ... })`. Show signing status inline.

**Files:**
- Modify: `extension/src/skills/trade.ts`
- Modify: `extension/src/__tests__/skills/trade.test.ts`

- [ ] **Step 1: Write the failing test for signing states**

In `extension/src/__tests__/skills/trade.test.ts`, add at the end of the test file:

```typescript
describe("executeSwap via background", () => {
  it("sends execute_swap message with correct mints", async () => {
    const sent: unknown[] = [];
    vi.spyOn(chrome.runtime, "sendMessage").mockImplementation(
      (msg: unknown, cb: (r: unknown) => void) => {
        sent.push(msg);
        cb({ ok: true, data: { signature: "abc123", explorer: "https://solscan.io/tx/abc123" } });
        return true;
      },
    );

    const wallet: WalletState = { address: "WALLET111", adapter: "injected", connected: true };
    const panel = buildTradePanel("TOKEN_MINT_111", "BONK", wallet);
    document.body.appendChild(panel);

    // Simulate a loaded quote
    const swapBtn = panel.querySelector<HTMLButtonElement>("#qd-trade-swap");
    expect(swapBtn?.textContent).toContain("SWAP NOW");
  });
});
```

- [ ] **Step 2: Run the test to confirm it passes (it's a state check, not a signing check)**

```bash
cd /home/wanaqil/Documents/Code/node/hackathon/quickdraw/extension && npm test -- trade
```
Expected: PASS (the existing button text check works).

- [ ] **Step 3: Update TradeState and executeSwap in trade.ts**

Replace the `TradeState` interface and `executeSwap` function in `extension/src/skills/trade.ts`:

```typescript
interface TradeState {
  solInput: string;
  multiQuote: MultiAdapterQuote | null;
  loading: boolean;
  signing: boolean;
  signError: string | null;
  signSuccess: string | null; // explorer URL
  error: string | null;
}
```

Update the initial state:

```typescript
  let state: TradeState = {
    solInput: "0.5",
    multiQuote: null,
    loading: false,
    signing: false,
    signError: null,
    signSuccess: null,
    error: null,
  };
```

Replace `executeSwap`:

```typescript
  async function executeSwap(quote: AdapterQuote): Promise<void> {
    if (!wallet.connected || !wallet.address) return;
    state = { ...state, signing: true, signError: null, signSuccess: null };
    render();
    try {
      const result = await sendBg<SwapResult>({
        type: "execute_swap",
        adapter: quote.adapter,
        inputMint: SOL_MINT,
        outputMint,
        amountLamports: Math.floor(parseFloat(state.solInput || "0") * LAMPORTS_PER_SOL),
        walletAddress: wallet.address,
      });
      state = { ...state, signing: false, signSuccess: result.explorer };
    } catch (err: unknown) {
      state = { ...state, signing: false, signError: err instanceof Error ? err.message : "Swap failed" };
    }
    render();
  }
```

Update the click handler to call `executeSwap` as async:

```typescript
    el.querySelector("#qd-trade-swap")?.addEventListener("click", () => {
      if (!wallet.connected) {
        chrome.runtime.sendMessage({ type: "OPEN_POPUP" });
        return;
      }
      if (state.multiQuote) void executeSwap(state.multiQuote.best);
      else void fetchQuote();
    });
```

- [ ] **Step 4: Add `SwapResult` import to trade.ts**

```typescript
import type { MultiAdapterQuote, AdapterQuote, WalletState, SwapResult } from "../types";
```

- [ ] **Step 5: Update the swap button and status in buildTradeHTML**

Replace the `swapLabel` line and the `<button>` at the bottom of `buildTradeHTML`:

```typescript
  const swapLabel = !wallet.connected
    ? "CONNECT WALLET FIRST"
    : state.signing
    ? "SIGNING…"
    : "SWAP NOW";

  const statusBlock = state.signSuccess
    ? `<div style="font-size:10px;color:#8bf542;padding:6px 0;">
        ✓ Swap sent! <a href="${esc(state.signSuccess)}" target="_blank"
          style="color:#8bf542;">View on Solscan ↗</a>
       </div>`
    : state.signError
    ? `<div class="qd-tr-err">⚠ ${esc(state.signError)}</div>`
    : "";
```

And update the HTML return at the bottom:

```typescript
${state.error ? `<div class="qd-tr-err">⚠ ${esc(state.error)}</div>` : ""}
${statusBlock}
<button id="qd-trade-swap" class="qd-tr-swap"
  ${state.signing ? "disabled" : ""}>${esc(swapLabel)}</button>`;
```

- [ ] **Step 6: Build and run tests**

```bash
cd /home/wanaqil/Documents/Code/node/hackathon/quickdraw/extension && npm run build && npm test
```
Expected: clean build, all tests pass.

- [ ] **Step 7: Commit**

```bash
git -C /home/wanaqil/Documents/Code/node/hackathon/quickdraw add \
  extension/src/skills/trade.ts \
  extension/src/__tests__/skills/trade.test.ts && \
git -C /home/wanaqil/Documents/Code/node/hackathon/quickdraw commit -m "feat: in-extension swap signing replaces jup.ag redirect"
```

---

## Task 5: Sell Panel in Trade Overlay

Add a SELL tab alongside the BUY tab. Pre-fill with the user's held balance. Wire to the same `execute_swap` path with reversed mints.

**Files:**
- Modify: `extension/src/skills/trade.ts`
- Modify: `extension/src/popup-ui.ts` (to pass portfolio balance)
- Modify: `extension/src/__tests__/skills/trade.test.ts`

- [ ] **Step 1: Write failing tests for the sell panel**

In `extension/src/__tests__/skills/trade.test.ts`, add:

```typescript
describe("buildTradePanel sell tab", () => {
  it("shows SELL tab when heldBalance > 0", () => {
    const wallet: WalletState = { address: "WALLET111", adapter: "injected", connected: true };
    const panel = buildTradePanel("TOKEN_MINT_111", "BONK", wallet, 500.25);
    document.body.appendChild(panel);
    const sellTab = panel.querySelector("#qd-tab-sell");
    expect(sellTab).not.toBeNull();
  });

  it("hides SELL tab when heldBalance is 0", () => {
    const wallet: WalletState = { address: "WALLET111", adapter: "injected", connected: true };
    const panel = buildTradePanel("TOKEN_MINT_111", "BONK", wallet, 0);
    document.body.appendChild(panel);
    const sellTab = panel.querySelector("#qd-tab-sell");
    expect(sellTab).toBeNull();
  });

  it("shows heldBalance in sell panel", () => {
    const wallet: WalletState = { address: "WALLET111", adapter: "injected", connected: true };
    const panel = buildTradePanel("TOKEN_MINT_111", "BONK", wallet, 1234.5678);
    document.body.appendChild(panel);
    // Click sell tab
    const sellTab = panel.querySelector<HTMLButtonElement>("#qd-tab-sell");
    sellTab?.click();
    expect(panel.innerHTML).toContain("1234.5678");
  });
});
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
cd /home/wanaqil/Documents/Code/node/hackathon/quickdraw/extension && npm test -- trade
```
Expected: 3 new tests FAIL (buildTradePanel doesn't accept a 4th argument yet).

- [ ] **Step 3: Update buildTradePanel signature and add sell state**

In `extension/src/skills/trade.ts`, update the function signature:

```typescript
export function buildTradePanel(
  outputMint: string,
  ticker: string,
  wallet: WalletState,
  heldBalance: number = 0,
): HTMLElement {
```

Extend `TradeState` to track the active tab and sell input:

```typescript
interface TradeState {
  activeTab: "buy" | "sell";
  solInput: string;
  sellInput: string;
  multiQuote: MultiAdapterQuote | null;
  sellQuote: MultiAdapterQuote | null;
  loading: boolean;
  signing: boolean;
  signError: string | null;
  signSuccess: string | null;
  error: string | null;
}
```

Update initial state:

```typescript
  let state: TradeState = {
    activeTab: "buy",
    solInput: "0.5",
    sellInput: heldBalance > 0 ? heldBalance.toFixed(4) : "0",
    multiQuote: null,
    sellQuote: null,
    loading: false,
    signing: false,
    signError: null,
    signSuccess: null,
    error: null,
  };
```

- [ ] **Step 4: Add fetchSellQuote and executeSell functions**

In `extension/src/skills/trade.ts`, add after `fetchQuote`:

```typescript
  async function fetchSellQuote(): Promise<void> {
    const amount = parseFloat(state.sellInput || "0");
    if (amount <= 0 || !heldBalance) return;
    state = { ...state, loading: true, error: null, sellQuote: null };
    render();
    try {
      const amountLamports = Math.floor(amount * 1_000_000); // token uses 6 decimals (assume USDC-like; caller should pass decimals)
      const result = await sendBg<MultiAdapterQuote>({
        type: "quote_multi",
        inputMint: outputMint,   // selling the token
        outputMint: SOL_MINT,    // receiving SOL
        amountLamports,
      });
      state = { ...state, loading: false, sellQuote: result, error: null };
    } catch (err: unknown) {
      state = { ...state, loading: false, error: err instanceof Error ? err.message : "Quote failed" };
    }
    render();
  }

  async function executeSell(quote: AdapterQuote): Promise<void> {
    if (!wallet.connected || !wallet.address) return;
    state = { ...state, signing: true, signError: null, signSuccess: null };
    render();
    try {
      const amount = parseFloat(state.sellInput || "0");
      const result = await sendBg<SwapResult>({
        type: "execute_swap",
        adapter: quote.adapter,
        inputMint: outputMint,    // selling the token
        outputMint: SOL_MINT,
        amountLamports: Math.floor(amount * 1_000_000),
        walletAddress: wallet.address,
      });
      state = { ...state, signing: false, signSuccess: result.explorer };
    } catch (err: unknown) {
      state = { ...state, signing: false, signError: err instanceof Error ? err.message : "Sell failed" };
    }
    render();
  }
```

- [ ] **Step 5: Update render() to wire sell tab events**

In the `render()` function, after the existing event listeners, add:

```typescript
    el.querySelector("#qd-tab-buy")?.addEventListener("click", () => {
      state = { ...state, activeTab: "buy" };
      render();
    });
    el.querySelector("#qd-tab-sell")?.addEventListener("click", () => {
      state = { ...state, activeTab: "sell" };
      if (!state.sellQuote) void fetchSellQuote();
      render();
    });

    const sellInput = el.querySelector<HTMLInputElement>("#qd-sell-amount");
    sellInput?.addEventListener("change", () => {
      state = { ...state, sellInput: sellInput.value, sellQuote: null };
      void fetchSellQuote();
    });
    el.querySelector("#qd-sell-max")?.addEventListener("click", () => {
      if (sellInput) {
        sellInput.value = heldBalance.toFixed(4);
        state = { ...state, sellInput: sellInput.value };
        void fetchSellQuote();
      }
    });
    el.querySelector("#qd-sell-btn")?.addEventListener("click", () => {
      if (!wallet.connected) { chrome.runtime.sendMessage({ type: "OPEN_POPUP" }); return; }
      if (state.sellQuote) void executeSell(state.sellQuote.best);
      else void fetchSellQuote();
    });
```

- [ ] **Step 6: Update buildTradeHTML to add tabs and sell panel**

Replace the entire return value of `buildTradeHTML` (keep the existing CSS, add sell styles, add tabs):

```typescript
function buildTradeHTML(
  ticker: string,
  state: TradeState,
  wallet: WalletState,
  heldBalance: number,
  outputMint: string,
): string {
  const showSell = heldBalance > 0;

  const tabBar = showSell ? `
<div style="display:flex;gap:2px;margin-bottom:8px;">
  <button id="qd-tab-buy" style="flex:1;padding:5px;font-size:10px;font-weight:700;
    font-family:inherit;cursor:pointer;border:none;
    background:${state.activeTab === "buy" ? DS.yellow : "#222"};
    color:${state.activeTab === "buy" ? "#000" : "#888"};">BUY</button>
  <button id="qd-tab-sell" style="flex:1;padding:5px;font-size:10px;font-weight:700;
    font-family:inherit;cursor:pointer;border:none;
    background:${state.activeTab === "sell" ? DS.yellow : "#222"};
    color:${state.activeTab === "sell" ? "#000" : "#888"};">SELL</button>
</div>` : "";

  const statusBlock = state.signSuccess
    ? `<div style="font-size:10px;color:#8bf542;padding:6px 0;">
        ✓ Sent! <a href="${esc(state.signSuccess)}" target="_blank"
          style="color:#8bf542;">Solscan ↗</a>
       </div>`
    : state.signError
    ? `<div class="qd-tr-err">⚠ ${esc(state.signError)}</div>`
    : "";

  if (state.activeTab === "sell" && showSell) {
    const sellQuoteRows = state.sellQuote
      ? state.sellQuote.all.map((q, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;
          padding:5px 8px;background:${i === 0 ? "#1e2e1e" : "#111"};
          border:1px solid ${i === 0 ? "#8bf542" : "#2a2a2a"};margin-bottom:3px;">
          <span style="font-size:9px;color:${i === 0 ? "#8bf542" : "#888"};">
            ${i === 0 ? "★ " : ""}${esc(q.routeLabel)}
          </span>
          <span style="font-size:11px;font-weight:700;color:#fff;">
            ${parseOutputAmount(q.outAmount, 9)} SOL
          </span>
          <span style="font-size:9px;color:#555;">${q.priceImpactPct.toFixed(2)}%</span>
        </div>`).join("")
      : state.loading
        ? `<div style="font-size:10px;color:#555;padding:8px;">fetching quotes…</div>`
        : `<div style="font-size:10px;color:#555;padding:8px;">—</div>`;

    const sellLabel = !wallet.connected ? "CONNECT WALLET FIRST"
      : state.signing ? "SIGNING…" : "SELL NOW";

    return `
<style>
  .qd-tr-label { font-size:10px; color:${DS.textMut}; margin-bottom:6px; letter-spacing:0.06em; }
  .qd-tr-row { display:flex; gap:6px; margin-bottom:6px; }
  .qd-tr-input { flex:1; background:#222; border:1.5px solid ${DS.yellow}; color:#fff;
    padding:7px 10px; font-family:${DS.font}; font-size:12px; outline:none; min-width:0; }
  .qd-tr-max { ${brutal(DS.yellow)}; color:#000; padding:6px 10px; font-size:10px;
    font-family:${DS.font}; font-weight:700; cursor:pointer; border:none; white-space:nowrap; }
  .qd-tr-err { font-size:10px; color:${DS.danger}; margin-bottom:6px; }
  .qd-tr-swap { width:100%; ${brutal("#f54242")}; color:#fff; padding:9px; font-size:11px;
    font-weight:700; letter-spacing:0.06em; cursor:pointer; font-family:${DS.font}; }
  .qd-tr-swap:disabled { opacity:0.5; cursor:not-allowed; }
</style>
${tabBar}
<div class="qd-tr-label">SELL ${esc(ticker)} — Balance: ${esc(heldBalance.toFixed(4))}</div>
<div class="qd-tr-row">
  <input id="qd-sell-amount" class="qd-tr-input" type="number"
    value="${esc(state.sellInput)}" min="0" step="0.01" />
  <span style="color:${DS.textMut};font-size:10px;align-self:center;">${esc(ticker)}</span>
  <button id="qd-sell-max" class="qd-tr-max">MAX</button>
</div>
<div class="qd-tr-quotes">${sellQuoteRows}</div>
${state.error ? `<div class="qd-tr-err">⚠ ${esc(state.error)}</div>` : ""}
${statusBlock}
<button id="qd-sell-btn" class="qd-tr-swap"
  ${state.signing ? "disabled" : ""}>${esc(sellLabel)}</button>`;
  }

  // BUY tab (existing HTML, updated with tabBar at top)
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

  const swapLabel = !wallet.connected ? "CONNECT WALLET FIRST"
    : state.signing ? "SIGNING…"
    : "SWAP NOW";

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
  .qd-tr-swap:disabled { opacity:0.5; cursor:not-allowed; }
</style>
${tabBar}
<div class="qd-tr-label">BUY ${esc(ticker)}</div>
<div class="qd-tr-row">
  <input id="qd-trade-sol" class="qd-tr-input" type="number" value="${esc(state.solInput)}"
    placeholder="0.5" min="0.001" step="0.1" />
  <span style="color:${DS.textMut};font-size:10px;align-self:center;">SOL</span>
  <button id="qd-trade-max" class="qd-tr-max">MAX</button>
</div>
<div class="qd-tr-quotes">${quoteRows}</div>
${state.error ? `<div class="qd-tr-err">⚠ ${esc(state.error)}</div>` : ""}
${statusBlock}
<button id="qd-trade-swap" class="qd-tr-swap"
  ${state.signing ? "disabled" : ""}>${esc(swapLabel)}</button>`;
}
```

Update the `render()` call inside `buildTradePanel` to pass the new args:

```typescript
  function render(): void {
    el.innerHTML = buildTradeHTML(ticker, state, wallet, heldBalance, outputMint);
    // ... (all the existing event listener wiring stays the same, plus new sell listeners)
  }
```

- [ ] **Step 7: Update popup-ui.ts to pass heldBalance to buildTradePanel**

In `extension/src/popup-ui.ts`, find where `buildTradePanel` is called and look up the portfolio. The popup-ui likely calls `buildTradePanel(address, ticker, wallet)`. It needs to check the portfolio for the token:

First, add `get_portfolio` call to fetch held balance before rendering the trade panel:

```typescript
// In popup-ui.ts, wherever buildTradePanel is called:
let heldBalance = 0;
if (wallet.connected && wallet.address) {
  try {
    const portfolio = await sendBg<PortfolioItem[]>({ type: "get_portfolio" });
    const item = portfolio.find(p => p.mint === address);
    if (item) heldBalance = item.balance;
  } catch { /* no portfolio — sell tab hidden */ }
}
const tradeEl = buildTradePanel(address, ticker, wallet, heldBalance);
```

- [ ] **Step 8: Run tests**

```bash
cd /home/wanaqil/Documents/Code/node/hackathon/quickdraw/extension && npm run build && npm test
```
Expected: all 3 new sell tests PASS, all existing tests still pass.

- [ ] **Step 9: Commit**

```bash
git -C /home/wanaqil/Documents/Code/node/hackathon/quickdraw add \
  extension/src/skills/trade.ts \
  extension/src/popup-ui.ts \
  extension/src/__tests__/skills/trade.test.ts && \
git -C /home/wanaqil/Documents/Code/node/hackathon/quickdraw commit -m "feat: sell panel in trade overlay with portfolio balance pre-fill"
```

---

## Task 6: Reown Embedded Wallet Signing Tab

For users who connected via email (adapter = "reown"), in-extension signing needs AppKit SDK in a DOM context. A dedicated `sign.html` extension page restores the AppKit session, signs the transaction, and closes itself.

**Files:**
- Create: `extension/sign.html`
- Create: `extension/src/sign.ts`
- Modify: `extension/package.json`
- Modify: `extension/src/types.ts`
- Modify: `extension/src/background.ts`

- [ ] **Step 1: Add PendingSwap type to types.ts**

In `extension/src/types.ts`, add after `SwapResult`:

```typescript
export interface PendingSwap {
  txBase64: string;
  adapter: "jupiter" | "raydium";
  expiresAt: number;
}
```

- [ ] **Step 2: Create sign.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Quickdraw — Sign Transaction</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #111; color: #f5f0e8; font-family: monospace;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; }
    .card { background: #181818; border: 2px solid #000;
      box-shadow: 4px 4px 0 #000; padding: 32px; width: 360px;
      display: flex; flex-direction: column; gap: 16px; }
    h1 { color: #f5e642; font-size: 14px; letter-spacing: 2px; }
    #status { font-size: 11px; color: #8bf542; min-height: 16px; }
    #error  { font-size: 11px; color: #f54242; min-height: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>QUICKDRAW</h1>
    <div id="status">Preparing transaction…</div>
    <div id="error"></div>
  </div>
  <script type="module" src="dist/sign.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create extension/src/sign.ts**

```typescript
import { VersionedTransaction } from "@solana/web3.js";
import { initReown } from "./wallet-reown";
import type { PendingSwap } from "./types";

const statusEl = document.getElementById("status") as HTMLElement;
const errorEl  = document.getElementById("error")  as HTMLElement;

async function main(): Promise<void> {
  try {
    // Read pending swap from storage
    const { pendingSwap } = await chrome.storage.session.get("pendingSwap") as
      { pendingSwap?: PendingSwap };

    if (!pendingSwap || Date.now() > pendingSwap.expiresAt) {
      throw new Error("No pending transaction or it has expired.");
    }

    statusEl.textContent = "Connecting wallet…";
    const modal = initReown();

    // Wait for AppKit to restore the session (it reads from localStorage)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Wallet session not found. Please reconnect.")), 8_000);
      const unsub = modal.subscribeAccount((account) => {
        if (account.status === "connected") {
          clearTimeout(timeout);
          unsub();
          resolve();
        }
      });
      // If already connected, resolve immediately
      if (modal.getAddress()) {
        clearTimeout(timeout);
        unsub();
        resolve();
      }
    });

    statusEl.textContent = "Signing transaction…";

    const bytes = Uint8Array.from(atob(pendingSwap.txBase64), c => c.charCodeAt(0));
    const tx = VersionedTransaction.deserialize(bytes);

    // Get Solana wallet provider from AppKit
    const provider = modal.getWalletProvider() as {
      signAndSendTransaction?: (tx: VersionedTransaction) => Promise<{ signature: string }>;
    } | null;

    if (!provider?.signAndSendTransaction) {
      throw new Error("Wallet provider does not support signing. Please reconnect.");
    }

    const result = await provider.signAndSendTransaction(tx);

    // Write result to session storage for background to pick up
    await chrome.storage.session.set({
      swapResult: { signature: result.signature, explorer: `https://solscan.io/tx/${result.signature}` },
    });
    await chrome.storage.session.remove("pendingSwap");

    statusEl.textContent = `✓ Sent! Signature: ${result.signature.slice(0, 8)}…`;
    setTimeout(() => window.close(), 1500);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    errorEl.textContent = msg;
    statusEl.textContent = "";
    // Write error so background can unblock
    chrome.storage.session.set({ swapResult: { error: msg } }).catch(() => {});
    setTimeout(() => window.close(), 4000);
  }
}

main();
```

- [ ] **Step 4: Add sign.ts to package.json build scripts**

In `extension/package.json`, add `src/sign.ts` to the first esbuild call in `build`, `watch`, and `build:prod`:

```
esbuild src/content.ts src/background.ts src/connect.ts src/signer.ts src/sign.ts --bundle ...
```

- [ ] **Step 5: Build to verify sign.js is produced**

```bash
cd /home/wanaqil/Documents/Code/node/hackathon/quickdraw/extension && npm run build
```
Expected: `dist/sign.js` appears. No errors.

- [ ] **Step 6: Update execute_swap handler in background.ts to branch on adapter="reown"**

In the `execute_swap` handler in `extension/src/background.ts`, replace the section after `const txBase64 = ...` with an adapter check:

```typescript
      const txBase64 = await fetchSwapTxFromWorker(
        msg.inputMint,
        msg.outputMint,
        msg.amountLamports,
        msg.walletAddress,
      );

      // Detect adapter from stored wallet state
      const { wallet: storedWallet } = await chrome.storage.local.get("wallet") as
        { wallet?: { adapter: string } };

      if (storedWallet?.adapter === "reown") {
        // Reown embedded wallet: sign via dedicated tab
        const pending: PendingSwap = {
          txBase64,
          adapter: msg.adapter,
          expiresAt: Date.now() + 60_000,
        };
        await chrome.storage.session.set({ pendingSwap: pending });
        await chrome.storage.session.remove("swapResult");

        const signUrl = chrome.runtime.getURL("sign.html");
        await chrome.tabs.create({ url: signUrl, active: true });

        // Poll for result (sign tab writes to session storage and closes)
        const result = await new Promise<SwapResult>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Signing timed out")), 90_000);
          const interval = setInterval(async () => {
            const { swapResult } = await chrome.storage.session.get("swapResult") as
              { swapResult?: SwapResult & { error?: string } };
            if (swapResult) {
              clearInterval(interval);
              clearTimeout(timeout);
              await chrome.storage.session.remove("swapResult");
              if (swapResult.error) reject(new Error(swapResult.error));
              else resolve(swapResult);
            }
          }, 500);
        });

        respond({ ok: true, data: result });
        return;
      }

      // Injected wallet (Phantom/Solflare/window.solana): use postMessage bridge
      const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
```

Also add `PendingSwap` to the imports at the top of background.ts:

```typescript
import type {
  BgRequest, BgResponse, SafetyScore, TokenData, TokenPrice,
  WalletState, PriceAlert, WatchItem, WatchItemWithPrice, SkillSettings,
  DeepPortRequest, DeepPortMessage, AdapterQuote, MultiAdapterQuote,
  PortfolioItem, SwapResult, PendingSwap,
} from "./types";
```

- [ ] **Step 7: Build and run all tests**

```bash
cd /home/wanaqil/Documents/Code/node/hackathon/quickdraw/extension && npm run build && npm test
```
Expected: clean build, all tests pass.

- [ ] **Step 8: Commit**

```bash
git -C /home/wanaqil/Documents/Code/node/hackathon/quickdraw add \
  extension/sign.html \
  extension/src/sign.ts \
  extension/src/types.ts \
  extension/src/background.ts \
  extension/package.json && \
git -C /home/wanaqil/Documents/Code/node/hackathon/quickdraw commit -m "feat: Reown embedded wallet signing via dedicated sign tab"
```

---

## End-to-End Manual Test Checklist

After all 6 tasks are complete:

**Email wallet flow (zero crypto user):**
- [ ] Open popup → click "Email / WalletConnect ↗" → connect.html tab opens
- [ ] Enter email → receive OTP → enter OTP → tab closes → popup shows connected address
- [ ] Open popup → portfolio loads for the new wallet address

**Buy flow (injected wallet — Phantom):**
- [ ] Browse to any https page with Phantom installed
- [ ] Detect a token address → TRADE tab appears → enter SOL amount → quotes load
- [ ] Click "SWAP NOW" → Phantom approval dialog appears → approve → success message with Solscan link
- [ ] Click the Solscan link → transaction confirmed on-chain

**Sell flow (injected wallet with held tokens):**
- [ ] Connect wallet that holds a token → detect that token
- [ ] TRADE panel shows BUY | SELL tabs
- [ ] Click SELL → balance pre-filled → sell quote loads → "SELL NOW" → Phantom approval → success

**Reown wallet buy flow:**
- [ ] Connect via email → have SOL in the wallet
- [ ] Detect a token → TRADE tab → "SWAP NOW" → sign.html tab opens → signs transparently → closes → success

---

## Out of Scope for Phase 4
- Fiat on-ramp (buying SOL with credit card for new email wallet users)
- Partial sell via slider UI
- Transaction history tab
- Multi-hop routing UI
- Slippage settings UI (currently hardcoded 50bps)
