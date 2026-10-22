import { Keypair } from "@solana/web3.js";
import { store } from "../src/lib/store";
import { seedCharitiesIfEmpty } from "../src/lib/charities";
import { refreshPublicSnapshots } from "../src/lib/data";
import { getConnection } from "../src/lib/rpc";
import { kvSet } from "../src/lib/kv";
import { runTick } from "./tick";
import type { TickStats } from "./tick";

// Long running worker. Run on any always on host (Railway, Fly, a VPS) or use --once from a cron.
// Jobs:
//  1. every 10s: rebuild the public snapshots in Redis so visitors never wait on the database
//  2. every WORKER_INTERVAL_SECONDS: verify every coin's on chain split and trigger fee distribution
//  3. write a heartbeat the admin dashboard reads

const SNAP_EVERY_MS = 10_000;

function loadSigner(): Keypair | null {
  const raw = process.env.WORKER_SECRET_KEY;
  if (!raw) return null;
  try {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  } catch {
    console.error("WORKER_SECRET_KEY is not a valid JSON secret key array");
    process.exit(1);
  }
}

type Beat = {
  at: number;
  startedAt: number;
  payer: string | null;
  lastTickAt: number;
  lastTick: TickStats | null;
  lastError: string;
  snapshotErrors: number;
  mode: "loop" | "once";
};

async function main() {
  const s = store();
  if (!s.writable) {
    console.error("No database configured. Set DATABASE_URL (or SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).");
    process.exit(1);
  }
  const once = process.argv.includes("--once");
  const signer = loadSigner();
  if (!signer) console.warn("No WORKER_SECRET_KEY: verification only, distribution disabled");
  else console.log("worker payer", signer.publicKey.toBase58());

  const seeded = await seedCharitiesIfEmpty();
  if (seeded) console.log(`seeded ${seeded} placeholder charities`);

  const conn = getConnection();
  const chainEvery = Math.max(15, Number(process.env.WORKER_INTERVAL_SECONDS ?? 60)) * 1000;
  const beat: Beat = {
    at: Date.now(),
    startedAt: Date.now(),
    payer: signer?.publicKey.toBase58() ?? null,
    lastTickAt: 0,
    lastTick: null,
    lastError: "",
    snapshotErrors: 0,
    mode: once ? "once" : "loop",
  };

  const publishBeat = async () => {
    beat.at = Date.now();
    await kvSet("hb:worker", beat, 600).catch(() => {});
  };

  const snapLoop = async () => {
    try {
      await refreshPublicSnapshots();
    } catch (e) {
      beat.snapshotErrors++;
      beat.lastError = `snapshot: ${(e as Error).message}`.slice(0, 200);
      console.error("snapshot refresh failed", (e as Error).message);
    }
    await publishBeat();
  };

  const chainLoop = async () => {
    try {
      beat.lastTick = await runTick(conn, signer);
      beat.lastTickAt = Date.now();
      console.log(new Date().toISOString(), JSON.stringify(beat.lastTick));
    } catch (e) {
      beat.lastError = `tick: ${(e as Error).message}`.slice(0, 200);
      console.error("tick failed", (e as Error).message);
    }
    await publishBeat();
  };

  // Run verification/distribution before publishing snapshots. The scheduled GitHub worker
  // exits after one pass, so snapshotting first made newly verified coins wait for the next
  // five-minute cron run before appearing in Home and Explore.
  await chainLoop();
  await snapLoop();
  if (once) {
    // Scheduled mode (GitHub Actions). Exit explicitly so the job ends right away.
    process.exit(0);
  }

  // Never overlap runs of the same loop. A slow RPC must not stack up work.
  let snapBusy = false;
  let chainBusy = false;
  setInterval(async () => {
    if (snapBusy) return;
    snapBusy = true;
    await snapLoop().finally(() => (snapBusy = false));
  }, SNAP_EVERY_MS);
  setInterval(async () => {
    if (chainBusy) return;
    chainBusy = true;
    await chainLoop().finally(() => (chainBusy = false));
  }, chainEvery);
}

main();