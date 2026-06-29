import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, resolveLocationFilter } from "@/lib/api/v1/guard";
import { getOrders, getLaborCostInRange } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/kds/floor-ops` — the manager floor-control header signals
 * for the KDS KPI strip that aren't in the order stream: throughput (orders
 * completed in the last 60 min) and staff on the clock. Native twin of web
 * `/api/admin/kds/floor-ops` (open/late/oldest stay client-side from the
 * streamed board, so they're not duplicated here).
 *
 * Manager+; honors token scope. With `?location=` it reflects that truck;
 * without one it aggregates across the operator's scoped locations (the native
 * KDS board is chain-wide), so the chain header sums true service.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const filter = resolveLocationFilter(req, guard.claims.scope);
  if ("error" in filter) return filter.error;

  try {
    const now = Date.now();
    const hourAgoIso = new Date(now - 60 * 60 * 1000).toISOString();
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date();
    dayEnd.setHours(23, 59, 59, 999);

    // null = unrestricted (chain-wide); else the concrete scoped slugs.
    const slugs = filter.slugs;
    const dayFrom = dayStart.toISOString();
    const dayTo = dayEnd.toISOString();

    const tally = async (slug: string | undefined) => {
      const recent = await getOrders(slug, hourAgoIso);
      const completed = recent.filter((o) => o.status === "completed").length;
      const { openShifts } = await getLaborCostInRange(slug, dayFrom, dayTo);
      return { completed, openShifts };
    };

    let throughputLastHour = 0;
    let onShift = 0;
    if (slugs === null) {
      const t = await tally(undefined); // chain-wide
      throughputLastHour = t.completed;
      onShift = t.openShifts;
    } else {
      const parts = await Promise.all(slugs.map((s) => tally(s)));
      for (const p of parts) {
        throughputLastHour += p.completed;
        onShift += p.openShifts;
      }
    }

    const requested = req.nextUrl.searchParams.get("location")?.trim().toLowerCase() || "";
    return apiOk({ locationSlug: requested, throughputLastHour, onShift });
  } catch (err) {
    logger.error("v1 admin kds floor-ops failed", { layer: "api.v1.admin.kds.floor-ops" }, err as Error);
    return apiError("internal", "Could not load floor ops");
  }
}
