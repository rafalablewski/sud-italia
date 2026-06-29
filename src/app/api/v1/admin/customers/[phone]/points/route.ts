import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { addPointAdjustment, getManualPointsTotal } from "@/lib/store";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/admin/customers/:phone/points` — apply a manual loyalty-points
 * adjustment (welcome bonus, goodwill, correction). Body `{ delta, reason? }`
 * where `delta` is the SIGNED point change. Manager+. Records through the shared
 * `addPointAdjustment` so the customer rollup + balance stay in sync (Rule #1).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ phone: string }> }) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const { phone: raw } = await ctx.params;
  const canonical = normalizePlPhoneE164(decodeURIComponent(raw)) ?? decodeURIComponent(raw);

  let body: { delta?: number; reason?: string };
  try { body = await req.json(); } catch { return apiError("bad_request", "Body must be valid JSON"); }
  const delta = Math.round(Number(body.delta));
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 1_000_000) {
    return apiError("validation_failed", "delta must be a non-zero integer within ±1000000");
  }

  try {
    await addPointAdjustment({
      phone: canonical,
      amount: delta,
      reason: typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 200) : "Manual adjustment",
      adjustedBy: guard.claims.name ?? guard.claims.sub,
      adjustedAt: new Date().toISOString(),
    });
    const manualTotal = await getManualPointsTotal(canonical);
    return apiOk({ phone: canonical, delta, manualPointsTotal: manualTotal }, undefined, 201);
  } catch (err) {
    logger.error("v1 customer points failed", { layer: "api.v1.admin.customers.points" }, err as Error);
    return apiError("internal", "Could not adjust points");
  }
}
