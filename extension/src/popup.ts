import { initReown, openConnectModal, subscribeReownWallet } from "./wallet-reown";
import { sendBg } from "./shared";
import type { WalletState, WatchItem, SkillSettings } from "./types";
import { DEFAULT_SKILL_SETTINGS } from "./types";

async function init(): Promise<void> {
  initReown();

  const [wallet, enabled, watchlist, skills] = await Promise.all([
    sendBg<WalletState>({ type: "get_wallet" }),
    sendBg<boolean>({ type: "get_detection_enabled" }),
    sendBg<WatchItem[]>({ type: "get_watchlist" }),
    sendBg<SkillSettings>({ type: "get_skill_settings" }),
  ]);

  // ── Tab switcher ──────────────────────────────────────────────────────────
  const tabState  = document.getElementById("tab-state")!;
  const tabSkills = document.getElementById("tab-skills")!;
  const paneState  = document.getElementById("pane-state")!;
  const paneSkills = document.getElementById("pane-skills")!;

  tabState.addEventListener("click", () => {
    tabState.classList.add("active"); tabSkills.classList.remove("active");
    paneState.classList.add("active"); paneSkills.classList.remove("active");
  });
  tabSkills.addEventListener("click", () => {
    tabSkills.classList.add("active"); tabState.classList.remove("active");
    paneSkills.classList.add("active"); paneState.classList.remove("active");
  });

  // ── STATE tab ─────────────────────────────────────────────────────────────
  const walletEl    = document.getElementById("wallet-status")!;
  const toggleEl    = document.getElementById("detection-toggle") as HTMLInputElement;
  const connectBtn  = document.getElementById("connect-btn") as HTMLButtonElement;
  const watchlistEl = document.getElementById("watchlist-summary")!;

  function renderWallet(w: WalletState): void {
    walletEl.textContent = w.connected && w.address
      ? `${w.address.slice(0, 6)}…${w.address.slice(-4)}`
      : "Not connected";
    walletEl.style.color = w.connected ? "#8BF542" : "#888";
    connectBtn.textContent = w.connected ? "DISCONNECT" : "CONNECT WALLET";
  }

  renderWallet(wallet);
  toggleEl.checked = enabled;

  toggleEl.addEventListener("change", () => {
    sendBg({ type: "set_detection_enabled", enabled: toggleEl.checked }).catch(() => {});
  });

  connectBtn.addEventListener("click", async () => {
    if (wallet.connected) {
      const disconnected: WalletState = { address: null, adapter: null, connected: false };
      await sendBg({ type: "set_wallet", wallet: disconnected });
      renderWallet(disconnected);
    } else {
      await openConnectModal();
    }
  });

  subscribeReownWallet((newWallet) => {
    renderWallet(newWallet);
    chrome.tabs.query({ active: true }, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: "WALLET_UPDATED", wallet: newWallet }).catch(() => {});
        }
      });
    });
  });

  if (watchlist.length === 0) {
    watchlistEl.textContent = "No tokens watched";
  } else {
    watchlistEl.innerHTML = watchlist.map(w =>
      `<div style="color:#ccc;margin-bottom:2px;">${w.ticker} <span style="color:#555;">${w.mint.slice(0, 8)}…</span></div>`
    ).join("");
  }

  // ── SKILLS tab ────────────────────────────────────────────────────────────
  const skillKeys: (keyof SkillSettings)[] = ["trade", "alert", "watch", "deep"];
  const currentSettings = { ...DEFAULT_SKILL_SETTINGS, ...skills };

  skillKeys.forEach(key => {
    const toggle = document.getElementById(`skill-${key}`) as HTMLInputElement | null;
    if (!toggle) return;
    toggle.checked = currentSettings[key];
    toggle.addEventListener("change", async () => {
      currentSettings[key] = toggle.checked;
      await sendBg({ type: "set_skill_settings", settings: { ...currentSettings } });
    });
  });
}

init().catch(console.error);
