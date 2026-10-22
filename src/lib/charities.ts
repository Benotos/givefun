import { PublicKey } from "@solana/web3.js";
import { CHARITY_SEED } from "@/data/charities";
import { store } from "./store";
import type { CharityRow } from "./store";
import { getSnapshot } from "./snapshot";

export type Charity = CharityRow & { coins: number; lamports: number };

export function validWallet(w: string): boolean {
  if (!w || w.length < 32 || w.length > 44) return false;
  try {
    new PublicKey(w);
    return true;
  } catch {
    return false;
  }
}

/** A charity can be picked at launch only when verified, active and the wallet parses. */
export const isSelectable = (c: Pick<CharityRow, "verified" | "active" | "wallet">) =>
  c.verified && c.active && validWallet(c.wallet);

/** Fresh read straight from the store. Used by write paths (launch, admin), never by public pages. */
export async function loadCharitiesFresh(): Promise<Charity[]> {
  const [rows, totals] = await Promise.all([store().listCharities(), store().charityTotals()]);
  const by = new Map(totals.map((t) => [t.charity_slug, t]));
  return rows.map((r) => ({
    ...r,
    coins: by.get(r.slug)?.coins ?? 0,
    lamports: by.get(r.slug)?.lamports ?? 0,
  }));
}

/** Public read. Snapshot backed, so traffic never touches the database. */
export async function getCharities(): Promise<Charity[]> {
  const r = await getSnapshot<Charity[]>("charities", {
    softSec: 30,
    loader: loadCharitiesFresh,
    fallback: [],
  });
  return r.data;
}

export async function getCharity(slug: string): Promise<Charity | null> {
  return (await getCharities()).find((c) => c.slug === slug) ?? null;
}

/** First worker start on an empty database: insert placeholder rows so admin has something to edit. */
export async function seedCharitiesIfEmpty(): Promise<number> {
  const s = store();
  if (!s.writable) return 0;
  const existing = await s.listCharities();
  if (existing.length > 0) return 0;
  for (const c of CHARITY_SEED) {
    await s.upsertCharity({ ...c, site_url: "", wallet: "", wallet_source_url: "", verified: false, active: true });
  }
  return CHARITY_SEED.length;
}
