import { Pool } from "pg";
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

// Plain Postgres store (Neon, Railway, Render, anything). Server and worker only.
// Set DATABASE_URL. On Neon use the POOLED connection string (host contains "-pooler").
// Every query is timed out and goes through the circuit breaker, like the Supabase store.

const DB_TIMEOUT_MS = 4000;

let pool: Pool | null = null;
function db(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL!;
    const local = /localhost|127\.0\.0\.1/.test(url);
    pool = new Pool({
      connectionString: url,
      // Serverless: few connections per instance. The provider pooler handles the rest.
      max: Number(process.env.DB_POOL_MAX || 3),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 4000,
      ssl: local || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: false },
    });
    pool.on("error", (e) => console.error("pg pool error", e.message));
  }
  return pool;
}

async function q<T = Record<string, unknown>>(label: string, text: string, params: unknown[] = []): Promise<T[]> {
  return dbBreaker.run(async () => {
    const r = await withTimeout(db().query(text, params), DB_TIMEOUT_MS, `db ${label}`);
    return r.rows as T[];
  });
}

const num = (v: unknown) => Number(v ?? 0);
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string | null));
const normCoin = (r: Record<string, unknown>): Coin => ({
  ...(r as unknown as Coin),
  total_donated_lamports: num(r.total_donated_lamports),
  verified_at: iso(r.verified_at),
  last_checked_at: iso(r.last_checked_at),
  created_at: iso(r.created_at) as string,
});
const normPayout = (r: Record<string, unknown>): Payout => ({
  ...(r as unknown as Payout),
  lamports: num(r.lamports),
  created_at: iso(r.created_at) as string,
});

// Build "col = $n, ..." from an object. Column names come from our own code, never from users,
// but we still whitelist the shape to be safe.
const COL = /^[a-z_]+$/;
function setList(obj: Record<string, unknown>, start = 1) {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  keys.forEach((k) => {
    if (!COL.test(k)) throw new Error(`bad column ${k}`);
  });
  return { keys, sql: keys.map((k, i) => `${k} = $${i + start}`).join(", "), vals: keys.map((k) => obj[k]) };
}

export function createPostgresStore(): Store {
  return {
    kind: "postgres",
    writable: true,

    async listCoins(o: ListCoinsOpts) {
      const statuses = o.statuses ?? ["verified"];
      const params: unknown[] = [statuses];
      let where = "status = any($1)";
      if (o.charitySlug) {
        params.push(o.charitySlug);
        where += ` and charity_slug = $${params.length}`;
      }
      const order = o.order === "donated" ? "total_donated_lamports desc" : "created_at desc";
      params.push(Math.min(o.limit, 500));
      const rows = await q("listCoins", `select * from coins where ${where} order by ${order} limit $${params.length}`, params);
      return rows.map(normCoin);
    },

    async getCoin(mint) {
      const rows = await q("getCoin", "select * from coins where mint = $1", [mint]);
      return rows[0] ? normCoin(rows[0]) : null;
    },

    async upsertCoin(row) {
      const { keys, vals } = setList(row as Record<string, unknown>);
      const cols = keys.join(", ");
      const ph = keys.map((_, i) => `$${i + 1}`).join(", ");
      const upd = keys.filter((k) => k !== "mint").map((k) => `${k} = excluded.${k}`).join(", ");
      await q("upsertCoin", `insert into coins (${cols}) values (${ph}) on conflict (mint) do update set ${upd || "mint = excluded.mint"}`, vals);
    },

    async patchCoin(mint, patch) {
      const { keys, sql, vals } = setList(patch as Record<string, unknown>, 2);
      if (!keys.length) return;
      await q("patchCoin", `update coins set ${sql} where mint = $1`, [mint, ...vals]);
    },

    async coinsForWorker() {
      const rows = await q(
        "coinsForWorker",
        "select * from coins where status in ('pending','verified') order by created_at desc limit 2000",
      );
      return rows.map(normCoin);
    },

    async coinCounts() {
      const rows = await q<{ status: CoinStatus; n: string }>("coinCounts", "select status, count(*) as n from coins group by status");
      const out: CoinCounts = { pending: 0, verified: 0, failed: 0, revoked: 0, hidden: 0 };
      for (const r of rows) out[r.status] = num(r.n);
      return out;
    },

    async listPayouts(mint, limit) {
      const rows = await q("listPayouts", "select * from payouts where mint = $1 order by created_at desc limit $2", [mint, limit]);
      return rows.map(normPayout);
    },

    async recentPayouts(limit): Promise<PayoutWithCoin[]> {
      const rows = await q(
        "recentPayouts",
        `select p.*, c.name as coin_name, c.symbol as coin_symbol, c.charity_slug as charity_slug
         from payouts p join coins c on c.mint = p.mint
         order by p.created_at desc limit $1`,
        [limit],
      );
      return rows.map((r) => ({
        ...normPayout(r),
        coin_name: String(r.coin_name ?? ""),
        coin_symbol: String(r.coin_symbol ?? ""),
        charity_slug: String(r.charity_slug ?? ""),
      }));
    },

    async insertPayout(p) {
      const rows = await q(
        "insertPayout",
        `insert into payouts (signature, mint, charity_wallet, lamports, created_at)
         values ($1, $2, $3, $4, coalesce($5::timestamptz, now()))
         on conflict (signature) do nothing returning signature`,
        [p.signature, p.mint, p.charity_wallet, p.lamports, p.created_at ?? null],
      );
      return rows.length ? "inserted" : "duplicate";
    },

    async addDonation(mint, lamports) {
      await q("addDonation", "update coins set total_donated_lamports = total_donated_lamports + $2 where mint = $1", [mint, lamports]);
    },

    async charityTotals(): Promise<CharityTotal[]> {
      const rows = await q<{ charity_slug: string; coins: string; lamports: string }>(
        "charityTotals",
        `select charity_slug, count(*) as coins, coalesce(sum(total_donated_lamports),0) as lamports
         from coins where status = 'verified' group by charity_slug`,
      );
      return rows.map((r) => ({ charity_slug: r.charity_slug, coins: num(r.coins), lamports: num(r.lamports) }));
    },

    async listCharities() {
      const rows = await q("listCharities", "select * from charities order by name asc");
      return rows.map((r) => ({ ...(r as unknown as CharityRow), created_at: iso(r.created_at) as string, updated_at: iso(r.updated_at) as string }));
    },

    async upsertCharity(ch) {
      // Update first, so partial patches like {slug, verified} work. Insert only if the row is new.
      const row = { ...ch, updated_at: new Date().toISOString() } as Record<string, unknown>;
      const { slug, ...rest } = row;
      const u = setList(rest, 2);
      const upd = await q("upsertCharity", `update charities set ${u.sql} where slug = $1 returning slug`, [slug, ...u.vals]);
      if (upd.length) return;
      const ins = setList(row);
      await q(
        "upsertCharity",
        `insert into charities (${ins.keys.join(", ")}) values (${ins.keys.map((_, i) => `$${i + 1}`).join(", ")}) on conflict (slug) do nothing`,
        ins.vals,
      );
    },

    async getFlags(): Promise<Flags> {
      const rows = await q<{ value: Partial<Flags> }>("getFlags", "select value from flags where key = 'site'");
      return { launchPaused: false, banner: "", ...(rows[0]?.value ?? {}) };
    },

    async setFlags(patch) {
      const next = { ...(await this.getFlags()), ...patch };
      await q(
        "setFlags",
        "insert into flags (key, value) values ('site', $1::jsonb) on conflict (key) do update set value = excluded.value",
        [JSON.stringify(next)],
      );
      return next;
    },

    async audit(e) {
      await q("audit", "insert into audit_log (actor, action, target, detail) values ($1, $2, $3, $4::jsonb)", [
        e.actor,
        e.action,
        e.target,
        JSON.stringify(e.detail ?? {}),
      ]);
    },

    async listAudit(limit): Promise<AuditEntry[]> {
      const rows = await q("listAudit", "select * from audit_log order by id desc limit $1", [limit]);
      return rows.map((r) => ({ ...(r as unknown as AuditEntry), id: num(r.id), at: iso(r.at) as string }));
    },

    async ping() {
      try {
        await q("ping", "select 1");
        return true;
      } catch {
        return false;
      }
    },
  };
}