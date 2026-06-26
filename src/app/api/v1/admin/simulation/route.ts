import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { getSimulationScenario } from "@/lib/store";
import { projectTwelveMonths } from "@/lib/simulation-engine";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const r = Math.round;

/**
 * `GET /api/v1/admin/simulation` — the Calculator's P&L projection, mirroring web
 * `/admin/simulation`. Manager+. Reuses the pure `projectTwelveMonths` engine
 * (no duplicated financial logic) over the saved scenario. Money is rounded to
 * whole grosze so the client decodes Int. Read-only for now — the what-if levers
 * are a later increment (would POST scenario edits to `saveSimulationScenario`).
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  try {
    const s = await getSimulationScenario();
    const rows = projectTwelveMonths(s).map((m) => ({
      month: m.month,
      monthIndex: m.monthIndex,
      revenue: r(m.revenue),
      cogs: r(m.cogs),
      labor: r(m.labor),
      fixed: r(m.fixed),
      payment: r(m.payment),
      netProfit: r(m.netProfit),
    }));
    const sum = (k: keyof (typeof rows)[number]) => rows.reduce((a, m) => a + (m[k] as number), 0);
    const year1 = {
      revenue: sum("revenue"),
      cogs: sum("cogs"),
      labor: sum("labor"),
      fixed: sum("fixed"),
      payment: sum("payment"),
      netProfit: sum("netProfit"),
    };
    const assumptions = {
      ordersPerDay: s.ordersPerDay,
      avgTicketGrosze: s.avgTicketGrosze,
      daysOpenPerMonth: s.daysOpenPerMonth,
      cogsPct: s.cogsPct,
      paymentProcessorPct: s.paymentProcessorPct ?? null,
      setupCostGrosze: s.setupCostGrosze ?? null,
    };
    return apiOk({ assumptions, year1, months: rows });
  } catch (err) {
    logger.error("v1 admin simulation failed", { layer: "api.v1.admin.simulation" }, err as Error);
    return apiError("internal", "Could not compute the projection");
  }
}
