import { DS, brutal } from "../styles";
import { sendBg, esc } from "../shared";
import type { MultiAdapterQuote, WalletState, SwapResult } from "../types";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const LAMPORTS_PER_SOL = 1_000_000_000;

export function formatSolAmount(sol: number): string {
  return sol.toFixed(4);
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
}

export function buildTradePanel(
  outputMint: string,
  ticker: string,
  wallet: WalletState,
): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `padding:10px 12px;font-family:${DS.font};`;

  let state: TradeState = {
    solInput: "0.5",
    multiQuote: null,
    loading: false,
    signing: false,
    signError: null,
    signSuccess: null,
    error: null,
  };

  function render(): void {
    el.innerHTML = buildTradeHTML(ticker, state, wallet);

    const input = el.querySelector<HTMLInputElement>("#qd-trade-sol");
    input?.addEventListener("change", () => {
      state = { ...state, solInput: input.value, multiQuote: null, error: null, signSuccess: null, signError: null };
      fetchQuote();
    });

    el.querySelector("#qd-trade-max")?.addEventListener("click", () => {
      if (input) { input.value = "0.5"; state = { ...state, solInput: "0.5" }; fetchQuote(); }
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

  render();
  return el;
}

export function buildTradeHTML(ticker: string, state: TradeState, wallet: WalletState): string {
  const quoteRows = state.multiQuote
    ? state.multiQuote.all.map((q, i) => `
      <div style="display:flex;justify-content:space-between;align-items:center;
        padding:5px 8px;background:${i === 0 ? "#1e2e1e" : "#111"};
        border:1px solid ${i === 0 ? "#8bf542" : "#2a2a2a"};margin-bottom:3px;">
        <span style="font-size:9px;color:${i === 0 ? "#8bf542" : "#888"};">
          ${i === 0 ? "★ " : ""}${esc(q.routeLabel)}
        </span>
        <span style="font-size:11px;font-weight:700;color:#fff;">
          ${parseOutputAmount(q.outAmount, 6)} ${esc(ticker)}
        </span>
        <span style="font-size:9px;color:#555;">${q.priceImpactPct.toFixed(2)}%</span>
      </div>`).join("")
    : (state.loading
        ? `<div style="font-size:10px;color:#555;padding:8px;">fetching quotes…</div>`
        : `<div style="font-size:10px;color:#555;padding:8px;">—</div>`);

  const swapLabel = !wallet.connected
    ? "CONNECT WALLET FIRST"
    : state.signing
    ? "SIGNING…"
    : "SWAP NOW";

  const statusBlock = state.signSuccess
    ? `<div style="font-size:10px;color:#8bf542;padding:6px 0;">
        ✓ Swap sent! <a href="${esc(state.signSuccess)}" target="_blank"
          style="color:#8bf542;">View on Solscan ↗</a>
       </div>`
    : state.signError
    ? `<div class="qd-tr-err">⚠ ${esc(state.signError)}</div>`
    : "";

  return `
<style>
  .qd-tr-label { font-size:10px; color:${DS.textMut}; margin-bottom:6px; letter-spacing:0.06em; }
  .qd-tr-row { display:flex; gap:6px; margin-bottom:6px; }
  .qd-tr-input { flex:1; background:#222; border:1.5px solid ${DS.yellow}; color:#fff;
    padding:7px 10px; font-family:${DS.font}; font-size:12px; outline:none; min-width:0; }
  .qd-tr-max { ${brutal(DS.yellow)}; color:#000; padding:6px 10px; font-size:10px;
    font-family:${DS.font}; font-weight:700; cursor:pointer; border:none; white-space:nowrap; }
  .qd-tr-quotes { margin-bottom:6px; }
  .qd-tr-err { font-size:10px; color:${DS.danger}; margin-bottom:6px; }
  .qd-tr-swap { width:100%; ${brutal(DS.yellow)}; color:#000; padding:9px; font-size:11px;
    font-weight:700; letter-spacing:0.06em; cursor:pointer; font-family:${DS.font}; }
  .qd-tr-swap:disabled { opacity:0.5; cursor:not-allowed; }
</style>
<div class="qd-tr-label">BUY ${esc(ticker)}</div>
<div class="qd-tr-row">
  <input id="qd-trade-sol" class="qd-tr-input" type="number" value="${esc(state.solInput)}" placeholder="0.5" min="0.001" step="0.1" />
  <span style="color:${DS.textMut};font-size:10px;align-self:center;">SOL</span>
  <button id="qd-trade-max" class="qd-tr-max">MAX</button>
</div>
<div class="qd-tr-quotes">${quoteRows}</div>
${state.error ? `<div class="qd-tr-err">⚠ ${esc(state.error)}</div>` : ""}
${statusBlock}
<button id="qd-trade-swap" class="qd-tr-swap" ${state.signing ? "disabled" : ""}>${esc(swapLabel)}</button>`;
}
