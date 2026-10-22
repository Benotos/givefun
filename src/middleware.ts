import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Kill switch. Set MAINTENANCE=1 in env and redeploy (or flip in Vercel and redeploy).
// /api/health always works so uptime checks keep running.
export function middleware(req: NextRequest) {
  if (process.env.MAINTENANCE !== "1") return NextResponse.next();

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
