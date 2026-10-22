import { adminGuard } from "@/lib/admin/auth";
import { AdminError, coinAction } from "@/lib/admin/actions";
import type { CoinAction } from "@/lib/admin/actions";
import { store } from "@/lib/store";
import type { CoinStatus } from "@/lib/store";
import { noStore } from "@/lib/http";
import { guard } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const STATUSES: CoinStatus[] = ["pending", "verified", "failed", "revoked", "hidden"];

export async function GET(req: Request) {
  const denied = adminGuard(req);
  if (denied) return denied;
  const u = new URL(req.url);
  const st = u.searchParams.get("status");
  const statuses = st && STATUSES.includes(st as CoinStatus) ? [st as CoinStatus] : STATUSES;
  const coins = await store().listCoins({ limit: 200, statuses, order: "new" });
  const q = (u.searchParams.get("q") ?? "").trim().toLowerCase();
  const out = q
    ? coins.filter((c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q) || c.mint.startsWith(q))
    : coins;
  return noStore({ coins: out });
}

export async function POST(req: Request) {
  const denied = adminGuard(req);
  if (denied) return denied;
  const limited = await guard(req, "admin-write", 60, 60);
  if (limited) return limited;

  let b: { mint?: string; action?: CoinAction };
  try {
    b = await req.json();
  } catch {
    return noStore({ error: "Bad JSON" }, 400);
  }
  if (!b.mint || !b.action) return noStore({ error: "mint and action required" }, 400);

  try {
    return noStore({ coin: await coinAction(b.mint, b.action) });
  } catch (e) {
    if (e instanceof AdminError) return noStore({ error: e.message }, e.status);
    console.error("admin coins", (e as Error).message);
    return noStore({ error: "Server error" }, 500);
  }
}
