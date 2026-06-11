import { NextRequest, NextResponse } from "next/server";
import { logCronRun, withCron } from "@/lib/cron";
import { gatewayConfigured } from "@/lib/ai/gateway";
import { runScheduledAgents } from "@/lib/ai/boardroom/scheduled";

/**
 * Per-agent scheduled-run cron for Agent HQ. Fires every active agent whose
 * schedule matches the requested cadence (?cadence=daily|weekly, default daily)
 * for a short, KPI-grounded self-review logged to its timeline. Complements the
 * boardroom-briefing cron (which runs the whole board). Self-skips with no spend
 * when ANTHROPIC_API_KEY is unset; budget- + per-agent-cap-gated inside.
 */
export async function POST(req: NextRequest) {
  const auth = await withCron(req);
  if (auth) return auth;

  const cadence = req.nextUrl.searchParams.get("cadence") === "weekly" ? "weekly" : "daily";

  if (!gatewayConfigured()) {
    logCronRun("agent-runs", { skipped: "no-api-key", cadence });
    return NextResponse.json({ ok: true, skipped: "ANTHROPIC_API_KEY not configured" });
  }

  const result = await runScheduledAgents(cadence, "cron");
  logCronRun("agent-runs", {
    ok: true,
    cadence,
    ran: result.ran.length,
    skipped: result.skipped.length,
    costGrosze: result.costGrosze,
  });
  return NextResponse.json({ ok: true, ...result });
}
