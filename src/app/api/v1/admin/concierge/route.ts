import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import {
  CONCIERGE_CAPABILITY_IDS,
  getConciergeSettings,
  updateConciergeSettings,
  appendAuditLog,
  type ConciergeCapabilityId,
} from "@/lib/store";
import { CAPABILITY_META, CAPABILITY_ORDER } from "@/lib/concierge/capabilities";
import { whatsAppConfigured } from "@/lib/providers/whatsapp";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function isCapabilityId(v: unknown): v is ConciergeCapabilityId {
  return typeof v === "string" && (CONCIERGE_CAPABILITY_IDS as readonly string[]).includes(v);
}

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

/**
 * `PATCH /api/v1/admin/concierge` — flip one capability's exposure to agents.
 * Mirrors the web `PATCH /api/admin/concierge` ({ capability, exposed }). Manager+.
 * Persists immediately (toggle = saved) — the public `/api/agent/:capability`
 * endpoint reads the same store, so the change is live at once. Audited. Returns
 * the full refreshed capability list so the app can reconcile from the server.
 */
export async function PATCH(req: NextRequest) {
  const guard = requireRole(req, "manager");
  if ("error" in guard) return guard.error;

  let body: { capability?: unknown; exposed?: unknown };
  try { body = await req.json(); } catch { return apiError("bad_request", "Body must be valid JSON"); }
  if (!isCapabilityId(body.capability)) {
    return apiError("validation_failed", "Unknown capability");
  }
  if (typeof body.exposed !== "boolean") {
    return apiError("validation_failed", "exposed (boolean) is required");
  }

  try {
    const settings = await updateConciergeSettings({
      exposure: { [body.capability]: body.exposed },
    });
    await appendAuditLog({
      actor: guard.claims.name ?? guard.claims.sub,
      action: "concierge.exposure.set",
      entityType: "concierge_capability",
      entityId: body.capability,
      after: { exposed: body.exposed, channel: "ottaviano-kds-app" },
    });
    const capabilities = CAPABILITY_ORDER.map((id) => {
      const m = CAPABILITY_META[id];
      return {
        id: m.id, kind: m.kind, label: m.label, desc: m.desc, transport: m.transport,
        exposed: settings.exposure[id] !== false,
      };
    });
    return apiOk({
      capabilities,
      liveCount: capabilities.filter((c) => c.exposed).length,
      totalCount: capabilities.length,
      whatsAppConfigured: whatsAppConfigured(),
      endpoints: { httpReadApi: "/api/agent/:capability", whatsAppWebhook: "/api/whatsapp/webhook" },
    });
  } catch (err) {
    logger.error("v1 admin concierge patch failed", { layer: "api.v1.admin.concierge" }, err as Error);
    return apiError("internal", "Could not update exposure");
  }
}
