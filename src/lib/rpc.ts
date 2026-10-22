import { Connection } from "@solana/web3.js";
import { maskUrl, sleep } from "./util";

/**
 * RPC pool with automatic failover.
 * Endpoints come from HELIUS_RPC_URL (primary), then RPC_URLS (comma separated, any provider),
 * then the public endpoint as a last resort. Add a second or third free tier key and the app
 * survives any single provider rate limiting or going down, with no extra cost.
 */

const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";
const ATTEMPT_TIMEOUT_MS = 8000;

type EpState = { url: string; cooldownUntil: number; fails: number; lastError: string; lastMs: number; calls: number };

let eps: EpState[] | null = null;

export function rpcEndpoints(): string[] {
  const list: string[] = [];
  if (process.env.HELIUS_RPC_URL) list.push(process.env.HELIUS_RPC_URL.trim());
  for (const u of (process.env.RPC_URLS ?? "").split(",")) if (u.trim()) list.push(u.trim());
  list.push(PUBLIC_RPC);
  return Array.from(new Set(list));
}

function pool(): EpState[] {
  if (!eps) {
    eps = rpcEndpoints().map((url) => ({ url, cooldownUntil: 0, fails: 0, lastError: "", lastMs: 0, calls: 0 }));
  }
  return eps;
}

function pick(skip: Set<string>): EpState | null {
  const now = Date.now();
  const p = pool().filter((e) => !skip.has(e.url));
  if (p.length === 0) return null;
  const healthy = p.find((e) => e.cooldownUntil <= now);
  if (healthy) return healthy;
  return p.slice().sort((a, b) => a.cooldownUntil - b.cooldownUntil)[0];
}

export async function failoverFetch(_input: unknown, init?: RequestInit): Promise<Response> {
  const tried = new Set<string>();
  let lastRes: Response | null = null;
  let lastErr: unknown = null;
  const maxAttempts = Math.max(2, Math.min(4, pool().length));

  for (let i = 0; i < maxAttempts; i++) {
    const ep = pick(tried);
    if (!ep) break;
    tried.add(ep.url);
    const t0 = Date.now();
    ep.calls++;
    try {
      const res = await fetch(ep.url, { ...init, signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS) });
      ep.lastMs = Date.now() - t0;
      if (res.status === 429 || res.status >= 500) {
        ep.fails++;
        ep.lastError = `http ${res.status}`;
        ep.cooldownUntil = Date.now() + (res.status === 429 ? 20_000 : 10_000);
        lastRes = res;
        continue;
      }
      ep.fails = 0;
      ep.lastError = "";
      return res;
    } catch (e) {
      ep.fails++;
      ep.lastError = (e as Error).message.slice(0, 120);
      ep.cooldownUntil = Date.now() + 10_000;
      lastErr = e;
    }
    // Only one endpoint configured: brief backoff then retry it.
    if (pool().length === 1) {
      tried.clear();
      await sleep(250 * (i + 1));
    }
  }
  if (lastRes) return lastRes;
  throw lastErr instanceof Error ? lastErr : new Error("All RPC endpoints failed");
}

let conn: Connection | null = null;

export function getConnection(): Connection {
  if (!conn) {
    conn = new Connection(pool()[0].url, {
      commitment: "confirmed",
      fetch: failoverFetch as unknown as typeof fetch,
      disableRetryOnRateLimit: true,
    });
  }
  return conn;
}

/** Forward one raw JSON-RPC body through the pool. Used by the browser proxy route. */
export async function rpcRaw(body: string): Promise<{ status: number; text: string }> {
  const res = await failoverFetch("pool", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  return { status: res.status, text: await res.text() };
}

export function rpcStatus() {
  const now = Date.now();
  return pool().map((e) => ({
    host: maskUrl(e.url),
    healthy: e.cooldownUntil <= now,
    cooldownMs: Math.max(0, e.cooldownUntil - now),
    consecutiveFails: e.fails,
    lastError: e.lastError,
    lastMs: e.lastMs,
    calls: e.calls,
  }));
}

export function __rpcReset() {
  eps = null;
  conn = null;
}
