import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testApp, MINT_A, MINT_B } from "./helpers.js";
import { LIMITS } from "../src/db.js";

describe("auth", () => {
  it("serves health and the VAPID key without a signature", async () => {
    const { app } = await testApp();
    expect((await app.request("/health")).status).toBe(200);
    expect(await (await app.request("/v1/push/key")).json()).toEqual({ publicKey: "BPUBLICKEY" });
  });

  it("rejects unsigned, tampered, stale and wrong-secret requests", async () => {
    const { app, call } = await testApp();
    expect((await app.request("/v1/alerts")).status).toBe(401);
    expect((await call("GET", "/v1/alerts", undefined, { tamper: true })).status).toBe(401);
    expect((await call("GET", "/v1/alerts", undefined, { ts: Date.now() - 60_000 })).status).toBe(401);
    expect((await call("GET", "/v1/alerts", undefined, { secret: "x".repeat(40) })).status).toBe(401);
    expect((await call("GET", "/v1/alerts", undefined, { install: "not-a-uuid" })).status).toBe(401);
    expect((await call("GET", "/v1/alerts")).status).toBe(200);
  });

  it("binds the signature to the body", async () => {
    const { app } = await testApp();
    const { sign } = await import("../src/auth.js");
    const { SECRET } = await import("./helpers.js");
    const id = randomUUID(); const ts = String(Date.now());
    const sig = sign(SECRET, ts, "POST", "/v1/alerts", id, JSON.stringify({ mint: MINT_A, ticker: "JUP", condition: "ABOVE", price: 1 }));
    const res = await app.request("/v1/alerts", {
      method: "POST",
      headers: { "x-qd-ts": ts, "x-qd-sig": sig, "x-qd-install": id },
      body: JSON.stringify({ mint: MINT_A, ticker: "JUP", condition: "ABOVE", price: 999 }),
    });
    expect(res.status).toBe(401);
  });
});

describe("alerts", () => {
  it("creates, lists, replaces and deletes", async () => {
    const { call } = await testApp();
    const c = await call("POST", "/v1/alerts", { mint: MINT_A, ticker: "JUP", condition: "ABOVE", price: 1.25 });
    expect(c.status).toBe(201);
    expect(c.json.alert).toMatchObject({ mint: MINT_A, ticker: "JUP", condition: "ABOVE", price: 1.25, triggered: false });

    const again = await call("POST", "/v1/alerts", { mint: MINT_A, ticker: "JUP", condition: "ABOVE", price: 2 });
    expect(again.json.alert.id).toBe(c.json.alert.id);
    const list = await call("GET", "/v1/alerts");
    expect(list.json.alerts).toHaveLength(1);
    expect(list.json.alerts[0].price).toBe(2);

    expect((await call("DELETE", `/v1/alerts/${c.json.alert.id}`)).status).toBe(200);
    expect((await call("GET", "/v1/alerts")).json.alerts).toHaveLength(0);
    expect((await call("DELETE", `/v1/alerts/${c.json.alert.id}`)).status).toBe(404);
  });

  it("keeps installs apart", async () => {
    const { call } = await testApp();
    const c = await call("POST", "/v1/alerts", { mint: MINT_A, ticker: "JUP", condition: "BELOW", price: 0.5 });
    const other = randomUUID();
    expect((await call("GET", "/v1/alerts", undefined, { install: other })).json.alerts).toHaveLength(0);
    expect((await call("DELETE", `/v1/alerts/${c.json.alert.id}`, undefined, { install: other })).status).toBe(404);
  });

  it("validates input", async () => {
    const { call } = await testApp();
    expect((await call("POST", "/v1/alerts", { mint: "bad", ticker: "X", condition: "ABOVE", price: 1 })).status).toBe(400);
    expect((await call("POST", "/v1/alerts", { mint: MINT_A, ticker: "X", condition: "SIDEWAYS", price: 1 })).status).toBe(400);
    expect((await call("POST", "/v1/alerts", { mint: MINT_A, ticker: "X", condition: "ABOVE", price: -1 })).status).toBe(400);
    expect((await call("POST", "/v1/alerts", { mint: MINT_A, ticker: "<script>", condition: "ABOVE", price: 1 })).json.alert.ticker).toBe("script");
  });

  it("enforces the per-install limit", async () => {
    const { db, call, install } = await testApp();
    const { installKey } = await import("../src/auth.js");
    const key = installKey(install);
    await call("GET", "/v1/alerts"); // creates the install row
    for (let i = 0; i < LIMITS.alertsPerInstall; i++) {
      await db.query(`INSERT INTO alerts (install_key, mint, ticker, condition, price) VALUES ($1, $2, 'T', 'ABOVE', 1)`,
        [key, `Mint${String(i).padStart(4, "0")}1111111111111111111111111111`]);
    }
    expect((await call("POST", "/v1/alerts", { mint: MINT_B, ticker: "X", condition: "ABOVE", price: 1 })).status).toBe(409);
  });
});

describe("watchlist + push + import", () => {
  it("adds, lists and removes watched tokens", async () => {
    const { call } = await testApp();
    expect((await call("POST", "/v1/watchlist", { mint: MINT_A, ticker: "JUP" })).status).toBe(201);
    await call("POST", "/v1/watchlist", { mint: MINT_A, ticker: "JUP" });
    expect((await call("GET", "/v1/watchlist")).json.items).toHaveLength(1);
    expect((await call("DELETE", `/v1/watchlist/${MINT_A}`)).status).toBe(200);
    expect((await call("GET", "/v1/watchlist")).json.items).toHaveLength(0);
  });

  it("stores and clears a push subscription", async () => {
    const { call, db, install } = await testApp();
    const { installKey } = await import("../src/auth.js");
    const { getPushSubscription } = await import("../src/db.js");
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "p", auth: "a" } };
    expect((await call("PUT", "/v1/push", { subscription: sub })).status).toBe(200);
    expect(await getPushSubscription(db, installKey(install))).toEqual(sub);
    expect((await call("PUT", "/v1/push", { subscription: { endpoint: "http://insecure" } })).status).toBe(400);
    await call("PUT", "/v1/push", { subscription: null });
    expect(await getPushSubscription(db, installKey(install))).toBeNull();
  });

  it("imports legacy local alerts and watchlist, skipping bad rows", async () => {
    const { call } = await testApp();
    const r = await call("POST", "/v1/import", {
      alerts: [
        { mint: MINT_A, ticker: "JUP", condition: "ABOVE", price: 1, triggered: true },
        { mint: "nope", ticker: "X", condition: "ABOVE", price: 1 },
      ],
      watchlist: [{ mint: MINT_B, ticker: "POPCAT" }],
    });
    expect(r.json).toEqual({ imported: 2, skipped: 1 });
    expect((await call("GET", "/v1/alerts")).json.alerts[0].triggered).toBe(false);
  });
});
