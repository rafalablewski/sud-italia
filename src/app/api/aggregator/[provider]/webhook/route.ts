import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { claimWebhookEvent } from "@/lib/idempotency";
import {
  aggregatorsEnabled,
  AggregatorNotConfigured,
  getAggregatorProvider,
  type AggregatorName,
} from "@/lib/providers/aggregator";
import { createOrder } from "@/lib/store";
import type { Order } from "@/data/types";

/**
 * Aggregator webhook entry point (m2_22). One route handles both Wolt
 * and Glovo via the dynamic [provider] segment — they share the shape
 * (signed POST → mapped Order → inserted) so this stays DRY.
 *
 * Hardening:
 *   1. ENABLE_AGGREGATORS flag must be true (m2_21) — feature gate.
 *   2. Verify HMAC signature via provider.verifyWebhookSignature.
 *      The shared secret comes from {WOLT,GLOVO}_WEBHOOK_SECRET env.
 *   3. Idempotency via webhook_events table (m0_3). Repeat deliveries
 *      from the aggregator collide on (provider, eventId) and return
 *      200 {duplicate:true}.
 *   4. Insertion via createOrder — gets the same KDS routing (m2_2),
 *      slot increment (m1_1), outbox events (m1_13) as direct orders.
 *      Aggregator-sourced orders are tagged via payload.source so the
 *      KDS UI can show "Wolt" / "Glovo" badges.
 */

const PROVIDERS = new Set<AggregatorName>(["wolt", "glovo"]);

function isProviderName(value: string): value is AggregatorName {
  return PROVIDERS.has(value as AggregatorName);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ provider: string }> },
): Promise<Response> {
  if (!aggregatorsEnabled()) {
    return NextResponse.json(
      { error: "Aggregator integrations are disabled (ENABLE_AGGREGATORS != true)" },
      { status: 503 },
    );
  }

  const { provider } = await ctx.params;
  if (!isProviderName(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }

  let providerImpl;
  try {
    providerImpl = getAggregatorProvider(provider);
  } catch (err) {
    if (err instanceof AggregatorNotConfigured) {
      logger.warn("aggregator.webhook.not_configured", {
        provider,
        message: err.message,
        layer: "aggregator.webhook",
      });
      return NextResponse.json(
        { error: err.message },
        { status: 503 },
      );
    }
    throw err;
  }
  const rawBody = await req.text();

  if (!providerImpl.verifyWebhookSignature(req.headers, rawBody)) {
    logger.warn("aggregator.webhook.bad_signature", {
      provider,
      layer: "aggregator.webhook",
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Pluck the event id for idempotency. Real providers wrap orders in
  // event envelopes; the mock provider just passes our shape through.
  const eventId =
    (payload as { eventId?: string; id?: string; orderId?: string }).eventId ??
    (payload as { id?: string }).id ??
    (payload as { orderId?: string }).orderId ??
    crypto.randomUUID();

  const claimed = await claimWebhookEvent(provider, eventId, "aggregator.order");
  if (!claimed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  let ingested;
  try {
    ingested = await providerImpl.ingestOrder(payload);
  } catch (err) {
    logger.error(
      "aggregator.webhook.ingest_failed",
      { provider, eventId, layer: "aggregator.webhook" },
      err,
    );
    return NextResponse.json({ error: "Ingest failed" }, { status: 400 });
  }

  // Tag the order with its origin so KDS UI + reports can distinguish.
  // We piggyback on the existing payload.specialInstructions until a
  // dedicated `source` column lands in Phase 3.
  const order: Order = {
    id: ingested.id,
    locationSlug: ingested.locationSlug,
    items: ingested.items,
    totalAmount: ingested.totalAmount,
    status: "confirmed", // aggregator orders are already paid
    customerName: ingested.customerName,
    customerPhone: ingested.customerPhone,
    fulfillmentType: ingested.fulfillmentType,
    deliveryAddress: ingested.deliveryAddress,
    slotId: `agg-${ingested.source}-${ingested.id}`,
    slotDate: new Date().toISOString().slice(0, 10),
    slotTime: new Date().toISOString().slice(11, 16),
    createdAt: new Date().toISOString(),
    paidAt: new Date().toISOString(),
    specialInstructions: `[source=${ingested.source} external=${ingested.externalOrderId}]`,
  };

  await createOrder(order);
  return NextResponse.json({ received: true, orderId: order.id });
}
