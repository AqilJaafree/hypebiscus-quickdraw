import { detectInSelection, detectInText } from "./detector";
import { createPopup, removePopup, PopupController } from "./popup-ui";
import { sendBg } from "./shared";
import type { TokenData } from "./types";

function clampPosition(x: number, y: number): { x: number; y: number } {
  const POP_W = 264, POP_H = 160;
  const cx = x + POP_W > window.innerWidth  ? x - POP_W - 8 : x + 16;
  const cy = y + POP_H > window.innerHeight ? y - POP_H - 8 : y + 8;
  return { x: Math.max(8, cx), y: Math.max(8, cy) };
}

// ── Detection lifecycle ────────────────────────────────────────────────────────
let activeController: PopupController | null = null;
let detectionEnabled = true;

const lastTriggerMap = new Map<string, number>();
const CONTENT_DEDUP_MS = 30_000;

async function triggerAddress(address: string, rawX: number, rawY: number): Promise<void> {
  if (!detectionEnabled) return;

  const last = lastTriggerMap.get(address);
  if (last && Date.now() - last < CONTENT_DEDUP_MS) return;
  lastTriggerMap.set(address, Date.now());

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
