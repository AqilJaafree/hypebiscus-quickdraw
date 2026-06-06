import type { SafetyScore, TokenPrice, WalletState } from "./types";

const HOST_ID = "quickdraw-host";

export interface PopupCallbacks {
  onDismiss: () => void;
  onSwapClick: () => void;
  onConnectWallet: () => void;
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

  // Wire dismiss
  shadow.getElementById("qd-close")?.addEventListener("click", () => {
    removePopup();
    opts.callbacks.onDismiss();
  });

  // Wire swap / connect button
  shadow.getElementById("qd-swap")?.addEventListener("click", () => {
    opts.callbacks.onSwapClick();
  });

  host.style.pointerEvents = "auto";

  return new PopupController(shadow, host, opts);
}

export function removePopup(): void {
  document.getElementById(HOST_ID)?.remove();
}

export class PopupController {
  constructor(
    private shadow: ShadowRoot,
    private host: HTMLElement,
    private opts: PopupOptions,
  ) {}

  updatePosition(x: number, y: number): void {
    this.host.style.left = `${x}px`;
    this.host.style.top = `${y}px`;
  }

  showToken(safety: SafetyScore, price: TokenPrice | null, wallet: WalletState): void {
    const header = this.shadow.getElementById("qd-header");
    if (header) {
      header.style.background = safety.color;
      header.style.color = safety.textColor;
    }

    const scoreEl = this.shadow.getElementById("qd-score");
    if (scoreEl) scoreEl.textContent = String(safety.score);

    const labelEl = this.shadow.getElementById("qd-score-label");
    if (labelEl) labelEl.textContent = safety.label;

    const tickerEl = this.shadow.getElementById("qd-ticker");
    if (tickerEl) tickerEl.textContent = price?.symbol ?? this.opts.address.slice(0, 6) + "…";

    const priceEl = this.shadow.getElementById("qd-price");
    if (priceEl && price) {
      priceEl.textContent = `$${price.usd < 0.01 ? price.usd.toFixed(6) : price.usd.toFixed(4)}`;
      priceEl.style.display = "block";
    }

    const narrationEl = this.shadow.getElementById("qd-narration");
    if (narrationEl) narrationEl.textContent = "Analyzing…";

    const swapBtn = this.shadow.getElementById("qd-swap") as HTMLButtonElement | null;
    if (swapBtn) {
      swapBtn.textContent = wallet.connected ? "SWAP" : "CONNECT WALLET";
      swapBtn.style.background = safety.color;
      swapBtn.style.color = safety.textColor;
    }
  }

  appendNarration(delta: string): void {
    const el = this.shadow.getElementById("qd-narration");
    if (!el) return;
    if (el.textContent === "Analyzing…") el.textContent = "";
    el.textContent += delta;
  }

  showError(msg: string): void {
    const el = this.shadow.getElementById("qd-narration");
    if (el) { el.textContent = msg; el.style.color = "#F54242"; }
  }

  mountSwapPanel(panelEl: HTMLElement): void {
    const footer = this.shadow.getElementById("qd-footer");
    if (footer) {
      footer.replaceWith(panelEl);
      panelEl.id = "qd-footer";
    }
  }
}

function buildShell(address: string): string {
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return `
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :host {
    font-family: 'Space Mono', 'Courier New', monospace;
    font-size: 12px;
  }
  .popup {
    width: 280px;
    background: #181818;
    border: 2px solid #000;
    box-shadow: 4px 4px 0 #000;
    overflow: hidden;
  }
  #qd-header {
    background: #1e1e1e;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: #111;
    transition: background 0.15s;
  }
  #qd-score {
    font-size: 32px;
    font-weight: 700;
    line-height: 1;
    min-width: 44px;
  }
  .header-meta { flex: 1; }
  #qd-score-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    opacity: 0.6;
    text-transform: uppercase;
  }
  #qd-ticker {
    font-size: 16px;
    font-weight: 700;
    line-height: 1.2;
    margin-top: 2px;
  }
  #qd-close {
    margin-left: auto;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    opacity: 0.5;
    color: inherit;
    padding: 2px 4px;
    line-height: 1;
  }
  #qd-close:hover { opacity: 1; }
  .qd-addr {
    padding: 5px 12px 0;
    font-size: 10px;
    color: #555;
    letter-spacing: 0.04em;
  }
  #qd-price {
    padding: 6px 12px 2px;
    font-size: 13px;
    color: #fff;
    font-weight: 700;
    display: none;
  }
  #qd-narration {
    padding: 4px 12px 10px;
    font-size: 11px;
    color: #888;
    line-height: 1.5;
    min-height: 32px;
  }
  #qd-footer {
    display: flex;
    border-top: 1px solid #1e1e1e;
  }
  #qd-swap {
    flex: 1;
    padding: 9px 0;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    cursor: pointer;
    border: none;
    background: #333;
    color: #888;
    font-family: inherit;
    transition: background 0.15s;
  }
  #qd-cancel {
    padding: 9px 12px;
    font-size: 11px;
    color: #555;
    cursor: pointer;
    border: none;
    background: #1a1a1a;
    border-left: 1px solid #1e1e1e;
    font-family: inherit;
  }
  #qd-cancel:hover { color: #fff; }
</style>
<div class="popup">
  <div id="qd-header">
    <span id="qd-score">?</span>
    <div class="header-meta">
      <div id="qd-score-label">…</div>
      <div id="qd-ticker">⚡ QUICKDRAW</div>
    </div>
    <button id="qd-close" title="Dismiss">✕</button>
  </div>
  <div class="qd-addr">${short}</div>
  <div id="qd-price"></div>
  <div id="qd-narration">Fetching…</div>
  <div id="qd-footer">
    <button id="qd-swap">SWAP</button>
    <button id="qd-cancel">✕</button>
  </div>
</div>`;
}
