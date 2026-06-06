// extension/src/wallet.ts
// Content script side. Injects wallet-bridge.js into the page and
// provides a typed Promise-based API for wallet commands.

import type { WalletState, WalletBridgeCmd, WalletBridgeResult } from "./types";

let bridgeReady = false;
let bridgeReadyPromise: Promise<void> | null = null;

export function injectWalletBridge(): Promise<void> {
  if (bridgeReady) return Promise.resolve();
  if (bridgeReadyPromise) return bridgeReadyPromise;

  bridgeReadyPromise = new Promise((resolve) => {
    const onReady = () => {
      window.removeEventListener("__qd_ready", onReady);
      bridgeReady = true;
      resolve();
    };
    window.addEventListener("__qd_ready", onReady);

    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("dist/wallet-bridge.js");
    document.documentElement.appendChild(script);
    script.remove();
  });

  return bridgeReadyPromise;
}

function sendCmd<T>(cmd: WalletBridgeCmd["cmd"], payload?: WalletBridgeCmd["payload"]): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<WalletBridgeResult>).detail;
      if (detail.id !== id) return;
      window.removeEventListener("__qd_result", handler);
      if (detail.ok) resolve(detail.result as T);
      else reject(new Error(detail.error ?? "Wallet error"));
    };
    window.addEventListener("__qd_result", handler);
    window.dispatchEvent(new CustomEvent("__qd_cmd", { detail: { id, cmd, payload } }));

    setTimeout(() => {
      window.removeEventListener("__qd_result", handler);
      reject(new Error("Wallet command timed out after 30s"));
    }, 30_000);
  });
}

export async function getWallet(): Promise<WalletState> {
  await injectWalletBridge();
  const result = await sendCmd<{ adapter: string; address: string | null; connected: boolean } | null>("get_wallet");
  if (!result) return { address: null, adapter: null, connected: false };
  return { address: result.address, adapter: result.adapter as WalletState["adapter"], connected: result.connected };
}

export async function connectWallet(): Promise<WalletState> {
  await injectWalletBridge();
  const result = await sendCmd<{ adapter: string; address: string | null }>("connect");
  const state: WalletState = { address: result.address, adapter: result.adapter as WalletState["adapter"], connected: true };
  // Persist to background
  chrome.runtime.sendMessage({ type: "set_wallet", wallet: state }).catch(() => {});
  return state;
}

export async function signAndSend(txBase64: string): Promise<{ signature: string }> {
  await injectWalletBridge();
  return sendCmd<{ signature: string }>("sign_and_send", { txBase64 });
}
