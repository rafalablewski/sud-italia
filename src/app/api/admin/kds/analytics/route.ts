import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getKdsStationAnalytics } from "@/lib/store";

/**
 * Per-station KDS analytics (m2_9). Requires ?location=&from=&to= (ISO
 * timestamps). Returns mean / p50 / p95 bump time + throughput per
 * station, sorted by p95 desc so the slowest station is first.
 *
 * Reads kds_tickets via the (location_slug, status, fired_at) index from
 * m2_1 — bounded cost even over 30-day windows.
 */
export const GET = withAdmin(
  { roles: ["manager", "owner"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    if (!locationSlug) {
      return NextResponse.json({ error: "Missing location" }, { status: 400 });
    }
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    if (!from || !to) {
      return NextResponse.json({ error: "Missing from/to" }, { status: 400 });
    }
    const rows = await getKdsStationAnalytics(locationSlug, from, to);
    return NextResponse.json({ locationSlug, from, to, rows });
  },
);
