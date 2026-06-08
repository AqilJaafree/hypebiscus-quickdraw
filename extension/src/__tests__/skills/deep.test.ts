import { describe, it, expect } from "vitest";
import { formatDeepRequest } from "../../skills/deep";

describe("formatDeepRequest()", () => {
  it("serializes all required fields as JSON", () => {
    const body = formatDeepRequest("abc123", "BONK", 0.000030, 72, 2400000);
    const parsed = JSON.parse(body);
    expect(parsed.mint).toBe("abc123");
    expect(parsed.ticker).toBe("BONK");
    expect(parsed.price).toBe(0.000030);
    expect(parsed.safetyScore).toBe(72);
    expect(parsed.volume24h).toBe(2400000);
  });

  it("serializes zero price correctly", () => {
    const body = formatDeepRequest("mint", "TKN", 0, 50, 0);
    const parsed = JSON.parse(body);
    expect(parsed.price).toBe(0);
    expect(parsed.volume24h).toBe(0);
  });

  it("produces valid JSON", () => {
    const body = formatDeepRequest("m", "T", 1.5, 80, 1000);
    expect(() => JSON.parse(body)).not.toThrow();
  });
});
