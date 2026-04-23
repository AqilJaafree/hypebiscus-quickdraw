// In-page score tooltip — pure DOM, no framework, no shadow DOM issues.

const TOOLTIP_ID = "quickdraw-tooltip";
const AUTO_DISMISS_MS = 5000;

let dismissTimer: ReturnType<typeof setTimeout> | null = null;

function scoreColor(score: number): string {
  if (score >= 80) return "#8BF542"; // lime green
  if (score >= 50) return "#F5C842"; // yellow
  return "#F54242";                   // red
}

function scoreLabel(score: number): string {
  if (score >= 80) return "SAFE";
  if (score >= 50) return "CAUTION";
  return "HIGH RISK";
}

export function showTooltip(
  rect: DOMRect,
  address: string,
  score: number | null,
  summary: string,
) {
  removeTooltip();

  const short = address.length > 12
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address;

  const el = document.createElement("div");
  el.id = TOOLTIP_ID;

  const scoreHtml = score !== null
    ? `<span style="
        background:${scoreColor(score)};
        color:#000;
        font-weight:700;
        padding:2px 8px;
        font-size:12px;
        border:2px solid #000;
        box-shadow:3px 3px 0 #000;
        display:inline-block;
      ">${score}/100 · ${scoreLabel(score)}</span>`
    : `<span style="color:#888;font-size:11px;">checking…</span>`;

  el.innerHTML = `
    <div style="
      position:fixed;
      z-index:2147483647;
      background:#181818;
      border:2px solid #000;
      box-shadow:4px 4px 0 #000;
      padding:10px 14px;
      font-family:monospace;
      min-width:240px;
      max-width:320px;
      pointer-events:auto;
    ">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="color:#F5E642;font-size:10px;font-weight:700;letter-spacing:1px;">⚡ QUICKDRAW</span>
        <span id="qd-close" style="color:#888;cursor:pointer;font-size:14px;line-height:1;">✕</span>
      </div>
      <div style="color:#aaa;font-size:11px;margin-bottom:8px;">${short}</div>
      <div style="margin-bottom:6px;">${scoreHtml}</div>
      <div style="color:#666;font-size:10px;margin-bottom:8px;">${summary}</div>
      <div style="display:flex;gap:8px;">
        <a href="https://solscan.io/token/${address}" target="_blank" style="
          color:#000;background:#F5E642;
          border:2px solid #000;box-shadow:2px 2px 0 #000;
          padding:3px 10px;font-size:11px;font-weight:700;
          text-decoration:none;display:inline-block;
        ">Solscan →</a>
        <a href="https://dexscreener.com/solana/${address}" target="_blank" style="
          color:#aaa;background:#282828;
          border:1.5px solid #444;
          padding:3px 10px;font-size:11px;
          text-decoration:none;display:inline-block;
        ">DexScreener</a>
      </div>
      <div id="qd-bar" style="
        margin-top:10px;height:2px;background:#333;
      "><div id="qd-bar-fill" style="
        height:2px;width:100%;
        background:${score !== null ? scoreColor(score) : '#888'};
        transition:width linear;
      "></div></div>
    </div>
  `;

  // Position near selection
  const tooltipEl = el.firstElementChild as HTMLElement;
  const x = Math.min(rect.left + window.scrollX, window.innerWidth - 340);
  const y = rect.bottom + window.scrollY + 8;
  tooltipEl.style.left = `${x}px`;
  tooltipEl.style.top  = `${y}px`;

  document.body.appendChild(el);

  // Close button
  el.querySelector("#qd-close")?.addEventListener("click", removeTooltip);

  // Animate countdown bar
  const fill = el.querySelector("#qd-bar-fill") as HTMLElement;
  if (fill) {
    fill.style.transition = `width ${AUTO_DISMISS_MS}ms linear`;
    requestAnimationFrame(() => { fill.style.width = "0%"; });
  }

  // Auto-dismiss
  dismissTimer = setTimeout(removeTooltip, AUTO_DISMISS_MS);

  // Pause on hover
  tooltipEl.addEventListener("mouseenter", () => {
    if (dismissTimer) clearTimeout(dismissTimer);
    if (fill) { fill.style.transition = "none"; }
  });
  tooltipEl.addEventListener("mouseleave", () => {
    dismissTimer = setTimeout(removeTooltip, 2000);
    if (fill) { fill.style.transition = "width 2000ms linear"; fill.style.width = "0%"; }
  });
}

export function updateScore(score: number, summary: string) {
  const el = document.getElementById(TOOLTIP_ID);
  if (!el) return;

  const scoreEl = el.querySelector<HTMLElement>("span[style*='background']");
  if (scoreEl) {
    scoreEl.style.background = scoreColor(score);
    scoreEl.textContent = `${score}/100 · ${scoreLabel(score)}`;
  }

  const fill = el.querySelector<HTMLElement>("#qd-bar-fill");
  if (fill) fill.style.background = scoreColor(score);
}

export function removeTooltip() {
  if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }
  document.getElementById(TOOLTIP_ID)?.remove();
}
