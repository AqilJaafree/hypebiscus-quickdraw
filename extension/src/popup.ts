import { sendBg } from "./shared";
import type { WalletState } from "./types";

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function init(): void {
  // ── Close ──────────────────────────────────────────────────────────────────
  document.getElementById("close-btn")?.addEventListener("click", () => window.close());

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const tabState   = document.getElementById("tab-state") as HTMLButtonElement;
  const tabSkills  = document.getElementById("tab-skills") as HTMLButtonElement;
  const paneState  = document.getElementById("pane-state") as HTMLElement;
  const paneSkills = document.getElementById("pane-skills") as HTMLElement;

  tabState.addEventListener("click", () => {
    tabState.classList.add("active");   tabSkills.classList.remove("active");
    paneState.classList.add("active");  paneSkills.classList.remove("active");
  });
  tabSkills.addEventListener("click", () => {
    tabSkills.classList.add("active");  tabState.classList.remove("active");
    paneSkills.classList.add("active"); paneState.classList.remove("active");
  });

  // ── Status ─────────────────────────────────────────────────────────────────
  const dot      = document.getElementById("status-dot") as HTMLElement;
  const statusTx = document.getElementById("status-text") as HTMLElement;
  const pauseBtn = document.getElementById("pause-btn") as HTMLButtonElement;
  let isEnabled  = true;

  function renderStatus(on: boolean): void {
    dot.className = "status-dot" + (on ? "" : " paused");
    statusTx.textContent = on ? "ACTIVE" : "PAUSED";
    pauseBtn.textContent = on ? "Pause" : "Resume";
  }

  pauseBtn.addEventListener("click", async () => {
    isEnabled = !isEnabled;
    renderStatus(isEnabled);
    await sendBg({ type: "set_detection_enabled", enabled: isEnabled }).catch(() => {});
  });

  // ── Stats ──────────────────────────────────────────────────────────────────
  const lastSeenEl    = document.getElementById("last-seen") as HTMLElement;
  const sessionTimeEl = document.getElementById("session-time") as HTMLElement;

  // ── AI mode toggle ─────────────────────────────────────────────────────────
  const aiButtons = ["ai-auto", "ai-cloud", "ai-local"].map(
    id => document.getElementById(id) as HTMLButtonElement,
  );
  aiButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      aiButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // ── Wallet connect (storage-based) ─────────────────────────────────────────
  // The popup fires the connect request and then watches chrome.storage.local
  // for the wallet key. Background writes wallet to storage after the injected
  // wallet connects — the popup updates whether it's still open or reopened.
  const connectBtn = document.getElementById("connect-btn") as HTMLButtonElement;
  let currentWallet: WalletState = { address: null, adapter: null, connected: false };

  function renderConnectBtn(w: WalletState): void {
    currentWallet = w;
    if (w.connected && w.address) {
      connectBtn.textContent = `${w.address.slice(0, 6)}…${w.address.slice(-4)}`;
      connectBtn.classList.add("connected");
      connectBtn.disabled = false;
    } else {
      connectBtn.textContent = "Connect Wallet";
      connectBtn.classList.remove("connected");
      connectBtn.disabled = false;
    }
  }

  // Watch storage — background writes wallet here after injected wallet connects.
  // This fires whether the popup is still open or was reopened after Phantom dialog.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.wallet) return;
    const w = (changes.wallet.newValue ?? { address: null, adapter: null, connected: false }) as WalletState;
    renderConnectBtn(w);
  });

  connectBtn.addEventListener("click", () => {
    if (currentWallet.connected) {
      // Disconnect — write directly to storage, watcher updates the button
      const w: WalletState = { address: null, adapter: null, connected: false };
      chrome.storage.local.set({ wallet: w });
      sendBg({ type: "set_wallet", wallet: w }).catch(() => {});
      return;
    }

    // Fire connect request to background — don't await.
    // Background finds the active browser tab (via getLastFocused windowTypes:["normal"]),
    // tells its content script to call window.phantom.solana.connect(),
    // then writes the wallet to chrome.storage.local.
    // The storage watcher above picks up the result.
    connectBtn.textContent = "Connecting…";
    connectBtn.disabled = true;
    chrome.runtime.sendMessage({ type: "connect_wallet_injected" }).catch(() => {
      // Background error (e.g. no active tab) — reset button
      renderConnectBtn(currentWallet);
    });
  });

  // ── Async state load ───────────────────────────────────────────────────────
  let sessionIntervalId: ReturnType<typeof setInterval> | null = null;

  Promise.allSettled([
    sendBg<boolean>({ type: "get_detection_enabled" }),
    sendBg<WalletState>({ type: "get_wallet" }),
    chrome.storage.local.get("lastToken"),
    chrome.storage.session.get("sessionStart"),
  ]).then(([enabledResult, walletResult, lastTokenResult, sessionResult]) => {
    if (enabledResult.status === "fulfilled") {
      isEnabled = enabledResult.value;
      renderStatus(isEnabled);
    }

    if (walletResult.status === "fulfilled") {
      renderConnectBtn(walletResult.value);
    }

    const lastToken = lastTokenResult.status === "fulfilled"
      ? (lastTokenResult.value as { lastToken?: string }).lastToken ?? null
      : null;
    lastSeenEl.textContent = lastToken
      ? `${lastToken.slice(0, 6)}…${lastToken.slice(-4)}`
      : "—";

    const rawStart = sessionResult.status === "fulfilled"
      ? (sessionResult.value as { sessionStart?: number }).sessionStart
      : undefined;
    const sessionStart = rawStart ?? Date.now();

    const updateTime = (): void => {
      sessionTimeEl.textContent = formatDuration(Date.now() - sessionStart);
    };
    updateTime();
    if (sessionIntervalId) clearInterval(sessionIntervalId);
    sessionIntervalId = setInterval(updateTime, 1_000);
  });
}

init();
