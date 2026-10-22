import { AddressLookupTableAccount, Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { Global } from "@pump-fun/pump-sdk";

/**
 * A launch with a dev buy does not fit in one legacy transaction (1232 byte limit).
 * An address lookup table stores the accounts that are the same on every launch, so the transaction only
 * references them by a one byte index. The table is created once with scripts/create-lut.ts.
 */

export class LutMissingError extends Error {
  constructor(msg = "Dev buy is not set up yet") {
    super(msg);
  }
}

/** Accounts that appear in every sample launch, plus every fee recipient the program may pick. */
export function staticKeys(global: Global, samples: TransactionInstruction[][]): PublicKey[] {
  const sets = samples.map(
    (ixs) => new Set(ixs.flatMap((ix) => [ix.programId.toBase58(), ...ix.keys.map((k) => k.pubkey.toBase58())])),
  );
  const common = [...sets[0]].filter((k) => sets.every((s) => s.has(k)));
  const extra = [
    global.feeRecipient,
    ...global.feeRecipients,
    global.reservedFeeRecipient,
    ...global.reservedFeeRecipients,
    ...global.buybackFeeRecipients,
  ].map((k) => k.toBase58());
  return [...new Set([...common, ...extra])]
    .filter((k) => k !== PublicKey.default.toBase58())
    .map((k) => new PublicKey(k));
}

let cache: { at: number; table: AddressLookupTableAccount } | null = null;

export async function loadLaunchTable(connection: Connection): Promise<AddressLookupTableAccount> {
  const addr = (process.env.LAUNCH_LUT || "").trim();
  if (!addr) throw new LutMissingError();
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.table;
  const { value } = await connection.getAddressLookupTable(new PublicKey(addr));
  if (!value || value.state.addresses.length === 0) throw new LutMissingError("Dev buy table not found on chain");
  cache = { at: Date.now(), table: value };
  return value;
}