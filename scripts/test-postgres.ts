// Runs every Store method against a real Postgres. Usage: DATABASE_URL=postgres://... npm run test:postgres
// Skips (exit 0) when DATABASE_URL is not set. Uses unique ids and cleans up after itself.
import { createPostgresStore } from "../src/lib/store/postgres";

if (!process.env.DATABASE_URL) {
  console.log("SKIP: DATABASE_URL not set");
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (n: string, c: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${n}`); };

(async () => {
  const s = createPostgresStore();
  const id = Date.now().toString(36);
  const slug = `t-${id}`;
  const mint = `M${id}AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
  const sig = `S${id}`;

  ok("ping", await s.ping());
  await s.upsertCharity({ slug, name: "Test Charity", cause: "Test", blurb: "b", site_url: "https://x.org", wallet: "W".repeat(44), wallet_source_url: "https://x.org/c", verified: true, active: true });
  let ch = (await s.listCharities()).find((c) => c.slug === slug);
  ok("charity upsert and list", ch?.name === "Test Charity" && ch.verified === true && typeof ch.created_at === "string");
  await s.upsertCharity({ slug, verified: false });
  ch = (await s.listCharities()).find((c) => c.slug === slug);
  ok("charity patch without name (verify toggle)", ch?.verified === false && ch.name === "Test Charity");
  await s.upsertCharity({ slug, name: "Renamed" });
  ch = (await s.listCharities()).find((c) => c.slug === slug);
  ok("charity partial upsert keeps other fields", ch?.name === "Renamed" && ch.wallet.length === 44);

  await s.upsertCoin({ mint, name: "Coin", symbol: "CN", creator_wallet: "C".repeat(44), charity_slug: slug, charity_wallet: "W".repeat(44), charity_bps: 7000, platform_bps: 0, status: "pending" });
  let c = await s.getCoin(mint);
  ok("coin insert and get", c?.status === "pending" && c.charity_bps === 7000 && c.total_donated_lamports === 0);
  await s.patchCoin(mint, { status: "verified", verified_at: new Date().toISOString(), fail_reason: null });
  c = await s.getCoin(mint);
  ok("coin patch", c?.status === "verified" && typeof c.verified_at === "string");
  ok("getCoin missing is null", (await s.getCoin("nope-" + id)) === null);

  ok("listCoins by status and charity", (await s.listCoins({ limit: 10, charitySlug: slug, statuses: ["verified"] })).some((x) => x.mint === mint));
  ok("listCoins hides other status", !(await s.listCoins({ limit: 10, charitySlug: slug, statuses: ["hidden"] })).some((x) => x.mint === mint));
  ok("coinsForWorker", (await s.coinsForWorker()).some((x) => x.mint === mint));

  await s.addDonation(mint, 1_500_000_000);
  await s.addDonation(mint, 500_000_000);
  c = await s.getCoin(mint);
  ok("addDonation is atomic add (bigint to number)", c?.total_donated_lamports === 2_000_000_000);
  ok("order by donated", (await s.listCoins({ limit: 500, statuses: ["verified"], order: "donated" })).some((x) => x.mint === mint));

  ok("insertPayout inserted", (await s.insertPayout({ signature: sig, mint, charity_wallet: "W".repeat(44), lamports: 2_000_000_000, created_at: new Date().toISOString() })) === "inserted");
  ok("insertPayout duplicate", (await s.insertPayout({ signature: sig, mint, charity_wallet: "W".repeat(44), lamports: 2_000_000_000, created_at: new Date().toISOString() })) === "duplicate");
  ok("listPayouts", (await s.listPayouts(mint, 5)).length === 1);
  const rp = (await s.recentPayouts(20)).find((p) => p.signature === sig);
  ok("recentPayouts joins coin", rp?.coin_symbol === "CN" && rp.charity_slug === slug && rp.lamports === 2_000_000_000);

  const t = (await s.charityTotals()).find((x) => x.charity_slug === slug);
  ok("charityTotals", t?.coins === 1 && t.lamports === 2_000_000_000);
  const counts = await s.coinCounts();
  ok("coinCounts", counts.verified >= 1 && "hidden" in counts);

  const f0 = await s.getFlags();
  const f1 = await s.setFlags({ launchPaused: true, banner: "hi" });
  ok("flags set", f1.launchPaused === true && f1.banner === "hi");
  ok("flags get", (await s.getFlags()).banner === "hi");
  await s.setFlags({ launchPaused: f0.launchPaused, banner: f0.banner });

  await s.audit({ actor: "test", action: "test.run", target: id, detail: { a: 1 } });
  const a = (await s.listAudit(5)).find((x) => x.target === id);
  ok("audit write and read", a?.action === "test.run" && (a.detail as { a?: number }).a === 1 && typeof a.id === "number");

  let threw = false;
  try { await s.patchCoin(mint, { ["x; drop table coins;--" as "name"]: "x" }); } catch { threw = true; }
  ok("bad column name rejected", threw);

  // cleanup
  const { Pool } = await import("pg");
  const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "") ? undefined : { rejectUnauthorized: false } });
  await p.query("delete from payouts where mint=$1", [mint]);
  await p.query("delete from coins where mint=$1", [mint]);
  await p.query("delete from charities where slug=$1", [slug]);
  await p.query("delete from audit_log where target=$1", [id]);
  await p.end();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });