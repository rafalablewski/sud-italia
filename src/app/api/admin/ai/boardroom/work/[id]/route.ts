import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { updateWorkItem, deleteWorkItem, type WorkStatus, type AgentWorkItem } from "@/lib/store";
import { isBoardroomPersonaId } from "@/lib/ai/boardroom/personas";

/**
 * One work item. PATCH assigns it to an agent (drag-to-assign) and/or moves its
 * status; DELETE removes it. Manager+.
 */
const STATUSES: WorkStatus[] = ["unassigned", "queued", "running", "done", "failed"];

export const PATCH = withAdmin<{ params: Promise<{ id: string }> }>(
  { roles: ["manager"] },
  async (req, { params }) => {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { agentId?: string | null; status?: string };
    const patch: Partial<AgentWorkItem> = {};
    if (body.agentId === null) patch.agentId = null;
    else if (typeof body.agentId === "string" && isBoardroomPersonaId(body.agentId)) patch.agentId = body.agentId;
    if (body.status && STATUSES.includes(body.status as WorkStatus)) patch.status = body.status as WorkStatus;
    const item = await updateWorkItem(id, patch);
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ item });
  },
);

export const DELETE = withAdmin<{ params: Promise<{ id: string }> }>(
  { roles: ["manager"] },
  async (_req, { params }) => {
    const { id } = await params;
    await deleteWorkItem(id);
    return NextResponse.json({ ok: true });
  },
);
