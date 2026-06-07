import type { WalletState } from "./types";
import { sendBg } from "./shared";

async function init(): Promise<void> {
  const [wallet, enabled] = await Promise.all([
    sendBg<WalletState>({ type: "get_wallet" }),
    sendBg<boolean>({ type: "get_detection_enabled" }),
  ]);

  const walletEl = document.getElementById("wallet-status")!;
  const toggleEl = document.getElementById("detection-toggle") as HTMLInputElement;
  const connectBtn = document.getElementById("connect-btn") as HTMLButtonElement;

  walletEl.textContent = wallet.connected && wallet.address
    ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
    : "Not connected";
  walletEl.style.color = wallet.connected ? "#8BF542" : "#888";

  toggleEl.checked = enabled;
  toggleEl.addEventListener("change", () => {
    sendBg({ type: "set_detection_enabled", enabled: toggleEl.checked }).catch(() => {});
  });

  connectBtn.textContent = wallet.connected ? "Disconnect" : "Connect Wallet";
  connectBtn.addEventListener("click", async () => {
    if (wallet.connected) {
      await sendBg({ type: "set_wallet", wallet: { address: null, adapter: null, connected: false } });
      walletEl.textContent = "Not connected";
      walletEl.style.color = "#888";
      connectBtn.textContent = "Connect Wallet";
    } else {
      chrome.tabs.create({ url: "https://jup.ag" });
      window.close();
    }
  });
}

init().catch(console.error);
