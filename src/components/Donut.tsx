import type { Seg } from "./SplitBar";

export default function Donut({ segs, size = 168, center }: { segs: Seg[]; size?: number; center?: React.ReactNode }) {
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label="Fee split">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2a2520" strokeWidth="14" />
        {segs.map((s) => {
          const len = (s.bps / 10000) * c;
          const el = (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="14"
              strokeDasharray={`${Math.max(0, len - 2)} ${c}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      {center && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
    </div>
  );
}
