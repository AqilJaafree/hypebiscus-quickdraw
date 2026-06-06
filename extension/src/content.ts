import { detectInSelection, detectInText } from "./detector";
import { createPopup, removePopup, PopupController } from "./popup-ui";
import { buildSwapPanel } from "./swap-panel";
import { getWallet, connectWallet, injectWalletBridge } from "./wallet";
import { streamNarration } from "./worker-client";
import type { BgRequest, BgResponse, TokenData, WalletState } from "./types";

// ── Helpers ────────────────────────────────────────────────────────────────────
function sendBg<T>(msg: BgRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (resp: BgResponse<T>) => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      if (resp.ok) resolve(resp.data);
      else reject(new Error(resp.error));
    });
  });
}

function clampPosition(x: number, y: number): { x: number; y: number } {
  const POP_W = 288, POP_H = 240;
  const cx = x + POP_W > window.innerWidth  ? x - POP_W - 8 : x + 16;
  const cy = y + POP_H > window.innerHeight ? y - POP_H - 8 : y + 8;
  return { x: Math.max(8, cx), y: Math.max(8, cy) };
}

// ── Detection lifecycle ────────────────────────────────────────────────────────
let activeController: PopupController | null = null;
let detectionEnabled = true;

async function triggerAddress(address: string, rawX: number, rawY: number): Promise<void> {
  detectionEnabled = await sendBg<boolean>({ type: "get_detection_enabled" }).catch(() => true);
  if (!detectionEnabled) return;

  let tokenData: TokenData;
  try {
    tokenData = await sendBg<TokenData>({ type: "fetch_token", address });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "dedup") return;
    return;
  }

  const wallet: WalletState = await sendBg<WalletState>({ type: "get_wallet" }).catch(() => ({
    address: null, adapter: null, connected: false,
  }));

  const { x, y } = clampPosition(rawX, rawY);

  const controller = createPopup({
    address,
    x,
    y,
    callbacks: {
      onDismiss: () => { activeController = null; },
      onSwapClick: async () => {
        let w = wallet;
        if (!w.connected) {
          try {
            w = await connectWallet();
          } catch {
            controller.showError("No wallet found. Install Phantom or Backpack.");
            return;
          }
        }
        const panel = buildSwapPanel(address, w, {
          onSuccess: (sig) => {
            controller.showError(`✓ Swapped! ${sig.slice(0, 8)}…`);
          },
          onError: (msg) => controller.showError(msg),
          onCancel: () => removePopup(),
        });
        controller.mountSwapPanel(panel);
      },
      onConnectWallet: async () => {
        try {
          const w = await connectWallet();
          controller.showToken(tokenData.safety, tokenData.price, w);
        } catch {
          controller.showError("No wallet found.");
        }
      },
    },
  });

  activeController = controller;

  controller.showToken(tokenData.safety, tokenData.price, wallet);

  streamNarration(
    address,
    tokenData.safety,
    tokenData.price,
    (delta) => controller.appendNarration(delta),
  ).catch(() => {
    controller.appendNarration(" (narration unavailable)");
  });
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
    triggerAddress(detection.value, rect.left + window.scrollX, rect.bottom + window.scrollY);
  }, DEBOUNCE_MS);
}

document.addEventListener("mouseup", onSelectionChange);
document.addEventListener("keyup", (e) => { if (e.shiftKey) onSelectionChange(); });

// ── Dismiss ────────────────────────────────────────────────────────────────────
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { removePopup(); activeController = null; } });
document.addEventListener("mousedown", (e) => {
  const host = document.getElementById("quickdraw-host");
  if (host && !host.contains(e.target as Node)) { removePopup(); activeController = null; }
});

// ── MutationObserver ───────────────────────────────────────────────────────────
const observer = new MutationObserver((mutations) => {
  if (!detectionEnabled) return;
  for (const mutation of mutations) {
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
        break;
      }
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });

injectWalletBridge().catch(() => {});

sendBg<boolean>({ type: "get_detection_enabled" })
  .then((enabled) => { detectionEnabled = enabled; })
  .catch(() => {});
