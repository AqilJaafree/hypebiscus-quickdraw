import type { PriceAlert } from "../types";
import { DS, brutal } from "../styles";
import { sendBg, esc } from "../shared";

export function alertShouldFire(alert: PriceAlert, currentPrice: number): boolean {
  if (alert.triggered) return false;
  if (alert.condition === "ABOVE") return currentPrice > alert.price;
  return currentPrice < alert.price;
}

export function alertShouldRearm(alert: PriceAlert, currentPrice: number): boolean {
  if (!alert.triggered) return false;
  if (alert.condition === "ABOVE") return currentPrice <= alert.price;
  return currentPrice >= alert.price;
}

export function buildAlertPanel(
  mint: string,
  ticker: string,
  currentPrice: number,
  existingAlerts: PriceAlert[],
  onAlertSet: (alerts: PriceAlert[]) => void,
): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `padding:10px 12px;font-family:${DS.font};`;

  let condition: "ABOVE" | "BELOW" = "ABOVE";
  let priceInput = currentPrice > 0 ? currentPrice.toPrecision(4) : "";

  function render(): void {
    el.innerHTML = buildAlertHTML(ticker, condition, priceInput, existingAlerts);

    el.querySelector<HTMLButtonElement>("#qd-alert-above")?.addEventListener("click", () => {
      condition = "ABOVE";
      render();
    });
    el.querySelector<HTMLButtonElement>("#qd-alert-below")?.addEventListener("click", () => {
      condition = "BELOW";
      render();
    });
    const priceEl = el.querySelector<HTMLInputElement>("#qd-alert-price");
    if (priceEl) {
      priceEl.addEventListener("input", (e) => {
        priceInput = (e.target as HTMLInputElement).value;
      });
    }
    el.querySelector<HTMLButtonElement>("#qd-alert-set")?.addEventListener("click", async () => {
      const price = parseFloat(priceInput);
      if (isNaN(price) || price <= 0) return;
      try {
        const existing = await sendBg<PriceAlert[]>({ type: "get_alerts" });
        const filtered = existing.filter(a => !(a.mint === mint && a.condition === condition));
        const updated: PriceAlert[] = [
          ...filtered,
          { mint, ticker, condition, price, triggered: false },
        ];
        await sendBg({ type: "set_alerts", alerts: updated });
        onAlertSet(updated);
      } catch {
        // silently ignore — alert wasn't saved, will be apparent to user
      }
      render();
    });
    existingAlerts.forEach((alert) => {
      const key = `${alert.mint}_${alert.condition}`;
      el.querySelector(`#qd-alert-del-${CSS.escape(key)}`)?.addEventListener("click", async () => {
        try {
          const existing = await sendBg<PriceAlert[]>({ type: "get_alerts" });
          const updated = existing.filter(a => !(a.mint === alert.mint && a.condition === alert.condition));
          await sendBg({ type: "set_alerts", alerts: updated });
          onAlertSet(updated);
        } catch {
          // silently ignore — next render will reflect actual state
        }
        render();
      });
    });
  }

  render();
  return el;
}

function buildAlertHTML(
  ticker: string,
  condition: "ABOVE" | "BELOW",
  priceInput: string,
  alerts: PriceAlert[],
): string {
  const activeStyle = `${brutal(DS.yellow)};color:#000;padding:4px 12px;font-family:${DS.font};font-size:11px;font-weight:700;cursor:pointer;`;
  const inactiveStyle = `background:${DS.bg};color:${DS.textMut};padding:4px 12px;font-family:${DS.font};font-size:11px;cursor:pointer;border:1px solid #333;`;

  return `
<style>
  .qd-al-label { font-size:10px; color:${DS.textMut}; margin-bottom:6px; letter-spacing:0.06em; }
  .qd-al-seg { display:flex; gap:0; margin-bottom:8px; }
  .qd-al-input { width:100%; background:#222; border:1.5px solid #333; color:#fff; padding:7px 10px;
    font-family:${DS.font}; font-size:12px; margin-bottom:8px; outline:none; box-sizing:border-box; }
  .qd-al-input:focus { border-color:${DS.yellow}; }
  .qd-al-btn { width:100%; padding:8px; font-size:11px; font-weight:700; letter-spacing:0.06em;
    cursor:pointer; font-family:${DS.font}; margin-bottom:8px; ${brutal(DS.yellow)}; color:#000; border:none; }
  .qd-al-list { border-top:1px solid #222; padding-top:8px; margin-top:4px; }
  .qd-al-item { display:flex; justify-content:space-between; align-items:center;
    font-size:10px; color:#ccc; margin-bottom:4px; }
  .qd-al-del { background:none; border:none; color:${DS.textMut}; cursor:pointer; font-size:12px; padding:0 2px; }
  .qd-al-del:hover { color:${DS.danger}; }
  .qd-al-triggered { color:${DS.safe}; font-size:9px; margin-left:4px; }
</style>
<div class="qd-al-label">SET PRICE ALERT — ${esc(ticker)}</div>
<div class="qd-al-seg">
  <button id="qd-alert-above" style="${condition === "ABOVE" ? activeStyle : inactiveStyle}">ABOVE</button>
  <button id="qd-alert-below" style="${condition === "BELOW" ? activeStyle : inactiveStyle}">BELOW</button>
</div>
<input id="qd-alert-price" class="qd-al-input" type="number" placeholder="$ price" value="${esc(priceInput)}" step="any" />
<button id="qd-alert-set" class="qd-al-btn">SET ALERT</button>
${alerts.length > 0 ? `
<div class="qd-al-list">
  ${alerts.map((a) => {
    const key = `${a.mint}_${a.condition}`;
    return `
    <div class="qd-al-item">
      <span>${esc(a.ticker)} ${esc(a.condition)} $${esc(a.price)}${a.triggered ? '<span class="qd-al-triggered">✓ TRIGGERED</span>' : ""}</span>
      <button class="qd-al-del" id="qd-alert-del-${esc(key)}">✕</button>
    </div>
  `;
  }).join("")}
</div>` : ""}`;
}
