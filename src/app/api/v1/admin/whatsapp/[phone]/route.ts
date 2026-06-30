import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { getWaTranscript } from "@/lib/store";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/admin/whatsapp/:phone` — the transcript thread for one guest
 * (mirrors web `/api/admin/whatsapp/transcripts/[phone]`). Staff+; newest-last so
 * the native thread renders top-to-bottom like a chat. Phones arrive as digits
 * (path-encoded `+`); the server re-canonicalizes to E.164.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ phone: string }> }) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;

  const { phone: raw } = await ctx.params;
  const phone = normalizePlPhoneE164(decodeURIComponent(raw));
  if (!phone) return apiError("validation_failed", "Invalid phone");

  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = Math.max(1, Math.min(500, Number.parseInt(limitParam ?? "100", 10) || 100));
  try {
    const messages = await getWaTranscript(phone, limit);
    return apiOk({ phone, messages }, { count: messages.length });
  } catch (err) {
    logger.error("v1 admin whatsapp transcript failed", { layer: "api.v1.admin.whatsapp" }, err as Error);
    return apiError("internal", "Could not load the thread");
  }
}
