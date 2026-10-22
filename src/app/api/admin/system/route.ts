import { adminGuard } from "@/lib/admin/auth";
import { getSystemStatus } from "@/lib/admin/system";
import { noStore } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = adminGuard(req);
  if (denied) return denied;
  return noStore(await getSystemStatus());
}
