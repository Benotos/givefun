import { Keypair, PublicKey } from "@solana/web3.js";
import { MIN_CHARITY_BPS, MAX_CHARITY_BPS, platformBps, platformWallet } from "@/lib/config";
import { isSelectable, loadCharitiesFresh } from "@/lib/charities";
import { computeShares } from "@/lib/shares";
import { buildLaunchTransactions } from "@/lib/pump";
import { getConnection } from "@/lib/rpc";
import { signTicket } from "@/lib/token";
import { noStore } from "@/lib/http";
import { guard } from "@/lib/ratelimit";
import { getFlags } from "@/lib/data";
import { store } from "@/lib/store";
import { uploadMetadata, MetaError } from "@/lib/metadata";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_IMG = 2 * 1024 * 1024;
const IMG_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

// Accepts a full https link, or for X and Telegram a bare handle. Returns "" when empty, null when invalid.
function cleanLink(raw: string, kind: "web" | "x" | "tg"): string | null {
  let v = raw.trim().slice(0, 200);
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) {
    if (kind === "x" && /^@?[A-Za-z0-9_]{1,15}$/.test(v)) v = `https://x.com/${v.replace(/^@/, "")}`;
    else if (kind === "tg" && /^@?[A-Za-z0-9_]{4,32}$/.test(v)) v = `https://t.me/${v.replace(/^@/, "")}`;
    else v = `https://${v}`;
  }
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function bad(msg: string, status = 400) {
  return noStore({ error: msg }, status);
}

export async function POST(req: Request) {
  const limited = await guard(req, "prepare", 8, 60);
  if (limited) return limited;
  if (!store().writable) return bad("Launching is not available right now", 503);

  const flags = await getFlags();
  if (flags.launchPaused) return bad("Launches are paused for a moment. Try again shortly.", 503);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("Expected multipart form");
  }

  const creatorStr = String(form.get("creator") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const symbol = String(form.get("symbol") ?? "").trim().toUpperCase();
  const description = String(form.get("description") ?? "").trim().slice(0, 500);
  const website = cleanLink(String(form.get("website") ?? ""), "web");
  const twitter = cleanLink(String(form.get("twitter") ?? ""), "x");
  const telegram = cleanLink(String(form.get("telegram") ?? ""), "tg");
  if (website === null) return bad("Website link is not valid");
  if (twitter === null) return bad("X link is not valid");
  if (telegram === null) return bad("Telegram link is not valid");
  const charitySlug = String(form.get("charitySlug") ?? "");
  const charityBps = Math.round(Number(form.get("charityPercent")) * 100);
  const image = form.get("image");

  let creator: PublicKey;
  try {
    creator = new PublicKey(creatorStr);
  } catch {
    return bad("Invalid wallet");
  }
  if (name.length < 1 || name.length > 32) return bad("Name must be 1 to 32 characters");
  if (!/^[A-Z0-9]{1,10}$/.test(symbol)) return bad("Symbol must be 1 to 10 letters or numbers");
  if (!Number.isFinite(charityBps) || charityBps < MIN_CHARITY_BPS || charityBps > MAX_CHARITY_BPS)
    return bad("Charity share must be between 50 and 100 percent");

  // Fresh read, not the cached snapshot: an admin deactivating a charity must take effect immediately.
  let charity;
  try {
    charity = (await loadCharitiesFresh()).find((c) => c.slug === charitySlug);
  } catch {
    return bad("Service busy, try again", 503);
  }
  if (!charity || !isSelectable(charity)) return bad("Charity is not available");

  if (!(image instanceof File) || image.size === 0) return bad("Image required");
  if (image.size > MAX_IMG) return bad("Image must be under 2MB");
  if (!IMG_TYPES.includes(image.type)) return bad("Image must be png, jpg, gif or webp");

  let shares;
  try {
    shares = computeShares({
      devWallet: creator.toBase58(),
      charityWallet: charity.wallet,
      charityBps,
      platformWallet: platformWallet(),
      platformBps: platformBps(),
    });
  } catch (e) {
    return bad((e as Error).message);
  }

  // Upload image and metadata to IPFS (Pinata first if configured, pump.fun as fallback)
  let uri: string;
  let imageUrl: string | null = null;
  try {
    const m = await uploadMetadata({ file: image, name, symbol, description, website, twitter, telegram });
    uri = m.uri;
    imageUrl = m.imageUrl;
  } catch (e) {
    // The detail names the failing route and its HTTP status. It never contains keys.
    const detail = e instanceof MetaError ? e.detail : "unknown";
    return bad(`Could not upload metadata (${detail}). Try again.`, 502);
  }

  const mintKp = Keypair.generate();
  try {
    const txs = await buildLaunchTransactions(
      getConnection(),
      { creator, mint: mintKp.publicKey, name, symbol, uri, shares },
      mintKp,
    );

    const ticket = signTicket({
      mint: mintKp.publicKey.toBase58(),
      creator: creator.toBase58(),
      name,
      symbol,
      image: imageUrl,
      description,
      charitySlug: charity.slug,
      charityBps,
    });

    return noStore({
      mint: mintKp.publicKey.toBase58(),
      // One time throwaway key for this coin. It holds no funds. The browser signs with it after the wallet.
      mintSecret: Buffer.from(mintKp.secretKey).toString("base64"),
      ticket,
      lastValidBlockHeights: txs.map((t) => t.lastValidBlockHeight ?? 0),
      transactions: txs.map((t) => t.serialize({ requireAllSignatures: false }).toString("base64")),
      split: shares.map((s) => ({ address: s.address.toBase58(), bps: s.shareBps })),
    });
  } catch (e) {
    console.error("build launch failed", (e as Error).message);
    return bad("Could not build launch transaction", 500);
  }
}