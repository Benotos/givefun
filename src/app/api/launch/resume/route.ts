import { PublicKey, Transaction } from "@solana/web3.js";
import { platformBps, platformWallet } from "@/lib/config";
import { isSelectable, loadCharitiesFresh } from "@/lib/charities";
import { computeShares } from "@/lib/shares";
import { buildLaunchInstructions, feeSharingConfigPda, bondingCurvePda } from "@/lib/pump";
import { getConnection } from "@/lib/rpc";
import { verifyTicket } from "@/lib/token";
import { noStore } from "@/lib/http";
import { guard } from "@/lib/ratelimit";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// Recovery for the one awkward case: the coin was created but the lock transaction expired or failed.
// Rebuilds only the lock transaction with a fresh blockhash. The creator signs once and it is done.
export async function POST(req: Request) {
  const limited = await guard(req, "resume", 10, 60);
  if (limited) return limited;
  if (!store().writable) return noStore({ error: "Not available" }, 503);

  let body: { ticket?: string };
  try {
    body = await req.json();
  } catch {
    return noStore({ error: "Bad JSON" }, 400);
  }
  const t = body.ticket ? verifyTicket(body.ticket) : null;
  if (!t) return noStore({ error: "This launch expired. Start a new one." }, 400);

  const conn = getConnection();
  const mint = new PublicKey(t.mint);
  const creator = new PublicKey(t.creator);

  const [curve, cfg] = await Promise.all([
    conn.getAccountInfo(bondingCurvePda(mint), "confirmed"),
    conn.getAccountInfo(feeSharingConfigPda(mint), "confirmed"),
  ]);
  if (!curve) return noStore({ error: "Coin not found on chain yet" }, 409);
  if (cfg) return noStore({ status: "already_locked" });

  const charity = (await loadCharitiesFresh()).find((c) => c.slug === t.charitySlug);
  if (!charity || !isSelectable(charity)) return noStore({ error: "Charity unavailable" }, 400);

  try {
    const shares = computeShares({
      devWallet: creator.toBase58(),
      charityWallet: charity.wallet,
      charityBps: t.charityBps,
      platformWallet: platformWallet(),
      platformBps: platformBps(),
    });
    const { share } = await buildLaunchInstructions({
      creator,
      mint,
      name: t.name,
      symbol: t.symbol,
      uri: "",
      shares,
    });
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: creator, blockhash, lastValidBlockHeight });
    tx.add(...share);
    return noStore({
      transaction: tx.serialize({ requireAllSignatures: false }).toString("base64"),
      lastValidBlockHeight,
    });
  } catch (e) {
    console.error("resume build failed", (e as Error).message);
    return noStore({ error: "Could not build transaction" }, 500);
  }
}
