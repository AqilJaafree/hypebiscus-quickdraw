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
  it("list_alerts type narrows correctly", () => {
    const req: BgRequest = { type: "list_alerts" };
    expect(req.type).toBe("list_alerts");
  });
  it("create_alert carries the alert fields", () => {
    const req: BgRequest = { type: "create_alert", mint: "M", ticker: "T", condition: "ABOVE", price: 1 };
    expect(req.type === "create_alert" && req.price).toBe(1);
  });
});
