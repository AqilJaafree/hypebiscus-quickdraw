// Solana base58 address: 32–44 chars, no 0/O/I/l
const SOLANA_ADDR = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

// $TICKER symbols
const TICKER = /\$[A-Z]{2,10}\b/g;

// Known non-token base58 strings to skip (tx hashes, pubkeys that aren't tokens)
export const BLOCKLIST = new Set([
  "11111111111111111111111111111111", // System program
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // Token program
  "ATokenGPvbdGVxr1j5M25s4f247jZ7k8pU7wQc3w",   // ATA program
]);

export interface Detection {
  type: "address" | "ticker";
  value: string;
  rect: DOMRect;
}

export function detectInSelection(): Detection | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;

  const text = sel.toString().trim();
  if (!text || text.length < 3) return null;

  const range = sel.getRangeAt(0);
  const rect  = range.getBoundingClientRect();

  // Try Solana address first
  const addrMatch = text.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  if (addrMatch && !BLOCKLIST.has(text)) {
    return { type: "address", value: text, rect };
  }

  // Try $TICKER
  const tickerMatch = text.match(/^\$([A-Z]{2,10})$/);
  if (tickerMatch) {
    return { type: "ticker", value: tickerMatch[1], rect };
  }

  return null;
}

export function detectInText(text: string): Array<{ type: "address" | "ticker"; value: string }> {
  const results: Array<{ type: "address" | "ticker"; value: string }> = [];
  const seen = new Set<string>();

  // Addresses
  const addrMatches = text.matchAll(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g);
  for (const m of addrMatches) {
    const addr = m[0];
    if (!BLOCKLIST.has(addr) && !seen.has(addr)) {
      seen.add(addr);
      results.push({ type: "address", value: addr });
    }
  }

  // $TICKER — only if no address found in same text
  if (results.length === 0) {
    const tickerMatches = text.matchAll(/\$([A-Z]{2,10})\b/g);
    for (const m of tickerMatches) {
      const ticker = m[1];
      if (!seen.has(ticker)) {
        seen.add(ticker);
        results.push({ type: "ticker", value: ticker });
      }
    }
  }

  return results;
}
