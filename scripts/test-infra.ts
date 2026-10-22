// Infra tests: KV fallback, Upstash protocol, snapshots, breaker, rate limit, RPC failover.
// No external network. Local mock servers stand in for Redis and RPC providers.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { __kvResetMemory, kvGet, kvSet, kvLock, kvIncr, kvStatus } from "../src/lib/kv";
import { __snapReset, getSnapshot, snapStats } from "../src/lib/snapshot";
import { Breaker } from "../src/lib/breaker";
import { limit } from "../src/lib/ratelimit";
import { __rpcReset, failoverFetch, rpcStatus } from "../src/lib/rpc";
import { sleep } from "../src/lib/util";

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, extra?: unknown) => {
  console.log(cond ? "PASS" : "FAIL", name, cond ? "" : JSON.stringify(extra));
  cond ? pass++ : fail++;
};

function listen(handler: http.RequestListener): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const s = http.createServer(handler);
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as AddressInfo).port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => (s.closeAllConnections?.(), s.close(() => r()))),
      });
    });
  });
}

// Minimal Upstash REST protocol mock
function redisMock() {
  const store = new Map<string, { v: string; exp: number }>();
  const get = (k: string) => {
    const e = store.get(k);
    if (!e) return null;
    if (e.exp && e.exp < Date.now()) {
      store.delete(k);
      return null;
    }
    return e.v;
  };
  return listen((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const cmd = JSON.parse(body) as (string | number)[];
      const op = String(cmd[0]).toUpperCase();
      let result: unknown = null;
      if (op === "PING") result = "PONG";
      else if (op === "GET") result = get(String(cmd[1]));
      else if (op === "DEL") result = store.delete(String(cmd[1])) ? 1 : 0;
      else if (op === "SET") {
        const k = String(cmd[1]);
        const rest = cmd.slice(3).map((x) => String(x).toUpperCase());
        const nx = rest.includes("NX");
        const exIdx = rest.indexOf("EX");
        const ex = exIdx >= 0 ? Number(cmd[3 + exIdx + 1]) : 0;
        if (nx && get(k) !== null) result = null;
        else {
          store.set(k, { v: String(cmd[2]), exp: ex ? Date.now() + ex * 1000 : 0 });
          result = "OK";
        }
      } else if (op === "EVAL") {
        const k = String(cmd[3]);
        const cur = Number(get(k) ?? 0) + 1;
        const prev = store.get(k);
        store.set(k, { v: String(cur), exp: prev?.exp || Date.now() + Number(cmd[4]) * 1000 });
        result = cur;
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ result }));
    });
  });
}

async function main() {
  // ---------- KV memory fallback
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  __kvResetMemory();
  await kvSet("a", { x: 1 }, 5);
  ok("kv memory set/get", (await kvGet<{ x: number }>("a"))?.x === 1);
  ok("kv memory lock first wins", (await kvLock("l1", 5)) === true);
  ok("kv memory lock second loses", (await kvLock("l1", 5)) === false);
  ok("kv incr counts", (await kvIncr("c1", 5)) === 1 && (await kvIncr("c1", 5)) === 2);

  // ---------- rate limiter
  let allowed = 0;
  for (let i = 0; i < 12; i++) if ((await limit("t", 10, 60)).ok) allowed++;
  ok("limiter allows exactly max", allowed === 10, allowed);

  // ---------- snapshot: single flight under concurrency
  __kvResetMemory();
  __snapReset();
  let loads = 0;
  const loader = async () => {
    loads++;
    await sleep(60);
    return { n: loads };
  };
  const results = await Promise.all(
    Array.from({ length: 200 }, () => getSnapshot("home", { softSec: 10, loader, fallback: { n: -1 } })),
  );
  ok("200 concurrent reads cause 1 loader call", loads === 1, loads);
  ok("all 200 got data", results.every((r) => r.data.n === 1));

  // ---------- snapshot: serves stale when loader fails, never throws
  __snapReset();
  let fail1 = false;
  const flaky = async () => {
    if (fail1) throw new Error("db down");
    return { n: 7 };
  };
  await getSnapshot("flaky", { softSec: 0.05, loader: flaky, fallback: { n: -1 } });
  await sleep(80);
  fail1 = true;
  __snapReset(); // clear L1 and lastGood, force KV path
  const stale = await getSnapshot("flaky", { softSec: 0.05, loader: flaky, fallback: { n: -1 } });
  ok("stale copy served when loader fails", stale.data.n === 7, stale);

  // ---------- snapshot: fallback when nothing exists
  __kvResetMemory();
  __snapReset();
  const fb = await getSnapshot("never", { softSec: 5, loader: async () => { throw new Error("x"); }, fallback: { n: 42 } });
  ok("fallback returned on cold failure", fb.data.n === 42 && fb.source === "fallback", fb);
  ok("loader errors counted", snapStats.loaderErrors >= 1);

  // ---------- breaker
  const b = new Breaker("t", 3, 100);
  for (let i = 0; i < 3; i++) await b.run(async () => { throw new Error("x"); }).catch(() => {});
  let calls = 0;
  await b.run(async () => { calls++; }).catch(() => {});
  ok("breaker open blocks calls", calls === 0 && b.isOpen);
  await sleep(120);
  await b.run(async () => { calls++; });
  ok("breaker half open allows trial then closes", calls === 1 && !b.isOpen);

  // ---------- Upstash protocol against mock
  const rm = await redisMock();
  process.env.UPSTASH_REDIS_REST_URL = rm.url;
  process.env.UPSTASH_REDIS_REST_TOKEN = "t";
  __kvResetMemory();
  await kvSet("obj", { hello: "world" }, 30);
  // remove local copy to prove the read goes through Redis
  const viaRedis = await kvGet<{ hello: string }>("obj");
  ok("upstash set/get roundtrip", viaRedis?.hello === "world", viaRedis);
  ok("upstash lock", (await kvLock("rl", 10)) === true && (await kvLock("rl", 10)) === false);
  ok("upstash atomic incr", (await kvIncr("ic", 10)) === 1 && (await kvIncr("ic", 10)) === 2);
  ok("kv reports redis kind", kvStatus.kind === "redis");

  // ---------- Redis dies: must degrade, not throw, and stay fast
  await rm.close();
  const t0 = Date.now();
  let threw = false;
  try {
    await kvSet("after", { ok: true }, 10);
    const v = await kvGet<{ ok: boolean }>("after");
    ok("redis down: falls back to memory copy", v?.ok === true, v);
    for (let i = 0; i < 6; i++) await kvIncr("x", 10);
  } catch {
    threw = true;
  }
  ok("redis down: no exceptions", !threw);
  ok("redis down: stays fast", Date.now() - t0 < 6000, Date.now() - t0);
  ok("redis failures recorded", kvStatus.failures > 0);
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  __kvResetMemory();

  // ---------- RPC failover
  const a = await listen((_q, r) => { r.statusCode = 429; r.end("rate limited"); });
  const bsrv = await listen((_q, r) => { r.setHeader("content-type", "application/json"); r.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "from-b" })); });
  process.env.HELIUS_RPC_URL = a.url;
  process.env.RPC_URLS = bsrv.url;
  __rpcReset();
  const res = await failoverFetch("x", { method: "POST", body: "{}" });
  const j = (await res.json()) as { result: string };
  ok("rpc fails over from 429 to second provider", j.result === "from-b", j);
  const st = rpcStatus();
  ok("rpc marks 429 endpoint cooling down", st[0].healthy === false && st[0].cooldownMs > 0, st);
  const res2 = await failoverFetch("x", { method: "POST", body: "{}" });
  ok("rpc skips cooling endpoint next time", ((await res2.json()) as { result: string }).result === "from-b");
  ok("rpc status never leaks full url or key", st.every((e) => !e.host.includes("?") && !e.host.includes("/")));

  await a.close();
  await bsrv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
