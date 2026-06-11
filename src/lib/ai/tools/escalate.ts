import { appendAgentEvent } from "@/lib/store";
import { registerTool } from "./registry";

/**
 * escalate_to_admin — the agent's "stop and ask the human" lever. Every agent
 * carries an escalation threshold in its prompt; when it trips, the agent calls
 * this to put a real item in front of the operator (Agent HQ → Inbox) and on
 * its own timeline. Non-mutating (it doesn't touch business state) so it runs
 * without an approval gate and survives observer authority — the whole point is
 * that even a read-only advisor can raise a flag.
 */
registerTool<{ reason: string; severity?: "low" | "medium" | "high" }>({
  name: "escalate_to_admin",
  description:
    "Escalate to the human admin when your escalation threshold is met — a decision exceeds your authority, " +
    "data looks wrong, a risk needs a human, or the team can't converge. Records an item in Agent HQ → Inbox " +
    "and on your timeline. Use sparingly, with a concrete reason. Does NOT take any business action itself.",
  minRole: "staff",
  mutates: false,
  inputSchema: {
    type: "object" as const,
    properties: {
      reason: { type: "string", description: "One or two sentences: what needs the human and why." },
      severity: { type: "string", enum: ["low", "medium", "high"], description: "How urgent (default medium)." },
    },
    required: ["reason"],
  },
  async execute(input, ctx) {
    const reason = (input.reason ?? "").trim();
    if (!reason) return { ok: false, error: "An escalation needs a reason." };
    // Only an Agent HQ agent has the context to file an escalation against
    // itself; the generalist Ops Agent has no agent id, so refuse rather than
    // create an orphan Inbox item.
    if (!ctx.agentId) {
      return { ok: false, error: "Escalation is only available to an Agent HQ agent." };
    }
    const severity = input.severity ?? "medium";
    await appendAgentEvent({
      agentId: ctx.agentId,
      type: "escalation",
      summary: reason.slice(0, 240),
      detail: `Severity: ${severity}`,
      actor: `claude:${ctx.actor.userId}`,
    });
    return {
      ok: true,
      output: { escalated: true, severity, message: "Escalation recorded for the human admin (Agent HQ → Inbox)." },
    };
  },
});
