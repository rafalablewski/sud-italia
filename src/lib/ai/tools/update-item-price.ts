import { getMenuOverrides, setMenuOverride } from "@/lib/store";
import { getMenuWithOverrides } from "@/data/menus";
import type { MenuItem } from "@/data/types";
import { registerTool } from "./registry";
import { scopeError } from "./scope";

/**
 * update_item_price — set a menu item's listed price at one location.
 * MUTATING + manager+: it surfaces a preview card (old → new price, new
 * margin) the operator must approve before it writes. Per CLAUDE.md
 * Rule #10 only the *listed price* varies per location — the recipe and
 * ingredients stay chain-wide — so this writes a per-location price
 * override only, never forks a recipe.
 *
 * This is the CFO/CEO's lever: "advisory + gated actions" — the agent
 * proposes the reprice from the margin data, the human approves.
 */
registerTool<{ itemId: string; locationSlug: string; newPriceGrosze: number; reason?: string }>({
  name: "update_item_price",
  description:
    "Change the listed price of a menu item at one location (price is per-location; the recipe stays " +
    "chain-wide). Provide the location-prefixed itemId (e.g. 'krk-pizza-margherita'), the locationSlug, and " +
    "newPriceGrosze (grosze; 2790 = 27.90 PLN). Mutates state — the operator approves a preview first.",
  minRole: "manager",
  mutates: true,
  inputSchema: {
    type: "object" as const,
    properties: {
      itemId: { type: "string", description: "Location-prefixed menu item id, e.g. 'krk-pizza-margherita'." },
      locationSlug: { type: "string", description: "Location whose listed price changes, e.g. 'krakow'." },
      newPriceGrosze: { type: "number", description: "New price in grosze (2790 = 27.90 PLN)." },
      reason: { type: "string", description: "Optional reason — recorded in the audit trail." },
    },
    required: ["itemId", "locationSlug", "newPriceGrosze"],
  },
  async execute(input, ctx) {
    const err = scopeError(ctx, input.locationSlug);
    if (err) return { ok: false, error: err };
    const newPrice = Math.round(input.newPriceGrosze);
    if (!Number.isFinite(newPrice) || newPrice <= 0) {
      return { ok: false, error: "newPriceGrosze must be a positive number of grosze." };
    }

    const menu = await getMenuWithOverrides(input.locationSlug);
    const item = menu.find((m: MenuItem) => m.id === input.itemId);
    if (!item) {
      return { ok: false, error: `Item '${input.itemId}' not found on the ${input.locationSlug} menu.` };
    }

    const fmt = (g: number) => `${(g / 100).toFixed(2)} PLN`;
    const oldMarginPct = item.price > 0 ? Math.round(((item.price - item.cost) / item.price) * 100) : 0;
    const newMarginPct = newPrice > 0 ? Math.round(((newPrice - item.cost) / newPrice) * 100) : 0;

    if (ctx.dryRun) {
      return {
        ok: true,
        preview:
          `Reprice "${item.name}" at ${input.locationSlug}: ${fmt(item.price)} → ${fmt(newPrice)} ` +
          `(margin ${oldMarginPct}% → ${newMarginPct}%, food cost ${fmt(item.cost)})` +
          (input.reason ? ` — ${input.reason}` : ""),
      };
    }

    const overrides = await getMenuOverrides();
    await setMenuOverride(input.itemId, { ...overrides[input.itemId], price: newPrice });
    return {
      ok: true,
      output: {
        itemId: input.itemId,
        locationSlug: input.locationSlug,
        previousPriceGrosze: item.price,
        newPriceGrosze: newPrice,
        previousMarginPct: oldMarginPct,
        newMarginPct,
      },
    };
  },
});
