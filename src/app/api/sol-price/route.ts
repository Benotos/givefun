import { cached, noStore } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 8;

type CoinbaseResponse = { data?: { amount?: string; currency?: string } };
type KrakenResponse = { error?: string[]; result?: Record<string, { c?: string[] }> };

async function coinbasePrice(): Promise<number> {
  const r = await fetch("https://api.coinbase.com/v2/prices/SOL-USD/spot", {
    cache: "no-store",
    signal: AbortSignal.timeout(3500),
    headers: { accept: "application/json" },
  });
  if (!r.ok) throw new Error(`Coinbase price HTTP ${r.status}`);
  const body = (await r.json()) as CoinbaseResponse;
  const price = Number(body.data?.amount);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Invalid Coinbase SOL/USD price");
  return price;
}

async function krakenPrice(): Promise<number> {
  const r = await fetch("https://api.kraken.com/0/public/Ticker?pair=SOLUSD", {
    cache: "no-store",
    signal: AbortSignal.timeout(3500),
    headers: { accept: "application/json" },
  });
  if (!r.ok) throw new Error(`Kraken price HTTP ${r.status}`);
  const body = (await r.json()) as KrakenResponse;
  if (body.error?.length) throw new Error("Kraken price response contains an error");
  const ticker = Object.values(body.result ?? {})[0];
  const price = Number(ticker?.c?.[0]);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Invalid Kraken SOL/USD price");
  return price;
}

/** A shared, short-cache USD spot quote for converting SOL-denominated market cap values. */
export async function GET() {
  try {
    return cached({ priceUsd: await coinbasePrice(), source: "Coinbase" }, 30, 60);
  } catch {
    try {
      return cached({ priceUsd: await krakenPrice(), source: "Kraken" }, 30, 60);
    } catch {
      return noStore({ error: "SOL/USD spot price is temporarily unavailable" }, 503);
    }
  }
}
