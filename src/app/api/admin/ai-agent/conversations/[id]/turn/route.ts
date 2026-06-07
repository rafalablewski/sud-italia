import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getConversation } from "@/lib/ai/conversations";
import { runAgentTurn } from "@/lib/ai/agent";
import { getCurrentLocationScope } from "@/lib/admin-auth";
import { isBoardroomPersonaId } from "@/lib/ai/boardroom/personas";

/**
 * Ops agent turn (m4_8). One round of user message → loop →
 * pending-approval or end_turn. Returns the event list the UI
 * renders inline.
 *
 * For approving previewed mutating tools, the client re-POSTs with
 * `approvedToolUseIds` populated. The agent loop then runs those
 * tools for real on the next hop.
 */
export const POST = withAdmin<{ params: Promise<{ id: string }> }>(
  {},
  async (req, { params }, { user }) => {
    const { id } = await params;
    const conv = await getConversation(id);
    if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (conv.userId !== user.id && user.role !== "owner") {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      message?: string;
      approvedToolUseIds?: string[];
      /** Optional Boardroom persona (ceo/coo/cfo/cmo) — selects the agent voice + tools. */
      personaId?: string;
    };
    const message = (body.message ?? "").trim();
    if (!message) {
      return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }

    const scope = await getCurrentLocationScope();
    const locationScope = !scope || scope[0] === "*" ? "*" : scope.join(",");

    const events = await runAgentTurn({
      conversationId: id,
      userMessage: message,
      actor: {
        userId: user.id,
        role: user.role,
        locationScope,
      },
      approvedToolUseIds: body.approvedToolUseIds,
      personaId: isBoardroomPersonaId(body.personaId) ? body.personaId : undefined,
    });

    return NextResponse.json({ events });
  },
);
