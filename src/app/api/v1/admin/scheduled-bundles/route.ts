import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, resolveLocationFilter } from "@/lib/api/v1/guard";
import { getScheduledBundleIntents } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/scheduled-bundles` — recurring scheduled-bundle intents,
 * mirroring web `/admin/scheduled-bundles`. Manager+; location-scoped.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const filter = resolveLocationFilter(req, guard.claims.scope);
  if ("error" in filter) return filter.error;
  try {
    const all = await getScheduledBundleIntents();
    const list = (filter.slugs === null ? all : all.filter((b) => filter.slugs!.includes(b.locationSlug)))
      .map((b) => ({
        id: b.id,
        bundleName: b.bundleName,
        customerPhone: b.customerPhone,
        locationSlug: b.locationSlug,
        weekday: b.weekday,
        readyAt: b.readyAt,
        itemCount: b.cartSnapshot.reduce((s, i) => s + i.quantity, 0),
        status: b.status,
      }))
      .sort((a, b) => a.weekday.localeCompare(b.weekday) || a.readyAt.localeCompare(b.readyAt));
    return apiOk(list, { count: list.length });
  } catch (err) {
    logger.error("v1 admin scheduled-bundles failed", { layer: "api.v1.admin.bundles" }, err as Error);
    return apiError("internal", "Could not load scheduled bundles");
  }
}
