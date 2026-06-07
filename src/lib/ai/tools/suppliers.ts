import { getSuppliers, getPurchaseOrders } from "@/lib/store";
import { registerTool } from "./registry";
import { scopeError, defaultLocation } from "./scope";

/**
 * get_suppliers_and_pos — read-only supply-chain picture for the COO:
 * the supplier directory plus recent purchase orders and their status
 * (draft/sent/received/cancelled). Use to chase a late delivery or spot
 * over/under-ordering.
 */
registerTool<{ locationSlug?: string }>({
  name: "get_suppliers_and_pos",
  description:
    "Read-only supplier directory + recent purchase orders with status (draft/sent/received/cancelled) " +
    "and totals. Use to chase late deliveries, assess lead times, and judge reorder cadence.",
  minRole: "manager",
  mutates: false,
  inputSchema: {
    type: "object" as const,
    properties: {
      locationSlug: { type: "string", description: "Optional single-location filter for purchase orders." },
    },
  },
  async execute(input, ctx) {
    const err = scopeError(ctx, input.locationSlug);
    if (err) return { ok: false, error: err };
    const loc = defaultLocation(ctx, input.locationSlug);
    const [suppliers, pos] = await Promise.all([
      getSuppliers(),
      getPurchaseOrders(loc ? { locationSlug: loc } : undefined),
    ]);
    const statusCounts = pos.reduce<Record<string, number>>((acc, p) => {
      acc[p.status] = (acc[p.status] ?? 0) + 1;
      return acc;
    }, {});
    return {
      ok: true,
      output: {
        suppliers: suppliers.map((s) => ({ name: s.name, leadTimeDays: s.leadTimeDays, contact: s.contactName })),
        purchaseOrderStatusCounts: statusCounts,
        recentPurchaseOrders: pos.slice(0, 20).map((p) => ({
          id: p.id,
          supplierId: p.supplierId,
          locationSlug: p.locationSlug,
          status: p.status,
          totalGrosze: p.totalCents,
          expectedAt: p.expectedAt,
          createdAt: p.createdAt,
        })),
      },
    };
  },
});
