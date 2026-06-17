// Runs in the MAIN world of an active tab.
// Background injects this file to define __QD_SIGN__, then calls it via a
// second executeScript({ func }) call which correctly awaits the returned Promise.
import { VersionedTransaction } from "@solana/web3.js";

type SignResult = { ok: true; signature: string } | { ok: false; error: string };

async function __QD_SIGN__(txBase64: string): Promise<SignResult> {
  try {
    const w = window as Record<string, unknown>;
    const bytes = Uint8Array.from(atob(txBase64), c => c.charCodeAt(0));
    const tx = VersionedTransaction.deserialize(bytes);

    type Provider = { signAndSendTransaction(tx: unknown): Promise<{ signature: string }> };
    const phantom  = (w.phantom as Record<string, unknown>)?.solana as Provider | undefined;
    const solflare = w.solflare as Provider | undefined;
    const solana   = w.solana   as Provider | undefined;
    const provider = phantom ?? solflare ?? solana;

    if (!provider) return { ok: false, error: "No wallet provider" };

    const { signature } = await provider.signAndSendTransaction(tx);
    return { ok: true, signature };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

(window as Record<string, unknown>).__QD_SIGN__ = __QD_SIGN__;
