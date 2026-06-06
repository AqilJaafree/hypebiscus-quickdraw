import type { SwapQuote, WalletState } from "./types";
import { fetchSwapQuote, buildSwapTransaction } from "./jupiter-client";
import { signAndSend } from "./wallet";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const LAMPORTS_PER_SOL = 1_000_000_000;

export interface SwapPanelCallbacks {
  onSuccess: (signature: string) => void;
  onError: (msg: string) => void;
  onCancel: () => void;
}

export function buildSwapPanel(
  outputMint: string,
  wallet: WalletState,
  callbacks: SwapPanelCallbacks,
): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = "width:100%;font-family:'Space Mono','Courier New',monospace;";

  function render(state: SwapState): void {
    el.innerHTML = buildSwapHTML(state, wallet);

    const amountInput = el.querySelector<HTMLInputElement>("#qd-amount");
    amountInput?.addEventListener("change", () => {
      const sol = parseFloat(amountInput.value || "0");
      if (sol > 0) fetchQuote(sol, state);
    });

    el.querySelector("#qd-confirm")?.addEventListener("click", () => {
      if (state.quote) executeSwap(state.quote);
    });

    el.querySelector("#qd-swap-cancel")?.addEventListener("click", callbacks.onCancel);
  }

  async function fetchQuote(solAmount: number, prev: SwapState): Promise<void> {
    render({ ...prev, loading: true, error: null });
    try {
      const amountLamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
      const quote = await fetchSwapQuote({ inputMint: SOL_MINT, outputMint, amountLamports, slippageBps: 50 });
      render({ loading: false, quote, error: null, confirming: false });
    } catch (err: unknown) {
      render({ loading: false, quote: null, error: err instanceof Error ? err.message : "Quote failed", confirming: false });
    }
  }

  async function executeSwap(quote: SwapQuote): Promise<void> {
    if (!wallet.connected || !wallet.address) {
      callbacks.onError("Wallet not connected");
      return;
    }
    render({ loading: false, quote, error: null, confirming: true });
    try {
      const txBase64 = await buildSwapTransaction(quote, wallet.address);
      const { signature } = await signAndSend(txBase64);
      callbacks.onSuccess(signature);
    } catch (err: unknown) {
      render({ loading: false, quote, error: err instanceof Error ? err.message : "Swap failed", confirming: false });
      callbacks.onError(err instanceof Error ? err.message : "Swap failed");
    }
  }

  const initial: SwapState = { loading: false, quote: null, error: null, confirming: false };
  render(initial);
  return el;
}

interface SwapState {
  loading: boolean;
  quote: SwapQuote | null;
  error: string | null;
  confirming: boolean;
}

function buildSwapHTML(state: SwapState, wallet: WalletState): string {
  const outFormatted = state.quote
    ? (parseInt(state.quote.outAmount) / 1e6).toFixed(4)
    : "—";
  const impact = state.quote
    ? `${(state.quote.priceImpactPct * 100).toFixed(2)}%`
    : "—";

  return `
<style>
  .sp { padding: 10px 12px; border-top: 1px solid #1e1e1e; }
  .sp-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 11px; }
  .sp-label { color: #555; }
  .sp-val { color: #fff; font-weight: 700; }
  .sp-input {
    width: 100%; background: #222; border: 1.5px solid #333; color: #fff;
    padding: 7px 10px; font-family: inherit; font-size: 12px; margin-bottom: 8px;
    outline: none;
  }
  .sp-input:focus { border-color: #F5E642; }
  .sp-btn {
    width: 100%; padding: 9px; font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
    cursor: pointer; border: none; font-family: inherit; margin-bottom: 4px;
  }
  .sp-confirm { background: #F5E642; color: #000; }
  .sp-confirm:disabled { background: #333; color: #666; cursor: not-allowed; }
  .sp-cancel { background: #1a1a1a; color: #555; border-top: 1px solid #1e1e1e; }
  .sp-cancel:hover { color: #fff; }
  .sp-err { color: #F54242; font-size: 10px; padding: 0 0 6px; }
</style>
<div class="sp">
  <div class="sp-row"><span class="sp-label">You pay (SOL)</span></div>
  <input id="qd-amount" class="sp-input" type="number" placeholder="0.5" min="0.001" step="0.1" />
  <div class="sp-row">
    <span class="sp-label">You receive</span>
    <span class="sp-val">${state.loading ? "…" : outFormatted}</span>
  </div>
  <div class="sp-row">
    <span class="sp-label">Price impact</span>
    <span class="sp-val">${state.loading ? "…" : impact}</span>
  </div>
  ${state.error ? `<div class="sp-err">⚠ ${state.error}</div>` : ""}
  <button id="qd-confirm" class="sp-btn sp-confirm" ${(!state.quote || state.confirming) ? "disabled" : ""}>
    ${state.confirming ? "CONFIRMING…" : wallet.connected ? "CONFIRM SWAP" : "CONNECT WALLET"}
  </button>
</div>
<button id="qd-swap-cancel" class="sp-btn sp-cancel">✕ CANCEL</button>`;
}
