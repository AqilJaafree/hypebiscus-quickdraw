// Thin database layer over anything with `query(text, params)`: node-postgres
// in production, PGlite (in-process Postgres) in tests.

export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Database extends Sql {
  /** Runs fn inside one transaction on one connection. */
  tx<T>(fn: (q: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export type Condition = "ABOVE" | "BELOW";

export interface AlertRow {
  id: string;
  install_key: string;
  mint: string;
  ticker: string;
  condition: Condition;
  price: number;
  triggered: boolean;
  last_price: number | null;
  fired_at: string | null;
  created_at: string;
}

export interface WatchRow {
  mint: string;
  ticker: string;
  created_at: string;
}

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export const LIMITS = { alertsPerInstall: 50, watchPerInstall: 100 } as const;

// Additive, idempotent migrations. Append only; never edit an applied entry.
const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS installs (
     install_key   text PRIMARY KEY,
     push_sub      jsonb,
     created_at    timestamptz NOT NULL DEFAULT now(),
     last_seen_at  timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS alerts (
     id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     install_key  text NOT NULL REFERENCES installs(install_key) ON DELETE CASCADE,
     mint         text NOT NULL,
     ticker       text NOT NULL,
     condition    text NOT NULL CHECK (condition IN ('ABOVE','BELOW')),
     price        double precision NOT NULL CHECK (price > 0),
     triggered    boolean NOT NULL DEFAULT false,
     last_price   double precision,
     fired_at     timestamptz,
     created_at   timestamptz NOT NULL DEFAULT now(),
     UNIQUE (install_key, mint, condition)
   )`,
  `CREATE INDEX IF NOT EXISTS alerts_mint_idx ON alerts (mint)`,
  `CREATE TABLE IF NOT EXISTS watchlist (
     install_key  text NOT NULL REFERENCES installs(install_key) ON DELETE CASCADE,
     mint         text NOT NULL,
     ticker       text NOT NULL,
     created_at   timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (install_key, mint)
   )`,
];

export async function migrate(db: Sql): Promise<void> {
  for (const m of MIGRATIONS) await db.query(m);
}

export async function touchInstall(db: Sql, key: string): Promise<void> {
  await db.query(
    `INSERT INTO installs (install_key) VALUES ($1)
     ON CONFLICT (install_key) DO UPDATE SET last_seen_at = now()`,
    [key],
  );
}

export async function setPushSubscription(db: Sql, key: string, sub: PushSubscriptionJSON | null): Promise<void> {
  await db.query(`UPDATE installs SET push_sub = $2 WHERE install_key = $1`, [key, sub ? JSON.stringify(sub) : null]);
}

export async function getPushSubscription(db: Sql, key: string): Promise<PushSubscriptionJSON | null> {
  const { rows } = await db.query<{ push_sub: PushSubscriptionJSON | string | null }>(
    `SELECT push_sub FROM installs WHERE install_key = $1`, [key]);
  const v = rows[0]?.push_sub ?? null;
  return typeof v === "string" ? JSON.parse(v) as PushSubscriptionJSON : v;
}

// ── alerts ──────────────────────────────────────────────────────────────────

const ALERT_COLS = `id, install_key, mint, ticker, condition, price, triggered, last_price, fired_at, created_at`;

export async function listAlerts(db: Sql, key: string): Promise<AlertRow[]> {
  const { rows } = await db.query<AlertRow>(
    `SELECT ${ALERT_COLS} FROM alerts WHERE install_key = $1 ORDER BY created_at`, [key]);
  return rows;
}

export class LimitError extends Error {}

/** Creating the same mint + condition again replaces the price and re-arms it. */
export async function upsertAlert(
  db: Database, key: string, a: { mint: string; ticker: string; condition: Condition; price: number },
): Promise<AlertRow> {
  return db.tx(async (q) => {
    const { rows: c } = await q.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM alerts WHERE install_key = $1 AND NOT (mint = $2 AND condition = $3)`,
      [key, a.mint, a.condition]);
    if ((c[0]?.n ?? 0) >= LIMITS.alertsPerInstall) throw new LimitError(`At most ${LIMITS.alertsPerInstall} alerts`);
    const { rows } = await q.query<AlertRow>(
      `INSERT INTO alerts (install_key, mint, ticker, condition, price)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (install_key, mint, condition)
       DO UPDATE SET price = EXCLUDED.price, ticker = EXCLUDED.ticker, triggered = false, fired_at = NULL
       RETURNING ${ALERT_COLS}`,
      [key, a.mint, a.ticker, a.condition, a.price]);
    return rows[0];
  });
}

export async function deleteAlert(db: Sql, key: string, id: string): Promise<boolean> {
  const { rows } = await db.query(`DELETE FROM alerts WHERE install_key = $1 AND id = $2 RETURNING id`, [key, id]);
  return rows.length > 0;
}

// ── watchlist ───────────────────────────────────────────────────────────────

export async function listWatch(db: Sql, key: string): Promise<WatchRow[]> {
  const { rows } = await db.query<WatchRow>(
    `SELECT mint, ticker, created_at FROM watchlist WHERE install_key = $1 ORDER BY created_at`, [key]);
  return rows;
}

export async function addWatch(db: Database, key: string, w: { mint: string; ticker: string }): Promise<WatchRow> {
  return db.tx(async (q) => {
    const { rows: c } = await q.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM watchlist WHERE install_key = $1 AND mint <> $2`, [key, w.mint]);
    if ((c[0]?.n ?? 0) >= LIMITS.watchPerInstall) throw new LimitError(`At most ${LIMITS.watchPerInstall} watched tokens`);
    const { rows } = await q.query<WatchRow>(
      `INSERT INTO watchlist (install_key, mint, ticker) VALUES ($1, $2, $3)
       ON CONFLICT (install_key, mint) DO UPDATE SET ticker = EXCLUDED.ticker
       RETURNING mint, ticker, created_at`,
      [key, w.mint, w.ticker]);
    return rows[0];
  });
}

export async function removeWatch(db: Sql, key: string, mint: string): Promise<boolean> {
  const { rows } = await db.query(`DELETE FROM watchlist WHERE install_key = $1 AND mint = $2 RETURNING mint`, [key, mint]);
  return rows.length > 0;
}
