import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { loadLaunchTable } from "./lut";
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  PUMP_SDK,
  OnlinePumpSdk,
  feeSharingConfigPda,
  bondingCurvePda,
  getBuyTokenAmountFromSolAmount,
} from "@pump-fun/pump-sdk";
import type { Global } from "@pump-fun/pump-sdk";
import BN from "bn.js";
import type { Share } from "./shares";
import { MIN_CHARITY_BPS } from "./config";

export class TooLargeError extends Error {
  constructor() {
    super("Name, ticker or links are too long to include a dev buy");
  }
}

export type LaunchIxInput = {
  creator: PublicKey;
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  shares: Share[];
  /** Optional dev buy. Runs in the same transaction as create, so nobody can snipe the coin first. */
  devBuy?: { global: Global; amount: BN; solAmount: BN };
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
  // With a dev buy: create_v2 + the creator's token account + the first buy, all in one transaction.
  const createIxs = i.devBuy
    ? await PUMP_SDK.createV2AndBuyInstructions({
        global: i.devBuy.global,
        mint: i.mint,
        name: i.name,
        symbol: i.symbol,
        uri: i.uri,
        creator: i.creator,
        user: i.creator,
        amount: i.devBuy.amount,
        solAmount: i.devBuy.solAmount,
        mayhemMode: false,
      })
    : [
        await PUMP_SDK.createV2Instruction({
          mint: i.mint,
          name: i.name,
          symbol: i.symbol,
          uri: i.uri,
          creator: i.creator,
          user: i.creator,
          mayhemMode: false,
        }),
      ];

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
    // With a dev buy the transaction is close to the size limit, so the compute limit instruction is dropped
    // (the default limit is enough). The priority fee stays so the transaction lands.
    create: [
      ...(i.devBuy ? [] : [ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })]),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200_000 }),
      ...createIxs,
    ],
    share: [ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200_000 }), cfgIx, updIx],
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
  devBuyLamports?: bigint,
): Promise<{ txs: (Transaction | VersionedTransaction)[]; lastValidBlockHeight: number }> {
  const withBuy = Boolean(devBuyLamports && devBuyLamports > 0n);
  let input = i;
  let table = null as Awaited<ReturnType<typeof loadLaunchTable>> | null;
  if (withBuy) {
    table = await loadLaunchTable(connection); // throws LutMissingError when dev buy is not set up
    const sdk = new OnlinePumpSdk(connection);
    const [global, feeConfig] = await Promise.all([sdk.fetchGlobal(), sdk.fetchFeeConfig()]);
    const solAmount = new BN((devBuyLamports as bigint).toString());
    // A coin that does not exist yet: quote from the starting curve.
    const amount = getBuyTokenAmountFromSolAmount({
      global,
      feeConfig,
      mintSupply: null,
      bondingCurve: null,
      amount: solAmount,
      quoteMint: NATIVE_MINT,
    });
    if (amount.lten(0)) throw new Error("Dev buy amount is too small");
    input = { ...i, devBuy: { global, amount, solAmount } };
  }
  const { create, share } = await buildLaunchInstructions(input);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

  // The mint signs on the client AFTER the wallet. Wallets such as Phantom may rewrite the
  // message when signing, which would wipe a signature added earlier.
  void mintKeypair;

  let tx1: Transaction | VersionedTransaction;
  if (withBuy && table) {
    // Create + dev buy in ONE transaction, so nobody can snipe the coin before the creator buys.
    const msg = new TransactionMessage({ payerKey: i.creator, recentBlockhash: blockhash, instructions: create }).compileToV0Message([table]);
    const v = new VersionedTransaction(msg);
    if (v.serialize().length > 1232) throw new TooLargeError();
    tx1 = v;
  } else {
    const t = new Transaction({ feePayer: i.creator, blockhash, lastValidBlockHeight });
    t.add(...create);
    tx1 = t;
  }
  const tx2 = new Transaction({ feePayer: i.creator, blockhash, lastValidBlockHeight });
  tx2.add(...share);
  return { txs: [tx1, tx2], lastValidBlockHeight };
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