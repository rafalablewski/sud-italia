import type Anthropic from "@anthropic-ai/sdk";
import { getAvailableMenu } from "@/data/menus";
import {
  addNotification,
  getCustomer,
  getSlots,
  getSlotById,
  getUpsellSettings,
  updateOrderStatus,
  type WaSession,
} from "@/lib/store";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import type { MenuItem, FulfillmentType } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import {
  computeDeliveryFee,
  getActiveComboDeals,
  getCartSuggestions,
  getDeliveryThresholdForCustomer,
} from "@/lib/upsell";
import { calculateTier } from "@/lib/loyalty";
import { createOrderFromCart } from "@/lib/checkout/createOrder";
import { createWhatsAppPaymentSession } from "@/lib/checkout/whatsappPaymentLink";
import { getWhatsAppProvider } from "@/lib/providers/whatsapp";
import { logger } from "@/lib/logger";

/**
 * Tool registry for the WhatsApp ordering bot. Every tool definition
 * here is the JSONSchema the LLM sees, paired with a `run` function
 * that executes against the real store. Tools mutate the per-phone
 * WhatsApp session (in store.ts) so state survives across LLM turns.
 *
 * Side effects: tools that produce structured UI (list of slots, cart
 * breakdown, payment CTA) send the corresponding interactive WhatsApp
 * message directly via the provider — the LLM then just emits a short
 * conversational confirmation. The result object's `text` field is
 * what the LLM sees; `uiSent` tells the turn loop the message went
 * out so the LLM's final text isn't redundant.
 */

/** Active-truck membership is resolved from the live locations store
 *  on every call so adding a truck in /admin/locations is picked up
 *  by the bot without a redeploy. The list is small (≤ tens) and the
 *  store caches in-process, so the per-tool fetch is cheap. */

export interface ToolContext {
  /** Customer's E.164 PL phone — the session key. */
  phone: string;
  /** In-memory session loaded once at the start of the turn. Tools
   *  mutate this directly; the turn loop persists it once at the end.
   *  Avoids a per-tool read-modify-write of whatsapp-sessions.json. */
  session: WaSession;
  /** Mark `uiSent: true` if the tool already sent a WA message so the
   *  LLM's wrap-up text isn't a duplicate of what the customer saw. */
  uiSent: { value: boolean };
  /** Set to true by terminal tools (e.g. escalate_to_human) to tell the
   *  turn loop to delete the session at the end rather than save it. */
  clearOnExit: { value: boolean };
}

export interface ToolResult {
  ok: boolean;
  /** Text body shown to the LLM as the tool_result. Should describe what happened. */
  text: string;
  /** Optional structured data returned alongside text. */
  data?: unknown;
}

// ---- helpers ------------------------------------------------------------

async function locationName(slug: string): Promise<string> {
  const list = await getActiveLocationsAsync();
  return list.find((l) => l.slug === slug)?.name ?? slug;
}

function pln(grosze: number): string {
  return formatPrice(grosze);
}

function shortMenuRow(item: MenuItem) {
  return {
    id: item.id,
    name: item.name,
    description: item.description.slice(0, 100),
    price: item.price,
    priceDisplay: pln(item.price),
    category: item.category,
    tags: item.tags,
  };
}

async function recomputeQuote(session: WaSession): Promise<{
  subtotal: number;
  comboDiscount: number;
  deliveryFee: number;
  tip: number;
  total: number;
  lines: { name: string; quantity: number; lineTotal: number }[];
}> {
  let subtotal = 0;
  const lines: { name: string; quantity: number; lineTotal: number }[] = [];
  for (const item of session.cartItems) {
    const line = item.menuItem.price * item.quantity;
    subtotal += line;
    lines.push({ name: item.menuItem.name, quantity: item.quantity, lineTotal: line });
  }
  let comboDiscount = 0;
  if (session.locationSlug) {
    const upsell = await getUpsellSettings();
    const cfg = upsell[session.locationSlug] || null;
    const combo = getActiveComboDeals(session.cartItems, cfg);
    if (combo.missingCategories.length === 0) {
      comboDiscount = combo.savings;
    }
  }
  let afterDiscount = subtotal - comboDiscount;
  let deliveryFee = 0;
  if (session.fulfillmentType === "delivery") {
    const cust = await getCustomer(session.phone);
    const threshold = getDeliveryThresholdForCustomer(
      cust
        ? { ordersCount: cust.orderCount, tier: calculateTier(cust.loyaltyPointsBalance) }
        : null,
    );
    deliveryFee = computeDeliveryFee(afterDiscount, "delivery", threshold);
    afterDiscount += deliveryFee;
  }
  return {
    subtotal,
    comboDiscount,
    deliveryFee,
    tip: 0,
    total: afterDiscount,
    lines,
  };
}

// ---- tool definitions ---------------------------------------------------

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "set_location",
    description:
      "Pin the customer's chosen Sud Italia location for the rest of the conversation. Must be called before searching the menu.",
    input_schema: {
      type: "object",
      properties: {
        locationSlug: { type: "string", enum: ["krakow", "warszawa"] },
      },
      required: ["locationSlug"],
    },
  },
  {
    name: "search_menu",
    description:
      "Search the active menu for the pinned location. Returns up to 8 items matching the query and/or category. Always call before quoting an item or price.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text search across name and description." },
        category: {
          type: "string",
          enum: ["pizza", "pasta", "antipasti", "panini", "drinks", "desserts"],
        },
      },
    },
  },
  {
    name: "add_to_cart",
    description:
      "Add a menu item to the customer's cart. menuItemId must be one returned by search_menu. notes is an optional per-line kitchen instruction (e.g. 'extra crispy', 'no onion'), max 140 chars.",
    input_schema: {
      type: "object",
      properties: {
        menuItemId: { type: "string" },
        quantity: { type: "integer", minimum: 1, maximum: 20 },
        notes: { type: "string" },
      },
      required: ["menuItemId", "quantity"],
    },
  },
  {
    name: "view_cart",
    description:
      "Show the customer's current cart with running subtotal. Sends an itemised summary as a WhatsApp message.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "remove_from_cart",
    description: "Remove every line for a given menu item from the cart.",
    input_schema: {
      type: "object",
      properties: { menuItemId: { type: "string" } },
      required: ["menuItemId"],
    },
  },
  {
    name: "clear_cart",
    description: "Empty the customer's cart entirely. Use when the customer says 'start over' or similar.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "set_fulfillment",
    description: "Record whether the customer wants takeout or delivery.",
    input_schema: {
      type: "object",
      properties: { type: { type: "string", enum: ["takeout", "delivery"] } },
      required: ["type"],
    },
  },
  {
    name: "list_slots",
    description:
      "Return up to 10 available time slots for the pinned location and chosen fulfillment type. Renders an interactive list in WhatsApp.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Optional YYYY-MM-DD filter. Defaults to today." },
      },
    },
  },
  {
    name: "set_slot",
    description:
      "Lock in a slot id (one returned by list_slots). Validates the slot still has capacity and supports the chosen fulfillment type. Does not reserve it yet — reservation happens in confirm_and_pay.",
    input_schema: {
      type: "object",
      properties: { slotId: { type: "string" } },
      required: ["slotId"],
    },
  },
  {
    name: "set_delivery_address",
    description:
      "Capture a delivery address. Only call after set_fulfillment with type='delivery'. Polish format: street name + house number, city, postal code 00-000.",
    input_schema: {
      type: "object",
      properties: {
        street: { type: "string" },
        city: { type: "string" },
        postalCode: { type: "string" },
        notes: { type: "string" },
      },
      required: ["street", "city", "postalCode"],
    },
  },
  {
    name: "get_suggestions",
    description:
      "Return up to 3 cross-sell suggestions for the current cart (e.g. espresso + dessert with pizza). Use this once to offer an upsell — don't repeat if the customer declines.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "set_customer_name",
    description:
      "Record the customer's first name for the order. Use the WhatsApp contact-card name as a default suggestion if the customer hasn't given one.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", maxLength: 60 } },
      required: ["name"],
    },
  },
  {
    name: "quote_total",
    description:
      "Return the current breakdown (subtotal, combo discount, delivery fee, total). Call before confirm_and_pay so the customer sees what they'll pay.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "confirm_and_pay",
    description:
      "Create the order, reserve the slot, generate a Stripe Checkout link, and send it to the customer as a 'Pay now' button. Must only be called after a location, non-empty cart, fulfillment, slot, and customer name are all set.",
    input_schema: {
      type: "object",
      properties: {
        tipAmount: {
          type: "integer",
          minimum: 0,
          description: "Optional tip in grosze (e.g. 300 = 3.00 PLN). Defaults to 0.",
        },
      },
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Hand the conversation off to a human teammate. Use when the customer asks for a person, when they're upset, or when something is going wrong the bot can't resolve.",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string", maxLength: 200 } },
      required: ["reason"],
    },
  },
];

// ---- tool execution -----------------------------------------------------

async function isActiveLocation(slug: unknown): Promise<boolean> {
  if (typeof slug !== "string") return false;
  const list = await getActiveLocationsAsync();
  return list.some((l) => l.slug === slug);
}

export async function executeTool(
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    const input = (rawInput ?? {}) as Record<string, unknown>;
    switch (name) {
      case "set_location":
        return await tool_setLocation(input, ctx);
      case "search_menu":
        return await tool_searchMenu(input, ctx);
      case "add_to_cart":
        return await tool_addToCart(input, ctx);
      case "view_cart":
        return await tool_viewCart(ctx);
      case "remove_from_cart":
        return await tool_removeFromCart(input, ctx);
      case "clear_cart":
        return await tool_clearCart(ctx);
      case "set_fulfillment":
        return await tool_setFulfillment(input, ctx);
      case "list_slots":
        return await tool_listSlots(input, ctx);
      case "set_slot":
        return await tool_setSlot(input, ctx);
      case "set_delivery_address":
        return await tool_setDeliveryAddress(input, ctx);
      case "get_suggestions":
        return await tool_getSuggestions(ctx);
      case "set_customer_name":
        return await tool_setCustomerName(input, ctx);
      case "quote_total":
        return await tool_quoteTotal(ctx);
      case "confirm_and_pay":
        return await tool_confirmAndPay(input, ctx);
      case "escalate_to_human":
        return await tool_escalateToHuman(input, ctx);
      default:
        return { ok: false, text: `Unknown tool: ${name}` };
    }
  } catch (err) {
    logger.error(
      "whatsapp.tool.error",
      { tool: name, phone: ctx.phone, layer: "whatsapp.tools" },
      err,
    );
    return {
      ok: false,
      text: `Tool ${name} failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}

async function tool_setLocation(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const slugRaw = input.locationSlug;
  if (typeof slugRaw !== "string" || !(await isActiveLocation(slugRaw))) {
    const known = (await getActiveLocationsAsync()).map((l) => l.slug);
    return { ok: false, text: `locationSlug must be one of: ${known.join(", ")}.` };
  }
  const slug: string = slugRaw;
  if (ctx.session.locationSlug && ctx.session.locationSlug !== slug) {
    // Switching location wipes the cart — items aren't comparable across menus.
    ctx.session.cartItems = [];
  }
  ctx.session.locationSlug = slug;
  return { ok: true, text: `Location pinned: ${await locationName(slug)}.` };
}

async function tool_searchMenu(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const slug = ctx.session.locationSlug;
  if (!slug) {
    return {
      ok: false,
      text: "No location set yet. Call set_location first ('krakow' or 'warszawa').",
    };
  }
  const menu = await getAvailableMenu(slug);
  const query = typeof input.query === "string" ? input.query.toLowerCase().trim() : "";
  const category = typeof input.category === "string" ? input.category : "";
  let filtered = menu;
  if (category) {
    filtered = filtered.filter((m) => m.category === category);
  }
  if (query) {
    filtered = filtered.filter(
      (m) =>
        m.name.toLowerCase().includes(query) || m.description.toLowerCase().includes(query),
    );
  }
  const trimmed = filtered.slice(0, 8).map(shortMenuRow);
  return {
    ok: true,
    text:
      trimmed.length === 0
        ? `No items match in ${await locationName(slug)}.`
        : `Found ${trimmed.length} matching item(s):\n${trimmed
            .map((i) => `- ${i.id}: ${i.name} — ${i.priceDisplay}`)
            .join("\n")}`,
    data: trimmed,
  };
}

async function tool_addToCart(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const menuItemId = typeof input.menuItemId === "string" ? input.menuItemId : "";
  const quantity = Math.floor(Number(input.quantity ?? 0));
  const notes = typeof input.notes === "string" ? input.notes.trim().slice(0, 140) : "";
  if (!menuItemId) return { ok: false, text: "menuItemId is required." };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
    return { ok: false, text: "quantity must be an integer between 1 and 20." };
  }
  const slug = ctx.session.locationSlug;
  if (!slug) return { ok: false, text: "Set a location first." };
  const menu = await getAvailableMenu(slug);
  const item = menu.find((m) => m.id === menuItemId);
  if (!item) {
    return { ok: false, text: `Item ${menuItemId} is not on the ${await locationName(slug)} menu right now.` };
  }
  const existing = ctx.session.cartItems.findIndex(
    (c) => c.menuItem.id === item.id && (c.notes ?? "") === notes,
  );
  if (existing >= 0) {
    ctx.session.cartItems[existing] = {
      ...ctx.session.cartItems[existing],
      quantity: ctx.session.cartItems[existing].quantity + quantity,
    };
  } else {
    ctx.session.cartItems.push({
      menuItem: item,
      quantity,
      locationSlug: slug,
      notes: notes || undefined,
    });
  }
  return {
    ok: true,
    text: `Added ${quantity}× ${item.name} (${pln(item.price * quantity)}) to the cart.`,
  };
}

async function tool_viewCart(ctx: ToolContext): Promise<ToolResult> {
  if (ctx.session.cartItems.length === 0) {
    return { ok: true, text: "Cart is empty." };
  }
  const quote = await recomputeQuote(ctx.session);
  const provider = getWhatsAppProvider();
  const lines = ctx.session.cartItems.map(
    (i) => `• ${i.quantity}× ${i.menuItem.name} — ${pln(i.menuItem.price * i.quantity)}`,
  );
  const summary = [
    "🛒 Twój koszyk:",
    ...lines,
    `Suma: ${pln(quote.total)}`,
    quote.comboDiscount > 0 ? `Combo: -${pln(quote.comboDiscount)}` : "",
    quote.deliveryFee > 0 ? `Dostawa: ${pln(quote.deliveryFee)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  await provider.sendText(ctx.session.phone, summary);
  ctx.uiSent.value = true;
  return {
    ok: true,
    text: `Cart has ${ctx.session.cartItems.length} item(s). Subtotal ${pln(quote.subtotal)}, total ${pln(quote.total)}. (Sent breakdown to customer.)`,
    data: quote,
  };
}

async function tool_removeFromCart(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const menuItemId = typeof input.menuItemId === "string" ? input.menuItemId : "";
  if (!menuItemId) return { ok: false, text: "menuItemId is required." };
  const before = ctx.session.cartItems.length;
  ctx.session.cartItems = ctx.session.cartItems.filter((c) => c.menuItem.id !== menuItemId);
  const removed = before - ctx.session.cartItems.length;
  return { ok: true, text: removed > 0 ? `Removed ${removed} line(s).` : "Item was not in the cart." };
}

async function tool_clearCart(ctx: ToolContext): Promise<ToolResult> {
  ctx.session.cartItems = [];
  return { ok: true, text: "Cart cleared." };
}

async function tool_setFulfillment(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const type = input.type;
  if (type !== "takeout" && type !== "delivery") {
    return { ok: false, text: "type must be 'takeout' or 'delivery'." };
  }
  ctx.session.fulfillmentType = type as FulfillmentType;
  // Switching to takeout invalidates a previously-captured address.
  if (type !== "delivery") {
    ctx.session.deliveryAddress = null;
  }
  return { ok: true, text: `Fulfillment set to ${type}.` };
}

async function tool_listSlots(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const { session } = ctx;
  if (!session.locationSlug) return { ok: false, text: "Set a location first." };
  if (!session.fulfillmentType) {
    return { ok: false, text: "Call set_fulfillment first ('takeout' or 'delivery')." };
  }
  // Default to "today" in the truck's local time, not UTC. Around midnight
  // CET/CEST the UTC date is one day behind, and `list_slots` was handing
  // customers slots for the wrong day. en-CA gives YYYY-MM-DD.
  const date = typeof input.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.date)
    ? input.date
    : new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
  const all = await getSlots(session.locationSlug, date);
  const available = all
    .filter((s) => s.status === "active")
    .filter((s) => s.currentOrders < s.maxOrders)
    .filter((s) => s.fulfillmentTypes.includes(session.fulfillmentType!))
    .slice(0, 10);
  if (available.length === 0) {
    return { ok: true, text: `No available slots on ${date} for ${session.fulfillmentType}.` };
  }
  const provider = getWhatsAppProvider();
  await provider.sendInteractiveList(
    session.phone,
    `Dostępne terminy na ${date} (${session.fulfillmentType === "takeout" ? "odbiór" : "dostawa"}):`,
    "Wybierz",
    [
      {
        title: (await locationName(session.locationSlug)).slice(0, 24),
        rows: available.map((s) => ({
          id: `slot:${s.id}`,
          title: s.time,
          description: `${s.maxOrders - s.currentOrders} miejsc`,
        })),
      },
    ],
  );
  ctx.uiSent.value = true;
  return {
    ok: true,
    text: `Sent ${available.length} slot(s) to the customer.`,
    data: available.map((s) => ({ id: s.id, time: s.time, date: s.date })),
  };
}

async function tool_setSlot(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const slotId = typeof input.slotId === "string" ? input.slotId : "";
  if (!slotId) return { ok: false, text: "slotId is required." };
  const slot = await getSlotById(slotId);
  if (!slot) return { ok: false, text: "That slot doesn't exist." };
  if (slot.currentOrders >= slot.maxOrders) {
    return { ok: false, text: "That slot just filled up. Call list_slots and offer another." };
  }
  if (ctx.session.fulfillmentType && !slot.fulfillmentTypes.includes(ctx.session.fulfillmentType)) {
    return {
      ok: false,
      text: `Slot doesn't support ${ctx.session.fulfillmentType}. Offer a different slot.`,
    };
  }
  ctx.session.slotId = slotId;
  return { ok: true, text: `Slot locked: ${slot.date} ${slot.time}.` };
}

async function tool_setDeliveryAddress(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  if (ctx.session.fulfillmentType !== "delivery") {
    return { ok: false, text: "Address is only needed for delivery. Set fulfillment to 'delivery' first." };
  }
  const street = typeof input.street === "string" ? input.street.trim() : "";
  const city = typeof input.city === "string" ? input.city.trim() : "";
  const postalCode = typeof input.postalCode === "string" ? input.postalCode.trim() : "";
  const notes = typeof input.notes === "string" ? input.notes.trim().slice(0, 140) : "";
  if (!street || !city || !postalCode) {
    return { ok: false, text: "street, city and postalCode are all required." };
  }
  ctx.session.deliveryAddress = { street, city, postalCode, notes: notes || undefined };
  return {
    ok: true,
    text: `Address captured: ${street}, ${postalCode} ${city}${notes ? ` (${notes})` : ""}.`,
  };
}

async function tool_getSuggestions(ctx: ToolContext): Promise<ToolResult> {
  const { session } = ctx;
  if (!session.locationSlug || session.cartItems.length === 0) {
    return { ok: false, text: "Need a location and a non-empty cart for suggestions." };
  }
  const menu = await getAvailableMenu(session.locationSlug);
  const upsell = await getUpsellSettings();
  const cfg = upsell[session.locationSlug] || null;
  const suggestions = getCartSuggestions(session.cartItems, menu, 3, cfg).map((s) => ({
    id: s.item.id,
    name: s.item.name,
    price: s.item.price,
    priceDisplay: pln(s.item.price),
    reason: s.reason,
  }));
  return {
    ok: true,
    text:
      suggestions.length === 0
        ? "No suggestions right now."
        : `Top suggestions:\n${suggestions.map((s) => `- ${s.name} (${s.priceDisplay}) — ${s.reason}`).join("\n")}`,
    data: suggestions,
  };
}

async function tool_setCustomerName(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 60) : "";
  if (!name) return { ok: false, text: "name is required." };
  ctx.session.customerName = name;
  return { ok: true, text: `Customer name set: ${name}.` };
}

async function tool_quoteTotal(ctx: ToolContext): Promise<ToolResult> {
  if (ctx.session.cartItems.length === 0) {
    return { ok: false, text: "Cart is empty — nothing to quote." };
  }
  const quote = await recomputeQuote(ctx.session);
  return {
    ok: true,
    text: `Subtotal ${pln(quote.subtotal)}${
      quote.comboDiscount > 0 ? `, combo -${pln(quote.comboDiscount)}` : ""
    }${quote.deliveryFee > 0 ? `, delivery ${pln(quote.deliveryFee)}` : ""}, total ${pln(
      quote.total,
    )}.`,
    data: quote,
  };
}

async function tool_confirmAndPay(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const { session } = ctx;
  if (!session.locationSlug) return { ok: false, text: "Location not set." };
  if (session.cartItems.length === 0) return { ok: false, text: "Cart is empty." };
  if (!session.fulfillmentType) return { ok: false, text: "Fulfillment not set." };
  if (!session.slotId) return { ok: false, text: "Slot not set." };
  if (session.fulfillmentType === "delivery" && !session.deliveryAddress) {
    return { ok: false, text: "Delivery address required." };
  }
  if (!session.customerName) return { ok: false, text: "Customer name not captured." };

  const slot = await getSlotById(session.slotId);
  if (!slot) return { ok: false, text: "Slot disappeared. Re-pick a slot." };

  const tipAmount = Number.isInteger(input.tipAmount) ? Math.max(0, Number(input.tipAmount)) : 0;

  const result = await createOrderFromCart({
    items: session.cartItems.map((c) => ({
      id: c.menuItem.id,
      quantity: c.quantity,
      notes: c.notes,
    })),
    locationSlug: session.locationSlug,
    customerName: session.customerName,
    customerPhone: session.phone,
    fulfillmentType: session.fulfillmentType,
    slotId: session.slotId,
    slotDate: slot.date,
    slotTime: slot.time,
    deliveryAddress: session.deliveryAddress
      ? [
          session.deliveryAddress.street,
          `${session.deliveryAddress.postalCode} ${session.deliveryAddress.city}`,
          session.deliveryAddress.notes,
        ]
          .filter(Boolean)
          .join(", ")
      : undefined,
    tipAmount,
    channel: "whatsapp",
  });
  if (!result.ok) {
    return { ok: false, text: `Could not create order: ${result.message}` };
  }
  const { order } = result;

  const payment = await createWhatsAppPaymentSession(order);
  if (!payment) {
    // Stripe isn't configured (demo mode). Confirm the order immediately
    // so it lands on the KDS and counts in analytics — there's nothing
    // to wait for and the customer is told to pay at pickup.
    await updateOrderStatus(order.id, "confirmed");
    ctx.session.pendingOrderId = order.id;
    ctx.session.cartItems = [];
    const provider = getWhatsAppProvider();
    await provider.sendText(
      ctx.phone,
      `Zamówienie #${order.id} przyjęte (${pln(order.totalAmount)}). Płatność u kierowcy / przy odbiorze. ${slot.date} ${slot.time}. Smacznego! 🍕`,
    );
    ctx.uiSent.value = true;
    return { ok: true, text: `Order ${order.id} created and confirmed (demo mode — no Stripe). Customer notified to pay on pickup.` };
  }

  ctx.session.pendingOrderId = order.id;
  ctx.session.pendingPaymentUrl = payment.url;

  // Page the operator dashboard so a human can babysit if the customer
  // doesn't tap pay within a few minutes.
  await addNotification({
    type: "new_order",
    title: "WhatsApp order awaiting payment",
    message: `${order.customerName} — ${pln(order.totalAmount)} — WhatsApp · ${order.id}`,
    locationSlug: order.locationSlug,
    orderId: order.id,
  });

  const provider = getWhatsAppProvider();
  await provider.sendCtaUrl(
    ctx.phone,
    `Zamówienie #${order.id} gotowe. Do zapłaty: ${pln(order.totalAmount)}. Kliknij Pay now, by zapłacić bezpiecznie przez Stripe.`,
    "Pay now",
    payment.url,
  );
  ctx.uiSent.value = true;
  return {
    ok: true,
    text: `Order ${order.id} created (${pln(order.totalAmount)}) and Stripe Checkout URL sent. Slot reserved.`,
    data: { orderId: order.id, paymentUrl: payment.url, total: order.totalAmount },
  };
}

async function tool_escalateToHuman(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 200) : "(no reason)";
  await addNotification({
    type: "new_order",
    title: "WhatsApp: human handoff requested",
    message: `${ctx.phone} — ${reason}`,
    locationSlug: ctx.session.locationSlug ?? "krakow",
  });
  // Don't delete the session inline — the turn loop still needs to make
  // its final write. Signal "clear on exit" so the loop drops the row
  // after the turn completes instead of resurrecting it via setWaSession.
  ctx.clearOnExit.value = true;
  const provider = getWhatsAppProvider();
  await provider.sendText(
    ctx.phone,
    "Już daję znać zespołowi — ktoś z nas odezwie się tu na WhatsApp niedługo. Dziękujemy za cierpliwość!",
  );
  ctx.uiSent.value = true;
  return { ok: true, text: `Escalated to human. Reason: ${reason}` };
}
