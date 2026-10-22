"use client";
import { useState } from "react";
import type { CharityRow } from "@/lib/store/types";
import { adminGet, adminPost } from "./api";
import { shortAddr } from "@/lib/format";

const EMPTY = { slug: "", name: "", cause: "", blurb: "", site_url: "", wallet: "", wallet_source_url: "" };
type Form = typeof EMPTY;

export default function CharityManager({ initial }: { initial: CharityRow[] }) {
  const [rows, setRows] = useState(initial);
  const [form, setForm] = useState<Form | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = async () => setRows((await adminGet<{ charities: CharityRow[] }>("/api/admin/charities")).charities);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const act = (action: string, slug: string) => run(() => adminPost("/api/admin/charities", { action, slug }));
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => form && setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Charities</h1>
        <button className="btn btn-sm" onClick={() => setForm({ ...EMPTY })}>Add charity</button>
      </div>
      {err && <div className="rounded-xl border border-rose/30 bg-rose/10 p-3 text-sm text-rose">{err}</div>}

      {form && (
        <form
          className="card grid gap-3 p-5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await adminPost("/api/admin/charities", { action: "save", ...form });
              setForm(null);
            });
          }}
        >
          {(["slug", "name", "cause", "site_url", "wallet", "wallet_source_url"] as const).map((k) => (
            <div key={k}>
              <label className="label">{k}</label>
              <input className="input" value={form[k]} onChange={set(k)} />
            </div>
          ))}
          <div className="sm:col-span-2">
            <label className="label">blurb</label>
            <textarea className="input" rows={2} value={form.blurb} onChange={set("blurb")} />
          </div>
          <p className="text-xs text-mute sm:col-span-2">Changing the wallet or its source resets verification. Verify only after checking the wallet on the charity's official page.</p>
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn btn-sm" disabled={busy}>Save</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {rows.map((c) => (
          <div key={c.slug} className="card flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <div className="font-display font-bold">{c.name} <span className="text-xs font-normal text-mute">{c.slug}</span></div>
              <div className="text-xs text-mute">{shortAddr(c.wallet || "")} · <a className="underline" href={c.wallet_source_url} target="_blank" rel="noreferrer">source</a></div>
            </div>
            <span className={`chip ${c.verified ? "!border-mint/30 !text-mint" : ""}`}>{c.verified ? "verified" : "unverified"}</span>
            <span className={`chip ${c.active ? "" : "!border-rose/30 !text-rose"}`}>{c.active ? "active" : "inactive"}</span>
            <div className="flex gap-2">
              <button className="btn-ghost btn-sm" disabled={busy} onClick={() => setForm({ slug: c.slug, name: c.name, cause: c.cause, blurb: c.blurb, site_url: c.site_url, wallet: c.wallet, wallet_source_url: c.wallet_source_url })}>Edit</button>
              <button className="btn-ghost btn-sm" disabled={busy} onClick={() => act(c.verified ? "unverify" : "verify", c.slug)}>{c.verified ? "Unverify" : "Verify"}</button>
              <button className="btn-ghost btn-sm" disabled={busy} onClick={() => act(c.active ? "deactivate" : "activate", c.slug)}>{c.active ? "Deactivate" : "Activate"}</button>
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="text-mute">No charities yet.</div>}
      </div>
    </div>
  );
}
