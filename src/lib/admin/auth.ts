import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Single admin login. Password and session secret come from env vars, never from code or chat.
//   ADMIN_PASSWORD         the login password (use 20+ random characters)
//   ADMIN_SESSION_SECRET   signs the session cookie (32+ random characters). Rotating it logs everyone out.
// Cookie is httpOnly, SameSite=Strict, Secure in production, 12 hours.

export const COOKIE = "gf_admin";
const TTL_SEC = 12 * 3600;

export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD && (process.env.ADMIN_SESSION_SECRET ?? "").length >= 32);
}

const sha = (s: string) => createHash("sha256").update(s).digest();

export function checkPassword(input: string): boolean {
  const pw = process.env.ADMIN_PASSWORD ?? "";
  if (!pw) return false;
  // Hash both sides so length differences do not leak and compare in constant time.
  return timingSafeEqual(sha(input), sha(pw));
}

function sign(body: string): string {
  return createHmac("sha256", process.env.ADMIN_SESSION_SECRET!).update(body).digest("base64url");
}

export function makeSession(): { value: string; maxAge: number } {
  const body = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + TTL_SEC, sid: randomBytes(8).toString("hex") })).toString("base64url");
  return { value: `${body}.${sign(body)}`, maxAge: TTL_SEC };
}

export function validSession(token: string | undefined): boolean {
  if (!token || !adminConfigured()) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const expect = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (expect.length !== got.length || !timingSafeEqual(expect, got)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { exp: number };
    return typeof exp === "number" && exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function isAdmin(): boolean {
  return validSession(cookies().get(COOKIE)?.value);
}

/** For server components inside the admin panel. */
export function requireAdmin(): void {
  if (!isAdmin()) redirect("/admin/login");
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** For admin API routes. Returns a Response to send when access is denied, otherwise null. */
export function adminGuard(req: Request): Response | null {
  const deny = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), {
      status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  if (!adminConfigured()) return deny(503, "Admin not configured");
  if (!isAdmin()) return deny(401, "Not signed in");
  if (req.method !== "GET" && !sameOrigin(req)) return deny(403, "Bad origin");
  return null;
}
