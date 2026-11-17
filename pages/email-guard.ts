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
      `events:`,
      ...(errors.length ? errors : ["  (none)"]),
    ].join("\n");
  }
  router.subscribeKey("view", () => { history.push(router.state.view); if (history.length > 10) history.shift(); render(); });
  router.subscribeKey("data", render);
  history.push(router.state.view);
  render();
}
