import { adminGuard } from "@/lib/admin/auth";
import { AdminError, saveCharity, setCharityActive, setCharityVerified } from "@/lib/admin/actions";
import type { CharityInput } from "@/lib/admin/actions";
import { loadCharitiesFresh } from "@/lib/charities";
import { noStore } from "@/lib/http";
import { guard } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = adminGuard(req);
  if (denied) return denied;
  return noStore({ charities: await loadCharitiesFresh() });
}

type Body =
  | ({ action: "save" } & CharityInput)
  | { action: "verify" | "unverify" | "activate" | "deactivate"; slug: string };

export async function POST(req: Request) {
  const denied = adminGuard(req);
  if (denied) return denied;
  const limited = await guard(req, "admin-write", 60, 60);
  if (limited) return limited;

  let b: Body;
  try {
    b = (await req.json()) as Body;
  } catch {
    return noStore({ error: "Bad JSON" }, 400);
  }

  try {
    switch (b.action) {
      case "save":
        return noStore({ charity: await saveCharity(b) });
      case "verify":
        await setCharityVerified(b.slug, true);
        return noStore({ ok: true });
      case "unverify":
        await setCharityVerified(b.slug, false);
        return noStore({ ok: true });
      case "activate":
        await setCharityActive(b.slug, true);
        return noStore({ ok: true });
      case "deactivate":
        await setCharityActive(b.slug, false);
        return noStore({ ok: true });
      default:
        return noStore({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    if (e instanceof AdminError) return noStore({ error: e.message }, e.status);
    console.error("admin charities", (e as Error).message);
    return noStore({ error: "Server error" }, 500);
  }
}
