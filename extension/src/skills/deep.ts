import { DS, brutal } from "../styles";
import type { DeepPortRequest, DeepPortMessage } from "../types";

export function formatDeepRequest(
  mint: string,
  ticker: string,
  price: number,
  safetyScore: number,
  volume24h: number,
): string {
  return JSON.stringify({ mint, ticker, price, safetyScore, volume24h } satisfies DeepPortRequest);
}

export function buildDeepPanel(
  mint: string,
  ticker: string,
  price: number,
  safetyScore: number,
  volume24h: number,
): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `padding:10px 12px;font-family:${DS.font};`;
  el.innerHTML = buildDeepHTML("", true);

  let port: ReturnType<typeof chrome.runtime.connect> | null = null;
  let runGeneration = 0; // incremented on each startAnalysis call to invalidate stale callbacks

  function setContent(text: string, analyzing: boolean, isError = false): void {
    const textEl = el.querySelector<HTMLDivElement>("#qd-deep-text");
    const dotEl  = el.querySelector<HTMLSpanElement>("#qd-deep-dot");
    const statusEl = el.querySelector<HTMLSpanElement>("#qd-deep-status");
    const btnEl  = el.querySelector<HTMLButtonElement>("#qd-deep-reanalyze");

    if (textEl) {
      textEl.textContent = text || (analyzing ? "Analyzing…" : "");
      textEl.style.color = isError ? DS.danger : "#cccccc";
    }
    if (dotEl) dotEl.style.display = analyzing ? "inline" : "none";
    if (statusEl) statusEl.textContent = analyzing ? "Analyzing…" : "";
    if (btnEl) btnEl.style.display = analyzing ? "none" : "inline-block";
  }

  function startAnalysis(): void {
    const generation = ++runGeneration;

    if (port) {
      try { port.disconnect(); } catch { /* already closed */ }
      port = null;
    }
    setContent("", true);

    port = chrome.runtime.connect({ name: "deep-analysis" });

    const req: DeepPortRequest = { mint, ticker, price, safetyScore, volume24h };
    port.postMessage(req);

    let accText = "";

    port.onMessage.addListener((msg: DeepPortMessage) => {
      if (generation !== runGeneration) return; // stale run — a re-analyze was triggered
      if (msg.type === "chunk") {
        accText += msg.text;
        setContent(accText, true);
      } else if (msg.type === "done") {
        setContent(accText, false);
      } else if (msg.type === "error") {
        setContent(msg.message, false, true);
      }
    });

    port.onDisconnect.addListener(() => {
      if (generation !== runGeneration) return; // stale — don't overwrite the new run's UI
      if (accText) setContent(accText, false);
      else setContent("Analysis unavailable", false, true);
      port = null;
    });
  }

  startAnalysis();

  el.querySelector("#qd-deep-reanalyze")?.addEventListener("click", () => {
    startAnalysis();
  });

  return el;
}

function buildDeepHTML(initialText: string, analyzing: boolean): string {
  return `
<style>
  .qd-deep-label { font-size:10px; color:${DS.textMut}; margin-bottom:6px; letter-spacing:0.06em; }
  .qd-deep-box { background:#111; border:1px solid #2a2a2a; padding:8px 10px; min-height:72px;
    font-size:9px; line-height:1.6; color:#cccccc; margin-bottom:8px; font-family:${DS.font}; white-space:pre-wrap; }
  .qd-deep-footer { display:flex; align-items:center; gap:8px; }
  .qd-deep-dot { color:${DS.yellow}; font-size:14px; line-height:1; }
  .qd-deep-analyzing { font-size:9px; color:${DS.textMut}; }
  .qd-deep-reanalyze { ${brutal("#222")}; color:${DS.textMut}; padding:4px 10px;
    font-size:10px; font-family:${DS.font}; cursor:pointer; border:1px solid #333; }
  .qd-deep-reanalyze:hover { color:#fff; }
</style>
<div class="qd-deep-label">DEEP ANALYSIS</div>
<div class="qd-deep-box" id="qd-deep-text">${initialText || (analyzing ? "Analyzing…" : "")}</div>
<div class="qd-deep-footer">
  <span class="qd-deep-dot" id="qd-deep-dot" style="display:${analyzing ? "inline" : "none"}">●</span>
  <span class="qd-deep-analyzing" id="qd-deep-status">${analyzing ? "Analyzing…" : ""}</span>
  <button class="qd-deep-reanalyze" id="qd-deep-reanalyze" style="display:${analyzing ? "none" : "inline-block"}">RE-ANALYZE</button>
</div>`;
}
