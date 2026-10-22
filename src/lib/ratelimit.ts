import { kvIncr } from "./kv";
import { ipOf } from "./util";

export type LimitResult = { ok: boolean; remaining: number; resetSec: number };

/** Fixed window limiter shared across instances through Redis. Falls back to per instance memory. */
export async function limit(key: string, max: number, windowSec: number): Promise<LimitResult> {
  const bucket = Math.floor(Date.now() / (windowSec * 1000));
  const n = await kvIncr(`rl:${key}:${bucket}`, windowSec + 1);
  const resetSec = windowSec - Math.floor((Date.now() / 1000) % windowSec);
  return { ok: n <= max, remaining: Math.max(0, max - n), resetSec };
}

/** Route helper. Returns a 429 Response when over the limit, otherwise null. */
export async function guard(req: Request, name: string, max: number, windowSec: number): Promise<Response | null> {
  const r = await limit(`${name}:${ipOf(req)}`, max, windowSec);
  if (r.ok) return null;
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "retry-after": String(r.resetSec),
    },
  });
}
