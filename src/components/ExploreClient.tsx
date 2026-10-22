"use client";
import { useMemo, useState } from "react";
import type { Coin } from "@/lib/store";
import CoinCard from "./CoinCard";

type Opt = { slug: string; name: string };

export default function ExploreClient({ coins, charities }: { coins: Coin[]; charities: Opt[] }) {
  const [q, setQ] = useState("");
  const [charity, setCharity] = useState("all");
  const [sort, setSort] = useState<"new" | "donated" | "share">("new");
  const names = useMemo(() => new Map(charities.map((c) => [c.slug, c.name])), [charities]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = coins.filter(
      (c) =>
        (charity === "all" || c.charity_slug === charity) &&
        (!t || c.name.toLowerCase().includes(t) || c.symbol.toLowerCase().includes(t)),
    );
    const by = {
      new: (a: Coin, b: Coin) => b.created_at.localeCompare(a.created_at),
      donated: (a: Coin, b: Coin) => b.total_donated_lamports - a.total_donated_lamports,
      share: (a: Coin, b: Coin) => b.charity_bps - a.charity_bps,
    }[sort];
    return [...list].sort(by);
  }, [coins, q, charity, sort]);

  const chip = (on: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-sm transition ${on ? "border-ember bg-ember/10 text-cream" : "border-line text-mute hover:text-cream"}`;

  return (
    <div className="mt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input className="input sm:max-w-xs" placeholder="Search name or ticker" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={chip(sort === "new")} onClick={() => setSort("new")}>Newest</button>
          <button type="button" className={chip(sort === "donated")} onClick={() => setSort("donated")}>Most donated</button>
          <button type="button" className={chip(sort === "share")} onClick={() => setSort("share")}>Highest share</button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={chip(charity === "all")} onClick={() => setCharity("all")}>All causes</button>
        {charities.map((c) => (
          <button key={c.slug} type="button" className={chip(charity === c.slug)} onClick={() => setCharity(c.slug)}>
            {c.name}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="card mt-8 p-10 text-center text-mute">{coins.length === 0 ? "No coins yet. Be the first to launch." : "No coins match."}</div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => (
            <CoinCard key={c.mint} coin={c} charityName={names.get(c.charity_slug)} />
          ))}
        </div>
      )}
    </div>
  );
}