import { DS, brutal } from "../styles";
import { sendBg } from "../shared";
import type { SwapQuote, WalletState } from "../types";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const LAMPORTS_PER_SOL = 1_000_000_000;

export function formatSolAmount(sol: number): string {
  return sol.toFixed(4);
}

export function parseOutputAmount(rawAmount: string, decimals: number): string {
  if (!rawAmount) return "—";
  const num = parseInt(rawAmount, 10);
  if (isNaN(num)) return "—";
  const val = num / Math.pow(10, decimals);
  return decimals === 6 ? val.toFixed(6) : val.toFixed(2);
}

interface TradeState {
  solInput: string;
  quote: SwapQuote | null;
  loading: boolean;
  error: string | null;
  confirming: boolean;
}

export function buildTradePanel(
  outputMint: string,
  ticker: string,
  wallet: WalletState,
): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `padding:10px 12px;font-family:${DS.font};`;

  let state: TradeState = { solInput: "0.5", quote: null, loading: false, error: null, confirming: false };

  function render(): void {
    el.innerHTML = buildTradeHTML(ticker, state, wallet);

    const input = el.querySelector<HTMLInputElement>("#qd-trade-sol");
    input?.addEventListener("change", () => {
      state = { ...state, solInput: input.value, quote: null, error: null };
      fetchQuote();
    });

    el.querySelector("#qd-trade-max")?.addEventListener("click", () => {
      if (input) { input.value = "0.5"; state = { ...state, solInput: "0.5" }; fetchQuote(); }
    });

    el.querySelector("#qd-trade-swap")?.addEventListener("click", () => {
      if (!wallet.connected) {
        chrome.runtime.sendMessage({ type: "OPEN_POPUP" });
        return;
      }
      if (state.quote) executeSwap();
      else fetchQuote();
    });
  }

  async function fetchQuote(): Promise<void> {
    const sol = parseFloat(state.solInput || "0");
    if (sol <= 0) return;
    state = { ...state, loading: true, error: null };
    render();
    try {
      const amountLamports = Math.floor(sol * LAMPORTS_PER_SOL);
      const quote = await sendBg<SwapQuote>({
        type: "quote",
        inputMint: SOL_MINT,
        outputMint,
        amountLamports,
      });
      state = { ...state, loading: false, quote, error: null };
    } catch (err: unknown) {
      state = { ...state, loading: false, error: err instanceof Error ? err.message : "Quote failed" };
    }
    render();
  }

  async function executeSwap(): Promise<void> {
    if (!state.quote || !wallet.address) return;
    state = { ...state, confirming: true };
    render();
    try {
      await sendBg<string>({
        type: "swap_tx",
        inputMint: SOL_MINT,
        outputMint,
        amountLamports: Math.floor(parseFloat(state.solInput) * LAMPORTS_PER_SOL),
        walletAddress: wallet.address,
      });
      // Full in-extension signing is Phase 3 (requires native wallet bridge)
      const jupUrl = `https://jup.ag/swap/SOL-${ticker}`;
      window.open(jupUrl, "_blank");
      state = { ...state, confirming: false };
    } catch (err: unknown) {
      state = { ...state, confirming: false, error: err instanceof Error ? err.message : "Swap failed" };
    }
    render();
  }

  render();
  return el;
}

function buildTradeHTML(ticker: string, state: TradeState, wallet: WalletState): string {
  const outAmt = state.quote
    ? parseOutputAmount(state.quote.outAmount, 6)
    : (state.loading ? "…" : "—");
  const impact = state.quote
    ? `${(state.quote.priceImpactPct * 100).toFixed(2)}%`
    : "—";
  const swapLabel = state.confirming
    ? "CONFIRMING…"
    : !wallet.connected
      ? "CONNECT WALLET FIRST"
      : "SWAP NOW ↗";

  return `
<style>
  .qd-tr-label { font-size:10px; color:${DS.textMut}; margin-bottom:6px; letter-spacing:0.06em; }
  .qd-tr-row { display:flex; gap:6px; margin-bottom:6px; }
  .qd-tr-input { flex:1; background:#222; border:1.5px solid ${DS.yellow}; color:#fff;
    padding:7px 10px; font-family:${DS.font}; font-size:12px; outline:none; min-width:0; }
  .qd-tr-max { ${brutal(DS.yellow)}; color:#000; padding:6px 10px; font-size:10px;
    font-family:${DS.font}; font-weight:700; cursor:pointer; border:none; white-space:nowrap; }
  .qd-tr-arrow { text-align:center; color:${DS.textMut}; font-size:12px; margin:4px 0; }
  .qd-tr-out { background:#111; border:1px solid #2a2a2a; padding:8px 10px; font-size:12px;
    color:#fff; font-weight:700; margin-bottom:4px; }
  .qd-tr-meta { display:flex; justify-content:space-between; font-size:9px; color:${DS.textMut}; margin-bottom:8px; }
  .qd-tr-err { font-size:10px; color:${DS.danger}; margin-bottom:6px; }
  .qd-tr-swap { width:100%; ${brutal(DS.yellow)}; color:#000; padding:9px; font-size:11px;
    font-weight:700; letter-spacing:0.06em; cursor:pointer; font-family:${DS.font};
    ${(!state.quote && !state.loading) || state.confirming ? "opacity:0.6;" : ""} }
</style>
<div class="qd-tr-label">BUY ${ticker}</div>
<div class="qd-tr-row">
  <input id="qd-trade-sol" class="qd-tr-input" type="number" value="${state.solInput}" placeholder="0.5" min="0.001" step="0.1" />
  <span style="color:${DS.textMut};font-size:10px;align-self:center;">SOL</span>
  <button id="qd-trade-max" class="qd-tr-max">MAX</button>
</div>
<div class="qd-tr-arrow">↓</div>
<div class="qd-tr-out">~ ${outAmt} ${ticker}</div>
<div class="qd-tr-meta">
  <span>Price impact: ${impact}</span>
  <span>${state.loading ? "fetching quote…" : ""}</span>
</div>
${state.error ? `<div class="qd-tr-err">⚠ ${state.error}</div>` : ""}
<button id="qd-trade-swap" class="qd-tr-swap" ${state.confirming ? "disabled" : ""}>${swapLabel}</button>`;
}
