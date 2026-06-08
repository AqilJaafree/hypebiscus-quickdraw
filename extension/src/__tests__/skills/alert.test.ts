import { describe, it, expect } from "vitest";
import { alertShouldFire, alertShouldRearm } from "../../skills/alert";
import type { PriceAlert } from "../../types";

describe("alertShouldFire()", () => {
  it("fires ABOVE alert when current price exceeds threshold", () => {
    const alert: PriceAlert = { mint: "abc", ticker: "SOL", condition: "ABOVE", price: 200, triggered: false };
    expect(alertShouldFire(alert, 201)).toBe(true);
  });
  it("does not fire ABOVE alert when price is below threshold", () => {
    const alert: PriceAlert = { mint: "abc", ticker: "SOL", condition: "ABOVE", price: 200, triggered: false };
    expect(alertShouldFire(alert, 199)).toBe(false);
  });
  it("fires BELOW alert when current price drops below threshold", () => {
    const alert: PriceAlert = { mint: "abc", ticker: "SOL", condition: "BELOW", price: 150, triggered: false };
    expect(alertShouldFire(alert, 149)).toBe(true);
  });
  it("does not fire already-triggered alert", () => {
    const alert: PriceAlert = { mint: "abc", ticker: "SOL", condition: "ABOVE", price: 200, triggered: true };
    expect(alertShouldFire(alert, 250)).toBe(false);
  });
  it("does not fire ABOVE alert at exact threshold (strictly greater)", () => {
    const alert: PriceAlert = { mint: "abc", ticker: "SOL", condition: "ABOVE", price: 200, triggered: false };
    expect(alertShouldFire(alert, 200)).toBe(false);
  });
  it("does not fire BELOW alert at exact threshold (strictly less)", () => {
    const alert: PriceAlert = { mint: "abc", ticker: "SOL", condition: "BELOW", price: 150, triggered: false };
    expect(alertShouldFire(alert, 150)).toBe(false);
  });
});

describe("alertShouldRearm()", () => {
  it("re-arms ABOVE alert when price drops back below threshold", () => {
    const alert: PriceAlert = { mint: "abc", ticker: "SOL", condition: "ABOVE", price: 200, triggered: true };
    expect(alertShouldRearm(alert, 190)).toBe(true);
  });
  it("does not re-arm non-triggered alert", () => {
    const alert: PriceAlert = { mint: "abc", ticker: "SOL", condition: "ABOVE", price: 200, triggered: false };
    expect(alertShouldRearm(alert, 190)).toBe(false);
  });
  it("re-arms BELOW alert when price rises back above threshold", () => {
    const alert: PriceAlert = { mint: "abc", ticker: "SOL", condition: "BELOW", price: 100, triggered: true };
    expect(alertShouldRearm(alert, 110)).toBe(true);
  });
  it("does not re-arm ABOVE alert when price is still above threshold", () => {
    const alert: PriceAlert = { mint: "abc", ticker: "SOL", condition: "ABOVE", price: 200, triggered: true };
    expect(alertShouldRearm(alert, 210)).toBe(false);
  });
});
