import { requireAdmin } from "@/lib/admin/auth";
import AdminNav from "@/components/admin/Nav";

export const dynamic = "force-dynamic";

export default function Panel({ children }: { children: React.ReactNode }) {
  requireAdmin();
  return (
    <>
      <AdminNav />
      {children}
    </>
  );
}
