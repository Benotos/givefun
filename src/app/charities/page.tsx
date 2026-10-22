import type { Metadata } from "next";
import CharityCard from "@/components/CharityCard";
import Reveal from "@/components/Reveal";
import { getCharities } from "@/lib/charities";

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
          <Reveal key={c.slug} delay={(i % 3) * 70}>
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
    </div>
  );
}
