import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api/v1/envelope";
import { authenticateBearer } from "@/lib/api/v1/auth";
import type { PaymentIntentDTO } from "@/lib/api/v1/schemas";
import { getOrderById } from "@/lib/store";
import { phonesEqualPl } from "@/lib/phone";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/orders/:id/payment-intent` — start payment for an order.
 *
 * Native pays via the Stripe iOS SDK PaymentSheet (which renders Apple Pay +
 * cards natively) using the returned `clientSecret`. We create a Stripe
 * PaymentIntent for the order's authoritative total — the client never names the
 * amount. `automatic_payment_methods` lets PaymentSheet surface Apple Pay and
 * every method enabled in the Stripe dashboard. The PaymentIntent's metadata
 * carries the order id; the webhook (`payment_intent.succeeded`) marks the order
 * paid. Idempotent: Stripe keys creation on the order id, so retries return the
 * same intent rather than a second charge.
 *
 * Ownership: when a customer token is present it must own the order; otherwise
 * the (hard-to-guess) order id is the gate, matching the web checkout's model.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return apiError("service_unavailable", "Payments are not configured");
  }

  const rl = await rateLimit({ key: "v1-pay", id: getClientIp(req), limit: 20, windowSec: 60 });
  if (!rl.allowed) return apiError("rate_limited", "Too many payment attempts");

  const { id } = await ctx.params;
  const order = await getOrderById(id);
  if (!order) return apiError("not_found", "Order not found");

  // If a customer token is presented, it must own this order.
  const claims = authenticateBearer(req);
  if (claims && claims.aud === "ottaviano" && claims.role === "customer") {
    if (!phonesEqualPl(order.customerPhone, claims.sub)) {
      return apiError("not_found", "Order not found");
    }
  }

  if (order.paidAt) return apiError("conflict", "Order is already paid");
  if (order.status === "cancelled") return apiError("conflict", "Order was cancelled");

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  if (!publishableKey) {
    return apiError("service_unavailable", "Stripe publishable key is not configured");
  }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const intent = await stripe.paymentIntents.create(
      {
        amount: order.totalAmount, // grosze — server-authoritative
        currency: "pln",
        automatic_payment_methods: { enabled: true },
        metadata: {
          orderId: order.id,
          locationSlug: order.locationSlug,
          customerPhone: order.customerPhone,
        },
      },
      // One PaymentIntent per order — retries collide instead of double-charging.
      { idempotencyKey: `v1-pi-${order.id}` },
    );

    if (!intent.client_secret) {
      return apiError("internal", "Could not initialize payment");
    }
    const body: PaymentIntentDTO = {
      clientSecret: intent.client_secret,
      publishableKey,
      amount: order.totalAmount,
      currency: "pln",
      orderId: order.id,
    };
    return apiOk(body);
  } catch (err) {
    logger.error("v1 payment-intent failed", { layer: "api.v1.payment", id }, err as Error);
    return apiError("internal", "Could not initialize payment");
  }
}
