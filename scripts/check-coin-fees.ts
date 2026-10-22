import { Keypair, PublicKey } from "@solana/web3.js";
import { OnlinePumpSdk, PUMP_SDK, feeSharingConfigPda } from "@pump-fun/pump-sdk";
import { getConnection } from "../src/lib/rpc";
import { store } from "../src/lib/store";

// The coin being checked (Stay Here example shared by Trencher).
const MINT = new PublicKey("FwaumD2bZkVrNhPdEQRLSkAYoLhrgyBdy3yfuVMoGW8w");

async function main() {
  const connection = getConnection();
  const s = store();
  const coin = await s.getCoin(MINT.toBase58());
  const configAddress = feeSharingConfigPda(MINT);
  const info = await connection.getAccountInfo(configAddress, "confirmed");

  console.log("Token mint:", MINT.toBase58());
  console.log("Coin in Give.fun database:", Boolean(coin));
  if (coin) {
    console.log("Coin:", `${coin.name} (${coin.symbol})`);
    console.log("Selected charity slug:", coin.charity_slug);
    console.log("Database charity wallet:", coin.charity_wallet);
    console.log("Configured charity share:", `${coin.charity_bps / 100}%`);
    console.log("Give.fun recorded donations (lamports):", coin.total_donated_lamports);
    console.log("Give.fun status:", coin.status);
    if (coin.fail_reason) console.log("Last verification reason:", coin.fail_reason);
  } else {
    console.log("WARNING: No matching coin row found in the configured database.");
  }
  console.log("Fee-sharing config PDA:", configAddress.toBase58());

  if (!info) {
    console.log("RESULT: No fee-sharing configuration account found on-chain for this token.");
    process.exitCode = 1;
    return;
  }

  const config = PUMP_SDK.decodeSharingConfig(info);
  const expectedCharity = coin?.charity_wallet ?? "";
  const shareholders = config.shareholders.map((shareholder) => ({
    wallet: shareholder.address.toBase58(),
    percent: shareholder.shareBps / 100,
    isDatabaseCharityWallet: Boolean(expectedCharity) && shareholder.address.toBase58() === expectedCharity,
  }));

  console.log("Split locked:", config.adminRevoked === true);
  console.log("On-chain shareholders:");
  console.log(JSON.stringify(shareholders, null, 2));
  console.log(
    "Database charity wallet is an on-chain shareholder:",
    Boolean(expectedCharity) && shareholders.some((shareholder) => shareholder.isDatabaseCharityWallet),
  );

  const sdk = new OnlinePumpSdk(connection);
  const secretRaw = process.env.WORKER_SECRET_KEY;
  let workerPublicKey: PublicKey | undefined;
  if (secretRaw) {
    try {
      workerPublicKey = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretRaw))).publicKey;
    } catch {
      console.log("WARNING: WORKER_SECRET_KEY exists but is not a valid JSON secret-key array; continuing without payer-specific check.");
    }
  }
  const fees = workerPublicKey
    ? await sdk.getMinimumDistributableFee(MINT, workerPublicKey)
    : await sdk.getMinimumDistributableFee(MINT);
  console.log("Minimum required (lamports):", fees.minimumRequired.toString());
  console.log("Currently distributable (lamports):", fees.distributableFees.toString());
  console.log("Can distribute now:", fees.canDistribute);
  console.log("Graduated token:", fees.isGraduated);
}

main().catch((error) => {
  console.error("Diagnostic failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
