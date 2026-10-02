/**
 * Hosted sign page for email (Reown) wallet swaps.
 *
 * The email wallet's session lives in Reown's secure iframe, whose storage is
 * partitioned per top-level site, and only this domain is allowlisted in the
 * Reown dashboard — so swaps must be signed here, where the user logged in,
 * not on a chrome-extension:// page.
 *
 * The page talks to the extension through its content script (postMessage
 * relay). Flow: fetch the pending swap → make sure the right wallet is logged
 * in (log in if needed) → user confirms → build a fresh Jupiter transaction →
 * sign and send → report the signature back.
 */

import { createAppKit } from "@reown/appkit";
import { SolanaAdapter } from "@reown/appkit-adapter-solana";
import { solana } from "@reown/appkit/networks";
import { VersionedTransaction } from "@solana/web3.js";

declare const __REOWN_PROJECT_ID__: string;
const PROJECT_ID = __REOWN_PROJECT_ID__;
const SOL_MINT = "So11111111111111111111111111111111111111112";

interface PendingSwap {
  inputMint: string;
  outputMint: string;
  amountLamports: number;
  walletAddress: string;
  expiresAt: number;
}

type Modal = ReturnType<typeof createAppKit>;

// ── DOM ────────────────────────────────────────────────────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl   = $("status");
const errorEl    = $("error");
const summaryEl  = $("summary");
const btnLogin   = $<HTMLButtonElement>("btn-login");
const btnConfirm = $<HTMLButtonElement>("btn-confirm");
const btnSwitch  = $<HTMLButtonElement>("btn-switch");
const btnCancel  = $<HTMLButtonElement>("btn-cancel");

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const show = (el: HTMLElement, on: boolean, display = "block") => { el.style.display = on ? display : "none"; };
function setStatus(msg: string): void { statusEl.textContent = msg; errorEl.textContent = ""; }
function setError(msg: string): void { errorEl.textContent = msg; statusEl.textContent = ""; }

// ── Extension relay ────────────────────────────────────────────────────────────
type Request =
  | { type: "sign_get_pending" }
  | { type: "sign_build" }
  | { type: "sign_result"; signature?: string; error?: string };

function ext<T>(request: Request, timeoutMs = 20_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { cleanup(); reject(new Error("no-extension")); }, timeoutMs);
    function onMessage(e: MessageEvent): void {
      const d = e.data as { source?: string; id?: string; response?: { ok: boolean; data?: T; error?: string } };
      if (e.source !== window || d?.source !== "quickdraw-ext" || d.id !== id) return;
      cleanup();
      if (d.response?.ok) resolve(d.response.data as T);
      else reject(new Error(d.response?.error ?? "Extension error"));
    }
    function cleanup(): void { clearTimeout(timer); window.removeEventListener("message", onMessage); }
    window.addEventListener("message", onMessage);
    window.postMessage({ source: "quickdraw-sign", id, request }, window.location.origin);
  });
}

/** The content script loads at document_idle, possibly after us — retry briefly. */
async function getPending(): Promise<PendingSwap> {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await ext<PendingSwap>({ type: "sign_get_pending" }, 1_000);
    } catch (e) {
      if (!(e instanceof Error) || e.message !== "no-extension") throw e;
    }
  }
  throw new Error("Quickdraw extension not detected on this page. Make sure it is installed and enabled, then start the swap again.");
}

let reported = false;
let pendingLoaded = false; // never report for a swap we didn't load (stale tab)
async function report(result: { signature?: string; error?: string }): Promise<void> {
  if (reported || !pendingLoaded) return;
  reported = true;
  await ext({ type: "sign_result", ...result }).catch(() => {});
}

// ── Wallet ─────────────────────────────────────────────────────────────────────
function waitForAddress(modal: Modal, ms: number): Promise<string | null> {
  return new Promise(resolve => {
    const now = modal.getAddress();
    if (now) { resolve(now); return; }
    const timer = setTimeout(() => { unsub(); resolve(null); }, ms);
    const unsub = modal.subscribeAccount(account => {
      if (account.status === "connected" && account.address) {
        clearTimeout(timer);
        unsub();
        resolve(account.address);
      }
    });
  });
}

function createModal(): Modal {
  return createAppKit({
    adapters: [new SolanaAdapter()],
    networks: [solana],
    projectId: PROJECT_ID,
    metadata: {
      name: "Quickdraw",
      description: "Solana trading assistant",
      url: "https://quickdraw-auth.pages.dev",
      icons: [],
    },
    // Email wallet only: injected wallets (Phantom/Solflare) sign in the user's
    // own tab, so offering them here would just confuse.
    features: { email: true, socials: false, connectMethodsOrder: ["email"] },
    enableWallets: false,
    enableWalletConnect: false,
    allWallets: "HIDE",
    themeMode: "dark",
    themeVariables: { "--w3m-accent": "#f5e642", "--w3m-border-radius-master": "0px" },
  });
}

/** Resolve once the wallet connected to Quickdraw is logged in on this page. */
async function ensureWallet(modal: Modal, pending: PendingSwap): Promise<void> {
  setStatus("Checking wallet session…");
  // Give AppKit a moment to restore an existing session from storage.
  let address = await waitForAddress(modal, 4_000);

  for (;;) {
    if (address === pending.walletAddress) return;

    if (address) {
      setError(`Logged in as ${short(address)}, but Quickdraw is connected to ${short(pending.walletAddress)}. Use a different login.`);
      show(btnSwitch, true);
      await new Promise<void>(r => { btnSwitch.onclick = () => r(); });
      show(btnSwitch, false);
      await modal.disconnect().catch(() => {});
    }

    setStatus(`Log in with the email for wallet ${short(pending.walletAddress)}. A new device may need the approval link from your inbox first.`);
    show(btnLogin, true);
    btnLogin.onclick = () => { void modal.open(); };
    void modal.open();
    address = await waitForAddress(modal, Math.max(0, pending.expiresAt - Date.now()));
    show(btnLogin, false);
    if (!address) throw new Error("Login timed out. Start the swap again from Quickdraw.");
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const pending = await getPending();
  pendingLoaded = true;

  const pay = pending.inputMint === SOL_MINT
    ? `${(pending.amountLamports / 1e9).toLocaleString(undefined, { maximumFractionDigits: 9 })} SOL`
    : `${pending.amountLamports.toLocaleString()} units of ${short(pending.inputMint)}`;
  $("sum-pay").textContent = pay;
  $("sum-get").textContent = pending.outputMint === SOL_MINT ? "SOL" : short(pending.outputMint);
  $("sum-wallet").textContent = short(pending.walletAddress);
  show(summaryEl, true, "flex");
  show(btnCancel, true);

  const modal = createModal();
  await ensureWallet(modal, pending);

  setStatus("Wallet ready. Review the swap, then confirm.");
  show(btnConfirm, true);
  await new Promise<void>(r => { btnConfirm.onclick = () => r(); });
  btnConfirm.disabled = true;
  show(btnCancel, false);

  // Build now, not earlier: a Jupiter transaction expires in about a minute.
  setStatus("Building transaction…");
  const txBase64 = await ext<string>({ type: "sign_build" });
  const tx = VersionedTransaction.deserialize(Uint8Array.from(atob(txBase64), c => c.charCodeAt(0)));

  const provider = modal.getWalletProvider() as {
    signAndSendTransaction?: (t: VersionedTransaction) => Promise<string | { signature: string }>;
  } | null;
  if (!provider?.signAndSendTransaction) throw new Error("Wallet can't sign transactions. Log in again and retry.");

  setStatus("Signing and sending…");
  const sent = await provider.signAndSendTransaction(tx);
  const signature = typeof sent === "string" ? sent : sent.signature;

  await report({ signature });
  show(btnConfirm, false);
  setStatus(`✓ Sent ${signature.slice(0, 8)}… — you can close this tab.`);
  setTimeout(() => window.close(), 2_000);
}

btnCancel.onclick = async () => {
  await report({ error: "Swap cancelled" });
  window.close();
};
$("btn-close").onclick = async () => {
  await report({ error: "Swap cancelled" });
  window.close();
};

main().catch(async (err: unknown) => {
  const msg = err instanceof Error ? err.message : "Signing failed";
  setError(msg);
  show(btnConfirm, false);
  show(btnLogin, false);
  show(btnCancel, false);
  await report({ error: msg });
});
