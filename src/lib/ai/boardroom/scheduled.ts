import { callGateway, gatewayConfigured, extractText } from "../gateway";
import { estimateCallCostGrosze } from "../cost";
import { getDailyAiSpendGrosze } from "../conversations";
import { computeBoardroomKpis } from "./kpis";
import { buildLiveSystemPrompt } from "./agent-config";
import {
  getResolvedAgentConfigs,
  appendAgentEvent,
  getAgentDailySpendMap,
  getEffectiveDailyBudgetGrosze,
} from "@/lib/store";
import { logger } from "@/lib/logger";
import type { ScheduleCadence } from "./agent-config";

/**
 * Per-agent scheduled runs. Each agent carries a schedule (off / daily /
 * weekly); the cron fires this for the matching cadence and runs a short,
 * grounded self-review for every active agent on that cadence — its own
 * generated prompt over the live KPI snapshot — logging the result to the
 * agent's timeline (and respecting the shared budget + each agent's daily cap).
 *
 * This is the autonomous counterpart to a meeting: a meeting is the whole board
 * converging on decisions; a scheduled run is one agent checking its own remit.
 */

export interface ScheduledRunResult {
  cadence: ScheduleCadence;
  ran: string[];
  skipped: string[];
  costGrosze: number;
}

export async function runScheduledAgents(cadence: "daily" | "weekly", userId: string): Promise<ScheduledRunResult> {
  const out: ScheduledRunResult = { cadence, ran: [], skipped: [], costGrosze: 0 };
  if (!gatewayConfigured()) return out;

  const configs = (await getResolvedAgentConfigs()).filter(
    (c) => c.status === "active" && c.schedule.cadence === cadence,
  );
  if (configs.length === 0) return out;

  const budget = await getEffectiveDailyBudgetGrosze();
  const spendMap = await getAgentDailySpendMap();

  for (const cfg of configs) {
    // Shared platform budget gate (re-read each loop so a long run stops in time).
    if ((await getDailyAiSpendGrosze()) >= budget) { out.skipped.push(cfg.id); continue; }
    // Per-agent daily cap.
    if (cfg.spend.dailyCapGrosze != null && (spendMap[cfg.id] ?? 0) >= cfg.spend.dailyCapGrosze) {
      out.skipped.push(cfg.id);
      continue;
    }

    const snapshot = await computeBoardroomKpis(undefined);
    const owned = snapshot.kpis.filter((k) => k.owner === cfg.id);
    const kpiTable = (owned.length ? owned : snapshot.kpis)
      .map((k) => `- ${k.label}: ${k.display} [${k.status}] — ${k.benchmark}`)
      .join("\n");
    const userMessage = `This is your scheduled ${cadence} self-review. Live KPI snapshot (real data, do not invent numbers):
${kpiTable}

In 2–4 sentences from your remit: your read of these numbers and the single action you recommend. If something crosses your escalation threshold, call escalate_to_admin instead.`;

    try {
      const res = await callGateway({
        feature: `boardroom-scheduled-${cfg.id}`,
        system: buildLiveSystemPrompt(cfg),
        messages: [{ role: "user", content: userMessage }],
        maxTokens: 600,
        thinking: "off",
        model: cfg.modelId ?? undefined,
        effort: cfg.effort,
      });
      const cost = estimateCallCostGrosze(cfg.modelId ?? "claude-opus-4-7", res.usage);
      out.costGrosze += cost;
      spendMap[cfg.id] = (spendMap[cfg.id] ?? 0) + cost;
      const text = extractText(res.message);
      await appendAgentEvent({
        agentId: cfg.id,
        type: "schedule",
        summary: `Scheduled ${cadence} self-review`,
        detail: text.slice(0, 800),
        costGrosze: cost,
        ok: true,
        actor: `schedule:${userId}`,
      });
      out.ran.push(cfg.id);
    } catch (err) {
      logger.error("boardroom.scheduled.agent_failed", { agentId: cfg.id }, err);
      out.skipped.push(cfg.id);
    }
  }
  return out;
}
