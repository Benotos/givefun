import { Redis } from "@upstash/redis";
import { withTimeout } from "./util";

/**
 * Key value layer. Uses Upstash Redis when configured, an in process Map otherwise.
 * Every Redis call has a hard timeout and falls back to the Map on any failure,
 * so a Redis outage degrades the site (per instance caching) instead of crashing it.
 */

type MemEntry = { v: unknown; exp: number };
const mem = new Map<string, MemEntry>();
const MEM_MAX = 5000;

const url = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const token = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";

let client: Redis | null | undefined;
function redis(): Redis | null {
  if (client !== undefined) return client;
  if (!url() || !token()) {
    client = null;
    return client;
  }
  client = new Redis({ url: url(), token: token(), retry: { retries: 1, backoff: () => 80 } });
  return client;
}

export const kvStatus = {
  kind: "memory" as "redis" | "memory",
  failures: 0,
  consecutiveFailures: 0,
  lastError: "",
  lastOkAt: 0,
};

function refreshKind() {
  kvStatus.kind = redis() ? "redis" : "memory";
}

const REDIS_TIMEOUT_MS = 900;

async function viaRedis<T>(label: string, fn: (r: Redis) => Promise<T>): Promise<{ ok: true; v: T } | { ok: false }> {
  const r = redis();
  refreshKind();
  if (!r) return { ok: false };
  // Skip Redis briefly after repeated failures so a dead Redis costs no latency.
  if (kvStatus.consecutiveFailures >= 4 && Date.now() - kvStatus.lastOkAt < 15_000) return { ok: false };
  try {
    const v = await withTimeout(fn(r), REDIS_TIMEOUT_MS, `redis ${label}`);
    kvStatus.consecutiveFailures = 0;
    kvStatus.lastOkAt = Date.now();
    return { ok: true, v };
  } catch (e) {
    kvStatus.failures++;
    kvStatus.consecutiveFailures++;
    kvStatus.lastError = (e as Error).message;
    if (kvStatus.consecutiveFailures === 4) kvStatus.lastOkAt = Date.now();
    return { ok: false };
  }
}

function memSweep() {
  if (mem.size <= MEM_MAX) return;
  const now = Date.now();
  for (const [k, e] of mem) if (e.exp <= now) mem.delete(k);
  if (mem.size > MEM_MAX) {
    // Still too big: drop oldest inserted entries.
    let n = mem.size - MEM_MAX;
    for (const k of mem.keys()) {
      mem.delete(k);
      if (--n <= 0) break;
    }
  }
}

function memGet<T>(key: string): T | null {
  const e = mem.get(key);
  if (!e) return null;
  if (e.exp <= Date.now()) {
    mem.delete(key);
    return null;
  }
  return e.v as T;
}

function memSet(key: string, v: unknown, ttlSec: number) {
  mem.set(key, { v, exp: Date.now() + ttlSec * 1000 });
  memSweep();
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const r = await viaRedis("get", (c) => c.get<T>(key));
  if (r.ok) return (r.v as T | null) ?? null;
  return memGet<T>(key);
}

export async function kvSet(key: string, value: unknown, ttlSec: number): Promise<void> {
  // Always keep a local copy too, it is the safety net if Redis drops.
  memSet(key, value, Math.min(ttlSec, 3600));
  await viaRedis("set", (c) => c.set(key, value as never, { ex: ttlSec }));
}

export async function kvDel(key: string): Promise<void> {
  mem.delete(key);
  await viaRedis("del", (c) => c.del(key));
}

/** Set only if absent. Returns true if this caller won the lock. */
export async function kvLock(key: string, ttlSec: number): Promise<boolean> {
  const r = await viaRedis("lock", (c) => c.set(key, "1", { nx: true, ex: ttlSec }));
  if (r.ok) return r.v === "OK";
  if (memGet(key)) return false;
  memSet(key, "1", ttlSec);
  return true;
}

const INCR_SCRIPT =
  "local n=redis.call('INCR',KEYS[1]) if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end return n";

/** Atomic counter with expiry set on first increment. */
export async function kvIncr(key: string, ttlSec: number): Promise<number> {
  const r = await viaRedis("incr", (c) => c.eval<[string], number>(INCR_SCRIPT, [key], [String(ttlSec)]));
  if (r.ok) return Number(r.v);
  const cur = memGet<number>(key) ?? 0;
  const exp = mem.get(key)?.exp;
  const next = cur + 1;
  mem.set(key, { v: next, exp: exp && exp > Date.now() ? exp : Date.now() + ttlSec * 1000 });
  return next;
}

export async function kvPing(): Promise<{ kind: "redis" | "memory"; ok: boolean; ms: number }> {
  refreshKind();
  const t0 = Date.now();
  if (!redis()) return { kind: "memory", ok: true, ms: 0 };
  const r = await viaRedis("ping", (c) => c.ping());
  return { kind: "redis", ok: r.ok, ms: Date.now() - t0 };
}

// Test helper only.
export function __kvResetMemory() {
  mem.clear();
  client = undefined;
  kvStatus.failures = 0;
  kvStatus.consecutiveFailures = 0;
  kvStatus.lastError = "";
}
