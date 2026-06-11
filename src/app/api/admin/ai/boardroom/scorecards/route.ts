import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  getResolvedAgentConfigs,
  getAgentScorecardStats,
  getLatestKpiActuals,
  logKpiActual,
} from "@/lib/store";
import { isBoardroomPersonaId } from "@/lib/ai/boardroom/personas";

/**
 * Agent HQ → Scorecards. GET returns one scorecard per agent in a single pass
 * (identity + 7d run/cost/last-run/success stats + its KPI targets + the latest
 * logged actual for each), so the tab renders together. POST logs an actual
 * value against one of an agent's KPIs (target-vs-actual). Manager+.
 */
export const GET = withAdmin({ roles: ["manager"] }, async () => {
  const [configs, stats, actuals] = await Promise.all([
    getResolvedAgentConfigs(),
    getAgentScorecardStats(),
    getLatestKpiActuals(),
  ]);
  const scorecards = configs.map((c) => ({
    id: c.id, name: c.name, title: c.title, initials: c.initials, accentVar: c.accentVar,
    status: c.status, authority: c.authority, modelId: c.modelId, kpis: c.kpis,
    stats: stats[c.id] ?? { runs7d: 0, cost7dGrosze: 0, successRate7d: null, lastRunAt: null },
    actuals: actuals[c.id] ?? {},
  }));
  return NextResponse.json({ scorecards });
});

export const POST = withAdmin({ roles: ["manager"] }, async (req, _ctx, { user }) => {
  const body = (await req.json().catch(() => ({}))) as { agentId?: string; kpi?: string; value?: string };
  const { agentId, kpi } = body;
  const value = (body.value ?? "").trim();
  if (!agentId || !isBoardroomPersonaId(agentId) || !kpi || !value) {
    return NextResponse.json({ error: "agentId, kpi and value are required." }, { status: 400 });
  }
  const actual = await logKpiActual({ agentId, kpi, value, by: user.name || user.id });
  return NextResponse.json({ actual });
});
