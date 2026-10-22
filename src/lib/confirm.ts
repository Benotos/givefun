import type { Connection } from "@solana/web3.js";
import { sleep } from "./util";

/**
 * Confirms a transaction by polling over plain HTTP.
 * web3.js confirmTransaction opens a websocket, which our RPC proxy and serverless hosts do not support.
 */
export async function confirmByPolling(
  conn: Connection,
  signature: string,
  lastValidBlockHeight: number,
  timeoutMs = 60_000,
): Promise<void> {
  const start = Date.now();
  let loop = 0;
  while (Date.now() - start < timeoutMs) {
    const { value } = await conn.getSignatureStatuses([signature], { searchTransactionHistory: false });
    const st = value[0];
    if (st) {
      if (st.err) throw new Error("Transaction failed on chain");
      if (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized") return;
    }
    if (loop % 3 === 2) {
      const bh = await conn.getBlockHeight("confirmed");
      if (bh > lastValidBlockHeight) throw new Error("Transaction expired, please try again");
    }
    loop++;
    await sleep(1500);
  }
  throw new Error("Confirmation timed out");
}
