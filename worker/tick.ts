import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { OnlinePumpSdk, PUMP_SDK, feeSharingConfigPda } from "@pump-fun/pump-sdk";
import { store } from "../src/lib/store";
import type { Coin } from "../src/lib/store";
import { MIN_CHARITY_BPS } from "../src/lib/config";
import { kvLock } from "../src/lib/kv";
import { confirmByPolling } from "../src/lib/confirm";

// Gate between distribute attempts per coin. Stored in KV so restarts and a second worker do not double fire.
const DISTRIBUTE_GATE_SEC = 10 * 60;

export type TickStats = {
  coins: number;
  verified: number;
  revoked: number;
  failed: number;
  distributed: number;
  errors: number;
};

export async function runTick(conn: Connection, signer: Keypair | null): Promise<TickStats> {
  const s = store();
  const coins = await s.coinsForWorker();
  const stats: TickStats = { coins: coins.length, verified: 0, revoked: 0, failed: 0, distributed: 0, errors: 0 };

  // 1) Re verify every split on chain, 100 accounts per RPC call.
  const valid: Coin[] = [];
  for (let i = 0; i < coins.length; i += 100) {
    const chunk = coins.slice(i, i + 100);
    const pdas = chunk.map((c) => feeSharingConfigPda(new PublicKey(c.mint)));
    const infos = await conn.getMultipleAccountsInfo(pdas, "confirmed");

    for (let j = 0; j < chunk.length; j++) {
      const c = chunk[j];
      const info = infos[j];
      let next: Coin["status"] = "pending";
      let reason: string | null = null;
      let isValid = false;

      if (!info) {
        next = c.status === "verified" ? "revoked" : "pending";
        reason = "Sharing config missing on chain";
      } else {
        const cfg = PUMP_SDK.decodeSharingConfig(info);
        const entry = cfg.shareholders.find((x) => x.address.toBase58() === c.charity_wallet);
        if (!cfg.adminRevoked) {
          next = c.status === "verified" ? "revoked" : "pending";
          reason = "Split is not locked";
        } else if (!entry || entry.shareBps < MIN_CHARITY_BPS) {
          // The locked split changed (for example a pump.fun CTO) or never matched. Pull the badge.
          next = c.status === "verified" ? "revoked" : "failed";
          reason = "Charity share missing or below 50 percent on chain";
        } else {
          next = "verified";
          isValid = true;
        }
      }

      // A moderator hid this coin. Keep it hidden, but still pay the charity if the split is valid.
      const status = c.status === "hidden" ? "hidden" : next;
      try {
        const patch: Partial<Coin> = { status, fail_reason: reason, last_checked_at: new Date().toISOString() };
        if (status === "verified" && c.status !== "verified") patch.verified_at = new Date().toISOString();
        await s.patchCoin(c.mint, patch);
      } catch (e) {
        stats.errors++;
        console.error("patch", c.mint, (e as Error).message);
        continue;
      }

      if (isValid) {
        valid.push(c);
        if (status === "verified") stats.verified++;
      } else if (status === "revoked") stats.revoked++;
      else if (status === "failed") stats.failed++;
    }
  }

  // 2) Distribute fees so charity wallets get paid on chain. Permissionless calls.
  if (signer) {
    const sdk = new OnlinePumpSdk(conn);
    for (const c of valid) {
      try {
        if (!(await kvLock(`distgate:${c.mint}`, DISTRIBUTE_GATE_SEC))) continue;
        const mint = new PublicKey(c.mint);
        const min = await sdk.getMinimumDistributableFee(mint, signer.publicKey);
        if (!min.canDistribute) continue;
        const sig = await distribute(conn, sdk, signer, mint);
        if (sig) {
          await recordPayout(conn, c, sig);
          stats.distributed++;
        }
      } catch (e) {
        stats.errors++;
        console.error("distribute", c.mint, (e as Error).message);
      }
    }
  }

  return stats;
}

async function send(conn: Connection, signer: Keypair, ixs: TransactionInstruction[]) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: signer.publicKey, blockhash, lastValidBlockHeight });
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ...ixs);
  tx.sign(signer);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await confirmByPolling(conn, sig, lastValidBlockHeight);
  return sig;
}

async function distribute(conn: Connection, sdk: OnlinePumpSdk, signer: Keypair, mint: PublicKey) {
  const { instructions, sweepCount } = await sdk.buildDistributeCreatorFeesInstructions(mint, {
    payer: signer.publicKey,
  });
  try {
    return await send(conn, signer, instructions);
  } catch (e) {
    // If the whole list is too large for one legacy tx, send sweeps first then the distribute.
    if (sweepCount > 0 && /too large/i.test((e as Error).message)) {
      await send(conn, signer, instructions.slice(0, sweepCount));
      return await send(conn, signer, instructions.slice(sweepCount));
    }
    throw e;
  }
}

// The payout amount is read from the confirmed transaction itself: the charity wallet balance change.
async function recordPayout(conn: Connection, c: Coin, signature: string) {
  const tx = await conn.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  if (!tx || !tx.meta || tx.meta.err) return;
  const keys = tx.transaction.message.getAccountKeys().staticAccountKeys.map((k) => k.toBase58());
  const idx = keys.indexOf(c.charity_wallet);
  if (idx < 0) return;
  const delta = tx.meta.postBalances[idx] - tx.meta.preBalances[idx];
  if (delta <= 0) return;

  const s = store();
  const r = await s.insertPayout({ signature, mint: c.mint, charity_wallet: c.charity_wallet, lamports: delta, created_at: new Date().toISOString() });
  if (r === "inserted") await s.addDonation(c.mint, delta);
}
