import { NextRequest, NextResponse } from "next/server";
import { logCronRun, withCron } from "@/lib/cron";
import { getActiveLocations } from "@/data/locations";
import { computeVariance } from "@/lib/variance";

/**
 * Weekly variance compute (m1_12). Runs Sundays 03:00 UTC. Walks every
 * active location and recomputes the trailing 7-day theoretical-vs-actual
 * ingredient variance — the same computation /admin/inventory/variance
 * runs ad-hoc, but pre-warmed so the dashboard tile loads instantly Monday
 * morning.
 *
 * Phase 4 m4_18 will extend this: when any line's variance exceeds 5 %,
 * the AI agent kicks in to draft a root-cause analysis.
 */
export async function POST(req: NextRequest) {
  const auth = await withCron(req);
  if (auth) return auth;

  const locations = getActiveLocations();
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  const out: Record<
    string,
    { lines: number; flaggedHighVariance: number; error?: string }
  > = {};
  for (const loc of locations) {
    try {
      const rows = await computeVariance(loc.slug, from.toISOString(), to.toISOString());
      const flagged = rows.filter((r) => Math.abs(r.variancePercent) > 5).length;
      out[loc.slug] = { lines: rows.length, flaggedHighVariance: flagged };
    } catch (err) {
      out[loc.slug] = {
        lines: 0,
        flaggedHighVariance: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  logCronRun("inventory-variance", { from: from.toISOString(), to: to.toISOString(), perLocation: out });
  return NextResponse.json({ ok: true, from: from.toISOString(), to: to.toISOString(), perLocation: out });
}
