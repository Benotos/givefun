import { store } from "../store";
import { kvGet, kvPing, kvStatus } from "../kv";
import { snapshotAge, snapStats } from "../snapshot";
import { dbBreaker } from "../breaker";
import { rpcStatus } from "../rpc";
import { platformBps, platformWallet } from "../config";

export type WorkerBeat = {
  at: number;
  startedAt: number;
  payer: string | null;
  lastTickAt: number;
  lastTick: { coins: number; verified: number; revoked: number; failed: number; distributed: number; errors: number } | null;
  lastError: string;
  snapshotErrors: number;
  mode?: "loop" | "once";
};

export async function getSystemStatus() {
  const s = store();
  const [dbOk, kv, homeAge, charAge, flagsAge, beat, counts, audit, flags] = await Promise.all([
    s.kind !== "memory" ? s.ping() : Promise.resolve(null),
    kvPing(),
    snapshotAge("home"),
    snapshotAge("charities"),
    snapshotAge("flags"),
    kvGet<WorkerBeat>("hb:worker"),
    s.coinCounts().catch(() => null),
    s.listAudit(30).catch(() => []),
    s.getFlags().catch(() => ({ launchPaused: false, banner: "" })),
  ]);

  const has = (k: string) => Boolean(process.env[k]);
  return {
    now: Date.now(),
    storeKind: s.kind,
    demo: process.env.DEMO_MODE === "1",
    maintenanceEnv: process.env.MAINTENANCE === "1",
    db: { ok: dbOk, breaker: dbBreaker.state() },
    kv: { ...kv, failures: kvStatus.failures, lastError: kvStatus.lastError },
    rpc: rpcStatus(),
    snapshots: { home: homeAge, charities: charAge, flags: flagsAge, stats: { ...snapStats } },
    worker: beat
      ? { alive: Date.now() - beat.at < (beat.mode === "once" ? 12 * 60_000 : 45_000), ageMs: Date.now() - beat.at, ...beat }
      : null,
    counts,
    flags,
    audit,
    env: {
      database: has("DATABASE_URL") || (has("SUPABASE_URL") && has("SUPABASE_SERVICE_ROLE_KEY")),
      redis: has("UPSTASH_REDIS_REST_URL") || has("KV_REST_API_URL"),
      helius: has("HELIUS_RPC_URL"),
      extraRpc: has("RPC_URLS"),
      registerSecret: (process.env.REGISTER_SECRET ?? "").length >= 16,
      adminSecret: (process.env.ADMIN_SESSION_SECRET ?? "").length >= 32,
      workerKey: has("WORKER_SECRET_KEY"),
      platformWallet: platformBps() === 0 || Boolean(platformWallet()),
    },
  };
}

export type SystemStatus = Awaited<ReturnType<typeof getSystemStatus>>;