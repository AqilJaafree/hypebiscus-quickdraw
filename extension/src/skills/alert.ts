import type { ServerAlert } from "../types";
import { DS, ICON, brutal, fmtUsd } from "../styles";
import { sendBg, esc } from "../shared";

type Condition = "ABOVE" | "BELOW";

export function parseAlertPrice(input: string): number | null {
  const n = Number(String(input).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A starting target 10% away from the current price, 4 significant digits. */
export function suggestPrice(current: number | null, condition: Condition): string {
  if (!current || current <= 0) return "";
  return Number((current * (condition === "ABOVE" ? 1.1 : 0.9)).toPrecision(4)).toString();
}

export function conditionLabel(c: Condition): string {
  return c === "ABOVE" ? "Above" : "Below";
}

interface AlertState {
  condition: Condition;
  priceInput: string;
  saving: boolean;
  error: string | null;
  saved: boolean;
  existing: ServerAlert[];
}

const CSS = `
<style>
  .qd-al { display:flex; flex-direction:column; gap:12px; }
  .qd-al-tabs { display:flex; border:1px solid ${DS.hairline}; padding:2px; gap:2px; }
  .qd-al-tab { flex:1; height:28px; border:none; cursor:pointer; background:none; color:${DS.textMut};
    font-size:12px; font-family:${DS.font}; transition:background-color 150ms ${DS.ease}, color 150ms ${DS.ease}; }
  .qd-al-tab:hover { color:${DS.textSec}; }
  .qd-al-tab.active { background:${DS.raised}; color:${DS.text}; }
  .qd-al-field { display:flex; flex-direction:column; gap:8px; }
  .qd-al-label { display:flex; justify-content:space-between; color:${DS.textMut}; }
  .qd-al-row { display:flex; align-items:center; height:40px; background:${DS.raised};
    border:1px solid ${DS.hairline}; transition:border-color 150ms ${DS.ease}; }
  .qd-al-row:focus-within { border-color:${DS.yellow}; }
  .qd-al-unit { color:${DS.textMut}; padding-left:12px; }
  .qd-al-input { flex:1; min-width:0; height:100%; background:none; border:none; outline:none; color:${DS.text};
    padding:0 12px 0 4px; font-family:${DS.font}; font-size:14px; font-variant-numeric:tabular-nums; }
  .qd-al-input::-webkit-inner-spin-button { -webkit-appearance:none; }
  .qd-al-btn { width:100%; height:40px; ${brutal(DS.yellow)}; color:#111; font-size:13px; font-weight:700;
    cursor:pointer; font-family:${DS.font}; transition:transform 120ms ${DS.ease}, box-shadow 120ms ${DS.ease}; }
  .qd-al-btn:active:not(:disabled) { transform:translate(2px,2px); box-shadow:1px 1px 0 #333; }
  .qd-al-btn:disabled { opacity:0.5; cursor:not-allowed; }
  .qd-al-ok { display:flex; align-items:center; gap:8px; color:${DS.safe}; }
  .qd-al-err { color:${DS.danger}; line-height:18px; }
  .qd-al-list { display:flex; flex-direction:column; border-top:1px solid ${DS.hairline}; padding-top:8px; }
  .qd-al-item { display:flex; align-items:center; justify-content:space-between; height:28px; color:${DS.textSec}; }
  .qd-al-item b { color:${DS.text}; font-weight:400; }
  .qd-al-fired { color:${DS.textMut}; font-size:11px; margin-left:8px; }
  .qd-al-del { display:grid; place-items:center; width:24px; height:24px; background:none; border:none;
    color:${DS.textMut}; cursor:pointer; transition:color 150ms ${DS.ease}; }
  .qd-al-del:hover { color:${DS.danger}; }
</style>`;

export function buildAlertHTML(ticker: string, currentPrice: number | null, s: AlertState): string {
  const list = s.existing.length ? `
<div class="qd-al-list">
  ${s.existing.map(a => `
  <div class="qd-al-item">
    <span>${conditionLabel(a.condition)} <b>${esc(fmtUsd(a.price))}</b>${a.triggered ? `<span class="qd-al-fired">Fired</span>` : ""}</span>
    <button class="qd-al-del" data-id="${esc(a.id)}" title="Remove alert" aria-label="Remove alert">${ICON.x}</button>
  </div>`).join("")}
</div>` : "";

  return `${CSS}
<div class="qd-al">
  <div class="qd-al-tabs" role="tablist">
    <button id="qd-al-above" class="qd-al-tab${s.condition === "ABOVE" ? " active" : ""}" role="tab">Above</button>
    <button id="qd-al-below" class="qd-al-tab${s.condition === "BELOW" ? " active" : ""}" role="tab">Below</button>
  </div>
  <div class="qd-al-field">
    <div class="qd-al-label"><span>Target price</span>${currentPrice ? `<span>Now ${esc(fmtUsd(currentPrice))}</span>` : ""}</div>
    <div class="qd-al-row">
      <span class="qd-al-unit">$</span>
      <input id="qd-al-price" class="qd-al-input" type="number" inputmode="decimal" step="any" min="0"
        aria-label="Alert price in USD" value="${esc(s.priceInput)}" />
    </div>
  </div>
  ${s.error ? `<div class="qd-al-err">${esc(s.error)}</div>` : ""}
  ${s.saved ? `<div class="qd-al-ok">${ICON.check} Alert set. You'll get a notification, even with this tab closed</div>` : ""}
  <button id="qd-al-set" class="qd-al-btn" ${s.saving ? "disabled" : ""}>${s.saving ? "Saving…" : "Set alert"}</button>
  ${list}
</div>`;
}

export function buildAlertPanel(mint: string, ticker: string, currentPrice: number | null): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `padding:12px 16px 16px;font-family:${DS.font};`;

  let state: AlertState = {
    condition: "ABOVE",
    priceInput: suggestPrice(currentPrice, "ABOVE"),
    saving: false,
    error: null,
    saved: false,
    existing: [],
  };

  const setCondition = (condition: Condition): void => {
    if (state.condition === condition) return;
    state = { ...state, condition, priceInput: suggestPrice(currentPrice, condition), error: null, saved: false };
    render();
  };

  async function refresh(): Promise<void> {
    try {
      const all = await sendBg<ServerAlert[]>({ type: "list_alerts" });
      state = { ...state, existing: all.filter(a => a.mint === mint) };
    } catch (e) {
      state = { ...state, error: e instanceof Error ? e.message : "Couldn't load alerts" };
    }
    render();
  }

  async function save(): Promise<void> {
    const price = parseAlertPrice(state.priceInput);
    if (price === null) {
      state = { ...state, error: "Enter a price above $0", saved: false };
      render();
      return;
    }
    state = { ...state, saving: true, error: null, saved: false };
    render();
    try {
      await sendBg<ServerAlert>({ type: "create_alert", mint, ticker, condition: state.condition, price });
      state = { ...state, saving: false, saved: true };
      await refresh();
    } catch (e) {
      state = { ...state, saving: false, error: e instanceof Error ? e.message : "Couldn't save the alert" };
      render();
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await sendBg({ type: "delete_alert", id });
      state = { ...state, saved: false };
      await refresh();
    } catch (e) {
      state = { ...state, error: e instanceof Error ? e.message : "Couldn't remove the alert" };
      render();
    }
  }

  function render(): void {
    el.innerHTML = buildAlertHTML(ticker, currentPrice, state);
    el.querySelector("#qd-al-above")?.addEventListener("click", () => setCondition("ABOVE"));
    el.querySelector("#qd-al-below")?.addEventListener("click", () => setCondition("BELOW"));
    const input = el.querySelector<HTMLInputElement>("#qd-al-price");
    input?.addEventListener("input", () => { state = { ...state, priceInput: input.value }; });
    input?.addEventListener("keydown", (e) => { if (e.key === "Enter") void save(); });
    el.querySelector("#qd-al-set")?.addEventListener("click", () => void save());
    el.querySelectorAll<HTMLButtonElement>(".qd-al-del").forEach(b =>
      b.addEventListener("click", () => void remove(b.dataset.id ?? "")));
  }

  render();
  void refresh();
  return el;
}
