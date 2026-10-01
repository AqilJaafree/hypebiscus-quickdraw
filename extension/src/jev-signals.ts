// Policy over Jev (TypeSafe) context signals. The worker returns raw
// probabilities; every threshold and decision lives here so it can be tuned
// and tested without re-running inference. Flag labels double as an
// allowlist in worker/src/narration.ts — keep the two in sync.

export interface JevSignals {
  model: string;
  role: { choice: string; confidence: number };
  shill: { score: number; confidence: number };
  phishing: number;
  impersonation: number | null;
}

export interface SignalFlag {
  label: string;
  severity: "risk" | "caution" | "info";
}

export interface SignalVerdict {
  flags: SignalFlag[];
  /** Skip the passive (scroll-detected) popup — the address isn't a token being discussed. */
  suppressPassive: boolean;
}

export const JEV_THRESHOLDS = {
  PHISHING: 0.7,
  IMPERSONATION: 0.7,
  SCAM_ROLE_CONFIDENCE: 0.6,
  SUPPRESS_ROLE_CONFIDENCE: 0.75,
  SHILL_STRONG: 2,
  SHILL_PUMP: 2.5,
  SHILL_CONFIDENCE: 0.5,
} as const;

export function deriveVerdict(s: JevSignals): SignalVerdict {
  const T = JEV_THRESHOLDS;
  const flags: SignalFlag[] = [];

  const scamRole = s.role.choice === "scam_prompt" && s.role.confidence >= T.SCAM_ROLE_CONFIDENCE;
  if (s.phishing >= T.PHISHING || scamRole) {
    flags.push({ label: "PHISHING PATTERN", severity: "risk" });
  }
  if (s.impersonation !== null && s.impersonation >= T.IMPERSONATION) {
    flags.push({ label: "LOOKALIKE TICKER", severity: "risk" });
  }
  if (s.shill.confidence >= T.SHILL_CONFIDENCE) {
    if (s.shill.score >= T.SHILL_PUMP) flags.push({ label: "PUMP LANGUAGE", severity: "caution" });
    else if (s.shill.score >= T.SHILL_STRONG) flags.push({ label: "HEAVY SHILL", severity: "caution" });
  }
  if (s.role.choice === "wallet" && s.role.confidence >= T.SUPPRESS_ROLE_CONFIDENCE) {
    flags.push({ label: "WALLET, NOT TOKEN", severity: "info" });
  }

  // Never hide a risk warning; only suppress when the address is confidently
  // a wallet or not discussed at all.
  const hasRisk = flags.some(f => f.severity === "risk");
  const suppressPassive =
    !hasRisk &&
    (s.role.choice === "wallet" || s.role.choice === "unclear") &&
    s.role.confidence >= T.SUPPRESS_ROLE_CONFIDENCE;

  return { flags, suppressPassive };
}
