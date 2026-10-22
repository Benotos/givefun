// Pure and browser safe. Shared by the server (types) and the chart component (aggregation).

/** [unixSeconds, priceSol, solAmount, isBuy 1/0]. Price is SOL per whole token. */
export type Trade = [number, number, number, number];

export const TOTAL_SUPPLY = 1_000_000_000;

export type Candle = { time: number; open: number; high: number; low: number; close: number };
export type Bar = { time: number; value: number; up: boolean };

/** Groups trades into candles. Each candle opens at the previous close, like a trading terminal. */
export function toCandles(trades: Trade[], tfSec: number): { candles: Candle[]; volume: Bar[] } {
  const candles: Candle[] = [];
  const vols: number[] = [];
  let prevClose: number | null = null;
  for (const [t, price, sol] of trades) {
    const bucket = Math.floor(t / tfSec) * tfSec;
    const last = candles[candles.length - 1];
    if (last && last.time === bucket) {
      last.high = Math.max(last.high, price);
      last.low = Math.min(last.low, price);
      last.close = price;
      vols[vols.length - 1] += sol;
    } else {
      const open: number = prevClose ?? price;
      candles.push({ time: bucket, open, high: Math.max(open, price), low: Math.min(open, price), close: price });
      vols.push(sol);
    }
    prevClose = price;
  }
  const volume = candles.map((c, i) => ({ time: c.time, value: vols[i], up: c.close >= c.open }));
  return { candles, volume };
}