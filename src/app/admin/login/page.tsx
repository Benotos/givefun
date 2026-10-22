import { redirect } from "next/navigation";
import { adminConfigured, isAdmin } from "@/lib/admin/auth";
import LoginForm from "@/components/admin/LoginForm";

export default function Login() {
  if (isAdmin()) redirect("/admin");
  if (!adminConfigured())
    return (
      <div className="card mx-auto mt-24 max-w-md p-6 text-sm text-mute">
        Admin is not configured. Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET (32+ characters) in the environment.
      </div>
    );
  return <LoginForm />;
}
