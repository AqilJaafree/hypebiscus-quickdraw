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
  it("GET_ALERTS type narrows correctly", () => {
    const req: BgRequest = { type: "GET_ALERTS" };
    expect(req.type).toBe("GET_ALERTS");
  });
  it("SET_ALERTS type narrows correctly", () => {
    const req: BgRequest = { type: "SET_ALERTS", alerts: [] };
    expect(req.type).toBe("SET_ALERTS");
  });
});
