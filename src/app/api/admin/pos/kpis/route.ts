import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getPosKpis } from "@/lib/store";

/**
 * Live till KPIs for the POS stat strip — today's avg check, sales/hour and
 * table turns, each with an honest trailing-7-day (same-time-of-day) delta.
 * Every figure is derived from REAL orders (Rule #1, no mock); the live counts
 * (open checks · covers · prep queue) stay client-side from the till's own state.
 *
 * GET ?location= → PosKpis
 */
export const GET = withAdmin({ locationParam: "location" }, async (_req, _ctx, { locationSlug }) => {
  if (!locationSlug) return NextResponse.json({ error: "location required" }, { status: 400 });
  const kpis = await getPosKpis(locationSlug);
  return NextResponse.json(kpis);
});
