import type { Metadata } from "next";
import ExploreClient from "@/components/ExploreClient";
import { getExplore } from "@/lib/data";
import { getCharities } from "@/lib/charities";

export const revalidate = 15;
export const metadata: Metadata = { title: "Explore", description: "Every verified charity coin on give.fun." };

export default async function Explore() {
  const [coins, charities] = await Promise.all([getExplore(), getCharities()]);
  const list = charities.filter((c) => c.active && c.verified).map((c) => ({ slug: c.slug, name: c.name }));
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="eyebrow">Explore</div>
      <h1 className="h-section mt-2">Every charity coin</h1>
      <p className="mt-4 max-w-2xl text-mute">Browse live coins, filter by cause and see how much each one has sent to charity.</p>
      <ExploreClient coins={coins} charities={list} />
    </div>
  );
}