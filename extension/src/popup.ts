import { sendBg } from "./shared";
import type { WalletState } from "./types";

const SOL_ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

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

  // ── Wallet connect ─────────────────────────────────────────────────────────
  const connectBtn  = document.getElementById("connect-btn") as HTMLButtonElement;
  const addrForm    = document.getElementById("addr-form") as HTMLElement;
  const addrInput   = document.getElementById("addr-input") as HTMLInputElement;
  const addrConfirm = document.getElementById("addr-confirm") as HTMLButtonElement;
  const addrCancel  = document.getElementById("addr-cancel") as HTMLButtonElement;
  const addrErr     = document.getElementById("addr-err") as HTMLElement;

  let currentWallet: WalletState = { address: null, adapter: null, connected: false };

  function renderConnectBtn(w: WalletState): void {
    currentWallet = w;
    if (w.connected && w.address) {
      connectBtn.textContent = `${w.address.slice(0, 6)}…${w.address.slice(-4)}`;
      connectBtn.classList.add("connected");
    } else {
      connectBtn.textContent = "Connect Wallet";
      connectBtn.classList.remove("connected");
    }
  }

  function showForm(): void {
    addrForm.classList.add("visible");
    addrInput.value = "";
    addrErr.classList.remove("visible");
    addrInput.focus();
  }

  function hideForm(): void {
    addrForm.classList.remove("visible");
  }

  async function confirmAddress(): Promise<void> {
    const addr = addrInput.value.trim();
    if (!SOL_ADDR_RE.test(addr)) {
      addrErr.classList.add("visible");
      return;
    }
    addrErr.classList.remove("visible");
    const w: WalletState = { address: addr, adapter: "manual", connected: true };
    await sendBg({ type: "set_wallet", wallet: w }).catch(() => {});
    renderConnectBtn(w);
    hideForm();
  }

  connectBtn.addEventListener("click", async () => {
    if (currentWallet.connected) {
      // Disconnect
      const w: WalletState = { address: null, adapter: null, connected: false };
      await sendBg({ type: "set_wallet", wallet: w }).catch(() => {});
      renderConnectBtn(w);
      hideForm();
    } else {
      // Show paste-address form
      showForm();
    }
  });

  addrConfirm.addEventListener("click", () => { confirmAddress().catch(() => {}); });

  addrInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { confirmAddress().catch(() => {}); }
    if (e.key === "Escape") { hideForm(); }
  });

  addrCancel.addEventListener("click", hideForm);

  // ── Async state load (never blocks buttons above) ──────────────────────────
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
