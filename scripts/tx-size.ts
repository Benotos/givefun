// Offline check: do the launch instructions fit Solana's 1232 byte tx limit?
import { Keypair, Transaction } from "@solana/web3.js";
import { buildLaunchInstructions } from "../src/lib/pump";
import { computeShares } from "../src/lib/shares";

async function main() {
  const creator = Keypair.generate();
  const mint = Keypair.generate();
  const charity = Keypair.generate().publicKey.toBase58();
  const platform = Keypair.generate().publicKey.toBase58();

  const shares = computeShares({
    devWallet: creator.publicKey.toBase58(),
    charityWallet: charity,
    charityBps: 7000,
    platformWallet: platform,
    platformBps: 500,
  });

  const { create, share } = await buildLaunchInstructions({
    creator: creator.publicKey,
    mint: mint.publicKey,
    name: "Test",
    symbol: "TST",
    uri: "https://example.com/m.json",
    shares,
  });

  const size = (ixs: typeof create, signers: Keypair[]) => {
    const tx = new Transaction({ feePayer: creator.publicKey, blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1 });
    tx.add(...ixs);
    if (signers.length) tx.partialSign(...signers);
    try {
      return tx.serialize({ requireAllSignatures: false }).length;
    } catch (e) {
      return `TOO LARGE (${(e as Error).message})`;
    }
  };

  const s1 = size(create, [mint]);
  const s2 = size(share, []);
  const combined = size([...create, ...share.slice(1)], [mint]);
  console.log({ tx1_create: s1, tx2_share: s2, combined_single_tx: combined, limit: 1232 });
  console.log("shares", shares.map((s) => [s.address.toBase58().slice(0, 6), s.shareBps]));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
