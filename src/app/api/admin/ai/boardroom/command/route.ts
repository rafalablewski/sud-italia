import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { computeBoardroomKpis } from "@/lib/ai/boardroom/kpis";
import { gatewayConfigured } from "@/lib/ai/gateway";
import {
  getResolvedAgentConfigs,
  getAgentFleetStats,
  listAgentEvents,
  listWorkItems,
} from "@/lib/store";
import { listMeetings } from "@/lib/ai/boardroom/store";
import { BOARDROOM_PERSONA_ORDER } from "@/lib/ai/boardroom/personas";

/**
 * Agent HQ → Command center, in ONE response. The whole cockpit (fleet KPIs,
 * business KPIs, org, activity, upcoming work, daily digest, costs) is computed
 * server-side and returned together so the page renders in a single pass — no
 * progressive pop-in or layout shift. Manager+.
 */
const KPI_OWNERS = new Set<string>(BOARDROOM_PERSONA_ORDER);

export const GET = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    const [snapshot, configs, stats, events, meetings, work] = await Promise.all([
      computeBoardroomKpis(locationSlug ?? undefined),
      getResolvedAgentConfigs(),
      getAgentFleetStats(),
      listAgentEvents({ limit: 14 }),
      listMeetings(1),
      listWorkItems(),
    ]);

    const agents = configs.map((cfg) => {
      const isKpiOwner = KPI_OWNERS.has(cfg.id);
      const concerns = snapshot.agentConcerns[cfg.id] ?? 0;
      const offline = cfg.status !== "active";
      const status = offline || !isKpiOwner ? "neutral" : concerns === 0 ? "green" : concerns >= 2 ? "red" : "yellow";
      return {
        id: cfg.id, name: cfg.name, title: cfg.title, accentVar: cfg.accentVar, initials: cfg.initials,
        agentStatus: cfg.status, authority: cfg.authority, modelId: cfg.modelId, reportsTo: cfg.reportsTo,
        spentTodayGrosze: stats.spendTodayByAgent[cfg.id] ?? 0, dailyCapGrosze: cfg.spend.dailyCapGrosze,
        concerns, status,
      };
    });

    const activeAgents = configs.filter((c) => c.status === "active").length;
    const scheduled = configs.filter((c) => c.status === "active" && c.schedule.cadence !== "off");

    const m = meetings[0];
    const dailyDigest = m
      ? {
          id: m.id, type: m.type, createdAt: m.createdAt, costGrosze: m.costGrosze,
          agendaCount: m.agenda.length,
          decisions: m.decisions.slice(0, 4).map((d) => ({ title: d.title, owner: d.owner, tool: d.proposedTool ?? null })),
        }
      : null;

    const upcomingWork = work
      .filter((w) => w.status === "unassigned" || w.status === "queued")
      .slice(0, 6)
      .map((w) => ({ id: w.id, title: w.title, agentId: w.agentId, status: w.status }));

    return NextResponse.json({
      gatewayConfigured: gatewayConfigured(),
      snapshot,
      agents,
      configs,
      stats: { ...stats, activeAgents, scheduledCount: scheduled.length },
      scheduled: scheduled.map((c) => ({ id: c.id, name: c.name, initials: c.initials, accentVar: c.accentVar, cadence: c.schedule.cadence, time: c.schedule.time })),
      recentActivity: events,
      upcomingWork,
      dailyDigest,
    });
  },
);
