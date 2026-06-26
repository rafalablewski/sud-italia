import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import {
  createConversation,
  getConversation,
  getMessages,
} from "@/lib/ai/conversations";
import { runAgentTurn } from "@/lib/ai/agent";
import { toAgentMessages } from "@/lib/api/v1/agent-dto";
import type { AdminRole } from "@/lib/admin-roles";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/admin/agent/turn` — one Ops-Agent round, mirroring web
 * `/admin/ai/agent`. Body `{ message, conversationId? }`. Manager+. Reuses the
 * existing `runAgentTurn` (tools, budget gate, persistence — no duplicated AI
 * logic). The actor's role + location scope come from the token, so the agent
 * only ever sees data the operator may see. Non-streaming: returns the refreshed
 * message list after the turn completes.
 */
export async function POST(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;
  const { sub, role, scope } = guard.claims;

  let body: { message?: string; conversationId?: string };
  try {
    body = await req.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON");
  }
  const message = (body.message ?? "").trim();
  if (!message) return apiError("validation_failed", "message is required");

  try {
    // Resolve / create the conversation, enforcing ownership.
    let conversationId = body.conversationId?.trim() || null;
    if (conversationId) {
      const conv = await getConversation(conversationId);
      if (!conv) return apiError("not_found", "No such conversation");
      if (conv.userId !== sub && role !== "owner") {
        return apiError("forbidden", "Not your conversation");
      }
    } else {
      const title = message.length > 48 ? message.slice(0, 48) + "…" : message;
      conversationId = (await createConversation(sub, title, null)).id;
    }

    const events = await runAgentTurn({
      conversationId,
      userMessage: message,
      actor: { userId: sub, role: role as AdminRole, locationScope: scope },
    });
    const errored = events.find((e) => e.type === "error");

    const messages = toAgentMessages(await getMessages(conversationId));
    return apiOk({ conversationId, messages, error: errored?.text ?? null });
  } catch (err) {
    logger.error("v1 admin agent turn failed", { layer: "api.v1.admin.agent" }, err as Error);
    return apiError("internal", "The agent could not respond");
  }
}
