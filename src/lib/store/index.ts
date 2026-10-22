import { createMemoryStore } from "./memory";
import { createPostgresStore } from "./postgres";
import { createSupabaseStore } from "./supabase";
import type { Store } from "./types";

export * from "./types";

export const isDemo = () => process.env.DEMO_MODE === "1";
export const supabaseConfigured = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export const postgresConfigured = () => Boolean(process.env.DATABASE_URL);

let cached: Store | null = null;

/**
 * Picks the data store.
 *  DEMO_MODE=1            seeded in memory store (previews, tests). A banner shows on every page.
 *  DATABASE_URL present   real Postgres (Neon or any provider). Wins over Supabase if both are set.
 *  Supabase env present   real database.
 *  neither                empty read only store. Pages render empty, writes are refused.
 */
export function store(): Store {
  if (cached) return cached;
  if (isDemo()) cached = createMemoryStore({ demo: true });
  else if (postgresConfigured()) cached = createPostgresStore();
  else if (supabaseConfigured()) cached = createSupabaseStore();
  else cached = createMemoryStore({ demo: false });
  return cached;
}

export function __storeReset() {
  cached = null;
}