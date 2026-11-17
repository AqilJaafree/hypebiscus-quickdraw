import { sendBg, esc } from "./shared";
import { fmtUsd } from "./styles";
import type { WalletState, PortfolioItem, SkillSettings } from "./types";

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

async function loadPortfolio(wallet: WalletState): Promise<void> {
  const section = document.getElementById("portfolio-section") as HTMLElement;
  const list = document.getElementById("portfolio-list") as HTMLElement;
  const total = document.getElementById("portfolio-total-val") as HTMLElement;

  if (!wallet.connected) {
    section.style.display = "none";
    return;
  }

  section.style.display = "";
  total.textContent = "";
  list.innerHTML = `<div class="portfolio-row"><span class="portfolio-empty">Loading…</span></div>`;

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
        <span class="portfolio-val">${fmtUsd(i.valueUsd ?? 0)}</span>
      </div>`,
    ).join("") || `<div class="portfolio-row"><span class="portfolio-empty">No tokens found</span></div>`;

    total.textContent = fmtUsd(totalUsd);
  } catch {
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
    statusTx.textContent = on ? "Watching pages" : "Paused";
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

  // ── Skills ─────────────────────────────────────────────────────────────────
  // The Jupiter Swap skill maps to SkillSettings.trade; the other skills are
  // placeholders (disabled switches, no handlers).
  const jupiterToggle = document.getElementById("toggle-jupiter") as HTMLButtonElement;

  jupiterToggle.addEventListener("click", async () => {
    const next = !jupiterToggle.classList.contains("on");
    jupiterToggle.classList.toggle("on", next);
    jupiterToggle.setAttribute("aria-checked", String(next));
    try {
      const cur = await sendBg<SkillSettings>({ type: "get_skill_settings" });
      await sendBg({ type: "set_skill_settings", settings: { ...cur, trade: next } });
    } catch { /* non-fatal */ }
  });

  sendBg<SkillSettings>({ type: "get_skill_settings" })
    .then(settings => {
      jupiterToggle.classList.toggle("on", settings.trade !== false);
    })
    .catch(() => {});

  // ── Wallet connect ─────────────────────────────────────────────────────────
  // One button: opens the hosted connect page which handles all wallet types
  // (Phantom, Solflare, email, WalletConnect). The page posts back via postMessage
  // → content script → background → chrome.storage.local. The storage watcher
  // below picks up the result when the connect tab closes.
  const connectBtn    = document.getElementById("connect-btn") as HTMLButtonElement;
  const walletRow     = document.getElementById("wallet-row") as HTMLElement;
  const walletAddr    = document.getElementById("wallet-addr") as HTMLElement;
  const walletKind    = document.getElementById("wallet-kind") as HTMLElement;
  const disconnectBtn = document.getElementById("disconnect-btn") as HTMLButtonElement;
  let currentWallet: WalletState = { address: null, adapter: null, connected: false };

  function renderConnectBtn(w: WalletState): void {
    currentWallet = w;
    const connected = Boolean(w.connected && w.address);
    connectBtn.hidden = connected;
    walletRow.hidden = !connected;
    if (connected && w.address) {
      walletAddr.textContent = `${w.address.slice(0, 6)}…${w.address.slice(-4)}`;
      walletAddr.title = w.address;
      walletKind.textContent = w.adapter === "reown" ? "Email wallet" : "Browser wallet";
    }
  }

  // Watch storage — fires when the connect page posts wallet state back.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.wallet) return;
    const w = (changes.wallet.newValue ?? { address: null, adapter: null, connected: false }) as WalletState;
    renderConnectBtn(w);
    loadPortfolio(w);
  });

  disconnectBtn.addEventListener("click", () => {
    const w: WalletState = { address: null, adapter: null, connected: false };
    chrome.storage.local.set({ wallet: w });
    sendBg({ type: "set_wallet", wallet: w }).catch(() => {});
    // Email-wallet session lives on the hosted page's origin — wipe it there too.
    if (currentWallet.adapter === "reown") sendBg({ type: "connect_wallet_reown", logout: true }).catch(() => {});
    window.close();
  });

  // One button: opens the hosted connect page which handles all wallet types
  // (Phantom, Solflare, email, WalletConnect). The page posts back via postMessage
  // → content script → background → chrome.storage.local. The storage watcher
  // above picks up the result when the connect tab closes.
  connectBtn.addEventListener("click", () => {
    sendBg({ type: "connect_wallet_reown" }).catch(() => {});
    window.close();
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
