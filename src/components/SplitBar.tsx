export type Seg = { label: string; bps: number; color: string };

export const SEG = { charity: "#ff6a45", platform: "#ffc766", dev: "#4b443c" };

export function segsFor(charityBps: number, platformBps: number): Seg[] {
  const dev = Math.max(0, 10000 - charityBps - platformBps);
  const out: Seg[] = [{ label: "Charity", bps: charityBps, color: SEG.charity }];
  if (platformBps > 0) out.push({ label: "Platform", bps: platformBps, color: SEG.platform });
  if (dev > 0) out.push({ label: "Dev", bps: dev, color: SEG.dev });
  return out;
}

export default function SplitBar({ segs, legend = false, height = 8 }: { segs: Seg[]; legend?: boolean; height?: number }) {
  return (
    <div>
      <div className="flex w-full overflow-hidden rounded-full bg-line" style={{ height }} role="img" aria-label={segs.map((s) => `${s.label} ${s.bps / 100}%`).join(", ")}>
        {segs.map((s) => (
          <div key={s.label} style={{ width: `${s.bps / 100}%`, background: s.color }} className="transition-[width] duration-500" />
        ))}
      </div>
      {legend && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-mute">
          {segs.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.label} <b className="font-semibold text-cream">{s.bps / 100}%</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
