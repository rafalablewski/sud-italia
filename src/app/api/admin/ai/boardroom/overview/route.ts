import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { computeBoardroomKpis } from "@/lib/ai/boardroom/kpis";
import { gatewayConfigured } from "@/lib/ai/gateway";
import { BOARDROOM_PERSONAS, BOARDROOM_PERSONA_ORDER } from "@/lib/ai/boardroom/personas";

/**
 * Boardroom overview — the central-dashboard payload. Live traffic-light
 * KPIs (real store data) plus a per-agent status derived from how many of
 * each agent's owned metrics are off-target. Manager+.
 */
export const GET = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    const snapshot = await computeBoardroomKpis(locationSlug ?? undefined);

    const agents = BOARDROOM_PERSONA_ORDER.map((id) => {
      const p = BOARDROOM_PERSONAS[id];
      const concerns = snapshot.agentConcerns[id] ?? 0;
      return {
        id,
        title: p.title,
        remit: p.remit,
        accentVar: p.accentVar,
        initials: p.initials,
        concerns,
        status: concerns === 0 ? "green" : concerns >= 2 ? "red" : "yellow",
        statusText:
          concerns === 0
            ? "All clear in my area"
            : `Watching ${concerns} metric${concerns > 1 ? "s" : ""} off-target`,
      };
    });

    return NextResponse.json({
      gatewayConfigured: gatewayConfigured(),
      snapshot,
      agents,
    });
  },
);
