import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { appendAuditLog, clearWaSession } from "@/lib/store";
import { normalizePlPhoneE164 } from "@/lib/phone";

type RouteCtx = { params: Promise<{ phone: string }> };

export const POST = withAdmin<RouteCtx>(
  { roles: ["manager", "owner"] },
  async (_req, ctx, { user }) => {
    const { phone: raw } = await ctx.params;
    const phone = normalizePlPhoneE164(decodeURIComponent(raw));
    if (!phone) {
      return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
    }
    await clearWaSession(phone);
    await appendAuditLog({
      actor: user.email || user.id,
      action: "whatsapp.session.reset",
      entityType: "whatsapp_session",
      entityId: phone,
    });
    return NextResponse.json({ ok: true });
  },
);
