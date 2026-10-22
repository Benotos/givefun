import { adminGuard } from "@/lib/admin/auth";
import { refreshPublicSnapshots } from "@/lib/data";
import { noStore } from "@/lib/http";
import { guard } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = adminGuard(req);
  if (denied) return denied;
  const limited = await guard(req, "admin-write", 60, 60);
  if (limited) return limited;
  try {
    await refreshPublicSnapshots();
    return noStore({ ok: true });
  } catch (e) {
    return noStore({ error: (e as Error).message }, 500);
  }
}
