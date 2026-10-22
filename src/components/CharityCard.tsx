import Link from "next/link";
import type { Charity } from "@/lib/charities";
import { fmtSol } from "@/lib/format";
import Icon from "./Icon";

export default function CharityCard({ c, rank }: { c: Charity; rank?: number }) {
  const live = c.verified && c.active;
  return (
    <Link href={`/charity/${c.slug}`} className="card card-hover block p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {rank !== undefined && <div className="mb-1 font-mono text-[11px] text-faint">#{rank}</div>}
          <div className="font-display text-lg font-bold leading-tight">{c.name}</div>
          <div className="mt-1 text-xs text-mute">{c.cause}</div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
            live ? "border-mint/30 bg-mint/10 text-mint" : "border-amber/30 bg-amber/10 text-amber"
          }`}
        >
          <Icon name={live ? "shield" : "eye"} size={12} />
          {live ? "Verified" : "Pending"}
        </span>
      </div>
      {c.blurb && <p className="mt-3 line-clamp-2 text-sm text-mute">{c.blurb}</p>}
      <div className="mt-5 flex items-end justify-between border-t border-line pt-4">
        <div>
          <div className="font-display text-2xl font-bold text-amber">{fmtSol(c.lamports, 2)}</div>
          <div className="text-[11px] uppercase tracking-wider text-faint">SOL received</div>
        </div>
        <div className="text-right text-xs text-mute">
          {c.coins} coin{c.coins === 1 ? "" : "s"}
        </div>
      </div>
    </Link>
  );
}
