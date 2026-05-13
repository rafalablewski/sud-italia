import { NextRequest, NextResponse } from "next/server";
import {
  getOrderByStripePaymentIntent,
  updateOrder,
  updateOrderStatus,
} from "@/lib/store";
import { logger } from "@/lib/logger";
import { claimWebhookEvent } from "@/lib/idempotency";
import type { DisputeStatus, OrderDispute } from "@/data/types";

/** Stripe's dispute event payload — picks just the fields we persist. */
interface StripeDispute {
  id: string;
  status: string;
  reason: string;
  amount: number;
  created: number;
  payment_intent: string | { id: string } | null;
}

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 500 }
    );
  }

  const stripe = (await import("stripe")).default;
  const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY);

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json(
      { error: "Missing signature" },
      { status: 400 }
    );
  }

  try {
    const event = stripeClient.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    // Idempotency: skip already-processed events. claimWebhookEvent INSERTs
    // into webhook_events with ON CONFLICT DO NOTHING, so Stripe retries that
    // land on a different Vercel instance can no longer double-process.
    const claimed = await claimWebhookEvent("stripe", event.id, event.type);
    if (!claimed) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const { orderId } = session.metadata ?? {};

      if (orderId && session.payment_status === "paid") {
        // Capture the Stripe correlation ids so admin refunds can target the
        // original charge later. `payment_intent` may be a string id or an
        // expanded object depending on the API version.
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id;
        await updateOrder(orderId, {
          status: "confirmed",
          paidAt: new Date().toISOString(),
          stripeSessionId: session.id,
          stripePaymentIntentId: paymentIntentId ?? undefined,
        });
      }
    }

    if (event.type === "checkout.session.expired" || event.type === "payment_intent.payment_failed") {
      const session = event.data.object;
      const metadata = "metadata" in session ? session.metadata : null;
      const orderId = metadata?.orderId;

      if (orderId) {
        // Mark order as cancelled and release the slot
        await updateOrderStatus(orderId, "cancelled");
      }
    }

    // --- Dispute / chargeback lifecycle -----------------------------------
    // Stripe sends `charge.dispute.created` the moment a customer files a
    // chargeback. Ignoring it loses the dispute by default (issuer rules);
    // surfacing it on the order detail gives the operator a fighting chance.
    if (
      event.type === "charge.dispute.created" ||
      event.type === "charge.dispute.updated" ||
      event.type === "charge.dispute.closed" ||
      event.type === "charge.dispute.funds_withdrawn" ||
      event.type === "charge.dispute.funds_reinstated"
    ) {
      const dispute = event.data.object as unknown as StripeDispute;
      const paymentIntentId =
        typeof dispute.payment_intent === "string"
          ? dispute.payment_intent
          : dispute.payment_intent?.id;

      if (paymentIntentId) {
        const order = await getOrderByStripePaymentIntent(paymentIntentId);
        if (order) {
          const now = new Date().toISOString();
          const status = dispute.status as DisputeStatus;
          const isClosed = status === "won" || status === "lost" || status === "warning_closed";
          const record: OrderDispute = {
            stripeDisputeId: dispute.id,
            status,
            reason: dispute.reason,
            amount: dispute.amount,
            createdAt: order.dispute?.createdAt
              ?? new Date(dispute.created * 1000).toISOString(),
            updatedAt: now,
            closedAt: isClosed
              ? (order.dispute?.closedAt ?? now)
              : undefined,
          };
          await updateOrder(order.id, { dispute: record });

          // Page the operator. `logger.error` mirrors to Sentry, which is the
          // right severity for "we are about to lose money."
          logger.error("Stripe dispute event", {
            route: "POST /api/webhook",
            stripeEvent: event.type,
            orderId: order.id,
            disputeId: dispute.id,
            disputeStatus: status,
            reason: dispute.reason,
            amount: dispute.amount,
          });
        } else {
          logger.warn("Dispute event for unknown order", {
            paymentIntentId,
            disputeId: dispute.id,
          });
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    logger.error("Stripe webhook verification failed", { route: "POST /api/webhook" }, err);
    return NextResponse.json(
      { error: "Webhook verification failed" },
      { status: 400 }
    );
  }
}
