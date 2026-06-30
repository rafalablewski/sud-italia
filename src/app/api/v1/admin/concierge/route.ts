import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { getConciergeSettings } from "@/lib/store";
import { CAPABILITY_META, CAPABILITY_ORDER } from "@/lib/concierge/capabilities";
import { whatsAppConfigured } from "@/lib/providers/whatsapp";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/concierge` — the Guest → Concierge surface (mirrors
 * `/core/guest/concierge`): the MCP capability layer an external agent (or the
 * WhatsApp bot) can reach, with each capability's live/hidden exposure. Manager+
 * (the web Concierge gate). The capability meta + exposure come from the same
 * `CAPABILITY_META` + `getConciergeSettings` the web page and the public
 * `/api/agent/:capability` endpoint read, so this is a true mirror (Rule #1) —
 * exposure flips are live the moment they're saved. No secrets are exposed (the
 * provider tokens live in env, never returned).
 */
export async function GET(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;

  try {
    const settings = await getConciergeSettings();
    const capabilities = CAPABILITY_ORDER.map((id) => {
      const m = CAPABILITY_META[id];
      return {
        id: m.id,
        kind: m.kind,
        label: m.label,
        desc: m.desc,
        transport: m.transport,
        // Absent in the saved map = on (capabilities ship enabled).
        exposed: settings.exposure[id] !== false,
      };
    });
    const liveCount = capabilities.filter((c) => c.exposed).length;

    return apiOk({
      capabilities,
      liveCount,
      totalCount: capabilities.length,
      whatsAppConfigured: whatsAppConfigured(),
      // The two transports an agent reaches these capabilities through — surfaced
      // so the native screen can show the same wiring the web Concierge does.
      endpoints: {
        httpReadApi: "/api/agent/:capability",
        whatsAppWebhook: "/api/whatsapp/webhook",
      },
    });
  } catch (err) {
    logger.error("v1 admin concierge failed", { layer: "api.v1.admin.concierge" }, err as Error);
    return apiError("internal", "Could not load concierge settings");
  }
}
