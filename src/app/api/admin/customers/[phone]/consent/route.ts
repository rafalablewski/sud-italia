import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { setCustomerConsent } from "@/lib/store";
import { normalizePlPhoneE164 } from "@/lib/phone";

// Toggle a customer's marketing consent from the CRM. Persists immediately
// (toggle = saved) — staff+ can record an opt-in/out captured at the counter.
export const PATCH = withAdmin<{ params: Promise<{ phone: string }> }>(
  { roles: ["staff", "manager", "owner"] },
  async (req, ctx) => {
    const { phone: raw } = await ctx.params;
    const phone = normalizePlPhoneE164(decodeURIComponent(raw)) ?? decodeURIComponent(raw);
    const body = (await req.json().catch(() => ({}))) as {
      smsOptIn?: boolean;
      emailOptIn?: boolean;
    };
    const consent: { smsOptout?: boolean; emailOptout?: boolean } = {};
    if (typeof body.smsOptIn === "boolean") consent.smsOptout = !body.smsOptIn;
    if (typeof body.emailOptIn === "boolean") consent.emailOptout = !body.emailOptIn;
    if (Object.keys(consent).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    const updated = await setCustomerConsent(phone, consent);
    return NextResponse.json({
      phone,
      smsOptIn: !(updated?.smsOptout ?? false),
      emailOptIn: !(updated?.emailOptout ?? false),
      success: true,
    });
  },
);
