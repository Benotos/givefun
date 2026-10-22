import { createHmac, timingSafeEqual } from "crypto";

// Stateless signed ticket issued by /api/launch/prepare and required by /api/launch/register.
// Stops anyone registering a coin with a spoofed name, symbol, image or charity.

export type Ticket = {
  mint: string;
  creator: string;
  name: string;
  symbol: string;
  image: string | null;
  description: string;
  charitySlug: string;
  charityBps: number;
  exp: number;
};

function secret(): string {
  const s = process.env.REGISTER_SECRET;
  if (!s || s.length < 16) throw new Error("REGISTER_SECRET not set (min 16 chars)");
  return s;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function signTicket(t: Omit<Ticket, "exp">, ttlSeconds = 1800): string {
  const body = b64(JSON.stringify({ ...t, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyTicket(token: string): Ticket | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expect = createHmac("sha256", secret()).update(body).digest();
  let got: Buffer;
  try {
    got = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (got.length !== expect.length || !timingSafeEqual(got, expect)) return null;
  try {
    const t = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Ticket;
    if (typeof t.exp !== "number" || t.exp < Math.floor(Date.now() / 1000)) return null;
    return t;
  } catch {
    return null;
  }
}
