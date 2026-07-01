import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getSettings, getActorCompTotalToday } from "@/lib/store";
import { DEFAULT_REFUND_CONTROLS, bypassesRefundCaps } from "@/lib/refund-guard";

/**
 * Live comp-cap status for the acting user at a location — backs the tender
 * sheet's per-shift comp meter so the operator sees the running budget at the
 * moment they comp (turns a policy into a visible cap; the server still
 * enforces it in fireTab). Real audit-log total (Rule #1), not a guess.
 *
 * GET ?location= → { compTodayGrosze, capGrosze, singleMaxGrosze, bypasses }
 */
export const GET = withAdmin({ locationParam: "location" }, async (_req, _ctx, { locationSlug, user }) => {
  const limits = (await getSettings()).refundControls ?? DEFAULT_REFUND_CONTROLS;
  const actor = user.email || user.id;
  const compTodayGrosze = locationSlug ? await getActorCompTotalToday(actor, locationSlug) : 0;
  return NextResponse.json({
    compTodayGrosze,
    capGrosze: limits.compDailyCapGrosze ?? 0,
    singleMaxGrosze: limits.singleMaxGrosze ?? 0,
    bypasses: bypassesRefundCaps(user.role),
  });
});
