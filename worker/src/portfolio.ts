// Wallet portfolio: balances from Alchemy's Solana RPC, symbols and USD prices
// from Jupiter. Only standard Solana JSON-RPC methods are used, so any RPC
// provider works by swapping the URL.

export const SOL_MINT = "So11111111111111111111111111111111111111112";
const SPL_TOKEN_PROGRAM  = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const JUPITER_PRICE  = "https://lite-api.jup.ag/price/v3";
const JUPITER_SEARCH = "https://lite-api.jup.ag/tokens/v2/search";
const PRICE_CHUNK  = 50;   // price/v3 id limit
const SEARCH_CHUNK = 100;  // tokens/v2/search comma-separated limit
const MAX_LOOKUP_MINTS = 200; // spam-heavy wallets: cap metadata calls

export interface PortfolioItem {
  mint: string;
  symbol: string;
  balance: number;
  decimals: number;
  priceUsd: number | null;
  valueUsd: number | null;
}

type Fetch = typeof fetch;

export class RpcError extends Error {}

export function alchemySolanaUrl(apiKey: string): string {
  return `https://solana-mainnet.g.alchemy.com/v2/${apiKey}`;
}

async function rpc<T>(rpcUrl: string, method: string, params: unknown[], fetchFn: Fetch): Promise<T> {
  const resp = await fetchFn(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: method, method, params }),
  });
  if (!resp.ok) throw new RpcError(`RPC ${method} HTTP ${resp.status}`);
  const body = await resp.json() as { result?: T; error?: { code: number; message: string } };
  if (body.error) throw new RpcError(`RPC ${method} ${body.error.code}: ${body.error.message}`);
  return body.result as T;
}

interface ParsedTokenAccount {
  account: {
    data: {
      parsed: {
        info: {
          mint: string;
          tokenAmount: { amount: string; decimals: number; uiAmountString?: string };
        };
      };
    };
  };
}

/** Sum parsed token accounts by mint, dropping empty accounts. */
export function aggregateTokenAccounts(accounts: ParsedTokenAccount[]): Map<string, { balance: number; decimals: number }> {
  const byMint = new Map<string, { balance: number; decimals: number }>();
  for (const a of accounts) {
    const info = a.account?.data?.parsed?.info;
    if (!info?.mint || !info.tokenAmount) continue;
    const { amount, decimals, uiAmountString } = info.tokenAmount;
    const balance = uiAmountString !== undefined
      ? Number(uiAmountString)
      : Number(amount) / 10 ** decimals;
    if (!Number.isFinite(balance) || balance <= 0) continue;
    const prev = byMint.get(info.mint);
    byMint.set(info.mint, { balance: (prev?.balance ?? 0) + balance, decimals });
  }
  return byMint;
}

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

async function fetchPrices(mints: string[], fetchFn: Fetch): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  await Promise.all(chunks(mints, PRICE_CHUNK).map(async (ids) => {
    try {
      const r = await fetchFn(`${JUPITER_PRICE}?ids=${ids.join(",")}`);
      if (!r.ok) return;
      const data = await r.json() as Record<string, { usdPrice?: number } | null>;
      for (const [mint, p] of Object.entries(data)) {
        if (p && typeof p.usdPrice === "number") out.set(mint, p.usdPrice);
      }
    } catch { /* prices are best-effort */ }
  }));
  return out;
}

async function fetchSymbols(mints: string[], fetchFn: Fetch): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(chunks(mints, SEARCH_CHUNK).map(async (ids) => {
    try {
      const r = await fetchFn(`${JUPITER_SEARCH}?query=${ids.join(",")}`);
      if (!r.ok) return;
      const data = await r.json() as Array<{ id: string; symbol?: string }>;
      for (const t of data) if (t.symbol) out.set(t.id, t.symbol);
    } catch { /* symbols are best-effort */ }
  }));
  return out;
}

export async function getPortfolio(wallet: string, rpcUrl: string, fetchFn: Fetch = fetch): Promise<PortfolioItem[]> {
  const byOwner = (programId: string) => rpc<{ value: ParsedTokenAccount[] }>(
    rpcUrl, "getTokenAccountsByOwner",
    [wallet, { programId }, { encoding: "jsonParsed", commitment: "confirmed" }],
    fetchFn,
  );

  const [lamports, spl, t22] = await Promise.all([
    rpc<{ value: number }>(rpcUrl, "getBalance", [wallet, { commitment: "confirmed" }], fetchFn),
    byOwner(SPL_TOKEN_PROGRAM),
    byOwner(TOKEN_2022_PROGRAM),
  ]);

  const tokens = aggregateTokenAccounts([...spl.value, ...t22.value]);
  const nativeSol = lamports.value / 1e9;

  const lookup = [SOL_MINT, ...[...tokens.keys()].filter(m => m !== SOL_MINT)].slice(0, MAX_LOOKUP_MINTS);
  const [prices, symbols] = await Promise.all([fetchPrices(lookup, fetchFn), fetchSymbols(lookup, fetchFn)]);

  const item = (mint: string, symbol: string, balance: number, decimals: number): PortfolioItem => {
    const priceUsd = prices.get(mint) ?? null;
    return { mint, symbol, balance, decimals, priceUsd, valueUsd: priceUsd !== null ? balance * priceUsd : null };
  };

  const items: PortfolioItem[] = [];
  // Native SOL first: the extension's buy Max reads the first SOL_MINT entry.
  if (nativeSol > 0) items.push(item(SOL_MINT, "SOL", nativeSol, 9));
  for (const [mint, t] of tokens) {
    const symbol = mint === SOL_MINT ? "wSOL" : symbols.get(mint) ?? mint.slice(0, 6);
    items.push(item(mint, symbol, t.balance, t.decimals));
  }
  return items;
}
