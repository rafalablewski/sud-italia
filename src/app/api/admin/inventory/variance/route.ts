import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/admin-auth";
import { computeVariance } from "@/lib/variance";

/**
 * Theoretical-vs-actual ingredient variance for a location over a date
 * range. Drives the inventory page's theft / portioning alert card.
 *
 * Defaults: location is required (variance is per-truck); window is the
 * trailing 7 days because daily windows are noisy below ~10 orders/day.
 */
export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const locationSlug = req.nextUrl.searchParams.get("location");
  if (!locationSlug) {
    return NextResponse.json({ error: "Missing location" }, { status: 400 });
  }

  const toParam = req.nextUrl.searchParams.get("to");
  const fromParam = req.nextUrl.searchParams.get("from");
  const to = toParam ? new Date(toParam) : new Date();
  const from = fromParam ? new Date(fromParam) : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const rows = await computeVariance(
    locationSlug,
    from.toISOString(),
    to.toISOString(),
  );

  return NextResponse.json({
    locationSlug,
    from: from.toISOString(),
    to: to.toISOString(),
    rows,
  });
}
