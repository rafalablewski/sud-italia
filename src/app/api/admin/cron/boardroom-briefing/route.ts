import { NextRequest, NextResponse } from "next/server";
import { logCronRun, withCron } from "@/lib/cron";
import { gatewayConfigured } from "@/lib/ai/gateway";
import { runBoardroomMeeting } from "@/lib/ai/boardroom/meeting";
import { getAgentHqSettings } from "@/lib/store";

/**
 * Boardroom daily briefing cron. Convenes the AI C-suite once a day on the
 * chain-wide live numbers and persists the meeting so operators walk in to a
 * ready board briefing (transcript + decisions) on /admin/boardroom →
 * Meetings instead of having to run it by hand.
 *
 * Self-skips when ANTHROPIC_API_KEY is unset (no spend, no error) and is
 * budget-gated inside runBoardroomMeeting like every other Claude path.
 * Fired daily by the cron dispatcher; also manually triggerable (owner) for
 * testing.
 */
export async function POST(req: NextRequest) {
  const auth = await withCron(req);
  if (auth) return auth;

  if (!gatewayConfigured()) {
    logCronRun("boardroom-briefing", { skipped: "no-api-key" });
    return NextResponse.json({ ok: true, skipped: "ANTHROPIC_API_KEY not configured" });
  }

  // Operators can turn the auto-briefing off in Agent HQ → Settings.
  const settings = await getAgentHqSettings();
  if (!settings.autoBriefing) {
    logCronRun("boardroom-briefing", { skipped: "auto-briefing-off" });
    return NextResponse.json({ ok: true, skipped: "Auto-briefing disabled in Agent HQ settings" });
  }

  const result = await runBoardroomMeeting({ type: "daily", userId: "cron" });
  if (!result.ok || !result.meeting) {
    const error = result.error ?? "Meeting not created";
    logCronRun("boardroom-briefing", { ok: false, error });
    // 200 with ok:false — a budget cap or transient model failure shouldn't
    // mark the whole dispatcher run as failed.
    return NextResponse.json({ ok: false, error });
  }

  const { meeting } = result;
  logCronRun("boardroom-briefing", {
    ok: true,
    meetingId: meeting.id,
    decisions: meeting.decisions.length,
    flags: meeting.agenda.length,
    costGrosze: meeting.costGrosze,
  });
  return NextResponse.json({ ok: true, meetingId: meeting.id });
}
