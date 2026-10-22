// Token metadata upload. Two routes, tried in order:
//   1. Pinata (set PINATA_JWT). Reliable from servers. Free plan is enough.
//   2. pump.fun's IPFS endpoint (METADATA_UPLOAD_URL, default https://pump.fun/api/ipfs). Undocumented and
//      sometimes blocks server traffic, so it is the fallback.
// Returns the metadata URI that goes on chain and the image URL we store.

export type MetaInput = { file: File; name: string; symbol: string; description: string };
export type MetaResult = { uri: string; imageUrl: string | null; via: "pinata" | "pump" };

const TIMEOUT_MS = 15_000;
const gateway = () => (process.env.IPFS_GATEWAY || "https://ipfs.io/ipfs").replace(/\/+$/, "");
const pinataBase = () => (process.env.PINATA_API_URL || "https://api.pinata.cloud").replace(/\/+$/, "");

export class MetaError extends Error {
  constructor(message: string, public detail: string) {
    super(message);
  }
}

async function viaPinata(i: MetaInput): Promise<MetaResult> {
  const jwt = process.env.PINATA_JWT!;
  const auth = { Authorization: `Bearer ${jwt}` };

  const fd = new FormData();
  fd.append("file", i.file, i.file.name || "image");
  fd.append("pinataMetadata", JSON.stringify({ name: `${i.symbol}-image` }));
  const r1 = await fetch(`${pinataBase()}/pinning/pinFileToIPFS`, { method: "POST", headers: auth, body: fd, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r1.ok) throw new Error(`pinata image ${r1.status}`);
  const imgCid = ((await r1.json()) as { IpfsHash?: string }).IpfsHash;
  if (!imgCid) throw new Error("pinata image: no hash");
  const imageUrl = `${gateway()}/${imgCid}`;

  const json = { name: i.name, symbol: i.symbol, description: i.description, image: imageUrl, showName: true, createdOn: "https://pump.fun" };
  const r2 = await fetch(`${pinataBase()}/pinning/pinJSONToIPFS`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ pinataContent: json, pinataMetadata: { name: `${i.symbol}-metadata` } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r2.ok) throw new Error(`pinata json ${r2.status}`);
  const cid = ((await r2.json()) as { IpfsHash?: string }).IpfsHash;
  if (!cid) throw new Error("pinata json: no hash");
  return { uri: `${gateway()}/${cid}`, imageUrl, via: "pinata" };
}

async function viaPump(i: MetaInput): Promise<MetaResult> {
  const fd = new FormData();
  fd.append("file", i.file, i.file.name || "image");
  fd.append("name", i.name);
  fd.append("symbol", i.symbol);
  fd.append("description", i.description);
  fd.append("showName", "true");
  const res = await fetch(process.env.METADATA_UPLOAD_URL || "https://pump.fun/api/ipfs", {
    method: "POST",
    body: fd,
    headers: { Origin: "https://pump.fun", Referer: "https://pump.fun/create", "User-Agent": "Mozilla/5.0 (compatible; GiveFun/1.0)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`pump ${res.status}`);
  const j = (await res.json()) as { metadataUri?: string; metadata?: { image?: string } };
  if (!j.metadataUri) throw new Error("pump: no metadataUri");
  return { uri: j.metadataUri, imageUrl: j.metadata?.image ?? null, via: "pump" };
}

export async function uploadMetadata(i: MetaInput): Promise<MetaResult> {
  const routes: (() => Promise<MetaResult>)[] = [];
  if (process.env.PINATA_JWT) routes.push(() => viaPinata(i));
  routes.push(() => viaPump(i));

  const errors: string[] = [];
  for (const run of routes) {
    try {
      return await run();
    } catch (e) {
      errors.push((e as Error).message.slice(0, 80));
    }
  }
  console.error("metadata upload failed:", errors.join(" | "));
  throw new MetaError("Could not upload metadata. Try again.", errors.join(" | "));
}