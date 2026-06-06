// extension/src/worker-client.ts

// Injected by esbuild --define at build time.
declare const __WORKER_URL__: string;
declare const __EXTENSION_SECRET__: string;

const WORKER_URL = typeof __WORKER_URL__ !== "undefined"
  ? __WORKER_URL__
  : "http://localhost:8787";

const EXTENSION_SECRET = typeof __EXTENSION_SECRET__ !== "undefined"
  ? __EXTENSION_SECRET__
  : "dev-extension-secret-change-in-prod";

// Stream AI narration from Worker /ai/fast.
// Calls onToken for each text delta, returns the full string.
export async function streamNarration(
  address: string,
  safety: { score: number; label: string; summary: string },
  price: { usd: number; symbol: string } | null,
  onToken: (delta: string) => void,
): Promise<string> {
  const systemPrompt =
    "You are a concise DeFi analyst for Solana traders. Write 1-2 sentences about the token's risk and key facts. Be direct. No disclaimers.";

  const userContent = [
    `Token address: ${address}`,
    `Safety score: ${safety.score}/100 (${safety.label})`,
    `Details: ${safety.summary}`,
    price ? `Price: $${price.usd.toFixed(6)} (${price.symbol})` : "Price: unavailable",
  ].join("\n");

  const resp = await fetch(`${WORKER_URL}/ai/fast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Quickdraw-Client": "extension",
      "Authorization": `Bearer ${EXTENSION_SECRET}`,
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 120,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userContent }],
      stream: true,
    }),
  });

  if (!resp.ok || !resp.body) throw new Error("AI narration failed");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as {
          type: string;
          delta?: { type: string; text?: string };
        };
        if (event.type === "content_block_delta" && event.delta?.text) {
          full += event.delta.text;
          onToken(event.delta.text);
        }
      } catch {
        // malformed SSE line — skip
      }
    }
  }

  return full;
}
