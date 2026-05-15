import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  appendAuditLog,
  getIngredients,
  getMenuOverrides,
  getRecipes,
  setMenuOverride,
  setMenuOverridesBulk,
  type MenuOverride,
} from "@/lib/store";
import { getMenu } from "@/data/menus";
import { locations } from "@/data/locations";
import { menuOverridePutSchema, parseBody } from "@/lib/api-schemas";

/** Per-portion food cost for every dish that has a recipe, computed in a single
 * pass instead of N+1 calls to calculateFoodCost. The recipe is the source of
 * truth: any item with a recipe gets its menu-shown cost derived from the
 * current ingredient prices, so the Menu and Recipes admin pages can never
 * disagree (or drift when an ingredient price changes). */
async function getRecipeCostMap(): Promise<Map<string, number>> {
  const [recipes, ingredients] = await Promise.all([getRecipes(), getIngredients()]);
  const priceById = new Map(ingredients.map((i) => [i.id, i.costPerUnit]));
  const map = new Map<string, number>();
  for (const r of recipes) {
    if (r.ingredients.length === 0) continue;
    let total = 0;
    for (const ri of r.ingredients) {
      const unitCost = priceById.get(ri.ingredientId) ?? 0;
      total += unitCost * ri.quantity * (ri.wasteFactor || 1);
    }
    map.set(r.menuItemId, Math.round(total / (r.yieldPortions || 1)));
  }
  return map;
}

// Menu reads are scoped per-location when a slug is provided. When omitted
// (returning all locations' menus), the session must hold unrestricted scope
// — withAdmin's "missing locationParam = require *" semantics enforces that.
export const GET = withAdmin(
  { locationParam: "location" },
  async (_req, _ctx, { locationSlug }) => {
    const [overrides, recipeCosts] = await Promise.all([
      getMenuOverrides(),
      getRecipeCostMap(),
    ]);

    const enrich = (item: ReturnType<typeof getMenu>[number]) => {
      const override = overrides[item.id];
      const recipeCost = recipeCosts.get(item.id);
      const hasRecipe = recipeCost !== undefined;
      // Recipe is canonical: when one exists, its computed per-portion cost
      // wins over both the seed cost and the override.cost (override.cost is
      // still stored, but reflects whatever was last synced — possibly stale).
      const cost = hasRecipe ? recipeCost : (override?.cost ?? item.cost);
      // An override that contains only `cost` is the recipe-save sync, not a
      // human edit — don't surface "Overridden" for it.
      const overrideKeys = override ? Object.keys(override).filter((k) => k !== "cost") : [];
      return {
        ...item,
        ...override,
        cost,
        _hasOverride: overrideKeys.length > 0,
        _hasRecipe: hasRecipe,
        _costSource: hasRecipe ? "recipe" : override?.cost !== undefined ? "override" : "seed",
      };
    };

    if (locationSlug) {
      const merged = getMenu(locationSlug).map(enrich);
      return NextResponse.json(merged);
    }

    const active = locations.filter((l) => l.isActive);
    const result: Record<string, unknown[]> = {};
    for (const loc of active) {
      result[loc.slug] = getMenu(loc.slug).map(enrich);
    }
    return NextResponse.json(result);
  },
);

/** Menu-name lookup across every active location so audit entries include
 * the human-readable item name without forcing the caller to send it.
 * Menu data is static (seed code), so the result never changes within a
 * single Node process — cached at module scope to keep PUT requests fast
 * as the chain scales out to more trucks / SKUs. */
let cachedMenuItemNames: Map<string, string> | null = null;
function buildMenuItemNames(): Map<string, string> {
  if (cachedMenuItemNames) return cachedMenuItemNames;
  const lookup = new Map<string, string>();
  for (const loc of locations) {
    if (!loc.isActive) continue;
    for (const item of getMenu(loc.slug)) lookup.set(item.id, item.name);
  }
  cachedMenuItemNames = lookup;
  return lookup;
}

// Menu overrides (price, availability, 86'ing) touch revenue + customer
// experience — manager+ only. The override map is keyed by item id and is
// effectively global across locations; cross-location tightening waits for
// Phase 1 normalized menu_items.
export const PUT = withAdmin(
  { roles: ["manager", "owner"] },
  async (req, _ctx, { user }) => {
    const parsed = await parseBody(req, menuOverridePutSchema);
    if ("error" in parsed) return parsed.error;
    const body = parsed.data;
    const previousOverrides = await getMenuOverrides();
    const names = buildMenuItemNames();

    const writeAudits = async (updates: Record<string, MenuOverride>) => {
        for (const [id, next] of Object.entries(updates)) {
          const prev = previousOverrides[id];
          if (typeof next.available === "boolean" && prev?.available !== next.available) {
            await appendAuditLog({
              actor: user.email || user.id,
              action: next.available ? "menu.item_available" : "menu.item_86",
              entityType: "menu_item",
              entityId: id,
              before: { available: prev?.available ?? true },
              after: { available: next.available, name: names.get(id) ?? null },
            });
          }
          const otherChanged =
            (next.price !== undefined && next.price !== prev?.price) ||
            (next.cost !== undefined && next.cost !== prev?.cost) ||
            (next.name !== undefined && next.name !== prev?.name) ||
            (next.description !== undefined && next.description !== prev?.description) ||
            (next.menuRole !== undefined && next.menuRole !== prev?.menuRole) ||
            (next.isLimited !== undefined && next.isLimited !== prev?.isLimited) ||
            (next.limitedUntil !== undefined && next.limitedUntil !== prev?.limitedUntil);
          if (otherChanged) {
            await appendAuditLog({
              actor: user.email || user.id,
              action: "menu.override_update",
              entityType: "menu_item",
              entityId: id,
              before: prev ?? null,
              after: next,
            });
          }
        }
      };

    if (body.items) {
      const updates = body.items as Record<string, MenuOverride>;
      await setMenuOverridesBulk(updates);
      await writeAudits(updates);
      return NextResponse.json({ success: true });
    }

    // Schema's refine guarantees `id` is present when `items` is absent.
    const { id, items: _items, ...override } = body;
    const singleId = id as string;
    await setMenuOverride(singleId, override as MenuOverride);
    await writeAudits({ [singleId]: override as MenuOverride });
    return NextResponse.json({ success: true });
  },
);
