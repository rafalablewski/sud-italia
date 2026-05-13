import { getOrderById, setMenuOverride, getMenuOverrides } from "@/lib/store";
import { registerTool } from "./registry";

/**
 * mark_item_86 — flip an item to unavailable until the next morning.
 * Restaurant slang: "86 the meatballs" = we're out. Staff+ because
 * the kitchen line needs to call this without waking a manager.
 *
 * Mutates `menu_overrides.available`. Caller is expected to re-enable
 * when the next prep cycle restocks; we don't auto-expire to keep the
 * model simple.
 */
registerTool<{ itemId: string; reason?: string }>({
  name: "mark_item_86",
  description:
    "Mark a menu item as unavailable ('86 it') so customers can't order it. " +
    "Use when the kitchen runs out of a key ingredient mid-service. Mutates state.",
  minRole: "staff",
  mutates: true,
  inputSchema: {
    type: "object" as const,
    properties: {
      itemId: {
        type: "string",
        description: "Menu item ID to disable (e.g. 'margherita').",
      },
      reason: {
        type: "string",
        description: "Optional reason — surfaced in the audit trail.",
      },
    },
    required: ["itemId"],
  },
  async execute(input, ctx) {
    if (ctx.dryRun) {
      return {
        ok: true,
        preview: `Mark item '${input.itemId}' as unavailable${input.reason ? ` (reason: ${input.reason})` : ""}.`,
      };
    }
    const overrides = await getMenuOverrides();
    const current = overrides[input.itemId];
    await setMenuOverride(input.itemId, { ...current, available: false });
    return {
      ok: true,
      output: {
        itemId: input.itemId,
        previousAvailable: current?.available ?? true,
        nowAvailable: false,
      },
    };
  },
});

/** Order context — useful when the agent wants to reference an order
 *  while announcing an 86 (e.g. "we just ran out — orders #1234 and
 *  #1235 will need a swap"). Kept here because mark_item_86 callers
 *  often need the same shape.
 */
registerTool<{ orderId: string }>({
  name: "get_order_detail",
  description: "Fetch the full record for a single order including line items and refund history.",
  minRole: "staff",
  mutates: false,
  inputSchema: {
    type: "object" as const,
    properties: {
      orderId: { type: "string", description: "Order ID (e.g. 'ord-...')." },
    },
    required: ["orderId"],
  },
  async execute(input, ctx) {
    const order = await getOrderById(input.orderId);
    if (!order) return { ok: false, error: `Order '${input.orderId}' not found` };
    if (
      ctx.actor.locationScope !== "*" &&
      !ctx.actor.locationScope.split(",").includes(order.locationSlug)
    ) {
      return { ok: false, error: `Session is not authorized for location '${order.locationSlug}'` };
    }
    return { ok: true, output: order };
  },
});
