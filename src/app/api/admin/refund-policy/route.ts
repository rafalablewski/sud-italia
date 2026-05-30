import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getCurrentActor } from "@/lib/admin-auth";
import { getActorCompTotalToday, getSettings } from "@/lib/store";
import { DEFAULT_REFUND_CONTROLS, bypassesRefundCaps } from "@/lib/refund-guard";

/**
 * Refund-cap context for the current actor at a location, so the refund dialog
 * can preview the same decision the POST route enforces (audit §11.2). Returns
 * the configured caps, the actor's comp spend so far today, their role, and
 * whether they bypass caps entirely (owners). Manager/owner only — same gate as
 * the refund action itself.
 */
export const GET = withAdmin(
  { roles: ["owner", "manager"] },
  async (req, _ctx, { user }) => {
    const url = new URL(req.url);
    const location = url.searchParams.get("location")?.trim();
    if (!location) {
      return NextResponse.json({ error: "Missing location" }, { status: 400 });
    }
    const limits = (await getSettings()).refundControls ?? DEFAULT_REFUND_CONTROLS;
    const actor = await getCurrentActor();
    const ownerBypass = bypassesRefundCaps(user.role);
    const actorCompTotalTodayGrosze = ownerBypass
      ? 0
      : await getActorCompTotalToday(actor, location);
    return NextResponse.json({
      role: user.role,
      ownerBypass,
      singleMaxGrosze: limits.singleMaxGrosze ?? 0,
      compDailyCapGrosze: limits.compDailyCapGrosze ?? 0,
      actorCompTotalTodayGrosze,
    });
  },
);
