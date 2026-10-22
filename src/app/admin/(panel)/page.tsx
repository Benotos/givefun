import { getSystemStatus } from "@/lib/admin/system";
import { fmtSol, timeAgo } from "@/lib/format";
import { store } from "@/lib/store";

export default async function Overview() {
  const [sys, totals] = await Promise.all([getSystemStatus(), store().charityTotals().catch(() => [])]);
  const lamports = totals.reduce((a, t) => a + t.lamports, 0);
  const c = sys.counts;
  const Stat = ({ k, v }: { k: string; v: string | number }) => (
    <div className="card p-5"><div className="label">{k}</div><div className="font-display text-3xl font-extrabold">{v}</div></div>
  );
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat k="Verified coins" v={c?.verified ?? "n/a"} />
        <Stat k="Pending" v={c?.pending ?? "n/a"} />
        <Stat k="Revoked or failed" v={c ? c.revoked + c.failed : "n/a"} />
        <Stat k="Donated" v={`${fmtSol(lamports)} SOL`} />
      </div>
      <div className="card p-5 text-sm text-mute">
        Store: <b className="text-cream">{sys.storeKind}</b>{sys.demo && " (demo)"} · Worker:{" "}
        <b className={sys.worker?.alive ? "text-mint" : "text-rose"}>{sys.worker ? (sys.worker.alive ? "alive" : "stale") : "no heartbeat"}</b>
        {sys.flags.launchPaused && <> · <b className="text-amber">Launches paused</b></>}
      </div>
      <div className="card p-5">
        <div className="label">Recent activity</div>
        <ul className="divide-y divide-line text-sm">
          {sys.audit.slice(0, 10).map((a) => (
            <li key={a.id} className="flex justify-between gap-4 py-2"><span>{a.action} <span className="text-mute">{a.target}</span></span><span className="text-mute">{timeAgo(a.at)}</span></li>
          ))}
          {sys.audit.length === 0 && <li className="py-2 text-mute">Nothing yet</li>}
        </ul>
      </div>
    </div>
  );
}
