import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  appendAuditLog,
  getPaymentSettings,
  updatePaymentSettings,
  type PaymentSettings,
} from "@/lib/store";

// Read the storefront/QR payment-method configuration. Manager+; no
// secrets are stored here (Stripe keys live in env), so this is safe to
// read for any back-office operator.
export const GET = withAdmin({ roles: ["manager"] }, async () => {
  const settings = await getPaymentSettings();
  // The processor (Stripe) is configured via env, not the settings blob —
  // surface its readiness so the admin can show a live/needs-config chip.
  return NextResponse.json({ ...settings, stripeConfigured: !!process.env.STRIPE_SECRET_KEY });
});

// Toggle methods / set the Bitcoin receiving address. Manager+. The store
// layer sanitises + merges over the canonical method set.
export const PUT = withAdmin({ roles: ["manager"] }, async (req: NextRequest, _ctx, { user }) => {
  let body: Partial<PaymentSettings>;
  try {
    body = (await req.json()) as Partial<PaymentSettings>;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const before = await getPaymentSettings();
  const settings = await updatePaymentSettings(body);
  await appendAuditLog({
    actor: user.email || user.id,
    action: "payments.update",
    entityType: "payment_settings",
    before,
    after: settings,
  });
  return NextResponse.json(settings);
});
