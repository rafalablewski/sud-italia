import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { listAgentEvents } from "@/lib/store";
import { isBoardroomPersonaId } from "@/lib/ai/boardroom/personas";

/**
 * Agent timeline — history + logs for one agent (runs, edits, escalations,
 * approvals, scheduled fires, notes), newest first. Manager+.
 */
export const GET = withAdmin<{ params: Promise<{ id: string }> }>(
  { roles: ["manager"] },
  async (_req, { params }) => {
    const { id } = await params;
    if (!isBoardroomPersonaId(id)) {
      return NextResponse.json({ error: "Unknown agent" }, { status: 404 });
    }
    const events = await listAgentEvents({ agentId: id, limit: 50 });
    return NextResponse.json({ events });
  },
);
