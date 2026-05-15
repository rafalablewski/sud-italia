import { generateOrderId } from "@/lib/utils";
import { getMenuWithOverrides } from "@/data/menus";
import {
  addNotification,
  createOrder,
  getCustomer,
  getSlotById,
  getUpsellSettings,
  incrementSlotOrders,
} from "@/lib/store";
import type { CartItem, FulfillmentType, Order } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import {
  computeDeliveryFee,
  getActiveComboDeals,
  getDeliveryThresholdForCustomer,
} from "@/lib/upsell";
import { findBundle, cartSatisfiesBundle, type BundleTier } from "@/lib/bundles";
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
  items: { id: string; quantity: number; notes?: string }[];
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
  /** "web" = browser checkout; "whatsapp" = bot-driven chat. Defaults to web. */
  channel?: Order["channel"];
}

export type CreateOrderResult =
  | { ok: true; order: Order; deliveryFee: number; bundleSubtotal: number | null }
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
    calculatedTotal += menuItem.price * item.quantity;
    orderItems.push({
      menuItem,
      quantity: item.quantity,
      locationSlug: input.locationSlug,
      notes,
    });
  }

  // Bundles win over combos. Re-resolve the bundle from the upsell config
  // and verify the cart composition matches — never trust a client-supplied
  // bundle id without that check (audit §3.2).
  const upsellSettings = await getUpsellSettings();
  const locationConfig = upsellSettings[input.locationSlug] || null;

  let bundleSubtotal: number | null = null;
  if (input.appliedBundleId) {
    const bundle = findBundle(
      input.appliedBundleId,
      (locationConfig as { bundles?: BundleTier[] } | null)?.bundles ?? null,
    );
    if (bundle && cartSatisfiesBundle(bundle, orderItems, menuItems)) {
      bundleSubtotal = bundle.priceGrosze;
    }
  }

  if (bundleSubtotal !== null) {
    calculatedTotal = bundleSubtotal;
  } else {
    const comboResult = getActiveComboDeals(orderItems, locationConfig);
    const comboDiscount = comboResult.isComplete ? comboResult.savings : 0;
    calculatedTotal = calculatedTotal - comboDiscount;
  }

  const segmentCustomer = await getCustomer(phoneE164);
  const segmentThreshold = getDeliveryThresholdForCustomer(
    segmentCustomer
      ? {
          ordersCount: segmentCustomer.orderCount,
          tier: calculateTier(segmentCustomer.loyaltyPointsBalance),
        }
      : null,
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

  await addNotification({
    type: "new_order",
    title: "New order received",
    message: `${order.customerName} — ${formatPrice(calculatedTotal)} — ${input.fulfillmentType} at ${input.slotTime} · ${orderId}`,
    locationSlug: input.locationSlug,
    orderId,
  });

  const updatedSlot = await getSlotById(input.slotId);
  if (updatedSlot && updatedSlot.currentOrders >= updatedSlot.maxOrders) {
    await addNotification({
      type: "slot_full",
      title: "Time slot full",
      message: `${input.slotDate} ${input.slotTime} slot is now fully booked (${updatedSlot.maxOrders} orders)`,
      locationSlug: input.locationSlug,
    });
  }

  return { ok: true, order, deliveryFee, bundleSubtotal };
}
