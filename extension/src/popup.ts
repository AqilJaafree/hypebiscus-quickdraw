import { sendBg } from "./shared";
import type { WalletState } from "./types";

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

async function getSessionStart(): Promise<number> {
  const { sessionStart } = await chrome.storage.session.get("sessionStart");
  if (sessionStart) return sessionStart as number;
  const now = Date.now();
  await chrome.storage.session.set({ sessionStart: now });
  return now;
}

function init(): void {
  // ── Close ──────────────────────────────────────────────────────────────────
  document.getElementById("close-btn")?.addEventListener("click", () => window.close());

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const tabState  = document.getElementById("tab-state")!;
  const tabSkills = document.getElementById("tab-skills")!;
  const paneState  = document.getElementById("pane-state")!;
  const paneSkills = document.getElementById("pane-skills")!;

  tabState.addEventListener("click", () => {
    tabState.classList.add("active");   tabSkills.classList.remove("active");
    paneState.classList.add("active");  paneSkills.classList.remove("active");
  });
  tabSkills.addEventListener("click", () => {
    tabSkills.classList.add("active");  tabState.classList.remove("active");
    paneSkills.classList.add("active"); paneState.classList.remove("active");
  });

  // ── Status ─────────────────────────────────────────────────────────────────
  const dot       = document.getElementById("status-dot")!;
  const statusTx  = document.getElementById("status-text")!;
  const pauseBtn  = document.getElementById("pause-btn") as HTMLButtonElement;
  let isEnabled   = true;

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
  const lastSeenEl    = document.getElementById("last-seen")!;
  const sessionTimeEl = document.getElementById("session-time")!;

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

  // ── Wallet connect (lazy Reown init) ───────────────────────────────────────
  const connectBtn = document.getElementById("connect-btn") as HTMLButtonElement;

  function renderConnectBtn(w: WalletState): void {
    if (w.connected && w.address) {
      connectBtn.textContent = `${w.address.slice(0, 6)}…${w.address.slice(-4)}`;
      connectBtn.classList.add("connected");
    } else {
      connectBtn.textContent = "Connect Wallet";
      connectBtn.classList.remove("connected");
    }
  }

  let reownReady = false;
  connectBtn.addEventListener("click", async () => {
    if (!reownReady) {
      const { initReown, openConnectModal, subscribeReownWallet } =
        await import("./wallet-reown");
      initReown();
      reownReady = true;
      subscribeReownWallet((newWallet) => {
        renderConnectBtn(newWallet);
        sendBg({ type: "set_wallet", wallet: newWallet }).catch(() => {});
      });
      await openConnectModal();
    } else {
      const { openConnectModal } = await import("./wallet-reown");
      await openConnectModal();
    }
  });

  // ── Load state async (display only — never blocks buttons above) ───────────
  Promise.allSettled([
    sendBg<boolean>({ type: "get_detection_enabled" }),
    sendBg<WalletState>({ type: "get_wallet" }),
    chrome.storage.local.get("lastToken"),
    getSessionStart(),
  ]).then(([enabledResult, walletResult, lastTokenResult, sessionStartResult]) => {
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

    const sessionStart = sessionStartResult.status === "fulfilled"
      ? sessionStartResult.value
      : Date.now();
    sessionTimeEl.textContent = formatDuration(Date.now() - sessionStart);
    setInterval(() => {
      sessionTimeEl.textContent = formatDuration(Date.now() - sessionStart);
    }, 30_000);
  });
}

init();
