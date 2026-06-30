import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { appendAuditLog } from "@/lib/store";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { getWhatsAppProviderAs } from "@/lib/providers/whatsapp";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/admin/whatsapp/:phone/message` — operator-sent free-text reply
 * (mirrors web `/api/admin/whatsapp/sessions/[phone]/message`). Staff+. Only
 * succeeds inside Meta's 24-hour messaging window; outside it the provider
 * rejects the send and we surface the reason honestly (Rule #1) rather than
 * faking a delivery. Audited like the web path.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ phone: string }> }) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;

  const { phone: raw } = await ctx.params;
  const phone = normalizePlPhoneE164(decodeURIComponent(raw));
  if (!phone) return apiError("validation_failed", "Invalid phone");

  let body: { body?: unknown };
  try { body = await req.json(); } catch { return apiError("bad_request", "Body must be valid JSON"); }
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return apiError("validation_failed", "body is required");
  if (text.length > 1024) return apiError("validation_failed", "body too long (max 1024)");

  try {
    const provider = getWhatsAppProviderAs("operator");
    const result = await provider.sendText(phone, text);
    await appendAuditLog({
      actor: guard.claims.name ?? guard.claims.sub,
      action: "whatsapp.message.send",
      entityType: "whatsapp_session",
      entityId: phone,
      after: { body: text, messageId: result.id, kind: "text" },
    });
    return apiOk({ ok: true, messageId: result.id }, undefined, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "send failed";
    logger.warn("v1 admin whatsapp send failed", { layer: "api.v1.admin.whatsapp" }, err);
    // 503: the channel itself couldn't deliver (provider unconfigured or outside
    // the 24h window) — distinct from a 4xx caller error.
    return apiError("service_unavailable", msg);
  }
}
