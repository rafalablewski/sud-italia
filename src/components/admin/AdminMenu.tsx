"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminNav } from "./AdminNav";
import {
  MapPin, Eye, EyeOff, Save, Search, Plus, Trash2,
  ChevronDown, ChevronUp, Package, FlaskConical, X,
} from "lucide-react";
import { locations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
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

// --- Interfaces ---

interface IngredientData {
  id: string;
  name: string;
  category: IngredientCategory;
  unit: IngredientUnit;
  costPerUnit: number;
  supplier?: string;
  notes?: string;
}

interface RecipeIngredientData {
  ingredientId: string;
  quantity: number;
  wasteFactor: number;
  // enriched
  name?: string;
  unit?: string;
  unitCost?: number;
  lineCost?: number;
}

interface RecipeData {
  menuItemId: string;
  ingredients: RecipeIngredientData[];
  prepTimeMinutes?: number;
  yieldPortions: number;
  notes?: string;
  calculatedCost?: number;
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

// --- Tabs ---
type Tab = "menu" | "ingredients";

export function AdminMenu() {
  const [tab, setTab] = useState<Tab>("menu");

  return (
    <>
      <AdminNav />
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        {/* Tab bar */}
        <div className="flex items-center gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
          <button
            onClick={() => setTab("menu")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "menu" ? "bg-white text-italia-dark shadow-sm" : "text-italia-gray hover:text-italia-dark"
            }`}
          >
            <Package className="h-4 w-4" />
            Menu & Recipes
          </button>
          <button
            onClick={() => setTab("ingredients")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "ingredients" ? "bg-white text-italia-dark shadow-sm" : "text-italia-gray hover:text-italia-dark"
            }`}
          >
            <FlaskConical className="h-4 w-4" />
            Ingredients
          </button>
        </div>

        {tab === "menu" ? <MenuTab /> : <IngredientsTab />}
      </div>
    </>
  );
}

// =====================
// MENU TAB
// =====================

function MenuTab() {
  const [selectedLocation, setSelectedLocation] = useState(activeLocations[0]?.slug || "");
  const [items, setItems] = useState<MenuItemData[]>([]);
  const [recipes, setRecipes] = useState<RecipeData[]>([]);
  const [ingredients, setIngredients] = useState<IngredientData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  // Availability changes pending save
  const [availabilityChanges, setAvailabilityChanges] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [menuRes, recipesRes, ingredientsRes] = await Promise.all([
        fetch(`/api/admin/menu?location=${selectedLocation}`),
        fetch("/api/admin/recipes"),
        fetch("/api/admin/ingredients"),
      ]);
      if (menuRes.ok) setItems(await menuRes.json());
      if (recipesRes.ok) setRecipes(await recipesRes.json());
      if (ingredientsRes.ok) setIngredients(await ingredientsRes.json());
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
  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));

  const toggleAvailability = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const current = availabilityChanges[id] ?? item.available;
    setAvailabilityChanges((prev) => ({ ...prev, [id]: !current }));
    setSaved(false);
  };

  const handleSaveAvailability = async () => {
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

  const hasAvailChanges = Object.keys(availabilityChanges).length > 0;

  // Filter & group
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

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold font-heading text-italia-dark">Menu & Recipes</h1>
          <p className="text-sm text-italia-gray mt-0.5">{items.length} items</p>
        </div>
        {hasAvailChanges && (
          <button
            onClick={handleSaveAvailability}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-italia-green text-white rounded-xl font-semibold text-sm hover:bg-italia-green-dark transition-colors disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : `Save (${Object.keys(availabilityChanges).length} changes)`}
          </button>
        )}
      </div>

      {saved && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 font-medium">
          Menu updated.
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-italia-gray" />
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          >
            {activeLocations.map((loc) => (
              <option key={loc.slug} value={loc.slug}>{loc.city}</option>
            ))}
          </select>
        </div>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
          <option value="">All categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{MENU_CATEGORY_LABELS[cat]}</option>
          ))}
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-italia-gray" />
          <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm" />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-italia-gray">Loading...</div>
      ) : (
        <div className="space-y-8">
          {groupedItems.map((group) => (
            <div key={group.category}>
              <h2 className="text-lg font-bold font-heading text-italia-dark mb-3">
                {group.label}
                <span className="text-xs font-normal text-italia-gray ml-2">({group.items.length})</span>
              </h2>
              <div className="space-y-2">
                {group.items.map((item) => {
                  const recipe = recipeMap.get(item.id);
                  const isAvailable = availabilityChanges[item.id] ?? item.available;
                  const foodCost = recipe?.calculatedCost ?? item.cost;
                  const margin = item.price > 0 ? Math.round(((item.price - foodCost) / item.price) * 100) : 0;
                  const isExpanded = expandedItem === item.id;

                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl shadow-sm overflow-hidden transition-colors ${
                        !isAvailable ? "bg-gray-50 border border-gray-200 opacity-60" : "bg-white border border-gray-100"
                      }`}
                    >
                      {/* Item row */}
                      <div className="flex flex-wrap items-center gap-3 p-4">
                        <button
                          onClick={() => toggleAvailability(item.id)}
                          className={`p-2 rounded-lg transition-colors ${
                            isAvailable ? "bg-italia-green/10 text-italia-green" : "bg-gray-200 text-gray-500"
                          }`}
                          title={isAvailable ? "Mark sold out" : "Mark available"}
                        >
                          {isAvailable ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                        </button>

                        <div className="flex-1 min-w-[180px]">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-italia-dark">{item.name}</span>
                            {item.tags.map((tag) => (
                              <span key={tag} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-medium rounded">{tag}</span>
                            ))}
                          </div>
                          <p className="text-xs text-italia-gray mt-0.5 line-clamp-1">{item.description}</p>
                        </div>

                        {/* Cost breakdown mini */}
                        <div className="flex items-center gap-4 text-sm">
                          <div className="text-center">
                            <div className="text-[10px] text-italia-gray">Price</div>
                            <div className="font-bold text-italia-dark">{formatPrice(item.price)}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-[10px] text-italia-gray">Food Cost</div>
                            <div className={`font-bold ${recipe ? "text-italia-dark" : "text-gray-400"}`}>
                              {formatPrice(foodCost)}
                              {!recipe && <span className="text-[9px] ml-0.5">*</span>}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-[10px] text-italia-gray">Margin</div>
                            <span className={`font-bold ${margin >= 65 ? "text-italia-green" : margin >= 50 ? "text-italia-gold-dark" : "text-italia-red"}`}>
                              {margin}%
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          <FlaskConical className="h-3.5 w-3.5" />
                          {recipe ? "Recipe" : "Add Recipe"}
                          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                      </div>

                      {/* Recipe editor */}
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

          {!loading && items.length > 0 && items.some((i) => !recipeMap.has(i.id)) && (
            <p className="text-xs text-italia-gray">
              * Items without a recipe use the hardcoded cost estimate. Add a recipe for accurate food costing.
            </p>
          )}
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
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredientData[]>(
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

  // Calculate totals
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
          ingredients: recipeIngredients,
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
    <div className="border-t border-gray-100 bg-gray-50/80 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm text-italia-dark">
          Recipe: {menuItemName}
        </h3>
        <div className="flex items-center gap-3 text-sm">
          <div>
            <span className="text-xs text-italia-gray">Yield: </span>
            <input
              type="number"
              min={1}
              value={yieldPortions}
              onChange={(e) => setYieldPortions(Number(e.target.value) || 1)}
              className="w-14 px-1 py-0.5 border border-gray-200 rounded text-center text-sm"
            />
            <span className="text-xs text-italia-gray"> portions</span>
          </div>
          <div>
            <span className="text-xs text-italia-gray">Prep: </span>
            <input
              type="number"
              min={0}
              value={prepTime}
              onChange={(e) => setPrepTime(Number(e.target.value) || 0)}
              className="w-14 px-1 py-0.5 border border-gray-200 rounded text-center text-sm"
            />
            <span className="text-xs text-italia-gray"> min</span>
          </div>
        </div>
      </div>

      {/* Ingredient rows */}
      {recipeIngredients.length > 0 && (
        <div className="mb-3">
          <div className="grid grid-cols-[1fr_80px_80px_80px_32px] gap-2 mb-1 text-[10px] font-semibold text-italia-gray uppercase px-1">
            <span>Ingredient</span>
            <span>Qty</span>
            <span>Waste %</span>
            <span className="text-right">Cost</span>
            <span />
          </div>
          {recipeIngredients.map((ri, idx) => {
            const ing = ingredientMap.get(ri.ingredientId);
            const lineCost = ing ? Math.round(ing.costPerUnit * ri.quantity * (ri.wasteFactor || 1)) : 0;

            return (
              <div key={idx} className="grid grid-cols-[1fr_80px_80px_80px_32px] gap-2 items-center mb-1">
                <select
                  value={ri.ingredientId}
                  onChange={(e) => updateIngredient(idx, "ingredientId", e.target.value)}
                  className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                >
                  {ingredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      {ing.name} ({formatPrice(ing.costPerUnit)}/{ing.unit})
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.001"
                    min={0}
                    value={ri.quantity || ""}
                    onChange={(e) => updateIngredient(idx, "quantity", parseFloat(e.target.value) || 0)}
                    className="w-full px-1 py-1.5 border border-gray-200 rounded text-sm text-right"
                    placeholder="0"
                  />
                  <span className="text-[10px] text-italia-gray">{ing?.unit}</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="1"
                    min={0}
                    value={Math.round((ri.wasteFactor - 1) * 100)}
                    onChange={(e) => updateIngredient(idx, "wasteFactor", 1 + (parseFloat(e.target.value) || 0) / 100)}
                    className="w-full px-1 py-1.5 border border-gray-200 rounded text-sm text-right"
                  />
                  <span className="text-[10px] text-italia-gray">%</span>
                </div>
                <div className="text-right text-sm font-medium text-italia-dark">
                  {formatPrice(lineCost)}
                </div>
                <button
                  onClick={() => removeIngredient(idx)}
                  className="p-1 text-gray-400 hover:text-italia-red transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={addIngredient}
        disabled={ingredients.length === 0}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-italia-gray border border-dashed border-gray-300 rounded-lg hover:bg-white hover:text-italia-dark transition-colors mb-3 disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" />
        {ingredients.length === 0 ? "Add ingredients in the Ingredients tab first" : "Add Ingredient"}
      </button>

      {/* Notes */}
      <input
        type="text"
        placeholder="Recipe notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm mb-3"
      />

      {/* Summary bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-xl border border-gray-100">
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-xs text-italia-gray">Total recipe cost: </span>
            <span className="font-bold text-italia-dark">{formatPrice(Math.round(totalCost))}</span>
          </div>
          <div>
            <span className="text-xs text-italia-gray">Cost per portion: </span>
            <span className="font-bold text-italia-red">{formatPrice(costPerPortion)}</span>
          </div>
          <div>
            <span className="text-xs text-italia-gray">Ingredients: </span>
            <span className="font-semibold text-italia-dark">{recipeIngredients.length}</span>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-1.5 bg-italia-green text-white rounded-lg text-sm font-semibold hover:bg-italia-green-dark transition-colors disabled:opacity-50"
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

  // Form state
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
    setFormName(ing.name);
    setFormCategory(ing.category);
    setFormUnit(ing.unit);
    setFormCost((ing.costPerUnit / 100).toFixed(2));
    setFormSupplier(ing.supplier || "");
    setFormNotes(ing.notes || "");
    setEditingId(ing.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const body = {
        ...(editingId ? { id: editingId } : {}),
        name: formName.trim(),
        category: formCategory,
        unit: formUnit,
        costPerUnit: Math.round(parseFloat(formCost || "0") * 100),
        supplier: formSupplier,
        notes: formNotes,
      };
      await fetch("/api/admin/ingredients", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      resetForm();
      fetchIngredients();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this ingredient? Recipes using it will show 'Unknown'.")) return;
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
          <h1 className="text-2xl font-bold font-heading text-italia-dark">Ingredients</h1>
          <p className="text-sm text-italia-gray mt-0.5">{ingredients.length} ingredients</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-italia-green text-white rounded-xl font-semibold text-sm hover:bg-italia-green-dark transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Ingredient
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-6">
          <h2 className="font-bold text-lg mb-4">{editingId ? "Edit Ingredient" : "New Ingredient"}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs text-italia-gray mb-1">Name *</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Fior di Latte Mozzarella"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-italia-gray mb-1">Category</label>
              <select value={formCategory} onChange={(e) => setFormCategory(e.target.value as IngredientCategory)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                {Object.entries(INGREDIENT_CATEGORY_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-italia-gray mb-1">Unit</label>
              <select value={formUnit} onChange={(e) => setFormUnit(e.target.value as IngredientUnit)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-italia-gray mb-1">Cost per {formUnit} (PLN)</label>
              <input
                type="number"
                step="0.01"
                value={formCost}
                onChange={(e) => setFormCost(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-italia-gray mb-1">Supplier</label>
              <input type="text" value={formSupplier} onChange={(e) => setFormSupplier(e.target.value)} placeholder="Optional" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleSave} disabled={saving || !formName.trim()} className="px-5 py-2 bg-italia-green text-white rounded-xl font-semibold text-sm hover:bg-italia-green-dark transition-colors disabled:opacity-50">
              {saving ? "Saving..." : editingId ? "Update" : "Add"}
            </button>
            <button onClick={resetForm} className="px-5 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
          <option value="">All categories</option>
          {usedCategories.map((cat) => (
            <option key={cat} value={cat}>{INGREDIENT_CATEGORY_LABELS[cat as IngredientCategory]}</option>
          ))}
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-italia-gray" />
          <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm" />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-italia-gray">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
          <FlaskConical className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p className="text-italia-gray font-medium">No ingredients yet</p>
          <p className="text-sm text-gray-400 mt-1">Add ingredients to build recipes for your menu items</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 font-semibold text-italia-gray">Name</th>
                <th className="px-4 py-3 font-semibold text-italia-gray">Category</th>
                <th className="px-4 py-3 font-semibold text-italia-gray text-right">Cost / Unit</th>
                <th className="px-4 py-3 font-semibold text-italia-gray">Supplier</th>
                <th className="px-4 py-3 font-semibold text-italia-gray w-20" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((ing) => (
                <tr key={ing.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-italia-dark">{ing.name}</td>
                  <td className="px-4 py-3 text-italia-gray">
                    <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                      {INGREDIENT_CATEGORY_LABELS[ing.category]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-italia-dark">
                    {formatPrice(ing.costPerUnit)}<span className="text-xs text-italia-gray font-normal">/{ing.unit}</span>
                  </td>
                  <td className="px-4 py-3 text-italia-gray">{ing.supplier || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEdit(ing)} className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(ing.id)} className="p-1 text-gray-400 hover:text-italia-red transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
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
