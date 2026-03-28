"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminNav } from "./AdminNav";
import {
  Plus, Trash2, Save, Search, X, FlaskConical, Package,
  ChevronDown, ChevronUp, MapPin,
} from "lucide-react";
import { locations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import { formatQty, marginColorClass } from "@/lib/admin-utils";
import {
  MENU_CATEGORY_LABELS,
  INGREDIENT_CATEGORY_LABELS,
  type MenuCategory,
  type IngredientCategory,
  type IngredientUnit,
} from "@/data/types";

const activeLocations = locations.filter((l) => l.isActive);
const CATEGORY_ORDER: MenuCategory[] = ["pizza", "pasta", "antipasti", "panini", "drinks", "desserts"];
const UNITS: IngredientUnit[] = ["kg", "g", "L", "ml", "piece", "bunch", "can", "bottle"];

interface IngredientData {
  id: string;
  name: string;
  category: IngredientCategory;
  unit: IngredientUnit;
  costPerUnit: number;
  supplier?: string;
  notes?: string;
}

interface EnrichedRecipeIngredient {
  ingredientId: string;
  quantity: number;
  wasteFactor: number;
  name?: string;
  unit?: string;
  unitCost?: number;
  lineCost?: number;
}

interface RecipeData {
  menuItemId: string;
  ingredients: EnrichedRecipeIngredient[];
  prepTimeMinutes?: number;
  yieldPortions: number;
  notes?: string;
  calculatedCost?: number;
}

interface MenuItemData {
  id: string;
  name: string;
  category: MenuCategory;
  price: number;
  cost: number;
}

type Tab = "recipes" | "ingredients";

export function AdminRecipes() {
  const [tab, setTab] = useState<Tab>("recipes");

  return (
    <>
      <AdminNav />
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <div className="flex items-center gap-1 mb-6 bg-white/5 rounded-xl p-1 w-fit border border-white/10">
          <button
            onClick={() => setTab("recipes")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "recipes" ? "bg-white/10 admin-text shadow-sm" : "admin-text-muted hover:admin-text"
            }`}
          >
            <FlaskConical className="h-4 w-4" />
            Recipe Builder
          </button>
          <button
            onClick={() => setTab("ingredients")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "ingredients" ? "bg-white/10 admin-text shadow-sm" : "admin-text-muted hover:admin-text"
            }`}
          >
            <Package className="h-4 w-4" />
            Ingredients Database
          </button>
        </div>

        {tab === "recipes" ? <RecipesTab /> : <IngredientsTab />}
      </div>
    </>
  );
}

// =====================
// RECIPES TAB
// =====================

function RecipesTab() {
  const [selectedLocation, setSelectedLocation] = useState(activeLocations[0]?.slug || "");
  const [menuItems, setMenuItems] = useState<MenuItemData[]>([]);
  const [recipes, setRecipes] = useState<RecipeData[]>([]);
  const [ingredients, setIngredients] = useState<IngredientData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterHasRecipe, setFilterHasRecipe] = useState<"" | "yes" | "no">("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [menuRes, recipesRes, ingRes] = await Promise.all([
        fetch(`/api/admin/menu?location=${selectedLocation}`),
        fetch("/api/admin/recipes"),
        fetch("/api/admin/ingredients"),
      ]);
      if (menuRes.ok) setMenuItems(await menuRes.json());
      if (recipesRes.ok) setRecipes(await recipesRes.json());
      if (ingRes.ok) setIngredients(await ingRes.json());
    } finally {
      setLoading(false);
    }
  }, [selectedLocation]);

  useEffect(() => {
    fetchAll();
    setExpandedItem(null);
  }, [selectedLocation, fetchAll]);

  const recipeMap = new Map(recipes.map((r) => [r.menuItemId, r]));
  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));

  const filtered = menuItems.filter((item) => {
    if (filterCategory && item.category !== filterCategory) return false;
    if (filterHasRecipe === "yes" && !recipeMap.has(item.id)) return false;
    if (filterHasRecipe === "no" && recipeMap.has(item.id)) return false;
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const categories = CATEGORY_ORDER.filter((cat) => menuItems.some((i) => i.category === cat));
  const grouped = categories
    .map((cat) => ({
      category: cat,
      label: MENU_CATEGORY_LABELS[cat],
      items: filtered.filter((i) => i.category === cat),
    }))
    .filter((g) => g.items.length > 0);

  const withRecipeCount = menuItems.filter((i) => recipeMap.has(i.id)).length;
  const withoutRecipeCount = menuItems.length - withRecipeCount;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold font-heading gradient-text">Recipe Builder</h1>
          <p className="text-sm admin-text-muted mt-0.5">
            {withRecipeCount} of {menuItems.length} items have recipes
            {withoutRecipeCount > 0 && (
              <span className="admin-red ml-1">({withoutRecipeCount} missing)</span>
            )}
          </p>
        </div>
      </div>

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
        <select value={filterHasRecipe} onChange={(e) => setFilterHasRecipe(e.target.value as "" | "yes" | "no")} className="glass-input rounded-lg text-sm">
          <option value="">All items</option>
          <option value="yes">With recipe</option>
          <option value="no">Missing recipe</option>
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 admin-text-muted" />
          <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 glass-input rounded-lg text-sm" />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 admin-text-muted">Loading...</div>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <div key={group.category}>
              <h2 className="text-lg font-bold font-heading admin-text mb-3">
                {group.label}
                <span className="text-xs font-normal admin-text-muted ml-2">({group.items.length})</span>
              </h2>
              <div className="space-y-2">
                {group.items.map((item) => {
                  const recipe = recipeMap.get(item.id);
                  const hasRecipe = !!recipe && (recipe.ingredients?.length ?? 0) > 0;
                  const isExpanded = expandedItem === item.id;
                  const foodCost = recipe?.calculatedCost ?? item.cost;
                  const margin = item.price > 0 ? Math.round(((item.price - foodCost) / item.price) * 100) : 0;

                  return (
                    <div key={item.id} className={`rounded-xl shadow-sm overflow-hidden ${hasRecipe ? "glass-card" : "bg-yellow-500/10 border-2 border-dashed border-yellow-500/30"}`}>
                      <button
                        onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                        className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/5 transition-colors"
                      >
                        <div className={`p-1.5 rounded-lg ${hasRecipe ? "bg-italia-green/10 text-italia-green" : "bg-yellow-500/20 text-yellow-400"}`}>
                          <FlaskConical className="h-4 w-4" />
                        </div>
                        <span className="font-semibold admin-text flex-1">{item.name}</span>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="admin-text-muted">{formatPrice(item.price)}</span>
                          <span className={`font-semibold ${hasRecipe ? "admin-text" : "text-gray-400"}`}>
                            Cost: {formatPrice(foodCost)}
                          </span>
                          <span className={`font-bold ${marginColorClass(margin)}`}>
                            {margin}%
                          </span>
                        </div>
                        {hasRecipe ? (
                          <span className="text-xs text-italia-green font-medium">{recipe.ingredients.length} ing.</span>
                        ) : (
                          <span className="text-xs text-yellow-400 font-medium">No recipe</span>
                        )}
                        {isExpanded ? <ChevronUp className="h-4 w-4 admin-text-muted" /> : <ChevronDown className="h-4 w-4 admin-text-muted" />}
                      </button>

                      {isExpanded && (
                        <RecipeEditor
                          menuItemId={item.id}
                          menuItemName={item.name}
                          existingRecipe={recipe}
                          ingredients={ingredients}
                          ingredientMap={ingredientMap}
                          onSaved={fetchAll}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// =====================
// RECIPE EDITOR
// =====================

function RecipeEditor({
  menuItemId,
  menuItemName,
  existingRecipe,
  ingredients,
  ingredientMap,
  onSaved,
}: {
  menuItemId: string;
  menuItemName: string;
  existingRecipe?: RecipeData;
  ingredients: IngredientData[];
  ingredientMap: Map<string, IngredientData>;
  onSaved: () => void;
}) {
  const [recipeIngredients, setRecipeIngredients] = useState<EnrichedRecipeIngredient[]>(
    existingRecipe?.ingredients ?? []
  );
  const [yieldPortions, setYieldPortions] = useState(existingRecipe?.yieldPortions ?? 1);
  const [prepTime, setPrepTime] = useState(existingRecipe?.prepTimeMinutes ?? 0);
  const [notes, setNotes] = useState(existingRecipe?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const addIngredient = () => {
    if (ingredients.length === 0) return;
    setRecipeIngredients((prev) => [
      ...prev,
      { ingredientId: ingredients[0].id, quantity: 0, wasteFactor: 1 },
    ]);
  };

  const removeIngredient = (idx: number) => {
    setRecipeIngredients((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateIngredient = (idx: number, field: string, value: string | number) => {
    setRecipeIngredients((prev) =>
      prev.map((ri, i) => (i === idx ? { ...ri, [field]: value } : ri))
    );
  };

  let totalCost = 0;
  for (const ri of recipeIngredients) {
    const ing = ingredientMap.get(ri.ingredientId);
    if (ing) totalCost += ing.costPerUnit * ri.quantity * (ri.wasteFactor || 1);
  }
  const costPerPortion = yieldPortions > 0 ? Math.round(totalCost / yieldPortions) : 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/admin/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menuItemId,
          ingredients: recipeIngredients.map((ri) => ({
            ingredientId: ri.ingredientId,
            quantity: ri.quantity,
            wasteFactor: ri.wasteFactor,
          })),
          yieldPortions,
          prepTimeMinutes: prepTime || undefined,
          notes,
        }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-white/10 bg-white/5 p-5">
      {/* Header with yield + prep */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <h3 className="font-semibold admin-text">Recipe: {menuItemName}</h3>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <span className="admin-text-muted">Yield</span>
            <input
              type="number"
              min={1}
              value={yieldPortions}
              onChange={(e) => setYieldPortions(Number(e.target.value) || 1)}
              className="w-16 glass-input rounded-lg text-center"
            />
            <span className="admin-text-muted">portions</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="admin-text-muted">Prep</span>
            <input
              type="number"
              min={0}
              value={prepTime || ""}
              placeholder="0"
              onChange={(e) => setPrepTime(Number(e.target.value) || 0)}
              className="w-16 glass-input rounded-lg text-center"
            />
            <span className="admin-text-muted">min</span>
          </label>
        </div>
      </div>

      {/* Ingredient rows */}
      {recipeIngredients.length > 0 && (
        <div className="mb-4 space-y-2">
          {/* Header */}
          <div className="flex items-center gap-2 px-1 text-[10px] font-semibold admin-text-dim uppercase tracking-wider">
            <div className="flex-1">Ingredient</div>
            <div className="w-28 text-right">Quantity</div>
            <div className="w-8" />
            <div className="w-20 text-right">Waste</div>
            <div className="w-24 text-right">Line Cost</div>
            <div className="w-9" />
          </div>
          {recipeIngredients.map((ri, idx) => {
            const ing = ingredientMap.get(ri.ingredientId);
            const lineCost = ing ? Math.round(ing.costPerUnit * ri.quantity * (ri.wasteFactor || 1)) : 0;

            // Convert stored value (kg/L) → display value (g/ml)
            const displayUnit = ing?.unit === "kg" ? "g" : ing?.unit === "L" ? "ml" : (ing?.unit || "");
            const multiplier = ing?.unit === "kg" || ing?.unit === "L" ? 1000 : 1;
            const displayQty = ri.quantity ? Math.round(ri.quantity * multiplier * 1000) / 1000 : "";
            const wastePct = Math.round((ri.wasteFactor - 1) * 100);

            return (
              <div key={idx} className="flex items-center gap-2">
                {/* Ingredient select */}
                <select
                  value={ri.ingredientId}
                  onChange={(e) => updateIngredient(idx, "ingredientId", e.target.value)}
                  className="flex-1 glass-input rounded-lg"
                >
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} — {formatPrice(i.costPerUnit)}/{i.unit}
                    </option>
                  ))}
                </select>

                {/* Quantity input */}
                <input
                  type="number"
                  step="1"
                  min={0}
                  value={displayQty}
                  placeholder="0"
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    updateIngredient(idx, "quantity", val / multiplier);
                  }}
                  className="w-28 glass-input rounded-lg text-right"
                />
                <span className="text-xs admin-text-muted w-8">{displayUnit}</span>

                {/* Waste % input */}
                <div className="w-20 flex items-center gap-1">
                  <input
                    type="number"
                    step="1"
                    min={0}
                    value={wastePct}
                    onChange={(e) => updateIngredient(idx, "wasteFactor", 1 + (parseFloat(e.target.value) || 0) / 100)}
                    className="w-14 glass-input rounded-lg text-right"
                  />
                  <span className="text-xs admin-text-muted">%</span>
                </div>

                {/* Line cost */}
                <div className="w-24 text-right text-sm font-semibold admin-text">
                  {formatPrice(lineCost)}
                </div>

                {/* Delete */}
                <button
                  onClick={() => removeIngredient(idx)}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add ingredient */}
      <button
        onClick={addIngredient}
        disabled={ingredients.length === 0}
        className="glass-btn-ghost text-xs mb-4 disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" />
        {ingredients.length === 0 ? "Add ingredients in the Ingredients Database tab first" : "Add ingredient to recipe"}
      </button>

      {/* Notes */}
      <input
        type="text"
        placeholder="Recipe notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-full glass-input rounded-lg mb-4"
      />

      {/* Cost summary bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-xs admin-text-dim block mb-0.5">Recipe total</span>
            <span className="font-bold admin-text text-base">{formatPrice(Math.round(totalCost))}</span>
          </div>
          <div>
            <span className="text-xs admin-text-dim block mb-0.5">Per portion</span>
            <span className="font-bold text-red-400 text-base">{formatPrice(costPerPortion)}</span>
          </div>
          <div>
            <span className="text-xs admin-text-muted">Ingredients: </span>
            <span className="font-semibold admin-text">{recipeIngredients.length}</span>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-1.5 glass-btn-green text-white rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Recipe"}
        </button>
      </div>
    </div>
  );
}

// =====================
// INGREDIENTS TAB
// =====================

function IngredientsTab() {
  const [ingredients, setIngredients] = useState<IngredientData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState<IngredientCategory>("other");
  const [formUnit, setFormUnit] = useState<IngredientUnit>("kg");
  const [formCost, setFormCost] = useState("");
  const [formSupplier, setFormSupplier] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchIngredients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ingredients");
      if (res.ok) setIngredients(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchIngredients(); }, [fetchIngredients]);

  const resetForm = () => {
    setFormName(""); setFormCategory("other"); setFormUnit("kg");
    setFormCost(""); setFormSupplier(""); setFormNotes("");
    setEditingId(null); setShowForm(false);
  };

  const startEdit = (ing: IngredientData) => {
    setFormName(ing.name); setFormCategory(ing.category); setFormUnit(ing.unit);
    setFormCost((ing.costPerUnit / 100).toFixed(2)); setFormSupplier(ing.supplier || "");
    setFormNotes(ing.notes || ""); setEditingId(ing.id); setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/admin/ingredients", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          name: formName.trim(), category: formCategory, unit: formUnit,
          costPerUnit: Math.round(parseFloat(formCost || "0") * 100),
          supplier: formSupplier, notes: formNotes,
        }),
      });
      resetForm();
      fetchIngredients();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this ingredient?")) return;
    await fetch(`/api/admin/ingredients?id=${id}`, { method: "DELETE" });
    fetchIngredients();
  };

  const filtered = ingredients.filter((ing) => {
    if (filterCategory && ing.category !== filterCategory) return false;
    if (search && !ing.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const usedCategories = [...new Set(ingredients.map((i) => i.category))].sort();

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold font-heading gradient-text">Ingredients Database</h1>
          <p className="text-sm admin-text-muted mt-0.5">{ingredients.length} ingredients</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2 glass-btn-green text-white rounded-xl font-semibold text-sm">
          <Plus className="h-4 w-4" />
          Add Ingredient
        </button>
      </div>

      {showForm && (
        <div className="glass-card rounded-2xl p-5 mb-6">
          <h2 className="font-bold text-lg mb-4 admin-text">{editingId ? "Edit Ingredient" : "New Ingredient"}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs admin-text-muted mb-1">Name *</label>
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Fior di Latte Mozzarella" className="w-full glass-input rounded-lg text-sm" autoFocus />
            </div>
            <div>
              <label className="block text-xs admin-text-muted mb-1">Category</label>
              <select value={formCategory} onChange={(e) => setFormCategory(e.target.value as IngredientCategory)} className="w-full glass-input rounded-lg text-sm">
                {Object.entries(INGREDIENT_CATEGORY_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs admin-text-muted mb-1">Unit</label>
              <select value={formUnit} onChange={(e) => setFormUnit(e.target.value as IngredientUnit)} className="w-full glass-input rounded-lg text-sm">
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs admin-text-muted mb-1">Cost per {formUnit} (PLN)</label>
              <input type="number" step="0.01" value={formCost} onChange={(e) => setFormCost(e.target.value)} placeholder="0.00" className="w-full glass-input rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs admin-text-muted mb-1">Supplier</label>
              <input type="text" value={formSupplier} onChange={(e) => setFormSupplier(e.target.value)} placeholder="Optional" className="w-full glass-input rounded-lg text-sm" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleSave} disabled={saving || !formName.trim()} className="px-5 py-2 glass-btn-green text-white rounded-xl font-semibold text-sm disabled:opacity-50">{saving ? "Saving..." : editingId ? "Update" : "Add"}</button>
            <button onClick={resetForm} className="px-5 py-2 border border-white/10 rounded-xl text-sm admin-text-muted hover:bg-white/5">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="glass-input rounded-lg text-sm">
          <option value="">All categories</option>
          {usedCategories.map((cat) => (
            <option key={cat} value={cat}>{INGREDIENT_CATEGORY_LABELS[cat as IngredientCategory]}</option>
          ))}
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 admin-text-muted" />
          <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 glass-input rounded-lg text-sm" />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 admin-text-muted">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <Package className="h-12 w-12 mx-auto mb-4 admin-text-dim" />
          <p className="admin-text-muted font-medium">No ingredients yet</p>
          <p className="text-sm admin-text-dim mt-1">Add your ingredients to start building recipes</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/5 text-left">
                <th className="px-4 py-3 font-semibold admin-text-muted">Name</th>
                <th className="px-4 py-3 font-semibold admin-text-muted">Category</th>
                <th className="px-4 py-3 font-semibold admin-text-muted text-right">Cost / Unit</th>
                <th className="px-4 py-3 font-semibold admin-text-muted">Supplier</th>
                <th className="px-4 py-3 font-semibold admin-text-muted w-20" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((ing) => (
                <tr key={ing.id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 font-medium admin-text">{ing.name}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 bg-white/10 rounded text-xs admin-text-muted">{INGREDIENT_CATEGORY_LABELS[ing.category]}</span></td>
                  <td className="px-4 py-3 text-right font-semibold admin-text">{formatPrice(ing.costPerUnit)}<span className="text-xs admin-text-muted font-normal">/{ing.unit}</span></td>
                  <td className="px-4 py-3 admin-text-muted">{ing.supplier || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEdit(ing)} className="px-2 py-1 text-xs text-blue-400 hover:bg-white/5 rounded">Edit</button>
                      <button onClick={() => handleDelete(ing.id)} className="p-1 text-gray-400 hover:text-italia-red"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
