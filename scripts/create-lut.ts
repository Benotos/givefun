// One time setup for dev buy. Creates an address lookup table holding the accounts every launch shares.
// Run:  npm run create-lut
// Needs env: HELIUS_RPC_URL (or RPC_URLS) and WORKER_SECRET_KEY (a funded wallet, about 0.01 SOL is enough).
// Then add the printed address to Vercel as LAUNCH_LUT and redeploy.
import { AddressLookupTableProgram, Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import BN from "bn.js";
import { OnlinePumpSdk } from "@pump-fun/pump-sdk";
import { buildLaunchInstructions } from "../src/lib/pump";
import { computeShares } from "../src/lib/shares";
import { staticKeys } from "../src/lib/lut";

function loadEnv() {
  // tsx does not read .env.local on its own, so load it here (Node 20.12 or newer).
  for (const f of [".env.local", ".env"]) {
    try {
      (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile(f);
    } catch {
      /* file missing, fine */
    }
  }
}

async function main() {
  loadEnv();
  const rpc = process.env.HELIUS_RPC_URL || (process.env.RPC_URLS || "").split(",")[0];
  const raw = process.env.WORKER_SECRET_KEY;
  if (!rpc) throw new Error("HELIUS_RPC_URL is missing in .env.local (or RPC_URLS)");
  if (!raw) throw new Error("WORKER_SECRET_KEY is missing in .env.local");
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  const conn = new Connection(rpc, "confirmed");

  const global = await new OnlinePumpSdk(conn).fetchGlobal();
  const sample = async () => {
    const creator = Keypair.generate().publicKey;
    const shares = computeShares({
      devWallet: creator.toBase58(),
      charityWallet: Keypair.generate().publicKey.toBase58(),
      charityBps: 7000,
      platformWallet: Keypair.generate().publicKey.toBase58(),
      platformBps: 500,
    });
    const { create } = await buildLaunchInstructions({
      creator, mint: Keypair.generate().publicKey, name: "Sample", symbol: "SMP", uri: "https://example.com/m.json", shares,
      devBuy: { global, amount: new BN(1_000_000_000), solAmount: new BN(100_000_000) },
    });
    return create;
  };
  const keys = staticKeys(global, [await sample(), await sample(), await sample()]);
  console.log(`Table will hold ${keys.length} accounts. Paying from ${payer.publicKey.toBase58()}`);

  const slot = await conn.getSlot("finalized");
  const [createIx, table] = AddressLookupTableProgram.createLookupTable({ authority: payer.publicKey, payer: payer.publicKey, recentSlot: slot });
  await sendAndConfirmTransaction(conn, new Transaction().add(createIx), [payer]);
  for (let i = 0; i < keys.length; i += 20) {
    const ext = AddressLookupTableProgram.extendLookupTable({ lookupTable: table, authority: payer.publicKey, payer: payer.publicKey, addresses: keys.slice(i, i + 20) as PublicKey[] });
    await sendAndConfirmTransaction(conn, new Transaction().add(ext), [payer]);
  }
  console.log("\nDone. Add this to Vercel env and redeploy:\n");
  console.log(`LAUNCH_LUT=${table.toBase58()}\n`);
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });