import type { AdapterQuote } from "./types";

export function rankQuotes(quotes: AdapterQuote[]): AdapterQuote[] {
  return [...quotes].sort((a, b) => {
    const diff = BigInt(b.outAmount) - BigInt(a.outAmount);
    return diff > 0n ? 1 : diff < 0n ? -1 : 0;
  });
}
