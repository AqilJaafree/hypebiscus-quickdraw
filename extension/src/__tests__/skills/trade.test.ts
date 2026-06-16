import { describe, it, expect } from "vitest";
import { formatSolAmount, parseOutputAmount } from "../../skills/trade";

describe("formatSolAmount()", () => {
  it("formats small SOL amounts with 4 decimals", () => {
    expect(formatSolAmount(0.5)).toBe("0.5000");
  });
  it("formats zero as 0.0000", () => {
    expect(formatSolAmount(0)).toBe("0.0000");
  });
});

describe("parseOutputAmount()", () => {
  it("converts lamports string to human-readable with 4 fractional digits", () => {
    expect(parseOutputAmount("1000000000", 9)).toBe("1.0000");
  });
  it("converts with 4 fractional digits for USDC-style tokens (6 decimals)", () => {
    expect(parseOutputAmount("1000000", 6)).toBe("1.0000");
  });
  it("returns — for empty string", () => {
    expect(parseOutputAmount("", 9)).toBe("—");
  });
});
