import { callGateway, gatewayConfigured, extractText } from "../gateway";
import { estimateCallCostGrosze, getDailyBudgetGrosze } from "../cost";
import { getDailyAiSpendGrosze } from "../conversations";
import { logger } from "@/lib/logger";
import {
  BOARDROOM_PERSONAS,
  BOARDROOM_PERSONA_ORDER,
  isBoardroomPersonaId,
  type BoardroomPersonaId,
} from "./personas";
import { computeBoardroomKpis } from "./kpis";
import { saveMeeting, type BoardroomMeeting, type MeetingContribution, type MeetingDecision, type MeetingType } from "./store";

/**
 * Boardroom meeting orchestrator — the real multi-agent collaboration.
 *
 *   1. Compute the live KPI snapshot (the agenda = its non-green flags).
 *   2. Round-robin: each persona (COO → CFO → CMO → CEO) speaks in turn,
 *      seeing the KPIs + every prior speaker's contribution, in its own
 *      voice. Contributions are grounded in the real KPI snapshot we hand
 *      them — no invented numbers.
 *   3. Synthesis: a final CEO-voiced pass converges the discussion into a
 *      structured decision list (owner + rationale + optional gated action).
 *   4. Persist transcript + decisions.
 *
 * Reuses the same gateway, cost model, and daily-budget gate as the ops
 * agent so spend stays attributed and capped.
 */

const MODEL = "claude-opus-4-7";

export interface RunMeetingInput {
  type: MeetingType;
  scope?: string;
  userId: string;
}

export interface RunMeetingResult {
  ok: boolean;
  error?: string;
  meeting?: BoardroomMeeting;
}

function newMeetingId(): string {
  return `mtg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function describeAgenda(type: MeetingType): string {
  return type === "daily"
    ? "This is the DAILY BRIEFING. Focus on today and the next 48 hours — service readiness, today's risks, and one quick win."
    : "This is the WEEKLY REVIEW. Step back: trends over the last 7–30 days, what's structurally off-target, and the priorities for next week.";
}

export async function runBoardroomMeeting(input: RunMeetingInput): Promise<RunMeetingResult> {
  if (!gatewayConfigured()) {
    return { ok: false, error: "ANTHROPIC_API_KEY is not configured. Add it to the environment to run meetings." };
  }

  const dailySpend = await getDailyAiSpendGrosze();
  const budget = getDailyBudgetGrosze();
  if (dailySpend >= budget) {
    return {
      ok: false,
      error: `Daily AI budget exhausted (${(dailySpend / 100).toFixed(2)} / ${(budget / 100).toFixed(2)} PLN). Try again tomorrow or raise AI_DAILY_BUDGET_GROSZE.`,
    };
  }

  const snapshot = await computeBoardroomKpis(input.scope);
  const kpiTable = snapshot.kpis
    .map((k) => `- ${k.label}: ${k.display} [${k.status}] — benchmark: ${k.benchmark}`)
    .join("\n");
  const agendaBlock =
    snapshot.flags.length > 0
      ? `Off-target metrics to address:\n${snapshot.flags.map((f) => `- ${f}`).join("\n")}`
      : "All headline KPIs are on target. Use the meeting to find the next growth lever.";

  const baseContext = `${describeAgenda(input.type)}

Scope: ${snapshot.scope}. Live KPI snapshot (real data, do not invent other numbers):
${kpiTable}

${agendaBlock}`;

  let totalCost = 0;
  const contributions: MeetingContribution[] = [];

  // --- Round-robin discussion ---
  for (const personaId of BOARDROOM_PERSONA_ORDER) {
    const persona = BOARDROOM_PERSONAS[personaId];
    const priorBlock = contributions.length
      ? `\n\nWhat your colleagues have said so far:\n${contributions
          .map((c) => `${BOARDROOM_PERSONAS[c.persona].title}: ${c.text}`)
          .join("\n\n")}`
      : "\n\nYou speak first.";
    const userMessage = `${baseContext}${priorBlock}

Speak now, as the ${persona.title}. 2–4 sentences in your own voice: your read of the numbers from your remit, and the single action you recommend. Be specific and reference the figures above. Do not repeat a colleague verbatim — build on or push back.`;

    try {
      const res = await callGateway({
        feature: `boardroom-meeting-${personaId}`,
        system: persona.system,
        messages: [{ role: "user", content: userMessage }],
        maxTokens: 700,
        thinking: "off",
      });
      totalCost += estimateCallCostGrosze(MODEL, res.usage);
      const text = extractText(res.message);
      if (text) contributions.push({ persona: personaId, text });
    } catch (err) {
      logger.error("boardroom.meeting.persona_failed", { personaId }, err);
    }
  }

  if (contributions.length === 0) {
    return { ok: false, error: "The board could not be reached (all agent calls failed). Try again." };
  }

  // --- Synthesis: CEO converges the discussion into structured decisions ---
  const decisions = await synthesizeDecisions(baseContext, contributions, (cost) => {
    totalCost += cost;
  });

  const meeting: BoardroomMeeting = {
    id: newMeetingId(),
    type: input.type,
    scope: snapshot.scope,
    agenda: snapshot.flags,
    contributions,
    decisions,
    costGrosze: totalCost,
    createdAt: new Date().toISOString(),
    createdBy: input.userId,
  };
  await saveMeeting(meeting);
  return { ok: true, meeting };
}

const KNOWN_TOOLS = ["update_item_price", "mark_item_86", "send_sms", "manage_scheduled_bundle"];

async function synthesizeDecisions(
  baseContext: string,
  contributions: MeetingContribution[],
  addCost: (grosze: number) => void,
): Promise<MeetingDecision[]> {
  const transcript = contributions
    .map((c) => `${BOARDROOM_PERSONAS[c.persona].title}: ${c.text}`)
    .join("\n\n");

  const system = `You are the chair of the Ottaviano leadership board. Convert a board discussion into a concise, prioritised decision list. Reply with ONLY a JSON object — no prose, no markdown fences.

Schema:
{"decisions":[{"title":"short imperative","owner":"ceo|coo|cfo|cmo","rationale":"one sentence tied to a figure","proposedTool":"optional: ${KNOWN_TOOLS.join(" | ")}","proposedInput":{}}]}

Rules:
- 2 to 5 decisions, highest-impact first.
- owner MUST be one of: ceo, coo, cfo, cmo.
- Only set proposedTool when there is a concrete, approvable action; otherwise omit it.
- proposedInput must match the tool (e.g. update_item_price needs itemId, locationSlug, newPriceGrosze in grosze).
- Never invent numbers beyond what the discussion provided.`;

  const userMessage = `${baseContext}

Board discussion:
${transcript}

Produce the decision JSON now.`;

  try {
    const res = await callGateway({
      feature: "boardroom-meeting-synthesis",
      system,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 1200,
      thinking: "off",
    });
    addCost(estimateCallCostGrosze(MODEL, res.usage));
    return parseDecisions(extractText(res.message));
  } catch (err) {
    logger.error("boardroom.meeting.synthesis_failed", {}, err);
    return [];
  }
}

export function parseDecisions(text: string): MeetingDecision[] {
  // The model is asked for bare JSON, but strip any stray fence just in case.
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return [];
  }
  const raw = (parsed as { decisions?: unknown }).decisions;
  if (!Array.isArray(raw)) return [];
  const out: MeetingDecision[] = [];
  for (const d of raw) {
    if (!d || typeof d !== "object") continue;
    const obj = d as Record<string, unknown>;
    const owner = obj.owner;
    if (!isBoardroomPersonaId(owner as string)) continue;
    const title = typeof obj.title === "string" ? obj.title.slice(0, 200) : "";
    if (!title) continue;
    const proposedTool =
      typeof obj.proposedTool === "string" && KNOWN_TOOLS.includes(obj.proposedTool)
        ? obj.proposedTool
        : undefined;
    out.push({
      title,
      owner: owner as BoardroomPersonaId,
      rationale: typeof obj.rationale === "string" ? obj.rationale.slice(0, 400) : "",
      proposedTool,
      proposedInput:
        proposedTool && obj.proposedInput && typeof obj.proposedInput === "object"
          ? (obj.proposedInput as Record<string, unknown>)
          : undefined,
      status: "proposed",
    });
  }
  return out.slice(0, 5);
}
