import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getOpsGoals, updateOpsGoals } from "@/lib/store";

// The configurable daily revenue goal behind the Admin v3 Operator Terminal
// revenue→goal bar. Owner-only — it's an HQ-level target. No hardcoded number
// anywhere; the dashboard reads whatever the owner sets here (CLAUDE.md #1).

export const GET = withAdmin({ roles: ["owner"] }, async () => {
  return NextResponse.json(await getOpsGoals());
});

export const PUT = withAdmin({ roles: ["owner"] }, async (req) => {
  const body = (await req.json().catch(() => ({}))) as {
    dailyRevenueGoalGrosze?: unknown;
    location?: unknown;
    goalGrosze?: unknown;
  };

  const updates: Parameters<typeof updateOpsGoals>[0] = {};

  if (typeof body.dailyRevenueGoalGrosze === "number" && Number.isFinite(body.dailyRevenueGoalGrosze)) {
    updates.dailyRevenueGoalGrosze = body.dailyRevenueGoalGrosze;
  }

  // Per-location override: { location: "krakow", goalGrosze: 4200000 }.
  if (typeof body.location === "string" && body.location && typeof body.goalGrosze === "number" && Number.isFinite(body.goalGrosze)) {
    updates.byLocation = { [body.location]: Math.max(0, Math.round(body.goalGrosze)) };
  }

  const saved = await updateOpsGoals(updates);
  return NextResponse.json(saved);
});
