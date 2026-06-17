import { openConnectModal, subscribeReownWallet } from "./wallet-reown";

const statusEl  = document.getElementById("status")    as HTMLElement;
const errorEl   = document.getElementById("error")     as HTMLElement;
const closeBtn  = document.getElementById("close-btn") as HTMLButtonElement;

async function main(): Promise<void> {
  try {
    const unsub = subscribeReownWallet((wallet) => {
      if (wallet.connected && wallet.address) {
        statusEl.textContent = `Connected: ${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`;
        closeBtn.style.display = "block";
        unsub();
        setTimeout(() => window.close(), 1200);
      }
    });

    await openConnectModal();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    errorEl.textContent = msg;
    statusEl.textContent = "";
    closeBtn.style.display = "block";
  }
}

main();
