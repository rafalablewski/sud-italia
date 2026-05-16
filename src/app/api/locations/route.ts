import { NextResponse } from "next/server";
import { getActiveLocationsAsync } from "@/lib/locations-store";

/**
 * Public endpoint backing the landing page + admin location switcher.
 * Returns only active locations; the admin uses /api/admin/locations to
 * see the full list including drafts.
 *
 * Cached in-process via `locations-store`; the response is also marked
 * cacheable so the edge / CDN can dedupe between visitors.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const locations = await getActiveLocationsAsync();
  return NextResponse.json(
    { locations },
    {
      headers: {
        // 30s edge cache matches the in-process TTL — admin edits show up
        // within a minute even if the operator never reloads.
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
