import { NextRequest, NextResponse } from "next/server";
import { getLiveActivity } from "@/lib/store";

/**
 * Public live-activity aggregates for the storefront `<LiveActivityBar />` —
 * real, location-scoped social proof (orders in the last hour, currently
 * preparing, trending dish, avg prep). No auth: it only ever exposes
 * non-identifying counts, never order details. Short cache because the bar
 * polls every 30s. Replaces the deleted `simulateLiveActivity` fabrication.
 */
export async function GET(req: NextRequest) {
  const location = req.nextUrl.searchParams.get("location");
  if (!location) {
    return NextResponse.json({ error: "location is required" }, { status: 400 });
  }
  const activity = await getLiveActivity(location);
  return NextResponse.json(activity, {
    headers: { "Cache-Control": "public, max-age=20, stale-while-revalidate=30" },
  });
}
