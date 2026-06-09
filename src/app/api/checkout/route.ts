import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getMenuWithOverrides } from "@/data/menus";
import { getEnabledStripeMethods, getUpsellSettings } from "@/lib/store";
import { findBundle, computeBundlePrice, type BundleTier } from "@/lib/bundles";
import { normalizePlPhoneE164 } from "@/lib/phone";
import { logger } from "@/lib/logger";
import {
  cacheCheckout,
  computeCheckoutHash,
  getCachedCheckout,
} from "@/lib/idempotency";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import { checkoutBodySchema, parseBody } from "@/lib/api-schemas";
import { incrCounter, recordHistogram } from "@/lib/metrics";
import { createOrderFromCart } from "@/lib/checkout/createOrder";
import { effectiveUnitPrice } from "@/lib/upsell";

export async function POST(req: NextRequest) {
  const checkoutStart = Date.now();
  // Public endpoint — rate-limited by client IP. 10 attempts per minute is
  // generous enough for a slow checkout retry but blocks card-stuffing /
  // session-flooding abuse.
  const rl = await enforceRateLimit({
    key: "checkout",
    id: getClientIp(req),
    limit: 10,
    windowSec: 60,
  });
  if (rl) {
    incrCounter("checkout.rate_limited");
    return rl;
  }

  try {
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
      partySize,
      tipAmount: rawTip,
      appliedBundleId,
      appliedBundlePriceGrosze,
      referralCode,
      channel: rawChannel,
      tableNumber,
    } = parsed.data;
    // QR table ordering: an immediate, already-seated dine-in order with no
    // slot booking. Everything else is the slot-booked web flow.
    const isQr = rawChannel === "qr";
    const effFulfillment = isQr ? "dine-in" : fulfillmentType;

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
        // QR walk-ins carry no slot — fold the table into the dedup key instead.
        slotId ?? (isQr ? `qr:${tableNumber ?? ""}` : ""),
        cartHash,
      );
      const cached = await getCachedCheckout(idempotencyHash);
      if (cached) {
        incrCounter("checkout.idempotent_hit");
        recordHistogram("checkout.latency_ms", Date.now() - checkoutStart);
        return NextResponse.json({
          url: cached.stripeSessionUrl || undefined,
          orderId: cached.orderId,
          duplicate: true,
        });
      }
    }

    const result = await createOrderFromCart({
      items,
      locationSlug,
      customerName,
      customerPhone,
      fulfillmentType: effFulfillment,
      slotId,
      slotDate,
      slotTime,
      immediate: isQr,
      tableNumber: isQr ? tableNumber : undefined,
      deliveryAddress,
      partySize,
      tipAmount: typeof rawTip === "number" ? rawTip : undefined,
      appliedBundleId,
      appliedBundlePriceGrosze,
      referralCode,
      channel: isQr ? "qr" : "web",
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    const { order, deliveryFee, bundleSubtotal, comboDiscount, comboName, referralDiscount } = result;
    const tipAmount = order.tipAmount ?? 0;
    const calculatedTotal = order.totalAmount;

    // Stripe line items mirror the order. Re-resolve the bundle for the
    // receipt description so the customer sees the composition.
    const upsellSettings = await getUpsellSettings();
    const locationConfig = upsellSettings[locationSlug] || null;
    const menuItems = await getMenuWithOverrides(locationSlug);
    const menuItemsById = new Map(menuItems.map((m) => [m.id, m]));

    if (process.env.STRIPE_SECRET_KEY) {
      const stripe = (await import("stripe")).default;
      const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY);
      // Methods the operator enabled in /admin/payments drive the Stripe
      // session (Apple/Google Pay ride the "card" type automatically).
      const paymentMethodTypes = await getEnabledStripeMethods();

      const bundleStripeLines: { price_data: { currency: string; product_data: { name: string; description?: string }; unit_amount: number }; quantity: number }[] | null =
        bundleSubtotal !== null && appliedBundleId
          ? (() => {
              const bundle = findBundle(
                appliedBundleId,
                (locationConfig as { bundles?: BundleTier[] } | null)?.bundles ?? null,
              );
              if (!bundle) return null;
              // Dynamic bundles compute price from order items × menu;
              // fixed bundles use the stored price. createOrder already
              // ran cartSatisfiesBundle, so this just mirrors the same
              // pricing for Stripe's unit_amount.
              const pricing = computeBundlePrice(bundle, order.items, menuItems);
              if (!pricing) return null;
              const composition = order.items
                .map((i) => `${i.quantity}× ${i.menuItem.name}`)
                .join(", ");
              return [
                {
                  price_data: {
                    currency: "pln",
                    product_data: {
                      name: `Bundle: ${bundle.name}`,
                      description: composition,
                    },
                    unit_amount: pricing.priceGrosze,
                  },
                  quantity: 1,
                },
              ];
            })()
          : null;

      // Discounts ride along as a single Stripe coupon so the session
      // total matches order.totalAmount. Stripe Checkout accepts at most
      // one coupon, so the combo discount (only when no bundle — bundles
      // already collapse to a discounted line above) and the referral
      // give-get discount (audit §6 #5 — applies on bundle and à-la-carte
      // carts alike) are summed into one amount_off.
      //
      // Sprint 9 #3 — coupon reuse: every checkout used to create a NEW
      // coupon object, leaving thousands of orphans in the Stripe account
      // over time. We use a stable id keyed on (label, amount) and catch
      // the "already exists" conflict, so each unique discount lives as a
      // single permanent coupon that gets reused forever. Idempotent under
      // retries (network or otherwise).
      const comboPart = bundleSubtotal === null ? comboDiscount : 0;
      const totalDiscount = comboPart + referralDiscount;
      let sessionDiscounts: { coupon: string }[] | undefined;
      if (totalDiscount > 0) {
        const parts: string[] = [];
        if (comboPart > 0) parts.push(comboName ? `Combo: ${comboName}` : "Combo discount");
        if (referralDiscount > 0) parts.push("Referral give-get");
        const couponName = parts.join(" + ");
        const couponSlug = couponName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 40);
        const couponId = `sud-${couponSlug}-${totalDiscount}`;
        let couponIdToUse = couponId;
        try {
          await stripeClient.coupons.create({
            id: couponId,
            amount_off: totalDiscount,
            currency: "pln",
            duration: "once",
            name: couponName,
          });
        } catch (err: unknown) {
          // resource_already_exists → reuse the existing coupon. Any
          // other error falls back to one-shot creation (matches prior
          // behaviour so a Stripe-side oddity never blocks checkout).
          const code = (err as { code?: string } | null)?.code;
          if (code !== "resource_already_exists") {
            const fallback = await stripeClient.coupons.create({
              amount_off: totalDiscount,
              currency: "pln",
              duration: "once",
              name: couponName,
            });
            couponIdToUse = fallback.id;
          }
        }
        sessionDiscounts = [{ coupon: couponIdToUse }];
      }

      const session = await stripeClient.checkout.sessions.create(
        {
          payment_method_types: paymentMethodTypes as ("card" | "p24" | "blik")[],
          ...(sessionDiscounts ? { discounts: sessionDiscounts } : {}),
          line_items: [
            ...(bundleStripeLines ??
              order.items.map((i) => {
                const live = menuItemsById.get(i.menuItem.id);
                // Price against the live menu item (authoritative modifier
                // definitions) INCLUDING modifier surcharges — otherwise Stripe
                // would charge the base price while the order total includes the
                // add-ons. Modifier labels go on the Stripe line description so
                // they show on the Stripe-hosted receipt.
                const priced = {
                  menuItem: live ?? i.menuItem,
                  selectedModifiers: i.selectedModifiers,
                };
                const modLabels = (i.selectedModifiers ?? [])
                  .map(
                    (sel) =>
                      (live ?? i.menuItem).modifierGroups
                        ?.find((g) => g.id === sel.groupId)
                        ?.options.find((o) => o.id === sel.optionId)?.label,
                  )
                  .filter(Boolean)
                  .join(", ");
                const description = [modLabels, i.notes]
                  .filter(Boolean)
                  .join(" · ");
                return {
                  price_data: {
                    currency: "pln",
                    product_data: {
                      name: i.menuItem.name,
                      ...(description ? { description } : {}),
                    },
                    unit_amount: effectiveUnitPrice(priced),
                  },
                  quantity: i.quantity,
                };
              })),
            ...(deliveryFee > 0
              ? [
                  {
                    price_data: {
                      currency: "pln",
                      product_data: { name: "Delivery / Dostawa" },
                      unit_amount: deliveryFee,
                    },
                    quantity: 1,
                  },
                ]
              : []),
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
          success_url: `${process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin}/order-confirmation?orderId=${order.id}&location=${locationSlug}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin}/locations/${locationSlug}`,
          metadata: {
            orderId: order.id,
            locationSlug,
            customerName,
            customerPhone: phoneE164,
            fulfillmentType: effFulfillment,
            // Use the order's resolved slot fields (synthesised for QR).
            slotId: order.slotId,
            slotTime: order.slotTime,
            slotDate: order.slotDate,
            ...(order.partySize ? { partySize: String(order.partySize) } : {}),
            ...(isQr && tableNumber ? { tableNumber } : {}),
            channel: isQr ? "qr" : "web",
          },
        },
        idempotencyHash ? { idempotencyKey: idempotencyHash } : undefined,
      );

      if (idempotencyHash && session.url) {
        await cacheCheckout({
          idempotencyHash,
          stripeSessionId: session.id,
          stripeSessionUrl: session.url,
          orderId: order.id,
          locationSlug,
        });
      }

      const stripeResponse = NextResponse.json({ url: session.url, orderId: order.id });
      stripeResponse.cookies.set("sud-italia-customer", phoneE164, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
      });
      recordHistogram("checkout.latency_ms", Date.now() - checkoutStart);
      return stripeResponse;
    }

    // Fallback: no Stripe configured — return order ID directly (demo mode)
    const response = NextResponse.json({
      orderId: order.id,
      total: calculatedTotal,
      message: "Order placed successfully (demo mode — no payment configured)",
    });

    response.cookies.set("sud-italia-customer", phoneE164, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });

    recordHistogram("checkout.latency_ms", Date.now() - checkoutStart);
    return response;
  } catch (error) {
    logger.error("Checkout request failed", { route: "POST /api/checkout" }, error);
    recordHistogram("checkout.latency_ms", Date.now() - checkoutStart);
    incrCounter("checkout.errors");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
