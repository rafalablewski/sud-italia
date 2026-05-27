"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FlaskConical } from "lucide-react";
import type { MenuCategory } from "@/data/types";
import { MENU_CATEGORY_LABELS } from "@/data/types";
import { getActiveLocations } from "@/data/locations";
import { formatPrice, getBaseSlug } from "@/lib/utils";
import {
  Chip,
  ChipStrip,
  MobileList,
  MobilePage,
  PageHeader,
  PullToRefresh,
  type MobileListItem,
} from "../v2/mobile";
import { MobileRecipeEditor } from "./MobileRecipeEditor";

const ACTIVE_LOCATIONS = getActiveLocations();

interface MenuItemRow {
  id: string;
  name: string;
  category: MenuCategory;
  price: number;
  cost: number;
}

interface DishOffer {
  slug: string;
  city: string;
  itemId: string;
  price: number;
}

interface RecipeRow {
  menuItemId: string;
  calculatedCost?: number;
  yieldPortions: number;
  enrichedIngredients?: Array<{
    ingredientId: string;
    quantity: number;
    wasteFactor: number;
    name?: string;
    unit?: string;
    unitCost?: number;
  }>;
  prepTimeMinutes?: number;
  notes?: string;
}

interface IngredientData {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number;
}

interface CombinedRow {
  baseSlug: string;
  name: string;
  category: MenuCategory;
  baseCost: number;
  recipeCost?: number;
  hasRecipe: boolean;
  offers: DishOffer[];
  exclusiveCities: string[];
}

/**
 * Mobile recipes — read-only costing overview. Recipes are chain-wide, so
 * there's no location switch: each dish shows once (deduped by base slug)
 * with its shared cost and per-location margin. Editing the ingredient
 * table stays desktop per the audit (multi-row form is unsalvageable on a
 * phone).
 */
export function MobileRecipes() {
  const [menusByLoc, setMenusByLoc] = useState<Record<string, MenuItemRow[]>>({});
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [ingredients, setIngredients] = useState<IngredientData[]>([]);
  const [cat, setCat] = useState<MenuCategory | "all">("all");
  const [editing, setEditing] = useState<
    { id: string; name: string; price: number; offers: DishOffer[] } | null
  >(null);

  const refresh = useCallback(async () => {
    // Menus are per-location; recipes + ingredients are chain-wide
    // (recipes keyed by dish base slug, ingredients keyed by id).
    const [menuLists, r, i] = await Promise.all([
      Promise.all(
        ACTIVE_LOCATIONS.map((l) =>
          fetch(`/api/admin/menu?location=${encodeURIComponent(l.slug)}`).then((res) =>
            res.ok ? res.json() : [],
          ),
        ),
      ),
      fetch("/api/admin/recipes").then((res) => (res.ok ? res.json() : [])),
      fetch("/api/admin/ingredients").then((res) => (res.ok ? res.json() : [])),
    ]);
    const byLoc: Record<string, MenuItemRow[]> = {};
    ACTIVE_LOCATIONS.forEach((l, idx) => {
      byLoc[l.slug] = Array.isArray(menuLists[idx]) ? menuLists[idx] : [];
    });
    setMenusByLoc(byLoc);
    setRecipes(Array.isArray(r) ? r : []);
    setIngredients(Array.isArray(i) ? i : []);
  }, []);

  useEffect(() => {
    // Initial load. setState lands after the awaited fetch, not
    // synchronously, so the cascading-render warning is a false positive.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const recipeByBaseSlug = useMemo(() => {
    const m = new Map<string, RecipeRow>();
    for (const r of recipes) m.set(r.menuItemId, r);
    return m;
  }, [recipes]);

  // Collapse every location's menu into one dish per base slug.
  const combined: CombinedRow[] = useMemo(() => {
    const groups = new Map<string, CombinedRow>();
    for (const loc of ACTIVE_LOCATIONS) {
      for (const it of menusByLoc[loc.slug] ?? []) {
        if (cat !== "all" && it.category !== cat) continue;
        const base = getBaseSlug(it.id);
        let g = groups.get(base);
        if (!g) {
          const r = recipeByBaseSlug.get(base);
          g = {
            baseSlug: base,
            name: it.name,
            category: it.category,
            baseCost: it.cost,
            recipeCost: r?.calculatedCost,
            hasRecipe: !!r,
            offers: [],
            exclusiveCities: [],
          };
          groups.set(base, g);
        }
        g.offers.push({ slug: loc.slug, city: loc.city, itemId: it.id, price: it.price });
      }
    }
    for (const g of groups.values()) {
      if (g.offers.length < ACTIVE_LOCATIONS.length) {
        g.exclusiveCities = g.offers.map((o) => o.city);
      }
    }
    return Array.from(groups.values());
  }, [menusByLoc, recipeByBaseSlug, cat]);

  const rows: MobileListItem<CombinedRow>[] = combined.map((r) => {
    const cost = r.recipeCost ?? r.baseCost;
    const margins = r.offers.map((o) => (o.price ? ((o.price - cost) / o.price) * 100 : 0));
    const minMargin = margins.length ? Math.min(...margins) : 0;
    const maxMargin = margins.length ? Math.max(...margins) : 0;
    const tone: "success" | "warning" | "danger" =
      minMargin >= 60 ? "success" : minMargin >= 40 ? "warning" : "danger";
    const marginLabel =
      Math.round(minMargin) === Math.round(maxMargin)
        ? `${minMargin.toFixed(0)}%`
        : `${minMargin.toFixed(0)}–${maxMargin.toFixed(0)}%`;
    const exclusive = r.exclusiveCities.length > 0 ? ` · ${r.exclusiveCities.join(" + ")} only` : "";
    const rep = r.offers[0];
    return {
      id: r.baseSlug,
      data: r,
      icon: FlaskConical,
      iconTone: r.hasRecipe ? "info" : "neutral",
      title: r.name,
      subtitle: `${MENU_CATEGORY_LABELS[r.category] ?? r.category} · ${r.hasRecipe ? "recipe" : "no recipe"}${exclusive}`,
      trailing: `${formatPrice(cost)}`,
      status: { label: marginLabel, tone },
      onTap: () =>
        rep && setEditing({ id: rep.itemId, name: r.name, price: rep.price, offers: r.offers }),
    };
  });

  const CATS: (MenuCategory | "all")[] = [
    "all",
    "pizza",
    "pasta",
    "antipasti",
    "panini",
    "drinks",
    "desserts",
  ];

  return (
    <>
      <PullToRefresh onRefresh={refresh}>
        <MobilePage
          toolbar={
            <ChipStrip ariaLabel="Category">
              {CATS.map((c) => (
                <Chip
                  key={c}
                  label={c === "all" ? "All" : MENU_CATEGORY_LABELS[c]}
                  active={cat === c}
                  onClick={() => setCat(c)}
                />
              ))}
            </ChipStrip>
          }
        >
          <PageHeader
            title="Recipes"
            subtitle={`${combined.length} dishes · shared across all locations · tap to edit`}
          />
          <MobileList items={rows} virtualizeAt={64} />
        </MobilePage>
      </PullToRefresh>
      <MobileRecipeEditor
        menuItem={editing}
        offers={editing?.offers}
        recipe={editing ? recipeByBaseSlug.get(getBaseSlug(editing.id)) : undefined}
        ingredients={ingredients}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await refresh();
        }}
      />
    </>
  );
}
