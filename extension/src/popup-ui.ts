import type { SafetyScore, TokenPrice, WalletState, PortfolioItem } from "./types";
import { DS, ICON, safetyColor, sentenceCase, fmtUsd, ensureFonts } from "./styles";
import { sendBg } from "./shared";
import { buildTradePanel, SOL_MINT } from "./skills/trade";
import { buildAlertPanel } from "./skills/alert";
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
  ensureFonts();

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
        const icon = copyEl.querySelector<HTMLElement>(".qd-copy-icon");
        if (!span) return;
        const prev = span.textContent;
        span.textContent = "Copied";
        if (icon) icon.innerHTML = ICON.check;
        copyEl.classList.add("copied");
        setTimeout(() => {
          span.textContent = prev;
          if (icon) icon.innerHTML = ICON.copy;
          copyEl.classList.remove("copied");
        }, 1000);
      }).catch(() => {});
    });
  }

  host.style.pointerEvents = "auto";
  const controller = new PopupController(shadow, host, opts);
  controller.attachPlacement();
  shadow.getElementById("qd-alert")?.addEventListener("click", () => controller.showAlertPanel());
  shadow.getElementById("qd-watch")?.addEventListener("click", () => void controller.toggleWatch());
  void controller.loadWatchState();
  return controller;
}

export function removePopup(): void {
  document.getElementById(HOST_ID)?.remove();
}

export class PopupController {
  /** True once the trade or alert panel is open — don't auto-close mid-task. */
  isTrading = false;
  private price: number | null = null;
  private ticker: string | null = null;
  private watching = false;

  constructor(
    private shadow: ShadowRoot,
    private host: HTMLElement,
    private opts: PopupOptions,
  ) {}

  /** Set once the user drags the popup: auto-placement stops, viewport clamping stays. */
  private dragged = false;

  updatePosition(x: number, y: number): void {
    this.opts.x = x;
    this.opts.y = y;
    this.place();
  }

  /** Keep the popup on screen as its content grows, and let the header drag it. */
  attachPlacement(): void {
    const box = this.shadow.querySelector<HTMLElement>(".popup");
    if (!box) return;
    this.place();
    new ResizeObserver(() => this.place()).observe(box);
    window.addEventListener("resize", this.onResize);

    const header = this.shadow.getElementById("qd-header");
    header?.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || (e.target as Element).closest("button")) return;
      e.preventDefault();
      header.setPointerCapture(e.pointerId);
      const r = this.host.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      header.classList.add("dragging");
      const move = (ev: PointerEvent): void => {
        this.dragged = true;
        this.setClamped(ev.clientX - dx, ev.clientY - dy);
      };
      const up = (): void => {
        header.classList.remove("dragging");
        header.removeEventListener("pointermove", move);
        header.removeEventListener("pointerup", up);
        header.removeEventListener("pointercancel", up);
      };
      header.addEventListener("pointermove", move);
      header.addEventListener("pointerup", up);
      header.addEventListener("pointercancel", up);
    });
  }

  private onResize = (): void => {
    if (!this.host.isConnected) { window.removeEventListener("resize", this.onResize); return; }
    this.place();
  };

  /** Below the anchor if it fits, else above, else as high as the viewport allows. */
  private place(): void {
    if (!this.host.isConnected) return;
    if (this.dragged) {
      const r = this.host.getBoundingClientRect();
      this.setClamped(r.left, r.top);
      return;
    }
    const M = 8;
    const { offsetWidth: w, offsetHeight: h } = this.host;
    const vw = window.innerWidth, vh = window.innerHeight;
    const ax = this.opts.x, ay = this.opts.y;
    const x = ax + 16 + w <= vw - M ? ax + 16 : ax - w - M;
    let y: number;
    if (ay + M + h <= vh - M) y = ay + M;              // below the selection
    else if (ay - 24 - M - h >= M) y = ay - 24 - M - h; // above the selection line
    else y = vh - M - h;                                // as low as fits; clamp handles the rest
    this.setClamped(x, y);
  }

  private setClamped(x: number, y: number): void {
    const M = 8;
    const { offsetWidth: w, offsetHeight: h } = this.host;
    const cx = Math.min(Math.max(M, x), Math.max(M, window.innerWidth - w - M));
    const cy = Math.min(Math.max(M, y), Math.max(M, window.innerHeight - h - M));
    this.host.style.left = `${cx}px`;
    this.host.style.top = `${cy}px`;
  }

  showToken(safety: SafetyScore, price: TokenPrice | null): void {
    const bg = safetyColor(safety.score);
    const fg = safety.textColor;

    const header = this.shadow.getElementById("qd-header");
    if (header) { header.style.background = bg; header.style.color = fg; }

    const scoreEl = this.shadow.getElementById("qd-score");
    if (scoreEl) scoreEl.textContent = String(safety.score);

    const labelEl = this.shadow.getElementById("qd-score-label");
    if (labelEl) labelEl.textContent = sentenceCase(safety.label);

    this.ticker = price?.symbol ?? null;
    this.price = price?.usd ?? null;
    const tickerEl = this.shadow.getElementById("qd-ticker");
    if (tickerEl) tickerEl.textContent = price?.symbol ?? this.opts.address.slice(0, 6) + "…";
    const alertBtn = this.shadow.getElementById("qd-alert") as HTMLButtonElement | null;
    if (alertBtn) alertBtn.disabled = false;

    // Buy is the brand action; it no longer borrows the safety color.
    const buyBtn = this.shadow.getElementById("qd-buy") as HTMLButtonElement | null;
    if (buyBtn) buyBtn.classList.add("ready");

    if (price) {
      const priceEl = this.shadow.getElementById("qd-price");
      if (priceEl) priceEl.textContent = fmtUsd(price.usd);

      const up = price.change24h >= 0;
      const changeEl = this.shadow.getElementById("qd-change");
      if (changeEl) {
        changeEl.textContent = `${up ? "+" : "−"}${Math.abs(price.change24h).toFixed(1)}%`;
        changeEl.style.color = up ? DS.safe : DS.danger;
      }
      const periodEl = this.shadow.getElementById("qd-change-period");
      if (periodEl) periodEl.textContent = "24h";
    }
  }

  showSignals(flags: SignalFlag[]): void {
    const el = this.shadow.getElementById("qd-signals");
    if (!el || !flags.length) return;
    el.textContent = "";
    for (const f of flags) {
      const chip = document.createElement("span");
      chip.className = `qd-chip qd-chip-${f.severity}`;
      chip.textContent = sentenceCase(f.label);
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

  private tickerOrShort(): string {
    return this.ticker ?? this.opts.address.slice(0, 6);
  }

  private renderWatch(): void {
    const btn = this.shadow.getElementById("qd-watch");
    if (!btn) return;
    btn.innerHTML = this.watching ? ICON.bookmarkOn : ICON.bookmark;
    btn.title = this.watching ? "Remove from watchlist" : "Add to watchlist";
    btn.setAttribute("aria-pressed", String(this.watching));
  }

  async loadWatchState(): Promise<void> {
    try {
      const list = await sendBg<Array<{ mint: string }>>({ type: "list_watchlist" });
      this.watching = list.some(w => w.mint === this.opts.address);
      this.renderWatch();
    } catch { /* watchlist unavailable — button stays as "add" */ }
  }

  async toggleWatch(): Promise<void> {
    const next = !this.watching;
    this.watching = next;
    this.renderWatch();
    try {
      await sendBg(next
        ? { type: "add_watch", mint: this.opts.address, ticker: this.tickerOrShort() }
        : { type: "remove_watch", mint: this.opts.address });
    } catch {
      this.watching = !next;
      this.renderWatch();
    }
  }

  showAlertPanel(): void {
    this.isTrading = true;
    const panel = buildAlertPanel(this.opts.address, this.tickerOrShort(), this.price);
    const wrap = this.shadow.getElementById("qd-actions-wrap");
    if (wrap) { wrap.innerHTML = ""; wrap.appendChild(panel); }
  }

  async showTradePanel(outputMint: string, ticker: string, wallet: WalletState): Promise<void> {
    this.isTrading = true;
    // Look up held balance for this token
    let heldBalance = 0;
    let solBalance: number | null = null;
    if (wallet.connected) {
      try {
        const portfolio = await sendBg<PortfolioItem[]>({ type: "get_portfolio" });
        const item = portfolio.find(p => p.mint === outputMint);
        if (item) heldBalance = item.balance;
        const sol = portfolio.find(p => p.mint === SOL_MINT);
        solBalance = sol ? sol.balance : 0;
      } catch { /* portfolio unavailable — sell tab and Max hidden */ }
    }

    const tradeEl = buildTradePanel(outputMint, ticker, wallet, heldBalance, solBalance);

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
  :host { font-family: ${DS.font}; font-size: 12px; line-height: 16px; color: ${DS.text};
    font-variant-numeric: tabular-nums; }
  button { font: inherit; }
  button:focus-visible { outline: 2px solid ${DS.yellow}; outline-offset: -2px; }
  svg { display: block; }
  .popup { width: 260px; background: ${DS.bg}; border: 2px solid #000; box-shadow: ${DS.shadow};
    max-height: calc(100vh - 16px); overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain;
    animation: qd-in 240ms ${DS.ease}; }
  @keyframes qd-in { from { opacity: 0; transform: translateY(6px); } }

  #qd-header { height: 64px; padding: 0 12px 0 16px; display: flex; align-items: center; gap: 12px;
    background: ${DS.raised}; color: ${DS.textMut};
    position: sticky; top: 0; z-index: 1; cursor: grab; user-select: none; touch-action: none;
    transition: background-color 200ms ${DS.ease}, color 200ms ${DS.ease}; }
  #qd-header.dragging { cursor: grabbing; }
  #qd-score { font-size: 32px; font-weight: 700; line-height: 32px; letter-spacing: -0.02em; min-width: 40px; }
  .header-meta { flex: 1; min-width: 0; }
  #qd-score-label { font-size: 12px; line-height: 16px; }
  #qd-ticker { font-size: 16px; font-weight: 700; line-height: 20px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .header-btns { display: flex; }
  .qd-hdr-btn { display: grid; place-items: center; width: 28px; height: 28px; background: none;
    border: none; cursor: pointer; color: inherit; opacity: 0.7; transition: opacity 150ms ${DS.ease}; }
  .qd-hdr-btn:hover { opacity: 1; }

  .qd-body { padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
  .qd-addr { align-self: flex-start; display: flex; align-items: center; gap: 4px; color: ${DS.textMut};
    background: none; border: none; padding: 0; cursor: pointer; user-select: none;
    transition: color 150ms ${DS.ease}; }
  .qd-addr:hover, .qd-addr.copied { color: ${DS.textSec}; }
  .qd-addr.copied .qd-copy-icon { color: ${DS.safe}; }
  .qd-price-row { display: flex; align-items: baseline; gap: 8px; }
  .qd-price-row:has(#qd-price:empty) { display: none; }
  #qd-price { font-size: 14px; line-height: 20px; font-weight: 700; }
  #qd-change-period { color: ${DS.textMut}; }

  #qd-signals { display: none; flex-wrap: wrap; gap: 4px; }
  .qd-chip { font-size: 11px; line-height: 14px; padding: 2px 6px; border: 1px solid; }
  .qd-chip-risk { color: ${DS.danger}; border-color: ${DS.danger}; }
  .qd-chip-caution { color: ${DS.caution}; border-color: ${DS.caution}; }
  .qd-chip-info { color: ${DS.textSec}; border-color: ${DS.hairlineStrong}; }

  #qd-narration { display: none; padding: 12px 16px; color: ${DS.textSec}; line-height: 18px;
    border-top: 1px solid ${DS.hairline}; }

  .qd-actions { display: flex; height: 40px; border-top: 1px solid ${DS.hairline}; }
  .qd-actions button { flex: 1; border: none; cursor: pointer; font-size: 13px;
    transition: background-color 150ms ${DS.ease}, color 150ms ${DS.ease}; }
  #qd-buy { background: ${DS.raised}; color: ${DS.textMut}; font-weight: 700; }
  #qd-buy.ready { background: ${DS.yellow}; color: #111; }
  #qd-buy.ready:hover { background: #fff04f; }
  #qd-alert, #qd-cancel { background: ${DS.bg}; color: ${DS.textSec}; border-left: 1px solid ${DS.hairline}; }
  #qd-alert:hover:not(:disabled), #qd-cancel:hover { background: ${DS.raised}; color: ${DS.text}; }
  #qd-alert:disabled { color: ${DS.textMut}; cursor: default; }
</style>
<div class="popup">
  <div id="qd-header">
    <span id="qd-score">—</span>
    <div class="header-meta">
      <div id="qd-score-label">Checking…</div>
      <div id="qd-ticker">Quickdraw</div>
    </div>
    <div class="header-btns">
      <button id="qd-watch" class="qd-hdr-btn" title="Add to watchlist" aria-label="Watchlist" aria-pressed="false">${ICON.bookmark}</button>
      <button id="qd-gear" class="qd-hdr-btn" title="Settings" aria-label="Settings">${ICON.settings}</button>
      <button id="qd-close" class="qd-hdr-btn" title="Dismiss" aria-label="Dismiss">${ICON.x}</button>
    </div>
  </div>
  <div class="qd-body">
    <button id="qd-copy" class="qd-addr" title="Copy address"><span>${short}</span><span class="qd-copy-icon">${ICON.copy}</span></button>
    <div class="qd-price-row">
      <span id="qd-price"></span>
      <span id="qd-change"></span>
      <span id="qd-change-period"></span>
    </div>
    <div id="qd-signals"></div>
  </div>
  <div id="qd-narration"></div>
  <div id="qd-actions-wrap">
    <div class="qd-actions">
      <button id="qd-buy">Buy</button>
      <button id="qd-alert" disabled>Alert</button>
      <button id="qd-cancel">Cancel</button>
    </div>
  </div>
</div>`;
}
