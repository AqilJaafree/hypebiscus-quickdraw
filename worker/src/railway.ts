// Proxy for the stateful Railway service (alerts, watchlist, Web Push).
//
// Clients never call Railway directly: the extension calls these Worker
// routes with its usual bearer auth plus an X-QD-Install header, and the
// Worker re-signs the request for Railway with RAILWAY_INTERNAL_SECRET.
// `canonical()` must match railway/src/auth.ts.

const INSTALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Worker path → Railway path. Anything else under these prefixes is a 404.
const ROUTES: Array<[RegExp, string[]]> = [
  [/^\/alerts$/, ["GET", "POST"]],
  [/^\/alerts\/[0-9a-f-]{36}$/, ["DELETE"]],
  [/^\/watchlist$/, ["GET", "POST"]],
  [/^\/watchlist\/[1-9A-HJ-NP-Za-km-z]{32,44}$/, ["DELETE"]],
  [/^\/push$/, ["PUT"]],
  [/^\/push\/key$/, ["GET"]],
  [/^\/import$/, ["POST"]],
];

export function isRailwayPath(pathname: string): boolean {
  return /^\/(alerts|watchlist|push|import)(\/|$)/.test(pathname);
}

const hex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function sha256Hex(data: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data)));
}

export async function signRailway(secret: string, ts: string, method: string, pathWithQuery: string, installId: string, body: string): Promise<string> {
  const canonical = [ts, method.toUpperCase(), pathWithQuery, installId, await sha256Hex(body)].join("\n");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(canonical)));
}

export interface RailwayEnv {
  RAILWAY_URL?: string;
  RAILWAY_INTERNAL_SECRET?: string;
}

const MAX_BODY = 16 * 1024;

export async function proxyToRailway(req: Request, url: URL, env: RailwayEnv): Promise<Response> {
  const jsonResp = (data: unknown, status: number) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });

  if (!env.RAILWAY_URL || !env.RAILWAY_INTERNAL_SECRET) return jsonResp({ error: "Alerts service not configured" }, 503);

  const route = ROUTES.find(([re]) => re.test(url.pathname));
  if (!route) return jsonResp({ error: "Not found" }, 404);
  if (!route[1].includes(req.method)) return jsonResp({ error: "Method not allowed" }, 405);

  const installId = req.headers.get("X-QD-Install") ?? "";
  if (!INSTALL_ID.test(installId)) return jsonResp({ error: "X-QD-Install header required" }, 400);

  const body = req.method === "GET" || req.method === "DELETE" ? "" : await req.text();
  if (body.length > MAX_BODY) return jsonResp({ error: "Body too large" }, 413);

  const path = `/v1${url.pathname}`;
  const ts = String(Date.now());
  const sig = await signRailway(env.RAILWAY_INTERNAL_SECRET, ts, req.method, path, installId, body);

  let upstream: Response;
  try {
    upstream = await fetch(new URL(path, env.RAILWAY_URL), {
      method: req.method,
      headers: { "Content-Type": "application/json", "X-QD-Ts": ts, "X-QD-Sig": sig, "X-QD-Install": installId },
      body: body || undefined,
    });
  } catch {
    return jsonResp({ error: "Alerts service unreachable" }, 502);
  }
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
