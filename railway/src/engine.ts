// Alert engine: one loop checks every install's price alerts with batched
// Jupiter price calls and sends Web Push when one crosses.

import type { AlertRow, Condition, Database, PushSubscriptionJSON } from "./db.js";

export const JUPITER_PRICE = "https://lite-api.jup.ag/price/v3";
const PRICE_CHUNK = 50;
// Any number; only needs to be the same in every replica.
const ENGINE_LOCK_ID = 7_301_993;

export function shouldFire(a: { condition: Condition; price: number; triggered: boolean }, now: number): boolean {
  if (a.triggered) return false;
  return a.condition === "ABOVE" ? now > a.price : now < a.price;
}

/** A fired alert re-arms once the price is back on the other side of its line. */
export function shouldRearm(a: { condition: Condition; price: number; triggered: boolean }, now: number): boolean {
  if (!a.triggered) return false;
  return a.condition === "ABOVE" ? now <= a.price : now >= a.price;
}

export function fmtPrice(n: number): string {
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `$${n.toPrecision(4)}`;
}

export interface PushMessage {
  kind: "price_alert";
  title: string;
  body: string;
  mint: string;
  alertId: string;
}

export function alertMessage(a: AlertRow, now: number): PushMessage {
  const dir = a.condition === "ABOVE" ? "above" : "below";
  return {
    kind: "price_alert",
    title: `${a.ticker} is ${dir} ${fmtPrice(a.price)}`,
    body: `Now ${fmtPrice(now)}`,
    mint: a.mint,
    alertId: a.id,
  };
}

export type SendPush = (sub: PushSubscriptionJSON, msg: PushMessage) => Promise<"sent" | "gone" | "failed">;

export async function fetchPrices(mints: string[], fetchFn: typeof fetch = fetch): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < mints.length; i += PRICE_CHUNK) {
    const ids = mints.slice(i, i + PRICE_CHUNK);
    try {
      const r = await fetchFn(`${JUPITER_PRICE}?ids=${ids.join(",")}`);
      if (!r.ok) continue;
      const data = await r.json() as Record<string, { usdPrice?: number } | null>;
      for (const [mint, p] of Object.entries(data)) {
        if (p && typeof p.usdPrice === "number" && p.usdPrice > 0) out.set(mint, p.usdPrice);
      }
    } catch { /* skip this chunk; next tick retries */ }
  }
  return out;
}

export interface TickResult { skipped?: "locked"; checked: number; fired: number; rearmed: number; pushed: number; gone: number }

export async function tick(db: Database, sendPush: SendPush, fetchFn: typeof fetch = fetch): Promise<TickResult> {
  return db.tx(async (q) => {
    const { rows: lock } = await q.query<{ ok: boolean }>(`SELECT pg_try_advisory_xact_lock($1) AS ok`, [ENGINE_LOCK_ID]);
    if (!lock[0]?.ok) return { skipped: "locked", checked: 0, fired: 0, rearmed: 0, pushed: 0, gone: 0 };

    const { rows: alerts } = await q.query<AlertRow & { push_sub: PushSubscriptionJSON | string | null }>(
      `SELECT a.id, a.install_key, a.mint, a.ticker, a.condition, a.price, a.triggered,
              a.last_price, a.fired_at, a.created_at, i.push_sub
         FROM alerts a JOIN installs i USING (install_key)`);
    const result: TickResult = { checked: 0, fired: 0, rearmed: 0, pushed: 0, gone: 0 };
    if (!alerts.length) return result;

    const prices = await fetchPrices([...new Set(alerts.map(a => a.mint))], fetchFn);
    const goneInstalls = new Set<string>();

    for (const a of alerts) {
      const now = prices.get(a.mint);
      if (now === undefined) continue;
      result.checked++;
      if (shouldFire(a, now)) {
        await q.query(`UPDATE alerts SET triggered = true, fired_at = now(), last_price = $2 WHERE id = $1`, [a.id, now]);
        result.fired++;
        const sub = typeof a.push_sub === "string" ? JSON.parse(a.push_sub) as PushSubscriptionJSON : a.push_sub;
        if (sub && !goneInstalls.has(a.install_key)) {
          const r = await sendPush(sub, alertMessage(a, now));
          if (r === "sent") result.pushed++;
          if (r === "gone") goneInstalls.add(a.install_key);
        }
      } else if (shouldRearm(a, now)) {
        await q.query(`UPDATE alerts SET triggered = false, last_price = $2 WHERE id = $1`, [a.id, now]);
        result.rearmed++;
      } else {
        await q.query(`UPDATE alerts SET last_price = $2 WHERE id = $1`, [a.id, now]);
      }
    }

    for (const key of goneInstalls) {
      await q.query(`UPDATE installs SET push_sub = NULL WHERE install_key = $1`, [key]);
      result.gone++;
    }
    return result;
  });
}

/** Runs tick() on an interval; never overlaps itself. */
export function startEngine(db: Database, sendPush: SendPush, intervalMs: number, log = console): () => void {
  let running = false;
  let stopped = false;
  const run = async (): Promise<void> => {
    if (running || stopped) return;
    running = true;
    try {
      const r = await tick(db, sendPush);
      if (r.fired || r.rearmed || r.gone) log.info(`engine: ${JSON.stringify(r)}`);
    } catch (e) {
      log.error("engine tick failed:", e instanceof Error ? e.message : e);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(run, intervalMs);
  void run();
  return () => { stopped = true; clearInterval(timer); };
}
