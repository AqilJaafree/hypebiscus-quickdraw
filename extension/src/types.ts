export interface SafetyScore {
  score: number;
  label: "SAFE" | "CAUTION" | "HIGH RISK";
  color: string;
  textColor: "#000" | "#fff";
  verified: boolean;
  mintAuthDisabled: boolean;
  freezeAuthDisabled: boolean;
  isSuspicious: boolean;
  summary: string;
}

export interface TokenPrice {
  usd: number;
  change24h: number;
  symbol: string;
  name: string;
}

export interface TokenData {
  address: string;
  safety: SafetyScore;
  price: TokenPrice | null;
}

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: number;
  slippageBps: number;
  routePlan: Array<{ swapInfo: { label: string } }>;
  raw: unknown;
}

export interface WalletState {
  address: string | null;
  adapter: "phantom" | "backpack" | "solflare" | "reown" | null;
  connected: boolean;
}

export type BgRequest =
  | { type: "fetch_token"; address: string }
  | { type: "get_quote"; inputMint: string; outputMint: string; amountLamports: number; slippageBps: number }
  | { type: "build_swap_tx"; quote: SwapQuote; walletAddress: string }
  | { type: "get_wallet" }
  | { type: "set_wallet"; wallet: WalletState }
  | { type: "get_detection_enabled" }
  | { type: "set_detection_enabled"; enabled: boolean };

export type BgResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface WalletBridgeCmd {
  id: string;
  cmd: "get_wallet" | "connect" | "sign_and_send";
  payload?: { adapter?: string; txBase64?: string };
}

export interface WalletBridgeResult {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}
