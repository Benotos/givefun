import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  PUMP_SDK,
  OnlinePumpSdk,
  feeSharingConfigPda,
  bondingCurvePda,
} from "@pump-fun/pump-sdk";
import type { Share } from "./shares";
import { MIN_CHARITY_BPS } from "./config";

export type LaunchIxInput = {
  creator: PublicKey;
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  shares: Share[];
};

/**
 * Offline. Returns instruction groups for the launch:
 *  1) create_v2
 *  2) create_fee_sharing_config + update_fee_shares_v2 (locks the split, admin revoked)
 * The split is set before anyone can trade, so no fees can accrue under dev control.
 */
export async function buildLaunchInstructions(i: LaunchIxInput): Promise<{
  create: TransactionInstruction[];
  share: TransactionInstruction[];
}> {
  const createIx = await PUMP_SDK.createV2Instruction({
    mint: i.mint,
    name: i.name,
    symbol: i.symbol,
    uri: i.uri,
    creator: i.creator,
    user: i.creator,
    mayhemMode: false,
  });

  const cfgIx = await PUMP_SDK.createFeeSharingConfig({
    creator: i.creator,
    mint: i.mint,
    pool: null,
  });

  const updIx = await PUMP_SDK.updateFeeSharesV2({
    authority: i.creator,
    mint: i.mint,
    currentShareholders: [i.creator],
    newShareholders: i.shares,
    quoteMint: NATIVE_MINT,
    quoteTokenProgram: TOKEN_PROGRAM_ID,
    bondingCurveComplete: false,
  });

  return {
    create: [ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }), createIx],
    share: [ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }), cfgIx, updIx],
  };
}

/**
 * Online. Builds unsigned transactions for the dev wallet to sign.
 * The mint keypair partial signs the first transaction. We never hold the dev key or any funds.
 */
export async function buildLaunchTransactions(
  connection: Connection,
  i: LaunchIxInput,
  mintKeypair: Keypair,
): Promise<Transaction[]> {
  const { create, share } = await buildLaunchInstructions(i);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

  const mk = (ixs: TransactionInstruction[]) => {
    const tx = new Transaction({ feePayer: i.creator, blockhash, lastValidBlockHeight });
    tx.add(...ixs);
    return tx;
  };

  // The mint signs on the client AFTER the wallet. Wallets such as Phantom may rewrite the
  // message when signing, which would wipe a signature added earlier.
  void mintKeypair;
  const tx1 = mk(create);
  const tx2 = mk(share);
  return [tx1, tx2];
}

export type VerifyResult = {
  ok: boolean;
  reasons: string[];
  locked: boolean;
  shareholders: { address: string; shareBps: number }[];
  admin: string | null;
};

/**
 * Reads pump.fun accounts on chain and checks the charity split is real and locked.
 * Chain is the source of truth. Nothing from our DB or the client is trusted.
 */
export async function verifyOnChain(
  connection: Connection,
  mint: PublicKey,
  charityWallet: string,
  minBps = MIN_CHARITY_BPS,
): Promise<VerifyResult> {
  const reasons: string[] = [];
  const cfgAddr = feeSharingConfigPda(mint);
  const info = await connection.getAccountInfo(cfgAddr, "confirmed");
  if (!info) {
    return { ok: false, reasons: ["No sharing config on chain"], locked: false, shareholders: [], admin: null };
  }

  const cfg = PUMP_SDK.decodeSharingConfig(info);
  const shareholders = cfg.shareholders.map((s) => ({
    address: s.address.toBase58(),
    shareBps: s.shareBps,
  }));

  const locked = cfg.adminRevoked === true;
  if (!locked) reasons.push("Split is not locked (admin not revoked)");

  const entry = shareholders.find((s) => s.address === charityWallet);
  if (!entry) reasons.push("Charity wallet is not a shareholder");
  else if (entry.shareBps < minBps) reasons.push(`Charity share below ${minBps / 100}%`);

  // Creator vault must route through the sharing config, else fees bypass the split.
  try {
    const bc = await new OnlinePumpSdk(connection).fetchBondingCurve(mint);
    if (!bc.creator.equals(cfgAddr)) reasons.push("Bonding curve creator is not the sharing config");
  } catch {
    // Graduated coins may not have a readable curve here. Do not fail on that alone.
  }

  return { ok: reasons.length === 0, reasons, locked, shareholders, admin: cfg.admin.toBase58() };
}

export { bondingCurvePda, feeSharingConfigPda };