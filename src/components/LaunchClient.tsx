"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Keypair, Transaction } from "@solana/web3.js";
import { ConnectionProvider, WalletProvider, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import { confirmByPolling } from "@/lib/confirm";
import { sleep } from "@/lib/util";
import CoinAvatar from "./CoinAvatar";
import Icon from "./Icon";
import SplitBar, { segsFor } from "./SplitBar";

type CharityOpt = { slug: string; name: string; cause: string; blurb: string };
type Props = { charities: CharityOpt[]; platformBps: number; paused: boolean };

const PENDING_KEY = "givefun:pending-lock";

export default function LaunchClient(props: Props) {
  // All wallet traffic goes through our own rate limited, failover RPC proxy. No provider key in the browser.
  const endpoint = useMemo(() => `${window.location.origin}/api/rpc`, []);
  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed", disableRetryOnRateLimit: true }}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <Form {...props} />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

type Stage = "idle" | "prepare" | "sign" | "create" | "lock" | "verify";
const STAGES: { id: Stage; label: string }[] = [
  { id: "prepare", label: "Preparing" },
  { id: "sign", label: "Approve in wallet" },
  { id: "create", label: "Creating coin" },
  { id: "lock", label: "Locking split" },
  { id: "verify", label: "Verifying" },
];

type PendingLock = { ticket: string; mint: string; at: number };

function Form({ charities, platformBps, paused }: Props) {
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey, signAllTransactions, signTransaction } = useWallet();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [slug, setSlug] = useState(charities[0]?.slug ?? "");
  const [pct, setPct] = useState(70);
  const [stage, setStage] = useState<Stage>("idle");
  const [err, setErr] = useState("");
  const [pending, setPending] = useState<PendingLock | null>(null);
  const busy = stage !== "idle";
  const urlRef = useRef<string | null>(null);

  const platformPct = platformBps / 100;
  const maxPct = 100 - platformPct;
  const pctClamped = Math.min(pct, maxPct);
  const devPct = Math.max(0, 100 - pctClamped - platformPct);
  const charity = charities.find((c) => c.slug === slug);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (raw) {
        const p = JSON.parse(raw) as PendingLock;
        if (Date.now() - p.at < 25 * 60_000) setPending(p);
        else localStorage.removeItem(PENDING_KEY);
      }
    } catch {
      /* storage blocked */
    }
  }, []);

  useEffect(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = image ? URL.createObjectURL(image) : null;
    setPreview(urlRef.current);
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [image]);

  const savePending = (p: PendingLock | null) => {
    setPending(p);
    try {
      if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
      else localStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
  };

  async function sendAndConfirm(tx: Transaction, lastValid: number) {
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    await confirmByPolling(connection, sig, lastValid);
    return sig;
  }

  async function registerUntilVerified(ticket: string, mint: string, firstSig: string) {
    setStage("verify");
    for (let n = 0; n < 24; n++) {
      const r = await fetch("/api/launch/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket, signature: firstSig }),
      });
      const rj = await r.json().catch(() => ({}));
      if (r.status === 200 && rj.status === "verified") {
        savePending(null);
        router.push(`/coin/${mint}`);
        return;
      }
      if (r.status === 422) throw new Error("The on chain split did not match, so the coin was not listed.");
      await sleep(3000);
    }
    throw new Error("Launched, but verification is still pending. It will appear shortly.");
  }

  async function retryLock() {
    if (!pending || !signTransaction) return;
    setErr("");
    try {
      setStage("prepare");
      const res = await fetch("/api/launch/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: pending.ticket }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not resume");
      if (j.status !== "already_locked") {
        setStage("sign");
        const signed = await signTransaction(Transaction.from(Buffer.from(j.transaction, "base64")));
        setStage("lock");
        await sendAndConfirm(signed, j.lastValidBlockHeight);
      }
      await registerUntilVerified(pending.ticket, pending.mint, "");
    } catch (e) {
      setErr((e as Error).message || "Something went wrong");
    } finally {
      setStage("idle");
    }
  }

  // Shrinks big images in the browser so the upload stays far below the host body limit.
  async function pickImage(f: File | null) {
    setErr("");
    if (!f) return setImage(null);
    const LIMIT = 1.8 * 1024 * 1024;
    if (f.type === "image/gif") {
      if (f.size > LIMIT) { setImage(null); return setErr("GIF is too large. Use one under 2MB."); }
      return setImage(f);
    }
    try {
      const bmp = await createImageBitmap(f);
      const scale = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(bmp.width * scale));
      c.height = Math.max(1, Math.round(bmp.height * scale));
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      let blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/png"));
      if (!blob || blob.size > LIMIT) blob = await new Promise((r) => c.toBlob(r, "image/webp", 0.85));
      if (!blob || blob.size > LIMIT) blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.8));
      if (!blob || blob.size > LIMIT) { setImage(null); return setErr("Image is too large. Use a smaller one."); }
      const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
      setImage(new File([blob], `coin.${ext}`, { type: blob.type }));
    } catch {
      f.size > LIMIT ? (setImage(null), setErr("Image is too large. Use one under 2MB.")) : setImage(f);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!publicKey || !signAllTransactions) return setErr("Connect your wallet first");
    if (!image) return setErr("Add an image");
    try {
      const bal = await connection.getBalance(publicKey, "confirmed");
      if (bal < 25_000_000) {
        return setErr(`Your wallet has ${(bal / 1e9).toFixed(4)} SOL. A launch needs about 0.03 SOL. Add SOL first so nothing is wasted.`);
      }
    } catch { /* balance check is best effort */ }
    let ticket = "";
    let mint = "";
    try {
      setStage("prepare");
      const fd = new FormData();
      fd.append("creator", publicKey.toBase58());
      fd.append("name", name);
      fd.append("symbol", symbol);
      fd.append("description", description);
      fd.append("website", website);
      fd.append("twitter", twitter);
      fd.append("telegram", telegram);
      fd.append("charitySlug", slug);
      fd.append("charityPercent", String(pctClamped));
      fd.append("image", image);
      const res = await fetch("/api/launch/prepare", { method: "POST", body: fd });
      const raw = await res.text();
      let j: any = {};
      try { j = JSON.parse(raw); } catch { /* not json */ }
      if (res.status === 413) throw new Error("Image is too large. Use one under 2MB.");
      if (!res.ok) throw new Error(j.error || `Prepare failed (${res.status})`);
      ticket = j.ticket;
      mint = j.mint;

      setStage("sign");
      const txs = (j.transactions as string[]).map((b) => Transaction.from(Buffer.from(b, "base64")));
      const signed = await signAllTransactions(txs);
      // Mint signs after the wallet so the wallet cannot invalidate it.
      signed[0].partialSign(Keypair.fromSecretKey(Uint8Array.from(Buffer.from(j.mintSecret as string, "base64"))));

      setStage("create");
      const firstSig = await sendAndConfirm(signed[0], j.lastValidBlockHeights[0]);
      savePending({ ticket, mint, at: Date.now() });

      setStage("lock");
      await sendAndConfirm(signed[1], j.lastValidBlockHeights[1]);

      await registerUntilVerified(ticket, mint, firstSig);
    } catch (e2) {
      const msg = (e2 as Error).message || "Something went wrong";
      setErr(
        ticket && pending === null && stage !== "prepare" && stage !== "sign"
          ? `${msg} Your coin may exist but the charity split is not locked yet. Use Retry lock below.`
          : msg,
      );
    } finally {
      setStage("idle");
    }
  }

  if (charities.length === 0) {
    return (
      <div className="card p-8 text-center text-mute">
        No verified charities are available yet. Launching opens as soon as the first charity wallet is verified.
      </div>
    );
  }

  const segs = segsFor(Math.round(pctClamped * 100), platformBps);

  return (
    <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr]">
      <form onSubmit={submit} className="space-y-6">
        {paused && (
          <div className="flex items-center gap-3 rounded-2xl border border-amber/30 bg-amber/10 p-4 text-sm text-amber">
            <Icon name="pause" size={18} /> Launches are paused for a moment. Please check back shortly.
          </div>
        )}

        {pending && (
          <div className="rounded-2xl border border-ember/30 bg-ember/10 p-4 text-sm">
            <div className="font-semibold text-ember">Finish your last launch</div>
            <p className="mt-1 text-mute">Your coin was created but the charity split is not locked yet. One signature finishes it.</p>
            <button type="button" className="btn btn-sm mt-3" disabled={busy || !publicKey} onClick={retryLock}>
              Retry lock
            </button>
            <button type="button" className="btn-ghost btn-sm ml-2 mt-3" onClick={() => savePending(null)}>
              Dismiss
            </button>
          </div>
        )}

        <section className="card space-y-5 p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold">1. Your wallet</h2>
            <WalletMultiButton />
          </div>
          <p className="text-xs text-mute">Your wallet signs the launch. We never hold keys or funds.</p>
        </section>

        <section className="card space-y-5 p-6">
          <h2 className="font-display text-lg font-bold">2. Your coin</h2>
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <div>
              <label className="label" htmlFor="name">Name</label>
              <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} required placeholder="Hug Coin" />
            </div>
            <div>
              <label className="label" htmlFor="sym">Ticker</label>
              <input
                id="sym"
                className="input uppercase"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
                maxLength={10}
                required
                placeholder="HUG"
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="desc">Description</label>
            <textarea id="desc" className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="What is this coin about?" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="web">Website (optional)</label>
              <input id="web" className="input" value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={200} placeholder="https://yoursite.com" />
            </div>
            <div>
              <label className="label" htmlFor="tw">X / Twitter (optional)</label>
              <input id="tw" className="input" value={twitter} onChange={(e) => setTwitter(e.target.value)} maxLength={200} placeholder="@handle or link" />
            </div>
            <div>
              <label className="label" htmlFor="tg">Telegram (optional)</label>
              <input id="tg" className="input" value={telegram} onChange={(e) => setTelegram(e.target.value)} maxLength={200} placeholder="t.me/yourgroup" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="img">Image (png, jpg, gif or webp, max 2MB)</label>
            <input
              id="img"
              className="input file:mr-3 file:rounded-lg file:border-0 file:bg-ember file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={(e) => void pickImage(e.target.files?.[0] ?? null)}
              required
            />
          </div>
        </section>

        <section className="card space-y-5 p-6">
          <h2 className="font-display text-lg font-bold">3. Pick the cause</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {charities.map((c) => (
              <label
                key={c.slug}
                className={`cursor-pointer rounded-xl border p-4 transition ${
                  slug === c.slug ? "border-ember bg-ember/10" : "border-line bg-raise/40 hover:border-mute/40"
                }`}
              >
                <input type="radio" name="charity" value={c.slug} checked={slug === c.slug} onChange={() => setSlug(c.slug)} className="sr-only" />
                <div className="font-display font-bold leading-tight">{c.name}</div>
                <div className="mt-1 text-xs text-mute">{c.cause}</div>
              </label>
            ))}
          </div>
        </section>

        <section className="card space-y-5 p-6">
          <h2 className="font-display text-lg font-bold">4. Set the split</h2>
          <div>
            <div className="mb-3 flex items-end justify-between">
              <span className="label !mb-0">Creator fees to charity</span>
              <span className="font-display text-4xl font-extrabold text-ember">{pctClamped}%</span>
            </div>
            <input
              type="range"
              min={50}
              max={maxPct}
              step={1}
              value={pctClamped}
              onChange={(e) => setPct(Number(e.target.value))}
              className="w-full accent-[#ff6a45]"
              aria-label="Percent of creator fees to charity"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {[50, 70, 90, 100].filter((v) => v <= maxPct).map((v) => (
                <button type="button" key={v} onClick={() => setPct(v)} className={`chip transition hover:text-cream ${pctClamped === v ? "!border-ember !text-ember" : ""}`}>
                  {v}%
                </button>
              ))}
            </div>
          </div>
          <SplitBar segs={segs} legend height={10} />
          <p className="text-xs text-mute">Locked on chain right after launch. You cannot change it later, and neither can we.</p>
        </section>

        {err && <div className="rounded-2xl border border-rose/30 bg-rose/10 p-4 text-sm text-rose">{err}</div>}

        {busy && (
          <ol className="flex flex-wrap gap-2 text-xs">
            {STAGES.map((s) => {
              const idx = STAGES.findIndex((x) => x.id === stage);
              const me = STAGES.findIndex((x) => x.id === s.id);
              return (
                <li key={s.id} className={`chip ${me < idx ? "!border-mint/30 !text-mint" : me === idx ? "!border-ember !text-ember" : ""}`}>
                  {me < idx ? <Icon name="check" size={12} /> : me === idx ? <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-ember" /> : null}
                  {s.label}
                </li>
              );
            })}
          </ol>
        )}

        <button className="btn w-full py-4 text-base" disabled={busy || !publicKey || paused}>
          {busy ? "Working..." : publicKey ? "Launch coin" : "Connect wallet to launch"}
        </button>
      </form>

      {/* live preview */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="label">Live preview</div>
        <div className="card p-6">
          <div className="flex items-center gap-4">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="h-16 w-16 rounded-2xl object-cover" />
            ) : (
              <CoinAvatar mint={slug || "x"} symbol={symbol || "?"} image={null} size={64} />
            )}
            <div className="min-w-0">
              <div className="truncate font-display text-xl font-bold">{name || "Your coin"}</div>
              <div className="text-xs text-mute">${symbol || "TICKER"}</div>
            </div>
          </div>
          <div className="mt-6">
            <div className="mb-2 text-sm text-mute">
              <b className="font-display text-xl text-ember">{pctClamped}%</b> to {charity?.name ?? "your charity"}
            </div>
            <SplitBar segs={segs} legend />
          </div>
          <div className="mt-6 space-y-2 border-t border-line pt-5 text-xs text-mute">
            <div className="flex items-center gap-2"><Icon name="lock" size={13} className="text-mint" /> Split locked on chain at launch</div>
            <div className="flex items-center gap-2"><Icon name="shield" size={13} className="text-mint" /> Charity wallet sourced from its official page</div>
            <div className="flex items-center gap-2"><Icon name="eye" size={13} className="text-mint" /> Every payout is a public transaction</div>
          </div>
        </div>
        {charity?.blurb && <p className="mt-4 text-sm text-mute">{charity.blurb}</p>}
      </aside>
    </div>
  );
}