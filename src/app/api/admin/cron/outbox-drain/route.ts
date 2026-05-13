import { NextRequest, NextResponse } from "next/server";
import { logCronRun, withCron } from "@/lib/cron";
import { drainOutbox } from "@/lib/outbox";
import { commsDispatcher } from "@/lib/comms/dispatcher";

/**
 * Drains the outbox events queue (m1_13) through the comms dispatcher
 * (m2_17). Runs every minute. The dispatcher routes by event_type to
 * the SMS or email template + the active provider. Honors per-customer
 * opt-out flags. Aggregator + KDS-notify dispatches will plug into the
 * same switch in m2_22 and m2_2 respectively.
 */
export async function POST(req: NextRequest) {
  const auth = await withCron(req);
  if (auth) return auth;

  const result = await drainOutbox(commsDispatcher);
  logCronRun("outbox-drain", result);
  return NextResponse.json({ ok: true, ...result });
}
