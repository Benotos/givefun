import { getFlags } from "@/lib/data";
import { isDemo } from "@/lib/store";

// Shows a demo notice and any admin set announcement. Reads the 5s snapshot, never the database.
export default async function SiteBanner() {
  const flags = await getFlags();
  return (
    <>
      {isDemo() && (
        <div className="bg-amber/15 px-4 py-2 text-center text-xs font-medium text-amber">
          Demo data. Charities, coins and payouts shown here are fictional.
        </div>
      )}
      {flags.banner && (
        <div className="bg-ember/15 px-4 py-2 text-center text-sm font-medium text-ember">{flags.banner}</div>
      )}
    </>
  );
}
