import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { appendBundleFunnelEvent } from "@/lib/store";
import { normalizePlPhoneE164 } from "@/lib/phone";

/**
 * Client beacon for bundle funnel events (Sprint 7 #5). Browser sends
 * impressions / composer-opens / composer-abandons via `navigator
 * .sendBeacon` so the events don't gate UI; this endpoint just appends
 * to the log. Combined with the applied events written by
 * createOrderFromCart, BundleAnalyticsCard surfaces the full funnel.
 *
 * No auth: public endpoint gated by rate-limit. Worst case a malicious
 * actor inflates impression counts; doesn't move money. Phone is
 * normalized but optional — anonymous browsing still feeds the funnel.
 */
const bodySchema = z.object({
  kind: z.enum(["impression", "composer_opened", "composer_abandoned"]),
  bundleId: z.string().min(1).max(80),
  locationSlug: z.string().min(1).max(40),
  customerPhone: z.string().min(7).max(20).optional(),
  experimentVariant: z.string().max(32).optional(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }
  const phone = parsed.data.customerPhone
    ? normalizePlPhoneE164(parsed.data.customerPhone) ?? undefined
    : undefined;
  await appendBundleFunnelEvent({
    id: `bf_${Math.random().toString(36).slice(2, 12)}`,
    kind: parsed.data.kind,
    bundleId: parsed.data.bundleId,
    locationSlug: parsed.data.locationSlug,
    customerPhone: phone,
    experimentVariant: parsed.data.experimentVariant,
    createdAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true });
}
