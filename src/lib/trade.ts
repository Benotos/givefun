import { PublicKey } from "@solana/web3.js";
import type { Connection, VersionedTransactionResponse } from "@solana/web3.js";
import { PUMP_SDK, bondingCurvePda, pumpIdl } from "@pump-fun/pump-sdk";
import { kvGet, kvSet } from "./kv";
import { getConnection } from "./rpc";
import { getSnapshot } from "./snapshot";

import type { Trade } from "./candles";
export type { Trade } from "./candles";

/**
 * Our own chart data. Reads the coin's bonding curve trades straight from the chain,
 * so a brand new coin has a chart from its first trade. No indexer in between.
 *
 * A trade is stored as [unixSeconds, priceSol, solAmount, isBuy 1/0].
 * Price is SOL per whole token, from the curve reserves right after the trade.
 */
type Stored = { trades: Trade[]; newestSig: string | null };

const TOKEN_DECIMALS = 6;
const MAX_TRADES = 3000;
const MAX_TX_PER_REFRESH = 300;
const CHUNK = 20;

const tradeDisc = Buffer.from(
  (pumpIdl as { events: { name: string; discriminator: number[] }[] }).events.find((e) => e.name === "TradeEvent")!.discriminator,
);

/** Pure. Pulls this coin's trade events out of a transaction's log lines. */
export function tradesFromLogs(logs: string[], mint: PublicKey, fallbackTime: number): Trade[] {
  const out: Trade[] = [];
  for (const line of logs) {
    if (!line.startsWith("Program data: ")) continue;
    const data = Buffer.from(line.slice("Program data: ".length), "base64");
    if (data.length < 9 || !data.subarray(0, 8).equals(tradeDisc)) continue;
    try {
      const e = PUMP_SDK.decodeTradeEventBc(data.subarray(8));
      if (!e.mint.equals(mint)) continue;
      const vSol = Number(e.virtualSolReserves.toString()) / 1e9;
      const vTok = Number(e.virtualTokenReserves.toString()) / 10 ** TOKEN_DECIMALS;
      if (!(vSol > 0) || !(vTok > 0)) continue;
      const ts = Number(e.timestamp.toString()) || fallbackTime;
      out.push([ts, vSol / vTok, Number(e.solAmount.toString()) / 1e9, e.isBuy ? 1 : 0]);
    } catch {
      /* not a decodable trade event, skip */
    }
  }
  return out;
}

async function fetchTxs(conn: Connection, sigs: string[]): Promise<(VersionedTransactionResponse | null)[]> {
  try {
    return await conn.getTransactions(sigs, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  } catch {
    // Some RPC plans refuse batches. Fall back to one by one.
    return Promise.all(
      sigs.map((s) => conn.getTransaction(s, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }).catch(() => null)),
    );
  }
}

/** Reads only what is new since the last refresh, then stores the result. */
async function refreshTrades(mintStr: string): Promise<Trade[]> {
  const mint = new PublicKey(mintStr);
  const conn = getConnection();
  const key = `trades:${mintStr}`;
  const prev = (await kvGet<Stored>(key)) ?? { trades: [], newestSig: null };

  const sigInfos = await conn.getSignaturesForAddress(
    bondingCurvePda(mint),
    { limit: prev.newestSig ? 200 : 1000, ...(prev.newestSig ? { until: prev.newestSig } : {}) },
    "confirmed",
  );
  if (sigInfos.length === 0) return prev.trades;

  // Newest first from the RPC. Failed transactions never traded.
  const ok = sigInfos.filter((s) => !s.err).slice(0, MAX_TX_PER_REFRESH);
  const fresh: Trade[] = [];
  for (let i = 0; i < ok.length; i += CHUNK) {
    const part = ok.slice(i, i + CHUNK);
    const txs = await fetchTxs(conn, part.map((p) => p.signature));
    txs.forEach((tx, j) => {
      const logs = tx?.meta?.logMessages;
      if (!logs) return;
      fresh.push(...tradesFromLogs(logs, mint, part[j].blockTime ?? Math.floor(Date.now() / 1000)));
    });
  }

  const merged = [...prev.trades, ...fresh].sort((a, b) => a[0] - b[0]).slice(-MAX_TRADES);
  await kvSet(key, { trades: merged, newestSig: sigInfos[0].signature } satisfies Stored, 60 * 60 * 24 * 30);
  return merged;
}

/** Cached for a few seconds, so many viewers cost one RPC refresh. */
export async function getTrades(mint: string): Promise<Trade[]> {
  const r = await getSnapshot<Trade[]>(`candles:${mint}`, {
    softSec: 8,
    hardSec: 3600,
    loader: () => refreshTrades(mint),
    fallback: [],
    loaderTimeoutMs: 15_000,
  });
  return r.data;
}