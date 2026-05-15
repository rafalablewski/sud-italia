import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { appendAuditLog } from "@/lib/store";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { getWhatsAppProviderAs } from "@/lib/providers/whatsapp";

type RouteCtx = { params: Promise<{ phone: string }> };

/**
 * Operator-sent free-text WhatsApp message. Only succeeds when the
 * customer is inside Meta's 24-hour messaging window (i.e. they
 * messaged within the last 24h). Outside the window, Meta will reject
 * the send — call the template route instead.
 */
export const POST = withAdmin<RouteCtx>(
  { roles: ["staff", "kitchen", "manager", "owner"] },
  async (req, ctx, { user }) => {
    const { phone: raw } = await ctx.params;
    const phone = normalizePlPhoneE164(decodeURIComponent(raw));
    if (!phone) {
      return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
    }
    const body = (await req.json().catch(() => ({}))) as { body?: unknown };
    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }
    if (text.length > 1024) {
      return NextResponse.json({ error: "body too long (max 1024)" }, { status: 400 });
    }
    try {
      const provider = getWhatsAppProviderAs("operator");
      const result = await provider.sendText(phone, text);
      await appendAuditLog({
        actor: user.email || user.id,
        action: "whatsapp.message.send",
        entityType: "whatsapp_session",
        entityId: phone,
        after: { body: text, messageId: result.id, kind: "text" },
      });
      return NextResponse.json({ ok: true, messageId: result.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "send failed";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  },
);
