import { loadCharitiesFresh } from "@/lib/charities";
import CharityManager from "@/components/admin/CharityManager";

export default async function Page() {
  const charities = await loadCharitiesFresh();
  return <CharityManager initial={charities} />;
}
