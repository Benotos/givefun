"use client";
import { useState } from "react";
import Link from "next/link";
import type { Coin, CoinStatus } from "@/lib/store/types";
import { adminGet, adminPost } from "./api";
import { fmtSol, shortAddr, timeAgo } from "@/lib/format";

const FILTERS: (CoinStatus | "all")[] = ["all", "pending", "verified", "failed", "revoked", "hidden"];

export default function CoinManager({ initial }: { initial: Coin[] }) {
  const [rows, setRows] = useState(initial);
  const [status, setStatus] = useState<CoinStatus | "all">("all");
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  async function load(s = status, query = q) {
    const p = new URLSearchParams();
    if (s !== "all") p.set("status", s);
    if (query) p.set("q", query);
    setRows((await adminGet<{ coins: Coin[] }>(`/api/admin/coins?${p}`)).coins);
  }
  async function act(mint: string, action: "hide" | "unhide" | "reverify") {
    setBusy(mint);
    setErr("");
    try {
      await adminPost("/api/admin/coins", { mint, action });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Coins</h1>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f} className={`chip ${status === f ? "!border-ember !text-ember" : ""}`} onClick={() => { setStatus(f); load(f).catch((e) => setErr(e.message)); }}>{f}</button>
        ))}
        <input className="input ml-auto max-w-xs" placeholder="Search name, ticker, mint" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load().catch((x) => setErr(x.message))} />
      </div>
      {err && <div className="rounded-xl border border-rose/30 bg-rose/10 p-3 text-sm text-rose">{err}</div>}
      <div className="space-y-3">
        {rows.map((c) => (
          <div key={c.mint} className="card flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <Link href={`/coin/${c.mint}`} className="font-display font-bold hover:text-ember">{c.name} <span className="text-xs font-normal text-mute">${c.symbol}</span></Link>
              <div className="text-xs text-mute">{shortAddr(c.mint)} · {c.charity_slug} · {c.charity_bps / 100}% · {fmtSol(c.total_donated_lamports)} SOL · {timeAgo(c.created_at)}</div>
              {c.fail_reason && <div className="text-xs text-rose">{c.fail_reason}</div>}
            </div>
            <span className="chip">{c.status}</span>
            <div className="flex gap-2">
              <button className="btn-ghost btn-sm" disabled={busy === c.mint} onClick={() => act(c.mint, c.status === "hidden" ? "unhide" : "hide")}>{c.status === "hidden" ? "Unhide" : "Hide"}</button>
              <button className="btn-ghost btn-sm" disabled={busy === c.mint} onClick={() => act(c.mint, "reverify")}>Re-verify</button>
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="text-mute">No coins match.</div>}
      </div>
    </div>
  );
}
