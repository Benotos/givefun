import { getCoinPage } from "@/lib/data";
import { getTrades } from "@/lib/trades";
import { cached, noStore } from "@/lib/http";
import { guard } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// Trades for one give.fun coin, read from the chain and cached. Only coins we list are served,
// so nobody can use this route to make our RPC read random tokens.
export async function GET(req: Request, { params }: { params: { mint: string } }) {
  const limited = await guard(req, "candles", 120, 60);
  if (limited) return limited;
  if (!BASE58.test(params.mint)) return noStore({ error: "Bad mint" }, 400);
  const d = await getCoinPage(params.mint);
  if (!d.found) return noStore({ error: "Unknown coin" }, 404);
  try {
    const trades = await getTrades(params.mint);
    return cached({ trades }, 8, 30);
  } catch {
    return noStore({ trades: [] }, 200);
  }
}