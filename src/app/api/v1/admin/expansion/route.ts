import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { getExpansionChecklists } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/expansion` — new-site readiness checklists with progress,
 * mirroring web `/admin/expansion`. Owner-level.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "owner");
  if ("error" in guard) return guard.error;
  try {
    const lists = (await getExpansionChecklists()).map((c) => {
      const done = c.items.filter((i) => i.done).length;
      return {
        locationSlug: c.locationSlug,
        city: c.city ?? null,
        total: c.items.length,
        done,
        pct: c.items.length ? Math.round((done / c.items.length) * 100) : 0,
        updatedAt: c.updatedAt,
      };
    });
    lists.sort((a, b) => b.pct - a.pct);
    return apiOk(lists, { count: lists.length });
  } catch (err) {
    logger.error("v1 admin expansion failed", { layer: "api.v1.admin.expansion" }, err as Error);
    return apiError("internal", "Could not load expansion checklists");
  }
}
