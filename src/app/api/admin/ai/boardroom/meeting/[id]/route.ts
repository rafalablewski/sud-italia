import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getMeeting } from "@/lib/ai/boardroom/store";

/**
 * Single boardroom meeting — transcript + decisions. Manager+.
 */
export const GET = withAdmin<{ params: Promise<{ id: string }> }>(
  { roles: ["manager"] },
  async (_req, { params }) => {
    const { id } = await params;
    const meeting = await getMeeting(id);
    if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ meeting });
  },
);
