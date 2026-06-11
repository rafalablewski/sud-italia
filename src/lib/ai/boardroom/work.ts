import { callGateway, gatewayConfigured, extractText } from "../gateway";
import { estimateCallCostGrosze } from "../cost";
import { getDailyAiSpendGrosze } from "../conversations";
import { buildLiveSystemPrompt } from "./agent-config";
import {
  getResolvedAgentConfig,
  getWorkItem,
  updateWorkItem,
  appendAgentEvent,
  getAgentDailySpendGrosze,
  getEffectiveDailyBudgetGrosze,
  type AgentWorkItem,
} from "@/lib/store";
import { isBoardroomPersonaId } from "./personas";
import { logger } from "@/lib/logger";

/**
 * Run one operator-assigned work item on its agent. The agent answers the
 * work prompt on its live generated config; the result + cost are written back
 * to the work item and the agent timeline. Budget- + cap-gated like every other
 * agent run.
 */
export interface RunWorkResult { ok: boolean; error?: string; item?: AgentWorkItem }

export async function runAgentWorkItem(id: string, userId: string): Promise<RunWorkResult> {
  const item = await getWorkItem(id);
  if (!item) return { ok: false, error: "Work item not found." };
  if (!item.agentId || !isBoardroomPersonaId(item.agentId)) {
    return { ok: false, error: "Assign the work to an agent first." };
  }
  if (!gatewayConfigured()) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };

  const cfg = await getResolvedAgentConfig(item.agentId);
  if (cfg.status !== "active") return { ok: false, error: `${cfg.name} is ${cfg.status}.` };

  if ((await getDailyAiSpendGrosze()) >= (await getEffectiveDailyBudgetGrosze())) {
    return { ok: false, error: "Daily AI budget exhausted." };
  }
  if (cfg.spend.dailyCapGrosze != null && (await getAgentDailySpendGrosze(cfg.id)) >= cfg.spend.dailyCapGrosze) {
    return { ok: false, error: `${cfg.name} hit its daily spend cap.` };
  }

  await updateWorkItem(id, { status: "running" });

  try {
    const res = await callGateway({
      feature: `boardroom-work-${cfg.id}`,
      system: buildLiveSystemPrompt(cfg),
      messages: [{ role: "user", content: `Assigned task: ${item.title}\n\n${item.prompt}\n\nComplete this from your remit. Be concise and concrete; if it needs a gated action or crosses your escalation threshold, say so.` }],
      maxTokens: 900,
      thinking: "off",
      model: cfg.modelId ?? undefined,
      effort: cfg.effort,
    });
    const cost = estimateCallCostGrosze(cfg.modelId ?? "claude-opus-4-7", res.usage);
    const text = extractText(res.message);
    const updated = await updateWorkItem(id, {
      status: "done",
      completedAt: new Date().toISOString(),
      costGrosze: cost,
      resultSummary: text.slice(0, 1200),
    });
    await appendAgentEvent({
      agentId: cfg.id,
      type: "run",
      summary: `Completed work: ${item.title}`,
      detail: text.slice(0, 800),
      costGrosze: cost,
      ok: true,
      actor: `work:${userId}`,
    });
    return { ok: true, item: updated ?? undefined };
  } catch (err) {
    logger.error("boardroom.work.run_failed", { id, agentId: cfg.id }, err);
    const updated = await updateWorkItem(id, { status: "failed", completedAt: new Date().toISOString() });
    await appendAgentEvent({
      agentId: cfg.id,
      type: "run",
      summary: `Work failed: ${item.title}`,
      ok: false,
      actor: `work:${userId}`,
    });
    return { ok: false, error: err instanceof Error ? err.message : "Run failed.", item: updated ?? undefined };
  }
}
