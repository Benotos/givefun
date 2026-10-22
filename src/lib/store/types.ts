export type CoinStatus = "pending" | "verified" | "failed" | "revoked" | "hidden";

export type Coin = {
  mint: string;
  name: string;
  symbol: string;
  image_url: string | null;
  description: string | null;
  creator_wallet: string;
  charity_slug: string;
  charity_wallet: string;
  charity_bps: number;
  platform_bps: number;
  status: CoinStatus;
  fail_reason: string | null;
  total_donated_lamports: number;
  launch_signature: string | null;
  verified_at: string | null;
  last_checked_at: string | null;
  created_at: string;
};

export type Payout = {
  signature: string;
  mint: string;
  charity_wallet: string;
  lamports: number;
  created_at: string;
};

export type PayoutWithCoin = Payout & { coin_name: string; coin_symbol: string; charity_slug: string };

export type CharityRow = {
  slug: string;
  name: string;
  cause: string;
  blurb: string;
  site_url: string;
  wallet: string;
  wallet_source_url: string;
  verified: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type Flags = {
  launchPaused: boolean;
  banner: string;
};

export type AuditEntry = {
  id: number;
  at: string;
  actor: string;
  action: string;
  target: string;
  detail: Record<string, unknown>;
};

export type CharityTotal = { charity_slug: string; coins: number; lamports: number };

export type CoinCounts = Record<CoinStatus, number>;

export type ListCoinsOpts = {
  limit: number;
  charitySlug?: string;
  statuses?: CoinStatus[];
  order?: "new" | "donated";
};

export interface Store {
  kind: "supabase" | "postgres" | "memory";
  /** True when writes persist. False for an unconfigured memory store. */
  writable: boolean;

  listCoins(o: ListCoinsOpts): Promise<Coin[]>;
  getCoin(mint: string): Promise<Coin | null>;
  upsertCoin(row: Partial<Coin> & { mint: string }): Promise<void>;
  patchCoin(mint: string, patch: Partial<Coin>): Promise<void>;
  coinsForWorker(): Promise<Coin[]>;
  coinCounts(): Promise<CoinCounts>;

  listPayouts(mint: string, limit: number): Promise<Payout[]>;
  recentPayouts(limit: number): Promise<PayoutWithCoin[]>;
  insertPayout(p: Payout): Promise<"inserted" | "duplicate">;
  addDonation(mint: string, lamports: number): Promise<void>;
  charityTotals(): Promise<CharityTotal[]>;

  listCharities(): Promise<CharityRow[]>;
  upsertCharity(c: Partial<CharityRow> & { slug: string }): Promise<void>;

  getFlags(): Promise<Flags>;
  setFlags(patch: Partial<Flags>): Promise<Flags>;

  audit(e: Omit<AuditEntry, "id" | "at">): Promise<void>;
  listAudit(limit: number): Promise<AuditEntry[]>;

  ping(): Promise<boolean>;
  /** Demo only: simulates new activity so the live feed moves. */
  demoTick?(): Promise<void>;
}