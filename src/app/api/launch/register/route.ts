import { PublicKey } from "@solana/web3.js";
import { platformWallet } from "@/lib/config";
import { isSelectable, loadCharitiesFresh } from "@/lib/charities";
import { store } from "@/lib/store";
import { verifyOnChain } from "@/lib/pump";
import { getConnection } from "@/lib/rpc";
import { verifyTicket } from "@/lib/token";
import { noStore } from "@/lib/http";
import { guard } from "@/lib/ratelimit";
import { invalidateSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Called by the browser after both launch transactions are sent.
// Trusts nothing from the client except the signed ticket. Charity split is read from chain.
export async function POST(req: Request) {
  const limited = await guard(req, "register", 40, 60);
  if (limited) return limited;
  const s = store();
  if (!s.writable) return noStore({ error: "Not available" }, 503);

  let body: { ticket?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return noStore({ error: "Bad JSON" }, 400);
  }

  const t = body.ticket ? verifyTicket(body.ticket) : null;
  if (!t) return noStore({ error: "Invalid or expired ticket" }, 400);

  let charity;
  try {
    charity = (await loadCharitiesFresh()).find((c) => c.slug === t.charitySlug);
  } catch {
    return noStore({ error: "Service busy" }, 503);
  }
  if (!charity || !isSelectable(charity)) return noStore({ error: "Charity unavailable" }, 400);

  const mint = new PublicKey(t.mint);
  const v = await verifyOnChain(getConnection(), mint, charity.wallet);

  // Not on chain yet or not finished. Client keeps polling.
  if (v.shareholders.length === 0) return noStore({ status: "pending", reasons: v.reasons }, 202);

  const charityEntry = v.shareholders.find((x) => x.address === charity.wallet);
  // Never store a coin whose on chain charity share is missing or under 50 percent.
  if (!charityEntry || charityEntry.shareBps < 5000) return noStore({ status: "rejected", reasons: v.reasons }, 422);

  const plat = platformWallet();
  const platEntry = plat ? v.shareholders.find((x) => x.address === plat) : undefined;

  try {
    await s.upsertCoin({
      mint: t.mint,
      name: t.name,
      symbol: t.symbol,
      image_url: t.image,
      description: t.description,
      creator_wallet: t.creator,
      charity_slug: charity.slug,
      charity_wallet: charity.wallet,
      charity_bps: charityEntry.shareBps,
      platform_bps: platEntry?.shareBps ?? 0,
      status: v.ok ? "verified" : "pending",
      fail_reason: v.ok ? null : v.reasons.join("; "),
      launch_signature: body.signature ?? null,
      verified_at: v.ok ? new Date().toISOString() : null,
      last_checked_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("register upsert", (e as Error).message);
    return noStore({ error: "Could not save" }, 500);
  }

  // Clear any cached "not found" so the coin page works the moment the user is redirected.
  await invalidateSnapshot(`coin:${t.mint}`);
  // Same for the lists, so a verified coin shows on Explore and Home straight away.
  if (v.ok) await Promise.all([invalidateSnapshot("explore"), invalidateSnapshot("home")]);
  return noStore({ status: v.ok ? "verified" : "pending", mint: t.mint, reasons: v.reasons }, v.ok ? 200 : 202);
}