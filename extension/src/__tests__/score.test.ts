import { describe, it, expect } from "vitest";
import { computeSafetyScore, scoreLabel, scoreColor } from "../score";

describe("scoreLabel", () => {
  it("returns SAFE for 80+", () => expect(scoreLabel(80)).toBe("SAFE"));
  it("returns SAFE for 100", () => expect(scoreLabel(100)).toBe("SAFE"));
  it("returns CAUTION for 50-79", () => expect(scoreLabel(79)).toBe("CAUTION"));
  it("returns CAUTION for 50", () => expect(scoreLabel(50)).toBe("CAUTION"));
  it("returns HIGH RISK for 49", () => expect(scoreLabel(49)).toBe("HIGH RISK"));
  it("returns HIGH RISK for 0", () => expect(scoreLabel(0)).toBe("HIGH RISK"));
});

describe("scoreColor", () => {
  it("returns lime for 80+", () => expect(scoreColor(80)).toBe("#8BF542"));
  it("returns amber for 50-79", () => expect(scoreColor(50)).toBe("#F5C842"));
  it("returns red for 0-49", () => expect(scoreColor(0)).toBe("#F54242"));
});

describe("computeSafetyScore", () => {
  it("marks suspicious tokens as HIGH RISK", () => {
    const result = computeSafetyScore({ organicScore: 90, audit: { isSus: true } });
    expect(result.label).toBe("HIGH RISK");
    expect(result.score).toBe(0);
    expect(result.isSuspicious).toBe(true);
    expect(result.summary).toContain("suspicious");
  });

  it("reflects verified + mint/freeze auth in summary", () => {
    const result = computeSafetyScore({
      organicScore: 85,
      isVerified: true,
      audit: { isSus: false, mintAuthorityDisabled: true, freezeAuthorityDisabled: true },
    });
    expect(result.score).toBe(85);
    expect(result.label).toBe("SAFE");
    expect(result.verified).toBe(true);
    expect(result.mintAuthDisabled).toBe(true);
    expect(result.summary).toContain("Jupiter verified");
    expect(result.summary).toContain("mint auth disabled");
  });

  it("sets textColor #000 for SAFE and CAUTION", () => {
    expect(computeSafetyScore({ organicScore: 80 }).textColor).toBe("#000");
    expect(computeSafetyScore({ organicScore: 55 }).textColor).toBe("#000");
  });

  it("sets textColor #fff for HIGH RISK", () => {
    expect(computeSafetyScore({ organicScore: 20 }).textColor).toBe("#fff");
  });

  it("generates fallback summary for unverified token", () => {
    const result = computeSafetyScore({ organicScore: 30, isVerified: false });
    expect(result.summary).toContain("not on Jupiter strict list");
  });
});
