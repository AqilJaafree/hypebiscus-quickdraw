import { createAppKit } from "@reown/appkit";
import { SolanaAdapter } from "@reown/appkit-adapter-solana";
import { solana } from "@reown/appkit/networks";
import type { WalletState } from "./types";

declare const __REOWN_PROJECT_ID__: string;

const PROJECT_ID = typeof __REOWN_PROJECT_ID__ !== "undefined"
  ? __REOWN_PROJECT_ID__
  : "dev-reown-project-id";

let modal: ReturnType<typeof createAppKit> | null = null;

export function initReown(): ReturnType<typeof createAppKit> {
  if (modal) return modal;

  const adapter = new SolanaAdapter();
  modal = createAppKit({
    adapters: [adapter],
    networks: [solana],
    projectId: PROJECT_ID,
    features: {
      email: true,
      socials: false,
    },
    enableWalletConnect: true,
    themeMode: "dark",
    themeVariables: {
      "--w3m-accent": "#f5e642",
      "--w3m-border-radius-master": "0px",
    },
  });

  return modal;
}

export async function openConnectModal(): Promise<void> {
  const m = initReown();
  await m.open();
}

export function subscribeReownWallet(
  onUpdate: (state: WalletState) => void,
): () => void {
  const m = initReown();

  const unsub = m.subscribeAccount((account) => {
    const address = account.address ?? null;
    const connected = account.status === "connected";
    const walletState: WalletState = {
      address,
      adapter: "reown",
      connected,
    };
    onUpdate(walletState);
    // Persist to storage so background + content scripts can read it
    chrome.storage.local.set({ wallet: walletState }).catch(() => {});
    chrome.runtime.sendMessage({ type: "set_wallet", wallet: walletState }).catch(() => {});
  });

  return unsub;
}

export function getReownAddress(): string | null {
  if (!modal) return null;
  return modal.getAddress() ?? null;
}
