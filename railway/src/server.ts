import { serve } from "@hono/node-server";
import pg from "pg";
import { createApp } from "./app.js";
import { migrate, type Database, type Sql } from "./db.js";
import { startEngine } from "./engine.js";
import { webPushSender } from "./push.js";

function required(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`Missing env ${name}`); process.exit(1); }
  return v;
}

const DATABASE_URL = required("DATABASE_URL");
const SECRET = required("RAILWAY_INTERNAL_SECRET");
const VAPID = {
  publicKey: required("VAPID_PUBLIC_KEY"),
  privateKey: required("VAPID_PRIVATE_KEY"),
  subject: process.env.VAPID_SUBJECT ?? "mailto:alerts@quickdraw.invalid",
};
const PORT = Number(process.env.PORT ?? 3000);
const INTERVAL = Number(process.env.ALERT_INTERVAL_MS ?? 15_000);

if (SECRET.length < 32) { console.error("RAILWAY_INTERNAL_SECRET must be at least 32 characters"); process.exit(1); }

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
// node-postgres returns double precision as number already; keep numerics as numbers too.
pg.types.setTypeParser(1700, (v) => Number(v));

const db: Database = {
  query: (text, params) => pool.query(text, params) as never,
  async tx(fn) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const out = await fn(client as unknown as Sql);
      await client.query("COMMIT");
      return out;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  },
  close: () => pool.end(),
};

await migrate(db);
const app = createApp({ db, secret: SECRET, vapidPublicKey: VAPID.publicKey });
const server = serve({ fetch: app.fetch, port: PORT }, (info) => console.log(`quickdraw-railway listening on :${info.port}`));
const stopEngine = startEngine(db, webPushSender(VAPID), INTERVAL);

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    stopEngine();
    server.close();
    void db.close().finally(() => process.exit(0));
  });
}
