import type { Metadata } from "next";
import CharityCard from "@/components/CharityCard";
import Reveal from "@/components/Reveal";
import { getCharities } from "@/lib/charities";
import { X_URL } from "@/lib/config";
import Icon from "@/components/Icon";
import XIcon from "@/components/XIcon";

export const revalidate = 30;
export const metadata: Metadata = { title: "Charities", description: "Every charity wallet is copied from the charity's own official page." };

export default async function Charities() {
  const all = (await getCharities()).filter((c) => c.active);
  const live = all.filter((c) => c.verified).sort((a, b) => b.lamports - a.lamports);
  const pending = all.filter((c) => !c.verified);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="eyebrow">Charities</div>
      <h1 className="h-section mt-2">Every wallet has a source</h1>
      <p className="mt-4 max-w-2xl text-mute">
        We copy each charity wallet from the charity's own official page and link that page publicly. Donations go straight
        there. We never hold them.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {live.length === 0 && <div className="card col-span-full p-10 text-center text-mute">No verified charities yet.</div>}
        {live.map((c, i) => (
          <Reveal key={c.slug} delay={(i % 3) * 70} className="h-full">
            <CharityCard c={c} />
          </Reveal>
        ))}
      </div>

      {pending.length > 0 && (
        <>
          <h2 className="mb-4 mt-14 font-display text-xl font-bold text-mute">Being verified</h2>
          <div className="grid gap-4 opacity-70 sm:grid-cols-2 lg:grid-cols-3">
            {pending.map((c) => (
              <CharityCard key={c.slug} c={c} />
            ))}
          </div>
        </>
      )}

      <section className="mt-16 overflow-hidden rounded-2xl border border-line bg-panel/60 px-5 py-6 sm:px-7 sm:py-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <div className="eyebrow">More coming soon</div>
            <h2 className="mt-2 font-display text-xl font-bold sm:text-2xl">More charities are on the way.</h2>
            <p className="mt-2 text-sm leading-6 text-mute">
              We're reviewing more organisations and checking their official Solana donation wallets before listing them.
            </p>
          </div>
          <div className="shrink-0 sm:max-w-xs">
            <p className="mb-3 text-sm font-semibold text-cream">Want your charity listed on Give.fun?</p>
            <a
              href={X_URL}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-sm"
            >
              <XIcon size={14} /> Apply to become a partner <Icon name="external" size={13} />
            </a>
            <p className="mt-2 text-xs leading-5 text-faint">Reach out on X to start the verification process.</p>
          </div>
        </div>
      </section>
    </div>
  );
}