import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { runAgentWorkItem } from "@/lib/ai/boardroom/work";

/**
 * Run an assigned work item on its agent (queued → running → done/failed).
 * Result + cost are written back to the item and the agent timeline. Manager+.
 */
export const POST = withAdmin<{ params: Promise<{ id: string }> }>(
  { roles: ["manager"] },
  async (_req, { params }, { user }) => {
    const { id } = await params;
    const res = await runAgentWorkItem(id, user.id);
    if (!res.ok) return NextResponse.json({ error: res.error, item: res.item }, { status: 503 });
    return NextResponse.json({ item: res.item });
  },
);
