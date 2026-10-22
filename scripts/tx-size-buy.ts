// Offline check: does create + dev buy fit in one transaction (1232 bytes)? Uses a fake Global, only sizes matter.
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import BN from "bn.js";
import { buildLaunchInstructions } from "../src/lib/pump";
import { computeShares } from "../src/lib/shares";

const k = () => Keypair.generate().publicKey;
async function main() {
  const creator = Keypair.generate();
  const mint = Keypair.generate();
  const shares = computeShares({
    devWallet: creator.publicKey.toBase58(),
    charityWallet: k().toBase58(),
    charityBps: 7000,
    platformWallet: k().toBase58(),
    platformBps: 500,
  });
  const global = {
    initialized: true, authority: k(), feeRecipient: k(), initialVirtualTokenReserves: new BN(1), initialVirtualSolReserves: new BN(1),
    initialRealTokenReserves: new BN(1), tokenTotalSupply: new BN(1), feeBasisPoints: new BN(100), withdrawAuthority: k(), enableMigrate: true,
    poolMigrationFee: new BN(0), creatorFeeBasisPoints: new BN(30), feeRecipients: [k(), k(), k(), k(), k(), k(), k(), k()],
    setCreatorAuthority: k(), adminSetCreatorAuthority: k(), createV2Enabled: true, whitelistPda: k(), reservedFeeRecipient: k(),
    mayhemModeEnabled: false, reservedFeeRecipients: [k(), k()], isCashbackEnabled: false, buybackFeeRecipients: [k(), k(), k(), k(), k(), k(), k(), k()],
    buybackBasisPoints: new BN(0), initialVirtualQuoteReserves: new BN(1), whitelistedQuoteMints: [], creatorFeeConfigurable: false,
    maxConfigurableCreatorFeeBps: new BN(0), holderRewardClaimAuthority: new PublicKey("11111111111111111111111111111111"),
    isHolderRewardEnabled: false, maxCurveDepth: 0,
  };
  const { staticKeys } = await import("../src/lib/lut");
  const { AddressLookupTableAccount, TransactionMessage, VersionedTransaction } = await import("@solana/web3.js");
  const build = async (name: string, symbol: string, uri: string, creatorKey = creator.publicKey, mintKey = mint.publicKey) =>
    (await buildLaunchInstructions({
      creator: creatorKey, mint: mintKey, name, symbol, uri, shares,
      devBuy: { global: global as never, amount: new BN(1_000_000_000), solAmount: new BN(100_000_000) },
    })).create;

  // Build the table from three sample launches, exactly like scripts/create-lut.ts does.
  const samples = [];
  for (let n = 0; n < 3; n++) samples.push(await build("Sample", "SMP", "https://example.com/m.json", k(), k()));
  const keys = staticKeys(global as never, samples);
  const table = new AddressLookupTableAccount({
    key: k(),
    state: { deactivationSlot: BigInt("18446744073709551615"), lastExtendedSlot: 1, lastExtendedSlotStartIndex: 0, authority: k(), addresses: keys },
  });
  console.log("table holds", keys.length, "accounts");

  const size = async (name: string, symbol: string, uri: string) => {
    const ixs = await build(name, symbol, uri);
    const msg = new TransactionMessage({ payerKey: creator.publicKey, recentBlockhash: "11111111111111111111111111111111", instructions: ixs }).compileToV0Message([table]);
    return new VersionedTransaction(msg).serialize().length;
  };
  const longUri = "https://gateway-name.mypinata.cloud/ipfs/" + "Q".repeat(46);
  const rows = {
    short: await size("Test", "TST", "https://ipfs.io/ipfs/" + "Q".repeat(46)),
    worstCase: await size("N".repeat(32), "Y".repeat(10), longUri),
  };
  console.log({ ...rows, limit: 1232, fits: rows.worstCase <= 1232 });
  if (rows.worstCase > 1232) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });