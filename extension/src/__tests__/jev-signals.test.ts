import { describe, it, expect } from "vitest";
import { deriveVerdict } from "../jev-signals";
import type { JevSignals } from "../jev-signals";

function signals(overrides: Partial<JevSignals> = {}): JevSignals {
  return {
    model: "jev-1.13.0",
    role: { choice: "token_neutral", confidence: 0.9 },
    shill: { score: 0, confidence: 0.9 },
    phishing: 0.05,
    impersonation: null,
    ...overrides,
  };
}

describe("deriveVerdict()", () => {
  it("returns no flags for a neutral token mention", () => {
    const v = deriveVerdict(signals());
    expect(v.flags).toEqual([]);
    expect(v.suppressPassive).toBe(false);
  });

  it("flags phishing from the noul", () => {
    const v = deriveVerdict(signals({ phishing: 0.92 }));
    expect(v.flags.map(f => f.label)).toContain("PHISHING PATTERN");
  });

  it("flags phishing from a confident scam_prompt role", () => {
    const v = deriveVerdict(signals({ role: { choice: "scam_prompt", confidence: 0.7 } }));
    expect(v.flags.map(f => f.label)).toContain("PHISHING PATTERN");
  });

  it("flags lookalike tickers only above threshold", () => {
    expect(deriveVerdict(signals({ impersonation: 0.85 })).flags.map(f => f.label)).toContain("LOOKALIKE TICKER");
    expect(deriveVerdict(signals({ impersonation: 0.4 })).flags).toEqual([]);
  });

  it("separates pump language from heavy shill", () => {
    expect(deriveVerdict(signals({ shill: { score: 2.8, confidence: 0.8 } })).flags[0].label).toBe("PUMP LANGUAGE");
    expect(deriveVerdict(signals({ shill: { score: 2.1, confidence: 0.8 } })).flags[0].label).toBe("HEAVY SHILL");
  });

  it("ignores shill score when confidence is low", () => {
    expect(deriveVerdict(signals({ shill: { score: 3, confidence: 0.3 } })).flags).toEqual([]);
  });

  it("suppresses passive popups for confident wallet addresses", () => {
    const v = deriveVerdict(signals({ role: { choice: "wallet", confidence: 0.88 } }));
    expect(v.suppressPassive).toBe(true);
    expect(v.flags.map(f => f.label)).toEqual(["WALLET, NOT TOKEN"]);
  });

  it("does not suppress when role confidence is low", () => {
    expect(deriveVerdict(signals({ role: { choice: "unclear", confidence: 0.5 } })).suppressPassive).toBe(false);
  });

  it("never suppresses when there is a risk flag", () => {
    const v = deriveVerdict(signals({ role: { choice: "wallet", confidence: 0.9 }, phishing: 0.95 }));
    expect(v.suppressPassive).toBe(false);
  });

  it("orders risk flags before caution flags", () => {
    const v = deriveVerdict(signals({ phishing: 0.9, shill: { score: 2.2, confidence: 0.9 } }));
    expect(v.flags.map(f => f.label)).toEqual(["PHISHING PATTERN", "HEAVY SHILL"]);
  });
});
