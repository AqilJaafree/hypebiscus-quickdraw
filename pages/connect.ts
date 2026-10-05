import { createAppKit } from "@reown/appkit";
import { SolanaAdapter } from "@reown/appkit-adapter-solana";
import { solana } from "@reown/appkit/networks";

declare const __REOWN_PROJECT_ID__: string;
const PROJECT_ID = __REOWN_PROJECT_ID__;

// ── DOM ────────────────────────────────────────────────────────────────────────
const sectConfirm = document.getElementById("sect-confirm") as HTMLElement;
const addrVal     = document.getElementById("addr-val")     as HTMLElement;
const btnConfirm  = document.getElementById("btn-confirm")  as HTMLButtonElement;
const btnSwitch   = document.getElementById("btn-switch")   as HTMLButtonElement;
const btnRetry    = document.getElementById("btn-retry")    as HTMLButtonElement;
const statusEl    = document.getElementById("status")       as HTMLElement;
const errorEl     = document.getElementById("error")        as HTMLElement;

type WalletMsg = {
  type: "set_wallet";
  wallet: { address: string | null; adapter: "reown"; connected: boolean };
};

function sendToExtension(msg: WalletMsg): void {
  window.postMessage({ source: "quickdraw-connect", ...msg }, window.location.origin);
}

// ── AppKit session cleanup ─────────────────────────────────────────────────────
function clearAppKitStorage(): void {
  try {
    Object.keys(localStorage)
      .filter(k =>
        k.startsWith("@w3m") || k.startsWith("wc@2") ||
        k.startsWith("wagmi") || k.includes("W3M_"),
      )
      .forEach(k => localStorage.removeItem(k));
  } catch { /* non-critical */ }
}

// ── State ──────────────────────────────────────────────────────────────────────
function showConfirm(address: string): void {
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  addrVal.textContent = short;
  sectConfirm.style.display = "flex";
  btnRetry.style.display = "none";
  statusEl.textContent = "";
  errorEl.textContent = "";

  btnConfirm.onclick = () => {
    sendToExtension({ type: "set_wallet", wallet: { address, adapter: "reown", connected: true } });
    sectConfirm.style.display = "none";
    statusEl.textContent = "Connected — closing…";
    setTimeout(() => window.close(), 2_500);
  };
}

function showRetry(): void {
  btnRetry.style.display = "block";
  sectConfirm.style.display = "none";
  statusEl.textContent = "";
}

// ── AppKit ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  // The session persists between visits: the Reown email wallet's device approval
  // lives in it, and the sign page (same origin) needs it for swaps. Sign-out is
  // explicit — ?logout=1 (extension "Disconnect") or "Use different wallet".
  const logout = new URLSearchParams(location.search).get("logout") === "1";
  if (logout) clearAppKitStorage();
  void navigator.storage?.persist?.().catch(() => {});

  const adapter = new SolanaAdapter();
  const modal = createAppKit({
    adapters: [adapter],
    networks: [solana],
    projectId: PROJECT_ID,
    metadata: {
      name: "Quickdraw",
      description: "Solana trading assistant",
      url: "https://quickdraw-auth.pages.dev",
      icons: [],
    },
    features: { email: true, socials: false },
    enableWalletConnect: true,
    themeMode: "dark",
    themeVariables: {
      "--w3m-accent": "#f5e642",
      "--w3m-border-radius-master": "0px",
    },
  });

  if (logout) {
    await modal.disconnect().catch(() => {});
    statusEl.textContent = "Signed out — closing…";
    setTimeout(() => window.close(), 1_200);
    return;
  }

  // Show confirm section whenever a wallet connects — user must click to confirm.
  // This prevents restored sessions from silently sending to the extension.
  modal.subscribeAccount((account) => {
    if (account.status === "connected" && account.address) {
      showConfirm(account.address);
    } else {
      sectConfirm.style.display = "none";
    }
  });

  // "Use different wallet" — disconnect and reopen modal
  btnSwitch.addEventListener("click", async () => {
    sectConfirm.style.display = "none";
    btnRetry.style.display = "none";
    clearAppKitStorage();
    await modal.disconnect().catch(() => {});
    statusEl.textContent = "Opening wallet picker…";
    errorEl.textContent = "";
    openModal(modal);
  });

  // Retry button (shown if user closed modal without connecting)
  btnRetry.addEventListener("click", () => {
    btnRetry.style.display = "none";
    statusEl.textContent = "Opening wallet picker…";
    openModal(modal);
  });

  openModal(modal);
}

function openModal(modal: ReturnType<typeof createAppKit>): void {
  modal.open().then(() => {
    // modal.open() resolves when the modal is shown, not when user finishes.
    // If the modal is closed without connecting, show the retry button.
    const unsub = modal.subscribeState((state) => {
      if (!state.open) {
        unsub();
        // Give subscribeAccount a tick to fire first if a connection was made
        setTimeout(() => {
          if (sectConfirm.style.display === "none") {
            statusEl.textContent = "";
            showRetry();
          }
        }, 150);
      }
    });
    statusEl.textContent = "Follow the prompts…";
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : "Failed to open wallet picker";
    errorEl.textContent = msg;
    statusEl.textContent = "";
    showRetry();
  });
}

main();
