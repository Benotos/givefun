import Link from "next/link";
import type { Charity } from "@/lib/charities";
import { fmtSol } from "@/lib/format";
import Icon from "./Icon";
import CharityLogo from "./CharityLogo";

// Every card has the same height: fixed logo band, two line name, one line cause, two line blurb, footer pinned to the bottom.
export default function CharityCard({ c, rank }: { c: Charity; rank?: number }) {
  const live = c.verified && c.active;
  return (
    <Link href={`/charity/${c.slug}`} className="card card-hover flex h-full flex-col overflow-hidden">
      <div className="relative flex h-24 shrink-0 items-center justify-center bg-gradient-to-br from-ember/25 via-amber/10 to-transparent">
        <div className="absolute inset-0 bg-[radial-gradient(60%_90%_at_50%_0%,rgba(255,199,102,0.18),transparent)]" />
        <CharityLogo slug={c.slug} name={c.name} siteUrl={c.site_url} size={64} className="relative" />
        <span
          className={`absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
            live ? "border-mint/30 bg-mint/10 text-mint" : "border-amber/30 bg-amber/10 text-amber"
          }`}
        >
          <Icon name={live ? "shield" : "eye"} size={12} />
          {live ? "Verified" : "Pending"}
        </span>
        {rank !== undefined && <span className="absolute left-3 top-3 font-mono text-[11px] text-faint">#{rank}</span>}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="line-clamp-2 h-[2.9rem] font-display text-lg font-bold leading-[1.2]">{c.name}</div>
        <div className="mt-1 truncate text-xs text-mute">{c.cause || " "}</div>
        <p className="mt-3 line-clamp-2 h-10 text-sm leading-5 text-mute">{c.blurb || " "}</p>
        <div className="mt-auto flex items-end justify-between border-t border-line pt-4">
          <div>
            <div className="font-display text-2xl font-bold text-amber">{fmtSol(c.lamports, 2)}</div>
            <div className="text-[11px] uppercase tracking-wider text-faint">SOL received</div>
          </div>
          <div className="text-right text-xs text-mute">
            {c.coins} coin{c.coins === 1 ? "" : "s"}
          </div>
        </div>
      </div>
    </Link>
  );
}