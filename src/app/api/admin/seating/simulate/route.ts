import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getTables, getReservations } from "@/lib/store";
import { simulateService } from "@/lib/seating";

/**
 * Pre-service simulation — run the reservation book against the floor before
 * service to forecast table pressure (per-30-min occupancy + peak) and flag
 * un-seatable bookings (no table, too small, double-booked). Pure compute over
 * real tables + reservations (Rule #1). Manager+, location + date scoped.
 *
 * GET /api/admin/seating/simulate?location=&date=YYYY-MM-DD
 */
export const GET = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) return NextResponse.json({ error: "location required" }, { status: 400 });
    const date = req.nextUrl.searchParams.get("date") || undefined;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "date (YYYY-MM-DD) required" }, { status: 400 });
    }
    const [tables, reservations] = await Promise.all([
      getTables(locationSlug),
      getReservations(locationSlug, date),
    ]);
    return NextResponse.json(simulateService({ tables, reservations, date, locationSlug }));
  },
);
