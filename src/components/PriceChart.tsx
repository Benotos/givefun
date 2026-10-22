// Trading terminal style chart. DexScreener indexes pump.fun coins by token address, so the embed
// needs nothing from us except the mint. New coins can take a minute or two to appear.
export default function PriceChart({ mint, symbol }: { mint: string; symbol: string }) {
  const src = `https://dexscreener.com/solana/${mint}?embed=1&theme=dark&trades=0&info=0&loadChartSettings=0&chartLeftToolbar=0&chartTheme=dark&chartStyle=1&chartType=usd&interval=15`;
  const pump = `https://pump.fun/coin/${mint}`;
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-6">
        <h2 className="font-display text-xl font-bold">${symbol} chart</h2>
        <div className="flex gap-2">
          <a href={pump} target="_blank" rel="noreferrer" className="btn btn-sm">Buy</a>
          <a href={pump} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">Sell</a>
          <a href={`https://dexscreener.com/solana/${mint}`} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">Full chart</a>
        </div>
      </div>
      <div className="relative h-[560px] w-full border-t border-line bg-ink">
        <iframe
          title={`${symbol} price chart`}
          src={src}
          loading="lazy"
          className="absolute inset-0 h-full w-full border-0"
          referrerPolicy="no-referrer"
        />
      </div>
      <p className="border-t border-line px-6 py-3 text-xs text-mute">
        Chart data from DexScreener. A brand new coin can take a minute or two to show up. Use Full chart to see trades. Trading happens on pump.fun.
      </p>
    </section>
  );
}