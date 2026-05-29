import { NextRequest, NextResponse } from "next/server";
import { getUpsellSettings } from "@/lib/store";
import { getActiveLocationsAsync } from "@/lib/locations-store";

// The cart drawer re-fetches this on every open so admin edits surface
// without a hard refresh. Pin the route to dynamic + no-store so a CDN
// or browser cache can't undo that by serving a stale payload between
// opens.
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
} as const;

export async function GET(req: NextRequest) {
  const location = req.nextUrl.searchParams.get("location");

  if (!location) {
    return NextResponse.json(null, { headers: NO_STORE_HEADERS });
  }
  // Slug validation reads the live locations store on every call so a
  // newly added truck is accepted immediately. The store caches
  // in-process, so the extra round trip is cheap.
  const known = await getActiveLocationsAsync();
  if (!known.some((l) => l.slug === location)) {
    return NextResponse.json(null, { headers: NO_STORE_HEADERS });
  }

  const settings = await getUpsellSettings();
  return NextResponse.json(settings[location] || null, { headers: NO_STORE_HEADERS });
}
