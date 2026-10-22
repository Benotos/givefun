import Link from "next/link";
import CoinCard from "@/components/CoinCard";
import CharityCard from "@/components/CharityCard";
import Counter from "@/components/Counter";
import Faq from "@/components/Faq";
import HeroCanvas from "@/components/HeroCanvas";
import Icon from "@/components/Icon";
import LiveFeed from "@/components/LiveFeed";
import Reveal from "@/components/Reveal";
import Ticker from "@/components/Ticker";
import { getCharities, getHome } from "@/lib/data";

export const revalidate = 10;

const STEPS = [
  { icon: "heart" as const, t: "Pick a verified charity", d: "Every wallet is copied from the charity's own site, with the source link shown publicly." },
  { icon: "layers" as const, t: "Choose your share", d: "Send 50 to 100 percent of your creator fees to the cause. You keep whatever is left." },
  { icon: "lock" as const, t: "Launch and lock", d: "Your wallet signs. The split is written on chain and locked before the first trade." },
  { icon: "eye" as const, t: "Watch it pay out", d: "pump.fun sends fees straight to the charity. Every payout is a public transaction." },
];

const FAQ = [
  { q: "Do you ever hold the donations?", a: "No. Fees go from pump.fun directly to the charity's own wallet. We have no custody and no custom contract." },
  { q: "Can the dev change the split after launch?", a: "No. The split is locked on chain right after the coin is created. If it ever changes, for example through a pump.fun community takeover, we remove the verified badge automatically." },
  { q: "How do you know a charity wallet is real?", a: "Each wallet is copied from the charity's own official page. We show that source link on the charity page so anyone can check it." },
  { q: "How much will a coin actually raise?", a: "Creator fees are a small slice of trading volume, so donations scale with how much the coin trades. Nothing is guaranteed and we never promise returns." },
];

export default async function Home() {
  const [h, charities] = await Promise.all([getHome(), getCharities()]);
  const names = new Map(charities.map((c) => [c.slug, c.name]));
  const sol = h.stats.lamports / 1e9;

  return (
    <div>
      {/* HERO */}
      <section className="relative isolate overflow-hidden">
        <HeroCanvas className="[mask-image:linear-gradient(to_bottom,#000_60%,transparent)]" />
        <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-14 text-center sm:px-6 sm:pt-24">
          <div className="chip mx-auto animate-fadeUp">
            <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-mint" /> Live on Solana
          </div>
          <h1 className="mx-auto mt-7 max-w-4xl animate-fadeUp text-[2.8rem] font-extrabold leading-[1.02] [animation-delay:80ms] sm:text-7xl">
            Memecoins that <span className="bg-gradient-to-r from-amber via-ember to-rose bg-clip-text text-transparent">give back.</span>
            <br />
            Provably.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl animate-fadeUp text-base text-mute [animation-delay:160ms] sm:text-lg">
            Launch a coin on pump.fun where up to 100% of creator fees go straight to a verified charity wallet.
            Locked on chain. Every payout is public.
          </p>
          <div className="mt-9 flex animate-fadeUp flex-col items-center justify-center gap-3 [animation-delay:240ms] sm:flex-row">
            <Link href="/launch" className="btn px-7 py-3.5 text-base">
              Launch a coin <Icon name="arrow" size={16} />
            </Link>
            <Link href="/how-it-works" className="btn-ghost px-7 py-3.5 text-base">
              How it works
            </Link>
          </div>

          <div className="mx-auto mt-14 max-w-xl animate-fadeUp rounded-3xl border border-line bg-panel/70 p-6 shadow-lift backdrop-blur [animation-delay:320ms]">
            <div className="font-display text-5xl font-extrabold tracking-tight text-amber sm:text-6xl">
              <Counter value={sol} decimals={2} />
              <span className="ml-2 text-2xl text-cream sm:text-3xl">SOL</span>
            </div>
            <div className="mt-1.5 text-sm text-mute">given to charity on chain so far</div>
          </div>
        </div>
        <div className="relative pb-8">
          <Ticker events={h.activity} />
        </div>
      </section>

      {/* STATS */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { v: h.stats.coins, l: "verified coins", icon: "shield" as const },
            { v: h.stats.charities, l: "verified charities", icon: "heart" as const },
            { v: 100, l: "percent of payouts public", icon: "eye" as const, suffix: "%" },
          ].map((s, i) => (
            <Reveal key={s.l} delay={i * 80}>
              <div className="card flex items-center gap-4 p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ember/10 text-ember">
                  <Icon name={s.icon} size={20} />
                </span>
                <div>
                  <div className="font-display text-3xl font-extrabold">
                    <Counter value={s.v} />
                    {s.suffix}
                  </div>
                  <div className="text-xs text-mute">{s.l}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* LIVE + LEADERBOARD */}
      <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr]">
          <Reveal>
            <div className="mb-5 flex items-center gap-3">
              <h2 className="h-section !text-2xl sm:!text-3xl">Happening now</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-mint/10 px-2.5 py-1 text-[11px] font-semibold text-mint">
                <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-mint" /> LIVE
              </span>
            </div>
            <LiveFeed initial={{ stats: h.stats, activity: h.activity, generatedAt: h.generatedAt }} />
          </Reveal>
          <Reveal delay={100}>
            <h2 className="h-section mb-5 !text-2xl sm:!text-3xl">Top charities</h2>
            <div className="space-y-3">
              {h.topCharities.length === 0 && <div className="card p-6 text-sm text-mute">Charities appear here once verified.</div>}
              {h.topCharities.slice(0, 4).map((c, i) => (
                <CharityCard key={c.slug} c={c} rank={i + 1} />
              ))}
              {h.topCharities.length > 0 && (
                <Link href="/charities" className="btn-ghost w-full">
                  See all charities <Icon name="arrow" size={14} />
                </Link>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      {/* LATEST COINS */}
      <section className="mx-auto mt-24 max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="mb-6 flex items-end justify-between">
            <div>
              <div className="eyebrow">Fresh launches</div>
              <h2 className="h-section mt-2">Verified coins</h2>
            </div>
            <Link href="/launch" className="btn-ghost btn-sm hidden sm:inline-flex">
              Launch yours <Icon name="arrow" size={13} />
            </Link>
          </div>
        </Reveal>
        {h.latest.length === 0 ? (
          <div className="card p-10 text-center text-mute">No coins yet. Be the first to launch.</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {h.latest.slice(0, 9).map((c, i) => (
              <Reveal key={c.mint} delay={(i % 3) * 70}>
                <CoinCard coin={c} charityName={names.get(c.charity_slug)} />
              </Reveal>
            ))}
          </div>
        )}
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto mt-28 max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="eyebrow">How it works</div>
          <h2 className="h-section mt-2 max-w-xl">Four steps. No trust required.</h2>
        </Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.t} delay={i * 80}>
              <div className="card h-full p-6">
                <div className="mb-5 flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ember/10 text-ember">
                    <Icon name={s.icon} size={20} />
                  </span>
                  <span className="font-mono text-xs text-faint">0{i + 1}</span>
                </div>
                <h3 className="font-display text-lg font-bold">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mute">{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto mt-28 max-w-3xl px-4 sm:px-6">
        <Reveal>
          <h2 className="h-section mb-6 text-center">Questions</h2>
          <Faq items={FAQ} />
        </Reveal>
      </section>

      {/* CTA */}
      <section className="mx-auto mb-24 mt-28 max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-ember/25 bg-gradient-to-br from-ember/15 via-panel to-panel p-10 text-center sm:p-16">
            <h2 className="mx-auto max-w-2xl font-display text-3xl font-extrabold sm:text-5xl">Your coin can do some good.</h2>
            <p className="mx-auto mt-4 max-w-lg text-mute">Pick a cause, set the split, and launch in under two minutes.</p>
            <Link href="/launch" className="btn mt-8 px-8 py-3.5 text-base">
              Launch a coin <Icon name="arrow" size={16} />
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
