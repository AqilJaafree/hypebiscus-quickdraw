import { computeSafetyScore } from "./score";
import type { SafetyScore, TokenPrice, SwapQuote } from "./types";

const JUPITER_SEARCH = "https://lite-api.jup.ag/tokens/v2/search";
const JUPITER_PRICE  = "https://api.jup.ag/price/v2";
const JUPITER_QUOTE  = "https://quote-api.jup.ag/v6/quote";
const JUPITER_SWAP   = "https://quote-api.jup.ag/v6/swap";

export async function fetchTokenSafety(address: string): Promise<SafetyScore | null> {
  const resp = await fetch(`${JUPITER_SEARCH}?query=${encodeURIComponent(address)}`);
  if (!resp.ok) throw new Error("Jupiter API error");
  const results = await resp.json() as unknown[];
  if (!results.length) return null;
  return computeSafetyScore(results[0] as Parameters<typeof computeSafetyScore>[0]);
}

export async function fetchTokenPrice(address: string): Promise<TokenPrice | null> {
  const resp = await fetch(`${JUPITER_PRICE}?ids=${address}&showExtraInfo=true`);
  if (!resp.ok) return null;
  const body = await resp.json() as { data: Record<string, { price: number; mintSymbol?: string }> };
  const entry = body.data[address];
  if (!entry) return null;
  return {
    usd: entry.price,
    change24h: 0,
    symbol: entry.mintSymbol ?? address.slice(0, 4),
    name: entry.mintSymbol ?? "Unknown",
  };
}

export interface QuoteParams {
  inputMint: string;
  outputMint: string;
  amountLamports: number;
  slippageBps: number;
}

export async function fetchSwapQuote(params: QuoteParams): Promise<SwapQuote> {
  const url = `${JUPITER_QUOTE}?inputMint=${params.inputMint}&outputMint=${params.outputMint}&amount=${params.amountLamports}&slippageBps=${params.slippageBps}&restrictIntermediateTokens=true`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("Jupiter quote error");
  const raw = await resp.json() as {
    inAmount: string;
    outAmount: string;
    priceImpactPct: number;
    routePlan: Array<{ swapInfo: { label: string } }>;
  };
  return {
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    inAmount: raw.inAmount,
    outAmount: raw.outAmount,
    priceImpactPct: raw.priceImpactPct,
    slippageBps: params.slippageBps,
    routePlan: raw.routePlan,
    raw,
  };
}

export async function buildSwapTransaction(quote: SwapQuote, walletAddress: string): Promise<string> {
  const resp = await fetch(JUPITER_SWAP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote.raw,
      userPublicKey: walletAddress,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 1000,
    }),
  });
  if (!resp.ok) throw new Error("Jupiter swap tx error");
  const body = await resp.json() as { swapTransaction: string };
  return body.swapTransaction;
}
