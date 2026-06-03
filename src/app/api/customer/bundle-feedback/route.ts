import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  appendBundleFeedback,
  getBundleEventByOrderId,
  getBundleFeedback,
} from "@/lib/store";

/**
 * Voice-of-customer feedback on a bundle order (audit elite-qsr §2).
 *
 * GET  ?orderId=…  → was this a bundle order, which bundle, and has the
 *                    customer already rated it? Drives whether the
 *                    post-order prompt renders + its initial state.
 * POST { orderId, rating } → record a thumbs up/down. The bundle id /
 *                    name / location are resolved server-side from the
 *                    order's BundleEvent so the client can't spoof them,
 *                    and non-bundle orders are rejected.
 *
 * Public endpoint (customer-facing), rate-limited by the shared public
 * middleware. Worst case an actor rates a bundle order they didn't place;
 * it moves no money and the upsert keeps one rating per order.
 */

const postSchema = z.object({
  orderId: z.string().min(1).max(80),
  rating: z.enum(["up", "down"]),
});

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("orderId");
  if (!orderId) {
    return NextResponse.json({ error: "missing_orderId" }, { status: 400 });
  }
  const event = await getBundleEventByOrderId(orderId);
  if (!event) {
    return NextResponse.json({ isBundle: false });
  }
  const existing = (await getBundleFeedback()).find((f) => f.orderId === orderId);
  return NextResponse.json({
    isBundle: true,
    bundleId: event.bundleId,
    bundleName: event.bundleName,
    existing: existing?.rating ?? null,
  });
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  // Resolve the bundle from the order so id/name/location are trustworthy
  // and non-bundle orders can't be rated.
  const event = await getBundleEventByOrderId(parsed.data.orderId);
  if (!event) {
    return NextResponse.json({ error: "not_a_bundle_order" }, { status: 404 });
  }
  await appendBundleFeedback({
    id: `bfb_${Math.random().toString(36).slice(2, 12)}`,
    orderId: parsed.data.orderId,
    bundleId: event.bundleId,
    bundleName: event.bundleName,
    locationSlug: event.locationSlug,
    rating: parsed.data.rating,
    createdAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true, rating: parsed.data.rating });
}
