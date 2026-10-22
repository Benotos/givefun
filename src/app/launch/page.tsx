import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { getCharities, getFlags } from "@/lib/data";
import { isSelectable } from "@/lib/charities";
import { platformBps } from "@/lib/config";

// Wallet code is browser only. Keep it out of the server bundle.
const LaunchClient = dynamic(() => import("@/components/LaunchClient"), {
  ssr: false,
  loading: () => <div className="card skeleton h-96" />,
});

export const revalidate = 10;
export const metadata: Metadata = { title: "Launch a coin", description: "Launch a coin on pump.fun with the charity split locked on chain." };

export default async function Launch() {
  const [all, flags] = await Promise.all([getCharities(), getFlags()]);
  const charities = all.filter(isSelectable).map((c) => ({ slug: c.slug, name: c.name, cause: c.cause, blurb: c.blurb, site_url: c.site_url }));
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="eyebrow">Launch</div>
      <h1 className="h-section mt-2">Launch a charity coin</h1>
      <p className="mb-10 mt-3 max-w-xl text-mute">Your coin goes live on pump.fun with the charity split locked on chain.</p>
      <LaunchClient charities={charities} platformBps={platformBps()} paused={flags.launchPaused} />
    </div>
  );
}