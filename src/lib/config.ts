export const SITE = {
  name: "Give.fun",
  tagline: "Launch a coin. Fees go to charity. Provable on chain.",
  domain: "give.fun",
};

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
