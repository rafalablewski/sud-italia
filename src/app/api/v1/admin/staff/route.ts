import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, resolveLocationFilter } from "@/lib/api/v1/guard";
import { getStaff } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/staff` — the team roster, mirroring web `/admin/staff`.
 * Manager+; location-scoped (a scoped operator only sees their sites' staff).
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const filter = resolveLocationFilter(req, guard.claims.scope);
  if ("error" in filter) return filter.error;
  try {
    const all = await getStaff();
    const staff = filter.slugs === null ? all : all.filter((s) => filter.slugs!.includes(s.locationSlug));
    staff.sort((a, b) => a.name.localeCompare(b.name));
    return apiOk(staff, { count: staff.length });
  } catch (err) {
    logger.error("v1 admin staff failed", { layer: "api.v1.admin.staff" }, err as Error);
    return apiError("internal", "Could not load staff");
  }
}
