import { NextRequest, NextResponse } from "next/server";
import { logCronRun, withCron } from "@/lib/cron";
import { drainOutbox } from "@/lib/outbox";

/**
 * Drains the outbox events queue (m1_13). Runs every minute. The
 * dispatcher is a stub in Phase 1 — see lib/outbox.ts defaultDispatch.
 * Phase 2 m2_15 supplies the real dispatcher that fans out to
 * SMS/email/aggregator providers.
 */
export async function POST(req: NextRequest) {
  const auth = await withCron(req);
  if (auth) return auth;

  const result = await drainOutbox();
  logCronRun("outbox-drain", result);
  return NextResponse.json({ ok: true, ...result });
}
