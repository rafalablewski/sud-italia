import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { appendAuditLog, getWaSettings } from "@/lib/store";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { getWhatsAppProviderAs } from "@/lib/providers/whatsapp";

type RouteCtx = { params: Promise<{ phone: string }> };

/**
 * Operator-initiated approved-template send. Meta requires an approved
 * utility template to re-open the 24-hour messaging window after it
 * expires. Templates and their language are managed in Meta's Business
 * Suite; the platform stores the template name in WhatsApp settings.
 */
export const POST = withAdmin<RouteCtx>(
  { roles: ["manager", "owner"] },
  async (req, ctx, { user }) => {
    const { phone: raw } = await ctx.params;
    const phone = normalizePlPhoneE164(decodeURIComponent(raw));
    if (!phone) {
      return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
    }
    const body = (await req.json().catch(() => ({}))) as {
      templateName?: unknown;
      languageCode?: unknown;
    };
    const settings = await getWaSettings();
    const templateName =
      typeof body.templateName === "string" && body.templateName.trim()
        ? body.templateName.trim()
        : settings.reopenTemplate;
    if (!templateName) {
      return NextResponse.json(
        { error: "No template name configured. Set one in WhatsApp settings." },
        { status: 400 },
      );
    }
    const languageCode =
      typeof body.languageCode === "string" && /^[a-z]{2}(_[A-Z]{2})?$/.test(body.languageCode)
        ? body.languageCode
        : "pl";
    try {
      const provider = getWhatsAppProviderAs("operator");
      const result = await provider.sendTemplate(phone, templateName, languageCode);
      await appendAuditLog({
        actor: user.email || user.id,
        action: "whatsapp.template.send",
        entityType: "whatsapp_session",
        entityId: phone,
        after: { templateName, languageCode, messageId: result.id },
      });
      return NextResponse.json({ ok: true, messageId: result.id, templateName });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "send failed";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  },
);
