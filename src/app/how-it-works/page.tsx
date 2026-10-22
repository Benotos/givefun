import type { Metadata } from "next";
import Icon from "@/components/Icon";
import Faq from "@/components/Faq";
import Reveal from "@/components/Reveal";
import Link from "next/link";

export const metadata: Metadata = { title: "How it works", description: "A locked on chain split, no custom contract, every payout public." };

const TRUST = [
  { t: "No custom contract", d: "We use pump.fun's own creator fee sharing. There is no give.fun contract to get exploited." },
  { t: "Locked on chain", d: "The split is written and locked in the same launch. The dev cannot change it or touch the charity share." },
  { t: "We never hold funds", d: "Fees flow from pump.fun straight to the charity's wallet. Our worker only presses the permissionless distribute button." },
  { t: "Verified continuously", d: "A coin shows as verified only while its on chain split matches. We re check every minute and pull the badge if it changes." },
];

const FAQ = [
  { q: "What is pump.fun creator fee sharing?", a: "Since January 2026 a coin's creator fees can be split between up to 10 wallets by percentage. Once set and locked, the dev can no longer redirect them." },
  { q: "What is the catch with community takeovers?", a: "pump.fun has a community takeover feature that can override fee settings on a coin. We cannot stop that, but we watch every coin and remove the verified badge automatically if a locked split ever changes." },
  { q: "How much does a coin raise?", a: "The creator fee is a small share of each trade, so it depends on trading volume. A coin that trades 100,000 dollars sends roughly a few hundred dollars in creator fees across everyone in the split." },
  { q: "Why do you copy wallets from the charity's own site?", a: "So nobody, including us, can swap in a wallet. Each charity page links the official source so you can check it yourself." },
];

export default function How() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="eyebrow">How it works</div>
      <h1 className="h-section mt-2">Donations you can verify yourself</h1>
      <p className="mt-4 max-w-2xl text-mute">
        Most charity coins ask you to trust the dev. give.fun removes the trust. The split is on chain, locked, and every payout
        is a public transaction.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {TRUST.map((x, i) => (
          <Reveal key={x.t} delay={i * 70}>
            <div className="card h-full p-6">
              <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-mint/10 text-mint">
                <Icon name="shield" size={19} />
              </span>
              <h3 className="font-display text-lg font-bold">{x.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mute">{x.d}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <h2 className="mb-5 mt-16 font-display text-2xl font-bold">The launch, step by step</h2>
      <ol className="space-y-3">
        {[
          "You pick a verified charity and the percent of creator fees it receives, from 50 to 100.",
          "We build two transactions. The first creates your coin on pump.fun. The second sets and locks the fee split.",
          "Your wallet signs both. We never see your keys and never hold funds.",
          "We read the split back from the chain and list your coin only if it matches.",
          "As the coin trades, our worker triggers payouts. The charity wallet receives them directly.",
        ].map((s, i) => (
          <li key={s} className="card flex gap-4 p-5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ember/10 font-display font-bold text-ember">{i + 1}</span>
            <span className="text-sm leading-relaxed text-mute">{s}</span>
          </li>
        ))}
      </ol>

      <h2 className="mb-5 mt-16 font-display text-2xl font-bold">Honest answers</h2>
      <Faq items={FAQ} />

      <div className="mt-14 text-center">
        <Link href="/launch" className="btn px-8 py-3.5 text-base">
          Launch a coin <Icon name="arrow" size={16} />
        </Link>
      </div>
    </div>
  );
}
