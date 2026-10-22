import { getHome } from "@/lib/data";
import { cached } from "@/lib/http";

export const revalidate = 10;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const limit = Math.min(Math.max(Number(u.searchParams.get("limit") ?? 24) || 24, 1), 24);
  const charity = u.searchParams.get("charity");
  const home = await getHome();
  let coins = home.latest;
  if (charity) coins = coins.filter((c) => c.charity_slug === charity);
  return cached({ coins: coins.slice(0, limit) }, 10, 60);
}
