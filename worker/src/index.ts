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
  EXTENSION_SECRET: string;
  HELIUS_API_KEY: string;
  ASSEMBLYAI_API_KEY: string;
  REOWN_PROJECT_ID: string;
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

  const url = new URL(req.url);
  const msg = `${ts}.${url.pathname}`;
  const enc = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  // Decode hex sig header back to raw bytes
  const hexPairs = sig.match(/.{2}/g) ?? [];
  if (hexPairs.length !== 32) return false; // SHA-256 = 32 bytes
  const sigBytes = new Uint8Array(hexPairs.map(b => parseInt(b, 16)));

  // crypto.subtle.verify performs constant-time HMAC comparison
  return crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(msg));
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
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Quickdraw-Client, X-Quickdraw-Timestamp, X-Quickdraw-Sig",
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
  const resp = await fetch("https://streaming.assemblyai.com/v3/token?expires_in_seconds=480", {
    method: "GET",
    headers: {
      "Authorization": env.ASSEMBLYAI_API_KEY,
    },
  });
  if (!resp.ok) {
    const body = await resp.text();
    return new Response(JSON.stringify({ error: `AssemblyAI error ${resp.status}: ${body}` }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
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

async function handleAiDeepExtension(req: Request, env: Env): Promise<Response> {
  const body = await req.json<{
    mint: string;
    ticker: string;
    price: number;
    safetyScore: number;
    volume24h: number;
  }>();

  if (!body.mint || !body.ticker) {
    return err("Missing required fields: mint, ticker", 400);
  }

  const systemPrompt =
    "You are a DeFi analyst for Solana traders. Write 3-4 sentences analyzing the token's risk, momentum, and key on-chain signals. Be direct and data-driven. No disclaimers.";

  const userContent = [
    `Token: ${body.ticker} (${body.mint})`,
    `Safety score: ${body.safetyScore}/100`,
    `Price: $${body.price}`,
    `24h volume: $${body.volume24h.toLocaleString()}`,
  ].join("\n");

  const upstream = await fetch(`${ANTHROPIC_BASE}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      stream: true,
    }),
  });

  if (!upstream.ok) {
    const errorText = await upstream.text();
    return err(`Anthropic error ${upstream.status}: ${errorText}`, upstream.status);
  }

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

// ─────────────────────────── Reown auth page ─────────────────────────────────

function authPage(callbackUrl: string, projectId: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quickdraw — Connect Wallet</title>
  <script src="https://cdn.jsdelivr.net/npm/@walletconnect/modal@2/dist/index.umd.js"><\/script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#111;color:#f5f0e8;font-family:monospace;display:flex;align-items:center;justify-content:center;min-height:100vh}
    .card{background:#1a1a1a;border:2px solid #000;box-shadow:4px 4px 0 #000;padding:32px;width:380px}
    h1{color:#f5e642;font-size:15px;letter-spacing:2px;margin-bottom:8px}
    .sub{color:#555;font-size:11px;margin-bottom:24px}
    input{width:100%;background:#222;border:1.5px solid #333;color:#fff;padding:10px 12px;font-family:monospace;font-size:12px;outline:none;margin-bottom:8px}
    input:focus{border-color:#f5e642}
    button{width:100%;background:#f5e642;color:#000;border:1.5px solid #000;padding:11px;font-family:monospace;font-size:12px;font-weight:700;cursor:pointer;margin-bottom:8px;letter-spacing:1px}
    button:hover{background:#ffe000}
    button.sec{background:#222;color:#888;border-color:#333}
    button.sec:hover{background:#2a2a2a;color:#fff}
    .status{font-size:11px;color:#8bf542;margin-top:12px;min-height:16px}
    .err{font-size:11px;color:#f54242;margin-top:8px}
    .divider{text-align:center;color:#333;font-size:11px;margin:12px 0}
  </style>
</head>
<body>
<div class="card">
  <h1>QUICKDRAW</h1>
  <p class="sub">Sign in to track your portfolio and enable swaps.</p>

  <input type="email" id="email" placeholder="Enter your email" autocomplete="email" />
  <button onclick="sendMagicLink()">Send Magic Link</button>

  <div class="divider">— or connect wallet —</div>

  <button class="sec" onclick="openWcModal()">WalletConnect (QR)</button>

  <div class="status" id="status"></div>
  <div class="err" id="err"></div>
</div>

<script>
  const CALLBACK = '${callbackUrl}';
  const PROJECT_ID = '${projectId}';

  function setStatus(msg) { document.getElementById('status').textContent = msg; }
  function setErr(msg)    { document.getElementById('err').textContent = msg; }

  function sendCallback(address) {
    setStatus('✓ Connected: ' + address.slice(0,6) + '…' + address.slice(-4));
    if (CALLBACK) {
      fetch(CALLBACK + '/callback?address=' + encodeURIComponent(address))
        .catch(() => {});
      setTimeout(() => window.close(), 1800);
    }
  }

  async function sendMagicLink() {
    const email = document.getElementById('email').value.trim();
    if (!email) { setErr('Enter your email.'); return; }
    setStatus('Sending magic link…');
    setErr('');
    // Magic link flow: open Reown hosted connect page with email prefilled
    const url = 'https://verify.walletconnect.org/?projectId=' + PROJECT_ID + '&email=' + encodeURIComponent(email);
    window.open(url, '_blank');
    setStatus('Check your email — click the magic link to connect.');
  }

  async function openWcModal() {
    if (!window.WalletConnectModal) { setErr('WalletConnect not loaded.'); return; }
    try {
      const modal = new window.WalletConnectModal.WalletConnectModal({
        projectId: PROJECT_ID,
        chains: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
      });
      await modal.openModal();
      modal.subscribeModal(state => {
        if (!state.open) {
          const session = modal.getActiveSessions?.();
          const addr = session && Object.values(session)[0]?.namespaces?.solana?.accounts?.[0]?.split(':')?.[2];
          if (addr) sendCallback(addr);
        }
      });
    } catch(e) { setErr('WalletConnect error: ' + e.message); }
  }
<\/script>
</body>
</html>`;
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

    // Reown email login page — no HMAC needed, opened in user's browser
    if (url.pathname === "/auth") {
      const callback = url.searchParams.get("callback") ?? "";
      return new Response(authPage(callback, env.REOWN_PROJECT_ID), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Extension bearer-token auth — covers /ai/fast and /ai/deep
    // The extension cannot sign HMAC (no shared secret in client code).
    // EXTENSION_SECRET is a separate Worker secret, not APP_SECRET.
    if (req.headers.get("X-Quickdraw-Client") === "extension") {
      const bearer = req.headers.get("Authorization") ?? "";
      const secret = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
      if (!secret || secret !== env.EXTENSION_SECRET) {
        return err("Unauthorized", 401);
      }
      if (url.pathname === "/ai/fast" && req.method === "POST") {
        return handleAi(req, env, "claude-haiku-4-5-20251001");
      }
      if (url.pathname === "/ai/deep" && req.method === "POST") {
        return handleAiDeepExtension(req, env);
      }
      return err("Not found", 404);
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
