import { generateOrderId } from "@/lib/utils";
import { getMenuWithOverrides } from "@/data/menus";
import {
  addNotification,
  appendBundleEvent,
  createOrder,
  getCustomer,
  getSettings,
  getSlotById,
  getUpsellSettings,
  incrementSlotOrders,
} from "@/lib/store";
import { resolveCustomerVariant } from "@/lib/experiments-server";
import type { CartItem, FulfillmentType, Order } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import {
  computeDeliveryFee,
  effectiveUnitPrice,
  findModifierOption,
  getActiveComboDeals,
  getDeliveryThresholdForCustomer,
} from "@/lib/upsell";
import { findBundle, cartSatisfiesBundle, computeBundlePrice, type BundleTier } from "@/lib/bundles";
import { calculateTier } from "@/lib/loyalty";
import { normalizePlPhoneE164 } from "@/lib/phone";

/**
 * Shared order-creation helper. Both /api/checkout (web Stripe Checkout)
 * and the WhatsApp `confirm_and_pay` tool use this so the menu-price
 * lookup, bundle/combo math, delivery-fee segmentation, slot-capacity
 * claim, and customer notification all stay in one place. Stripe surface
 * sits on top of this — the helper itself doesn't create a payment
 * session; that's the caller's job.
 *
 * Returns a discriminated union so callers can branch on validation
 * failure without throwing for expected user-input errors.
 */

export interface CreateOrderInput {
  items: {
    id: string;
    quantity: number;
    notes?: string;
    /** Modifier selections per line (audit §3). Each entry pairs a
     *  modifier group id with the chosen option id from the item's
     *  modifierGroups. Server re-validates every selection against the
     *  current menu (admin may have removed an option between cart
     *  hydration and checkout). */
    selectedModifiers?: { groupId: string; optionId: string }[];
  }[];
  locationSlug: string;
  customerName: string;
  customerPhone: string;
  fulfillmentType: FulfillmentType;
  slotId: string;
  slotDate: string;
  slotTime: string;
  deliveryAddress?: string;
  tipAmount?: number;
  appliedBundleId?: string;
  /** Client-shown bundle price snapshot. Server caps the charged amount
   *  at this value so an admin discount-percent change between render
   *  and checkout can't silently overcharge the customer. */
  appliedBundlePriceGrosze?: number;
  /** "web" = browser checkout; "whatsapp" = bot-driven chat. Defaults to web. */
  channel?: Order["channel"];
}

export type CreateOrderResult =
  | {
      ok: true;
      order: Order;
      deliveryFee: number;
      bundleSubtotal: number | null;
      /** Combo discount in grosze applied to the items subtotal. 0 when no
       *  combo fired or when a bundle overrode it. Threaded out so the
       *  Stripe layer can attach an `amount_off` coupon — without this the
       *  session would charge the pre-discount item total. */
      comboDiscount: number;
      /** Friendly name of the applied combo for receipt copy. Null when no
       *  combo applied. */
      comboName: string | null;
    }
  | {
      ok: false;
      code:
        | "invalid_phone"
        | "slot_not_found"
        | "slot_full"
        | "slot_fulfillment_mismatch"
        | "item_unavailable"
        | "invalid_quantity"
        | "slot_capacity_lost";
      message: string;
      detail?: string;
    };

const NOTE_MAX_LEN = 140;

export async function createOrderFromCart(input: CreateOrderInput): Promise<CreateOrderResult> {
  const phoneE164 = normalizePlPhoneE164(input.customerPhone);
  if (!phoneE164) {
    return { ok: false, code: "invalid_phone", message: "Invalid Polish phone number" };
  }

  const slot = await getSlotById(input.slotId);
  if (!slot) {
    return { ok: false, code: "slot_not_found", message: "Time slot not found" };
  }
  if (slot.currentOrders >= slot.maxOrders) {
    return { ok: false, code: "slot_full", message: "This time slot is full. Please select another." };
  }
  if (!slot.fulfillmentTypes.includes(input.fulfillmentType)) {
    return {
      ok: false,
      code: "slot_fulfillment_mismatch",
      message: `This slot does not support ${input.fulfillmentType}`,
    };
  }

  const menuItems = await getMenuWithOverrides(input.locationSlug);
  const menuItemsById = new Map(menuItems.map((m) => [m.id, m]));

  let calculatedTotal = 0;
  const orderItems: CartItem[] = [];

  for (const item of input.items) {
    const menuItem = menuItemsById.get(item.id);
    if (!menuItem || !menuItem.available) {
      return {
        ok: false,
        code: "item_unavailable",
        message: `Item "${item.id}" is not available`,
        detail: item.id,
      };
    }
    if (!item.quantity || item.quantity < 1 || !Number.isInteger(item.quantity)) {
      return {
        ok: false,
        code: "invalid_quantity",
        message: `Invalid quantity for "${menuItem.name}"`,
        detail: item.id,
      };
    }
    let notes: string | undefined;
    if (typeof item.notes === "string") {
      const trimmed = item.notes.trim();
      if (trimmed.length > 0) notes = trimmed.slice(0, NOTE_MAX_LEN);
    }
    // Validate modifier selections against the current menu so a client
    // can't post a forged modifier id to lower the price or escape KDS
    // flags. Unknown / stale selections are dropped silently — the cart
    // would have re-validated against the current menu on render.
    let selectedModifiers: { groupId: string; optionId: string }[] | undefined;
    if (Array.isArray(item.selectedModifiers) && item.selectedModifiers.length > 0) {
      const valid = item.selectedModifiers.filter(
        (m) =>
          typeof m?.groupId === "string" &&
          typeof m?.optionId === "string" &&
          findModifierOption(menuItem, m.groupId, m.optionId) !== null,
      );
      if (valid.length > 0) selectedModifiers = valid;
    }
    const lineItem: CartItem = {
      menuItem,
      quantity: item.quantity,
      locationSlug: input.locationSlug,
      notes,
      ...(selectedModifiers ? { selectedModifiers } : {}),
    };
    // effectiveUnitPrice includes any modifier surcharges (audit §3 —
    // extra cheese +6, sourdough +5). Bundle-applied carts still
    // override this further down via bundleSubtotal.
    calculatedTotal += effectiveUnitPrice(lineItem) * item.quantity;
    orderItems.push(lineItem);
  }

  // Bundles win over combos. Re-resolve the bundle from the upsell config
  // and verify the cart composition matches — never trust a client-supplied
  // bundle id without that check (audit §3.2).
  const upsellSettings = await getUpsellSettings();
  const locationConfig = upsellSettings[input.locationSlug] || null;

  let bundleSubtotal: number | null = null;
  let bundleAuditPayload: {
    bundleId: string;
    bundleName: string;
    pricingMode: "fixed" | "dynamic";
    mainsCount: number;
    mainsSubtotalGrosze: number;
    addOnsSubtotalGrosze: number;
    refPriceGrosze: number;
    finalPriceGrosze: number;
    savingsGrosze: number;
    experimentVariant?: string;
  } | null = null;
  if (input.appliedBundleId) {
    // Resolve experiment variant first — phone-hashed, stable across
    // retries. Variant may override discount %s on the bundle config.
    const variant = await resolveCustomerVariant(input.locationSlug, phoneE164);
    const configBundles = (locationConfig as { bundles?: BundleTier[] } | null)?.bundles ?? null;
    const variantBundles = variant
      ? configBundles?.map((b) => variant.applyToBundle(b)) ?? null
      : configBundles;
    const bundle = findBundle(input.appliedBundleId, variantBundles);
    if (bundle && cartSatisfiesBundle(bundle, orderItems, menuItems)) {
      const pricing = computeBundlePrice(bundle, orderItems, menuItems);
      if (pricing) {
        // Snapshot guard: never charge more than the chip promised.
        const clientSnapshot = input.appliedBundlePriceGrosze;
        bundleSubtotal =
          typeof clientSnapshot === "number" && clientSnapshot >= 0
            ? Math.min(pricing.priceGrosze, clientSnapshot)
            : pricing.priceGrosze;
        bundleAuditPayload = {
          bundleId: bundle.id,
          bundleName: bundle.name,
          pricingMode: bundle.pricingMode === "dynamic" ? "dynamic" : "fixed",
          mainsCount: pricing.mainsCount,
          mainsSubtotalGrosze: pricing.mainsSubtotal,
          addOnsSubtotalGrosze: pricing.addOnsSubtotal,
          refPriceGrosze: pricing.refPriceGrosze,
          finalPriceGrosze: bundleSubtotal,
          savingsGrosze: Math.max(0, pricing.refPriceGrosze - bundleSubtotal),
          experimentVariant: variant?.variantId,
        };
      }
    }
  }

  let comboDiscount = 0;
  let comboName: string | null = null;
  if (bundleSubtotal !== null) {
    calculatedTotal = bundleSubtotal;
  } else {
    // Channel-aware (audit §3) — delivery-only combos only fire on
    // delivery orders, dine-in combos only on takeout.
    const comboResult = getActiveComboDeals(
      orderItems,
      locationConfig,
      input.fulfillmentType,
    );
    if (comboResult.isComplete) {
      comboDiscount = comboResult.savings;
      comboName = comboResult.activeDeal?.name ?? null;
      calculatedTotal = calculatedTotal - comboDiscount;
    }
  }

  const segmentCustomer = await getCustomer(phoneE164);
  const appSettings = await getSettings();
  const segmentThreshold = getDeliveryThresholdForCustomer(
    segmentCustomer
      ? {
          ordersCount: segmentCustomer.orderCount,
          tier: calculateTier(segmentCustomer.loyaltyPointsBalance),
        }
      : null,
    appSettings.deliveryThresholds ?? null,
  );
  const deliveryFee = computeDeliveryFee(
    calculatedTotal,
    input.fulfillmentType,
    segmentThreshold,
  );
  calculatedTotal += deliveryFee;

  let tipAmount = 0;
  if (
    typeof input.tipAmount === "number" &&
    Number.isInteger(input.tipAmount) &&
    input.tipAmount > 0
  ) {
    tipAmount = Math.min(input.tipAmount, calculatedTotal);
    calculatedTotal += tipAmount;
  }

  const orderId = generateOrderId();

  if (!(await incrementSlotOrders(input.slotId))) {
    return {
      ok: false,
      code: "slot_capacity_lost",
      message: "This time slot just filled up. Please select another.",
    };
  }

  const order: Order = {
    id: orderId,
    locationSlug: input.locationSlug,
    items: orderItems,
    totalAmount: calculatedTotal,
    status: "pending",
    customerName: input.customerName.trim(),
    customerPhone: phoneE164,
    fulfillmentType: input.fulfillmentType,
    deliveryAddress:
      input.fulfillmentType === "delivery" ? (input.deliveryAddress ?? "").trim() : undefined,
    slotId: input.slotId,
    slotDate: input.slotDate,
    slotTime: input.slotTime,
    tipAmount: tipAmount > 0 ? tipAmount : undefined,
    deliveryFee: deliveryFee > 0 ? deliveryFee : undefined,
    createdAt: new Date().toISOString(),
    channel: input.channel ?? "web",
  };

  await createOrder(order);

  // Bundle audit — capture pricing snapshot + experiment variant for
  // later cannibalization / margin / A-vs-B analysis. Fire-and-forget;
  // a write failure here doesn't unwind the order. Slot + customer
  // cohort (Sprint 7 #6 + #7) feed the KPI dashboard's capacity and
  // new-vs-repeat splits. Margin computed at write time so operator
  // alerts can fire when a bundle goes underwater (Sprint 8 #10).
  if (bundleAuditPayload) {
    const priorOrderCount = segmentCustomer?.orderCount ?? 0;
    // Food cost = Σ MenuItem.cost across every cart line. Items without
    // a cost field contribute 0 to the cost (conservative for the
    // operator-protective alert).
    const foodCost = orderItems.reduce(
      (s, ci) => s + (ci.menuItem.cost ?? 0) * ci.quantity,
      0,
    );
    const marginRatio =
      bundleSubtotal !== null && bundleSubtotal > 0
        ? Math.max(0, (bundleSubtotal - foodCost) / bundleSubtotal)
        : undefined;

    // Identify the main categories so we can carve out the add-on
    // composition the customer picked for this bundle — feeds the
    // composer's "same as last time" pre-fill on the customer's next
    // visit (Sprint 8 #8).
    const lookedUp = findBundle(
      input.appliedBundleId!,
      (locationConfig as { bundles?: BundleTier[] } | null)?.bundles ?? null,
    );
    const mainCats = lookedUp && lookedUp.pricingMode === "dynamic"
      ? new Set(lookedUp.mainCategories)
      : new Set<string>();
    const addOnComposition = orderItems
      .filter((ci) => !mainCats.has(ci.menuItem.category))
      .map((ci) => ({ menuItemId: ci.menuItem.id, quantity: ci.quantity }));

    void appendBundleEvent({
      id: `bev_${orderId}`,
      orderId,
      bundleId: bundleAuditPayload.bundleId,
      bundleName: bundleAuditPayload.bundleName,
      locationSlug: input.locationSlug,
      pricingMode: bundleAuditPayload.pricingMode,
      mainsCount: bundleAuditPayload.mainsCount,
      mainsSubtotalGrosze: bundleAuditPayload.mainsSubtotalGrosze,
      addOnsSubtotalGrosze: bundleAuditPayload.addOnsSubtotalGrosze,
      refPriceGrosze: bundleAuditPayload.refPriceGrosze,
      finalPriceGrosze: bundleAuditPayload.finalPriceGrosze,
      savingsGrosze: bundleAuditPayload.savingsGrosze,
      customerPhone: phoneE164,
      experimentVariant: bundleAuditPayload.experimentVariant,
      slotId: input.slotId,
      customerCohort: priorOrderCount === 0 ? "new" : "repeat",
      customerOrderCount: priorOrderCount,
      marginRatio,
      addOnComposition,
      createdAt: new Date().toISOString(),
    });

    // Operator margin alert — when a real bundle order's contribution
    // margin drops below 40% the operator gets pinged in /admin so they
    // can re-tune the discount before it bleeds. Threshold matches the
    // "amber/red" line on BundleMarginPreview so the admin signal and
    // the live preview agree.
    if (marginRatio !== undefined && marginRatio < 0.4 && bundleSubtotal !== null) {
      void addNotification({
        type: "bundle_low_margin",
        title: "Bundle margin below 40%",
        message: `${bundleAuditPayload.bundleName} — ${Math.round(marginRatio * 100)}% margin on ${formatPrice(bundleSubtotal)}. Review discount % in /admin/upsell.`,
        locationSlug: input.locationSlug,
        orderId,
      });
    }
  }

  await addNotification({
    type: "new_order",
    title: "New order received",
    message: `${order.customerName} — ${formatPrice(calculatedTotal)} — ${input.fulfillmentType} at ${input.slotTime} · ${orderId}`,
    locationSlug: input.locationSlug,
    orderId,
    data: {
      customerName: order.customerName,
      totalGrosze: calculatedTotal,
      slotTime: input.slotTime,
    },
  });

  const updatedSlot = await getSlotById(input.slotId);
  if (updatedSlot && updatedSlot.currentOrders >= updatedSlot.maxOrders) {
    await addNotification({
      type: "slot_full",
      title: "Time slot full",
      message: `${input.slotDate} ${input.slotTime} slot is now fully booked (${updatedSlot.maxOrders} orders)`,
      locationSlug: input.locationSlug,
      data: { slotTime: input.slotTime },
    });
  } else if (updatedSlot && updatedSlot.currentOrders >= updatedSlot.maxOrders - 1) {
    // One spot left → slot pressure ping so the operator can extend or
    // bump prep cadence. Only fires the moment we cross to "1 left", not
    // every order after that, because each tick the slot stays at 1 left
    // would re-page.
    await addNotification({
      type: "low_slots",
      title: "Slot almost full",
      message: `${input.slotDate} ${input.slotTime} only has 1 spot left.`,
      locationSlug: input.locationSlug,
      data: { slotTime: input.slotTime },
    });
  }

  return { ok: true, order, deliveryFee, bundleSubtotal, comboDiscount, comboName };
}
