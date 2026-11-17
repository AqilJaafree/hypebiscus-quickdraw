import { Hono } from "hono";
import { verify, installKey } from "./auth.js";
import {
  type AlertRow, type Condition, type Database, type PushSubscriptionJSON,
  LimitError, addWatch, deleteAlert, listAlerts, listWatch, removeWatch,
  setPushSubscription, touchInstall, upsertAlert, LIMITS,
} from "./db.js";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface AppDeps {
  db: Database;
  secret: string;
  vapidPublicKey: string;
  now?: () => number;
}

type Vars = { installKey: string; body: unknown };

class BadRequest extends Error {}

function cleanTicker(v: unknown): string {
  const t = typeof v === "string" ? v.replace(/[^\p{L}\p{N}$._-]/gu, "").slice(0, 16) : "";
  if (!t) throw new BadRequest("ticker required");
  return t;
}

function parseAlert(b: unknown): { mint: string; ticker: string; condition: Condition; price: number } {
  const o = (b ?? {}) as Record<string, unknown>;
  if (typeof o.mint !== "string" || !BASE58.test(o.mint)) throw new BadRequest("valid mint required");
  if (o.condition !== "ABOVE" && o.condition !== "BELOW") throw new BadRequest("condition must be ABOVE or BELOW");
  const price = Number(o.price);
  if (!Number.isFinite(price) || price <= 0 || price > 1e12) throw new BadRequest("price must be a positive number");
  return { mint: o.mint, ticker: cleanTicker(o.ticker), condition: o.condition, price };
}

function parseWatch(b: unknown): { mint: string; ticker: string } {
  const o = (b ?? {}) as Record<string, unknown>;
  if (typeof o.mint !== "string" || !BASE58.test(o.mint)) throw new BadRequest("valid mint required");
  return { mint: o.mint, ticker: cleanTicker(o.ticker) };
}

function parseSubscription(b: unknown): PushSubscriptionJSON | null {
  const s = (b as { subscription?: unknown } | null)?.subscription;
  if (s === null) return null;
  const o = s as Partial<PushSubscriptionJSON> | undefined;
  if (!o || typeof o.endpoint !== "string" || !o.endpoint.startsWith("https://")
    || typeof o.keys?.p256dh !== "string" || typeof o.keys?.auth !== "string") {
    throw new BadRequest("subscription must be a PushSubscription JSON or null");
  }
  return { endpoint: o.endpoint, keys: { p256dh: o.keys.p256dh, auth: o.keys.auth } };
}

export const alertDTO = (a: AlertRow) => ({
  id: a.id, mint: a.mint, ticker: a.ticker, condition: a.condition, price: a.price,
  triggered: a.triggered, lastPrice: a.last_price, firedAt: a.fired_at,
});

export function createApp(deps: AppDeps): Hono<{ Variables: Vars }> {
  const { db, secret } = deps;
  const now = deps.now ?? Date.now;
  const app = new Hono<{ Variables: Vars }>();

  app.get("/health", async (c) => {
    try { await db.query("SELECT 1"); return c.json({ ok: true }); }
    catch { return c.json({ ok: false }, 503); }
  });

  // The VAPID public key is public by design; the extension needs it to subscribe.
  app.get("/v1/push/key", (c) => c.json({ publicKey: deps.vapidPublicKey }));

  // Everything else under /v1 must be signed by the Worker.
  app.use("/v1/*", async (c, next) => {
    const url = new URL(c.req.url);
    const raw = c.req.method === "GET" || c.req.method === "DELETE" ? "" : await c.req.text();
    const res = verify(secret, {
      ts: c.req.header("x-qd-ts"), sig: c.req.header("x-qd-sig"), install: c.req.header("x-qd-install"),
    }, c.req.method, url.pathname + url.search, raw, now());
    if (!res.ok) return c.json({ error: res.reason }, 401);
    let body: unknown = null;
    if (raw) {
      try { body = JSON.parse(raw); } catch { return c.json({ error: "invalid JSON" }, 400); }
    }
    const key = installKey(c.req.header("x-qd-install")!);
    await touchInstall(db, key);
    c.set("installKey", key);
    c.set("body", body);
    await next();
  });

  app.onError((e, c) => {
    if (e instanceof BadRequest) return c.json({ error: e.message }, 400);
    if (e instanceof LimitError) return c.json({ error: e.message }, 409);
    console.error("unhandled:", e);
    return c.json({ error: "internal error" }, 500);
  });

  app.put("/v1/push", async (c) => {
    await setPushSubscription(db, c.var.installKey, parseSubscription(c.var.body));
    return c.json({ ok: true });
  });

  app.get("/v1/alerts", async (c) => c.json({ alerts: (await listAlerts(db, c.var.installKey)).map(alertDTO) }));

  app.post("/v1/alerts", async (c) => {
    const row = await upsertAlert(db, c.var.installKey, parseAlert(c.var.body));
    return c.json({ alert: alertDTO(row) }, 201);
  });

  app.delete("/v1/alerts/:id", async (c) => {
    const id = c.req.param("id");
    if (!UUID.test(id)) return c.json({ error: "invalid id" }, 400);
    const ok = await deleteAlert(db, c.var.installKey, id);
    return ok ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
  });

  app.get("/v1/watchlist", async (c) => c.json({ items: await listWatch(db, c.var.installKey) }));

  app.post("/v1/watchlist", async (c) => {
    const row = await addWatch(db, c.var.installKey, parseWatch(c.var.body));
    return c.json({ item: row }, 201);
  });

  app.delete("/v1/watchlist/:mint", async (c) => {
    const mint = c.req.param("mint");
    if (!BASE58.test(mint)) return c.json({ error: "invalid mint" }, 400);
    const ok = await removeWatch(db, c.var.installKey, mint);
    return ok ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
  });

  // One-time move of alerts + watchlist kept in chrome.storage by older builds.
  app.post("/v1/import", async (c) => {
    const b = (c.var.body ?? {}) as { alerts?: unknown[]; watchlist?: unknown[] };
    const alerts = Array.isArray(b.alerts) ? b.alerts.slice(0, LIMITS.alertsPerInstall) : [];
    const watch = Array.isArray(b.watchlist) ? b.watchlist.slice(0, LIMITS.watchPerInstall) : [];
    let imported = 0, skipped = 0;
    for (const a of alerts) {
      try { await upsertAlert(db, c.var.installKey, parseAlert(a)); imported++; } catch { skipped++; }
    }
    for (const w of watch) {
      try { await addWatch(db, c.var.installKey, parseWatch(w)); imported++; } catch { skipped++; }
    }
    return c.json({ imported, skipped });
  });

  return app;
}
