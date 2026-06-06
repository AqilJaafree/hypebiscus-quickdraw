import type { SafetyScore } from "./types";

export interface JupiterTokenRaw {
  organicScore?: number;
  isVerified?: boolean;
  audit?: {
    isSus?: boolean;
    mintAuthorityDisabled?: boolean;
    freezeAuthorityDisabled?: boolean;
  };
}

export function scoreLabel(score: number): "SAFE" | "CAUTION" | "HIGH RISK" {
  if (score >= 80) return "SAFE";
  if (score >= 50) return "CAUTION";
  return "HIGH RISK";
}

export function scoreColor(score: number): string {
  if (score >= 80) return "#8BF542";
  if (score >= 50) return "#F5C842";
  return "#F54242";
}

export function computeSafetyScore(raw: JupiterTokenRaw): SafetyScore {
  const audit = raw.audit ?? {};
  const isSuspicious = audit.isSus ?? false;

  // Suspicious overrides the organic score — treat as 0
  const score = isSuspicious ? 0 : Math.round(raw.organicScore ?? 0);
  const verified = raw.isVerified ?? false;
  const mintAuthDisabled = audit.mintAuthorityDisabled ?? false;
  const freezeAuthDisabled = audit.freezeAuthorityDisabled ?? false;

  const label = scoreLabel(score);
  const color = scoreColor(score);
  const textColor: "#000" | "#fff" = score < 50 ? "#fff" : "#000";

  const parts: string[] = [];
  if (isSuspicious) parts.push("⚠️ flagged suspicious by Jupiter");
  if (verified) parts.push("Jupiter verified");
  if (mintAuthDisabled) parts.push("mint auth disabled");
  if (freezeAuthDisabled) parts.push("freeze auth disabled");

  const summary = parts.length
    ? parts.join(" · ")
    : "Unverified — not on Jupiter strict list";

  return { score, label, color, textColor, verified, mintAuthDisabled, freezeAuthDisabled, isSuspicious, summary };
}
