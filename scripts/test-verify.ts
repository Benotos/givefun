// Tests verifyOnChain against a mocked RPC. Encodes real SharingConfig accounts with pump's own IDL coder,
// so decode and verification logic run for real. Chain calls are mocked, nothing hits the network.
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getPumpFeeProgram } from "@pump-fun/pump-sdk";
import BN from "bn.js";
import { verifyOnChain } from "../src/lib/pump";
import { feeSharingConfigPda } from "@pump-fun/pump-sdk";

const conn = new Connection("http://127.0.0.1:1");
const prog = getPumpFeeProgram(conn);
const k = () => Keypair.generate().publicKey;

async function encode(mint: PublicKey, admin: PublicKey, adminRevoked: boolean, sh: { address: PublicKey; shareBps: number }[]) {
  const idlAcc = (prog.idl.accounts ?? []).find((a) => a.name.toLowerCase() === "sharingconfig");
  if (!idlAcc) throw new Error("no sharingConfig account in IDL");
  const body = await (prog.coder.accounts as any).encode(idlAcc.name, {
    bump: 255,
    version: 2,
    status: { active: {} },
    mint,
    admin,
    adminRevoked,
    shareholders: sh,
  });
  return body as Buffer;
}

function mockConn(mint: PublicKey, data: Buffer | null) {
  const addr = feeSharingConfigPda(mint).toBase58();
  return {
    getAccountInfo: async (a: PublicKey) =>
      a.toBase58() === addr && data
        ? { data, executable: false, lamports: 1, owner: PublicKey.default }
        : null,
    // fetchBondingCurve path is wrapped in try/catch in verifyOnChain; make it throw (treated as unreadable)
    getMultipleAccountsInfo: async () => {
      throw new Error("mock");
    },
    getAccountInfoAndContext: async () => {
      throw new Error("mock");
    },
  } as unknown as Connection;
}

let pass = 0;
let fail = 0;
const ok = (n: string, c: boolean, extra?: unknown) => {
  console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(extra));
  c ? pass++ : fail++;
};

async function main() {
  const mint = k();
  const dev = k();
  const charity = k();
  const plat = k();

  // 1) good: locked, charity 70%
  let buf = await encode(mint, dev, true, [
    { address: charity, shareBps: 7000 },
    { address: plat, shareBps: 500 },
    { address: dev, shareBps: 2500 },
  ]);
  let r = await verifyOnChain(mockConn(mint, buf), mint, charity.toBase58());
  ok("locked + 70% charity verifies", r.ok && r.locked, r);

  // 2) not locked
  buf = await encode(mint, dev, false, [{ address: charity, shareBps: 7000 }, { address: dev, shareBps: 3000 }]);
  r = await verifyOnChain(mockConn(mint, buf), mint, charity.toBase58());
  ok("unlocked split fails", !r.ok && !r.locked, r);

  // 3) charity under 50%
  buf = await encode(mint, dev, true, [{ address: charity, shareBps: 4000 }, { address: dev, shareBps: 6000 }]);
  r = await verifyOnChain(mockConn(mint, buf), mint, charity.toBase58());
  ok("charity 40% fails", !r.ok, r);

  // 4) charity not a shareholder
  buf = await encode(mint, dev, true, [{ address: dev, shareBps: 10000 }]);
  r = await verifyOnChain(mockConn(mint, buf), mint, charity.toBase58());
  ok("charity absent fails", !r.ok, r);

  // 5) no config
  r = await verifyOnChain(mockConn(mint, null), mint, charity.toBase58());
  ok("missing config fails", !r.ok && r.shareholders.length === 0, r);

  // 6) exactly 50% passes, 100% passes
  buf = await encode(mint, dev, true, [{ address: charity, shareBps: 5000 }, { address: dev, shareBps: 5000 }]);
  r = await verifyOnChain(mockConn(mint, buf), mint, charity.toBase58());
  ok("exactly 50% verifies", r.ok, r);
  buf = await encode(mint, dev, true, [{ address: charity, shareBps: 10000 }]);
  r = await verifyOnChain(mockConn(mint, buf), mint, charity.toBase58());
  ok("100% verifies", r.ok, r);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
