import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { generateOrderId } from "@/lib/utils";
import { getMenuWithOverrides } from "@/data/menus";
import { getSlotById, incrementSlotOrders, createOrder, addNotification, getUpsellSettings } from "@/lib/store";
import { FulfillmentType, CartItem } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import { getActiveComboDeals } from "@/lib/upsell";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { logger } from "@/lib/logger";
import {
  cacheCheckout,
  computeCheckoutHash,
  getCachedCheckout,
} from "@/lib/idempotency";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import { checkoutBodySchema, parseBody } from "@/lib/api-schemas";

export async function POST(req: NextRequest) {
  // Public endpoint — rate-limited by client IP. 10 attempts per minute is
  // generous enough for a slow checkout retry but blocks card-stuffing /
  // session-flooding abuse.
  const rl = await enforceRateLimit({
    key: "checkout",
    id: getClientIp(req),
    limit: 10,
    windowSec: 60,
  });
  if (rl) return rl;

  try {
    // Shape validation handled by the schema — required fields, enum
    // values, integer cart quantities, delivery-address-required-when-
    // delivery refinement, etc. The handler keeps the PL E.164 normalization
    // step because phone format is a PL-specific business rule, not a
    // schema-level concern.
    const parsed = await parseBody(req, checkoutBodySchema);
    if ("error" in parsed) return parsed.error;
    const {
      items,
      locationSlug,
      customerName,
      customerPhone,
      fulfillmentType,
      slotId,
      slotDate,
      slotTime,
      deliveryAddress,
      tipAmount: rawTip,
    } = parsed.data;

    const phoneE164 = normalizePlPhoneE164(customerPhone);
    if (!phoneE164) {
      return NextResponse.json(
        { error: "Invalid Polish phone number" },
        { status: 400 },
      );
    }

    // Idempotency: when the client sends an Idempotency-Key header (typically
    // generated once per checkout attempt and reused across retries), we hash
    // it together with the payload that defines "same checkout". A cache hit
    // returns the original Stripe session URL + orderId, so a double-clicked
    // submit or a flaky-network retry can't oversell the slot or create a
    // duplicate Stripe charge.
    const idempotencyKey = req.headers.get("idempotency-key")?.trim() || null;
    let idempotencyHash: string | null = null;
    if (idempotencyKey) {
      const cartFingerprint = JSON.stringify(
        (items as { id: string; quantity: number; notes?: string }[])
          .map((it) => ({ id: it.id, quantity: it.quantity, notes: it.notes ?? "" }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      );
      const cartHash = createHash("sha256").update(cartFingerprint).digest("hex");
      idempotencyHash = computeCheckoutHash(
        idempotencyKey,
        locationSlug,
        slotId,
        cartHash,
      );
      const cached = await getCachedCheckout(idempotencyHash);
      if (cached) {
        return NextResponse.json({
          url: cached.stripeSessionUrl || undefined,
          orderId: cached.orderId,
          duplicate: true,
        });
      }
    }

    // Validate slot exists and has capacity
    const slot = await getSlotById(slotId);
    if (!slot) {
      return NextResponse.json(
        { error: "Time slot not found" },
        { status: 400 }
      );
    }

    if (slot.currentOrders >= slot.maxOrders) {
      return NextResponse.json(
        { error: "This time slot is full. Please select another." },
        { status: 400 }
      );
    }

    if (!slot.fulfillmentTypes.includes(fulfillmentType as FulfillmentType)) {
      return NextResponse.json(
        { error: `This slot does not support ${fulfillmentType}` },
        { status: 400 }
      );
    }

    // Server-side price lookup — never trust client-provided prices
    const menuItems = await getMenuWithOverrides(locationSlug);
    const menuItemsById = new Map(menuItems.map((item) => [item.id, item]));

    let calculatedTotal = 0;
    const verifiedItems: { id: string; name: string; price: number; quantity: number; notes?: string }[] = [];
    const orderItems: CartItem[] = [];

    const NOTE_MAX_LEN = 140;

    for (const item of items) {
      const menuItem = menuItemsById.get(item.id);
      if (!menuItem || !menuItem.available) {
        return NextResponse.json(
          { error: `Item "${item.id}" is not available` },
          { status: 400 }
        );
      }
      if (!item.quantity || item.quantity < 1 || !Number.isInteger(item.quantity)) {
        return NextResponse.json(
          { error: `Invalid quantity for "${menuItem.name}"` },
          { status: 400 }
        );
      }
      // Per-line note is optional, trimmed, length-bounded, and never trusted
      // for price calculation — it's purely a kitchen-facing string.
      let notes: string | undefined;
      if (typeof item.notes === "string") {
        const trimmed = item.notes.trim();
        if (trimmed.length > 0) notes = trimmed.slice(0, NOTE_MAX_LEN);
      }
      calculatedTotal += menuItem.price * item.quantity;
      verifiedItems.push({
        id: menuItem.id,
        name: menuItem.name,
        price: menuItem.price,
        quantity: item.quantity,
        notes,
      });
      orderItems.push({
        menuItem,
        quantity: item.quantity,
        locationSlug,
        notes,
      });
    }

    // Server-side combo discount validation
    const upsellSettings = await getUpsellSettings();
    const locationConfig = upsellSettings[locationSlug] || null;
    const comboResult = getActiveComboDeals(orderItems, locationConfig);
    const comboDiscount = comboResult.missingCategories.length === 0 ? comboResult.savings : 0;
    calculatedTotal = calculatedTotal - comboDiscount;

    // Tip: optional integer grosze. Bound at the cart subtotal so a malicious
    // client can't sneak through a 99% tip and then claim chargeback fraud.
    let tipAmount = 0;
    if (typeof rawTip === "number" && Number.isInteger(rawTip) && rawTip > 0) {
      tipAmount = Math.min(rawTip, calculatedTotal);
      calculatedTotal += tipAmount;
    }

    const orderId = generateOrderId();

    // Reserve the slot (atomic with file lock)
    if (!(await incrementSlotOrders(slotId))) {
      return NextResponse.json(
        { error: "This time slot just filled up. Please select another." },
        { status: 400 }
      );
    }

    // Create order record
    await createOrder({
      id: orderId,
      locationSlug,
      items: orderItems,
      totalAmount: calculatedTotal,
      status: "pending",
      customerName: customerName.trim(),
      customerPhone: phoneE164,
      fulfillmentType: fulfillmentType as FulfillmentType,
      // The schema's refine guarantees deliveryAddress is present when
      // fulfillmentType === "delivery" — the `?? ""` is just to satisfy
      // TS narrowing through the refine, never the actual fallback.
      deliveryAddress: fulfillmentType === "delivery" ? (deliveryAddress ?? "").trim() : undefined,
      slotId,
      slotDate,
      slotTime,
      tipAmount: tipAmount > 0 ? tipAmount : undefined,
      createdAt: new Date().toISOString(),
    });

    // Notify admin
    await addNotification({
      type: "new_order",
      title: "New order received",
      message: `${customerName.trim()} — ${formatPrice(calculatedTotal)} — ${fulfillmentType} at ${slotTime} · ${orderId}`,
      locationSlug,
      orderId,
    });

    // Check if slot is now full and notify
    const updatedSlot = await getSlotById(slotId);
    if (updatedSlot && updatedSlot.currentOrders >= updatedSlot.maxOrders) {
      await addNotification({
        type: "slot_full",
        title: "Time slot full",
        message: `${slotDate} ${slotTime} slot is now fully booked (${updatedSlot.maxOrders} orders)`,
        locationSlug,
      });
    }

    // If Stripe is configured, create a checkout session
    if (process.env.STRIPE_SECRET_KEY) {
      const stripe = (await import("stripe")).default;
      const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY);

      const session = await stripeClient.checkout.sessions.create(
        {
          // BLIK: Add "blik" to payment_method_types when Stripe BLIK is enabled
          // Requires: Stripe account with BLIK capability enabled for PLN
          // See: https://docs.stripe.com/payments/blik
          payment_method_types: ["card", "p24", "blik"],
          line_items: [
            ...verifiedItems.map((item) => ({
              price_data: {
                currency: "pln",
                product_data: {
                  name: item.name,
                  ...(item.notes ? { description: item.notes } : {}),
                },
                unit_amount: item.price,
              },
              quantity: item.quantity,
            })),
            // Tip as a separate line item so the customer's receipt reads
            // "Items 28 zł · Tip 3 zł · Total 31 zł" cleanly.
            ...(tipAmount > 0
              ? [
                  {
                    price_data: {
                      currency: "pln",
                      product_data: { name: "Tip / Napiwek" },
                      unit_amount: tipAmount,
                    },
                    quantity: 1,
                  },
                ]
              : []),
          ],
          mode: "payment",
          success_url: `${process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin}/order-confirmation?orderId=${orderId}&location=${locationSlug}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin}/locations/${locationSlug}`,
          metadata: {
            orderId,
            locationSlug,
            customerName,
            customerPhone: phoneE164,
            fulfillmentType,
            slotId,
            slotTime,
            slotDate,
          },
        },
        // Belt + suspenders: Stripe's own idempotency on session.create. If two
        // identical retries somehow slip past our DB check (e.g. arriving on
        // different lambdas within the same millisecond), Stripe returns the
        // same session for the same key for 24 hours.
        idempotencyHash ? { idempotencyKey: idempotencyHash } : undefined,
      );

      if (idempotencyHash && session.url) {
        await cacheCheckout({
          idempotencyHash,
          stripeSessionId: session.id,
          stripeSessionUrl: session.url,
          orderId,
          locationSlug,
        });
      }

      const stripeResponse = NextResponse.json({ url: session.url, orderId });
      stripeResponse.cookies.set("sud-italia-customer", phoneE164, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
      });
      return stripeResponse;
    }

    // Fallback: no Stripe configured — return order ID directly (demo mode)
    const response = NextResponse.json({
      orderId,
      total: calculatedTotal,
      message: "Order placed successfully (demo mode — no payment configured)",
    });

    // Set cookie so we recognize this customer on next visit (no login needed)
    response.cookies.set("sud-italia-customer", phoneE164, {
      httpOnly: false, // needs to be readable client-side for reorder
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: "/",
    });

    return response;
  } catch (error) {
    logger.error("Checkout request failed", { route: "POST /api/checkout" }, error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
