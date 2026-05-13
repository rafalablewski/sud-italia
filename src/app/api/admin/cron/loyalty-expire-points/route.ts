import { NextRequest, NextResponse } from "next/server";
import { logCronRun, withCron } from "@/lib/cron";

/**
 * Monthly point-expiration cron (m1_12). Runs at 03:00 UTC on the 1st of
 * each month. Today this is a scaffold — actual expiration depends on
 * Phase 4's points_ledger table (m4_17 RFM scoring) where each earn
 * carries an earned_at timestamp; the current point_adjustments table
 * has no per-earn timestamp, so we can't selectively expire.
 *
 * Phase 4 will extend this with a real expiration policy + LoyaltySettings
 * field for the TTL months. Until then, this endpoint is a no-op with a
 * log line so the schedule is at least exercised in production from day 1.
 */
export async function POST(req: NextRequest) {
  const auth = await withCron(req);
  if (auth) return auth;

  logCronRun("loyalty-expire-points", {
    note: "scaffold — full expiration requires Phase 4 points_ledger",
  });

  return NextResponse.json({
    ok: true,
    expired: 0,
    note: "Phase 1 scaffold; real expiration ships with Phase 4 points_ledger",
  });
}
