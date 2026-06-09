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
    sendBg<PriceAlert[]>({ type: "get_alerts" }),
    sendBg<WatchItem[]>({ type: "get_watchlist" }),
    sendBg<SkillSettings>({ type: "get_skill_settings" }),
  ]);

  if (wallet.status === "fulfilled") walletState = wallet.value;
  if (alertResult.status === "fulfilled") alertList = alertResult.value;
  if (watchResult.status === "fulfilled") {
    watchlist = watchResult.value;
    if (watchlist.length > 0) {
      const mints = watchlist.map(w => w.mint);
      const priceResult = await sendBg<WatchItemWithPrice[]>({
        type: "get_watchlist_prices",
        mints,
      }).catch(() => [] as WatchItemWithPrice[]);
      const tickerByMint = new Map(watchlist.map(w => [w.mint, w.ticker]));
      watchlistPrices = priceResult.map(p => ({ ...p, ticker: tickerByMint.get(p.mint) ?? "" }));
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

// ── Wallet update listener ────────────────────────────────────────────────────
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
    for (const node of Array.from(mutation.addedNodes)) {
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
