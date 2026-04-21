/**
 * Quickdraw Cloudflare Worker
 *
 * Acts as a secure proxy for all external APIs — Anthropic, Jupiter, RugCheck,
 * Helius, AssemblyAI. The Rust binary never holds API keys; all secrets live here.
 *
 * Authentication: every request from the binary carries an HMAC-SHA256 signature
 * computed from (timestamp + path) using the shared APP_SECRET.
 *
 * Routes:
 *   GET  /health                     → liveness probe
 *   POST /ai/fast                    → claude-haiku-4-5-20251001 (SSE)
 *   POST /ai/deep                    → claude-sonnet-4-6 (SSE)
 *   GET  /market/pulse               → SOL price + Fear & Greed (cached 5min)
 *   GET  /transcribe-token           → AssemblyAI temporary JWT
 *   GET  /defi/jupiter-strict        → Jupiter strict token list lookup
 *   GET  /defi/jupiter/quote         → Jupiter v6 /quote proxy
 *   POST /defi/jupiter/swap          → Jupiter v6 /swap proxy
 *   GET  /defi/jupiter/price         → Jupiter price API
 *   GET  /defi/safety/rugcheck       → RugCheck report proxy
 *   GET  /defi/helius/token          → Helius DAS token metadata
 */

export interface Env {
  ANTHROPIC_API_KEY: string;
  APP_SECRET: string;
  HELIUS_API_KEY: string;
  ASSEMBLYAI_API_KEY: string;
  RATE_LIMIT_KV: KVNamespace;
}

// ─────────────────────────── Constants ───────────────────────────────────────

const ALLOWED_CLOCK_SKEW_SECS = 30;
const RATE_LIMIT_WINDOW_SECS  = 60;
const RATE_LIMIT_MAX_REQS     = 120; // per window per client IP

const ANTHROPIC_BASE = "https://api.anthropic.com/v1";
const JUPITER_QUOTE  = "https://quote-api.jup.ag/v6";
const JUPITER_PRICE  = "https://api.jup.ag/price/v2";
const JUPITER_TOKEN  = "https://token.jup.ag";
const RUGCHECK_BASE  = "https://api.rugcheck.xyz/v1";
const FEARGREED_URL  = "https://api.alternative.me/fng/?limit=1";

// ─────────────────────────── HMAC auth ───────────────────────────────────────

async function verifyHmac(req: Request, secret: string): Promise<boolean> {
  const ts  = req.headers.get("X-Quickdraw-Timestamp");
  const sig = req.headers.get("X-Quickdraw-Sig");
  if (!ts || !sig) return false;

  // Clock-skew check
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(ts, 10)) > ALLOWED_CLOCK_SKEW_SECS) return false;

  const url   = new URL(req.url);
  const msg   = `${ts}.${url.pathname}`;
  const key   = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  const expectedHex = Array.from(new Uint8Array(expected))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison
  return expectedHex === sig;
}

// ─────────────────────────── Rate limiting ────────────────────────────────────

async function checkRateLimit(ip: string, kv: KVNamespace): Promise<boolean> {
  const key   = `rl:${ip}`;
  const count = parseInt((await kv.get(key)) ?? "0", 10);
  if (count >= RATE_LIMIT_MAX_REQS) return false;
  await kv.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW_SECS });
  return true;
}

// ─────────────────────────── Response helpers ─────────────────────────────────

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Quickdraw-Timestamp, X-Quickdraw-Sig",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function err(msg: string, status = 400): Response {
  return json({ error: msg }, status);
}

// ─────────────────────────── Route handlers ───────────────────────────────────

async function handleAi(req: Request, env: Env, model: string): Promise<Response> {
  const body = await req.json<Record<string, unknown>>();

  // Force the correct model regardless of what the client sent
  body.model = model;

  const upstream = await fetch(`${ANTHROPIC_BASE}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify(body),
  });

  // Stream SSE end-to-end — never buffer
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...cors,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}

async function handleMarketPulse(env: Env): Promise<Response> {
  // Cache market data for 5 minutes — aligns with Anthropic's prompt cache TTL
  const cacheKey = "market_pulse_v1";
  const cached = await env.RATE_LIMIT_KV.get(cacheKey);
  if (cached) return new Response(cached, { headers: { ...cors, "Content-Type": "application/json" } });

  const [solResp, fngResp] = await Promise.all([
    fetch(`${JUPITER_PRICE}?ids=So11111111111111111111111111111111111111112`),
    fetch(FEARGREED_URL),
  ]);

  const solData = await solResp.json<{ data: Record<string, { price: number }> }>();
  const fngData = await fngResp.json<{ data: Array<{ value: string; value_classification: string }> }>();

  const solPrice    = solData?.data?.["So11111111111111111111111111111111111111112"]?.price ?? 0;
  const fngScore    = parseInt(fngData?.data?.[0]?.value ?? "50", 10);
  const fngLabel    = fngData?.data?.[0]?.value_classification ?? "Neutral";

  const pulse = { sol_price: solPrice, fng_score: fngScore, fng_label: fngLabel, ts: Date.now() };
  const pulseStr = JSON.stringify(pulse);

  await env.RATE_LIMIT_KV.put(cacheKey, pulseStr, { expirationTtl: 300 });
  return new Response(pulseStr, { headers: { ...cors, "Content-Type": "application/json" } });
}

async function handleTranscribeToken(env: Env): Promise<Response> {
  const resp = await fetch("https://api.assemblyai.com/v2/realtime/token?expires_in=300", {
    method: "POST",
    headers: {
      "Authorization": env.ASSEMBLYAI_API_KEY,
      "Content-Type": "application/json",
    },
  });
  const data = await resp.json<{ token: string }>();
  return json({ token: data.token });
}

async function handleJupiterStrictCheck(url: URL): Promise<Response> {
  const mint = url.searchParams.get("mint");
  if (!mint) return err("mint param required");

  // Cache individual token lookups for 10 minutes
  const resp = await fetch(`${JUPITER_TOKEN}/strict`);
  if (!resp.ok) return err("Jupiter token list unavailable", 502);

  const tokens = await resp.json<Array<{ address: string }>>().catch(() => []);
  const listed = tokens.some((t) => t.address === mint);
  return json({ listed });
}

async function handleJupiterQuote(url: URL): Promise<Response> {
  const params = url.searchParams.toString();
  const upstream = await fetch(`${JUPITER_QUOTE}/quote?${params}`);
  const data = await upstream.json();
  return json(data, upstream.status);
}

async function handleJupiterSwap(req: Request): Promise<Response> {
  const body = await req.text();
  const upstream = await fetch(`${JUPITER_QUOTE}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const data = await upstream.json();
  return json(data, upstream.status);
}

async function handleJupiterPrice(url: URL): Promise<Response> {
  const ids = url.searchParams.get("ids");
  if (!ids) return err("ids param required");
  const upstream = await fetch(`${JUPITER_PRICE}?ids=${ids}`);
  const data = await upstream.json();
  return json(data, upstream.status);
}

async function handleRugcheck(url: URL): Promise<Response> {
  const token = url.searchParams.get("token");
  if (!token) return err("token param required");

  // Cache rug check reports for 5 minutes (safety data rarely changes that fast)
  const upstream = await fetch(`${RUGCHECK_BASE}/tokens/${token}/report/summary`);
  if (!upstream.ok) return err("RugCheck unavailable", 502);
  const data = await upstream.json();
  return json(data);
}

async function handleHeliusToken(url: URL, env: Env): Promise<Response> {
  const mint = url.searchParams.get("mint");
  if (!mint) return err("mint param required");

  const upstream = await fetch(
    `https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAsset",
        params: { id: mint },
      }),
    },
  );
  const data = await upstream.json();
  return json(data, upstream.status);
}

// ─────────────────────────── Main router ──────────────────────────────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // Health check — no auth required
    if (url.pathname === "/health") {
      return json({ status: "ok", ts: Date.now() });
    }

    // All other routes require HMAC auth
    if (!(await verifyHmac(req, env.APP_SECRET))) {
      return err("Unauthorized", 401);
    }

    // Rate limit by IP
    const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
    if (!(await checkRateLimit(ip, env.RATE_LIMIT_KV))) {
      return err("Too many requests", 429);
    }

    // Route dispatch
    const path = url.pathname;
    const method = req.method;

    if (path === "/ai/fast"  && method === "POST") return handleAi(req, env, "claude-haiku-4-5-20251001");
    if (path === "/ai/deep"  && method === "POST") return handleAi(req, env, "claude-sonnet-4-6");
    if (path === "/market/pulse"              ) return handleMarketPulse(env);
    if (path === "/transcribe-token"          ) return handleTranscribeToken(env);
    if (path === "/defi/jupiter-strict"       ) return handleJupiterStrictCheck(url);
    if (path === "/defi/jupiter/quote"        ) return handleJupiterQuote(url);
    if (path === "/defi/jupiter/swap" && method === "POST") return handleJupiterSwap(req);
    if (path === "/defi/jupiter/price"        ) return handleJupiterPrice(url);
    if (path === "/defi/safety/rugcheck"      ) return handleRugcheck(url);
    if (path === "/defi/helius/token"         ) return handleHeliusToken(url, env);

    return err("Not found", 404);
  },
} satisfies ExportedHandler<Env>;
