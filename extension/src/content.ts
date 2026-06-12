import { detectInSelection, detectInText } from "./detector";
import { createPopup, removePopup, PopupController } from "./popup-ui";
import { sendBg } from "./shared";
import type { TokenData } from "./types";
import { extractTweetContext } from "./tweet-context";
import type { TweetContext } from "./tweet-context";
import { getSiteMode, defaultMode } from "./detection-rules";
import type { SiteMode } from "./detection-rules";

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

  const tweetContext = extractTweetContext(sourceEl);

  const { x, y } = clampPosition(rawX, rawY);

  let tokenData: TokenData | null = null;

  const controller = createPopup({
    address,
    x,
    y,
    callbacks: {
      onDismiss: () => { activeController = null; },
      onGear: () => { chrome.runtime.sendMessage({ type: "OPEN_POPUP" }).catch(() => {}); },
      onBuy: () => {
        const ticker = tokenData?.price?.symbol;
        window.open(
          ticker ? `https://jup.ag/swap/SOL-${ticker}` : `https://jup.ag/swap/SOL-${address}`,
          "_blank",
        );
      },
    },
  });

  activeController = controller;

  const [fetchResult] = await Promise.allSettled([
    sendBg<TokenData>({ type: "fetch_token", address }),
  ]);

  if (fetchResult.status === "rejected") {
    const msg = fetchResult.reason instanceof Error ? fetchResult.reason.message : "";
    if (msg === "dedup") { removePopup(); activeController = null; return; }
    controller.showError(msg || "Token not found");
    return;
  }

  tokenData = fetchResult.value;
  controller.showToken(tokenData.safety, tokenData.price);

  // Stream Haiku analysis via background port — avoids ad-blocker blocks on content script fetches
  try {
    const port = chrome.runtime.connect({ name: "narration" });
    port.onMessage.addListener((msg: { type: string; text?: string }) => {
      if (msg.type === "chunk" && msg.text) controller.appendNarration(msg.text);
      if (msg.type === "done") port.disconnect();
    });
    port.onDisconnect.addListener(() => {});
    port.postMessage({
      address,
      safety: { score: tokenData.safety.score, label: tokenData.safety.label, summary: tokenData.safety.summary },
      price: tokenData.price ? { usd: tokenData.price.usd, symbol: tokenData.price.symbol } : null,
      tweetContext: tweetContext ?? null,
    });
  } catch { /* worker not running — no narration */ }
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
