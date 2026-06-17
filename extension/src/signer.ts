// Runs in the MAIN world of an active tab.
// Background sets window.__QD_PENDING__ before injecting this file,
// then reads window.__QD_RESULT__ after injection completes.
import { VersionedTransaction } from "@solana/web3.js";

(async () => {
  const w = window as Record<string, unknown>;
  const pending = w.__QD_PENDING__ as { txBase64: string } | undefined;
  if (!pending) {
    w.__QD_RESULT__ = { ok: false, error: "No pending swap" };
    return;
  }

  try {
    const bytes = Uint8Array.from(atob(pending.txBase64), c => c.charCodeAt(0));
    const tx = VersionedTransaction.deserialize(bytes);

    type Provider = {
      signAndSendTransaction(tx: unknown): Promise<{ signature: string }>;
    };
    const phantom  = (w.phantom as Record<string, unknown>)?.solana as Provider | undefined;
    const solflare = w.solflare as Provider | undefined;
    const solana   = w.solana   as Provider | undefined;
    const provider = phantom ?? solflare ?? solana;

    if (!provider) {
      w.__QD_RESULT__ = { ok: false, error: "No wallet provider found in page" };
      return;
    }

    const { signature } = await provider.signAndSendTransaction(tx);
    w.__QD_RESULT__ = { ok: true, signature };
  } catch (err) {
    w.__QD_RESULT__ = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
})();
