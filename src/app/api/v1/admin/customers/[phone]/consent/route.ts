import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { requireRole } from "@/lib/api/v1/guard";
import { setCustomerConsent } from "@/lib/store";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `PATCH /api/v1/admin/customers/:phone/consent` — toggle marketing consent.
 * Body `{ smsOptIn?, emailOptIn? }` (opt-IN booleans; stored as opt-OUT). Staff+.
 * Mirrors web `/api/admin/customers/[phone]/consent`.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ phone: string }> }) {
  const guard = requireRole(req, "staff");
  if ("error" in guard) return guard.error;
  const { phone: raw } = await ctx.params;
  const canonical = normalizePlPhoneE164(decodeURIComponent(raw)) ?? decodeURIComponent(raw);

  let body: { smsOptIn?: boolean; emailOptIn?: boolean };
  try { body = await req.json(); } catch { return apiError("bad_request", "Body must be valid JSON"); }

  const consent: { smsOptout?: boolean; emailOptout?: boolean } = {};
  if (typeof body.smsOptIn === "boolean") consent.smsOptout = !body.smsOptIn;
  if (typeof body.emailOptIn === "boolean") consent.emailOptout = !body.emailOptIn;
  if (consent.smsOptout === undefined && consent.emailOptout === undefined) {
    return apiError("validation_failed", "Provide smsOptIn and/or emailOptIn");
  }

  try {
    const updated = await setCustomerConsent(canonical, consent);
    if (!updated) return apiError("not_found", "Unknown customer");
    return apiOk({ phone: canonical, smsOptIn: !updated.smsOptout, emailOptIn: !updated.emailOptout });
  } catch (err) {
    logger.error("v1 customer consent failed", { layer: "api.v1.admin.customers.consent" }, err as Error);
    return apiError("internal", "Could not update consent");
  }
}
