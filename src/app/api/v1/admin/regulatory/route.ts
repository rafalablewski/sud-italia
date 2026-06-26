import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopedLocations } from "@/lib/api/v1/guard";
import { getSettings, resolveLocationCompliance } from "@/lib/store";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/regulatory` — per-location regulatory disclosure config
 * (zone + the flags that drive customer-facing disclosures), mirroring web
 * `/admin/regulatory-compliance`. Owner-level; scope-respecting.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "owner");
  if ("error" in guard) return guard.error;
  const allowed = scopedLocations(guard.claims.scope);
  try {
    const [settings, locations] = await Promise.all([getSettings(), getActiveLocationsAsync()]);
    const rows = locations
      .filter((l) => allowed === null || allowed.includes(l.slug))
      .map((l) => {
        const c = resolveLocationCompliance(settings.compliance, l.slug);
        return {
          locationSlug: l.slug,
          city: l.city,
          zone: c.zone,
          dohGrade: c.dohGrade ?? null,
          calorieDisclosureRequired: c.calorieDisclosureRequired ?? false,
          halalCertId: c.halalCertId ?? null,
          halalCertExpires: c.halalCertExpires ?? null,
        };
      });
    return apiOk(rows, { count: rows.length });
  } catch (err) {
    logger.error("v1 admin regulatory failed", { layer: "api.v1.admin.regulatory" }, err as Error);
    return apiError("internal", "Could not load regulatory disclosures");
  }
}
