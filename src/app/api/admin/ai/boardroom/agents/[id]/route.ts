import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  getResolvedAgentConfig,
  saveAgentConfigOverride,
  appendAgentEvent,
} from "@/lib/store";
import { buildLiveSystemPrompt, type AgentConfigPatch } from "@/lib/ai/boardroom/agent-config";
import { isBoardroomPersonaId } from "@/lib/ai/boardroom/personas";

/**
 * One Agent HQ agent. GET returns the resolved config plus the LIVE SYSTEM
 * PROMPT generated from its fields (the canonical "exactly what it runs on").
 * PATCH merges an editor patch into the agent's stored override, logs the edit
 * to the agent timeline, and returns the freshly-resolved config + prompt.
 * Manager+.
 */
export const GET = withAdmin<{ params: Promise<{ id: string }> }>(
  { roles: ["manager"] },
  async (_req, { params }) => {
    const { id } = await params;
    if (!isBoardroomPersonaId(id)) {
      return NextResponse.json({ error: "Unknown agent" }, { status: 404 });
    }
    const agent = await getResolvedAgentConfig(id);
    return NextResponse.json({ agent, livePrompt: buildLiveSystemPrompt(agent) });
  },
);

export const PATCH = withAdmin<{ params: Promise<{ id: string }> }>(
  { roles: ["manager"] },
  async (req, { params }, { user }) => {
    const { id } = await params;
    if (!isBoardroomPersonaId(id)) {
      return NextResponse.json({ error: "Unknown agent" }, { status: 404 });
    }
    const patch = (await req.json().catch(() => ({}))) as AgentConfigPatch;
    if (!patch || typeof patch !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const agent = await saveAgentConfigOverride(id, patch);
    await appendAgentEvent({
      agentId: id,
      type: "edit",
      summary: `Configuration updated by ${user.name || user.email || user.id}`,
      detail: `Fields: ${Object.keys(patch).join(", ") || "—"}`,
      actor: `admin:${user.id}`,
    });
    return NextResponse.json({ agent, livePrompt: buildLiveSystemPrompt(agent) });
  },
);
