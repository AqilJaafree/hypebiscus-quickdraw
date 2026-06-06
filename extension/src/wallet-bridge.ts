// extension/src/wallet-bridge.ts
// Runs in the page MAIN world. Injected via <script src="chrome-extension://...">
// DO NOT import any extension-only APIs (chrome.*) here.

import { VersionedTransaction } from "@solana/web3.js";

declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      isConnected?: boolean;
      publicKey?: { toString(): string };
      connect(): Promise<void>;
      signAndSendTransaction(tx: VersionedTransaction): Promise<{ signature: string }>;
    };
    phantom?: { solana?: Window["solana"] };
    backpack?: { solana?: Window["solana"] };
    solflare?: {
      isSolflare?: boolean;
      isConnected?: boolean;
      publicKey?: { toString(): string };
      connect(): Promise<void>;
      signAndSendTransaction(tx: VersionedTransaction): Promise<{ signature: string }>;
    };
  }
}

function getProvider(): { provider: NonNullable<Window["solana"]>; adapter: string } | null {
  if (window.phantom?.solana?.isConnected !== undefined) {
    return { provider: window.phantom.solana!, adapter: "phantom" };
  }
  if (window.solana?.isPhantom) {
    return { provider: window.solana, adapter: "phantom" };
  }
  if (window.backpack?.solana) {
    return { provider: window.backpack.solana!, adapter: "backpack" };
  }
  if (window.solflare?.isSolflare) {
    return { provider: window.solflare as unknown as NonNullable<Window["solana"]>, adapter: "solflare" };
  }
  return null;
}

window.addEventListener("__qd_cmd", async (e: Event) => {
  const { id, cmd, payload } = (e as CustomEvent<{ id: string; cmd: string; payload?: Record<string, string> }>).detail;

  try {
    let result: unknown;

    if (cmd === "get_wallet") {
      const p = getProvider();
      result = p
        ? { adapter: p.adapter, address: p.provider.publicKey?.toString() ?? null, connected: p.provider.isConnected ?? false }
        : null;
    }

    if (cmd === "connect") {
      const p = getProvider();
      if (!p) throw new Error("No wallet found. Install Phantom or Backpack.");
      await p.provider.connect();
      result = { adapter: p.adapter, address: p.provider.publicKey?.toString() ?? null };
    }

    if (cmd === "sign_and_send") {
      const p = getProvider();
      if (!p || !p.provider.isConnected) throw new Error("Wallet not connected");
      const txBase64 = payload?.txBase64;
      if (!txBase64) throw new Error("Missing txBase64");
      const txBytes = Uint8Array.from(atob(txBase64), c => c.charCodeAt(0));
      const tx = VersionedTransaction.deserialize(txBytes);
      const { signature } = await p.provider.signAndSendTransaction(tx);
      result = { signature };
    }

    window.dispatchEvent(new CustomEvent("__qd_result", { detail: { id, ok: true, result } }));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown wallet error";
    window.dispatchEvent(new CustomEvent("__qd_result", { detail: { id, ok: false, error: message } }));
  }
});

// Signal bridge is ready
window.dispatchEvent(new CustomEvent("__qd_ready"));
