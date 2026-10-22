import { NextResponse } from "next/server";

// CDN cache for read APIs. Browsers hit the edge cache, not the origin and never the DB.
// stale-if-error keeps serving the last good copy for a day if the origin breaks.
export function cached(body: unknown, sMaxAge = 15, swr = 60) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}, stale-if-error=86400`,
    },
  });
}

export function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
