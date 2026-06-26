import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopedLocations } from "@/lib/api/v1/guard";
import { getNotifications } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/alerts` — operational notifications (stock-outs, full slots,
 * disputes…), mirroring web `/admin/alerts`. Staff+; location-scoped (alerts
 * without a location are shown to everyone). Newest first.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  const allowed = scopedLocations(guard.claims.scope); // null = unrestricted
  try {
    let alerts = await getNotifications();
    if (allowed) alerts = alerts.filter((n) => !n.locationSlug || allowed.includes(n.locationSlug));
    alerts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return apiOk(alerts, { count: alerts.length, unread: alerts.filter((a) => !a.read).length });
  } catch (err) {
    logger.error("v1 admin alerts failed", { layer: "api.v1.admin.alerts" }, err as Error);
    return apiError("internal", "Could not load alerts");
  }
}
