import { computeSimulationActuals, computeSssg, getBusinessCosts } from "@/lib/store";
import { registerTool } from "./registry";

/**
 * get_pnl_snapshot — read-only P&L truth for the CFO/CEO. Combines the
 * honest weighted COGS + ticket/volume actuals from the orders table
 * with same-store sales growth and the active fixed-cost ledger, so the
 * agent can reason about food cost %, prime cost, and trend without
 * re-deriving the math.
 */
registerTool<{ windowDays?: number }>({
  name: "get_pnl_snapshot",
  description:
    "Read-only P&L snapshot from real orders + the cost ledger: order volume, average ticket, " +
    "weighted food-cost % (honest COGS from the actual menu mix), delivery/takeout share, refund rate, " +
    "same-store sales growth (revenue/orders/ticket/customers), and active recurring business costs. " +
    "Use to assess margin, prime cost, and growth. windowDays defaults to 30.",
  minRole: "manager",
  mutates: false,
  inputSchema: {
    type: "object" as const,
    properties: {
      windowDays: {
        type: "number",
        description: "Trailing window in days for the actuals + growth comparison (default 30).",
      },
    },
  },
  async execute(input) {
    const windowDays = Math.min(180, Math.max(7, Math.round(input.windowDays ?? 30)));
    const [actuals, sssg, costs] = await Promise.all([
      computeSimulationActuals(windowDays),
      computeSssg(windowDays),
      getBusinessCosts({ status: "active" }),
    ]);
    // Normalise every recurring cost to a monthly figure so the agent
    // can compare fixed cost against revenue without re-deriving it.
    const perMonth: Record<string, number> = {
      weekly: 52 / 12,
      biweekly: 26 / 12,
      monthly: 1,
      quarterly: 1 / 3,
      annual: 1 / 12,
      "one-off": 0,
    };
    let monthlyFixedGrosze = 0;
    const byCategory: Record<string, number> = {};
    for (const c of costs) {
      const monthly = Math.round((c.amountGrosze ?? 0) * (perMonth[c.frequency] ?? 0));
      monthlyFixedGrosze += monthly;
      byCategory[c.category] = (byCategory[c.category] ?? 0) + monthly;
    }
    return {
      ok: true,
      output: {
        actuals,
        sameStoreSalesGrowth: sssg,
        fixedCosts: {
          monthlyFixedGrosze,
          byCategoryMonthlyGrosze: byCategory,
          activeLineCount: costs.length,
        },
      },
    };
  },
});
