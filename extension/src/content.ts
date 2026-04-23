import { detectInSelection } from "./detector";
import { showTooltip, removeTooltip } from "./tooltip";

const DEBOUNCE_MS  = 400;
const COOLDOWN_MS  = 30_000; // don't re-fire same address within 30s

const seen = new Map<string, number>();
let debounce: ReturnType<typeof setTimeout> | null = null;

document.addEventListener("mouseup", () => {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(onSelection, DEBOUNCE_MS);
});

document.addEventListener("keyup", (e) => {
  if (e.shiftKey) {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(onSelection, DEBOUNCE_MS);
  }
});

// Dismiss on Escape or click outside
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") removeTooltip();
});
document.addEventListener("mousedown", (e) => {
  const tooltip = document.getElementById("quickdraw-tooltip");
  if (tooltip && !tooltip.contains(e.target as Node)) removeTooltip();
});

async function onSelection() {
  const detection = detectInSelection();
  if (!detection || detection.type !== "address") return;

  const addr = detection.value;
  const now  = Date.now();

  // Cooldown check
  const lastSeen = seen.get(addr);
  if (lastSeen && now - lastSeen < COOLDOWN_MS) return;
  seen.set(addr, now);

  // Show tooltip immediately with loading state
  showTooltip(detection.rect, addr, null, "Fetching Jupiter data…");

  // Fetch organic score from Jupiter (no API key needed)
  try {
    const data = await fetchJupiterScore(addr);
    showTooltip(detection.rect, addr, data.score, data.summary);
  } catch {
    showTooltip(detection.rect, addr, null, "Score unavailable");
  }

  // Also notify native app if available (best-effort)
  chrome.runtime.sendMessage({
    type: "token_detected",
    address: addr,
    position: { x: detection.rect.left, y: detection.rect.bottom },
    url: location.href,
  }).catch(() => {/* native bridge not running — fine */});
}

interface JupiterScore {
  score: number;
  summary: string;
}

async function fetchJupiterScore(mint: string): Promise<JupiterScore> {
  const resp = await fetch(
    `https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(mint)}`
  );
  if (!resp.ok) throw new Error("Jupiter API error");

  const results = await resp.json() as any[];
  const t = results[0];
  if (!t) throw new Error("Token not found");

  const score    = Math.round((t.organicScore ?? 0) as number);
  const verified = t.isVerified ?? false;
  const organic  = (t.organicScoreLabel ?? "unknown") as string;
  const audit    = t.audit ?? {};
  const isSus    = audit.isSus ?? false;

  let summary = "";
  if (isSus) {
    summary = "⚠️ Flagged as suspicious by Jupiter.";
  } else {
    const parts: string[] = [];
    if (verified)                     parts.push("Jupiter verified");
    if (audit.mintAuthorityDisabled)  parts.push("mint auth disabled");
    if (audit.freezeAuthorityDisabled) parts.push("freeze auth disabled");
    if (organic === "high")           parts.push("high organic activity");
    summary = parts.length
      ? `✓ ${parts.join(" · ")}`
      : "Unverified token — not on Jupiter strict list.";
  }

  return { score, summary };
}
