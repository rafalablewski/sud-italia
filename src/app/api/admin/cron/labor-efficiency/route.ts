import { NextRequest, NextResponse } from "next/server";
import { logCronRun, withCron } from "@/lib/cron";
import { computeLaborEfficiencyDaily } from "@/lib/labor-efficiency";
import { setCacheJson } from "@/lib/store";

/**
 * Audit §10 "Top features elite competitors would have" + §14
 * McDonald's-ops critique. Writes the daily SPLH + schedule-vs-sales
 * snapshot for every active location so the dashboard tile reads it
 * instantly. Idempotent — overwrites the cache key on every run.
 */
export async function POST(req: NextRequest) {
  const auth = await withCron(req);
  if (auth) return auth;
  const snapshot = await computeLaborEfficiencyDaily();
  await setCacheJson("labor-efficiency-daily.json", snapshot);
  logCronRun("labor-efficiency", {
    locations: snapshot.perLocation.length,
    generatedAt: snapshot.generatedAt,
  });
  return NextResponse.json({ ok: true, ...snapshot });
}
