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
  const data = await resp.json() as { swapTransaction: string };
  return data.swapTransaction;
}

// ── Price alert polling ────────────────────────────────────────────────────────
const ALERT_ALARM = "qd-alert-check";

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALERT_ALARM, { periodInMinutes: 5 });
});

// Track session start time (chrome.storage.session resets on browser close)
chrome.storage.session.get("sessionStart").then(({ sessionStart }) => {
  if (!sessionStart) chrome.storage.session.set({ sessionStart: Date.now() });
}).catch(() => {});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALERT_ALARM) return;

  const { alerts } = await chrome.storage.local.get("alerts");
  const alertList: PriceAlert[] = alerts ?? [];
  if (!alertList.length) return;

  const mints = [...new Set(alertList.map(a => a.mint))];
  let updated = [...alertList];
  let anyChanged = false;

  for (const mint of mints) {
    try {
      const params = new URLSearchParams({ ids: mint });
      const resp = await fetch(`${WORKER_URL}/defi/jupiter/price?${params}`);
      if (!resp.ok) continue;
      const data = await resp.json() as { data: Record<string, { price: number }> };
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

// ── AI narration port ─────────────────────────────────────────────────────────
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "narration") return;

  port.onMessage.addListener(async (req: {
    address: string;
    safety: { score: number; label: string; summary: string };
    price: { usd: number; symbol: string } | null;
  }) => {
    try {
      const system = "You are a concise DeFi analyst for Solana traders. Write 1-2 sentences about the token's risk and key facts. Be direct. No disclaimers.";
      const user = [
        `Token address: ${req.address}`,
        `Safety score: ${req.safety.score}/100 (${req.safety.label})`,
        `Details: ${req.safety.summary}`,
        req.price ? `Price: $${req.price.usd.toFixed(6)} (${req.price.symbol})` : "Price: unavailable",
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
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: user }],
          stream: true,
        }),
      });

      if (!resp.ok || !resp.body) { port.postMessage({ type: "done" }); return; }

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
            const event = JSON.parse(payload) as { type: string; delta?: { type: string; text?: string } };
            if (event.type === "content_block_delta" && event.delta?.text) {
              port.postMessage({ type: "chunk", text: event.delta.text });
            }
          } catch { /* malformed SSE line */ }
        }
      }
      port.postMessage({ type: "done" });
    } catch { port.postMessage({ type: "done" }); }
  });
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
      chrome.storage.local.set({ lastToken: msg.address }).catch(() => {});
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

    if (msg.type === "get_alerts") {
      const { alerts } = await chrome.storage.local.get("alerts");
      respond({ ok: true, data: (alerts ?? []) as PriceAlert[] });
      return;
    }

    if (msg.type === "set_alerts") {
      await chrome.storage.local.set({ alerts: msg.alerts });
      respond({ ok: true, data: null });
      return;
    }

    if (msg.type === "get_watchlist") {
      const { watchlist } = await chrome.storage.local.get("watchlist");
      respond({ ok: true, data: (watchlist ?? []) as WatchItem[] });
      return;
    }

    if (msg.type === "set_watchlist") {
      await chrome.storage.local.set({ watchlist: msg.watchlist });
      respond({ ok: true, data: null });
      return;
    }

    if (msg.type === "get_watchlist_prices") {
      const ids = msg.mints.join(",");
      const resp = await fetch(`${WORKER_URL}/defi/jupiter/price?ids=${ids}`);
      if (!resp.ok) {
        respond({ ok: false, error: "Price fetch failed" });
        return;
      }
      const data = await resp.json() as { data: Record<string, { price: number }> };
      const result: WatchItemWithPrice[] = msg.mints.map(mint => ({
        mint,
        ticker: "",
        priceUsd: data.data[mint]?.price ?? null,
        change24h: null,
      }));
      respond({ ok: true, data: result });
      return;
    }

    if (msg.type === "get_skill_settings") {
      const { skillSettings } = await chrome.storage.local.get("skillSettings");
      respond({ ok: true, data: (skillSettings ?? DEFAULT_SKILL_SETTINGS) as SkillSettings });
      return;
    }

    if (msg.type === "set_skill_settings") {
      await chrome.storage.local.set({ skillSettings: msg.settings });
      respond({ ok: true, data: null });
      return;
    }

    if (msg.type === "connect_wallet_injected") {
      console.log("[QD bg] connect_wallet_injected received");
      const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
      const allTabs = await chrome.tabs.query({ windowId: win.id });
      // Prefer the active tab if it's http/https; otherwise take the first usable tab.
      // chrome:// and chrome-extension:// pages can't receive scripting injection.
      const isUsable = (t: chrome.tabs.Tab) => !!t.url?.match(/^https?:\/\//);
      const activeTab = allTabs.find(t => t.active && isUsable(t));
      const tab = activeTab ?? allTabs.find(isUsable);
      console.log("[QD bg] using tab id:", tab?.id, tab?.url);
      if (!tab?.id) {
        respond({ ok: false, error: "Open any webpage (http/https) then try again." });
        return;
      }

      // Inject wallet connect directly into the page's main world via the
      // scripting API. This works even when the content script isn't loaded
      // (e.g. tab pre-dates extension reload) and gives access to window.phantom
      // / window.solana that wallets inject into the main world.
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: async (): Promise<{ ok: boolean; address?: string; error?: string }> => {
          const w = window as Record<string, unknown>;
          type Provider = {
            isPhantom?: boolean; isSolflare?: boolean;
            publicKey?: { toString(): string };
            connect(): Promise<{ publicKey: { toString(): string } }>;
          };
          const phantom = (w.phantom as Record<string, unknown>)?.solana as Provider | undefined;
          if (phantom?.isPhantom) {
            const r = await phantom.connect();
            return { ok: true, address: r.publicKey.toString() };
          }
          const solflare = w.solflare as Provider | undefined;
          if (solflare?.isSolflare) {
            const r = await solflare.connect();
            return { ok: true, address: r.publicKey?.toString() ?? solflare.publicKey!.toString() };
          }
          const solana = w.solana as Provider | undefined;
          if (solana) {
            const r = await solana.connect();
            return { ok: true, address: r.publicKey?.toString() ?? solana.publicKey!.toString() };
          }
          return { ok: false, error: "No Solana wallet detected. Install Phantom or Solflare." };
        },
      });

      const result = results[0]?.result as { ok: boolean; address?: string; error?: string } | undefined;
      console.log("[QD bg] inject result:", result);
      if (!result?.ok) {
        respond({ ok: false, error: result?.error ?? "Wallet connect returned no result" });
        return;
      }
      const w: WalletState = { address: result.address!, adapter: "injected", connected: true };
      walletState = w;
      await chrome.storage.local.set({ wallet: w });
      respond({ ok: true, data: w });
      return;
    }

    if (msg.type === "quote") {
      const quote = await fetchQuoteFromWorker(msg.inputMint, msg.outputMint, msg.amountLamports);
      respond({ ok: true, data: quote });
      return;
    }

    if (msg.type === "swap_tx") {
      const txBase64 = await buildSwapTxFromWorker(msg.inputMint, msg.outputMint, msg.amountLamports, msg.walletAddress);
      respond({ ok: true, data: txBase64 });
      return;
    }

    respond({ ok: false, error: "Unknown message type" });
  } catch (err: unknown) {
    respond({ ok: false, error: err instanceof Error ? err.message : "Background error" });
  }
}
