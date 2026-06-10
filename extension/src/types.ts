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
  volume24h: number;
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
  adapter: "phantom" | "backpack" | "solflare" | "reown" | "injected" | null;
  connected: boolean;
}

export interface PriceAlert {
  mint: string;
  ticker: string;
  condition: "ABOVE" | "BELOW";
  price: number;
  triggered: boolean;
}

export interface WatchItem {
  mint: string;
  ticker: string;
}

export interface WatchItemWithPrice extends WatchItem {
  priceUsd: number | null;
  change24h: number | null;
}

export interface SkillSettings {
  trade: boolean;
  alert: boolean;
  watch: boolean;
  deep: boolean;
}

export const DEFAULT_SKILL_SETTINGS: SkillSettings = {
  trade: true,
  alert: true,
  watch: true,
  deep: true,
};

export interface DeepPortRequest {
  mint: string;
  ticker: string;
  price: number;
  safetyScore: number;
  volume24h: number;
}

export interface DeepPortChunk {
  type: "chunk";
  text: string;
}

export interface DeepPortDone {
  type: "done";
}

export interface DeepPortError {
  type: "error";
  message: string;
}

export type DeepPortMessage = DeepPortChunk | DeepPortDone | DeepPortError;

export type BgRequest =
  | { type: "fetch_token"; address: string }
  | { type: "get_wallet" }
  | { type: "set_wallet"; wallet: WalletState }
  | { type: "get_detection_enabled" }
  | { type: "set_detection_enabled"; enabled: boolean }
  | { type: "get_alerts" }
  | { type: "set_alerts"; alerts: PriceAlert[] }
  | { type: "get_watchlist" }
  | { type: "set_watchlist"; watchlist: WatchItem[] }
  | { type: "get_watchlist_prices"; mints: string[] }
  | { type: "get_skill_settings" }
  | { type: "set_skill_settings"; settings: SkillSettings }
  | { type: "quote"; inputMint: string; outputMint: string; amountLamports: number }
  | { type: "swap_tx"; inputMint: string; outputMint: string; amountLamports: number; walletAddress: string }
  | { type: "connect_wallet_injected" };

export type BgResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

