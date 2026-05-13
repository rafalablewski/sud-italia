import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { createConversation, listConversations } from "@/lib/ai/conversations";

/**
 * Ops agent conversation list (m4_4). One row per chat thread,
 * scoped to the calling admin user.
 */
export const GET = withAdmin({}, async (_req, _ctx, { user }) => {
  const list = await listConversations(user.id);
  return NextResponse.json({ conversations: list });
});

export const POST = withAdmin({}, async (req, _ctx, { user }) => {
  const body = (await req.json().catch(() => ({}))) as { title?: string };
  const title = (body.title?.trim() || "New conversation").slice(0, 120);
  const conv = await createConversation(user.id, title);
  return NextResponse.json({ conversation: conv });
});
