import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { buildLtvCacReport } from "@/lib/ltv-cac";
import { getBusinessCosts, getOrders } from "@/lib/store";

/**
 * Audit §11.3 "what's the LTV/CAC? — not computed". This computes it.
 *
 * LTV comes from the cohort CLTV engine (paid orders), CAC from the REAL
 * marketing-category rows of the operating-costs ledger (/admin/business-costs)
 * — only `active` costs, since archived spend is no longer burning. Manager+,
 * location-scoped when a ?location= is supplied (chain-wide is the default
 * acquisition view). Cached 60 s like the cohort route — both roll the full
 * orders table.
 */
export const GET = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    const [orders, marketing] = await Promise.all([
      getOrders(locationSlug ?? undefined),
      getBusinessCosts({
        category: "marketing",
        status: "active",
        locationSlug: locationSlug ?? undefined,
      }),
    ]);
    const report = buildLtvCacReport(
      orders,
      marketing.map((c) => ({
        amountGrosze: c.amountGrosze,
        frequency: c.frequency,
        startDate: c.startDate,
        endDate: c.endDate,
      })),
    );
    return NextResponse.json(report, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  },
);
