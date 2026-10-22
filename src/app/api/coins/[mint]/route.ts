import { getCoinPage } from "@/lib/data";
import { cached, noStore } from "@/lib/http";

export const revalidate = 15;

export async function GET(_req: Request, { params }: { params: { mint: string } }) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(params.mint)) return noStore({ error: "bad mint" }, 400);
  const d = await getCoinPage(params.mint);
  if (!d.found) return noStore({ error: d.unavailable ? "temporarily unavailable" : "not found" }, d.unavailable ? 503 : 404);
  return cached({ coin: d.coin, payouts: d.payouts }, 15, 60);
}
