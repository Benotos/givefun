import { PublicKey } from "@solana/web3.js";
import { OnlinePumpSdk, PUMP_SDK, feeSharingConfigPda } from "@pump-fun/pump-sdk";
import { getConnection } from "../src/lib/rpc";

const MINT = new PublicKey("HSvEssofZv93nmwxv3jx4PrTEkPDpBMwqXJEXrRQZkGN");
const EXPECTED_CHARITY_WALLET = "4Z2DBVoQCJZ42cCTDMNvYDUqRjA1C3vV7B155Mc6jGah"; // GiveWell

async function main() {
  const connection = getConnection();
  const configAddress = feeSharingConfigPda(MINT);
  const info = await connection.getAccountInfo(configAddress, "confirmed");

  console.log("BONNY mint:", MINT.toBase58());
  console.log("Fee-sharing config PDA:", configAddress.toBase58());

  if (!info) {
    console.log("RESULT: No fee-sharing config account found on-chain for BONNY.");
    process.exitCode = 1;
    return;
  }

  const config = PUMP_SDK.decodeSharingConfig(info);
  const shareholders = config.shareholders.map((s) => ({
    wallet: s.address.toBase58(),
    percent: s.shareBps / 100,
    isExpectedGiveWellWallet: s.address.toBase58() === EXPECTED_CHARITY_WALLET,
  }));

  console.log("Split locked:", config.adminRevoked === true);
  console.log("Shareholders:");
  console.log(JSON.stringify(shareholders, null, 2));

  const sdk = new OnlinePumpSdk(connection);
  const fees = await sdk.getMinimumDistributableFee(MINT);
  console.log("Minimum required (lamports):", fees.minimumRequired.toString());
  console.log("Currently distributable (lamports):", fees.distributableFees.toString());
  console.log("Can distribute now:", fees.canDistribute);
  console.log("Graduated token:", fees.isGraduated);
}

main().catch((error) => {
  console.error("Diagnostic failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
