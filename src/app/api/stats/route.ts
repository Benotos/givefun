import { getHome } from "@/lib/data";
import { cached } from "@/lib/http";

export const revalidate = 10;

export async function GET() {
  const h = await getHome();
  return cached(h.stats, 10, 60);
}
