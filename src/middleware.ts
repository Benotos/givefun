import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Production is temporarily offline by default. Set MAINTENANCE=0 to restore it.
// Set MAINTENANCE=1 to enable maintenance mode on preview deployments too.
// /api/health always works so uptime checks keep running.
export function middleware(req: NextRequest) {
  const maintenance =
    process.env.MAINTENANCE === "1" ||
    (process.env.VERCEL_ENV === "production" && process.env.MAINTENANCE !== "0");
  if (!maintenance) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === "/api/health") return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: "maintenance" },
      { status: 503, headers: { "Retry-After": "300", "Cache-Control": "no-store" } },
    );
  }

  const url = req.nextUrl.clone();
  url.pathname = "/maintenance";
  return NextResponse.rewrite(url, { status: 503 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|css|js)$).*)"],
};
