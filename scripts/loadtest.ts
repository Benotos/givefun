// Usage: BASE=https://your-site npm run loadtest   (default http://localhost:3000)
import autocannon from "autocannon";

const base = process.env.BASE || "http://localhost:3000";
const paths = ["/", "/api/coins", "/api/stats", "/api/activity", "/charities", "/api/health"];
const conns = Number(process.env.CONNECTIONS || 200);
const secs = Number(process.env.DURATION || 20);

async function run(path: string) {
  const r = await autocannon({ url: base + path, connections: conns, duration: secs });
  const bad = r["4xx"] + r["5xx"] + r.errors + r.timeouts;
  console.log(`${path.padEnd(16)} rps ${String(Math.round(r.requests.average)).padStart(6)}  p50 ${r.latency.p50}ms  p99 ${r.latency.p99}ms  non2xx ${r.non2xx}  errors ${r.errors}  timeouts ${r.timeouts}`);
  return bad;
}

(async () => {
  let bad = 0;
  for (const p of paths) bad += await run(p);
  console.log(bad ? "\nFAILED: errors under load" : "\nPASSED: no errors");
  process.exit(bad ? 1 : 0);
})();
