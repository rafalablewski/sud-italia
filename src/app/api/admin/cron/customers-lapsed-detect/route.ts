import { NextRequest, NextResponse } from "next/server";
import { logCronRun, withCron } from "@/lib/cron";
import { getCustomers } from "@/lib/store";

const LAPSED_DAYS = 90;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Daily lapsed-customer detection (m1_12). Runs 04:00 UTC. Scans the
 * customers rollup (m1_4) for any phone whose `last_order_at` is more than
 * 90 days ago and emits a counter for now. Phase 2 m2_17 will use the
 * same list to fire a re-engagement SMS/email through the outbox; Phase 4
 * m4_17 augments this with RFM scoring so we don't blast the same
 * customer every day.
 */
export async function POST(req: NextRequest) {
  const auth = await withCron(req);
  if (auth) return auth;

  const customers = await getCustomers();
  const now = Date.now();
  const lapsed = customers.filter((c) => {
    if (!c.lastOrderAt) return false;
    const last = new Date(c.lastOrderAt).getTime();
    if (!Number.isFinite(last)) return false;
    return (now - last) / MS_PER_DAY > LAPSED_DAYS;
  });

  logCronRun("customers-lapsed-detect", {
    threshold: LAPSED_DAYS,
    totalCustomers: customers.length,
    lapsed: lapsed.length,
  });

  return NextResponse.json({
    ok: true,
    threshold: LAPSED_DAYS,
    totalCustomers: customers.length,
    lapsed: lapsed.length,
    sample: lapsed.slice(0, 10).map((c) => ({ phone: c.phone, lastOrderAt: c.lastOrderAt })),
  });
}
