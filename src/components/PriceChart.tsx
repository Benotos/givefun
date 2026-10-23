"use client";
import { useEffect, useRef, useState } from "react";
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { toCandles, TOTAL_SUPPLY, type Trade } from "@/lib/candles";
import CopyButton from "./CopyButton";

// On-chain trades are denominated in SOL. Convert market cap to USD using the current SOL/USD
// spot quote so the header and chart use the same currency.
const TFS = [
  { k: "1s", s: 1 },
  { k: "5s", s: 5 },
  { k: "15s", s: 15 },
  { k: "30s", s: 30 },
  { k: "1m", s: 60 },
  { k: "5m", s: 300 },
  { k: "15m", s: 900 },
  { k: "1h", s: 3600 },
];

const UP = "#34d399";
const DOWN = "#fb7185";

function fmtUsd(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(n);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n < 1 ? 4 : 2,
  }).format(n);
}

export default function PriceChart({ mint, symbol }: { mint: string; symbol: string }) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candleS = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volS = useRef<ISeriesApi<"Histogram"> | null>(null);
  const [tf, setTf] = useState(TFS[5]);
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [solUsd, setSolUsd] = useState<number | null>(null);
  const [solUsdError, setSolUsdError] = useState(false);
  const pump = `https://pump.fun/coin/${mint}`;

  // The API route caches a shared spot quote so each chart doesn't call an exchange directly.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const load = async () => {
      try {
        const r = await fetch("/api/sol-price", { cache: "no-store" });
        if (!r.ok) throw new Error(`SOL price HTTP ${r.status}`);
        const body = (await r.json()) as { priceUsd?: number };
        const price = Number(body.priceUsd);
        if (!Number.isFinite(price) || price <= 0) throw new Error("Invalid SOL/USD quote");
        if (!stopped) {
          setSolUsd(price);
          setSolUsdError(false);
        }
      } catch {
        if (!stopped) setSolUsdError(true);
      }
      if (!stopped) timer = setTimeout(load, document.hidden ? 120_000 : 30_000);
    };

    void load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  // Remember the chosen timeframe for the next chart, in this browser.
  useEffect(() => {
    try {
      const saved = TFS.find((t) => t.k === localStorage.getItem("givefun:tf"));
      if (saved) setTf(saved);
    } catch {
      /* storage blocked, keep the default */
    }
  }, []);
  function pickTf(t: (typeof TFS)[number]) {
    setTf(t);
    try {
      localStorage.setItem("givefun:tf", t.k);
    } catch {
      /* ignore */
    }
  }

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
      priceFormat: { type: "custom", formatter: (p: number) => fmtUsd(p) },
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
    if (!trades || solUsd === null || !candleS.current || !volS.current) return;
    // Convert SOL market cap to its current USD equivalent; trade volume remains denominated in SOL.
    const scaled: Trade[] = trades.map((t) => [t[0], t[1] * TOTAL_SUPPLY * solUsd, t[2], t[3]]);
    const { candles, volume } = toCandles(scaled, tf.s);
    candleS.current.setData(candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })));
    volS.current.setData(volume.map((v) => ({ time: v.time as UTCTimestamp, value: v.value, color: v.up ? "rgba(52,211,153,0.35)" : "rgba(251,113,133,0.35)" })));
    chart.current?.applyOptions({ timeScale: { secondsVisible: tf.s < 60 } });
    chart.current?.timeScale().fitContent();
  }, [trades, tf, solUsd]);

  const lastUsd = trades && trades.length && solUsd !== null
    ? trades[trades.length - 1][1] * TOTAL_SUPPLY * solUsd
    : null;
  const empty = trades !== null && trades.length === 0;
  const marketCap = lastUsd !== null
    ? fmtUsd(lastUsd)
    : trades === null
      ? "loading"
      : empty
        ? "—"
        : solUsdError
          ? "USD price unavailable"
          : "loading USD price";

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-bold">${symbol} chart</h2>
            <CopyButton text={mint} label="Copy CA" />
          </div>
          <div className="mt-0.5 text-xs text-mute">
            Market cap <b className="text-white">{marketCap}</b>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-line text-xs">
            {TFS.map((t) => (
              <button
                key={t.k}
                onClick={() => pickTf(t)}
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
        {(trades === null || empty || failed || solUsd === null) && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-mute">
            {failed && trades === null
              ? "Could not load the chart. Retrying."
              : empty
                ? "No trades yet. The chart starts with the first trade."
                : solUsd === null && solUsdError
                  ? "USD spot price unavailable. Retrying."
                  : "Loading chart"}
          </div>
        )}
      </div>
      <p className="border-t border-line px-6 py-3 text-xs text-mute">
        Live from on-chain trades. USD market cap uses the current SOL/USD spot price. Trading happens on pump.fun.
      </p>
    </section>
  );
}