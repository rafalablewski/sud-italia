import { NextRequest, NextResponse } from "next/server";
import { logCronRun, withCron } from "@/lib/cron";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { generateParPurchaseOrders } from "@/lib/par-purchase-orders";

/**
 * PAR-driven draft PO generation (audit §3). Runs daily as part of the
 * dispatch fan-out. Per location, computes lead-time-adjusted reorder
 * thresholds from the trailing 14 days of `consume` movements (the
 * recipe-decrement signal that now actually exists post audit §3 row
 * 1) and writes one draft PO per supplier with the missing quantity.
 *
 * Operator opens /admin/purchase-orders, reviews, taps Send. The cron
 * is idempotent: re-runs on the same UTC day overwrite the day's draft
 * row instead of creating duplicates.
 */
export async function POST(req: NextRequest) {
  const auth = await withCron(req);
  if (auth) return auth;

  const locations = await getActiveLocationsAsync();
  const out: Record<
    string,
    {
      considered: number;
      belowThreshold: number;
      skippedNoSupplier: number;
      draftsWritten: number;
      draftIds: string[];
      error?: string;
    }
  > = {};

  for (const loc of locations) {
    try {
      const res = await generateParPurchaseOrders(loc.slug);
      out[loc.slug] = {
        considered: res.considered,
        belowThreshold: res.belowThreshold,
        skippedNoSupplier: res.skippedNoSupplier,
        draftsWritten: res.drafts.length,
        draftIds: res.drafts.map((d) => d.id),
      };
    } catch (err) {
      out[loc.slug] = {
        considered: 0,
        belowThreshold: 0,
        skippedNoSupplier: 0,
        draftsWritten: 0,
        draftIds: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  logCronRun("par-purchase-orders", { perLocation: out });
  return NextResponse.json({ ok: true, perLocation: out });
}
