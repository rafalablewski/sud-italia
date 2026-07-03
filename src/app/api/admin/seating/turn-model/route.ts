import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getTurnModelReport } from "@/lib/store";

/**
 * Learned turn-times for the Seating Intelligence Engine — derived live from the
 * location's completed reservations (each seatedAt → completedAt is one realised
 * dining duration). Empty until parties have actually closed, so the engine
 * falls back to its party-size defaults (Rule #1: real data only). Manager+.
 */
export const GET = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    if (!locationSlug) return NextResponse.json({ error: "location required" }, { status: 400 });
    return NextResponse.json(await getTurnModelReport(locationSlug));
  },
);
