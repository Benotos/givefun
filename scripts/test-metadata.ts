import http from "node:http";
import { uploadMetadata, MetaError } from "../src/lib/metadata";

let pass = 0, fail = 0;
const ok = (n: string, c: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${n}`); };

type Log = { pinataFile: number; pinataJson: number; pump: number; auth: string; json: Record<string, unknown> | null };
const log: Log = { pinataFile: 0, pinataJson: 0, pump: 0, auth: "", json: null };
let pinataMode: "ok" | "fail" = "ok";
let pumpMode: "ok" | "403" = "ok";

const server = http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = Buffer.concat(chunks);
  const send = (code: number, obj: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (req.url === "/pinning/pinFileToIPFS") {
    log.pinataFile++; log.auth = String(req.headers.authorization);
    if (pinataMode === "fail") return send(500, {});
    return send(200, { IpfsHash: "QmImageHash" });
  }
  if (req.url === "/pinning/pinJSONToIPFS") {
    log.pinataJson++;
    if (pinataMode === "fail") return send(500, {});
    log.json = JSON.parse(body.toString()).pinataContent;
    return send(200, { IpfsHash: "QmMetaHash" });
  }
  if (req.url === "/api/ipfs") {
    log.pump++;
    if (pumpMode === "403") return send(403, {});
    return send(200, { metadataUri: "https://ipfs.io/ipfs/QmPump", metadata: { image: "https://ipfs.io/ipfs/QmPumpImg" } });
  }
  send(404, {});
});

(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  process.env.PINATA_API_URL = base;
  process.env.METADATA_UPLOAD_URL = `${base}/api/ipfs`;
  process.env.IPFS_GATEWAY = "https://gw.test/ipfs";
  const input = { file: new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }), name: "Frug", symbol: "FRUG", description: "Coin of the frogs" };
  const reset = () => { log.pinataFile = log.pinataJson = log.pump = 0; log.json = null; log.auth = ""; };

  // 1. Pinata ok, pump untouched
  process.env.PINATA_JWT = "jwt-123"; pinataMode = "ok"; pumpMode = "ok"; reset();
  let r = await uploadMetadata(input);
  ok("pinata route used", r.via === "pinata");
  ok("uri is gateway + metadata cid", r.uri === "https://gw.test/ipfs/QmMetaHash");
  ok("image url is gateway + image cid", r.imageUrl === "https://gw.test/ipfs/QmImageHash");
  ok("sends bearer token", log.auth === "Bearer jwt-123");
  ok("metadata json has name, symbol, image", log.json?.name === "Frug" && log.json?.symbol === "FRUG" && log.json?.image === "https://gw.test/ipfs/QmImageHash");
  ok("pump not called when pinata works", log.pump === 0);

  // 2. Pinata fails, falls back to pump
  pinataMode = "fail"; reset();
  r = await uploadMetadata(input);
  ok("falls back to pump when pinata fails", r.via === "pump" && r.uri === "https://ipfs.io/ipfs/QmPump");

  // 3. Both fail, error names both statuses
  pumpMode = "403"; reset();
  let err: unknown = null;
  try { await uploadMetadata(input); } catch (e) { err = e; }
  ok("both fail throws MetaError", err instanceof MetaError);
  ok("detail names both routes", err instanceof MetaError && /pinata image 500/.test(err.detail) && /pump 403/.test(err.detail));
  ok("detail never contains the jwt", !(err instanceof MetaError) || !err.detail.includes("jwt-123"));

  // 4. No pinata configured, pump only
  delete process.env.PINATA_JWT; pumpMode = "ok"; reset();
  r = await uploadMetadata(input);
  ok("pump only when no PINATA_JWT", r.via === "pump" && log.pinataFile === 0);
  pumpMode = "403"; err = null;
  try { await uploadMetadata(input); } catch (e) { err = e; }
  ok("pump 403 surfaces status", err instanceof MetaError && err.detail === "pump 403");

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();