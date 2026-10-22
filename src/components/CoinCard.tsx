import Link from "next/link";
import type { Coin } from "@/lib/store";
import { fmtSol, timeAgo } from "@/lib/format";
import CoinAvatar from "./CoinAvatar";
import SplitBar, { segsFor } from "./SplitBar";
import Icon from "./Icon";

export default function CoinCard({ coin, charityName }: { coin: Coin; charityName?: string }) {
  return (
    <Link href={`/coin/${coin.mint}`} className="card card-hover group block p-5">
      <div className="flex items-center gap-3.5">
        <CoinAvatar mint={coin.mint} symbol={coin.symbol} image={coin.image_url} size={52} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg font-bold leading-tight">{coin.name}</div>
          <div className="text-xs text-mute">${coin.symbol}</div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-mint/10 px-2 py-1 text-[11px] font-semibold text-mint">
          <Icon name="lock" size={11} /> Locked
        </span>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between text-xs">
          <span className="text-mute">
            <b className="font-display text-base font-bold text-ember">{coin.charity_bps / 100}%</b> to {charityName ?? "charity"}
          </span>
        </div>
        <SplitBar segs={segsFor(coin.charity_bps, coin.platform_bps)} />
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-xs">
        <span className="text-mute" suppressHydrationWarning>{timeAgo(coin.created_at)}</span>
        <span>
          <b className="font-display text-sm font-bold text-amber">{fmtSol(coin.total_donated_lamports)}</b>{" "}
          <span className="text-mute">SOL donated</span>
        </span>
      </div>
    </Link>
  );
}
