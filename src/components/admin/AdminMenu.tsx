"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminNav } from "./AdminNav";
import {
  MapPin, Eye, EyeOff, Save, Search, ChevronDown, ChevronUp,
  FlaskConical, ExternalLink,
} from "lucide-react";
import { locations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import { formatQty, marginColorClass } from "@/lib/admin-utils";
import { MENU_CATEGORY_LABELS, type MenuCategory } from "@/data/types";
import Link from "next/link";

const activeLocations = locations.filter((l) => l.isActive);
const CATEGORY_ORDER: MenuCategory[] = ["pizza", "pasta", "antipasti", "panini", "drinks", "desserts"];

interface IngredientData {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number;
}

interface EnrichedRecipeIngredient {
  ingredientId: string;
  quantity: number;
  wasteFactor: number;
  name: string;
  unit: string;
  unitCost: number;
  lineCost: number;
}

interface RecipeData {
  menuItemId: string;
  ingredients: EnrichedRecipeIngredient[];
  prepTimeMinutes?: number;
  yieldPortions: number;
  notes?: string;
  calculatedCost: number;
  enrichedIngredients: EnrichedRecipeIngredient[];
}

interface MenuItemData {
  id: string;
  name: string;
  description: string;
  price: number;
  cost: number;
  category: MenuCategory;
  tags: string[];
  available: boolean;
  _hasOverride: boolean;
}

export function AdminMenu() {
  const [selectedLocation, setSelectedLocation] = useState(activeLocations[0]?.slug || "");
  const [items, setItems] = useState<MenuItemData[]>([]);
  const [recipes, setRecipes] = useState<RecipeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const [availabilityChanges, setAvailabilityChanges] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [menuRes, recipesRes] = await Promise.all([
        fetch(`/api/admin/menu?location=${selectedLocation}`),
        fetch("/api/admin/recipes"),
      ]);
      if (menuRes.ok) setItems(await menuRes.json());
      if (recipesRes.ok) setRecipes(await recipesRes.json());
    } catch (err) {
      console.error("Failed to fetch:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedLocation]);

  useEffect(() => {
    fetchAll();
    setAvailabilityChanges({});
    setSaved(false);
    setExpandedItem(null);
  }, [selectedLocation, fetchAll]);

  const recipeMap = new Map(recipes.map((r) => [r.menuItemId, r]));

  const toggleAvailability = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const current = availabilityChanges[id] ?? item.available;
    setAvailabilityChanges((prev) => ({ ...prev, [id]: !current }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (Object.keys(availabilityChanges).length === 0) return;
    setSaving(true);
    const updates: Record<string, { available: boolean }> = {};
    for (const [id, available] of Object.entries(availabilityChanges)) {
      updates[id] = { available };
    }
    await fetch("/api/admin/menu", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: updates }),
    });
    setAvailabilityChanges({});
    setSaved(true);
    setSaving(false);
    fetchAll();
  };

  const hasChanges = Object.keys(availabilityChanges).length > 0;

  const filteredItems = items.filter((item) => {
    if (filterCategory && item.category !== filterCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
    }
    return true;
  });

  const categories = CATEGORY_ORDER.filter((cat) => items.some((i) => i.category === cat));
  const groupedItems = categories
    .map((cat) => ({
      category: cat,
      label: MENU_CATEGORY_LABELS[cat],
      items: filteredItems.filter((i) => i.category === cat),
    }))
    .filter((g) => g.items.length > 0);

  const unavailableCount = items.filter((i) => (availabilityChanges[i.id] ?? i.available) === false).length;
  const withRecipeCount = items.filter((i) => recipeMap.has(i.id)).length;

  return (
    <>
      <AdminNav />
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-bold font-heading gradient-text">Menu</h1>
            <p className="text-sm admin-text-muted mt-0.5">
              {items.length} items &middot; {withRecipeCount} with recipes
              {unavailableCount > 0 && ` \u00B7 ${unavailableCount} hidden`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 glass-btn-green text-white rounded-xl font-semibold text-sm disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : `Save (${Object.keys(availabilityChanges).length})`}
              </button>
            )}
          </div>
        </div>

        {saved && (
          <div className="mb-4 p-3 bg-green-500/20 border border-green-500/30 rounded-xl text-sm text-green-300 font-medium">
            Menu updated.
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 admin-text-muted" />
            <select value={selectedLocation} onChange={(e) => setSelectedLocation(e.target.value)} className="glass-input rounded-lg text-sm">
              {activeLocations.map((loc) => (
                <option key={loc.slug} value={loc.slug}>{loc.city}</option>
              ))}
            </select>
          </div>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="glass-input rounded-lg text-sm">
            <option value="">All categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{MENU_CATEGORY_LABELS[cat]}</option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 admin-text-muted" />
            <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 glass-input rounded-lg text-sm" />
          </div>
        </div>

        {/* Items */}
        {loading ? (
          <div className="text-center py-12 admin-text-muted">Loading...</div>
        ) : (
          <div className="space-y-8">
            {groupedItems.map((group) => (
              <div key={group.category}>
                <h2 className="text-lg font-bold font-heading admin-text mb-3">
                  {group.label}
                  <span className="text-xs font-normal admin-text-muted ml-2">({group.items.length})</span>
                </h2>
                <div className="space-y-2">
                  {group.items.map((item) => {
                    const recipe = recipeMap.get(item.id);
                    const isAvailable = availabilityChanges[item.id] ?? item.available;
                    const foodCost = recipe?.calculatedCost ?? item.cost;
                    const margin = item.price > 0 ? Math.round(((item.price - foodCost) / item.price) * 100) : 0;
                    const isExpanded = expandedItem === item.id;
                    const hasRecipe = !!recipe && recipe.enrichedIngredients?.length > 0;

                    return (
                      <div
                        key={item.id}
                        className={`rounded-xl shadow-sm overflow-hidden transition-colors ${
                          !isAvailable ? "bg-white/5 border border-white/10 opacity-60" : "glass-card"
                        }`}
                      >
                        {/* Main row */}
                        <div className="flex flex-wrap items-center gap-3 p-4">
                          <button
                            onClick={() => toggleAvailability(item.id)}
                            className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                              isAvailable ? "bg-italia-green/10 text-italia-green" : "bg-white/10 text-gray-400"
                            }`}
                            title={isAvailable ? "Mark sold out" : "Mark available"}
                          >
                            {isAvailable ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                          </button>

                          <div className="flex-1 min-w-[180px]">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold admin-text">{item.name}</span>
                              {item.tags.map((tag) => (
                                <span key={tag} className="px-1.5 py-0.5 bg-white/10 admin-text-dim text-[10px] font-medium rounded">{tag}</span>
                              ))}
                            </div>
                            <p className="text-xs admin-text-muted mt-0.5 line-clamp-1">{item.description}</p>
                          </div>

                          <div className="flex items-center gap-4 text-sm flex-shrink-0">
                            <div className="text-center">
                              <div className="text-[10px] admin-text-muted">Price</div>
                              <div className="font-bold admin-text">{formatPrice(item.price)}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-[10px] admin-text-muted">Food Cost</div>
                              <div className={`font-bold ${hasRecipe ? "admin-text" : "text-gray-400"}`}>
                                {formatPrice(foodCost)}
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-[10px] admin-text-muted">Margin</div>
                              <span className={`font-bold ${marginColorClass(margin)}`}>
                                {margin}%
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                            className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border transition-colors flex-shrink-0 ${
                              hasRecipe
                                ? "border-italia-green/30 bg-italia-green/5 text-italia-green hover:bg-italia-green/10"
                                : "border-white/10 admin-text-muted hover:bg-white/5"
                            }`}
                          >
                            <FlaskConical className="h-3.5 w-3.5" />
                            {hasRecipe ? `${recipe.enrichedIngredients.length} ingredients` : "No recipe"}
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>
                        </div>

                        {/* Expanded: ingredient cost breakdown */}
                        {isExpanded && (
                          <div className="border-t border-white/10 bg-white/5 p-4">
                            {hasRecipe ? (
                              <>
                                {/* Ingredient table */}
                                <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden mb-3">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="bg-white/5 text-left text-[11px] font-semibold admin-text-muted uppercase">
                                        <th className="px-3 py-2">Ingredient</th>
                                        <th className="px-3 py-2 text-right">Qty / portion</th>
                                        <th className="px-3 py-2 text-right">Unit cost</th>
                                        <th className="px-3 py-2 text-right">Waste</th>
                                        <th className="px-3 py-2 text-right">Line cost</th>
                                        <th className="px-3 py-2 text-right">% of total</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {recipe.enrichedIngredients.map((ri, idx) => {
                                        const pctOfTotal = recipe.calculatedCost > 0
                                          ? Math.round((ri.lineCost / (recipe.calculatedCost * (recipe.yieldPortions || 1))) * 100)
                                          : 0;
                                        const qtyPerPortion = recipe.yieldPortions > 1
                                          ? ri.quantity / recipe.yieldPortions
                                          : ri.quantity;

                                        return (
                                          <tr key={idx} className="border-t border-white/5">
                                            <td className="px-3 py-2 font-medium admin-text">{ri.name}</td>
                                            <td className="px-3 py-2 text-right admin-text">
                                              {formatQty(qtyPerPortion, ri.unit)}
                                            </td>
                                            <td className="px-3 py-2 text-right admin-text-muted">
                                              {formatPrice(ri.unitCost)}/{ri.unit}
                                            </td>
                                            <td className="px-3 py-2 text-right admin-text-muted">
                                              {ri.wasteFactor > 1 ? `+${Math.round((ri.wasteFactor - 1) * 100)}%` : "—"}
                                            </td>
                                            <td className="px-3 py-2 text-right font-semibold admin-text">
                                              {formatPrice(Math.round(ri.lineCost / (recipe.yieldPortions || 1)))}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                              <div className="flex items-center justify-end gap-1.5">
                                                <div className="w-12 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                  <div className="h-full bg-italia-red/50 rounded-full" style={{ width: `${Math.min(pctOfTotal, 100)}%` }} />
                                                </div>
                                                <span className="text-xs admin-text-muted w-8 text-right">{pctOfTotal}%</span>
                                              </div>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                    <tfoot>
                                      <tr className="border-t-2 border-white/10 bg-white/5 font-bold">
                                        <td className="px-3 py-2 admin-text" colSpan={4}>
                                          Total food cost per portion
                                          {recipe.yieldPortions > 1 && (
                                            <span className="font-normal text-xs admin-text-muted ml-1">
                                              (recipe yields {recipe.yieldPortions} portions)
                                            </span>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-right admin-red font-bold">
                                          {formatPrice(recipe.calculatedCost)}
                                        </td>
                                        <td className="px-3 py-2 text-right text-xs admin-text-muted">100%</td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>

                                {/* Summary bar */}
                                <div className="flex flex-wrap items-center gap-4 text-sm">
                                  <div>
                                    <span className="text-xs admin-text-muted">Selling price: </span>
                                    <span className="font-bold admin-text">{formatPrice(item.price)}</span>
                                  </div>
                                  <div>
                                    <span className="text-xs admin-text-muted">Food cost: </span>
                                    <span className="font-bold admin-red">{formatPrice(recipe.calculatedCost)}</span>
                                  </div>
                                  <div>
                                    <span className="text-xs admin-text-muted">Gross profit: </span>
                                    <span className="font-bold text-italia-green">{formatPrice(item.price - recipe.calculatedCost)}</span>
                                  </div>
                                  <div>
                                    <span className="text-xs admin-text-muted">Margin: </span>
                                    <span className={`font-bold ${marginColorClass(margin)}`}>
                                      {margin}%
                                    </span>
                                  </div>
                                  {recipe.prepTimeMinutes && recipe.prepTimeMinutes > 0 && (
                                    <div>
                                      <span className="text-xs admin-text-muted">Prep: </span>
                                      <span className="font-semibold admin-text">{recipe.prepTimeMinutes} min</span>
                                    </div>
                                  )}
                                  {recipe.notes && (
                                    <div className="text-xs admin-text-muted italic">{recipe.notes}</div>
                                  )}
                                  <Link
                                    href="/admin/recipes"
                                    className="ml-auto flex items-center gap-1 text-xs text-blue-400 hover:underline"
                                  >
                                    Edit recipe <ExternalLink className="h-3 w-3" />
                                  </Link>
                                </div>
                              </>
                            ) : (
                              <div className="text-center py-6">
                                <FlaskConical className="h-8 w-8 mx-auto mb-2 admin-text-dim" />
                                <p className="text-sm admin-text-muted mb-1">No recipe defined for this item</p>
                                <p className="text-xs admin-text-dim mb-3">Add ingredients and quantities in the Recipes page to calculate accurate food costs</p>
                                <Link
                                  href="/admin/recipes"
                                  className="inline-flex items-center gap-1.5 px-4 py-2 glass-btn-green text-white rounded-lg text-sm font-semibold"
                                >
                                  <FlaskConical className="h-4 w-4" />
                                  Go to Recipes
                                </Link>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
