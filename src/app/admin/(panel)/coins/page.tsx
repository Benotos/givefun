import { store } from "@/lib/store";
import CoinManager from "@/components/admin/CoinManager";

export default async function Page() {
  const coins = await store().listCoins({ limit: 200, order: "new", statuses: ["pending", "verified", "failed", "revoked", "hidden"] });
  return <CoinManager initial={coins} />;
}
