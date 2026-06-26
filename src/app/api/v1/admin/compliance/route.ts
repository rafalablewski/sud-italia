import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, resolveLocationFilter } from "@/lib/api/v1/guard";
import { getComplianceItems } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/compliance` — licences & inspections with expiry, mirroring
 * web `/admin/compliance`. Manager+; location-scoped. Soonest-expiring first.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const filter = resolveLocationFilter(req, guard.claims.scope);
  if ("error" in filter) return filter.error;
  try {
    const all = await getComplianceItems();
    const now = Date.now();
    const items = (filter.slugs === null ? all : all.filter((c) => filter.slugs!.includes(c.locationSlug)))
      .map((c) => ({
        id: c.id,
        locationSlug: c.locationSlug,
        kind: c.kind,
        title: c.title,
        expiresAt: c.expiresAt,
        expired: new Date(c.expiresAt).getTime() < now,
        lastRenewedAt: c.lastRenewedAt ?? null,
      }))
      .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());
    return apiOk(items, { count: items.length, expired: items.filter((i) => i.expired).length });
  } catch (err) {
    logger.error("v1 admin compliance failed", { layer: "api.v1.admin.compliance" }, err as Error);
    return apiError("internal", "Could not load compliance items");
  }
}
