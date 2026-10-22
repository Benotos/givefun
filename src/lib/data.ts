import { store, isDemo } from "./store";
import type { Coin, Flags, Payout } from "./store";
import { getSnapshot, publishSnapshot } from "./snapshot";
import { loadCharitiesFresh, getCharities } from "./charities";
import type { Charity } from "./charities";

/**
 * Everything the public site reads comes through here, and every function is snapshot backed.
 * Visitors never trigger a database query. The worker refreshes snapshots every 10s,
 * and the first request after expiry refreshes one if the worker is down.
 */

export type ActivityEvent = {
  id: string;
  type: "launch" | "donation";
  at: string;
  mint: string;
  name: string;
  symbol: string;
  charitySlug: string;
  charityName: string;
  lamports?: number;
  signature?: string;
};

export type HomeData = {
  stats: { coins: number; lamports: number; charities: number };
  latest: Coin[];
  top: Coin[];
  topCharities: Charity[];
  activity: ActivityEvent[];
  generatedAt: number;
};

export const EMPTY_HOME: HomeData = {
  stats: { coins: 0, lamports: 0, charities: 0 },
  latest: [],
  top: [],
  topCharities: [],
  activity: [],
  generatedAt: 0,
};

export async function loadHome(): Promise<HomeData> {
  const s = store();
  if (isDemo()) await s.demoTick?.();

  const [charities, latest, top, payouts] = await Promise.all([
    loadCharitiesFresh(),
    s.listCoins({ limit: 24, order: "new" }),
    s.listCoins({ limit: 6, order: "donated" }),
    s.recentPayouts(20),
  ]);

  const byslug = new Map(charities.map((c) => [c.slug, c]));
  const name = (slug: string) => byslug.get(slug)?.name ?? slug;

  const events: ActivityEvent[] = [
    ...latest.slice(0, 15).map((c): ActivityEvent => ({
      id: `l:${c.mint}`,
      type: "launch",
      at: c.verified_at ?? c.created_at,
      mint: c.mint,
      name: c.name,
      symbol: c.symbol,
      charitySlug: c.charity_slug,
      charityName: name(c.charity_slug),
    })),
    ...payouts.map((p): ActivityEvent => ({
      id: `p:${p.signature}`,
      type: "donation",
      at: p.created_at,
      mint: p.mint,
      name: p.coin_name,
      symbol: p.coin_symbol,
      charitySlug: p.charity_slug,
      charityName: name(p.charity_slug),
      lamports: p.lamports,
      signature: p.signature,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 30);

  const live = charities.filter((c) => c.verified && c.active);
  const stats = {
    coins: charities.reduce((a, c) => a + c.coins, 0),
    lamports: charities.reduce((a, c) => a + c.lamports, 0),
    charities: live.length,
  };

  const topCharities = [...live].sort((a, b) => b.lamports - a.lamports).slice(0, 6);
  return { stats, latest, top, topCharities, activity: events, generatedAt: Date.now() };
}

export async function getExplore(): Promise<Coin[]> {
  const r = await getSnapshot<Coin[]>("explore", {
    softSec: 15,
    loader: () => store().listCoins({ limit: 120, order: "new" }),
    fallback: [],
  });
  return r.data;
}

export async function getHome(): Promise<HomeData> {
  const r = await getSnapshot("home", { softSec: 10, loader: loadHome, fallback: EMPTY_HOME });
  return r.data;
}

/** Called by the worker so visitors almost never rebuild anything themselves. */
export async function refreshPublicSnapshots(): Promise<void> {
  const s = store();
  const [home, charities, flags, explore] = await Promise.all([
    loadHome(),
    loadCharitiesFresh(),
    s.getFlags(),
    s.listCoins({ limit: 120, order: "new" }),
  ]);
  await Promise.all([
    publishSnapshot("home", home),
    publishSnapshot("explore", explore),
    publishSnapshot("charities", charities),
    publishSnapshot("flags", flags),
  ]);
}

export async function getFlags(): Promise<Flags> {
  const r = await getSnapshot<Flags>("flags", {
    softSec: 5,
    loader: () => store().getFlags(),
    fallback: { launchPaused: false, banner: "" },
  });
  return r.data;
}

export type CoinPageData =
  | { found: false; unavailable?: boolean }
  | { found: true; coin: Coin; payouts: Payout[] };

export async function getCoinPage(mint: string): Promise<CoinPageData> {
  const r = await getSnapshot<CoinPageData>(`coin:${mint}`, {
    softSec: 15,
    hardSec: 3600,
    loader: async () => {
      const coin = await store().getCoin(mint);
      if (!coin || coin.status === "hidden") return { found: false } as const;
      const payouts = await store().listPayouts(mint, 50);
      return { found: true, coin, payouts } as const;
    },
    // Database down and nothing cached: say unavailable, never claim the coin does not exist.
    fallback: { found: false, unavailable: true },
  });
  return r.data;
}

export { getCharities };