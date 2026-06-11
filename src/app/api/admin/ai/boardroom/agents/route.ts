import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getResolvedAgentConfigs } from "@/lib/store";

/**
 * Agent HQ — the editable agent roster. Returns every agent's fully-resolved
 * config (seed defaults ⊕ operator override). The live system prompt is
 * generated client-side from these same fields via buildLiveSystemPrompt (the
 * pure builder both sides share), so the roster payload stays small. Manager+.
 */
export const GET = withAdmin({ roles: ["manager"] }, async () => {
  const agents = await getResolvedAgentConfigs();
  return NextResponse.json({ agents });
});
