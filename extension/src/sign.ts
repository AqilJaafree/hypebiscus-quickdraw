import { VersionedTransaction } from "@solana/web3.js";
import { initReown } from "./wallet-reown";
import type { PendingSwap } from "./types";

const statusEl  = document.getElementById("status")    as HTMLElement;
const errorEl   = document.getElementById("error")     as HTMLElement;
const closeBtn  = document.getElementById("close-btn") as HTMLButtonElement;

async function main(): Promise<void> {
  try {
    const { pendingSwap } = await chrome.storage.session.get("pendingSwap") as
      { pendingSwap?: PendingSwap };

    if (!pendingSwap || Date.now() > pendingSwap.expiresAt) {
      throw new Error("No pending transaction or it has expired.");
    }

    statusEl.textContent = "Connecting wallet…";

    // initReown is synchronous — returns the AppKit modal instance
    const modal = initReown();

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Wallet session not found. Please reconnect.")),
        8_000,
      );
      const unsub = modal.subscribeAccount((account: { status: string }) => {
        if (account.status === "connected") {
          clearTimeout(timeout);
          unsub();
          resolve();
        }
      });
      // Already connected — resolve immediately
      if (modal.getAddress()) {
        clearTimeout(timeout);
        unsub();
        resolve();
      }
    });

    statusEl.textContent = "Signing transaction…";

    const bytes = Uint8Array.from(atob(pendingSwap.txBase64), c => c.charCodeAt(0));
    const tx = VersionedTransaction.deserialize(bytes);

    const provider = modal.getWalletProvider() as {
      signAndSendTransaction?: (tx: VersionedTransaction) => Promise<{ signature: string }>;
    } | null;

    if (!provider?.signAndSendTransaction) {
      throw new Error("Wallet provider does not support signing. Please reconnect.");
    }

    const { signature } = await provider.signAndSendTransaction(tx);
    const explorer = `https://solscan.io/tx/${signature}`;

    await chrome.storage.session.set({ swapResult: { signature, explorer } });
    await chrome.storage.session.remove("pendingSwap").catch(() => {});

    statusEl.textContent = `✓ Sent! ${signature.slice(0, 8)}…`;
    setTimeout(() => window.close(), 1500);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    errorEl.textContent = msg;
    statusEl.textContent = "";
    closeBtn.style.display = "block";
    await chrome.storage.session.set({ swapResult: { error: msg } }).catch(() => {});
  }
}

main();
