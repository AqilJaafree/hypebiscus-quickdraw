import type { WatchItem, WatchItemWithPrice } from "../types";
import { DS, brutal } from "../styles";
import { sendBg } from "../shared";

export function watchlistAdd(list: WatchItem[], item: WatchItem): WatchItem[] {
  if (list.some(w => w.mint === item.mint)) return list;
  return [...list, item];
}

export function watchlistRemove(list: WatchItem[], mint: string): WatchItem[] {
  return list.filter(w => w.mint !== mint);
}

export function watchlistContains(list: WatchItem[], mint: string): boolean {
  return list.some(w => w.mint === mint);
}

export function buildWatchPanel(
  mint: string,
  ticker: string,
  watchlist: WatchItem[],
  watchlistPrices: WatchItemWithPrice[],
  onUpdated: (updated: WatchItem[]) => void,
): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `padding:10px 12px;font-family:${DS.font};`;

  async function handleAdd(): Promise<void> {
    try {
      const current = await sendBg<WatchItem[]>({ type: "get_watchlist" });
      const updated = watchlistAdd(current, { mint, ticker });
      await sendBg({ type: "set_watchlist", watchlist: updated });
      onUpdated(updated);
    } catch {
      // silently ignore — state will reflect reality on next open
    }
    render(watchlistContains(watchlistPrices.map(p => ({ mint: p.mint, ticker: p.ticker })), mint)
      ? watchlistPrices.map(p => p.mint) : [mint, ...watchlistPrices.map(p => p.mint)]);
  }

  async function handleRemove(removeMint: string): Promise<void> {
    try {
      const current = await sendBg<WatchItem[]>({ type: "get_watchlist" });
      const updated = watchlistRemove(current, removeMint);
      await sendBg({ type: "set_watchlist", watchlist: updated });
      onUpdated(updated);
    } catch {
      // silently ignore
    }
    render(watchlistPrices.filter(p => p.mint !== removeMint).map(p => p.mint));
  }

  function render(watchedMints: string[]): void {
    const isWatching = watchedMints.includes(mint);
    el.innerHTML = buildWatchHTML(mint, ticker, isWatching, watchlistPrices);

    if (isWatching) {
      el.querySelector("#qd-watch-remove")?.addEventListener("click", () => handleRemove(mint));
    } else {
      el.querySelector("#qd-watch-add")?.addEventListener("click", () => handleAdd());
    }

    watchlistPrices.forEach(item => {
      const key = item.mint.slice(0, 8);
      el.querySelector(`#qd-watch-del-${key}`)?.addEventListener("click", () => handleRemove(item.mint));
    });
  }

  render(watchlist.map(w => w.mint));
  return el;
}

function buildWatchHTML(
  mint: string,
  ticker: string,
  isWatching: boolean,
  prices: WatchItemWithPrice[],
): string {
  const addBtn = isWatching
    ? `<button id="qd-watch-remove" style="${brutal("#333")};color:${DS.textMut};padding:8px;width:100%;font-size:11px;font-weight:700;font-family:${DS.font};letter-spacing:0.06em;cursor:pointer;border:none;">✓ WATCHING ${ticker}</button>`
    : `<button id="qd-watch-add" style="${brutal(DS.yellow)};color:#000;padding:8px;width:100%;font-size:11px;font-weight:700;font-family:${DS.font};letter-spacing:0.06em;cursor:pointer;border:none;">+ ADD ${ticker}</button>`;

  const listItems = prices.map(item => {
    const change = item.change24h;
    const changeStr = change !== null
      ? `${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(1)}%`
      : "";
    const changeColor = change !== null ? (change >= 0 ? DS.safe : DS.danger) : DS.textMut;
    const priceStr = item.priceUsd !== null
      ? `$${item.priceUsd < 0.01 ? item.priceUsd.toFixed(6) : item.priceUsd.toFixed(4)}`
      : "—";
    const key = item.mint.slice(0, 8);
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:10px;">
        <span style="color:#ccc;font-weight:700;">${item.ticker}</span>
        <span style="display:flex;gap:8px;align-items:center;">
          <span style="color:#fff;">${priceStr}</span>
          <span style="color:${changeColor};">${changeStr}</span>
          <button id="qd-watch-del-${key}" style="background:none;border:none;color:${DS.textMut};cursor:pointer;font-size:11px;padding:0;">✕</button>
        </span>
      </div>`;
  }).join("");

  return `
<style>
  .qd-wl-header { font-size:10px; color:${DS.textMut}; margin-bottom:8px; letter-spacing:0.06em; }
  .qd-wl-sep { border:none; border-top:1px solid #222; margin:8px 0; }
  .qd-wl-count { font-size:9px; color:${DS.textMut}; margin-bottom:4px; }
</style>
<div class="qd-wl-header">WATCHLIST</div>
${addBtn}
${prices.length > 0 ? `
<hr class="qd-wl-sep" />
<div class="qd-wl-count">WATCHING (${prices.length})</div>
${listItems}` : ""}`;
}
