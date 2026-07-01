import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows } from "@/lib/api/v1/guard";
import { getSettings, getActorCompTotalToday } from "@/lib/store";
import { DEFAULT_REFUND_CONTROLS, bypassesRefundCaps } from "@/lib/refund-guard";
import type { AdminRole } from "@/lib/admin-roles";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/pos/comp-status?location=` — live comp-cap status for the
 * acting operator at a location, the native twin of the web
 * `/api/admin/pos/comp-status`. Backs the tender sheet's per-shift comp meter so
 * the operator sees the running budget at the moment they comp (the server still
 * enforces the cap in chargeTab). Real audit-log total (Rule #1), not a guess.
 *
 * → `{ compTodayGrosze, capGrosze, singleMaxGrosze, bypasses }`. Staff+, scoped.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  const loc = req.nextUrl.searchParams.get("location")?.trim().toLowerCase() || "";
  if (!loc) return apiError("validation_failed", "location is required");
  if (!scopeAllows(guard.claims.scope, loc)) return apiError("forbidden", `Not authorized for location "${loc}"`);

  const limits = (await getSettings()).refundControls ?? DEFAULT_REFUND_CONTROLS;
  const actor = guard.claims.email || guard.claims.sub;
  const compTodayGrosze = await getActorCompTotalToday(actor, loc);
  return apiOk(
    {
      compTodayGrosze,
      capGrosze: limits.compDailyCapGrosze ?? 0,
      singleMaxGrosze: limits.singleMaxGrosze ?? 0,
      bypasses: bypassesRefundCaps(guard.claims.role as AdminRole),
    },
    { location: loc },
  );
}
