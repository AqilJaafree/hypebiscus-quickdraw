import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchTokenSafety, fetchTokenPrice, fetchSwapQuote } from "../jupiter-client";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => mockFetch.mockReset());

describe("fetchTokenSafety", () => {
  it("returns null when token not found", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    const result = await fetchTokenSafety("someAddress123");
    expect(result).toBeNull();
  });

  it("returns parsed token when found", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ organicScore: 82, isVerified: true, audit: { isSus: false } }],
    });
    const result = await fetchTokenSafety("someAddress123");
    expect(result).not.toBeNull();
    expect(result!.score).toBe(82);
    expect(result!.label).toBe("SAFE");
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(fetchTokenSafety("addr")).rejects.toThrow("Jupiter API error");
  });
});

describe("fetchTokenPrice", () => {
  it("returns price data for known token", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          So11111111111111111111111111111111111111112: {
            price: 142.5,
            extraInfo: { lastSwappedPrice: { lastJupiterSellAt: 142.5 } },
          },
        },
      }),
    });
    const result = await fetchTokenPrice("So11111111111111111111111111111111111111112");
    expect(result).not.toBeNull();
    expect(result!.usd).toBe(142.5);
  });

  it("returns null when mint not in response", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
    const result = await fetchTokenPrice("unknownMint");
    expect(result).toBeNull();
  });
});

describe("fetchSwapQuote", () => {
  it("constructs correct query string", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ inAmount: "1000000", outAmount: "142000", priceImpactPct: 0.01, routePlan: [] }),
    });
    await fetchSwapQuote({
      inputMint: "So111",
      outputMint: "BONK111",
      amountLamports: 1_000_000,
      slippageBps: 50,
    });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("inputMint=So111");
    expect(url).toContain("amount=1000000");
    expect(url).toContain("slippageBps=50");
  });
});
