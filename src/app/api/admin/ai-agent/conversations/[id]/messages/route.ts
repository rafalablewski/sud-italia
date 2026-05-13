import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { getConversation, getMessages } from "@/lib/ai/conversations";

export const GET = withAdmin<{ params: Promise<{ id: string }> }>(
  {},
  async (_req, { params }, { user }) => {
    const { id } = await params;
    const conv = await getConversation(id);
    if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (conv.userId !== user.id && user.role !== "owner") {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
    const messages = await getMessages(id);
    return NextResponse.json({ conversation: conv, messages });
  },
);
