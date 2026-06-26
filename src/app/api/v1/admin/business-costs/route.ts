import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, resolveLocationFilter } from "@/lib/api/v1/guard";
import { getBusinessCosts } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/business-costs` — fixed & variable costs, mirroring web
 * `/admin/business-costs`. Manager+; location-scoped (costs without a location
 * are chain-wide and shown to everyone).
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const filter = resolveLocationFilter(req, guard.claims.scope);
  if ("error" in filter) return filter.error;
  try {
    const all = await getBusinessCosts({ status: "active" });
    const list = (filter.slugs === null ? all : all.filter((c) => !c.locationSlug || filter.slugs!.includes(c.locationSlug)))
      .map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category,
        vendor: c.vendor ?? null,
        amountGrosze: c.amountGrosze,
        frequency: c.frequency,
        locationSlug: c.locationSlug ?? null,
        nextDueDate: c.nextDueDate ?? null,
      }))
      .sort((a, b) => b.amountGrosze - a.amountGrosze);
    return apiOk(list, { count: list.length });
  } catch (err) {
    logger.error("v1 admin business-costs failed", { layer: "api.v1.admin.costs" }, err as Error);
    return apiError("internal", "Could not load business costs");
  }
}
