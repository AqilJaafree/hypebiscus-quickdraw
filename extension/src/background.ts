import { fetchTokenSafety, fetchTokenPrice } from "./jupiter-client";
import type { BgRequest, BgResponse, TokenData, WalletState } from "./types";

// ── Cache ──────────────────────────────────────────────────────────────────────
interface CacheEntry<T> { data: T; expiresAt: number; }

const safetyCache = new Map<string, CacheEntry<Awaited<ReturnType<typeof fetchTokenSafety>>>>();
const priceCache  = new Map<string, CacheEntry<Awaited<ReturnType<typeof fetchTokenPrice>>>>();
const dedupMap    = new Map<string, number>(); // address → last triggered timestamp

const SAFETY_TTL_MS = 300_000; // 5 min
const PRICE_TTL_MS  =  15_000; // 15 sec
const DEDUP_MS      =  30_000; // 30 sec

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
