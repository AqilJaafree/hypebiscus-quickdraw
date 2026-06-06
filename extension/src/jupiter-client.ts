import { computeSafetyScore } from "./score";
import type { SafetyScore, TokenPrice, SwapQuote } from "./types";

const JUPITER_SEARCH = "https://lite-api.jup.ag/tokens/v2/search";
const JUPITER_QUOTE  = "https://quote-api.jup.ag/v6/quote";
const JUPITER_SWAP   = "https://quote-api.jup.ag/v6/swap";

interface SearchResult {
  id: string;
  name: string;
  symbol: string;
  usdPrice?: number;
  organicScore?: number;
  isVerified?: boolean;
  audit?: {
    isSus?: boolean;
    mintAuthorityDisabled?: boolean;
    freezeAuthorityDisabled?: boolean;
  };
  stats24h?: { priceChange?: number };
}

export async function fetchToken(
  address: string,
): Promise<{ safety: SafetyScore; price: TokenPrice | null } | null> {
  const resp = await fetch(`${JUPITER_SEARCH}?query=${encodeURIComponent(address)}&limit=1`);
  if (!resp.ok) throw new Error("Jupiter API error");
  const results = await resp.json() as SearchResult[];
  const token = results.find((r) => r.id === address);
  if (!token) return null;

  const safety = computeSafetyScore(token);
  const price: TokenPrice | null =
    token.usdPrice != null
      ? {
          usd: token.usdPrice,
          change24h: token.stats24h?.priceChange ?? 0,
          symbol: token.symbol,
          name: token.name,
        }
      : null;

  return { safety, price };
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
