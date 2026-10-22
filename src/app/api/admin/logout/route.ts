import { cookies } from "next/headers";
import { COOKIE } from "@/lib/admin/auth";
import { noStore } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST() {
  cookies().set(COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  return noStore({ ok: true });
}
