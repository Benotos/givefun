"use client";
import { useEffect, useRef, useState } from "react";
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { toCandles, TOTAL_SUPPLY, type Trade } from "@/lib/candles";

// Our own chart. Trades are read from the chain by /api/candles, so a brand new coin charts from its first trade.
// Y axis is market cap in SOL (price times the 1 billion supply every pump.fun coin has).
const TFS = [
  { k: "1m", s: 60 },
  { k: "5m", s: 300 },
  { k: "15m", s: 900 },
  { k: "1h", s: 3600 },
];

const UP = "#34d399";
const DOWN = "#fb7185";

function fmt(n: number) {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export default function PriceChart({ mint, symbol }: { mint: string; symbol: string }) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candleS = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volS = useRef<ISeriesApi<"Histogram"> | null>(null);
  const [tf, setTf] = useState(TFS[1]);
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [failed, setFailed] = useState(false);
  const pump = `https://pump.fun/coin/${mint}`;

  // create the chart once
  useEffect(() => {
    if (!box.current) return;
    const c = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: "#9aa3b2", fontFamily: "inherit" },
      grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)", scaleMargins: { top: 0.08, bottom: 0.25 } },
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    });
    candleS.current = c.addCandlestickSeries({
      upColor: UP,
      downColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      borderVisible: false,
      priceFormat: { type: "custom", formatter: (p: number) => fmt(p) },
    });
    volS.current = c.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
    c.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
    };
  }, []);

  // poll trades
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const r = await fetch(`/api/candles/${mint}`, { cache: "no-store" });
        const j = (await r.json()) as { trades?: Trade[] };
        if (!stop && Array.isArray(j.trades)) {
          setTrades(j.trades);
          setFailed(false);
        }
      } catch {
        if (!stop) setFailed(true);
      }
      if (!stop) timer = setTimeout(load, document.hidden ? 60_000 : 10_000);
    }
    load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [mint]);

  // draw
  useEffect(() => {
    if (!trades || !candleS.current || !volS.current) return;
    const scaled: Trade[] = trades.map((t) => [t[0], t[1] * TOTAL_SUPPLY, t[2], t[3]]);
    const { candles, volume } = toCandles(scaled, tf.s);
    candleS.current.setData(candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })));
    volS.current.setData(volume.map((v) => ({ time: v.time as UTCTimestamp, value: v.value, color: v.up ? "rgba(52,211,153,0.35)" : "rgba(251,113,133,0.35)" })));
    chart.current?.timeScale().fitContent();
  }, [trades, tf]);

  const last = trades && trades.length ? trades[trades.length - 1][1] * TOTAL_SUPPLY : null;
  const empty = trades !== null && trades.length === 0;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-6">
        <div>
          <h2 className="font-display text-xl font-bold">${symbol} chart</h2>
          <div className="mt-0.5 text-xs text-mute">
            Market cap {last !== null ? <b className="text-white">{fmt(last)} SOL</b> : "loading"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-line text-xs">
            {TFS.map((t) => (
              <button
                key={t.k}
                onClick={() => setTf(t)}
                className={`px-3 py-1.5 font-semibold ${tf.k === t.k ? "bg-raise text-white" : "text-mute hover:text-white"}`}
              >
                {t.k}
              </button>
            ))}
          </div>
          <a href={pump} target="_blank" rel="noreferrer" className="btn btn-sm">Buy</a>
          <a href={pump} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">Sell</a>
        </div>
      </div>
      <div className="relative h-[480px] w-full border-t border-line bg-ink">
        <div ref={box} className="absolute inset-0" />
        {(trades === null || empty || failed) && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-mute">
            {failed && trades === null ? "Could not load the chart. Retrying." : empty ? "No trades yet. The chart starts with the first trade." : "Loading chart"}
          </div>
        )}
      </div>
      <p className="border-t border-line px-6 py-3 text-xs text-mute">
        Live from the chain, updates every few seconds. Market cap in SOL. Trading happens on pump.fun.
      </p>
    </section>
  );
}