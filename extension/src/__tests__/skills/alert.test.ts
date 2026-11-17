import { describe, it, expect } from "vitest";
import { parseAlertPrice, suggestPrice, buildAlertHTML } from "../../skills/alert";
import type { ServerAlert } from "../../types";

const base = { condition: "ABOVE" as const, priceInput: "0.46", saving: false, error: null, saved: false, existing: [] as ServerAlert[] };

describe("alert panel", () => {
  it("parses typed prices, rejecting zero and junk", () => {
    expect(parseAlertPrice("0.5")).toBe(0.5);
    expect(parseAlertPrice("$1,250")).toBe(1250);
    expect(parseAlertPrice("0")).toBeNull();
    expect(parseAlertPrice("abc")).toBeNull();
  });

  it("suggests a target 10% away from the current price", () => {
    expect(suggestPrice(0.4187, "ABOVE")).toBe("0.4606");
    expect(suggestPrice(0.4187, "BELOW")).toBe("0.3768");
    expect(suggestPrice(null, "ABOVE")).toBe("");
  });

  it("shows the current price, the saved state and existing alerts", () => {
    const html = buildAlertHTML("POPCAT", 0.4187, {
      ...base, saved: true,
      existing: [{ id: "a1", mint: "M", ticker: "POPCAT", condition: "BELOW", price: 0.3, triggered: true, lastPrice: 0.29, firedAt: null }],
    });
    expect(html).toContain("Target price");
    expect(html).toContain("Now $0.4187");
    expect(html).toContain("Alert set");
    expect(html).toContain("Below <b>$0.30</b>");
    expect(html).toContain("Fired");
    expect(html).toContain('data-id="a1"');
  });

  it("escapes the ticker", () => {
    expect(buildAlertHTML("<img>", null, base)).not.toContain("<img>");
  });

  it("disables the button while saving", () => {
    expect(buildAlertHTML("X", null, { ...base, saving: true })).toMatch(/id="qd-al-set"[^>]*disabled/);
  });
});
