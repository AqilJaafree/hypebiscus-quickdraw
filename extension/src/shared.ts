// Shared utilities and constants across the extension

import type { BgRequest, BgResponse } from "./types";

// ─────────────────────── Background messaging helper ─────────────────────────

export function sendBg<T>(msg: BgRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (resp: BgResponse<T>) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (resp.ok) resolve(resp.data);
      else reject(new Error(resp.error));
    });
  });
}

// ─────────────────────── Safety score constants ──────────────────────────────

export const SCORE_THRESHOLDS = {
  SAFE: 80,
  CAUTION: 50,
} as const;

export const SCORE_COLORS = {
  SAFE: "#8BF542",     // lime green
  CAUTION: "#F5C842",  // yellow
  RISK: "#F54242",     // red
} as const;

export const BRAND_COLORS = {
  PRIMARY: "#F5E642",  // quickdraw yellow
  BG_DARK: "#181818",
  BG_CARD: "#1a1a1a",
  TEXT_DIM: "#888",
  TEXT_BRIGHT: "#fff",
  BORDER: "#000",
} as const;
