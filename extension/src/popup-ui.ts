import type { SafetyScore, TokenPrice, WalletState, PortfolioItem } from "./types";
import { DS, safetyColor } from "./styles";
import { sendBg } from "./shared";
import { buildTradePanel } from "./skills/trade";
import type { SignalFlag } from "./jev-signals";

const HOST_ID = "quickdraw-host";

export interface PopupCallbacks {
  onDismiss: () => void;
  onGear: () => void;
  onBuy: () => void;
}

export interface PopupOptions {
  address: string;
  x: number;
  y: number;
  callbacks: PopupCallbacks;
}

export function createPopup(opts: PopupOptions): PopupController {
  removePopup();

  const host = document.createElement("div");
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: "fixed",
    left: `${opts.x}px`,
    top: `${opts.y}px`,
    zIndex: "2147483647",
    pointerEvents: "none",
  });
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = buildShell(opts.address);

  shadow.getElementById("qd-close")?.addEventListener("click", () => {
    removePopup();
    opts.callbacks.onDismiss();
  });

  shadow.getElementById("qd-gear")?.addEventListener("click", () => {
    opts.callbacks.onGear();
  });

  shadow.getElementById("qd-buy")?.addEventListener("click", () => {
    opts.callbacks.onBuy();
  });

  shadow.getElementById("qd-cancel")?.addEventListener("click", () => {
    removePopup();
    opts.callbacks.onDismiss();
  });

  const copyEl = shadow.getElementById("qd-copy");
  if (copyEl) {
    copyEl.addEventListener("click", () => {
      navigator.clipboard.writeText(opts.address).then(() => {
        const span = copyEl.querySelector("span");
        if (!span) return;
        const prev = span.textContent;
        span.textContent = "COPIED!";
        copyEl.style.color = DS.safe;
        setTimeout(() => { span.textContent = prev; copyEl.style.color = ""; }, 1000);
      }).catch(() => {});
    });
  }

  host.style.pointerEvents = "auto";
  return new PopupController(shadow, host, opts);
}

export function removePopup(): void {
  document.getElementById(HOST_ID)?.remove();
}

export class PopupController {
  /** True once the trade panel is open — don't auto-close mid-swap. */
  isTrading = false;

  constructor(
    private shadow: ShadowRoot,
    private host: HTMLElement,
    private opts: PopupOptions,
  ) {}

  updatePosition(x: number, y: number): void {
    this.host.style.left = `${x}px`;
    this.host.style.top = `${y}px`;
  }

  showToken(safety: SafetyScore, price: TokenPrice | null): void {
    const bg = safetyColor(safety.score);
    const fg = safety.textColor;

    const header = this.shadow.getElementById("qd-header");
    if (header) { header.style.background = bg; header.style.color = fg; }

    const scoreEl = this.shadow.getElementById("qd-score");
    if (scoreEl) scoreEl.textContent = String(safety.score);

    const labelEl = this.shadow.getElementById("qd-score-label");
    if (labelEl) labelEl.textContent = safety.label;

    const tickerEl = this.shadow.getElementById("qd-ticker");
    if (tickerEl) tickerEl.textContent = price?.symbol ?? this.opts.address.slice(0, 6) + "…";

    const buyBtn = this.shadow.getElementById("qd-buy") as HTMLButtonElement | null;
    if (buyBtn) { buyBtn.style.background = bg; buyBtn.style.color = fg; }

    if (price) {
      const priceEl = this.shadow.getElementById("qd-price");
      if (priceEl) priceEl.textContent = `$${price.usd < 0.01 ? price.usd.toFixed(6) : price.usd.toFixed(4)}`;

      const dir = price.change24h >= 0 ? "▲" : "▼";
      const changeEl = this.shadow.getElementById("qd-change");
      if (changeEl) {
        changeEl.textContent = `${dir} ${Math.abs(price.change24h).toFixed(1)}%`;
        changeEl.style.color = price.change24h >= 0 ? "#8BF542" : "#F54242";
      }
    }
  }

  showSignals(flags: SignalFlag[]): void {
    const el = this.shadow.getElementById("qd-signals");
    if (!el || !flags.length) return;
    el.textContent = "";
    for (const f of flags) {
      const chip = document.createElement("span");
      chip.className = `qd-chip qd-chip-${f.severity}`;
      chip.textContent = f.label;
      el.appendChild(chip);
    }
    el.style.display = "flex";
  }

  appendNarration(delta: string): void {
    const el = this.shadow.getElementById("qd-narration");
    if (!el) return;
    if (el.style.display === "none" || !el.style.display) el.style.display = "block";
    el.textContent += delta;
  }

  showError(msg: string): void {
    const labelEl = this.shadow.getElementById("qd-score-label");
    if (labelEl) labelEl.textContent = msg || "Not found";
  }

  updateWallet(_wallet: WalletState): void {}

  async showTradePanel(outputMint: string, ticker: string, wallet: WalletState): Promise<void> {
    this.isTrading = true;
    // Look up held balance for this token
    let heldBalance = 0;
    if (wallet.connected) {
      try {
        const portfolio = await sendBg<PortfolioItem[]>({ type: "get_portfolio" });
        const item = portfolio.find(p => p.mint === outputMint);
        if (item) heldBalance = item.balance;
      } catch { /* portfolio unavailable — sell tab hidden */ }
    }

    const tradeEl = buildTradePanel(outputMint, ticker, wallet, heldBalance);

    // Replace the actions bar with the trade panel inside the shadow root
    const actionsEl = this.shadow.getElementById("qd-actions-wrap");
    if (actionsEl) {
      actionsEl.innerHTML = "";
      actionsEl.appendChild(tradeEl);
    } else {
      // Fallback: append to popup container
      const popup = this.shadow.querySelector(".popup");
      if (popup) popup.appendChild(tradeEl);
    }
  }
}

function buildShell(address: string): string {
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return `
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :host { font-family: ${DS.font}; font-size: 12px; }
  .popup { width: 260px; background: ${DS.bg}; border: 2px solid #333; box-shadow: 3px 3px 0 #333; overflow: hidden; }
  #qd-header { padding: 12px 10px; display: flex; align-items: center; gap: 10px;
    background: #222; color: #555; transition: background 0.15s, color 0.15s; }
  #qd-score { font-size: 34px; font-weight: 700; line-height: 1; min-width: 44px; }
  .header-meta { flex: 1; }
  #qd-score-label { font-size: 9px; font-weight: 700; letter-spacing: 0.08em; }
  #qd-ticker { font-size: 17px; font-weight: 700; line-height: 1.2; margin-top: 1px; }
  .header-btns { display: flex; gap: 6px; }
  .qd-hdr-btn { background: none; border: none; cursor: pointer; font-size: 13px;
    color: inherit; padding: 2px; line-height: 1; font-family: Inter, sans-serif; opacity: 0.7; }
  .qd-hdr-btn:hover { opacity: 1; }
  .qd-addr { padding: 4px 12px; font-size: 10px; color: #444; letter-spacing: 0.04em;
    cursor: pointer; display: flex; align-items: center; gap: 4px; user-select: none; }
  .qd-addr:hover { color: #666; }
  .qd-copy-icon { opacity: 0; font-size: 9px; }
  .qd-addr:hover .qd-copy-icon { opacity: 1; }
  .qd-price-row { padding: 8px 12px 4px; display: flex; align-items: center; gap: 10px; }
  #qd-price { font-size: 13px; color: #fff; font-weight: 700; }
  #qd-change { font-size: 12px; font-weight: 700; }
  #qd-signals { display: none; flex-wrap: wrap; gap: 4px; padding: 2px 12px 6px; }
  .qd-chip { font-size: 9px; font-weight: 700; letter-spacing: 0.06em; padding: 2px 5px; border: 1px solid; }
  .qd-chip-risk { color: ${DS.danger}; border-color: ${DS.danger}; }
  .qd-chip-caution { color: ${DS.caution}; border-color: ${DS.caution}; }
  .qd-chip-info { color: #888; border-color: #444; }
  #qd-narration { display: none; padding: 6px 12px 8px; font-size: 10px; color: #666;
    line-height: 1.5; font-style: italic; border-top: 1px solid #1e1e1e; }
  .qd-sep { height: 1px; background: #1e1e1e; }
  .qd-actions { display: flex; height: 34px; }
  #qd-buy { flex: 1; background: #2a2a2a; color: #555; font-family: ${DS.font}; font-size: 11px;
    font-weight: 700; letter-spacing: 0.06em; cursor: pointer; border: none;
    transition: background 0.15s, color 0.15s; }
  #qd-buy:hover { filter: brightness(1.1); }
  .qd-act-div { width: 1px; background: #111; flex-shrink: 0; }
  #qd-cancel { flex: 1; background: #1a1a1a; color: #fff; font-family: ${DS.font}; font-size: 11px;
    font-weight: 700; letter-spacing: 0.06em; cursor: pointer; border: none; }
  #qd-cancel:hover { background: #222; }
</style>
<div class="popup">
  <div id="qd-header">
    <span id="qd-score">—</span>
    <div class="header-meta">
      <div id="qd-score-label">FETCHING…</div>
      <div id="qd-ticker">⚡ QUICKDRAW</div>
    </div>
    <div class="header-btns">
      <button id="qd-gear" class="qd-hdr-btn" title="Settings">⚙</button>
      <button id="qd-close" class="qd-hdr-btn" title="Dismiss">✕</button>
    </div>
  </div>
  <div id="qd-copy" class="qd-addr"><span>${short}</span><span class="qd-copy-icon">⧉</span></div>
  <div class="qd-price-row">
    <span id="qd-price"></span>
    <span id="qd-change"></span>
  </div>
  <div id="qd-signals"></div>
  <div id="qd-narration"></div>
  <div class="qd-sep"></div>
  <div id="qd-actions-wrap">
    <div class="qd-actions">
      <button id="qd-buy">BUY</button>
      <div class="qd-act-div"></div>
      <button id="qd-cancel">CANCEL</button>
    </div>
  </div>
</div>`;
}
