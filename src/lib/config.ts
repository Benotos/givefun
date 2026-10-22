export const SITE = {
  name: "Give.fun",
  tagline: "Launch a coin. Fees go to charity. Provable on chain.",
  domain: "give-fun.xyz",
};

// Canonical production URL. Use it for metadata and all share links so links do not point
// at the old give.fun placeholder domain.
export const SITE_URL = `https://${SITE.domain}`;

export const X_URL = "https://x.com/GiveDotFun_";
export const X_HANDLE = "@GiveDotFun_";
// Set NEXT_PUBLIC_GIVEFUN_CA in Vercel once the give.fun coin exists. Empty shows "Coming soon".
export const GIVEFUN_CA = (process.env.NEXT_PUBLIC_GIVEFUN_CA || "").trim();

export const MIN_CHARITY_BPS = 5000; // 50%
export const MAX_CHARITY_BPS = 10000; // 100%

export function platformBps(): number {
  const n = Number(process.env.PLATFORM_BPS ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function platformWallet(): string {
  return process.env.PLATFORM_WALLET ?? "";
}

export const SOLSCAN = "https://solscan.io";
export const solscanTx = (sig: string) => `${SOLSCAN}/tx/${sig}`;
export const solscanAddr = (a: string) => `${SOLSCAN}/account/${a}`;
export const solscanToken = (m: string) => `${SOLSCAN}/token/${m}`;

export const LAMPORTS_PER_SOL = 1_000_000_000;
export const fmtSol = (lamports: number | string | bigint) =>
  (Number(lamports) / LAMPORTS_PER_SOL).toLocaleString("en-US", {
    maximumFractionDigits: 4,
  });