import { Keypair } from "@solana/web3.js";
import { computeShares } from "../src/lib/shares";
import { signTicket, verifyTicket } from "../src/lib/token";

const k = () => Keypair.generate().publicKey.toBase58();
let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean) => {
  console.log(cond ? "PASS" : "FAIL", name);
  cond ? pass++ : fail++;
};
const throws = (name: string, fn: () => unknown) => {
  try {
    fn();
    ok(name, false);
  } catch {
    ok(name, true);
  }
};

const dev = k();
const ch = k();
const pl = k();

const a = computeShares({ devWallet: dev, charityWallet: ch, charityBps: 5000 });
ok("50% charity, dev 50%, sums 10000", a.length === 2 && a.reduce((s, x) => s + x.shareBps, 0) === 10000);

const b = computeShares({ devWallet: dev, charityWallet: ch, charityBps: 10000 });
ok("100% charity omits dev (no zero shares)", b.length === 1 && b[0].shareBps === 10000);

const c = computeShares({ devWallet: dev, charityWallet: ch, charityBps: 7000, platformWallet: pl, platformBps: 500 });
ok("70/5/25 split", c.map((x) => x.shareBps).join(",") === "7000,500,2500");

const d = computeShares({ devWallet: dev, charityWallet: ch, charityBps: 9500, platformWallet: pl, platformBps: 500 });
ok("95 + 5 platform leaves no dev share, sums 10000", d.length === 2 && d.reduce((s, x) => s + x.shareBps, 0) === 10000);

throws("below 50% rejected", () => computeShares({ devWallet: dev, charityWallet: ch, charityBps: 4999 }));
throws("above 100% rejected", () => computeShares({ devWallet: dev, charityWallet: ch, charityBps: 10001 }));
throws("charity + platform over 100% rejected", () =>
  computeShares({ devWallet: dev, charityWallet: ch, charityBps: 9600, platformWallet: pl, platformBps: 500 }));
throws("dev == charity rejected", () => computeShares({ devWallet: dev, charityWallet: dev, charityBps: 6000 }));
throws("platform bps without wallet rejected", () =>
  computeShares({ devWallet: dev, charityWallet: ch, charityBps: 6000, platformBps: 500 }));
throws("bad wallet rejected", () => computeShares({ devWallet: "nope", charityWallet: ch, charityBps: 6000 }));
throws("fractional bps rejected", () => computeShares({ devWallet: dev, charityWallet: ch, charityBps: 6000.5 }));

process.env.REGISTER_SECRET = "test-secret-test-secret-123";
const t = signTicket({ mint: "m", creator: "c", name: "n", symbol: "S", image: null, description: "", charitySlug: "x", charityBps: 7000 });
ok("ticket roundtrip", verifyTicket(t)?.mint === "m");
ok("tampered ticket rejected", verifyTicket(t.replace(/^./, "A") ) === null || verifyTicket(t.slice(0, -2) + "xx") === null);
ok("expired ticket rejected", verifyTicket(signTicket({ mint: "m", creator: "c", name: "n", symbol: "S", image: null, description: "", charitySlug: "x", charityBps: 7000 }, -10)) === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
