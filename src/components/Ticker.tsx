import Link from "next/link";
import type { ActivityEvent } from "@/lib/data";
import { fmtSol } from "@/lib/format";
import Icon from "./Icon";

// Pure CSS marquee. Zero JavaScript, so it costs nothing at any traffic level.
export default function Ticker({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) return null;
  const items = events.slice(0, 14);
  const row = (suffix: string) =>
    items.map((e) => (
      <Link
        key={`${e.id}${suffix}`}
        href={`/coin/${e.mint}`}
        className="mx-2 inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-panel/80 px-3.5 py-1.5 text-xs text-mute transition hover:border-ember/40 hover:text-cream"
      >
        <Icon name={e.type === "donation" ? "heart" : "zap"} size={12} className={e.type === "donation" ? "text-rose" : "text-amber"} />
        {e.type === "donation" ? (
          <span>
            <b className="font-semibold text-cream">{e.name}</b> sent <b className="text-amber">{fmtSol(e.lamports ?? 0)} SOL</b> to {e.charityName}
          </span>
        ) : (
          <span>
            <b className="font-semibold text-cream">{e.name}</b> launched for {e.charityName}
          </span>
        )}
      </Link>
    ));

  return (
    <div className="group relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]" aria-label="Recent activity">
      <div className="flex w-max animate-marquee whitespace-nowrap group-hover:[animation-play-state:paused]">
        {row("a")}
        {row("b")}
      </div>
    </div>
  );
}
