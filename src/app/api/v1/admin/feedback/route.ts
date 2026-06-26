import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, resolveLocationFilter } from "@/lib/api/v1/guard";
import { getFeedback } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/feedback` — guest reviews + sentiment, mirroring web
 * `/admin/feedback`. Manager+; location-scoped. Newest first.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const filter = resolveLocationFilter(req, guard.claims.scope);
  if ("error" in filter) return filter.error;
  try {
    const all = await getFeedback();
    const list = filter.slugs === null ? all : all.filter((f) => filter.slugs!.includes(f.locationSlug));
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const avg = list.length
      ? Math.round((list.reduce((s, f) => s + f.overallRating, 0) / list.length) * 10) / 10
      : 0;
    return apiOk(list, { count: list.length, avgRating: avg });
  } catch (err) {
    logger.error("v1 admin feedback failed", { layer: "api.v1.admin.feedback" }, err as Error);
    return apiError("internal", "Could not load feedback");
  }
}
