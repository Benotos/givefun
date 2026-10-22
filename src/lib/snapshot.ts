import { kvGet, kvSet, kvLock, kvDel } from "./kv";
import { withTimeout, sleep } from "./util";

/**
 * Snapshots are the reason traffic never reaches the database.
 * Public reads come from a precomputed copy in Redis (L2) with a tiny in process copy (L1).
 * Only one caller per soft TTL rebuilds a snapshot (Redis lock). Everyone else gets the last good copy.
 * If the loader fails the last good copy is served, however old. The site never shows an error for reads.
 */

type Snap<T> = { v: T; at: number };

export type SnapOptions<T> = {
  /** Serve fresh data up to this age (seconds). After it one caller refreshes, others get stale. */
  softSec: number;
  /** Keep the stale copy this long (seconds). Default 24h. */
  hardSec?: number;
  /** Rebuilds the snapshot from the source of truth. */
  loader: () => Promise<T>;
  /** Returned when nothing at all exists yet and the loader fails. */
  fallback: T;
  loaderTimeoutMs?: number;
};

export type SnapResult<T> = { data: T; ageMs: number; source: "l1" | "kv" | "fresh" | "stale" | "fallback" };

const L1_MS = 1500;
const l1 = new Map<string, Snap<unknown>>();
const lastGood = new Map<string, Snap<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export const snapStats = { l1: 0, kv: 0, fresh: 0, stale: 0, fallback: 0, loaderErrors: 0 };

export async function getSnapshot<T>(key: string, o: SnapOptions<T>): Promise<SnapResult<T>> {
  const hard = o.hardSec ?? 86_400;
  const now = Date.now();

  const a = l1.get(key) as Snap<T> | undefined;
  if (a && now - a.at < L1_MS) {
    snapStats.l1++;
    return { data: a.v, ageMs: now - a.at, source: "l1" };
  }

  let s = (await kvGet<Snap<T>>(`snap:${key}`)) ?? (lastGood.get(key) as Snap<T> | undefined) ?? null;

  if (s && now - s.at < o.softSec * 1000) {
    l1.set(key, s);
    snapStats.kv++;
    return { data: s.v, ageMs: now - s.at, source: "kv" };
  }

  // Need a refresh. Only the lock holder does it.
  const won = await kvLock(`lock:${key}`, Math.max(5, Math.min(20, o.softSec)));
  if (!won && s) {
    snapStats.stale++;
    return { data: s.v, ageMs: now - s.at, source: "stale" };
  }

  if (!won && !s) {
    // Cold start and someone else is loading. Give them a moment to publish.
    for (let i = 0; i < 6; i++) {
      await sleep(250);
      s = await kvGet<Snap<T>>(`snap:${key}`);
      if (s) {
        snapStats.kv++;
        return { data: s.v, ageMs: Date.now() - s.at, source: "kv" };
      }
    }
  }

  try {
    const fresh = await refresh(key, o, hard);
    return { data: fresh.v, ageMs: 0, source: "fresh" };
  } catch {
    snapStats.loaderErrors++;
    if (s) {
      snapStats.stale++;
      return { data: s.v, ageMs: Date.now() - s.at, source: "stale" };
    }
    snapStats.fallback++;
    return { data: o.fallback, ageMs: 0, source: "fallback" };
  }
}

async function refresh<T>(key: string, o: SnapOptions<T>, hard: number): Promise<Snap<T>> {
  // Collapse concurrent refreshes inside one process into a single loader call.
  const existing = inflight.get(key) as Promise<Snap<T>> | undefined;
  if (existing) return existing;

  const p = (async () => {
    const v = await withTimeout(o.loader(), o.loaderTimeoutMs ?? 5000, `snapshot ${key}`);
    const snap: Snap<T> = { v, at: Date.now() };
    l1.set(key, snap);
    lastGood.set(key, snap);
    await kvSet(`snap:${key}`, snap, hard);
    return snap;
  })();

  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

/** Force a rebuild now (worker and admin use this). Does not take the lock. */
export async function publishSnapshot<T>(key: string, value: T, hardSec = 86_400): Promise<void> {
  const snap: Snap<T> = { v: value, at: Date.now() };
  l1.set(key, snap);
  lastGood.set(key, snap);
  await kvSet(`snap:${key}`, snap, hardSec);
}

/** Drop a snapshot so the next read rebuilds it. Used after writes that must show immediately. */
export async function invalidateSnapshot(key: string): Promise<void> {
  l1.delete(key);
  lastGood.delete(key);
  await kvDel(`snap:${key}`);
}

export async function snapshotAge(key: string): Promise<number | null> {
  const s = await kvGet<Snap<unknown>>(`snap:${key}`);
  return s ? Date.now() - s.at : null;
}

export function __snapReset() {
  l1.clear();
  lastGood.clear();
  inflight.clear();
  for (const k of Object.keys(snapStats) as (keyof typeof snapStats)[]) snapStats[k] = 0;
}
