import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole, scopeAllows } from "@/lib/api/v1/guard";
import { getOrders } from "@/lib/store";
import { analyzeTruck } from "@/lib/kds-prediction";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/pos/pressure?location=` — live kitchen pressure for the POS
 * command bar's "risk N" indicator: the same predictive tier / at-risk the KDS
 * colours from (`analyzeTruck` over real, non-simulated orders — Rule #1). Native
 * twin of web `/api/admin/pos/pressure`. Staff+, location-scoped + required.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  const loc = req.nextUrl.searchParams.get("location")?.trim().toLowerCase() || "";
  if (!loc) return apiError("validation_failed", "location is required");
  if (!scopeAllows(guard.claims.scope, loc)) return apiError("forbidden", `Not authorized for location "${loc}"`);
  try {
    const orders = (await getOrders(loc)).filter((o) => !o.simulated);
    const now = Date.now();
    const a = analyzeTruck(orders, now);
    let oldestSec = 0;
    for (const o of orders) {
      if (o.status !== "confirmed" && o.status !== "preparing") continue;
      const t = Date.parse(o.paidAt ?? o.createdAt);
      if (Number.isFinite(t)) oldestSec = Math.max(oldestSec, Math.round((now - t) / 1000));
    }
    return apiOk(
      { tier: a.bottleneck?.tier ?? "calm", onLine: a.counts.active, atRisk: a.counts.risk + a.counts.late, oldestSec },
      { location: loc },
    );
  } catch (err) {
    logger.error("v1 pos pressure failed", { layer: "api.v1.admin.pos.pressure" }, err as Error);
    return apiError("internal", "Could not load kitchen pressure");
  }
}
