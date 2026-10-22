import { cookies } from "next/headers";
import { COOKIE, adminConfigured, checkPassword, makeSession } from "@/lib/admin/auth";
import { guard } from "@/lib/ratelimit";
import { noStore } from "@/lib/http";
import { sleep } from "@/lib/util";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // 6 tries per 5 minutes per IP. Slows guessing to a crawl.
  const limited = await guard(req, "adminlogin", 6, 300);
  if (limited) return limited;
  if (!adminConfigured()) return noStore({ error: "Admin is not configured" }, 503);

  let password = "";
  try {
    password = String(((await req.json()) as { password?: string }).password ?? "");
  } catch {
    return noStore({ error: "Bad request" }, 400);
  }

  if (!checkPassword(password)) {
    await sleep(400);
    return noStore({ error: "Wrong password" }, 401);
  }

  const s = makeSession();
  cookies().set(COOKIE, s.value, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: s.maxAge,
  });
  return noStore({ ok: true });
}
