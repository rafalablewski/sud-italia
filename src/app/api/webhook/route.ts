import { NextRequest, NextResponse } from "next/server";
import { updateOrder, updateOrderStatus } from "@/lib/store";
import { logger } from "@/lib/logger";

const processedEvents = new Set<string>();

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

    // Idempotency: skip already-processed events
    if (processedEvents.has(event.id)) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    processedEvents.add(event.id);

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

    return NextResponse.json({ received: true });
  } catch (err) {
    logger.error("Stripe webhook verification failed", { route: "POST /api/webhook" }, err);
    return NextResponse.json(
      { error: "Webhook verification failed" },
      { status: 400 }
    );
  }
}
