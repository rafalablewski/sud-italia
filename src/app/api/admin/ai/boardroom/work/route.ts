import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { listWorkItems, createWorkItem } from "@/lib/store";
import { isBoardroomPersonaId } from "@/lib/ai/boardroom/personas";

/**
 * Agent HQ → Work. The operator-assigned work board: GET lists every work item
 * (newest first); POST creates one (optionally pre-assigned to an agent).
 * Manager+.
 */
export const GET = withAdmin({ roles: ["manager"] }, async () => {
  const items = await listWorkItems();
  return NextResponse.json({ items });
});

export const POST = withAdmin({ roles: ["manager"] }, async (req, _ctx, { user }) => {
  const body = (await req.json().catch(() => ({}))) as { title?: string; prompt?: string; agentId?: string | null };
  const title = (body.title ?? "").trim();
  const prompt = (body.prompt ?? "").trim();
  if (!title || !prompt) return NextResponse.json({ error: "Title and prompt are required." }, { status: 400 });
  const agentId = body.agentId && isBoardroomPersonaId(body.agentId) ? body.agentId : null;
  const item = await createWorkItem({ title, prompt, agentId, createdBy: user.id });
  return NextResponse.json({ item });
});
