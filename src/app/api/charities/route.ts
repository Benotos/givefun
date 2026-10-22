import { getCharities } from "@/lib/charities";
import { cached } from "@/lib/http";

export const revalidate = 30;

export async function GET() {
  const all = await getCharities();
  // Only publish charities that are live. Hidden or unverified ones stay private.
  const charities = all.filter((c) => c.active).map((c) => ({
    slug: c.slug,
    name: c.name,
    cause: c.cause,
    blurb: c.blurb,
    site_url: c.site_url,
    wallet: c.verified ? c.wallet : "",
    wallet_source_url: c.verified ? c.wallet_source_url : "",
    verified: c.verified,
    coins: c.coins,
    lamports: c.lamports,
  }));
  return cached({ charities }, 30, 120);
}
