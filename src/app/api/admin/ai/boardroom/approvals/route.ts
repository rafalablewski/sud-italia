import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { listMeetings, updateMeetingDecisionStatus } from "@/lib/ai/boardroom/store";
import { appendAgentEvent } from "@/lib/store";
import { isBoardroomPersonaId } from "@/lib/ai/boardroom/personas";

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

/**
 * Transition an approval (approved / executed / dismissed). Clears it from the
 * queue and logs the decision on the owning agent's timeline.
 */
export const POST = withAdmin({ roles: ["manager"] }, async (req, _ctx, { user }) => {
  const body = (await req.json().catch(() => ({}))) as {
    meetingId?: string; index?: number; status?: string; owner?: string;
  };
  const { meetingId, index } = body;
  const status = body.status;
  if (!meetingId || typeof index !== "number" || !status || !["approved", "executed", "dismissed"].includes(status)) {
    return NextResponse.json({ error: "meetingId, index and a valid status are required." }, { status: 400 });
  }
  const meeting = await updateMeetingDecisionStatus(
    meetingId,
    index,
    status as "approved" | "executed" | "dismissed",
  );
  if (!meeting) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  const decision = meeting.decisions[index];
  if (decision && isBoardroomPersonaId(decision.owner)) {
    await appendAgentEvent({
      agentId: decision.owner,
      type: "approval",
      summary: `Decision ${status}: ${decision.title}`,
      detail: decision.proposedTool ? `Lever: ${decision.proposedTool}` : undefined,
      actor: `admin:${user.id}`,
    });
  }
  return NextResponse.json({ ok: true });
});
