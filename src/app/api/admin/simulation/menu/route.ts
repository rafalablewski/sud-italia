import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  getIngredients,
  getOrders,
  getRecipes,
} from "@/lib/store";
import { getActiveLocations } from "@/data/locations";
import { getMenuWithOverrides } from "@/data/menus";
import type { MenuCategory } from "@/data/types";

interface MenuRow {
  id: string;
  name: string;
  category: MenuCategory;
  priceGrosze: number;
  /** Listed MenuItem.cost (operator-maintained). */
  costGrosze: number;
  /** Cost rolled up from the recipe + current ingredient prices, when a
   *  recipe exists. Falls back to costGrosze when there's no recipe. */
  recipeCostGrosze: number;
  /** Order quantity in the last 30 days at the selected location. */
  recentQty: number;
}

/**
 * Snapshot used by the simulation Menu Mix card: every available menu
 * item for a location, annotated with the recipe-derived food cost and
 * the actual order frequency from the last 30 days. The page lets the
 * operator set weight % per item and derives avgTicket + COGS from the
 * weighted mix.
 */
export const GET = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    const sp = req.nextUrl.searchParams;
    const location =
      sp.get("location")?.trim().toLowerCase() ||
      getActiveLocations()[0]?.slug ||
      "warszawa";

    const [menu, recipes, ingredients, orders] = await Promise.all([
      getMenuWithOverrides(location),
      getRecipes(),
      getIngredients(),
      getOrders(location),
    ]);

    const ingPrice = new Map(ingredients.map((i) => [i.id, i.costPerUnit]));
    const recipeCost = new Map<string, number>();
    for (const r of recipes) {
      if (r.ingredients.length === 0) continue;
      let total = 0;
      for (const ri of r.ingredients) {
        const unitCost = ingPrice.get(ri.ingredientId) ?? 0;
        total += unitCost * ri.quantity * (ri.wasteFactor || 1);
      }
      recipeCost.set(r.menuItemId, Math.round(total / (r.yieldPortions || 1)));
    }

    const since = Date.now() - 30 * 86_400_000;
    const counts = new Map<string, number>();
    for (const o of orders) {
      if (o.status === "cancelled") continue;
      const t = new Date(o.createdAt).getTime();
      if (!Number.isFinite(t) || t < since) continue;
      for (const line of o.items) {
        const id = line.menuItem?.id;
        if (!id) continue;
        counts.set(id, (counts.get(id) ?? 0) + line.quantity);
      }
    }

    const items: MenuRow[] = menu
      .filter((m) => m.available !== false)
      .map((m) => ({
        id: m.id,
        name: m.name,
        category: m.category,
        priceGrosze: m.price,
        costGrosze: m.cost ?? 0,
        recipeCostGrosze: recipeCost.get(m.id) ?? m.cost ?? 0,
        recentQty: counts.get(m.id) ?? 0,
      }))
      .sort((a, b) => {
        if (b.recentQty !== a.recentQty) return b.recentQty - a.recentQty;
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.name.localeCompare(b.name);
      });

    return NextResponse.json({ location, items });
  },
);
