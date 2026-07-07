import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows } from "@/lib/api/v1/guard";
import { getOrders } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function daypartOf(hour: number): "morning" | "lunch" | "afternoon" | "dinner" | "late" {
  if (hour < 11) return "morning";
  if (hour < 15) return "lunch";
  if (hour < 18) return "afternoon";
  if (hour < 22) return "dinner";
  return "late";
}

/**
 * `GET /api/v1/admin/pos/popular?location=` — the top menu-item ids by real order
 * frequency for the current daypart (the till's ★ Popular category). Real,
 * non-simulated orders only (Rule #1). Native twin of web `/api/admin/pos/popular`.
 * Staff+, location-scoped + required.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  const loc = req.nextUrl.searchParams.get("location")?.trim().toLowerCase() || "";
  if (!loc) return apiError("validation_failed", "location is required");
  if (!scopeAllows(guard.claims.scope, loc)) return apiError("forbidden", `Not authorized for location "${loc}"`);
  try {
    const orders = await getOrders(loc);
    const dp = daypartOf(new Date().getHours());
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const qtyDaypart = new Map<string, number>();
    const qtyAll = new Map<string, number>();
    for (const o of orders) {
      if (o.simulated) continue;
      const t = Date.parse(o.paidAt ?? o.createdAt);
      if (!Number.isFinite(t) || t < cutoff) continue;
      const sameDaypart = daypartOf(new Date(t).getHours()) === dp;
      for (const it of o.items) {
        const id = it.menuItem?.id;
        if (!id) continue;
        qtyAll.set(id, (qtyAll.get(id) ?? 0) + it.quantity);
        if (sameDaypart) qtyDaypart.set(id, (qtyDaypart.get(id) ?? 0) + it.quantity);
      }
    }
    const pick = qtyDaypart.size >= 4 ? qtyDaypart : qtyAll;
    const popular = [...pick.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id]) => id);
    return apiOk({ daypart: dp, popular }, { location: loc, count: popular.length });
  } catch (err) {
    logger.error("v1 pos popular failed", { layer: "api.v1.admin.pos.popular" }, err as Error);
    return apiError("internal", "Could not load popular items");
  }
}
