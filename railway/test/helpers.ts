import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { sign } from "../src/auth.js";
import { migrate, type Database, type Sql } from "../src/db.js";

export const SECRET = "test-secret-0123456789abcdef0123456789abcdef";
export const MINT_A = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
export const MINT_B = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr";

export async function testDb(): Promise<Database> {
  const pg = new PGlite();
  const db: Database = {
    query: (text, params) => pg.query(text, params) as never,
    tx: (fn) => pg.transaction((tx) => fn(tx as unknown as Sql)),
    close: () => pg.close(),
  };
  await migrate(db);
  return db;
}

export async function testApp() {
  const db = await testDb();
  const app = createApp({ db, secret: SECRET, vapidPublicKey: "BPUBLICKEY" });
  const install = randomUUID();

  async function call(method: string, path: string, body?: unknown, opts: { install?: string; ts?: number; secret?: string; tamper?: boolean } = {}) {
    const raw = body === undefined ? "" : JSON.stringify(body);
    const ts = String(opts.ts ?? Date.now());
    const id = opts.install ?? install;
    let sig = sign(opts.secret ?? SECRET, ts, method, path, id, raw);
    if (opts.tamper) sig = sig.replace(/^./, (ch) => (ch === "a" ? "b" : "a"));
    const res = await app.request(path, {
      method,
      headers: { "content-type": "application/json", "x-qd-ts": ts, "x-qd-sig": sig, "x-qd-install": id },
      body: raw || undefined,
    });
    return { status: res.status, json: await res.json() as any };
  }

  return { db, app, install, call };
}
