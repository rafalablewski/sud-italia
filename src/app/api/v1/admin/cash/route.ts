import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, resolveLocationFilter } from "@/lib/api/v1/guard";
import { getCashSessions } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/cash` — till sessions, mirroring web `/admin/cash`. Manager+;
 * location-scoped. Returns a per-session summary (float, drops, variance, state).
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const filter = resolveLocationFilter(req, guard.claims.scope);
  if ("error" in filter) return filter.error;
  try {
    const all = await getCashSessions();
    const sessions = (filter.slugs === null ? all : all.filter((s) => filter.slugs!.includes(s.locationSlug)))
      .map((s) => ({
        id: s.id,
        locationSlug: s.locationSlug,
        openedAt: s.openedAt,
        openedBy: s.openedBy,
        openingFloat: s.openingFloat,
        dropCount: s.drops.length,
        dropsTotal: s.drops.reduce((sum, d) => sum + d.amountGrosze, 0),
        closingCountGrosze: s.closingCountGrosze ?? null,
        varianceGrosze: s.varianceGrosze ?? null,
        closedAt: s.closedAt ?? null,
        open: s.closedAt == null,
      }))
      .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());
    return apiOk(sessions, { count: sessions.length, open: sessions.filter((s) => s.open).length });
  } catch (err) {
    logger.error("v1 admin cash failed", { layer: "api.v1.admin.cash" }, err as Error);
    return apiError("internal", "Could not load cash sessions");
  }
}
