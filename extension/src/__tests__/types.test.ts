import { describe, it, expect } from "vitest";
import type { PriceAlert, WatchItem, SkillSettings, BgRequest } from "../types";
import { DEFAULT_SKILL_SETTINGS } from "../types";

describe("PriceAlert type shape", () => {
  it("accepts a valid PriceAlert object", () => {
    const alert: PriceAlert = {
      mint: "So11111111111111111111111111111111111111112",
      ticker: "SOL",
      condition: "ABOVE",
      price: 200,
      triggered: false,
    };
    expect(alert.condition).toBe("ABOVE");
  });
});

describe("DEFAULT_SKILL_SETTINGS", () => {
  it("all skills default to true", () => {
    expect(DEFAULT_SKILL_SETTINGS.trade).toBe(true);
    expect(DEFAULT_SKILL_SETTINGS.alert).toBe(true);
    expect(DEFAULT_SKILL_SETTINGS.watch).toBe(true);
    expect(DEFAULT_SKILL_SETTINGS.deep).toBe(true);
  });
});

describe("BgRequest discriminated union", () => {
  it("get_alerts type narrows correctly", () => {
    const req: BgRequest = { type: "get_alerts" };
    expect(req.type).toBe("get_alerts");
  });
  it("set_alerts type narrows correctly", () => {
    const req: BgRequest = { type: "set_alerts", alerts: [] };
    expect(req.type).toBe("set_alerts");
  });
});
