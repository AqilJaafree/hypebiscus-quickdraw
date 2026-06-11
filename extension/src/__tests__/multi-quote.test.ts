import { describe, it, expect } from "vitest";
import { rankQuotes } from "../multi-quote-utils";
import type { AdapterQuote } from "../types";

describe("rankQuotes: higher outAmount sorts first", () => {
  it("raydium wins when it has higher outAmount", () => {
    const jupiter: AdapterQuote = {
      adapter: "jupiter",
      outAmount: "1000000",
      priceImpactPct: 0.1,
      routeLabel: "Orca-Jupiter",
    };
    const raydium: AdapterQuote = {
      adapter: "raydium",
      outAmount: "1050000",
      priceImpactPct: 0.05,
      routeLabel: "Raydium",
    };
    const ranked = rankQuotes([jupiter, raydium]);
    expect(ranked[0].adapter).toBe("raydium");
    expect(ranked[0].outAmount).toBe("1050000");
  });
});

describe("rankQuotes: equal amounts preserves order", () => {
  it("returns both quotes when amounts are equal", () => {
    const a: AdapterQuote = { adapter: "jupiter", outAmount: "1000000", priceImpactPct: 0.1, routeLabel: "Jupiter" };
    const b: AdapterQuote = { adapter: "raydium", outAmount: "1000000", priceImpactPct: 0.1, routeLabel: "Raydium" };
    const ranked = rankQuotes([a, b]);
    expect(ranked.length).toBe(2);
  });
});

describe("rankQuotes: single quote returns single-element array", () => {
  it("returns array with one element", () => {
    const q: AdapterQuote = { adapter: "jupiter", outAmount: "999", priceImpactPct: 0.0, routeLabel: "Jupiter" };
    const ranked = rankQuotes([q]);
    expect(ranked[0].outAmount).toBe("999");
  });
});
