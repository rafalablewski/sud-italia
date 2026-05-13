import { getOrders } from "@/lib/store";
import { registerTool } from "./registry";

/**
 * query_orders — read-only filter over orders. Staff+ can call; results
 * are pre-filtered to the actor's locationScope (a "warszawa" staff
 * session sees only warszawa orders even if it asks for "krakow").
 */
registerTool<{ locationSlug?: string; status?: string; limit?: number; sinceIso?: string }>({
  name: "query_orders",
  description:
    "List recent orders, optionally filtered by location, status, or time. " +
    "Returns up to `limit` matches (default 20, max 100), most recent first. " +
    "Read-only — does not modify any order.",
  minRole: "staff",
  mutates: false,
  inputSchema: {
    type: "object" as const,
    properties: {
      locationSlug: {
        type: "string",
        description: "Filter to a single location slug (e.g. 'krakow'). Optional.",
      },
      status: {
        type: "string",
        description:
          "Order status filter — one of pending, confirmed, preparing, ready, assigned, picked_up, delivered, completed, cancelled.",
      },
      limit: {
        type: "number",
        description: "Maximum number of orders to return (default 20, max 100).",
      },
      sinceIso: {
        type: "string",
        description: "ISO timestamp — only return orders created at or after this instant.",
      },
    },
  },
  async execute(input, ctx) {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const sinceMs = input.sinceIso ? new Date(input.sinceIso).getTime() : 0;

    const requestedScope = input.locationSlug;
    // Honour locationScope claim — staff/manager scoped to one location
    // can't peek at sibling locations via the agent. Owner wildcard
    // ('*') passes through.
    if (
      requestedScope &&
      ctx.actor.locationScope !== "*" &&
      !ctx.actor.locationScope.split(",").includes(requestedScope)
    ) {
      return { ok: false, error: `Session is not authorized for location '${requestedScope}'` };
    }

    let orders = await getOrders(requestedScope);
    if (!requestedScope && ctx.actor.locationScope !== "*") {
      const allowed = new Set(ctx.actor.locationScope.split(","));
      orders = orders.filter((o) => allowed.has(o.locationSlug));
    }

    if (input.status) {
      orders = orders.filter((o) => o.status === input.status);
    }
    if (sinceMs > 0) {
      orders = orders.filter((o) => new Date(o.createdAt).getTime() >= sinceMs);
    }

    const trimmed = orders
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit)
      .map((o) => ({
        id: o.id,
        locationSlug: o.locationSlug,
        status: o.status,
        totalGrosze: o.totalAmount,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        createdAt: o.createdAt,
        paidAt: o.paidAt,
        fulfillmentType: o.fulfillmentType,
      }));

    return { ok: true, output: { count: trimmed.length, orders: trimmed } };
  },
});
