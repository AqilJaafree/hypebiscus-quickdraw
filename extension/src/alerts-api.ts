// Background-side client for the server-backed alerts, watchlist and push.
// Requests go to the Worker, which signs them for the Railway service.

import type { PriceAlert, ServerAlert, WatchItem } from "./types";

export interface ApiConfig { workerUrl: string; secret: string }

export type Api = <T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown) => Promise<T>;

/**
 * A random per-install ID. It acts as this install's private key on the
 * server (only its hash is stored there), so it never leaves the extension
 * except in requests to our Worker.
 */
export async function getInstallId(): Promise<string> {
  const { installId } = await chrome.storage.local.get("installId");
  if (typeof installId === "string" && installId) return installId;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ installId: id });
  return id;
}

export function makeApi(cfg: ApiConfig): Api {
  return async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const installId = await getInstallId();
    const resp = await fetch(`${cfg.workerUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Quickdraw-Client": "extension",
        "Authorization": `Bearer ${cfg.secret}`,
        "X-QD-Install": installId,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({})) as T & { error?: string };
    if (!resp.ok) throw new Error(data.error || `Request failed (${resp.status})`);
    return data;
  };
}

// ── typed calls ───────────────────────────────────────────────────────────────

export const listAlerts = async (api: Api): Promise<ServerAlert[]> =>
  (await api<{ alerts: ServerAlert[] }>("GET", "/alerts")).alerts;

export const createAlert = async (api: Api, a: Pick<ServerAlert, "mint" | "ticker" | "condition" | "price">): Promise<ServerAlert> =>
  (await api<{ alert: ServerAlert }>("POST", "/alerts", a)).alert;

export const deleteAlert = async (api: Api, id: string): Promise<void> => {
  await api("DELETE", `/alerts/${encodeURIComponent(id)}`);
};

export const listWatch = async (api: Api): Promise<WatchItem[]> =>
  (await api<{ items: WatchItem[] }>("GET", "/watchlist")).items.map(({ mint, ticker }) => ({ mint, ticker }));

export const addWatch = async (api: Api, w: WatchItem): Promise<void> => {
  await api("POST", "/watchlist", w);
};

export const removeWatch = async (api: Api, mint: string): Promise<void> => {
  await api("DELETE", `/watchlist/${encodeURIComponent(mint)}`);
};

// ── one-time migration from chrome.storage ────────────────────────────────────

/** Moves alerts + watchlist that older builds kept locally up to the server. */
export async function migrateLocalData(api: Api): Promise<{ imported: number } | null> {
  const { alerts, watchlist } = await chrome.storage.local.get(["alerts", "watchlist"]) as {
    alerts?: PriceAlert[]; watchlist?: WatchItem[];
  };
  if (!alerts?.length && !watchlist?.length) return null;
  const r = await api<{ imported: number; skipped: number }>("POST", "/import", {
    alerts: alerts ?? [], watchlist: watchlist ?? [],
  });
  // Only clear once the server has the data.
  await chrome.storage.local.remove(["alerts", "watchlist"]);
  return { imported: r.imported };
}

// ── Web Push ──────────────────────────────────────────────────────────────────

export function urlB64ToUint8Array(b64: string): Uint8Array {
  const padded = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

interface PushRegistration {
  pushManager: {
    getSubscription(): Promise<(PushSubscription & { options: { applicationServerKey: ArrayBuffer | null } }) | null>;
    subscribe(o: { userVisibleOnly: boolean; applicationServerKey: Uint8Array }): Promise<PushSubscription>;
  };
}

/** Subscribes this service worker to Web Push and tells the server where to send. */
export async function ensurePushSubscription(api: Api, registration: PushRegistration): Promise<void> {
  const { publicKey } = await api<{ publicKey: string }>("GET", "/push/key");
  const key = urlB64ToUint8Array(publicKey);
  let sub = await registration.pushManager.getSubscription();
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  const active = sub ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await api("PUT", "/push", { subscription: active.toJSON() });
}

export interface PushPayload { kind: "price_alert"; title: string; body: string; mint: string; alertId: string }

export function parsePushPayload(text: string | undefined): PushPayload | null {
  if (!text) return null;
  try {
    const p = JSON.parse(text) as Partial<PushPayload>;
    if (p.kind !== "price_alert" || typeof p.title !== "string" || typeof p.mint !== "string") return null;
    return { kind: "price_alert", title: p.title, body: String(p.body ?? ""), mint: p.mint, alertId: String(p.alertId ?? "") };
  } catch {
    return null;
  }
}
