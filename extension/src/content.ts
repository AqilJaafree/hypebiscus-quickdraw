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
  const signals = contextText ? requestVerdict(address, contextText, tweetContext, tokenData) : null;
  const verdict = signals
    ? await signals.within(passive ? PASSIVE_SIGNALS_WAIT_MS : SELECTION_SIGNALS_WAIT_MS)
    : null;

  if (passive) {
    if (verdict?.suppressPassive) return;
    if (activeController) return; // don't replace a popup the user is looking at
    controller = openPopup();
  }
  if (!controller) return;

  controller.showToken(tokenData.safety, tokenData.price);
  if (verdict) {
    controller.showSignals(verdict.flags);
  } else if (signals) {
    // Jev Router can take 6-7 s; add the chips to the popup when they land,
    // as long as it is still the one on screen.
    const shown = controller;
    void signals.final.then(late => {
      if (late && activeController === shown) shown.showSignals(late.flags);
    });
  }

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
      signalFlags: verdict?.flags.map(f => f.label) ?? [],
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

interface PendingVerdict {
  /** Resolves with the verdict, or null on failure. Never rejects. */
  final: Promise<SignalVerdict | null>;
  /** The verdict if it arrives within `ms`, otherwise null (the request keeps running). */
  within(ms: number): Promise<SignalVerdict | null>;
}

function requestVerdict(
  address: string,
  text: string,
  tweet: TweetContext | null,
  token: TokenData,
): PendingVerdict {
  const final = sendBg<JevSignals>({
    type: "get_signals",
    address,
    text,
    author: tweet?.authorHandle ?? null,
    tokenName: token.price?.name ?? null,
    tokenSymbol: token.price?.symbol ?? null,
    jupiterVerified: token.safety.verified,
  }).then(deriveVerdict, () => null); // signals are additive — never block the popup on them

  return {
    final,
    within(ms) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), ms); });
      return Promise.race([final, timeout]).finally(() => clearTimeout(timer));
    },
  };
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
  let budget = MAX_TEXT_NODES_PER_BATCH;
  for (const mutation of batch) {
    for (const added of Array.from(mutation.addedNodes)) {
      for (const node of textNodesIn(added)) {
        if (--budget < 0) return;
        const text = node.textContent ?? "";
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
}

// Sites like X and Telegram Web insert whole element subtrees (a tweet's
// <article>), not bare text nodes, so walk the text inside added elements.
// Capped per batch to keep long infinite-scroll pages cheap.
const MAX_TEXT_NODES_PER_BATCH = 2_000;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"]);

function* textNodesIn(node: Node): Generator<Text> {
  if (node.nodeType === Node.TEXT_NODE) { yield node as Text; return; }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  if (SKIP_TAGS.has(el.tagName) || el.id === "quickdraw-host") return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (t) => (t.parentElement && SKIP_TAGS.has(t.parentElement.tagName)
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let t = walker.nextNode(); t; t = walker.nextNode()) yield t as Text;
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
