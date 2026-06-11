import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { listMeetings } from "@/lib/ai/boardroom/store";

/**
 * Agent HQ → Approvals. The human-in-the-loop queue: every meeting decision
 * that proposes a concrete, gated tool action and is still awaiting an
 * operator (status "proposed"). The operator actions each via the owning
 * agent's chat, where the preview → approve → execute → audit gate runs.
 * Manager+.
 */
export const GET = withAdmin({ roles: ["manager"] }, async () => {
  const meetings = await listMeetings(20);
  const approvals = meetings.flatMap((m) =>
    m.decisions
      .map((d, index) => ({ d, index }))
      .filter(({ d }) => d.proposedTool && (d.status ?? "proposed") === "proposed")
      .map(({ d, index }) => ({
        meetingId: m.id,
        meetingType: m.type,
        scope: m.scope,
        createdAt: m.createdAt,
        index,
        title: d.title,
        owner: d.owner,
        rationale: d.rationale,
        proposedTool: d.proposedTool,
        proposedInput: d.proposedInput,
      })),
  );
  return NextResponse.json({ approvals });
});
