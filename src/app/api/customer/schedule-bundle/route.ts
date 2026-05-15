import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { appendScheduledBundleIntent, type Weekday } from "@/lib/store";
import { generateOrderId } from "@/lib/utils";

const bodySchema = z.object({
  customerPhone: z.string().min(7).max(20),
  locationSlug: z.string().min(1).max(40),
  bundleId: z.string().min(1).max(80),
  bundleName: z.string().min(1).max(120),
  weekday: z.enum([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ]),
  readyAt: z.string().regex(/^\d{2}:\d{2}$/),
  cartSnapshot: z
    .array(z.object({ menuItemId: z.string().min(1).max(80), quantity: z.number().int().positive().max(50) }))
    .min(1)
    .max(50),
});

/**
 * Customer-facing schedule-bundle intent capture (Sprint 4 #17). Pret-
 * style "make this my weekly usual" — persists the intent and lets the
 * operator review/approve. Stripe Subscription wiring lives in a Phase 2
 * follow-up (the intent is the prerequisite anyway). No auth: this is
 * a public endpoint gated by phone-normalization + rate-limit middleware
 * in production. Idempotent at the API level via dedupe of the latest
 * pending intent per (phone, bundle, weekday) — Phase 2 enforces.
 */
export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid intent payload" }, { status: 400 });
  }
  const phoneE164 = normalizePlPhoneE164(parsed.data.customerPhone);
  if (!phoneE164) {
    return NextResponse.json({ error: "Invalid Polish phone number" }, { status: 400 });
  }
  const now = new Date().toISOString();
  await appendScheduledBundleIntent({
    id: `sbi_${generateOrderId()}`,
    customerPhone: phoneE164,
    locationSlug: parsed.data.locationSlug,
    bundleId: parsed.data.bundleId,
    bundleName: parsed.data.bundleName,
    weekday: parsed.data.weekday as Weekday,
    readyAt: parsed.data.readyAt,
    cartSnapshot: parsed.data.cartSnapshot,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });
  return NextResponse.json({ ok: true });
}
