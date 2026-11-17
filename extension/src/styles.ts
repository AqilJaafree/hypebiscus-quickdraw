// Design tokens shared by the inline overlay and trade panel.
// Brand yellow is reserved for the wordmark and the one primary action per
// surface. The safety scale (green / orange / red) never reuses it.
export const DS = {
  bg:       "#181818",
  bgDeep:   "#111111",
  raised:   "#232325",
  hairline: "rgba(255,255,255,0.08)",
  hairlineStrong: "rgba(255,255,255,0.16)",
  text:     "#ededed",
  textSec:  "#a1a1a6",
  textMut:  "#85858b",
  yellow:   "#f5e642",
  safe:     "#4cc38a",
  caution:  "#f59a3c",
  danger:   "#e5484d",
  stroke:   "#000",
  shadow:   "3px 3px 0 #333",
  font:     "'QD Space Mono', 'Space Mono', ui-monospace, monospace",
  ease:     "cubic-bezier(0.22, 1, 0.36, 1)",
  // Kept for older callers.
  border:   "2px solid #333333",
  textDim:  "#85858b",
} as const;

/** The signature: brand fill, hard black edge, 3px offset shadow. */
export const brutal = (bg: string = DS.yellow): string =>
  `background:${bg};border:2px solid ${DS.stroke};box-shadow:${DS.shadow};border-radius:0`;

export function safetyColor(score: number): string {
  if (score >= 80) return DS.safe;
  if (score >= 50) return DS.caution;
  return DS.danger;
}

/** "HIGH RISK" → "High risk" for display. */
export function sentenceCase(s: string): string {
  const t = s.trim().toLowerCase();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/** 1193.8421 → "1,193.8421", tabular-friendly, max 4 decimals. */
export function fmtAmount(n: number, maxFrac = 4): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: maxFrac });
}

export function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n > 0 && n < 0.01) return `$${n.toPrecision(3)}`;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 });
}

// Lucide-style line icons, 16px, stroke 1.5, currentColor.
const svg = (d: string, size = 16): string =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ICON = {
  x:        svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  settings: svg('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'),
  copy:     svg('<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>', 12),
  check:    svg('<path d="M20 6 9 17l-5-5"/>', 12),
  external: svg('<path d="M7 7h10v10"/><path d="M7 17 17 7"/>', 12),
} as const;

const FONT_FAMILY = "QD Space Mono";
let fontsRequested = false;

/**
 * @font-face inside a shadow root is ignored, so register the bundled
 * Space Mono on the host document under a private family name.
 */
export function ensureFonts(): void {
  if (fontsRequested || typeof FontFace === "undefined" || typeof chrome === "undefined" || !chrome.runtime?.getURL) return;
  fontsRequested = true;
  const faces: Array<[string, string]> = [["fonts/SpaceMono-Regular.ttf", "400"], ["fonts/SpaceMono-Bold.ttf", "700"]];
  for (const [path, weight] of faces) {
    const face = new FontFace(FONT_FAMILY, `url(${chrome.runtime.getURL(path)})`, { weight, display: "swap" });
    face.load().then(f => (document.fonts as unknown as { add(f: FontFace): void }).add(f)).catch(() => { /* falls back to system mono */ });
  }
}
