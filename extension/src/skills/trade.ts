import { DS, ICON, brutal, fmtAmount } from "../styles";
import { sendBg, esc } from "../shared";
import type { MultiAdapterQuote, WalletState, SwapResult } from "../types";

export const SOL_MINT = "So11111111111111111111111111111111111111112";
/** SOL left in the wallet on Max, for network fees and new token-account rent. */
export const SOL_FEE_RESERVE = 0.01;
const LAMPORTS_PER_SOL = 1_000_000_000;

export function formatSolAmount(sol: number): string {
  return sol.toFixed(4);
}

/**
 * Largest SOL amount a buy can spend: balance minus the fee reserve,
 * floored to 4 decimals so the input never rounds above the balance.
 */
export function maxSpendableSol(balance: number): number {
  const spendable = balance - SOL_FEE_RESERVE;
  if (!Number.isFinite(spendable) || spendable <= 0) return 0;
  return Math.floor(spendable * 10_000) / 10_000;
}

export function parseOutputAmount(rawAmount: string, decimals: number): string {
  if (!rawAmount) return "—";
  let num: bigint;
  try { num = BigInt(rawAmount); } catch { return "—"; }
  const divisor = 10n ** BigInt(decimals);
  const whole = num / divisor;
  const frac = (num % divisor).toString().padStart(decimals, "0").slice(0, 4);
  return `${whole}.${frac}`;
}

interface TradeState {
  solInput: string;
  multiQuote: MultiAdapterQuote | null;
  loading: boolean;
  signing: boolean;
  signError: string | null;
  signSuccess: string | null;
  error: string | null;
  activeTab: "buy" | "sell";
  sellInput: string;
  sellQuote: MultiAdapterQuote | null;
}

export function buildTradePanel(
  outputMint: string,
  ticker: string,
  wallet: WalletState,
  heldBalance: number = 0,
  solBalance: number | null = null,
): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `padding:12px 16px 16px;font-family:${DS.font};`;

  let state: TradeState = {
    solInput: "0.5",
    multiQuote: null,
    loading: false,
    signing: false,
    signError: null,
    signSuccess: null,
    error: null,
    activeTab: "buy",
    sellInput: heldBalance > 0 ? heldBalance.toFixed(4) : "0",
    sellQuote: null,
  };

  function render(): void {
    el.innerHTML = buildTradeHTML(ticker, state, wallet, heldBalance, solBalance);

    // Buy tab events
    el.querySelector("#qd-tab-buy")?.addEventListener("click", () => {
      if (state.activeTab === "buy") return;
      state = { ...state, activeTab: "buy", signSuccess: null, signError: null };
      render();
    });
    el.querySelector("#qd-tab-sell")?.addEventListener("click", () => {
      if (state.activeTab === "sell") return;
      state = { ...state, activeTab: "sell", signSuccess: null, signError: null };
      if (!state.sellQuote) void fetchSellQuote();
      else render();
    });

    // Buy panel events
    const input = el.querySelector<HTMLInputElement>("#qd-trade-sol");
    input?.addEventListener("change", () => {
      state = { ...state, solInput: input.value, multiQuote: null, error: null, signSuccess: null, signError: null };
      fetchQuote();
    });

    el.querySelector("#qd-trade-max")?.addEventListener("click", () => {
      if (!input || solBalance === null) return;
      const max = maxSpendableSol(solBalance);
      if (max <= 0) {
        state = { ...state, error: `Not enough SOL — keep ${SOL_FEE_RESERVE} SOL for fees` };
        render();
        return;
      }
      const value = String(max);
      input.value = value;
      state = { ...state, solInput: value, multiQuote: null, error: null, signSuccess: null, signError: null };
      void fetchQuote();
    });

    el.querySelector("#qd-trade-swap")?.addEventListener("click", () => {
      if (state.signing) return;
      if (!wallet.connected) {
        chrome.runtime.sendMessage({ type: "OPEN_POPUP" });
        return;
      }
      if (state.multiQuote) void executeSwap();
      else void fetchQuote();
    });

    // Sell panel events
    const sellInput = el.querySelector<HTMLInputElement>("#qd-sell-amount");
    sellInput?.addEventListener("change", () => {
      if (!sellInput) return;
      state = { ...state, sellInput: sellInput.value, sellQuote: null, signSuccess: null, signError: null };
      void fetchSellQuote();
    });
    el.querySelector("#qd-sell-max")?.addEventListener("click", () => {
      const sellEl = el.querySelector<HTMLInputElement>("#qd-sell-amount");
      if (sellEl) {
        sellEl.value = heldBalance.toFixed(4);
        state = { ...state, sellInput: sellEl.value, sellQuote: null, signSuccess: null, signError: null };
        void fetchSellQuote();
      }
    });
    el.querySelector("#qd-sell-btn")?.addEventListener("click", () => {
      if (state.signing) return;
      if (!wallet.connected) { void chrome.runtime.sendMessage({ type: "OPEN_POPUP" }); return; }
      if (state.sellQuote) void executeSell();
      else void fetchSellQuote();
    });
  }

  async function fetchQuote(): Promise<void> {
    const sol = parseFloat(state.solInput || "0");
    if (sol <= 0) return;
    state = { ...state, loading: true, error: null, multiQuote: null, signSuccess: null, signError: null };
    render();
    try {
      const amountLamports = Math.floor(sol * LAMPORTS_PER_SOL);
      const result = await sendBg<MultiAdapterQuote>({
        type: "quote_multi",
        inputMint: SOL_MINT,
        outputMint,
        amountLamports,
      });
      state = { ...state, loading: false, multiQuote: result, error: null };
    } catch (err: unknown) {
      state = { ...state, loading: false, error: err instanceof Error ? err.message : "Quote failed" };
    }
    render();
  }

  async function executeSwap(): Promise<void> {
    if (!wallet.connected || !wallet.address) return;
    state = { ...state, signing: true, signError: null, signSuccess: null };
    render();
    try {
      const result = await sendBg<SwapResult>({
        type: "execute_swap",
        inputMint: SOL_MINT,
        outputMint,
        amountLamports: Math.floor(parseFloat(state.solInput || "0") * LAMPORTS_PER_SOL),
        walletAddress: wallet.address,
      });
      const explorer = result.explorer.startsWith("https://") ? result.explorer : "#";
      state = { ...state, signing: false, signSuccess: explorer };
    } catch (err: unknown) {
      state = { ...state, signing: false, signError: err instanceof Error ? err.message : "Swap failed" };
    }
    render();
  }

  async function fetchSellQuote(): Promise<void> {
    const amount = parseFloat(state.sellInput || "0");
    if (amount <= 0) return;
    state = { ...state, loading: true, error: null, sellQuote: null, signSuccess: null, signError: null };
    render();
    try {
      const amountRaw = Math.floor(amount * 1_000_000); // assume 6 decimals; caller should pass decimals in a future task
      const result = await sendBg<MultiAdapterQuote>({
        type: "quote_multi",
        inputMint: outputMint,
        outputMint: SOL_MINT,
        amountLamports: amountRaw,
      });
      state = { ...state, loading: false, sellQuote: result, error: null };
    } catch (err: unknown) {
      state = { ...state, loading: false, error: err instanceof Error ? err.message : "Quote failed" };
    }
    render();
  }

  async function executeSell(): Promise<void> {
    if (!wallet.connected || !wallet.address) return;
    state = { ...state, signing: true, signError: null, signSuccess: null };
    render();
    try {
      const amount = parseFloat(state.sellInput || "0");
      const result = await sendBg<SwapResult>({
        type: "execute_swap",
        inputMint: outputMint,
        outputMint: SOL_MINT,
        amountLamports: Math.floor(amount * 1_000_000), // assume 6 decimals; caller should pass decimals in a future task
        walletAddress: wallet.address,
      });
      const explorer = result.explorer.startsWith("https://") ? result.explorer : "#";
      state = { ...state, signing: false, signSuccess: explorer };
    } catch (err: unknown) {
      state = { ...state, signing: false, signError: err instanceof Error ? err.message : "Sell failed" };
    }
    render();
  }

  render();
  return el;
}

const TRADE_CSS = `
<style>
  .qd-tr { display:flex; flex-direction:column; gap:12px; }
  .qd-tr-tabs { display:flex; border:1px solid ${DS.hairline}; padding:2px; gap:2px; }
  .qd-tr-tab { flex:1; height:28px; border:none; cursor:pointer; background:none; color:${DS.textMut};
    font-size:12px; transition:background-color 150ms ${DS.ease}, color 150ms ${DS.ease}; }
  .qd-tr-tab:hover { color:${DS.textSec}; }
  .qd-tr-tab.active { background:${DS.raised}; color:${DS.text}; }
  .qd-tr-field { display:flex; flex-direction:column; gap:8px; }
  .qd-tr-label { display:flex; justify-content:space-between; color:${DS.textMut}; }
  .qd-tr-row { display:flex; align-items:center; height:40px; background:${DS.raised};
    border:1px solid ${DS.hairline}; transition:border-color 150ms ${DS.ease}; }
  .qd-tr-row:focus-within { border-color:${DS.yellow}; }
  .qd-tr-input { flex:1; min-width:0; height:100%; background:none; border:none; outline:none;
    color:${DS.text}; padding:0 12px; font-family:${DS.font}; font-size:14px; font-variant-numeric:tabular-nums; }
  .qd-tr-input::-webkit-inner-spin-button { -webkit-appearance:none; }
  .qd-tr-unit { color:${DS.textMut}; padding-right:8px; }
  .qd-tr-max { height:24px; margin-right:8px; padding:0 8px; background:${DS.bg}; color:${DS.textSec};
    border:1px solid ${DS.hairlineStrong}; font-size:11px; cursor:pointer;
    transition:color 150ms ${DS.ease}, border-color 150ms ${DS.ease}; }
  .qd-tr-max:hover { color:${DS.text}; border-color:${DS.textMut}; }
  .qd-tr-quotes { display:flex; flex-direction:column; gap:4px; }
  .qd-tr-quote { display:grid; grid-template-columns:64px 1fr auto; align-items:center; gap:8px;
    height:32px; padding:0 8px; border:1px solid ${DS.hairline}; color:${DS.textSec}; }
  .qd-tr-quote.qd-tr-head { height:16px; border:none; color:${DS.textMut}; font-size:11px; }
  .qd-tr-quote.qd-tr-head .qd-tr-out { color:${DS.textMut}; }
  .qd-tr-quote.best { background:${DS.raised}; border-color:${DS.hairlineStrong}; }
  .qd-tr-route { color:${DS.textSec}; }
  .qd-tr-quote.best .qd-tr-route { color:${DS.text}; }
  .qd-tr-out { color:${DS.text}; text-align:right; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .qd-tr-impact { color:${DS.textMut}; font-size:11px; text-align:right; min-width:40px; }
  .qd-tr-hint { color:${DS.textMut}; height:32px; display:flex; align-items:center; }
  .qd-tr-err { color:${DS.danger}; line-height:18px; }
  .qd-tr-ok { display:flex; align-items:center; gap:8px; color:${DS.safe}; }
  .qd-tr-ok a { display:inline-flex; align-items:center; gap:4px; color:${DS.text}; text-decoration:none;
    border-bottom:1px solid ${DS.hairlineStrong}; }
  .qd-tr-ok a:hover { border-color:${DS.text}; }
  .qd-tr-swap { width:100%; height:40px; ${brutal(DS.yellow)}; color:#111; font-size:13px; font-weight:700;
    cursor:pointer; font-family:${DS.font};
    transition:transform 120ms ${DS.ease}, box-shadow 120ms ${DS.ease}; }
  .qd-tr-swap:active:not(:disabled) { transform:translate(2px,2px); box-shadow:1px 1px 0 #333; }
  .qd-tr-swap:disabled { opacity:0.5; cursor:not-allowed; }
</style>`;

function quoteList(q: MultiAdapterQuote | null, loading: boolean, decimals: number, unit: string): string {
  if (q) {
    const head = `<div class="qd-tr-quote qd-tr-head"><span>Route</span><span class="qd-tr-out">${esc(unit)}</span><span class="qd-tr-impact">Impact</span></div>`;
    return head + q.all.map((r, i) => `
      <div class="qd-tr-quote${i === 0 ? " best" : ""}">
        <span class="qd-tr-route">${esc(r.routeLabel)}</span>
        <span class="qd-tr-out">${fmtAmount(Number(parseOutputAmount(r.outAmount, decimals)))}</span>
        <span class="qd-tr-impact" title="Price impact">${r.priceImpactPct.toFixed(2)}%</span>
      </div>`).join("");
  }
  return `<div class="qd-tr-hint">${loading ? "Fetching quotes…" : "Enter an amount to see quotes"}</div>`;
}

function statusLine(state: TradeState, verb: string): string {
  if (state.signSuccess) {
    return `<div class="qd-tr-ok">${ICON.check} ${verb} sent
      <a href="${esc(state.signSuccess)}" target="_blank" rel="noopener">View on Solscan ${ICON.external}</a></div>`;
  }
  if (state.signError) return `<div class="qd-tr-err">${esc(state.signError)}</div>`;
  return "";
}

export function buildTradeHTML(
  ticker: string,
  state: TradeState,
  wallet: WalletState,
  heldBalance: number = 0,
  solBalance: number | null = null,
): string {
  const showSell = heldBalance > 0;

  const tabBar = showSell ? `
<div class="qd-tr-tabs" role="tablist">
  <button id="qd-tab-buy" class="qd-tr-tab${state.activeTab === "buy" ? " active" : ""}" role="tab">Buy</button>
  <button id="qd-tab-sell" class="qd-tr-tab${state.activeTab === "sell" ? " active" : ""}" role="tab">Sell</button>
</div>` : "";

  const errorLine = state.error ? `<div class="qd-tr-err">${esc(state.error)}</div>` : "";

  // Sell panel
  if (state.activeTab === "sell" && showSell) {
    const sellLabel = !wallet.connected ? "Connect wallet to sell"
      : state.signing ? "Confirm in wallet…" : `Sell ${ticker}`;

    return `${TRADE_CSS}
<div class="qd-tr">
${tabBar}
<div class="qd-tr-field">
  <div class="qd-tr-label"><span>Amount</span><span>Balance ${fmtAmount(heldBalance)}</span></div>
  <div class="qd-tr-row">
    <input id="qd-sell-amount" class="qd-tr-input" type="number" aria-label="Amount of ${esc(ticker)} to sell"
      value="${esc(state.sellInput)}" min="0" step="0.01" />
    <span class="qd-tr-unit">${esc(ticker)}</span>
    <button id="qd-sell-max" class="qd-tr-max">Max</button>
  </div>
</div>
<div class="qd-tr-quotes">${quoteList(state.sellQuote, state.loading, 9, "SOL")}</div>
${errorLine}
${statusLine(state, "Sell")}
<button id="qd-sell-btn" class="qd-tr-swap" ${state.signing ? "disabled" : ""}>${esc(sellLabel)}</button>
</div>`;
  }

  // Buy panel
  const swapLabel = !wallet.connected
    ? "Connect wallet to buy"
    : state.signing
    ? "Confirm in wallet…"
    : `Buy ${ticker}`;

  return `${TRADE_CSS}
<div class="qd-tr">
${tabBar}
<div class="qd-tr-field">
  <div class="qd-tr-label"><span>You pay</span>${solBalance !== null ? `<span>Balance ${fmtAmount(solBalance)}</span>` : ""}</div>
  <div class="qd-tr-row">
    <input id="qd-trade-sol" class="qd-tr-input" type="number" aria-label="Amount of SOL to spend"
      value="${esc(state.solInput)}" placeholder="0.5" min="0.001" step="0.1" />
    <span class="qd-tr-unit">SOL</span>
    ${solBalance !== null ? `<button id="qd-trade-max" class="qd-tr-max" title="Balance minus ${SOL_FEE_RESERVE} SOL for fees">Max</button>` : ""}
  </div>
</div>
<div class="qd-tr-quotes">${quoteList(state.multiQuote, state.loading, 6, ticker)}</div>
${errorLine}
${statusLine(state, "Swap")}
<button id="qd-trade-swap" class="qd-tr-swap" ${state.signing ? "disabled" : ""}>${esc(swapLabel)}</button>
</div>`;
}
