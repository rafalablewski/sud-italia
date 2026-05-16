import { NextRequest, NextResponse } from "next/server";
import { logCronRun, withCron } from "@/lib/cron";
import { rebuildAllCustomerSegments } from "@/lib/customer-segments";

/**
 * Weekly rebuild of the customer_segments table. Drives personalized
 * upsell candidate selection and the segment-mix dashboard. Cheap
 * enough to run daily once the dispatcher has slack; weekly is the
 * conservative starting cadence.
 */
export async function POST(req: NextRequest) {
  const auth = await withCron(req);
  if (auth) return auth;
  const result = await rebuildAllCustomerSegments();
  logCronRun("customer-segments-rebuild", result);
  return NextResponse.json({ ok: true, ...result });
}
