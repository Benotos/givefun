import { store } from "../store";
import type { CharityRow, Coin } from "../store";
import { isSelectable, validWallet } from "../charities";
import { invalidateSnapshot } from "../snapshot";
import { refreshPublicSnapshots } from "../data";

// Admin mutations. Each one validates hard, writes an audit entry and refreshes the public snapshots
// so the change is visible immediately.

const ACTOR = "admin";

export class AdminError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const isHttps = (u: string) => {
  try {
    return new URL(u).protocol === "https:";
  } catch {
    return false;
  }
};

export type CharityInput = {
  slug: string;
  name: string;
  cause?: string;
  blurb?: string;
  site_url?: string;
  wallet?: string;
  wallet_source_url?: string;
};

export async function saveCharity(inp: CharityInput): Promise<CharityRow> {
  const slug = String(inp.slug ?? "").trim();
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) throw new AdminError("Slug: 3 to 40 chars, lowercase letters, numbers, dashes");
  const name = String(inp.name ?? "").trim();
  if (name.length < 2 || name.length > 80) throw new AdminError("Name must be 2 to 80 characters");
  const cause = String(inp.cause ?? "").trim().slice(0, 40);
  const blurb = String(inp.blurb ?? "").trim().slice(0, 280);
  const site_url = String(inp.site_url ?? "").trim();
  const wallet = String(inp.wallet ?? "").trim();
  const wallet_source_url = String(inp.wallet_source_url ?? "").trim();

  if (site_url && !isHttps(site_url)) throw new AdminError("Website must be a https link");
  if (wallet_source_url && !isHttps(wallet_source_url)) throw new AdminError("Wallet source must be a https link");
  if (wallet && !validWallet(wallet)) throw new AdminError("Wallet is not a valid Solana address");

  const s = store();
  const existing = (await s.listCharities()).find((c) => c.slug === slug);

  // Changing a wallet, or its source, always drops verification. It must be verified again on purpose.
  const walletChanged = existing && (existing.wallet !== wallet || existing.wallet_source_url !== wallet_source_url);
  const verified = existing ? (walletChanged ? false : existing.verified) : false;

  await s.upsertCharity({ slug, name, cause, blurb, site_url, wallet, wallet_source_url, verified, active: existing?.active ?? true });
  await s.audit({
    actor: ACTOR,
    action: existing ? "charity.update" : "charity.create",
    target: slug,
    detail: {
      walletChanged: Boolean(walletChanged),
      from: existing ? { wallet: existing.wallet, source: existing.wallet_source_url } : null,
      to: { wallet, source: wallet_source_url },
      verificationReset: Boolean(walletChanged && existing?.verified),
    },
  });
  await refreshPublicSnapshots();
  return (await s.listCharities()).find((c) => c.slug === slug)!;
}

export async function setCharityVerified(slug: string, verified: boolean): Promise<void> {
  const s = store();
  const c = (await s.listCharities()).find((x) => x.slug === slug);
  if (!c) throw new AdminError("Charity not found", 404);
  if (verified) {
    if (!validWallet(c.wallet)) throw new AdminError("Add a valid wallet first");
    if (!isHttps(c.wallet_source_url)) throw new AdminError("Add the https page where the charity publishes this wallet first");
    if (!isHttps(c.site_url)) throw new AdminError("Add the charity's official website first");
  }
  await s.upsertCharity({ slug, verified });
  await s.audit({
    actor: ACTOR,
    action: verified ? "charity.verify" : "charity.unverify",
    target: slug,
    detail: { wallet: c.wallet, source: c.wallet_source_url },
  });
  await refreshPublicSnapshots();
}

export async function setCharityActive(slug: string, active: boolean): Promise<void> {
  const s = store();
  const c = (await s.listCharities()).find((x) => x.slug === slug);
  if (!c) throw new AdminError("Charity not found", 404);
  await s.upsertCharity({ slug, active });
  await s.audit({ actor: ACTOR, action: active ? "charity.activate" : "charity.deactivate", target: slug, detail: {} });
  await refreshPublicSnapshots();
}

export type CoinAction = "hide" | "unhide" | "reverify";

export async function coinAction(mint: string, action: CoinAction): Promise<Coin> {
  const s = store();
  const c = await s.getCoin(mint);
  if (!c) throw new AdminError("Coin not found", 404);

  if (action === "hide") {
    await s.patchCoin(mint, { status: "hidden" });
  } else if (action === "unhide") {
    await s.patchCoin(mint, { status: c.verified_at ? "verified" : "pending", fail_reason: null });
  } else if (action === "reverify") {
    await s.patchCoin(mint, { status: "pending", fail_reason: null });
  } else {
    throw new AdminError("Unknown action");
  }

  await s.audit({ actor: ACTOR, action: `coin.${action}`, target: mint, detail: { name: c.name, previous: c.status } });
  await invalidateSnapshot(`coin:${mint}`);
  await refreshPublicSnapshots();
  return (await s.getCoin(mint))!;
}

export async function setFlags(patch: { launchPaused?: boolean; banner?: string }) {
  const s = store();
  const clean: { launchPaused?: boolean; banner?: string } = {};
  if (typeof patch.launchPaused === "boolean") clean.launchPaused = patch.launchPaused;
  if (typeof patch.banner === "string") clean.banner = patch.banner.trim().slice(0, 200);
  const next = await s.setFlags(clean);
  await s.audit({ actor: ACTOR, action: "flags.update", target: "site", detail: clean });
  await refreshPublicSnapshots();
  return next;
}

export { isSelectable };
