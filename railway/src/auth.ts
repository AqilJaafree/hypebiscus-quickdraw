// Worker → Railway request signing.
//
// The Worker is the only caller. It signs every request with a shared secret
// (RAILWAY_INTERNAL_SECRET); this service rejects anything unsigned, tampered
// with, or older than MAX_SKEW_MS. The Worker has a copy of `canonical()` —
// keep the two in sync (worker/src/railway.ts).

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const MAX_SKEW_MS = 30_000;
const INSTALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const sha256Hex = (data: string): string => createHash("sha256").update(data).digest("hex");

export function canonical(ts: string, method: string, pathWithQuery: string, installId: string, body: string): string {
  return [ts, method.toUpperCase(), pathWithQuery, installId, sha256Hex(body)].join("\n");
}

export function sign(secret: string, ts: string, method: string, pathWithQuery: string, installId: string, body: string): string {
  return createHmac("sha256", secret).update(canonical(ts, method, pathWithQuery, installId, body)).digest("hex");
}

export function isInstallId(v: string | undefined | null): v is string {
  return !!v && INSTALL_ID.test(v);
}

/** The DB never stores the raw install ID, which works like a password. */
export const installKey = (installId: string): string => sha256Hex(`qd-install:${installId}`);

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export function verify(
  secret: string,
  headers: { ts?: string | null; sig?: string | null; install?: string | null },
  method: string,
  pathWithQuery: string,
  body: string,
  now = Date.now(),
): VerifyResult {
  const { ts, sig, install } = headers;
  if (!ts || !sig) return { ok: false, reason: "missing signature" };
  if (!isInstallId(install)) return { ok: false, reason: "missing or invalid install id" };
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(now - t) > MAX_SKEW_MS) return { ok: false, reason: "stale request" };
  const expected = Buffer.from(sign(secret, ts, method, pathWithQuery, install, body), "hex");
  const given = Buffer.from(sig, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "bad signature" };
  return { ok: true };
}
