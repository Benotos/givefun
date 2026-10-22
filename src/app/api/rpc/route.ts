import { rpcRaw } from "@/lib/rpc";
import { guard } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// Browser safe RPC proxy. The wallet flow sends transactions through here so our provider keys
// never reach the browser, and so every call is rate limited and fails over across providers.
const ALLOW = new Set([
  "sendTransaction",
  "simulateTransaction",
  "getLatestBlockhash",
  "getSignatureStatuses",
  "getBlockHeight",
  "getBalance",
  "getAccountInfo",
  "getMinimumBalanceForRentExemption",
  "getFeeForMessage",
  "isBlockhashValid",
  "getRecentPrioritizationFees",
]);
const MAX_BODY = 200_000;

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

export async function POST(req: Request) {
  const limited = await guard(req, "rpc", 120, 60);
  if (limited) return limited;

  const text = await req.text();
  if (text.length > MAX_BODY) return json({ error: "Body too large" }, 413);

  let msg: { jsonrpc?: string; id?: unknown; method?: string };
  try {
    msg = JSON.parse(text);
  } catch {
    return json({ error: "Bad JSON" }, 400);
  }
  if (Array.isArray(msg) || typeof msg !== "object" || msg === null) return json({ error: "Batches not allowed" }, 400);
  if (!msg.method || !ALLOW.has(msg.method)) {
    return json({ jsonrpc: "2.0", id: msg.id ?? null, error: { code: -32601, message: "Method not allowed" } }, 403);
  }

  if (msg.method === "sendTransaction") {
    const l2 = await guard(req, "rpc-send", 15, 60);
    if (l2) return l2;
  }

  try {
    const r = await rpcRaw(text);
    return new Response(r.text, {
      status: r.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch {
    return json({ jsonrpc: "2.0", id: msg.id ?? null, error: { code: -32000, message: "RPC unavailable, retry" } }, 503);
  }
}
