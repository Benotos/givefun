import { Keypair } from "@solana/web3.js";
import type {
  AuditEntry,
  CharityRow,
  CharityTotal,
  Coin,
  CoinCounts,
  Flags,
  ListCoinsOpts,
  Payout,
  PayoutWithCoin,
  Store,
} from "./types";

/**
 * In memory store. Two uses:
 *  1. DEMO_MODE=1: seeded with fictional data so previews and tests show a full, moving site.
 *  2. No database configured: empty and read only, so the site still renders instead of crashing.
 * State lives on globalThis so Next dev reloads do not wipe it.
 */

type MemState = {
  coins: Map<string, Coin>;
  payouts: Payout[];
  charities: Map<string, CharityRow>;
  flags: Flags;
  audit: AuditEntry[];
  auditSeq: number;
  seeded: boolean;
};

const g = globalThis as unknown as { __giveMem?: MemState };

function state(): MemState {
  if (!g.__giveMem) {
    g.__giveMem = {
      coins: new Map(),
      payouts: [],
      charities: new Map(),
      flags: { launchPaused: false, banner: "" },
      audit: [],
      auditSeq: 0,
      seeded: false,
    };
  }
  return g.__giveMem;
}

const nowIso = () => new Date().toISOString();
const addr = (n: number) => Keypair.fromSeed(new Uint8Array(32).fill(n % 255 || 1)).publicKey.toBase58();
const fakeSig = (n: number) => addr(n + 40) + addr(n + 90);

// Small deterministic PRNG so the demo looks the same on every start.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const DEMO_CHARITIES: Pick<CharityRow, "slug" | "name" | "cause" | "blurb">[] = [
  { slug: "clearwater-collective", name: "Clearwater Collective", cause: "Clean water", blurb: "Builds wells and filtration for villages without safe drinking water." },
  { slug: "paws-and-hope", name: "Paws & Hope Rescue", cause: "Animal rescue", blurb: "Rescues, treats and rehomes abandoned dogs and cats." },
  { slug: "bright-futures-fund", name: "Bright Futures Fund", cause: "Education", blurb: "Scholarships and school supplies for children who would otherwise drop out." },
  { slug: "reef-guardians", name: "Reef Guardians", cause: "Ocean", blurb: "Restores coral reefs and cleans coastlines." },
  { slug: "open-table-kitchens", name: "Open Table Kitchens", cause: "Hunger", blurb: "Community kitchens serving free hot meals every day." },
  { slug: "wild-roots-trust", name: "Wild Roots Trust", cause: "Reforestation", blurb: "Plants native trees and protects forest corridors." },
];

const DEMO_COINS = [
  ["Pawsitive", "PAWS", 0], ["Wetter Water", "WETTER", 1], ["Moon Meals", "MEALS", 4], ["Reef Rangers", "REEF", 3],
  ["Kind Kong", "KONG", 1], ["Seedling", "SEED", 5], ["Hug Coin", "HUG", 2], ["Ladle", "LADLE", 4],
  ["Barkcoin", "BARK", 0], ["Tidal", "TIDAL", 3], ["Sprout Inu", "SPROUT", 5], ["Hearth", "HEARTH", 4],
  ["Good Boy", "GOODBOY", 0], ["Rainmaker", "RAIN", 1], ["Pencil Pals", "PENCIL", 2], ["Canopy", "CANOPY", 5],
] as const;

function seed(s: MemState) {
  if (s.seeded) return;
  s.seeded = true;
  const r = rng(7);
  const now = Date.now();

  DEMO_CHARITIES.forEach((c, i) => {
    s.charities.set(c.slug, {
      ...c,
      site_url: `https://example.org/${c.slug}`,
      wallet: addr(i + 1),
      wallet_source_url: `https://example.org/${c.slug}/donate`,
      verified: true,
      active: true,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  });

  DEMO_COINS.forEach(([name, symbol, ci], i) => {
    const ch = DEMO_CHARITIES[ci];
    const charity = s.charities.get(ch.slug)!;
    const bps = [5000, 6000, 7000, 7500, 8000, 9000, 10000][Math.floor(r() * 7)];
    const platform = 0;
    const created = now - (DEMO_COINS.length - i) * 3.1 * 3600_000 - Math.floor(r() * 3600_000);
    const mint = addr(i + 120);
    let total = 0;
    const nPay = 3 + Math.floor(r() * 9);
    for (let p = 0; p < nPay; p++) {
      const lamports = Math.floor((0.02 + r() * 1.6) * 1e9);
      total += lamports;
      s.payouts.push({
        signature: fakeSig(i * 20 + p),
        mint,
        charity_wallet: charity.wallet,
        lamports,
        created_at: new Date(created + (p + 1) * ((now - created) / (nPay + 1))).toISOString(),
      });
    }
    s.coins.set(mint, {
      mint,
      name,
      symbol,
      image_url: null,
      description: `${name} sends ${bps / 100}% of its creator fees to ${ch.name}. Locked on chain.`,
      creator_wallet: addr(i + 200),
      charity_slug: ch.slug,
      charity_wallet: charity.wallet,
      charity_bps: bps,
      platform_bps: platform,
      status: "verified",
      fail_reason: null,
      total_donated_lamports: total,
      launch_signature: fakeSig(i * 20 + 19),
      verified_at: new Date(created + 20_000).toISOString(),
      last_checked_at: nowIso(),
      created_at: new Date(created).toISOString(),
    });
  });

  s.payouts.sort((a, b) => b.created_at.localeCompare(a.created_at));
  s.flags = { launchPaused: false, banner: "" };
}

export function createMemoryStore(opts: { demo: boolean }): Store {
  const s = state();
  if (opts.demo) seed(s);

  const store: Store = {
    kind: "memory",
    writable: opts.demo,

    async listCoins(o: ListCoinsOpts) {
      const statuses = o.statuses ?? ["verified"];
      let rows = [...s.coins.values()].filter((c) => statuses.includes(c.status));
      if (o.charitySlug) rows = rows.filter((c) => c.charity_slug === o.charitySlug);
      rows.sort((a, b) =>
        o.order === "donated"
          ? b.total_donated_lamports - a.total_donated_lamports
          : b.created_at.localeCompare(a.created_at),
      );
      return rows.slice(0, o.limit).map((c) => ({ ...c }));
    },
    async getCoin(mint) {
      const c = s.coins.get(mint);
      return c ? { ...c } : null;
    },
    async upsertCoin(row) {
      const cur = s.coins.get(row.mint);
      s.coins.set(row.mint, {
        name: "",
        symbol: "",
        image_url: null,
        description: null,
        creator_wallet: "",
        charity_slug: "",
        charity_wallet: "",
        charity_bps: 5000,
        platform_bps: 0,
        status: "pending",
        fail_reason: null,
        total_donated_lamports: 0,
        launch_signature: null,
        verified_at: null,
        last_checked_at: null,
        created_at: nowIso(),
        ...(cur ?? {}),
        ...row,
      } as Coin);
    },
    async patchCoin(mint, patch) {
      const c = s.coins.get(mint);
      if (c) s.coins.set(mint, { ...c, ...patch });
    },
    async coinsForWorker() {
      return [...s.coins.values()].filter((c) => c.status === "pending" || c.status === "verified");
    },
    async coinCounts(): Promise<CoinCounts> {
      const out: CoinCounts = { pending: 0, verified: 0, failed: 0, revoked: 0, hidden: 0 };
      for (const c of s.coins.values()) out[c.status]++;
      return out;
    },

    async listPayouts(mint, limit) {
      return s.payouts.filter((p) => p.mint === mint).slice(0, limit);
    },
    async recentPayouts(limit): Promise<PayoutWithCoin[]> {
      return s.payouts
        .filter((p) => s.coins.get(p.mint)?.status === "verified")
        .slice(0, limit)
        .map((p) => {
          const c = s.coins.get(p.mint)!;
          return { ...p, coin_name: c.name, coin_symbol: c.symbol, charity_slug: c.charity_slug };
        });
    },
    async insertPayout(p) {
      if (s.payouts.some((x) => x.signature === p.signature)) return "duplicate";
      s.payouts.unshift(p);
      return "inserted";
    },
    async addDonation(mint, lamports) {
      const c = s.coins.get(mint);
      if (c) c.total_donated_lamports += lamports;
    },
    async charityTotals(): Promise<CharityTotal[]> {
      const out = new Map<string, CharityTotal>();
      for (const c of s.coins.values()) {
        if (c.status !== "verified") continue;
        const t = out.get(c.charity_slug) ?? { charity_slug: c.charity_slug, coins: 0, lamports: 0 };
        t.coins++;
        t.lamports += c.total_donated_lamports;
        out.set(c.charity_slug, t);
      }
      return [...out.values()];
    },

    async listCharities() {
      return [...s.charities.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
    async upsertCharity(c) {
      const cur = s.charities.get(c.slug);
      s.charities.set(c.slug, {
        name: "",
        cause: "",
        blurb: "",
        site_url: "",
        wallet: "",
        wallet_source_url: "",
        verified: false,
        active: true,
        created_at: nowIso(),
        ...(cur ?? {}),
        ...c,
        updated_at: nowIso(),
      } as CharityRow);
    },

    async getFlags() {
      return { ...s.flags };
    },
    async setFlags(patch) {
      s.flags = { ...s.flags, ...patch };
      return { ...s.flags };
    },

    async audit(e) {
      s.audit.unshift({ ...e, id: ++s.auditSeq, at: nowIso() });
      s.audit = s.audit.slice(0, 500);
    },
    async listAudit(limit) {
      return s.audit.slice(0, limit);
    },

    async ping() {
      return true;
    },
  };

  if (opts.demo) {
    // Makes the live feed move in previews. Roughly one event per call that wins the dice roll.
    store.demoTick = async () => {
      const verified = [...s.coins.values()].filter((c) => c.status === "verified");
      if (verified.length === 0) return;
      const roll = Math.random();
      if (roll < 0.7) {
        const c = verified[Math.floor(Math.random() * verified.length)];
        const lamports = Math.floor((0.01 + Math.random() * 0.5) * 1e9);
        s.payouts.unshift({
          signature: fakeSig(Math.floor(Math.random() * 1e6)),
          mint: c.mint,
          charity_wallet: c.charity_wallet,
          lamports,
          created_at: nowIso(),
        });
        c.total_donated_lamports += lamports;
      } else if (roll < 0.8) {
        const idx = s.coins.size + 300;
        const ch = DEMO_CHARITIES[idx % DEMO_CHARITIES.length];
        const charity = s.charities.get(ch.slug)!;
        const names = ["Mochi", "Sunny", "Pebble", "Marlin", "Fern", "Biscuit", "Nimbus", "Clover"];
        const nm = names[idx % names.length] + " " + ["Coin", "Inu", "Fund", "Pal"][idx % 4];
        const mint = addr(idx);
        s.coins.set(mint, {
          mint,
          name: nm,
          symbol: nm.split(" ")[0].toUpperCase().slice(0, 8),
          image_url: null,
          description: `Fresh launch supporting ${ch.name}.`,
          creator_wallet: addr(idx + 1000),
          charity_slug: ch.slug,
          charity_wallet: charity.wallet,
          charity_bps: 7000,
          platform_bps: 0,
          status: "verified",
          fail_reason: null,
          total_donated_lamports: 0,
          launch_signature: fakeSig(idx),
          verified_at: nowIso(),
          last_checked_at: nowIso(),
          created_at: nowIso(),
        });
      }
    };
  }

  return store;
}
