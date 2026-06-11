import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getAgentHqSettings, updateAgentHqSettings, getEffectiveDailyBudgetGrosze, type AgentHqSettings } from "@/lib/store";
import { getDailyAiSpendGrosze } from "@/lib/ai/conversations";

/**
 * Agent HQ → Settings: fleet-wide controls (daily AI budget, auto-briefing)
 * that apply to the whole fleet instead of per agent. The active AI model is a
 * separate platform setting (/api/admin/ai/model) edited inline via
 * AiModelControl. Manager+.
 */
export const GET = withAdmin({ roles: ["manager"] }, async () => {
  const [settings, effectiveBudgetGrosze, todaySpendGrosze] = await Promise.all([
    getAgentHqSettings(),
    getEffectiveDailyBudgetGrosze(),
    getDailyAiSpendGrosze(),
  ]);
  return NextResponse.json({ settings, effectiveBudgetGrosze, todaySpendGrosze });
});

export const PATCH = withAdmin({ roles: ["manager"] }, async (req) => {
  const body = (await req.json().catch(() => ({}))) as Partial<AgentHqSettings>;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const settings = await updateAgentHqSettings(body);
  const effectiveBudgetGrosze = await getEffectiveDailyBudgetGrosze();
  return NextResponse.json({ settings, effectiveBudgetGrosze });
});
