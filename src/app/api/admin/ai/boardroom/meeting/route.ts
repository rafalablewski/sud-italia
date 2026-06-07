import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { runBoardroomMeeting } from "@/lib/ai/boardroom/meeting";
import { listMeetings } from "@/lib/ai/boardroom/store";

/**
 * Boardroom meetings. GET lists recent meetings; POST convenes a new
 * daily briefing / weekly review (runs the round-robin + synthesis). The
 * meeting orchestrator enforces the shared daily AI budget. Manager+.
 */
export const GET = withAdmin({ roles: ["manager"] }, async () => {
  const meetings = await listMeetings(20);
  return NextResponse.json({ meetings });
});

export const POST = withAdmin(
  { roles: ["manager"], locationParam: "location" },
  async (req, _ctx, { user, locationSlug }) => {
    const body = (await req.json().catch(() => ({}))) as { type?: string };
    const type = body.type === "weekly" ? "weekly" : "daily";

    const result = await runBoardroomMeeting({
      type,
      scope: locationSlug ?? undefined,
      userId: user.id,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 503 });
    }
    return NextResponse.json({ meeting: result.meeting });
  },
);
