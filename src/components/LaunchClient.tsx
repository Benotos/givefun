"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import { ConnectionProvider, WalletProvider, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import { confirmByPolling } from "@/lib/confirm";
import { sleep } from "@/lib/util";
import CoinAvatar from "./CoinAvatar";
import Icon from "./Icon";
import CharityLogo from "./CharityLogo";
import SplitBar, { segsFor } from "./SplitBar";

type CharityOpt = { slug: string; name: string; cause: string; blurb: string; site_url?: string };
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

type Stage = "idle" | "vanity" | "prepare" | "sign" | "create" | "lock" | "verify";
const STAGES: { id: Stage; label: string }[] = [
  { id: "vanity", label: "Generating pump address" },
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
  const [devBuy, setDevBuy] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [slug, setSlug] = useState(charities[0]?.slug ?? "");
  const [pct, setPct] = useState(70);
  const [stage, setStage] = useState<Stage>("idle");
  const [err, setErr] = useState("");
  const [pending, setPending] = useState<PendingLock | null>(null);
  const [vanityProgress, setVanityProgress] = useState({ attempts: 0, attemptsPerSecond: 0 });
  const busy = stage !== "idle";
  const urlRef = useRef<string | null>(null);
  const cancelVanityRef = useRef<(() => void) | null>(null);

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

  // Generate the pump-style mint entirely in a browser worker. A "pump" suffix averages
  // about 11.3M Ed25519 key attempts, so don't block the launch form's main thread.
  function generatePumpMint(onProgress: (p: { attempts: number; attemptsPerSecond: number }) => void): Promise<Keypair> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL("../workers/vanity-mint.worker.ts", import.meta.url), { type: "module" });
      let settled = false;
      let cancel = () => {};
      const cleanup = () => {
        worker.terminate();
        if (cancelVanityRef.current === cancel) cancelVanityRef.current = null;
      };
      cancel = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("Vanity mint generation cancelled."));
      };
      cancelVanityRef.current = cancel;

      worker.onmessage = (event: MessageEvent<{
        type: "progress" | "done" | "error";
        attempts?: number;
        attemptsPerSecond?: number;
        durationMs?: number;
        publicKey?: string;
        secretKey?: number[];
        message?: string;
      }>) => {
        const data = event.data;
        if (data.type === "progress") {
          onProgress({
            attempts: data.attempts ?? 0,
            attemptsPerSecond: data.attemptsPerSecond ?? 0,
          });
          return;
        }
        if (settled) return;
        settled = true;
        cleanup();
        if (data.type === "error" || !data.secretKey || !data.publicKey) {
          reject(new Error(data.message || "Could not generate a pump-style mint. Please try again."));
          return;
        }
        try {
          const keypair = Keypair.fromSecretKey(Uint8Array.from(data.secretKey));
          if (keypair.publicKey.toBase58() !== data.publicKey || !data.publicKey.endsWith("pump")) {
            reject(new Error("Generated mint failed validation. Please try again."));
            return;
          }
          resolve(keypair);
        } catch {
          reject(new Error("Generated mint keypair was invalid. Please try again."));
        }
      };
      worker.onerror = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("Pump address generation failed in this browser. Please retry or use a desktop browser."));
      };
      worker.postMessage({ type: "start", maxAttempts: 60_000_000 });
    });
  }

  async function sendAndConfirm(tx: Transaction | VersionedTransaction, lastValid: number) {
    const raw = tx.serialize();
    const sig = await connection.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 3 });
    // Keep resending the same signed bytes until it lands or the blockhash expires, so a busy network does not drop it.
    await confirmByPolling(connection, sig, lastValid, 90_000, () => connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }));
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

  // Asks the server for a lock transaction with a fresh blockhash and has the wallet sign it.
  async function lockFresh(ticket: string) {
    if (!signTransaction) throw new Error("Wallet cannot sign");
    setStage("prepare");
    const res = await fetch("/api/launch/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || "Could not resume");
    if (j.status === "already_locked") return;
    setStage("sign");
    const signed = await signTransaction(Transaction.from(Buffer.from(j.transaction, "base64")));
    setStage("lock");
    await sendAndConfirm(signed, j.lastValidBlockHeight);
  }

  async function retryLock() {
    if (!pending) return;
    setErr("");
    try {
      await lockFresh(pending.ticket);
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
      const need = 25_000_000 + Math.round((Number(devBuy) || 0) * 1e9) * 1.03;
      if (bal < need) {
        return setErr(`Your wallet has ${(bal / 1e9).toFixed(4)} SOL. This launch needs about ${(need / 1e9).toFixed(3)} SOL. Add SOL first so nothing is wasted.`);
      }
    } catch { /* balance check is best effort */ }
    let ticket = "";
    let mint = "";
    let mintKp: Keypair | null = null;
    let created = false;
    try {
      setStage("vanity");
      setVanityProgress({ attempts: 0, attemptsPerSecond: 0 });
      mintKp = await generatePumpMint(setVanityProgress);
      mint = mintKp.publicKey.toBase58();

      setStage("prepare");
      const fd = new FormData();
      fd.append("mint", mint);
      fd.append("creator", publicKey.toBase58());
      fd.append("name", name);
      fd.append("symbol", symbol);
      fd.append("description", description);
      fd.append("website", website);
      fd.append("twitter", twitter);
      fd.append("telegram", telegram);
      fd.append("devBuy", devBuy);
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
      if (j.mint !== mint) throw new Error("Mint address mismatch. Please retry the launch.");

      setStage("sign");
      const flags = (j.versioned as boolean[]) ?? [];
      const txs = (j.transactions as string[]).map((b, n) =>
        flags[n] ? VersionedTransaction.deserialize(Buffer.from(b, "base64")) : Transaction.from(Buffer.from(b, "base64")),
      );
      const signed = await signAllTransactions(txs as Transaction[]);
      // The vanity mint keypair stays in this browser. Mint signs after the wallet so the
      // wallet cannot invalidate it; the secret key is never sent to the launch API.
      if (!mintKp) throw new Error("Mint keypair is missing. Please retry the launch.");
      const first = signed[0] as Transaction | VersionedTransaction;
      if (first instanceof VersionedTransaction) first.sign([mintKp]);
      else first.partialSign(mintKp);

      setStage("create");
      const firstSig = await sendAndConfirm(signed[0], j.lastValidBlockHeights[0]);
      created = true;
      savePending({ ticket, mint, at: Date.now() });

      setStage("lock");
      // The lock transaction was signed before the coin was created. If the first step took long and its
      // blockhash is about to expire, ask for a fresh one instead of sending a transaction that will fail.
      let nearExpiry = false;
      try {
        nearExpiry = (await connection.getBlockHeight("confirmed")) > j.lastValidBlockHeights[1] - 30;
      } catch { /* best effort */ }
      if (nearExpiry) {
        await lockFresh(ticket);
      } else {
        try {
          await sendAndConfirm(signed[1], j.lastValidBlockHeights[1]);
        } catch (e3) {
          if (!/expired/i.test((e3 as Error).message)) throw e3;
          await lockFresh(ticket);
        }
      }

      await registerUntilVerified(ticket, mint, firstSig);
    } catch (e2) {
      const msg = (e2 as Error).message || "Something went wrong";
      setErr(
        created
          ? `${msg} Your coin exists but the charity split is not locked yet. Use Retry lock below.`
          : `${msg} The coin was not confirmed on chain. Check your wallet history before trying again.`,
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
            <label className="label" htmlFor="devbuy">Dev buy in SOL (optional)</label>
            <div className="flex flex-wrap items-center gap-2">
              <input id="devbuy" className="input max-w-[10rem]" type="number" inputMode="decimal" min="0" max="10" step="0.01" value={devBuy} onChange={(e) => setDevBuy(e.target.value)} placeholder="0" />
              {["0.1", "0.5", "1"].map((v) => (
                <button key={v} type="button" onClick={() => setDevBuy(v)} className={`rounded-full border px-3 py-1.5 text-xs transition ${devBuy === v ? "border-ember bg-ember/10 text-cream" : "border-line text-mute hover:text-cream"}`}>
                  {v} SOL
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-faint">Buys your own coin in the same transaction as the launch, before anyone else can. Leave empty for no dev buy.</p>
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
                <div className="flex items-center gap-3">
                  <CharityLogo slug={c.slug} name={c.name} siteUrl={c.site_url} size={40} />
                  <div className="min-w-0">
                    <div className="font-display font-bold leading-tight">{c.name}</div>
                    <div className="mt-1 text-xs text-mute">{c.cause}</div>
                  </div>
                </div>
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
          <p className="text-xs leading-5 text-mute">
            These percentages split creator fees. Pump.fun's protocol fee is charged separately by Pump.fun and is not
            one of the shareholder percentages above.
          </p>
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

        {busy && stage === "vanity" && (
          <div className="rounded-xl border border-line bg-raise/40 p-4 text-sm">
            <p className="text-cream">Generating a Pump-style address ending in <code>pump</code> on your device.</p>
            <p className="mt-1 text-xs leading-5 text-mute">
              This usually takes a few minutes. Your mint private key stays in your browser.
            </p>
            {vanityProgress.attempts > 0 && (
              <p className="mt-2 font-mono text-xs text-mute">
                {vanityProgress.attempts.toLocaleString()} attempts · {Math.round(vanityProgress.attemptsPerSecond).toLocaleString()} attempts/sec
              </p>
            )}
            <button type="button" className="btn-ghost btn-sm mt-3" onClick={() => cancelVanityRef.current?.()}>
              Cancel generation
            </button>
          </div>
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