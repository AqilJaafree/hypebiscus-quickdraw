import { describe, test, expect } from "vitest";
import { defaultMode } from "../detection-rules";

describe("defaultMode", () => {
  test("quiet list sites default to selection", () => {
    expect(defaultMode("solscan.io")).toBe("selection");
    expect(defaultMode("birdeye.so")).toBe("selection");
    expect(defaultMode("dexscreener.com")).toBe("selection");
  });

  test("all other sites default to aggressive", () => {
    expect(defaultMode("twitter.com")).toBe("aggressive");
    expect(defaultMode("pump.fun")).toBe("aggressive");
    expect(defaultMode("t.me")).toBe("aggressive");
    expect(defaultMode("reddit.com")).toBe("aggressive");
  });
});
