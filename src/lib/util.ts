export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number, label = "op"): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t)) as Promise<T>;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function jitter(ms: number, pct = 0.2): number {
  return Math.round(ms * (1 - pct + Math.random() * pct * 2));
}

export function maskUrl(u: string): string {
  try {
    const x = new URL(u);
    return x.host;
  } catch {
    return "invalid";
  }
}

export function ipOf(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
