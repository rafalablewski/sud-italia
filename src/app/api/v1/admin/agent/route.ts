import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { findLatestConversation, getMessages } from "@/lib/ai/conversations";
import { toAgentMessages } from "@/lib/api/v1/agent-dto";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/agent` — the operator's latest Ops-Agent thread + its
 * messages, mirroring web `/admin/ai/agent`. Manager+. Returns an empty thread
 * (null id) when the operator hasn't chatted yet; the first POST creates one.
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  try {
    const conv = await findLatestConversation(guard.claims.sub, null);
    if (!conv) return apiOk({ conversationId: null, messages: [] });
    const messages = toAgentMessages(await getMessages(conv.id));
    return apiOk({ conversationId: conv.id, title: conv.title, messages });
  } catch (err) {
    logger.error("v1 admin agent thread failed", { layer: "api.v1.admin.agent" }, err as Error);
    return apiError("internal", "Could not load the agent thread");
  }
}
