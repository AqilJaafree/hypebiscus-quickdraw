// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { formatSolAmount, parseOutputAmount, buildTradeHTML, buildTradePanel } from "../../skills/trade";
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
    activeTab: "buy" as const,
    sellInput: "0",
    sellQuote: null,
  };

  it("shows SWAP NOW (no arrow) when wallet is connected and not signing", () => {
    const html = buildTradeHTML("BONK", baseState, connectedWallet, 0);
    expect(html).toContain("SWAP NOW");
    expect(html).not.toContain("SWAP NOW ↗");
  });

  it("shows CONNECT WALLET FIRST when wallet is disconnected", () => {
    const html = buildTradeHTML("BONK", baseState, disconnectedWallet, 0);
    expect(html).toContain("CONNECT WALLET FIRST");
  });

  it("shows SIGNING… and button is disabled when signing: true", () => {
    const html = buildTradeHTML("BONK", { ...baseState, signing: true }, connectedWallet, 0);
    expect(html).toContain("SIGNING…");
    expect(html).toContain("disabled");
  });

  it("button is NOT disabled when signing: false", () => {
    const html = buildTradeHTML("BONK", baseState, connectedWallet, 0);
    // should not have disabled attribute on the swap button
    expect(html).not.toMatch(/id="qd-trade-swap"[^>]*disabled/);
  });

  it("shows Solscan link on signSuccess", () => {
    const html = buildTradeHTML("BONK", {
      ...baseState,
      signSuccess: "https://solscan.io/tx/abc123",
    }, connectedWallet, 0);
    expect(html).toContain("Swap sent!");
    expect(html).toContain("https://solscan.io/tx/abc123");
    expect(html).toContain("View on Solscan ↗");
  });

  it("shows error message on signError", () => {
    const html = buildTradeHTML("BONK", {
      ...baseState,
      signError: "User rejected",
    }, connectedWallet, 0);
    expect(html).toContain("⚠");
    expect(html).toContain("User rejected");
  });
});

describe("sell panel", () => {
  it("shows SELL tab when heldBalance > 0", () => {
    const wallet: WalletState = { address: "WALLET111", adapter: "injected", connected: true };
    const panel = buildTradePanel("TOKEN_MINT_111", "BONK", wallet, 500.25);
    expect(panel.innerHTML).toContain('id="qd-tab-sell"');
  });

  it("hides SELL tab when heldBalance is 0", () => {
    const wallet: WalletState = { address: "WALLET111", adapter: "injected", connected: true };
    const panel = buildTradePanel("TOKEN_MINT_111", "BONK", wallet, 0);
    expect(panel.innerHTML).not.toContain('id="qd-tab-sell"');
  });

  it("shows held balance in sell tab content after clicking", () => {
    const wallet: WalletState = { address: "WALLET111", adapter: "injected", connected: true };
    const panel = buildTradePanel("TOKEN_MINT_111", "BONK", wallet, 1234.5678);
    document.body.appendChild(panel);
    const sellTab = panel.querySelector<HTMLButtonElement>("#qd-tab-sell");
    sellTab?.click();
    expect(panel.innerHTML).toContain("1234.5678");
    document.body.removeChild(panel);
  });
});
