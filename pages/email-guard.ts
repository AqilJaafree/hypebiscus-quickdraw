// Workaround for an AppKit 1.8.x bug: the email-code screens ("Confirm Email"
// / device approval) read the address from router data, and several routes
// reach them without it (RouterController.push skips the data when the view
// is already current, goBack restores a view but not its data, reopening the
// modal resets the router). The screen then throws "No email provided" and
// renders an empty dialog, so the code Magic already sent can't be entered.
//
// We remember the address as it's typed (AppKit's input emits a composed
// `inputChange` event) and, if an email screen shows up without it, reopen
// that screen with the remembered address.

import { RouterController, ModalController, ChainController } from "@reown/appkit-controllers";

const EMAIL_VIEWS = ["EmailVerifyOtp", "EmailVerifyDevice"] as const;
type EmailView = typeof EMAIL_VIEWS[number];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RouterLike = {
  state: { view: string; data?: { email?: string } };
  subscribeKey(key: "view" | "data", cb: () => void): () => void;
  reset(view: string, data?: unknown): void;
  push(view: string, data?: unknown): void;
};

export function needsRepair(view: string, data: { email?: string } | undefined): view is EmailView {
  return (EMAIL_VIEWS as readonly string[]).includes(view) && !data?.email;
}

/** Read-only view of the guard for the ?debug=1 panel. */
export const guardState = { lastEmailCaptured: false, repairs: 0 };

export function installEmailGuard(router: RouterLike = RouterController as unknown as RouterLike, doc: Document = document): () => void {
  let lastEmail = "";

  const onInput = (e: Event): void => {
    const v = (e as CustomEvent<unknown>).detail;
    if (typeof v === "string" && EMAIL.test(v.trim())) { lastEmail = v.trim(); guardState.lastEmailCaptured = true; }
  };
  doc.addEventListener("inputChange", onInput, true);

  let repairing = false;
  const check = (): void => {
    const { view, data } = router.state;
    if (data?.email && EMAIL.test(data.email)) { lastEmail = data.email; guardState.lastEmailCaptured = true; }
    if (repairing || !needsRepair(view, data) || !lastEmail) return;
    repairing = true;
    guardState.repairs++;
    // push() ignores data when the view is unchanged, so step off and back on.
    // The view element is rebuilt and reads the email from router data.
    queueMicrotask(() => {
      try {
        router.reset("Connect");
        router.push(view, { email: lastEmail });
      } finally {
        repairing = false;
      }
    });
  };

  const unsubView = router.subscribeKey("view", check);
  const unsubData = router.subscribeKey("data", check);
  check();
  return () => { unsubView(); unsubData(); doc.removeEventListener("inputChange", onInput, true); };
}

// ── Collapsed-body heal ───────────────────────────────────────────────────────
// AppKit sizes the dialog body from a ResizeObserver on the current screen
// (w3m-router-container → --local-container-height). In some browsers that
// measurement isn't updated after switching to the code screen, so the body
// stays at 0px: the header shows, the code boxes exist but are invisible.
// If the container is collapsed while its content has height, size it ourselves.

export const healState = { heals: 0, last: "" };

/** querySelectorAll that also searches open shadow roots. */
export function deepQueryAll(root: ParentNode, selector: string, limit = 2000): Element[] {
  const out: Element[] = [];
  const stack: ParentNode[] = [root];
  let seen = 0;
  while (stack.length && seen < limit) {
    const node = stack.pop()!;
    for (const el of Array.from(node.querySelectorAll("*"))) {
      if (++seen > limit) break;
      if (el.matches(selector)) out.push(el);
      if (el.shadowRoot) stack.push(el.shadowRoot);
    }
  }
  return out;
}

export function measureRouter(doc: Document = document): { container: number; content: number; el: HTMLElement | null } {
  const el = deepQueryAll(doc, "w3m-router-container")[0] as HTMLElement | undefined;
  if (!el?.shadowRoot) return { container: -1, content: -1, el: null };
  const container = el.shadowRoot.querySelector(".container") as HTMLElement | null;
  const content = el.shadowRoot.querySelector(".page-content") as HTMLElement | null;
  const slotted = el.shadowRoot.querySelector("slot")?.assignedElements() ?? [];
  const contentH = Math.max(content?.scrollHeight ?? 0, ...slotted.map(s => (s as HTMLElement).scrollHeight || s.getBoundingClientRect().height));
  return { container: container?.getBoundingClientRect().height ?? -1, content: Math.round(contentH), el };
}

/** For the debug panel: is the open screen's element AppKit's own, and did it draw? */
function viewElementLine(doc: Document): string {
  const container = deepQueryAll(doc, "w3m-router-container")[0];
  const slotted = (container?.shadowRoot?.querySelector("slot")?.assignedElements() ?? [])[0] as HTMLElement | undefined;
  const routerEl = deepQueryAll(doc, "w3m-router")[0];
  const viewEl = (routerEl?.shadowRoot ? Array.from(routerEl.shadowRoot.querySelectorAll("*")).find(e => e.tagName.toLowerCase().startsWith("w3m-") && e.tagName.toLowerCase().endsWith("-view")) : undefined) as HTMLElement | undefined;
  const el = viewEl ?? slotted;
  if (!el) return "screen element: not found";
  const tag = el.tagName.toLowerCase();
  const def = customElements.get(tag);
  const upgraded = def ? el instanceof def : false;
  const otp = customElements.get("wui-otp");
  return `screen element: <${tag}> registered=${!!def} upgraded=${upgraded} shadowChildren=${el.shadowRoot?.childElementCount ?? "none"} ` +
    `height=${Math.round(el.getBoundingClientRect().height)}px  wui-otp registered=${!!otp}  ` +
    `ext-scripts=${Array.from(doc.scripts).filter(sc => /^(chrome|moz)-extension:/.test(sc.src)).length}`;
}

export function installCollapseHeal(router: RouterLike = RouterController as unknown as RouterLike, doc: Document = document): void {
  let timer: ReturnType<typeof setInterval> | undefined;
  const watch = (): void => {
    clearInterval(timer);
    let ticks = 0;
    timer = setInterval(() => {
      ticks++;
      const m = measureRouter(doc);
      if (m.el && m.container >= 0 && m.container < 24 && m.content > 40) {
        m.el.style.setProperty("--local-container-height", `${m.content}px`);
        healState.heals++;
        healState.last = `${router.state.view}: ${Math.round(m.container)}px → ${m.content}px`;
      }
      // Watch every screen for ~5 s, and the email screens for as long as they're open.
      if (ticks >= 20 && !(EMAIL_VIEWS as readonly string[]).includes(router.state.view)) clearInterval(timer);
    }, 250);
  };
  router.subscribeKey("view", watch);
  watch();
}

// ── ?debug=1 panel ────────────────────────────────────────────────────────────
// Shows what AppKit is doing when the email step misbehaves, so a screenshot
// is enough to diagnose it. Never shows the email itself.

export function installDebugPanel(router: RouterLike = RouterController as unknown as RouterLike, doc: Document = document): void {
  const panel = doc.createElement("pre");
  panel.style.cssText = "position:fixed;left:8px;bottom:8px;right:8px;max-height:45vh;overflow:auto;z-index:2147483647;" +
    "margin:0;padding:8px;background:#000;color:#9f9;font:11px/1.4 ui-monospace,monospace;border:1px solid #333;white-space:pre-wrap";
  doc.body.appendChild(panel);
  const errors: string[] = [];
  const push = (kind: string, msg: unknown): void => {
    const text = msg instanceof Error ? `${msg.name}: ${msg.message}` : String(msg);
    errors.push(`${new Date().toISOString().slice(11, 19)} ${kind}: ${text.replace(/[^\s@]+@[^\s@]+/g, "<email>").slice(0, 300)}`);
    if (errors.length > 20) errors.shift();
    render();
  };
  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => { push("console", args.map(a => a instanceof Error ? a.message : typeof a === "object" ? JSON.stringify(a)?.slice(0, 200) : String(a)).join(" ")); origError(...args); };
  addEventListener("error", (e) => push("error", (e as ErrorEvent).error ?? (e as ErrorEvent).message));
  addEventListener("unhandledrejection", (e) => push("rejection", (e as PromiseRejectionEvent).reason));
  const history: string[] = [];

  // Who closes the modal / resets the router, and what else happened around it.
  const callers = (): string => (new Error().stack ?? "").split("\n").slice(3, 8)
    .map(l => l.trim().replace(/^at /, "").replace(/\(?https?:\/\/[^)]*\/([^/)]+)\)?/, "[$1]")).join(" < ");
  const mc = ModalController as unknown as { close: (...a: unknown[]) => unknown };
  const origClose = mc.close.bind(mc);
  mc.close = (...a: unknown[]) => { push("modal.close", callers()); return origClose(...a); };
  const rc = RouterController as unknown as { reset: (v: string, d?: unknown) => unknown };
  const origReset = rc.reset.bind(rc);
  rc.reset = (v: string, d?: unknown) => { push("router.reset", `${v} ← ${callers()}`); return origReset(v, d); };
  const cc = ChainController as unknown as { state: { activeCaipAddress?: string }; subscribeKey(k: string, cb: (v: unknown) => void): void };
  cc.subscribeKey("activeCaipAddress", (v) => push("address", v ? "set" : "cleared"));
  addEventListener("visibilitychange", () => push("tab", doc.visibilityState));
  addEventListener("blur", () => push("window", "blur"));
  addEventListener("focus", () => push("window", "focus"));

  function render(): void {
    const { view, data } = router.state;
    panel.textContent = [
      `quickdraw debug · AppKit 1.8.21`,
      `view: ${view}   data.email: ${data?.email ? "present" : "MISSING"}   guard: email captured=${guardState.lastEmailCaptured} repairs=${guardState.repairs}`,
      `views: ${history.join(" → ")}`,
      viewElementLine(doc),
      (() => { const m = measureRouter(doc); return `body: container=${Math.round(m.container)}px content=${m.content}px   heals=${healState.heals}${healState.last ? ` (${healState.last})` : ""}`; })(),
      `events:`,
      ...(errors.length ? errors : ["  (none)"]),
    ].join("\n");
  }
  router.subscribeKey("view", () => { history.push(router.state.view); if (history.length > 10) history.shift(); render(); });
  router.subscribeKey("data", render);
  history.push(router.state.view);
  render();
  setInterval(render, 500); // keep the body measurements live
}
