import { detectInSelection, detectInText } from "./detector";
import { createPopup, removePopup, PopupController } from "./popup-ui";
import { sendBg } from "./shared";
import type { TokenData, WalletState } from "./types";
import { extractTweetContext } from "./tweet-context";
import type { TweetContext } from "./tweet-context";
import { getSiteMode, defaultMode } from "./detection-rules";
import type { SiteMode } from "./detection-rules";
import { deriveVerdict } from "./jev-signals";
import type { JevSignals, SignalVerdict } from "./jev-signals";

function clampPosition(x: number, y: number): { x: number; y: number } {
  const POP_W = 264, POP_H = 160;
  const cx = x + POP_W > window.innerWidth  ? x - POP_W - 8 : x + 16;
  const cy = y + POP_H > window.innerHeight ? y - POP_H - 8 : y + 8;
  return { x: Math.max(8, cx), y: Math.max(8, cy) };
}

// ── Detection lifecycle ────────────────────────────────────────────────────────
let activeController: PopupController | null = null;
let detectionEnabled = true;
let currentSiteMode: SiteMode = defaultMode(window.location.hostname);

getSiteMode(window.location.hostname).then(m => { currentSiteMode = m; }).catch(() => {});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.siteRules) return;
  const rules = (changes.siteRules.newValue ?? {}) as Record<string, SiteMode>;
  currentSiteMode = rules[window.location.hostname] ?? defaultMode(window.location.hostname);
});

const lastTriggerMap = new Map<string, number>();
const CONTENT_DEDUP_MS = 30_000;

async function triggerAddress(address: string, rawX: number, rawY: number, sourceEl?: Element, source: "selection" | "mutation" = "mutation"): Promise<void> {
  if (!detectionEnabled) return;
  if (currentSiteMode === "off") return;
  if (currentSiteMode === "selection" && source !== "selection") return;

  const now = Date.now();
  const last = lastTriggerMap.get(address);
  if (last && now - last < CONTENT_DEDUP_MS) return;

  // Prune expired entries to prevent the map growing unbounded on long sessions.
  for (const [key, ts] of lastTriggerMap) {
    if (now - ts >= CONTENT_DEDUP_MS) lastTriggerMap.delete(key);
  }
  lastTriggerMap.set(address, now);

  const passive = source === "mutation";
  const tweetContext = extractTweetContext(sourceEl);
  const contextText = tweetContext?.tweetText ?? extractSurroundingText(sourceEl);

  const { x, y } = clampPosition(rawX, rawY);

  let tokenData: TokenData | null = null;

  const openPopup = (): PopupController => {
    const c = createPopup({
      address,
      x,
      y,
      callbacks: {
        onDismiss: () => { activeController = null; },
        onGear: () => { chrome.runtime.sendMessage({ type: "OPEN_POPUP" }).catch(() => {}); },
        onBuy: () => {
          const ticker = tokenData?.price?.symbol ?? address.slice(0, 6);
          chrome.storage.local.get("wallet").then(({ wallet }) => {
            const w: WalletState = wallet ?? { address: null, adapter: null, connected: false };
            void c.showTradePanel(address, ticker, w);
          }).catch(() => {
            void c.showTradePanel(address, ticker, { address: null, adapter: null, connected: false });
          });
        },
      },
    });
    activeController = c;
    return c;
  };

  // A selection is an explicit request — show the popup immediately. Scroll
  // detections wait until we know the address is a token worth showing.
  let controller: PopupController | null = passive ? null : openPopup();

  const [fetchResult] = await Promise.allSettled([
    sendBg<TokenData>({ type: "fetch_token", address }),
  ]);

  if (fetchResult.status === "rejected") {
    if (passive) return; // wallet / tx / non-token base58 — stay quiet
    const msg = fetchResult.reason instanceof Error ? fetchResult.reason.message : "";
    if (msg === "dedup") { removePopup(); activeController = null; return; }
    controller?.showError(msg || "Token not found");
    return;
  }

  tokenData = fetchResult.value;

  // A user-selected popup is already on screen, so don't hold its narration
  // hostage to a slow route; passive detections can afford the full wait.
  const verdict = contextText
    ? await fetchVerdict(address, contextText, tweetContext, tokenData, passive ? PASSIVE_SIGNALS_WAIT_MS : SELECTION_SIGNALS_WAIT_MS)
    : null;

  if (passive) {
    if (verdict?.suppressPassive) return;
    if (activeController) return; // don't replace a popup the user is looking at
    controller = openPopup();
  }
  if (!controller) return;

  controller.showToken(tokenData.safety, tokenData.price);
  if (verdict) controller.showSignals(verdict.flags);

  // Stream Haiku analysis via background port — avoids ad-blocker blocks on content script fetches
  const narrated = controller;
  try {
    const port = chrome.runtime.connect({ name: "narration" });
    port.onMessage.addListener((msg: { type: string; text?: string }) => {
      if (msg.type === "chunk" && msg.text) narrated.appendNarration(msg.text);
      if (msg.type === "done") port.disconnect();
    });
    port.onDisconnect.addListener(() => {});
    port.postMessage({
      address,
      safety: { score: tokenData.safety.score, label: tokenData.safety.label, summary: tokenData.safety.summary },
      price: tokenData.price ? { usd: tokenData.price.usd, symbol: tokenData.price.symbol } : null,
      tweetContext: tweetContext ?? null,
      narrationHint: verdict?.narrationHint ?? null,
    });
  } catch { /* worker not running — no narration */ }
}

// ── Jev context signals ───────────────────────────────────────────────────────
const CONTEXT_MAX_CHARS = 600;
const SELECTION_SIGNALS_WAIT_MS = 3_000;
const PASSIVE_SIGNALS_WAIT_MS = 9_000; // just above the worker's 8 s upstream timeout

/** Text of the nearest block-level container around the detection, for non-X sites. */
function extractSurroundingText(el: Element | undefined): string | null {
  const block = el?.closest("p, li, blockquote, article, [role='article'], [role='listitem']") ?? el;
  if (!block || block.closest("#quickdraw-host")) return null;
  const text = block.textContent?.replace(/\s+/g, " ").trim() ?? "";
  // A bare address with nothing around it has no context to judge.
  return text.length > 50 ? text.slice(0, CONTEXT_MAX_CHARS) : null;
}

async function fetchVerdict(
  address: string,
  text: string,
  tweet: TweetContext | null,
  token: TokenData,
  waitMs: number,
): Promise<SignalVerdict | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), waitMs); });
  try {
    const request = sendBg<JevSignals>({
      type: "get_signals",
      address,
      text,
      author: tweet?.authorHandle ?? null,
      tokenName: token.price?.name ?? null,
      tokenSymbol: token.price?.symbol ?? null,
      jupiterVerified: token.safety.verified,
    });
    const signals = await Promise.race([request, timeout]);
    return signals ? deriveVerdict(signals) : null;
  } catch {
    return null; // signals are additive — never block the popup on them
  } finally {
    clearTimeout(timer);
  }
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
    const anchorEl = window.getSelection()?.anchorNode?.parentElement ?? undefined;
    triggerAddress(detection.value, rect.left, rect.bottom, anchorEl, "selection");
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

// ── MutationObserver ───────────────────────────────────────────────────────────
let mutationQueue: MutationRecord[] = [];
let mutationTimer: ReturnType<typeof setTimeout> | null = null;

function processMutations(): void {
  if (!detectionEnabled) { mutationQueue = []; return; }
  if (currentSiteMode === "off") { mutationQueue = []; return; }
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
        triggerAddress(first.value, rect.left, rect.bottom, parent ?? undefined);
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

// Relay wallet state from hosted connect page (quickdraw-auth.pages.dev) to background.
// The page uses window.postMessage since chrome.runtime isn't available there directly.
window.addEventListener("message", (event) => {
  if (event.origin !== "https://quickdraw-auth.pages.dev") return;
  const msg = event.data as { source?: string; type?: string; wallet?: WalletState };
  if (msg.source !== "quickdraw-connect" || msg.type !== "set_wallet" || !msg.wallet) return;
  chrome.runtime.sendMessage({ type: "set_wallet", wallet: msg.wallet }).catch(() => {});
});
