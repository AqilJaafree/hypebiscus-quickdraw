import { fetchToken } from "./jupiter-client";
import { alertShouldFire, alertShouldRearm } from "./skills/alert";
import { rankQuotes } from "./multi-quote-utils";
import type {
  BgRequest, BgResponse, SafetyScore, TokenData, TokenPrice,
  WalletState, PriceAlert, WatchItem, WatchItemWithPrice, SkillSettings,
  DeepPortRequest, DeepPortMessage, AdapterQuote, MultiAdapterQuote,
  PortfolioItem,
} from "./types";
import { DEFAULT_SKILL_SETTINGS } from "./types";
import type { TweetContext } from "./tweet-context";

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
// Capture the promise so message handlers can await it after SW restart.
const walletReady = loadWalletFromStorage();

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
      const resp = await fetch(`${WORKER_URL}/defi/jupiter/price?${params}`, {
        headers: {
          "X-Quickdraw-Client": "extension",
          "Authorization": `Bearer ${EXTENSION_SECRET}`,
        },
      });
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

  port.onMessage.addListener(async (rawMsg: unknown) => {
    const req = rawMsg as {
      address: string;
      safety: { score: number; label: string; summary: string };
      price: { usd: number; symbol: string } | null;
      tweetContext?: TweetContext | null;
    };
    try {
      const system = "You are a concise DeFi analyst for Solana traders. Write 1-2 sentences about the token's risk and key facts. Be direct. No disclaimers.";

      let tweetContextStr = "";
      if (req.tweetContext) {
        const parts: string[] = [];
        if (req.tweetContext.authorHandle) parts.push(`Author: @${req.tweetContext.authorHandle}${req.tweetContext.verified ? " (verified)" : ""}`);
        if (req.tweetContext.likes !== null) parts.push(`Likes: ${req.tweetContext.likes.toLocaleString()}`);
        if (req.tweetContext.retweets !== null) parts.push(`Retweets: ${req.tweetContext.retweets.toLocaleString()}`);
        if (req.tweetContext.tweetText) parts.push(`Tweet: "${req.tweetContext.tweetText.slice(0, 200)}"`);
        if (parts.length) tweetContextStr = `\nSocial context:\n${parts.join("\n")}`;
      }

      const user = [
        `Token address: ${req.address}`,
        `Safety score: ${req.safety.score}/100 (${req.safety.label})`,
        `Details: ${req.safety.summary}`,
        req.price ? `Price: $${req.price.usd.toFixed(6)} (${req.price.symbol})` : "Price: unavailable",
      ].join("\n") + tweetContextStr;

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
    const controller = new AbortController();
    // Abort the upstream SSE fetch when the popup disconnects — prevents orphaned
    // worker sessions accumulating across re-analyzes.
    port.onDisconnect.addListener(() => controller.abort());

    try {
      const resp = await fetch(`${WORKER_URL}/ai/deep`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Quickdraw-Client": "extension",
          "Authorization": `Bearer ${EXTENSION_SECRET}`,
        },
        body: JSON.stringify(req),
        signal: controller.signal,
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
      if ((err as { name?: string }).name === "AbortError") return; // port closed, stop silently
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
      const prevAddress = walletState.address;
      walletState = msg.wallet;
      await chrome.storage.local.set({ wallet: walletState });

      // Clear portfolio cache on disconnect or address change
      if (!walletState.connected || walletState.address !== prevAddress) {
        if (prevAddress) {
          chrome.storage.session.remove(`portfolio_${prevAddress}`).catch(() => {});
        }
      }

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
      const resp = await fetch(`${WORKER_URL}/defi/jupiter/price?ids=${ids}`, {
        headers: {
          "X-Quickdraw-Client": "extension",
          "Authorization": `Bearer ${EXTENSION_SECRET}`,
        },
      });
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
      if (!result.address) {
        respond({ ok: false, error: "Wallet returned no address" });
        return;
      }
      const w: WalletState = { address: result.address, adapter: "injected", connected: true };
      walletState = w;
      await chrome.storage.local.set({ wallet: w });
      respond({ ok: true, data: w });
      return;
    }

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
          priceImpactPct: Number(jup.priceImpactPct ?? 0),
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

    if (msg.type === "get_portfolio") {
      await walletReady;
      if (!walletState.connected || !walletState.address) {
        respond({ ok: false, error: "No wallet connected" });
        return;
      }

      const cacheKey = `portfolio_${walletState.address}`;

      // Try cache first — any storage error falls through to live fetch
      try {
        const cached = await chrome.storage.session.get(cacheKey);
        if (cached[cacheKey]) {
          const entry = cached[cacheKey] as { data: PortfolioItem[]; expiresAt: number };
          if (Date.now() < entry.expiresAt) {
            respond({ ok: true, data: entry.data });
            return;
          }
        }
      } catch { /* storage unavailable — fall through to live fetch */ }

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
      const rawData = await resp.json();
      if (!Array.isArray(rawData)) throw new Error("Unexpected portfolio response");
      const data = rawData as PortfolioItem[];

      // Write to cache — failure here is non-fatal
      try {
        await chrome.storage.session.set({
          [cacheKey]: { data, expiresAt: Date.now() + 30_000 },
        });
      } catch { /* storage write failed — data still returned */ }

      respond({ ok: true, data });
      return;
    }

    respond({ ok: false, error: "Unknown message type" });
  } catch (err: unknown) {
    respond({ ok: false, error: err instanceof Error ? err.message : "Background error" });
  }
}
