import type { AdapterQuote } from "./types";

function parseOutAmount(s: string): bigint {
  const dot = s.indexOf(".");
  return BigInt(dot === -1 ? s : s.slice(0, dot));
}

export function rankQuotes(quotes: AdapterQuote[]): AdapterQuote[] {
  return [...quotes].sort((a, b) => {
    const diff = parseOutAmount(b.outAmount) - parseOutAmount(a.outAmount);
    return diff > 0n ? 1 : diff < 0n ? -1 : 0;
  });
}
