import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { computeBoardroomKpis } from "@/lib/ai/boardroom/kpis";
import { gatewayConfigured } from "@/lib/ai/gateway";
import {
  ALL_BOARDROOM_PERSONA_IDS,
  BOARDROOM_PERSONA_ORDER,
  BOARDROOM_PERSONAS,
} from "@/lib/ai/boardroom/personas";

/**
 * Boardroom overview — the central-dashboard payload. Live traffic-light
 * KPIs (real store data) plus a per-agent status. The four C-suite executives
 * own P&L metrics, so their status is derived from how many are off-target;
 * the specialist advisors (frontend, database, UX/UI, market, security) don't
 * own a KPI, so they sit in a neutral "advisory" state. Manager+.
 */
const KPI_OWNERS = new Set<string>(BOARDROOM_PERSONA_ORDER);

export const GET = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    const snapshot = await computeBoardroomKpis(locationSlug ?? undefined);

    const agents = ALL_BOARDROOM_PERSONA_IDS.map((id) => {
      const p = BOARDROOM_PERSONAS[id];
      const isKpiOwner = KPI_OWNERS.has(id);
      const concerns = snapshot.agentConcerns[id] ?? 0;
      const status = !isKpiOwner ? "neutral" : concerns === 0 ? "green" : concerns >= 2 ? "red" : "yellow";
      const statusText = !isKpiOwner
        ? "Advisory — ask me anything"
        : concerns === 0
          ? "All clear in my area"
          : `Watching ${concerns} metric${concerns > 1 ? "s" : ""} off-target`;
      return {
        id,
        title: p.title,
        remit: p.remit,
        accentVar: p.accentVar,
        initials: p.initials,
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
