"use client";
import { useEffect, useState } from "react";
import type { SystemStatus } from "@/lib/admin/system";
import { adminGet, adminPost } from "./api";

export default function SystemPanel({ initial }: { initial: SystemStatus }) {
  const [s, setS] = useState(initial);
  const [banner, setBanner] = useState(initial.flags.banner);
  const [msg, setMsg] = useState("");

  const refresh = async () => setS(await adminGet<SystemStatus>("/api/admin/system"));
  useEffect(() => {
    const t = setInterval(() => refresh().catch(() => {}), 10_000);
    return () => clearInterval(t);
  }, []);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setMsg("");
    try {
      await fn();
      await refresh();
      setMsg(ok);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  const Row = ({ k, v, good }: { k: string; v: string; good?: boolean | null }) => (
    <div className="flex justify-between border-b border-line py-2 text-sm last:border-0">
      <span className="text-mute">{k}</span>
      <b className={good === true ? "text-mint" : good === false ? "text-rose" : ""}>{v}</b>
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">System</h1>
      {msg && <div className="rounded-xl border border-line bg-raise/40 p-3 text-sm">{msg}</div>}

      <div className="card space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display font-bold">Pause launches</div>
            <div className="text-xs text-mute">Stops new launches. Existing coins and the site keep working.</div>
          </div>
          <button className="btn btn-sm" onClick={() => run(() => adminPost("/api/admin/flags", { launchPaused: !s.flags.launchPaused }), "Updated")}>
            {s.flags.launchPaused ? "Resume launches" : "Pause launches"}
          </button>
        </div>
        <div>
          <label className="label">Site banner (empty to hide)</label>
          <div className="flex gap-2">
            <input className="input" value={banner} maxLength={200} onChange={(e) => setBanner(e.target.value)} />
            <button className="btn btn-sm" onClick={() => run(() => adminPost("/api/admin/flags", { banner }), "Banner saved")}>Save</button>
          </div>
        </div>
        <button className="btn-ghost btn-sm" onClick={() => run(() => adminPost("/api/admin/refresh", {}), "Snapshots rebuilt")}>Rebuild public snapshots</button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="label">Services</div>
          <Row k="Store" v={s.storeKind + (s.demo ? " (demo)" : "")} />
          <Row k="Database" v={s.db.ok === null ? "n/a" : s.db.ok ? "ok" : "down"} good={s.db.ok} />
          <Row k="DB breaker" v={JSON.stringify(s.db.breaker)} />
          <Row k="Redis" v={s.kv.ok ? "ok" : "memory fallback"} good={s.kv.ok} />
          <Row k="Worker" v={s.worker ? (s.worker.alive ? "alive" : "stale") : "no heartbeat"} good={s.worker?.alive ?? false} />
          <Row k="MAINTENANCE env" v={s.maintenanceEnv ? "ON" : "off"} good={!s.maintenanceEnv} />
        </div>
        <div className="card p-5">
          <div className="label">Configuration</div>
          {Object.entries(s.env).map(([k, v]) => (
            <Row key={k} k={k} v={v ? "set" : "missing"} good={v} />
          ))}
        </div>
      </div>

      <div className="card p-5">
        <div className="label">RPC endpoints</div>
        <pre className="overflow-x-auto text-xs text-mute">{JSON.stringify(s.rpc, null, 2)}</pre>
      </div>
    </div>
  );
}
