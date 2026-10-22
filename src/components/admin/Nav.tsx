"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminPost } from "./api";

const LINKS = [
  ["/admin", "Overview"],
  ["/admin/charities", "Charities"],
  ["/admin/coins", "Coins"],
  ["/admin/system", "System"],
];

export default function AdminNav() {
  const path = usePathname();
  return (
    <nav className="mb-8 flex flex-wrap items-center gap-2 border-b border-line pb-4">
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} className={`chip ${path === href ? "!border-ember !text-ember" : ""}`}>{label}</Link>
      ))}
      <button
        className="btn-ghost btn-sm ml-auto"
        onClick={async () => {
          await adminPost("/api/admin/logout", {}).catch(() => {});
          window.location.href = "/admin/login";
        }}
      >
        Sign out
      </button>
    </nav>
  );
}
