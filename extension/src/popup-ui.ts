import type { SafetyScore, TokenPrice, WalletState, SkillSettings } from "./types";
import { DS, safetyColor } from "./styles";

const HOST_ID = "quickdraw-host";

export type SkillTab = "TRADE" | "ALERT" | "WATCH" | "DEEP";

export interface PopupCallbacks {
  onDismiss: () => void;
  onGear: () => void;
  onSkillTab: (tab: SkillTab) => void;
}

export interface PopupOptions {
  address: string;
  x: number;
  y: number;
  callbacks: PopupCallbacks;
  skillSettings?: SkillSettings;
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
  shadow.innerHTML = buildShell(opts.address, opts.skillSettings);

  shadow.getElementById("qd-close")?.addEventListener("click", () => {
    removePopup();
    opts.callbacks.onDismiss();
  });

  shadow.getElementById("qd-gear")?.addEventListener("click", () => {
    opts.callbacks.onGear();
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

  const TABS: SkillTab[] = ["TRADE", "ALERT", "WATCH", "DEEP"];
  TABS.forEach(tab => {
    shadow.getElementById(`qd-tab-${tab.toLowerCase()}`)?.addEventListener("click", () => {
      setActiveTab(shadow, tab);
      opts.callbacks.onSkillTab(tab);
    });
  });

  host.style.pointerEvents = "auto";
  return new PopupController(shadow, host, opts);
}

export function removePopup(): void {
  document.getElementById(HOST_ID)?.remove();
}

function setActiveTab(shadow: ShadowRoot, active: SkillTab): void {
  const tabs: SkillTab[] = ["TRADE", "ALERT", "WATCH", "DEEP"];
  tabs.forEach(tab => {
    const el = shadow.getElementById(`qd-tab-${tab.toLowerCase()}`);
    if (!el) return;
    if (tab === active) {
      el.style.color = DS.yellow;
      el.style.borderBottom = `2px solid ${DS.yellow}`;
    } else {
      el.style.color = DS.textDim;
      el.style.borderBottom = "2px solid transparent";
    }
  });
}

export class PopupController {
  private activeTab: SkillTab | null = null;

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
    const color = safetyColor(safety.score);
    const header = this.shadow.getElementById("qd-header");
    if (header) {
      header.style.background = color;
      header.style.color = "#000";
    }

    const scoreEl = this.shadow.getElementById("qd-score");
    if (scoreEl) scoreEl.textContent = String(safety.score);

    const labelEl = this.shadow.getElementById("qd-score-label");
    if (labelEl) labelEl.textContent = safety.label;

    const tickerEl = this.shadow.getElementById("qd-ticker");
    if (tickerEl) tickerEl.textContent = price?.symbol ?? this.opts.address.slice(0, 6) + "…";

    if (price) {
      const priceEl = this.shadow.getElementById("qd-price");
      if (priceEl) {
        priceEl.textContent = `$${price.usd < 0.01 ? price.usd.toFixed(6) : price.usd.toFixed(4)}`;
        const dir = price.change24h >= 0 ? "▲" : "▼";
        const changeColor = price.change24h >= 0 ? DS.safe : DS.danger;
        const changeEl = this.shadow.getElementById("qd-change");
        if (changeEl) {
          changeEl.textContent = `${dir} ${Math.abs(price.change24h).toFixed(1)}%`;
          changeEl.style.color = changeColor;
        }
        const volEl = this.shadow.getElementById("qd-vol");
        const vol24h = price.volume24h;
        if (volEl && vol24h) {
          const vol = vol24h >= 1_000_000
            ? `$${(vol24h / 1_000_000).toFixed(1)}M`
            : `$${(vol24h / 1_000).toFixed(0)}K`;
          volEl.textContent = `Vol 24h: ${vol}`;
          volEl.style.display = "block";
        }
      }
    }
  }

  updateWallet(_wallet: WalletState): void {
    if (this.activeTab === "TRADE") {
      this.opts.callbacks.onSkillTab("TRADE");
    }
  }

  mountPanel(panelEl: HTMLElement): void {
    const panel = this.shadow.getElementById("qd-panel");
    if (panel) {
      panel.innerHTML = "";
      panel.appendChild(panelEl);
    }
  }

  activateSkill(tab: SkillTab): void {
    this.activeTab = tab;
    setActiveTab(this.shadow, tab);
  }

  showError(msg: string): void {
    const panel = this.shadow.getElementById("qd-panel");
    if (panel) {
      panel.innerHTML = `<div style="padding:10px 12px;font-size:10px;color:${DS.danger};font-family:${DS.font};">⚠ ${msg}</div>`;
    }
  }

  appendNarration(_delta: string): void {
    // narration removed — DEEP panel handles AI text
  }
}

function buildShell(address: string, skills?: SkillSettings): string {
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const tabs: SkillTab[] = ["TRADE", "ALERT", "WATCH", "DEEP"];
  const enabledTabs = tabs.filter(t => !skills || skills[t.toLowerCase() as keyof SkillSettings] !== false);

  const tabsHtml = enabledTabs.map((tab, i) => `
    ${i > 0 ? `<div class="qd-tab-div"></div>` : ""}
    <button id="qd-tab-${tab.toLowerCase()}" class="qd-tab">${tab}</button>
  `).join("");

  return `
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :host { font-family: ${DS.font}; font-size: 12px; }
  .popup { width: 288px; background: ${DS.bg}; border: 2px solid #000; box-shadow: 3px 3px 0 #333; overflow: hidden; }
  #qd-header { padding: 10px 12px; display: flex; align-items: center; gap: 10px;
    background: ${DS.bg}; color: #000; transition: background 0.15s; }
  #qd-score { font-size: 34px; font-weight: 700; line-height: 1; min-width: 48px; }
  .header-meta { flex: 1; }
  #qd-score-label { font-size: 9px; font-weight: 700; letter-spacing: 0.08em; opacity: 0.6; }
  #qd-ticker { font-size: 17px; font-weight: 700; line-height: 1.2; margin-top: 2px; }
  .header-btns { display: flex; gap: 4px; margin-left: auto; }
  .qd-hdr-btn { background: none; border: none; cursor: pointer; font-size: 14px;
    opacity: 0.5; color: inherit; padding: 2px 4px; line-height: 1; font-family: inherit; }
  .qd-hdr-btn:hover { opacity: 1; }
  .qd-addr { padding: 4px 12px 0; font-size: 10px; color: #555; letter-spacing: 0.04em;
    cursor: pointer; display: flex; align-items: center; gap: 4px; user-select: none; }
  .qd-addr:hover { color: #888; }
  .qd-addr:hover .qd-copy-icon { opacity: 1; }
  .qd-copy-icon { opacity: 0; font-size: 9px; transition: opacity 0.1s; }
  .qd-price-row { padding: 6px 12px 2px; display: flex; align-items: baseline; gap: 8px; }
  #qd-price { font-size: 13px; color: #fff; font-weight: 700; }
  #qd-change { font-size: 11px; }
  #qd-vol { padding: 0 12px 6px; font-size: 10px; color: ${DS.textMut}; display: none; }
  .qd-sep { border: none; border-top: 1px solid #1e1e1e; }
  .qd-skill-tabs { display: flex; align-items: stretch; border-top: 1px solid #1e1e1e; }
  .qd-tab { flex: 1; padding: 8px 0; font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
    cursor: pointer; border: none; background: ${DS.bg}; color: ${DS.textDim};
    font-family: inherit; border-bottom: 2px solid transparent; transition: color 0.1s; }
  .qd-tab:hover { color: #aaa; }
  .qd-tab-div { width: 1px; background: #2a2a2a; flex-shrink: 0; }
  .qd-panel-sep { border: none; border-top: 1px solid #2a2a2a; }
  #qd-panel { min-height: 40px; }
</style>
<div class="popup">
  <div id="qd-header">
    <span id="qd-score">?</span>
    <div class="header-meta">
      <div id="qd-score-label">FETCHING…</div>
      <div id="qd-ticker">⚡ QUICKDRAW</div>
    </div>
    <div class="header-btns">
      <button id="qd-gear" class="qd-hdr-btn" title="Settings">⚙</button>
      <button id="qd-close" class="qd-hdr-btn" title="Dismiss">✕</button>
    </div>
  </div>
  <div class="qd-addr" id="qd-copy"><span>${short}</span><span class="qd-copy-icon">⧉</span></div>
  <div class="qd-price-row">
    <span id="qd-price"></span>
    <span id="qd-change"></span>
  </div>
  <div id="qd-vol"></div>
  <hr class="qd-sep" />
  <div class="qd-skill-tabs">${tabsHtml}</div>
  <hr class="qd-panel-sep" />
  <div id="qd-panel"></div>
</div>`;
}
