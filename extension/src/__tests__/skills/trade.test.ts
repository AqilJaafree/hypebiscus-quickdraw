// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { formatSolAmount, parseOutputAmount, buildTradeHTML, buildTradePanel, maxSpendableSol } from "../../skills/trade";
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

  it("shows Buy <ticker> when wallet is connected and not signing", () => {
    const html = buildTradeHTML("BONK", baseState, connectedWallet, 0);
    expect(html).toContain("Buy BONK");
  });

  it("asks to connect a wallet when disconnected", () => {
    const html = buildTradeHTML("BONK", baseState, disconnectedWallet, 0);
    expect(html).toContain("Connect wallet to buy");
  });

  it("shows Confirm in wallet… and button is disabled when signing: true", () => {
    const html = buildTradeHTML("BONK", { ...baseState, signing: true }, connectedWallet, 0);
    expect(html).toContain("Confirm in wallet…");
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
    expect(html).toContain("Swap sent");
    expect(html).toContain("https://solscan.io/tx/abc123");
    expect(html).toContain("View on Solscan");
  });

  it("shows error message on signError", () => {
    const html = buildTradeHTML("BONK", {
      ...baseState,
      signError: "User rejected",
    }, connectedWallet, 0);
    expect(html).toContain("qd-tr-err");
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

describe("buy Max", () => {
  const wallet: WalletState = { address: "WALLET111", adapter: "injected", connected: true };

  it("maxSpendableSol keeps the fee reserve and floors to 4 decimals", () => {
    expect(maxSpendableSol(2.345678)).toBe(2.3356);
    expect(maxSpendableSol(0.01)).toBe(0);
    expect(maxSpendableSol(0.005)).toBe(0);
  });

  it("hides Max when the SOL balance is unknown", () => {
    const panel = buildTradePanel("TOKEN_MINT_111", "BONK", wallet, 0, null);
    expect(panel.querySelector("#qd-trade-max")).toBeNull();
  });

  it("fills the input with balance minus the fee reserve, not a fixed 0.5", () => {
    const panel = buildTradePanel("TOKEN_MINT_111", "BONK", wallet, 0, 3.25);
    document.body.appendChild(panel);
    panel.querySelector<HTMLButtonElement>("#qd-trade-max")?.click();
    expect(panel.querySelector<HTMLInputElement>("#qd-trade-sol")?.value).toBe("3.24");
    document.body.removeChild(panel);
  });

  it("shows an error instead of filling when the balance only covers fees", () => {
    const panel = buildTradePanel("TOKEN_MINT_111", "BONK", wallet, 0, 0.008);
    document.body.appendChild(panel);
    panel.querySelector<HTMLButtonElement>("#qd-trade-max")?.click();
    expect(panel.innerHTML).toContain("Not enough SOL");
    document.body.removeChild(panel);
  });
});
