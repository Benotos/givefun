import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { kvPing } from "@/lib/kv";
import { snapshotAge } from "@/lib/snapshot";
import { dbBreaker } from "@/lib/breaker";

export const dynamic = "force-dynamic";

let last: { at: number; body: Record<string, unknown>; code: number } | null = null;

// Public health check for uptime monitors. Minimal on purpose. Detailed status is in the admin dashboard.
// Result is memoized 10s per instance so pings never load the database.
export async function GET() {
  const maintenance = process.env.MAINTENANCE === "1";
  if (last && Date.now() - last.at < 10_000) {
    return NextResponse.json({ ...last.body, maintenance }, { status: last.code });
  }

  const s = store();
  const [dbOk, kv, homeAge] = await Promise.all([
    s.kind !== "memory" ? s.ping() : Promise.resolve(null),
    kvPing(),
    snapshotAge("home"),
  ]);

  // The site can serve while the DB is down as long as snapshots exist. Only report down when it cannot.
  const canServe = dbOk !== false || homeAge !== null;
  const status = !canServe ? "down" : dbOk === false || !kv.ok || dbBreaker.isOpen ? "degraded" : "ok";
  const body = { ok: canServe, status, time: new Date().toISOString() };
  const code = canServe ? 200 : 503;
  last = { at: Date.now(), body, code };
  return NextResponse.json({ ...body, maintenance }, { status: code });
}