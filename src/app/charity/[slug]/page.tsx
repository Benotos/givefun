import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CoinCard from "@/components/CoinCard";
import CopyButton from "@/components/CopyButton";
import Counter from "@/components/Counter";
import Icon from "@/components/Icon";
import { getCharity } from "@/lib/charities";
import { store } from "@/lib/store";
import { getSnapshot } from "@/lib/snapshot";
import type { Coin } from "@/lib/store";
import { shortAddr } from "@/lib/format";
import { solscanAddr } from "@/lib/config";

export const revalidate = 30;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const c = await getCharity(params.slug);
  return { title: c?.name ?? "Charity", description: c?.blurb || undefined };
}

export default async function CharityPage({ params }: { params: { slug: string } }) {
  const c = await getCharity(params.slug);
  if (!c || !c.active) notFound();

  const coins = (
    await getSnapshot<Coin[]>(`charity-coins:${c.slug}`, {
      softSec: 30,
      loader: () => store().listCoins({ limit: 48, charitySlug: c.slug, order: "donated" }),
      fallback: [],
    })
  ).data;

  const live = c.verified;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="eyebrow">{c.cause || "Charity"}</div>
      <h1 className="h-section mt-2">{c.name}</h1>
      {c.blurb && <p className="mt-4 max-w-2xl text-mute">{c.blurb}</p>}

      <div className="mt-10 grid gap-4 md:grid-cols-[1fr_1.4fr]">
        <div className="card p-6">
          <div className="font-display text-5xl font-extrabold text-amber">
            <Counter value={c.lamports / 1e9} decimals={2} />
          </div>
          <div className="mt-1 text-sm text-mute">SOL received on chain</div>
          <div className="mt-5 text-sm text-mute">
            From <b className="text-cream">{c.coins}</b> coin{c.coins === 1 ? "" : "s"}
          </div>
        </div>

        <div className="card p-6 text-sm">
          <div className="label">Official wallet</div>
          {live && c.wallet ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <a href={solscanAddr(c.wallet)} target="_blank" rel="noreferrer" className="mono break-all text-ember hover:underline">
                  {c.wallet}
                </a>
                <CopyButton text={c.wallet} />
              </div>
              <div className="mt-4 flex flex-wrap gap-4">
                {c.wallet_source_url && (
                  <a href={c.wallet_source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-ember hover:underline">
                    Where the charity publishes it <Icon name="external" size={13} />
                  </a>
                )}
                {c.site_url && (
                  <a href={c.site_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-ember hover:underline">
                    Website <Icon name="external" size={13} />
                  </a>
                )}
              </div>
              <p className="mt-4 text-xs text-faint">{shortAddr(c.wallet, 6)} is the only address this charity ever receives donations on.</p>
            </>
          ) : (
            <p className="text-mute">This wallet is still being verified from the charity's own site. Launching to it is disabled until then.</p>
          )}
        </div>
      </div>

      <h2 className="mb-5 mt-14 font-display text-2xl font-bold">Coins supporting this charity</h2>
      {coins.length === 0 ? (
        <div className="card p-10 text-center text-mute">No coins yet.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {coins.map((x) => (
            <CoinCard key={x.mint} coin={x} charityName={c.name} />
          ))}
        </div>
      )}
    </div>
  );
}
