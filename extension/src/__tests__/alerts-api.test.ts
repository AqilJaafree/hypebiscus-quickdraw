import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeApi, getInstallId, migrateLocalData, urlB64ToUint8Array, parsePushPayload, ensurePushSubscription } from "../alerts-api";

let store: Record<string, unknown>;
beforeEach(() => {
  store = {};
  (globalThis as any).chrome = {
    storage: { local: {
      get: async (k: string | string[]) => Object.fromEntries((Array.isArray(k) ? k : [k]).filter(x => x in store).map(x => [x, store[x]])),
      set: async (o: Record<string, unknown>) => { Object.assign(store, o); },
      remove: async (k: string[]) => { for (const x of k) delete store[x]; },
    } },
  };
});

describe("install id", () => {
  it("is created once and reused", async () => {
    const a = await getInstallId();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(await getInstallId()).toBe(a);
  });
});

describe("api", () => {
  it("sends extension auth plus the install id and surfaces server errors", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return url.endsWith("/bad")
        ? new Response(JSON.stringify({ error: "At most 50 alerts" }), { status: 409 })
        : new Response(JSON.stringify({ ok: true }));
    });
    const api = makeApi({ workerUrl: "https://w.example", secret: "S" });
    await api("POST", "/alerts", { a: 1 });
    const h = calls[0].init.headers as Record<string, string>;
    expect(calls[0].url).toBe("https://w.example/alerts");
    expect(h.Authorization).toBe("Bearer S");
    expect(h["X-QD-Install"]).toBe(store.installId);
    await expect(api("GET", "/bad")).rejects.toThrow("At most 50 alerts");
    vi.unstubAllGlobals();
  });
});

describe("migration", () => {
  it("uploads local alerts + watchlist once, then clears them", async () => {
    store.alerts = [{ mint: "M", ticker: "T", condition: "ABOVE", price: 1, triggered: false }];
    store.watchlist = [{ mint: "W", ticker: "X" }];
    const api = vi.fn(async () => ({ imported: 2, skipped: 0 })) as any;
    expect(await migrateLocalData(api)).toEqual({ imported: 2 });
    expect(api).toHaveBeenCalledWith("POST", "/import", { alerts: [expect.any(Object)], watchlist: [{ mint: "W", ticker: "X" }] });
    expect(store.alerts).toBeUndefined();
    expect(await migrateLocalData(api)).toBeNull();
  });

  it("keeps local data if the upload fails", async () => {
    store.watchlist = [{ mint: "W", ticker: "X" }];
    const api = vi.fn(async () => { throw new Error("down"); }) as any;
    await expect(migrateLocalData(api)).rejects.toThrow("down");
    expect(store.watchlist).toBeDefined();
  });
});

describe("push", () => {
  it("decodes a VAPID key", () => {
    expect(Array.from(urlB64ToUint8Array("AQID_w"))).toEqual([1, 2, 3, 255]);
  });

  it("parses only price-alert payloads", () => {
    expect(parsePushPayload(JSON.stringify({ kind: "price_alert", title: "JUP is above $1", body: "Now $1.2", mint: "M", alertId: "a" })))
      .toEqual({ kind: "price_alert", title: "JUP is above $1", body: "Now $1.2", mint: "M", alertId: "a" });
    expect(parsePushPayload("not json")).toBeNull();
    expect(parsePushPayload(JSON.stringify({ kind: "other" }))).toBeNull();
    expect(parsePushPayload(undefined)).toBeNull();
  });

  it("resubscribes when the server key changed, then registers the subscription", async () => {
    const unsubscribe = vi.fn(async () => true);
    const newSub = { toJSON: () => ({ endpoint: "https://push/new", keys: { p256dh: "p", auth: "a" } }) };
    const reg = { pushManager: {
      getSubscription: async () => ({ options: { applicationServerKey: new Uint8Array([9, 9]).buffer }, unsubscribe }) as any,
      subscribe: vi.fn(async () => newSub as any),
    } };
    const api = vi.fn(async (_m: string, path: string) => (path === "/push/key" ? { publicKey: "AQID" } : { ok: true })) as any;
    await ensurePushSubscription(api, reg);
    expect(unsubscribe).toHaveBeenCalled();
    expect(reg.pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: new Uint8Array([1, 2, 3]) });
    expect(api).toHaveBeenLastCalledWith("PUT", "/push", { subscription: newSub.toJSON() });
  });
});
