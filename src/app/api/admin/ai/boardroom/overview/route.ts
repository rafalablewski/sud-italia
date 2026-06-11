import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { computeBoardroomKpis } from "@/lib/ai/boardroom/kpis";
import { gatewayConfigured } from "@/lib/ai/gateway";
import { getResolvedAgentConfigs } from "@/lib/store";
import { BOARDROOM_PERSONA_ORDER } from "@/lib/ai/boardroom/personas";

/**
 * Agent HQ overview / Command center payload. Live traffic-light KPIs (real
 * store data) plus a per-agent status sourced from the EDITABLE agent configs,
 * so a rename / model change / pause shows up immediately. The four C-suite
 * executives own P&L metrics, so their status is derived from how many are
 * off-target; the specialist advisors don't own a KPI, so they sit in a neutral
 * "advisory" state. A paused/draft agent reads as offline. Manager+.
 */
const KPI_OWNERS = new Set<string>(BOARDROOM_PERSONA_ORDER);

export const GET = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    const [snapshot, configs] = await Promise.all([
      computeBoardroomKpis(locationSlug ?? undefined),
      getResolvedAgentConfigs(),
    ]);

    const agents = configs.map((cfg) => {
      const isKpiOwner = KPI_OWNERS.has(cfg.id);
      const concerns = snapshot.agentConcerns[cfg.id] ?? 0;
      const offline = cfg.status !== "active";
      const status = offline
        ? "neutral"
        : !isKpiOwner
          ? "neutral"
          : concerns === 0
            ? "green"
            : concerns >= 2
              ? "red"
              : "yellow";
      const statusText = offline
        ? `${cfg.status === "paused" ? "Paused" : "Draft"} — not running`
        : !isKpiOwner
          ? "Advisory — ask me anything"
          : concerns === 0
            ? "All clear in my area"
            : `Watching ${concerns} metric${concerns > 1 ? "s" : ""} off-target`;
      return {
        id: cfg.id,
        name: cfg.name,
        title: cfg.title,
        remit: cfg.mandate,
        accentVar: cfg.accentVar,
        initials: cfg.initials,
        agentStatus: cfg.status,
        authority: cfg.authority,
        modelId: cfg.modelId,
        reportsTo: cfg.reportsTo,
        concerns,
        status,
        statusText,
      };
    });

    return NextResponse.json({
      gatewayConfigured: gatewayConfigured(),
      snapshot,
      agents,
    });
  },
);
