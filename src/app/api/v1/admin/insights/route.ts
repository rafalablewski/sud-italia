import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { getInsights } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/insights` — analytics rollup (top/worst sellers, peak hours,
 * cancellation rate, per-location comparison), mirroring web `/admin/ai`. Manager+.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const from = req.nextUrl.searchParams.get("from")?.trim() || undefined;
  const to = req.nextUrl.searchParams.get("to")?.trim() || undefined;
  try {
    const i = await getInsights(from, to);
    return apiOk({
      avgItemsPerOrder: i.avgItemsPerOrder,
      cancelledOrders: i.cancelledOrders,
      cancellationRate: i.cancellationRate,
      topSellers: i.topSellers.slice(0, 10),
      worstSellers: i.worstSellers.slice(0, 10),
      peakHours: i.peakHours,
      locationComparison: i.locationComparison,
    });
  } catch (err) {
    logger.error("v1 admin insights failed", { layer: "api.v1.admin.insights" }, err as Error);
    return apiError("internal", "Could not load insights");
  }
}
