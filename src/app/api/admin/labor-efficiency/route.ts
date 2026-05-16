import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getCacheJson } from "@/lib/store";
import {
  computeLaborEfficiencyDaily,
  type LaborEfficiencyDaily,
} from "@/lib/labor-efficiency";

/**
 * Read-only API behind the dashboard's "Sales per labor hour" tile and
 * the "Schedule vs forecast" callout. Returns the daily cron snapshot
 * if it exists, otherwise computes on-the-fly so a fresh deploy with
 * no cron run yet still serves data.
 *
 * Manager+ — labour cost is sensitive.
 */
export const GET = withAdmin(
  { roles: ["manager"] },
  async () => {
    const cached = await getCacheJson<LaborEfficiencyDaily | null>(
      "labor-efficiency-daily.json",
      null,
    );
    if (cached && cached.perLocation && cached.perLocation.length > 0) {
      return NextResponse.json({ ...cached, cached: true });
    }
    const fresh = await computeLaborEfficiencyDaily();
    return NextResponse.json({ ...fresh, cached: false });
  },
);
