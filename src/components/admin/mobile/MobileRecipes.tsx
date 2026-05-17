"use client";

import { useEffect, useMemo, useState } from "react";
import { FlaskConical } from "lucide-react";
import type { MenuCategory } from "@/data/types";
import { MENU_CATEGORY_LABELS } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import {
  Chip,
  ChipStrip,
  MobileList,
  MobilePage,
  PageHeader,
  PullToRefresh,
  type MobileListItem,
} from "../v2/mobile";

interface MenuItemRow {
  id: string;
  name: string;
  category: MenuCategory;
  price: number;
  cost: number;
}

interface RecipeRow {
  menuItemId: string;
  calculatedCost?: number;
  yieldPortions: number;
}

interface CombinedRow {
  id: string;
  name: string;
  category: MenuCategory;
  price: number;
  baseCost: number;
  recipeCost?: number;
  hasRecipe: boolean;
}

/**
 * Mobile recipes — read-only costing overview. Each row shows menu item,
 * base cost vs recipe cost, and margin tone. Editing the ingredient table
 * stays desktop per the audit (multi-row form is unsalvageable on a phone).
 */
export function MobileRecipes() {
  const [items, setItems] = useState<MenuItemRow[]>([]);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [cat, setCat] = useState<MenuCategory | "all">("all");

  const refresh = async () => {
    const [m, r] = await Promise.all([
      fetch("/api/admin/menu").then((res) => (res.ok ? res.json() : [])),
      fetch("/api/admin/recipes").then((res) => (res.ok ? res.json() : [])),
    ]);
    setItems(Array.isArray(m) ? m : []);
    setRecipes(Array.isArray(r) ? r : []);
  };

  useEffect(() => { refresh(); }, []);

  const combined: CombinedRow[] = useMemo(() => {
    const byId = new Map(recipes.map((r) => [r.menuItemId, r]));
    return items
      .filter((it) => cat === "all" || it.category === cat)
      .map((it) => {
        const r = byId.get(it.id);
        return {
          id: it.id,
          name: it.name,
          category: it.category,
          price: it.price,
          baseCost: it.cost,
          recipeCost: r?.calculatedCost,
          hasRecipe: !!r,
        };
      });
  }, [items, recipes, cat]);

  const rows: MobileListItem<CombinedRow>[] = combined.map((r) => {
    const cost = r.recipeCost ?? r.baseCost;
    const margin = r.price ? ((r.price - cost) / r.price) * 100 : 0;
    const tone: "success" | "warning" | "danger" =
      margin >= 60 ? "success" : margin >= 40 ? "warning" : "danger";
    return {
      id: r.id,
      data: r,
      icon: FlaskConical,
      iconTone: r.hasRecipe ? "info" : "neutral",
      title: r.name,
      subtitle: `${MENU_CATEGORY_LABELS[r.category] ?? r.category} · ${r.hasRecipe ? "recipe" : "no recipe"}`,
      trailing: `${formatPrice(cost)}`,
      status: { label: `${margin.toFixed(0)}%`, tone },
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
                count={c === "all" ? items.length : items.filter((i) => i.category === c).length}
              />
            ))}
          </ChipStrip>
        }
      >
        <PageHeader title="Recipes" subtitle={`${combined.length} items`} />
        <MobileList items={rows} virtualizeAt={64} />
      </MobilePage>
    </PullToRefresh>
  );
}
