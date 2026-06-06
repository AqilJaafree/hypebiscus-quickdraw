import { describe, it, expect } from "vitest";
import { detectInText, BLOCKLIST } from "../detector";

describe("detectInText", () => {
  it("detects a valid Solana address", () => {
    const results = detectInText("check out So11111111111111111111111111111111112 this token");
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe("So11111111111111111111111111111111112");
    expect(results[0].type).toBe("address");
  });

  it("skips blocklisted addresses", () => {
    const results = detectInText("11111111111111111111111111111111");
    expect(results).toHaveLength(0);
  });

  it("detects multiple addresses in one string", () => {
    const results = detectInText(
      "token A: DezXAZbkbkcAR31LmMQ85zBiLxmscrmYzvMst5MP19nu token B: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    );
    expect(results).toHaveLength(2);
  });

  it("ignores strings shorter than 32 chars", () => {
    expect(detectInText("shortAddr12345")).toHaveLength(0);
  });

  it("detects $TICKER symbols", () => {
    const results = detectInText("buying $BONK today");
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("ticker");
    expect(results[0].value).toBe("BONK");
  });
});

describe("BLOCKLIST", () => {
  it("contains system program", () => {
    expect(BLOCKLIST.has("11111111111111111111111111111111")).toBe(true);
  });
});
