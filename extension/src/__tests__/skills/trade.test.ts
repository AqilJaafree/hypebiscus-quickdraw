import { describe, it, expect } from "vitest";
import { formatSolAmount, parseOutputAmount, buildTradeHTML } from "../../skills/trade";
import type { WalletState } from "../../types";

describe("formatSolAmount()", () => {
  it("formats small SOL amounts with 4 decimals", () => {
    expect(formatSolAmount(0.5)).toBe("0.5000");
  });
  it("formats zero as 0.0000", () => {
    expect(formatSolAmount(0)).toBe("0.0000");
  });
});

describe("parseOutputAmount()", () => {
  it("converts lamports string to human-readable with 4 fractional digits", () => {
    expect(parseOutputAmount("1000000000", 9)).toBe("1.0000");
  });
  it("converts with 4 fractional digits for USDC-style tokens (6 decimals)", () => {
    expect(parseOutputAmount("1000000", 6)).toBe("1.0000");
  });
  it("returns — for empty string", () => {
    expect(parseOutputAmount("", 9)).toBe("—");
  });
});

describe("buildTradeHTML()", () => {
  const connectedWallet: WalletState = {
    address: "ABC123",
    adapter: "phantom",
    connected: true,
  };
  const disconnectedWallet: WalletState = {
    address: null,
    adapter: null,
    connected: false,
  };
  const baseState = {
    solInput: "0.5",
    multiQuote: null,
    loading: false,
    signing: false,
    signError: null,
    signSuccess: null,
    error: null,
  };

  it("shows SWAP NOW (no arrow) when wallet is connected and not signing", () => {
    const html = buildTradeHTML("BONK", baseState, connectedWallet);
    expect(html).toContain("SWAP NOW");
    expect(html).not.toContain("SWAP NOW ↗");
  });

  it("shows CONNECT WALLET FIRST when wallet is disconnected", () => {
    const html = buildTradeHTML("BONK", baseState, disconnectedWallet);
    expect(html).toContain("CONNECT WALLET FIRST");
  });

  it("shows SIGNING… and button is disabled when signing: true", () => {
    const html = buildTradeHTML("BONK", { ...baseState, signing: true }, connectedWallet);
    expect(html).toContain("SIGNING…");
    expect(html).toContain("disabled");
  });

  it("button is NOT disabled when signing: false", () => {
    const html = buildTradeHTML("BONK", baseState, connectedWallet);
    // should not have disabled attribute on the swap button
    expect(html).not.toMatch(/id="qd-trade-swap"[^>]*disabled/);
  });

  it("shows Solscan link on signSuccess", () => {
    const html = buildTradeHTML("BONK", {
      ...baseState,
      signSuccess: "https://solscan.io/tx/abc123",
    }, connectedWallet);
    expect(html).toContain("Swap sent!");
    expect(html).toContain("https://solscan.io/tx/abc123");
    expect(html).toContain("View on Solscan ↗");
  });

  it("shows error message on signError", () => {
    const html = buildTradeHTML("BONK", {
      ...baseState,
      signError: "User rejected",
    }, connectedWallet);
    expect(html).toContain("⚠");
    expect(html).toContain("User rejected");
  });
});
