import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  getResolvedAgentConfig,
  saveAgentConfigOverride,
  clearAgentConfigOverride,
  appendAgentEvent,
  appendAuditLog,
} from "@/lib/store";
import { buildLiveSystemPrompt, type AgentConfig, type AgentConfigPatch } from "@/lib/ai/boardroom/agent-config";
import { isBoardroomPersonaId } from "@/lib/ai/boardroom/personas";

/** Human-readable list of which fields actually changed (before → after). */
function changedFields(before: AgentConfig, after: AgentConfig): string[] {
  const keys: (keyof AgentConfig)[] = [
    "name", "title", "status", "reportsTo", "modelId", "effort", "authority",
    "runtimeManaged", "mandate", "responsibilities", "kpis", "guardrails",
    "escalationThreshold", "tone", "collaborators", "toolNames", "spend", "schedule", "initials",
  ];
  return keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).map(String);
}

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
    const before = await getResolvedAgentConfig(id);
    const agent = await saveAgentConfigOverride(id, patch);
    const changed = changedFields(before, agent);
    await appendAgentEvent({
      agentId: id,
      type: "edit",
      summary: `Configuration updated by ${user.name || user.email || user.id}`,
      detail: changed.length ? `Changed: ${changed.join(", ")}` : "No effective change",
      actor: `admin:${user.id}`,
    });
    // Full before/after audit trail (reuses the platform audit log).
    if (changed.length) {
      const pick = (c: AgentConfig) => Object.fromEntries(changed.map((k) => [k, (c as unknown as Record<string, unknown>)[k]]));
      await appendAuditLog({
        actor: `admin:${user.id}`,
        action: "agent.config.update",
        entityType: "ai.agent",
        entityId: id,
        before: pick(before),
        after: pick(agent),
      });
    }
    return NextResponse.json({ agent, livePrompt: buildLiveSystemPrompt(agent) });
  },
);

/** Reset an agent back to its seed defaults (drop the operator override). */
export const DELETE = withAdmin<{ params: Promise<{ id: string }> }>(
  { roles: ["manager"] },
  async (_req, { params }, { user }) => {
    const { id } = await params;
    if (!isBoardroomPersonaId(id)) {
      return NextResponse.json({ error: "Unknown agent" }, { status: 404 });
    }
    const agent = await clearAgentConfigOverride(id);
    await appendAgentEvent({
      agentId: id,
      type: "edit",
      summary: `Reset to defaults by ${user.name || user.email || user.id}`,
      actor: `admin:${user.id}`,
    });
    return NextResponse.json({ agent, livePrompt: buildLiveSystemPrompt(agent) });
  },
);
