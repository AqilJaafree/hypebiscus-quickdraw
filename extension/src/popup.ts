import { sendBg, esc } from "./shared";
import type { WalletState, PortfolioItem } from "./types";

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

async function loadPortfolio(wallet: WalletState): Promise<void> {
  const section = document.getElementById("portfolio-section") as HTMLElement;
  const sep = document.getElementById("portfolio-sep") as HTMLElement;
  const list = document.getElementById("portfolio-list") as HTMLElement;
  const total = document.getElementById("portfolio-total") as HTMLElement;

  if (!wallet.connected) {
    section.style.display = "none";
    sep.style.display = "none";
    return;
  }

  section.style.display = "";
  sep.style.display = "";
  list.innerHTML = `<div class="portfolio-row"><span class="portfolio-sym">Loading…</span></div>`;

  try {
    const items = await sendBg<PortfolioItem[]>({ type: "get_portfolio" });

    const sorted = items
      .filter(i => (i.valueUsd ?? 0) > 0.01)
      .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
      .slice(0, 8);

    const totalUsd = items.reduce((s, i) => s + (i.valueUsd ?? 0), 0);

    list.innerHTML = sorted.map(i =>
      `<div class="portfolio-row">
        <span class="portfolio-sym">${esc(i.symbol)}</span>
        <span class="portfolio-val">$${(i.valueUsd ?? 0).toFixed(2)}</span>
      </div>`,
    ).join("") || `<div class="portfolio-row"><span class="portfolio-sym">No tokens found</span></div>`;

    total.innerHTML = `
      <span class="stat-key">Total</span>
      <span class="stat-val">$${totalUsd.toFixed(2)}</span>`;
  } catch {
    list.innerHTML = `<div class="portfolio-row"><span class="portfolio-sym">—</span></div>`;
    sep.style.display = "none";
    section.style.display = "none";
  }
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
    loadPortfolio(w);
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
    console.log("[QD popup] sending connect_wallet_injected");

    chrome.runtime.sendMessage({ type: "connect_wallet_injected" })
      .then((resp: { ok: boolean; data?: WalletState; error?: string } | undefined) => {
        console.log("[QD popup] connect response:", resp);
        if (!resp?.ok) {
          const msg = resp?.error ?? "unknown error";
          connectBtn.textContent = msg.slice(0, 28) + (msg.length > 28 ? "…" : "");
          connectBtn.disabled = false;
          setTimeout(() => renderConnectBtn(currentWallet), 2500);
        } else if (resp.data) {
          // Render immediately from the response — don't wait for storage.onChanged,
          // which won't fire if the popup closed during the Phantom approval dialog.
          renderConnectBtn(resp.data);
        }
      })
      .catch((err: unknown) => {
        console.error("[QD popup] sendMessage threw:", err);
        renderConnectBtn(currentWallet);
      });
  });

  // ── Async state load ───────────────────────────────────────────────────────
  let sessionIntervalId: ReturnType<typeof setInterval> | null = null;

  Promise.allSettled([
    sendBg<boolean>({ type: "get_detection_enabled" }),
    chrome.storage.local.get(["wallet", "lastToken"]),
    chrome.storage.session.get("sessionStart"),
  ]).then(([enabledResult, storageResult, sessionResult]) => {
    if (enabledResult.status === "fulfilled") {
      isEnabled = enabledResult.value;
      renderStatus(isEnabled);
    }

    // Read wallet directly from storage to avoid the SW restart race where
    // walletState is empty until loadWalletFromStorage() resolves.
    const storage = storageResult.status === "fulfilled"
      ? storageResult.value as { wallet?: WalletState; lastToken?: string }
      : {};
    if (storage.wallet) {
      renderConnectBtn(storage.wallet);
      loadPortfolio(storage.wallet);
    }

    const lastToken = storage.lastToken ?? null;
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
