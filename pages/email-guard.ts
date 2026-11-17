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

import { RouterController } from "@reown/appkit-controllers";

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

export function installEmailGuard(router: RouterLike = RouterController as unknown as RouterLike, doc: Document = document): () => void {
  let lastEmail = "";

  const onInput = (e: Event): void => {
    const v = (e as CustomEvent<unknown>).detail;
    if (typeof v === "string" && EMAIL.test(v.trim())) lastEmail = v.trim();
  };
  doc.addEventListener("inputChange", onInput, true);

  let repairing = false;
  const check = (): void => {
    const { view, data } = router.state;
    if (data?.email && EMAIL.test(data.email)) lastEmail = data.email;
    if (repairing || !needsRepair(view, data) || !lastEmail) return;
    repairing = true;
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
