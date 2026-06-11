import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchToken, fetchSwapQuote } from "../jupiter-client";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => mockFetch.mockReset());

describe("fetchToken", () => {
  it("returns null when token not in results", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    const result = await fetchToken("someAddress123");
    expect(result).toBeNull();
  });

  it("returns null when id does not match address", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ id: "differentAddress", organicScore: 82, isVerified: true, audit: { isSus: false } }],
    });
    const result = await fetchToken("someAddress123");
    expect(result).toBeNull();
  });

  it("returns safety score SAFE for organicScore >= 80", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{
        id: "someAddress123",
        organicScore: 82,
        isVerified: true,
        audit: { isSus: false, mintAuthorityDisabled: true, freezeAuthorityDisabled: true },
        symbol: "TST",
        name: "Test Token",
      }],
    });
    const result = await fetchToken("someAddress123");
    expect(result).not.toBeNull();
    expect(result!.safety.score).toBe(82);
    expect(result!.safety.label).toBe("SAFE");
  });

  it("returns price data when usdPrice is present", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{
        id: "So11111111111111111111111111111111111111112",
        organicScore: 90,
        isVerified: true,
        audit: { isSus: false },
        usdPrice: 142.5,
        stats24h: { priceChange: 2.3 },
        symbol: "SOL",
        name: "Wrapped SOL",
      }],
    });
    const result = await fetchToken("So11111111111111111111111111111111111111112");
    expect(result).not.toBeNull();
    expect(result!.price).not.toBeNull();
    expect(result!.price!.usd).toBe(142.5);
    expect(result!.price!.change24h).toBe(2.3);
  });

  it("returns null price when usdPrice is absent", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{
        id: "addr",
        organicScore: 60,
        isVerified: false,
        audit: { isSus: false },
        symbol: "UNK",
        name: "Unknown",
      }],
    });
    const result = await fetchToken("addr");
    expect(result).not.toBeNull();
    expect(result!.price).toBeNull();
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(fetchToken("addr")).rejects.toThrow("Jupiter API error");
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
