import { getHome } from "@/lib/data";
import { cached } from "@/lib/http";

// The live feed polls this. Every visitor shares one CDN cached copy refreshed every 5 seconds,
// so 10,000 watchers cost about one origin request per 5 seconds, not 10,000.
export const revalidate = 5;

export async function GET() {
  const h = await getHome();
  return cached({ stats: h.stats, activity: h.activity, generatedAt: h.generatedAt }, 5, 30);
}
