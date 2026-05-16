import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { buildCohortReport } from "@/lib/cohort-analytics";
import { getOrders } from "@/lib/store";

/**
 * Audit §10 features #3: CLTV + CAC + cohort retention dashboard.
 * Returns the cohort matrix (new-vs-repeat by month) + per-cohort CLTV
 * at 30 / 60 / 90 / 180 / 365 day horizons.
 *
 * Manager+ only. Location filter is enforced when present, but the
 * default (cross-location) is the right view for an owner planning
 * acquisition spend.
 *
 * Heavy reads — keeps the response cacheable for 60 s so the dashboard
 * panel doesn't re-roll the full orders table on every tab switch.
 */
export const GET = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    const orders = await getOrders(locationSlug ?? undefined);
    const report = buildCohortReport(orders);
    return NextResponse.json(report, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  },
);
