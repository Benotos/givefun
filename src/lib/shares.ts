import { PublicKey } from "@solana/web3.js";
import { MIN_CHARITY_BPS, MAX_CHARITY_BPS } from "./config";

export type ShareInput = {
  devWallet: string;
  charityWallet: string;
  charityBps: number;
  platformWallet?: string;
  platformBps?: number;
};

export type Share = { address: PublicKey; shareBps: number };

function pk(label: string, v: string): PublicKey {
  try {
    return new PublicKey(v);
  } catch {
    throw new Error(`Invalid ${label} wallet`);
  }
}

/**
 * Builds the final shareholder list for pump.fun fee sharing.
 * charityBps and platformBps are basis points of TOTAL creator fees. Dev gets the rest.
 * Throws on any invalid input. Sum is always exactly 10000.
 */
export function computeShares(i: ShareInput): Share[] {
  const platformBps = i.platformBps ?? 0;
  if (!Number.isInteger(i.charityBps)) throw new Error("Charity share must be a whole number of bps");
  if (i.charityBps < MIN_CHARITY_BPS || i.charityBps > MAX_CHARITY_BPS)
    throw new Error("Charity share must be between 50% and 100%");
  if (!Number.isInteger(platformBps) || platformBps < 0) throw new Error("Bad platform share");
  if (i.charityBps + platformBps > 10000) throw new Error("Charity plus platform share exceeds 100%");

  const dev = pk("dev", i.devWallet);
  const charity = pk("charity", i.charityWallet);
  if (dev.equals(charity)) throw new Error("Dev wallet cannot equal charity wallet");

  const out: Share[] = [{ address: charity, shareBps: i.charityBps }];

  if (platformBps > 0) {
    if (!i.platformWallet) throw new Error("PLATFORM_WALLET not set");
    const plat = pk("platform", i.platformWallet);
    if (plat.equals(charity)) throw new Error("Platform wallet cannot equal charity wallet");
    if (plat.equals(dev)) throw new Error("Platform wallet cannot equal dev wallet");
    out.push({ address: plat, shareBps: platformBps });
  }

  const devBps = 10000 - i.charityBps - platformBps;
  if (devBps > 0) out.push({ address: dev, shareBps: devBps });

  const total = out.reduce((a, s) => a + s.shareBps, 0);
  if (total !== 10000) throw new Error("Shares do not total 100%");
  return out;
}
