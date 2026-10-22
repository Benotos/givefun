import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { feeSharingConfigPda } from "@pump-fun/pump-sdk";
import { getCoinPage } from "@/lib/data";
import { getCharity } from "@/lib/charities";
import { fmtSol, shortAddr, timeAgo } from "@/lib/format";
import { SITE_URL, solscanAddr, solscanToken, solscanTx } from "@/lib/config";
import CoinAvatar from "@/components/CoinAvatar";
import CopyButton from "@/components/CopyButton";
import Counter from "@/components/Counter";
import Donut from "@/components/Donut";
import Icon from "@/components/Icon";
import PriceChart from "@/components/PriceChart";
import { segsFor } from "@/components/SplitBar";
import VerifiedBadge from "@/components/VerifiedBadge";

export const revalidate = 15;

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function generateMetadata({ params }: { params: { mint: string } }): Promise<Metadata> {
  if (!BASE58.test(params.mint)) return { title: "Coin" };
  const d = await getCoinPage(params.mint);
  if (!d.found) return { title: "Coin" };
  const title = `${d.coin.name} (${d.coin.symbol})`;
  const description = `${d.coin.charity_bps / 100}% of creator fees go to charity, locked on chain.`;
  return {
    title,
    description,
    alternates: { canonical: `/coin/${d.coin.mint}` },
    openGraph: { title, description, url: `/coin/${d.coin.mint}`, type: "website" },
  };
}

export default async function CoinPage({ params }: { params: { mint: string } }) {
  if (!BASE58.test(params.mint)) notFound();
  const d = await getCoinPage(params.mint);

  if (!d.found) {
    if (d.unavailable) {
      return (
        <div className="mx-auto max-w-xl px-4 py-32 text-center">
          <h1 className="font-display text-3xl font-bold">Temporarily unavailable</h1>
          <p className="mt-3 text-mute">We could not load this coin right now. Refresh in a few seconds.</p>
        </div>
      );
    }
    notFound();
  }

  const { coin, payouts } = d;
  const charity = await getCharity(coin.charity_slug);
  const verified = coin.status === "verified";
  const segs = segsFor(coin.charity_bps, coin.platform_bps);
  const devBps = 10000 - coin.charity_bps - coin.platform_bps;

  let cfg = "";
  try {
    cfg = feeSharingConfigPda(new PublicKey(coin.mint)).toBase58();
  } catch {
    /* ignore */
  }

  const tweet = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    `${coin.name} sends ${coin.charity_bps / 100}% of its creator fees to ${charity?.name ?? "charity"}. Locked on chain.`,
  )}&url=${encodeURIComponent(`${SITE_URL}/coin/${coin.mint}`)}`;

  const checks = [
    { ok: verified, t: "Split is locked on chain", d: "The dev cannot change who gets paid." },
    { ok: verified, t: "Charity wallet matches the official page", d: charity?.wallet_source_url ? "Source link below." : "Sourced from the charity." },
    { ok: coin.charity_bps >= 5000, t: `Charity gets ${coin.charity_bps / 100}% of creator fees`, d: "The minimum on give.fun is 50%." },
    { ok: verified, t: "Re checked continuously", d: coin.last_checked_at ? `Last check ${timeAgo(coin.last_checked_at)}.` : "Checks run every minute." },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {/* header */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <CoinAvatar mint={coin.mint} symbol={coin.symbol} image={coin.image_url} size={84} rounded="rounded-3xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-extrabold sm:text-4xl">{coin.name}</h1>
            <VerifiedBadge status={coin.status === "hidden" ? "hidden" : coin.status} />
          </div>
          <div className="mt-1.5 text-mute" suppressHydrationWarning>${coin.symbol} · launched {timeAgo(coin.created_at)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={solscanToken(coin.mint)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
            Solscan <Icon name="external" size={13} />
          </a>
          <a href={tweet} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
            Share
          </a>
          <a href={`https://pump.fun/coin/${coin.mint}`} target="_blank" rel="noreferrer" className="btn btn-sm">
            Trade on pump.fun <Icon name="external" size={13} />
          </a>
        </div>
      </div>

      {!verified && coin.fail_reason && (
        <div className="mt-6 rounded-2xl border border-rose/30 bg-rose/10 p-4 text-sm text-rose">{coin.fail_reason}</div>
      )}
      {coin.description && <p className="mt-6 max-w-2xl text-mute">{coin.description}</p>}

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <PriceChart mint={coin.mint} symbol={coin.symbol} />
          {/* split */}
          <section className="card p-6 sm:p-8">
            <h2 className="font-display text-xl font-bold">Where creator fees go</h2>
            <div className="mt-6 flex flex-col items-center gap-8 sm:flex-row">
              <Donut
                segs={segs}
                center={
                  <>
                    <div className="font-display text-4xl font-extrabold text-ember">{coin.charity_bps / 100}%</div>
                    <div className="text-[11px] uppercase tracking-wider text-mute">to charity</div>
                  </>
                }
              />
              <ul className="w-full space-y-3 text-sm">
                {segs.map((s) => (
                  <li key={s.label} className="flex items-center justify-between rounded-xl border border-line bg-raise/50 px-4 py-3">
                    <span className="inline-flex items-center gap-2.5">
                      <i className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                      {s.label === "Charity" ? charity?.name ?? "Charity" : s.label === "Dev" ? "Coin creator" : "Platform wallet"}
                    </span>
                    <b className="font-display text-base">{s.bps / 100}%</b>
                  </li>
                ))}
                {devBps === 0 && <li className="text-xs text-mute">The creator keeps none of the fees on this coin.</li>}
              </ul>
            </div>
            <p className="mt-4 text-xs leading-5 text-mute">
              This is the locked distribution of creator fees for this coin. Pump.fun protocol fees are charged separately
              by Pump.fun and are not the same as a shareholder percentage in this split.
            </p>
          </section>

          {/* payouts */}
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between p-6 pb-4">
              <h2 className="font-display text-xl font-bold">Payouts</h2>
              <div className="text-right">
                <div className="font-display text-2xl font-extrabold text-amber">
                  <Counter value={coin.total_donated_lamports / 1e9} decimals={3} /> SOL
                </div>
                <div className="text-[11px] uppercase tracking-wider text-faint">donated so far</div>
              </div>
            </div>
            {payouts.length === 0 ? (
              <div className="border-t border-line p-8 text-center text-sm text-mute">
                No payouts yet. They appear as soon as trading fees accrue and are distributed.
              </div>
            ) : (
              <div className="overflow-x-auto border-t border-line">
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-wider text-faint">
                    <tr>
                      <th className="px-6 py-3 font-semibold">When</th>
                      <th className="px-3 py-3 font-semibold">Amount</th>
                      <th className="px-6 py-3 text-right font-semibold">Transaction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((p) => (
                      <tr key={p.signature} className="border-t border-line/70">
                        <td className="px-6 py-3 text-mute" suppressHydrationWarning>{timeAgo(p.created_at)}</td>
                        <td className="px-3 py-3 font-semibold text-amber">{fmtSol(p.lamports)} SOL</td>
                        <td className="px-6 py-3 text-right">
                          <a className="mono text-ember hover:underline" href={solscanTx(p.signature)} target="_blank" rel="noreferrer">
                            {shortAddr(p.signature, 6)}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          {/* verification */}
          <section className="card p-6">
            <h2 className="font-display text-xl font-bold">Verification</h2>
            <ul className="mt-5 space-y-4">
              {checks.map((c) => (
                <li key={c.t} className="flex gap-3">
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      c.ok ? "bg-mint/15 text-mint" : "bg-rose/15 text-rose"
                    }`}
                  >
                    <Icon name={c.ok ? "check" : "alert"} size={13} />
                  </span>
                  <div>
                    <div className="text-sm font-semibold">{c.t}</div>
                    <div className="text-xs text-mute">{c.d}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* check yourself */}
          <section className="card p-6">
            <h2 className="font-display text-xl font-bold">Check it yourself</h2>
            <dl className="mt-4 space-y-4 text-sm">
              {[
                { k: "Token", v: coin.mint, href: solscanToken(coin.mint) },
                { k: "Fee split account", v: cfg, href: cfg ? solscanAddr(cfg) : undefined },
                { k: "Charity wallet", v: coin.charity_wallet, href: solscanAddr(coin.charity_wallet) },
              ].map((r) => (
                <div key={r.k}>
                  <dt className="label !mb-1">{r.k}</dt>
                  <dd className="flex items-center justify-between gap-2">
                    {r.href ? (
                      <a href={r.href} target="_blank" rel="noreferrer" className="mono truncate text-ember hover:underline">
                        {shortAddr(r.v, 8)}
                      </a>
                    ) : (
                      <span className="mono">{shortAddr(r.v, 8)}</span>
                    )}
                    <CopyButton text={r.v} />
                  </dd>
                </div>
              ))}
              {charity?.wallet_source_url && (
                <div>
                  <dt className="label !mb-1">Wallet published by the charity</dt>
                  <dd>
                    <a href={charity.wallet_source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-ember hover:underline">
                      Official source <Icon name="external" size={13} />
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {charity && (
            <Link href={`/charity/${charity.slug}`} className="card card-hover block p-6">
              <div className="label">Supporting</div>
              <div className="font-display text-lg font-bold">{charity.name}</div>
              <div className="mt-1 text-xs text-mute">{charity.cause}</div>
              {charity.blurb && <p className="mt-3 text-sm text-mute">{charity.blurb}</p>}
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}