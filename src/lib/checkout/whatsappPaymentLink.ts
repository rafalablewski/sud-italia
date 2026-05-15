import type { Order } from "@/data/types";

/**
 * Creates a single-use Stripe Checkout Session for a WhatsApp-channel
 * order. We use a Checkout Session (not a Payment Link) because
 * sessions are single-use and expire — no risk of the customer
 * accidentally double-paying when they share the chat. The session
 * URL is what we surface in the WhatsApp CTA button.
 *
 * `metadata.channel = "whatsapp"` is the signal the existing Stripe
 * webhook handler uses to route the post-payment confirmation back
 * through WhatsApp instead of (or in addition to) email/SMS.
 */
export async function createWhatsAppPaymentSession(
  order: Order,
): Promise<{ url: string; sessionId: string } | null> {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") || "";
  const stripe = (await import("stripe")).default;
  const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY);

  // 30-minute expiry — the customer is in an active chat, they'll tap
  // within minutes or abandon. Long expiries just keep slot reservations
  // hostage.
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 60;

  const session = await stripeClient.checkout.sessions.create({
    payment_method_types: ["card", "p24", "blik"],
    mode: "payment",
    expires_at: expiresAt,
    line_items: [
      ...order.items.map((i) => ({
        price_data: {
          currency: "pln",
          product_data: {
            name: i.menuItem.name,
            ...(i.notes ? { description: i.notes } : {}),
          },
          unit_amount: i.menuItem.price,
        },
        quantity: i.quantity,
      })),
      ...(order.deliveryFee && order.deliveryFee > 0
        ? [
            {
              price_data: {
                currency: "pln",
                product_data: { name: "Delivery / Dostawa" },
                unit_amount: order.deliveryFee,
              },
              quantity: 1,
            },
          ]
        : []),
      ...(order.tipAmount && order.tipAmount > 0
        ? [
            {
              price_data: {
                currency: "pln",
                product_data: { name: "Tip / Napiwek" },
                unit_amount: order.tipAmount,
              },
              quantity: 1,
            },
          ]
        : []),
    ],
    success_url: baseUrl
      ? `${baseUrl}/order-confirmation?orderId=${order.id}&location=${order.locationSlug}&session_id={CHECKOUT_SESSION_ID}`
      : `https://example.com/order/${order.id}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: baseUrl
      ? `${baseUrl}/locations/${order.locationSlug}`
      : `https://example.com/locations/${order.locationSlug}`,
    metadata: {
      orderId: order.id,
      locationSlug: order.locationSlug,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      fulfillmentType: order.fulfillmentType,
      slotId: order.slotId,
      slotTime: order.slotTime,
      slotDate: order.slotDate,
      channel: "whatsapp",
    },
  });

  if (!session.url) return null;
  return { url: session.url, sessionId: session.id };
}
