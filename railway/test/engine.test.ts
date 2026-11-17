import { describe, it, expect } from "vitest";
import { testApp, MINT_A, MINT_B } from "./helpers.js";
import { shouldFire, shouldRearm, tick, fmtPrice, type PushMessage, type SendPush } from "../src/engine.js";
import type { PushSubscriptionJSON } from "../src/db.js";

const SUB = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "p", auth: "a" } };

function priceFetch(prices: Record<string, number>): typeof fetch {
  return (async (url: string) => {
    const ids = new URL(url).searchParams.get("ids")!.split(",");
    const body = Object.fromEntries(ids.filter(id => id in prices).map(id => [id, { usdPrice: prices[id] }]));
    return new Response(JSON.stringify(body));
  }) as typeof fetch;
}

function recorder(result: "sent" | "gone" | "failed" = "sent") {
  const sent: Array<{ sub: PushSubscriptionJSON; msg: PushMessage }> = [];
  const send: SendPush = async (sub, msg) => { sent.push({ sub, msg }); return result; };
  return { sent, send };
}

describe("rules", () => {
  it("fires once across the line and re-arms when back", () => {
    const a = { condition: "ABOVE" as const, price: 1, triggered: false };
    expect(shouldFire(a, 1)).toBe(false);
    expect(shouldFire(a, 1.01)).toBe(true);
    expect(shouldFire({ ...a, triggered: true }, 2)).toBe(false);
    expect(shouldRearm({ ...a, triggered: true }, 0.99)).toBe(true);
    const b = { condition: "BELOW" as const, price: 1, triggered: false };
    expect(shouldFire(b, 0.5)).toBe(true);
    expect(shouldRearm({ ...b, triggered: true }, 1)).toBe(true);
  });

  it("formats prices for notifications", () => {
    expect(fmtPrice(1234.567)).toBe("$1,234.57");
    expect(fmtPrice(0.0001234)).toBe("$0.0001234");
  });
});

describe("tick", () => {
  it("fires, pushes once, and re-arms", async () => {
    const { db, call } = await testApp();
    await call("PUT", "/v1/push", { subscription: SUB });
    await call("POST", "/v1/alerts", { mint: MINT_A, ticker: "JUP", condition: "ABOVE", price: 1 });
    await call("POST", "/v1/alerts", { mint: MINT_B, ticker: "POPCAT", condition: "BELOW", price: 0.3 });

    const r1 = recorder();
    const t1 = await tick(db, r1.send, priceFetch({ [MINT_A]: 1.2, [MINT_B]: 0.4 }));
    expect(t1).toMatchObject({ checked: 2, fired: 1, pushed: 1 });
    expect(r1.sent[0].sub).toEqual(SUB);
    expect(r1.sent[0].msg).toMatchObject({ kind: "price_alert", title: "JUP is above $1", body: "Now $1.2", mint: MINT_A });

    const r2 = recorder();
    expect(await tick(db, r2.send, priceFetch({ [MINT_A]: 1.5, [MINT_B]: 0.4 }))).toMatchObject({ fired: 0 });
    expect(r2.sent).toHaveLength(0);

    expect(await tick(db, r2.send, priceFetch({ [MINT_A]: 0.9, [MINT_B]: 0.4 }))).toMatchObject({ rearmed: 1 });
    expect(await tick(db, r2.send, priceFetch({ [MINT_A]: 1.1, [MINT_B]: 0.4 }))).toMatchObject({ fired: 1, pushed: 1 });

    const alerts = (await call("GET", "/v1/alerts")).json.alerts;
    expect(alerts.find((a: any) => a.mint === MINT_A).lastPrice).toBe(1.1);
  });

  it("marks fired even without a push subscription", async () => {
    const { db, call } = await testApp();
    await call("POST", "/v1/alerts", { mint: MINT_A, ticker: "JUP", condition: "ABOVE", price: 1 });
    const r = recorder();
    expect(await tick(db, r.send, priceFetch({ [MINT_A]: 2 }))).toMatchObject({ fired: 1, pushed: 0 });
    expect((await call("GET", "/v1/alerts")).json.alerts[0].triggered).toBe(true);
  });

  it("drops a subscription the push service says is gone", async () => {
    const { db, call, install } = await testApp();
    const { installKey } = await import("../src/auth.js");
    const { getPushSubscription } = await import("../src/db.js");
    await call("PUT", "/v1/push", { subscription: SUB });
    await call("POST", "/v1/alerts", { mint: MINT_A, ticker: "JUP", condition: "ABOVE", price: 1 });
    expect(await tick(db, recorder("gone").send, priceFetch({ [MINT_A]: 2 }))).toMatchObject({ fired: 1, gone: 1 });
    expect(await getPushSubscription(db, installKey(install))).toBeNull();
  });

  it("skips tokens with no price and survives a failing price API", async () => {
    const { db, call } = await testApp();
    await call("POST", "/v1/alerts", { mint: MINT_A, ticker: "JUP", condition: "ABOVE", price: 1 });
    expect(await tick(db, recorder().send, priceFetch({}))).toMatchObject({ checked: 0, fired: 0 });
    const failing = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
    expect(await tick(db, recorder().send, failing)).toMatchObject({ checked: 0 });
  });
});
