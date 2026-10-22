"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ActivityEvent } from "@/lib/data";
import { fmtSol, timeAgo } from "@/lib/format";
import Icon from "./Icon";
import Counter from "./Counter";

type Payload = {
  stats: { coins: number; lamports: number; charities: number };
  activity: ActivityEvent[];
  generatedAt: number;
};

const BASE_MS = 8000;

// Live feed without websockets. Everyone polls one CDN cached endpoint, so load on our servers
// stays flat no matter how many people watch. Polling pauses when the tab is hidden, adds jitter so
// clients do not sync up, and backs off after errors while keeping the last good data on screen.
export default function LiveFeed({ initial, showStats = false }: { initial: Payload; showStats?: boolean }) {
  const [data, setData] = useState<Payload>(initial);
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef(new Set(initial.activity.map((e) => e.id)));
  const fresh = useRef(new Set<string>());
  const fails = useRef(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    let ctl: AbortController | null = null;

    const schedule = (ms: number) => {
      if (stopped) return;
      timer = setTimeout(tick, ms * (0.85 + Math.random() * 0.3));
    };

    const tick = async () => {
      if (stopped) return;
      if (document.hidden) return schedule(BASE_MS);
      ctl = new AbortController();
      try {
        const r = await fetch("/api/activity", { signal: ctl.signal, cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const p = (await r.json()) as Payload;
        const newIds = p.activity.filter((e) => !seen.current.has(e.id)).map((e) => e.id);
        newIds.forEach((id) => {
          seen.current.add(id);
          fresh.current.add(id);
        });
        fails.current = 0;
        setData(p);
        setNow(Date.now());
        schedule(BASE_MS);
      } catch {
        fails.current = Math.min(fails.current + 1, 5);
        schedule(Math.min(60_000, BASE_MS * 2 ** fails.current));
      }
    };

    const onVis = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        schedule(300);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    schedule(BASE_MS);
    const clock = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(clock);
      ctl?.abort();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const items = data.activity.slice(0, 10);

  return (
    <div>
      {showStats && (
        <div className="mb-4 flex items-baseline gap-2 text-sm text-mute">
          <span className="font-display text-2xl font-bold text-cream">
            <Counter value={data.stats.lamports / 1e9} decimals={2} />
          </span>
          SOL donated on chain
        </div>
      )}
      <ul className="space-y-2" aria-live="polite">
        {items.length === 0 && <li className="rounded-xl border border-line p-4 text-sm text-mute">Waiting for the first launch.</li>}
        {items.map((e) => (
          <li key={e.id} className={fresh.current.has(e.id) ? "animate-slideIn" : ""}>
            <Link
              href={`/coin/${e.mint}`}
              className="flex items-center gap-3 rounded-xl border border-line bg-raise/60 px-3.5 py-3 transition hover:border-ember/40"
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  e.type === "donation" ? "bg-rose/15 text-rose" : "bg-amber/15 text-amber"
                }`}
              >
                <Icon name={e.type === "donation" ? "heart" : "zap"} size={15} />
              </span>
              <span className="min-w-0 flex-1 text-sm leading-snug">
                {e.type === "donation" ? (
                  <>
                    <b className="font-semibold">{e.name}</b> sent <b className="text-amber">{fmtSol(e.lamports ?? 0)} SOL</b>
                    <span className="text-mute"> to {e.charityName}</span>
                  </>
                ) : (
                  <>
                    <b className="font-semibold">{e.name}</b> <span className="text-mute">launched for {e.charityName}</span>
                  </>
                )}
              </span>
              <span className="shrink-0 text-xs text-faint" suppressHydrationWarning>{timeAgo(e.at, now)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
