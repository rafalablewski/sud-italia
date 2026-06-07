import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { findLatestConversation, getMessages } from "@/lib/ai/conversations";
import { normalizeChatPersonaTag } from "@/lib/ai/boardroom/personas";

/**
 * Latest conversation + messages for the calling user, scoped to a
 * Boardroom persona (?persona=ceo|coo|cfo|cmo) or the general/team chat
 * (omit persona). Lets the Boardroom reopen and re-render the same
 * per-agent thread on revisit instead of starting fresh. Returns
 * { conversation: null } when the user has no thread for that persona yet.
 */
export const GET = withAdmin({}, async (req, _ctx, { user }) => {
  const persona = normalizeChatPersonaTag(req.nextUrl.searchParams.get("persona"));
  const conv = await findLatestConversation(user.id, persona);
  if (!conv) return NextResponse.json({ conversation: null, messages: [] });
  const messages = await getMessages(conv.id);
  return NextResponse.json({ conversation: conv, messages });
});
