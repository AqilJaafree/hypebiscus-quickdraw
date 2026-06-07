import type { SafetyScore } from "./types";
import { SCORE_THRESHOLDS, SCORE_COLORS } from "./shared";

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
  if (score >= SCORE_THRESHOLDS.SAFE) return "SAFE";
  if (score >= SCORE_THRESHOLDS.CAUTION) return "CAUTION";
  return "HIGH RISK";
}

export function scoreColor(score: number): string {
  if (score >= SCORE_THRESHOLDS.SAFE) return SCORE_COLORS.SAFE;
  if (score >= SCORE_THRESHOLDS.CAUTION) return SCORE_COLORS.CAUTION;
  return SCORE_COLORS.RISK;
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
