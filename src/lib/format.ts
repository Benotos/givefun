export const LAMPORTS = 1_000_000_000;

export function solFromLamports(l: number | string | bigint): number {
  return Number(l) / LAMPORTS;
}

export function fmtSol(l: number | string | bigint, max = 3): string {
  const n = solFromLamports(l);
  if (n === 0) return "0";
  if (n < 0.001) return "<0.001";
  return n.toLocaleString("en-US", { maximumFractionDigits: max });
}

export function timeAgo(iso: string | number, now = Date.now()): string {
  const t = typeof iso === "number" ? iso : new Date(iso).getTime();
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export const shortAddr = (a: string, n = 4) => (a.length > n * 2 + 3 ? `${a.slice(0, n)}...${a.slice(-n)}` : a);

// Deterministic warm gradient per mint, so every coin without an image still has a face.
export function gradientFor(seed: string): [string, string] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hues = [8, 18, 28, 40, 48, 150, 165, 340, 352];
  const a = hues[h % hues.length];
  const b = hues[(h >> 5) % hues.length];
  return [`hsl(${a} 90% 62%)`, `hsl(${(b + 30) % 360} 85% 48%)`];
}

export const pct = (bps: number) => `${bps / 100}%`;
