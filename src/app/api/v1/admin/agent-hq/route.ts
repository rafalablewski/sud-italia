import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { getResolvedAgentConfigs, getAgentFleetStats, listAgentEvents } from "@/lib/store";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/agent-hq` — the autonomous-agent command center, mirroring
 * web `/admin/agent-hq`: fleet KPIs, the agent roster (with today's spend), and
 * the recent activity timeline. Manager+. All from real store reads.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  try {
    const [configs, fleet, events] = await Promise.all([
      getResolvedAgentConfigs(),
      getAgentFleetStats(),
      listAgentEvents({ limit: 20 }),
    ]);
    return apiOk({
      fleet: {
        runsToday: fleet.runsToday,
        cost7dGrosze: fleet.cost7dGrosze,
        costMonthGrosze: fleet.costMonthGrosze,
        successRate7d: fleet.successRate7d,
        runs7d: fleet.runs7d,
      },
      agents: configs.map((c) => ({
        id: c.id,
        name: c.name,
        title: c.title,
        status: c.status,
        spendTodayGrosze: fleet.spendTodayByAgent[c.id] ?? 0,
      })),
      events: events.map((e) => ({
        id: e.id,
        agentId: e.agentId,
        type: e.type,
        summary: e.summary,
        costGrosze: e.costGrosze ?? null,
        ok: e.ok ?? null,
        at: e.at,
      })),
    });
  } catch (err) {
    logger.error("v1 admin agent-hq failed", { layer: "api.v1.admin.agenthq" }, err as Error);
    return apiError("internal", "Could not load Agent HQ");
  }
}
