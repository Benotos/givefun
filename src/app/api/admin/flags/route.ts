import { adminGuard } from "@/lib/admin/auth";
import { setFlags } from "@/lib/admin/actions";
import { noStore } from "@/lib/http";
import { guard } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = adminGuard(req);
  if (denied) return denied;
  const limited = await guard(req, "admin-write", 60, 60);
  if (limited) return limited;

  let b: { launchPaused?: boolean; banner?: string };
  try {
    b = await req.json();
  } catch {
    return noStore({ error: "Bad JSON" }, 400);
  }
  try {
    return noStore({ flags: await setFlags(b) });
  } catch (e) {
    console.error("admin flags", (e as Error).message);
    return noStore({ error: "Server error" }, 500);
  }
}
