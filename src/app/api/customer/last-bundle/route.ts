import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { getBundleEvents } from "@/lib/store";

/**
 * Returns the customer's most-recent composition for a given bundle so
 * the cart-side composer can pre-fill picks (Sprint 8 #8 — Domino's
 * "Same as last time" pattern). No auth: keyed on phone, returns only
 * the customer's own data. Rate-limit middleware applies in production.
 */
const querySchema = z.object({
  phone: z.string().min(7).max(20),
  bundleId: z.string().min(1).max(80),
  locationSlug: z.string().min(1).max(40),
});

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    phone: url.searchParams.get("phone"),
    bundleId: url.searchParams.get("bundleId"),
    locationSlug: url.searchParams.get("locationSlug"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }
  const phoneE164 = normalizePlPhoneE164(parsed.data.phone);
  if (!phoneE164) {
    return NextResponse.json({ error: "Invalid Polish phone number" }, { status: 400 });
  }
  // Most-recent first; return only this customer's events for this
  // bundle at this location.
  const events = await getBundleEvents({ locationSlug: parsed.data.locationSlug });
  const mine = events
    .filter((e) => e.customerPhone === phoneE164 && e.bundleId === parsed.data.bundleId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const last = mine[0];
  if (!last) {
    return NextResponse.json({ composition: null });
  }
  return NextResponse.json({
    composition: last.addOnComposition ?? null,
    appliedAt: last.createdAt,
  });
}
