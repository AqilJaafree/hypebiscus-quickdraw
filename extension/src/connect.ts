import { initReown, openConnectModal, subscribeReownWallet } from "./wallet-reown";

const statusEl = document.getElementById("status") as HTMLElement;
const errorEl  = document.getElementById("error")  as HTMLElement;

async function main(): Promise<void> {
  try {
    const unsub = subscribeReownWallet((wallet) => {
      if (wallet.connected && wallet.address) {
        statusEl.textContent = `Connected: ${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`;
        unsub();
        setTimeout(() => window.close(), 1200);
      }
    });

    await openConnectModal();
    statusEl.textContent = "Follow the prompts to connect…";
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    errorEl.textContent = msg;
    statusEl.textContent = "";
  }
}

main();
