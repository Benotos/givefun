import { getSystemStatus } from "@/lib/admin/system";
import SystemPanel from "@/components/admin/SystemPanel";

export default async function Page() {
  const sys = await getSystemStatus();
  return <SystemPanel initial={JSON.parse(JSON.stringify(sys))} />;
}
