import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { dbBreaker } from "../breaker";
import { withTimeout } from "../util";
import type {
  AuditEntry,
  CharityRow,
  CharityTotal,
  Coin,
  CoinCounts,
  CoinStatus,
  Flags,
  ListCoinsOpts,
  Payout,
  PayoutWithCoin,
  Store,
} from "./types";

// Server only. Uses the service role key. Never import from client code.
// Every call is timed out and goes through the circuit breaker, so a slow or dead database
// fails fast and the snapshot layer serves stale data instead of piling up requests.

const DB_TIMEOUT_MS = 4000;

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!client) {
    client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (i, init) => fetch(i, { ...init, cache: "no-store" }) },
    });
  }
  return client;
}

type Res<T> = { data: T | null; error: { message: string; code?: string } | null };

async function q<T>(label: string, fn: (c: SupabaseClient) => PromiseLike<Res<T>>): Promise<T> {
  return dbBreaker.run(async () => {
    const { data, error } = await withTimeout(Promise.resolve(fn(sb())), DB_TIMEOUT_MS, `db ${label}`);
    if (error) throw new Error(`${label}: ${error.message}`);
    return data as T;
  });
}

const num = (v: unknown) => Number(v ?? 0);
const normCoin = (r: Record<string, unknown>): Coin => ({
  ...(r as unknown as Coin),
  total_donated_lamports: num(r.total_donated_lamports),
});
const normPayout = (r: Record<string, unknown>): Payout => ({ ...(r as unknown as Payout), lamports: num(r.lamports) });

export function createSupabaseStore(): Store {
  return {
    kind: "supabase",
    writable: true,

    async listCoins(o: ListCoinsOpts) {
      const rows = await q<Record<string, unknown>[]>("listCoins", (c) => {
        let b = c
          .from("coins")
          .select("*")
          .in("status", o.statuses ?? ["verified"])
          .limit(Math.min(o.limit, 500));
        if (o.charitySlug) b = b.eq("charity_slug", o.charitySlug);
        b =
          o.order === "donated"
            ? b.order("total_donated_lamports", { ascending: false })
            : b.order("created_at", { ascending: false });
        return b;
      });
      return (rows ?? []).map(normCoin);
    },

    async getCoin(mint) {
      const r = await q<Record<string, unknown> | null>("getCoin", (c) =>
        c.from("coins").select("*").eq("mint", mint).maybeSingle(),
      );
      return r ? normCoin(r) : null;
    },

    async upsertCoin(row) {
      await q("upsertCoin", (c) => c.from("coins").upsert(row, { onConflict: "mint" }));
    },

    async patchCoin(mint, patch) {
      await q("patchCoin", (c) => c.from("coins").update(patch).eq("mint", mint));
    },

    async coinsForWorker() {
      const rows = await q<Record<string, unknown>[]>("coinsForWorker", (c) =>
        c
          .from("coins")
          .select("*")
          .in("status", ["pending", "verified"])
          .order("created_at", { ascending: false })
          .limit(2000),
      );
      return (rows ?? []).map(normCoin);
    },

    async coinCounts() {
      const rows = await q<{ status: CoinStatus; n: number }[]>("coinCounts", (c) => c.rpc("coin_counts"));
      const out: CoinCounts = { pending: 0, verified: 0, failed: 0, revoked: 0, hidden: 0 };
      for (const r of rows ?? []) out[r.status] = num(r.n);
      return out;
    },

    async listPayouts(mint, limit) {
      const rows = await q<Record<string, unknown>[]>("listPayouts", (c) =>
        c.from("payouts").select("*").eq("mint", mint).order("created_at", { ascending: false }).limit(limit),
      );
      return (rows ?? []).map(normPayout);
    },

    async recentPayouts(limit): Promise<PayoutWithCoin[]> {
      const rows = await q<Record<string, unknown>[]>("recentPayouts", (c) =>
        c
          .from("payouts")
          .select("*, coins(name,symbol,charity_slug)")
          .order("created_at", { ascending: false })
          .limit(limit),
      );
      return (rows ?? []).map((r) => {
        const co = (r.coins ?? {}) as { name?: string; symbol?: string; charity_slug?: string };
        return {
          ...normPayout(r),
          coin_name: co.name ?? "",
          coin_symbol: co.symbol ?? "",
          charity_slug: co.charity_slug ?? "",
        };
      });
    },

    async insertPayout(p) {
      return dbBreaker.run(async () => {
        const { error } = await withTimeout(
          Promise.resolve(sb().from("payouts").insert(p)),
          DB_TIMEOUT_MS,
          "db insertPayout",
        );
        if (error) {
          if (error.code === "23505") return "duplicate" as const;
          throw new Error(`insertPayout: ${error.message}`);
        }
        return "inserted" as const;
      });
    },

    async addDonation(mint, lamports) {
      await q("addDonation", (c) => c.rpc("add_donation", { p_mint: mint, p_lamports: lamports }));
    },

    async charityTotals(): Promise<CharityTotal[]> {
      const rows = await q<CharityTotal[]>("charityTotals", (c) => c.rpc("charity_totals"));
      return (rows ?? []).map((r) => ({ charity_slug: r.charity_slug, coins: num(r.coins), lamports: num(r.lamports) }));
    },

    async listCharities() {
      const rows = await q<CharityRow[]>("listCharities", (c) =>
        c.from("charities").select("*").order("name", { ascending: true }),
      );
      return rows ?? [];
    },

    async upsertCharity(ch) {
      // Update first, so partial patches like {slug, verified} work. Insert only if the row is new.
      const row = { ...ch, updated_at: new Date().toISOString() };
      const { slug, ...rest } = row;
      const upd = await q<{ slug: string }[]>("upsertCharity", (c) =>
        c.from("charities").update(rest).eq("slug", slug).select("slug"),
      );
      if (upd && upd.length) return;
      await q("upsertCharity", (c) => c.from("charities").insert(row));
    },

    async getFlags(): Promise<Flags> {
      const r = await q<{ value: Partial<Flags> } | null>("getFlags", (c) =>
        c.from("flags").select("value").eq("key", "site").maybeSingle(),
      );
      return { launchPaused: false, banner: "", ...(r?.value ?? {}) };
    },

    async setFlags(patch) {
      const cur = await this.getFlags();
      const next = { ...cur, ...patch };
      await q("setFlags", (c) => c.from("flags").upsert({ key: "site", value: next }, { onConflict: "key" }));
      return next;
    },

    async audit(e) {
      await q("audit", (c) => c.from("audit_log").insert(e));
    },

    async listAudit(limit): Promise<AuditEntry[]> {
      const rows = await q<AuditEntry[]>("listAudit", (c) =>
        c.from("audit_log").select("*").order("id", { ascending: false }).limit(limit),
      );
      return rows ?? [];
    },

    async ping() {
      try {
        await q("ping", (c) => c.from("flags").select("key", { head: true, count: "exact" }).limit(1));
        return true;
      } catch {
        return false;
      }
    },
  };
}