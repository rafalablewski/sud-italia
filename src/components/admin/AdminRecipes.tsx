"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Coffee,
  FlaskConical,
  IceCream,
  Leaf,
  Package,
  Pencil,
  Pizza,
  Plus,
  Salad,
  Sandwich,
  Search,
  Trash2,
  Utensils,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import {
  MENU_CATEGORY_LABELS,
  type IngredientCategory,
  type IngredientUnit,
  type MenuCategory,
} from "@/data/types";
import { useAdminLocation } from "./v2/LocationContext";
import { useToast } from "./v2/ui/Toast";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Input,
  Select,
  Table,
  Tabs,
  Textarea,
  type Column,
} from "./v2/ui";
import { KpiCard } from "./v2/charts";
import { Banknote, Coins, Percent } from "lucide-react";
import { getActiveLocations } from "@/data/locations";

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

/**
 * UI-friendly display unit. Storage stays in the canonical unit (`kg`, `L`)
 * so existing recipes keep working; the recipe editor displays grams /
 * millilitres because that's what a cook thinks in.
 */
function displayUnit(unit: string | undefined): string {
  if (unit === "kg") return "g";
  if (unit === "L") return "ml";
  return unit ?? "";
}

function toDisplayQty(qty: number, unit: string | undefined): number {
  if (unit === "kg" || unit === "L") {
    // Round to 1 decimal at most for grams/ml so the input doesn't show
    // 249.99999999 for a stored 0.25 kg value.
    return Math.round(qty * 1000 * 10) / 10;
  }
  return qty;
}

function fromDisplayQty(displayQty: number, unit: string | undefined): number {
  if (unit === "kg" || unit === "L") return displayQty / 1000;
  return displayQty;
}

function displayStep(unit: string | undefined): string {
  if (unit === "kg" || unit === "L") return "1";
  if (unit === "bunch") return "0.1";
  return "1";
}

/** Convert a wasteFactor (1.00–2.00) to the percent integer the input shows. */
function factorToPercent(wf: number): number {
  if (!Number.isFinite(wf) || wf <= 1) return 0;
  return Math.round((wf - 1) * 100);
}

/** Convert a percent input value back to the wasteFactor stored on the row. */
function percentToFactor(pct: number): number {
  if (!Number.isFinite(pct) || pct <= 0) return 1;
  return 1 + pct / 100;
}

interface RecipeData {
  id?: string;
  menuItemId: string;
  enrichedIngredients?: EnrichedRecipeIngredient[];
  ingredients?: EnrichedRecipeIngredient[];
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

const INGREDIENT_CATEGORIES: IngredientCategory[] = [
  "dairy",
  "meat",
  "seafood",
  "produce",
  "dry",
  "sauce",
  "oil",
  "spice",
  "bread",
  "beverage",
];

const INGREDIENT_UNITS: IngredientUnit[] = ["kg", "g", "L", "ml", "piece", "bunch", "can", "bottle"];

const activeLocations = getActiveLocations();
const FALLBACK_LOC = activeLocations[0]?.slug ?? "krakow";

const CATEGORY_ICON: Record<MenuCategory, LucideIcon> = {
  pizza: Pizza,
  pasta: UtensilsCrossed,
  antipasti: Salad,
  panini: Sandwich,
  drinks: Coffee,
  desserts: IceCream,
};

type TabKey = "recipes" | "ingredients";

export function AdminRecipes() {
  const [tab, setTab] = useState<TabKey>("recipes");

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Recipes & Ingredients</h1>
          <p className="v2-page-subtitle">
            Build recipes for every dish. Costs and margins recalculate from real ingredient prices.
          </p>
        </div>
        <Tabs
          value={tab}
          onChange={(v) => setTab(v as TabKey)}
          tabs={[
            { value: "recipes", label: "Recipes", icon: <Utensils className="h-3.5 w-3.5" /> },
            { value: "ingredients", label: "Ingredients", icon: <Leaf className="h-3.5 w-3.5" /> },
          ]}
          variant="pill"
          ariaLabel="View mode"
        />
      </header>

      {tab === "recipes" ? <RecipesPanel /> : <IngredientsPanel />}
    </div>
  );
}

// =============================================================
// Recipes panel
// =============================================================

function RecipesPanel() {
  const { location: globalLoc } = useAdminLocation();
  const toast = useToast();
  const [pageLoc, setPageLoc] = useState<string>(globalLoc || FALLBACK_LOC);
  useEffect(() => {
    if (globalLoc) setPageLoc(globalLoc);
  }, [globalLoc]);

  const [menu, setMenu] = useState<MenuItemData[]>([]);
  const [recipes, setRecipes] = useState<RecipeData[]>([]);
  const [ingredients, setIngredients] = useState<IngredientData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MenuItemData | null>(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<MenuCategory | "all">("all");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [m, r, i] = await Promise.all([
        fetch(`/api/admin/menu?location=${pageLoc}`).then((res) => (res.ok ? res.json() : [])),
        fetch(`/api/admin/recipes`).then((res) => (res.ok ? res.json() : [])),
        fetch(`/api/admin/ingredients`).then((res) => (res.ok ? res.json() : [])),
      ]);
      setMenu(Array.isArray(m) ? m : []);
      setRecipes(Array.isArray(r) ? r : []);
      setIngredients(Array.isArray(i) ? i : []);
    } finally {
      setLoading(false);
    }
  }, [pageLoc]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const recipeByMenuId = useMemo(() => {
    const m = new Map<string, RecipeData>();
    for (const r of recipes) m.set(r.menuItemId, r);
    return m;
  }, [recipes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menu.filter((m) => {
      if (filterCat !== "all" && m.category !== filterCat) return false;
      if (!q) return true;
      return m.name.toLowerCase().includes(q);
    });
  }, [menu, search, filterCat]);

  const grouped = useMemo(() => {
    const m = new Map<MenuCategory, MenuItemData[]>();
    for (const i of filtered) {
      const arr = m.get(i.category) || [];
      arr.push(i);
      m.set(i.category, arr);
    }
    return Array.from(m.entries());
  }, [filtered]);

  const locOptions = activeLocations.map((l) => ({ value: l.slug, label: l.city }));
  const categories = useMemo(
    () => Array.from(new Set(menu.map((m) => m.category))) as MenuCategory[],
    [menu],
  );

  const onSaved = async () => {
    setEditing(null);
    await fetchAll();
    toast.success("Recipe saved");
  };

  return (
    <>
      <div className="v2-filters">
        <div className="v2-field-inline">
          <Package className="h-3.5 w-3.5 v2-muted" />
          <Select
            value={pageLoc}
            onChange={(e) => setPageLoc(e.target.value)}
            options={locOptions}
            aria-label="Menu location"
          />
        </div>
        <div className="v2-filter-search">
          <Input
            placeholder="Search dishes…"
            leadingAdornment={<Search className="h-3.5 w-3.5" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Tabs
          value={filterCat}
          onChange={(v) => setFilterCat(v as MenuCategory | "all")}
          tabs={[
            { value: "all", label: "All", count: menu.length },
            ...categories.map((c) => ({
              value: c,
              label: MENU_CATEGORY_LABELS[c],
              count: menu.filter((m) => m.category === c).length,
            })),
          ]}
          variant="pill"
          ariaLabel="Category filter"
        />
      </div>

      {loading ? (
        <div className="v2-page-loading">Loading recipes…</div>
      ) : grouped.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState icon={Utensils} title="No menu items found" />
          </CardBody>
        </Card>
      ) : (
        <div className="v2-mng-groups">
          {grouped.map(([cat, items]) => {
            const Icon = CATEGORY_ICON[cat];
            return (
              <section key={cat} className="v2-mng-section" data-variant="recipes">
                <header className="v2-mng-section-header">
                  <span className="v2-mng-section-eyebrow">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    <span className="v2-mng-section-name">{MENU_CATEGORY_LABELS[cat]}</span>
                    <span className="v2-mng-section-count">{items.length}</span>
                  </span>
                  <span className="v2-mng-col">Price</span>
                  <span className="v2-mng-col">Recipe cost</span>
                  <span className="v2-mng-col">Margin</span>
                  <span aria-hidden />
                </header>
                <ul className="v2-mng-list">
                  {items.map((item) => {
                    const recipe = recipeByMenuId.get(item.id);
                    const calculatedCost = recipe?.calculatedCost ?? 0;
                    const margin = item.price > 0 ? Math.round(((item.price - calculatedCost) / item.price) * 100) : 0;
                    const hasRecipe = !!recipe;
                    const marginTone: "success" | "warning" | "danger" = margin >= 65 ? "success" : margin >= 50 ? "warning" : "danger";
                    return (
                      <li key={item.id} className="v2-mng-row v2-mng-row-recipes">
                        <div className="v2-mng-row-main">
                          <div className="v2-mng-row-headline">
                            <span className="v2-mng-row-name">{item.name}</span>
                            {hasRecipe ? (
                              <span className="v2-mng-tag v2-mng-tag-info">
                                {(recipe.enrichedIngredients ?? recipe.ingredients ?? []).length} ingredients
                              </span>
                            ) : (
                              <span className="v2-mng-tag v2-mng-tag-warning">No recipe</span>
                            )}
                          </div>
                          {hasRecipe ? (
                            <p className="v2-mng-row-desc">
                              {(recipe.enrichedIngredients ?? []).slice(0, 4).map((ri, i) => (
                                <span key={ri.ingredientId}>
                                  {i > 0 && <span className="v2-mng-dot">·</span>}
                                  <span className="mono v2-muted">{ri.quantity}{ri.unit}</span>{" "}
                                  <span>{ri.name}</span>
                                </span>
                              ))}
                              {(recipe.enrichedIngredients ?? []).length > 4 && (
                                <span>
                                  <span className="v2-mng-dot">·</span>
                                  <span className="v2-muted">+{(recipe.enrichedIngredients ?? []).length - 4} more</span>
                                </span>
                              )}
                            </p>
                          ) : (
                            <p className="v2-mng-row-desc v2-muted">No ingredients linked yet.</p>
                          )}
                        </div>

                        <span className="v2-mng-val v2-mng-val-price tabular">{formatPrice(item.price)}</span>
                        <span className="v2-mng-val v2-mng-val-cost tabular">
                          {hasRecipe ? formatPrice(calculatedCost) : <span className="v2-muted">—</span>}
                        </span>
                        <span className={`v2-mng-val v2-mng-val-margin v2-mng-val-margin-${hasRecipe ? marginTone : "neutral"} tabular`}>
                          {hasRecipe ? `${margin}%` : <span className="v2-muted">—</span>}
                        </span>

                        <Button
                          variant={hasRecipe ? "ghost" : "primary"}
                          size="sm"
                          leadingIcon={hasRecipe ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                          onClick={() => setEditing(item)}
                        >
                          {hasRecipe ? "Edit" : "Create"}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <RecipeEditor
        menuItem={editing}
        recipe={editing ? recipeByMenuId.get(editing.id) : undefined}
        ingredients={ingredients}
        onClose={() => setEditing(null)}
        onSaved={onSaved}
      />
    </>
  );
}

// =============================================================
// Recipe editor dialog
// =============================================================

interface EditorProps {
  menuItem: MenuItemData | null;
  recipe?: RecipeData;
  ingredients: IngredientData[];
  onClose: () => void;
  onSaved: () => void;
}

function RecipeEditor({ menuItem, recipe, ingredients, onClose, onSaved }: EditorProps) {
  const toast = useToast();
  const [rows, setRows] = useState<EnrichedRecipeIngredient[]>([]);
  const [yieldPortions, setYieldPortions] = useState(1);
  const [prepTime, setPrepTime] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [pickerIngId, setPickerIngId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!menuItem) return;
    const ings = recipe?.enrichedIngredients ?? recipe?.ingredients ?? [];
    setRows(
      ings.map((r) => ({
        ingredientId: r.ingredientId,
        quantity: r.quantity,
        wasteFactor: r.wasteFactor ?? 1,
        name: r.name,
        unit: r.unit,
        unitCost: r.unitCost,
      })),
    );
    setYieldPortions(recipe?.yieldPortions ?? 1);
    setPrepTime(recipe?.prepTimeMinutes ? String(recipe.prepTimeMinutes) : "");
    setNotes(recipe?.notes ?? "");
    setPickerIngId("");
  }, [menuItem, recipe]);

  const ingredientMap = useMemo(() => {
    const m = new Map<string, IngredientData>();
    for (const i of ingredients) m.set(i.id, i);
    return m;
  }, [ingredients]);

  const addIngredient = () => {
    if (!pickerIngId) return;
    if (rows.some((r) => r.ingredientId === pickerIngId)) {
      toast.warning("Already added", "Adjust the quantity instead.");
      return;
    }
    const ing = ingredientMap.get(pickerIngId);
    if (!ing) return;
    setRows((r) => [
      ...r,
      {
        ingredientId: ing.id,
        quantity: 0,
        wasteFactor: 1,
        name: ing.name,
        unit: ing.unit,
        unitCost: ing.costPerUnit,
      },
    ]);
    setPickerIngId("");
  };

  const updateRow = (id: string, patch: Partial<EnrichedRecipeIngredient>) => {
    setRows((r) => r.map((row) => (row.ingredientId === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id: string) => {
    setRows((r) => r.filter((row) => row.ingredientId !== id));
  };

  const lineCost = (r: EnrichedRecipeIngredient) =>
    Math.round((r.unitCost ?? 0) * r.quantity * (r.wasteFactor || 1));
  const totalCost = rows.reduce((acc, r) => acc + lineCost(r), 0);
  const perPortion = yieldPortions > 0 ? Math.round(totalCost / yieldPortions) : totalCost;
  const margin =
    menuItem && menuItem.price > 0
      ? Math.round(((menuItem.price - perPortion) / menuItem.price) * 100)
      : 0;

  const save = async () => {
    if (!menuItem) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menuItemId: menuItem.id,
          ingredients: rows.map((r) => ({
            ingredientId: r.ingredientId,
            quantity: r.quantity,
            wasteFactor: r.wasteFactor,
          })),
          prepTimeMinutes: prepTime ? Number(prepTime) : undefined,
          yieldPortions,
          notes,
        }),
      });
      if (res.ok) {
        onSaved();
      } else {
        toast.error("Save failed", "Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!menuItem) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/recipes?menuItemId=${encodeURIComponent(menuItem.id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setConfirmDelete(false);
        onSaved();
      }
    } finally {
      setBusy(false);
    }
  };

  if (!menuItem) {
    return <Dialog open={false} onClose={onClose} />;
  }

  const availableIngredients = ingredients.filter((i) => !rows.some((r) => r.ingredientId === i.id));
  const hasExisting = !!recipe;

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        size="xl"
        title={`Recipe · ${menuItem.name}`}
        description={`Listed price ${formatPrice(menuItem.price)} · Recipe cost auto-recalculates from real ingredient prices.`}
        footer={
          <>
            {hasExisting && (
              <Button variant="ghost" leadingIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setConfirmDelete(true)} disabled={busy}>
                Delete recipe
              </Button>
            )}
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={busy}>
              Save recipe
            </Button>
          </>
        }
      >
        <div className="v2-stack-12">
          <section className="v2-recipe-summary">
            <KpiCard
              label="Per portion"
              value={perPortion / 100}
              display={formatPrice(perPortion)}
              icon={Coins}
              tone="brand"
              staticValue
              hint={`Listed at ${formatPrice(menuItem.price)}`}
            />
            <KpiCard
              label="Margin"
              value={margin}
              display={`${margin}%`}
              icon={Percent}
              tone={margin < 50 ? "danger" : margin < 65 ? "warning" : "success"}
              staticValue
              higherIsBetter
              hint={
                margin < 50
                  ? "Below 50% — review pricing or recipe"
                  : margin < 65
                    ? "Healthy for QSR pizza"
                    : "Strong"
              }
            />
            <KpiCard
              label="Batch cost"
              value={totalCost / 100}
              display={formatPrice(totalCost)}
              icon={Banknote}
              tone="neutral"
              staticValue
              hint={`${yieldPortions} portion${yieldPortions === 1 ? "" : "s"} per batch`}
            />
          </section>

          <Card padding="none">
            <CardHeader
              title="Ingredients"
              description={`${rows.length} ingredient${rows.length === 1 ? "" : "s"} · cost recomputes live as you edit.`}
            />
            <CardBody>
              {rows.length === 0 ? (
                <EmptyState
                  icon={Coins}
                  title="No ingredients yet"
                  description="Pick one from the dropdown below to start building the recipe."
                  compact
                />
              ) : (
                <div className="v2-rcp-table">
                  <div className="v2-rcp-row-head" role="presentation" aria-hidden>
                    <span>Ingredient</span>
                    <span>Qty</span>
                    <span title="Waste / trim loss as a percentage of the raw weight. 5% = lose 5 g out of every 100 g.">
                      Waste
                    </span>
                    <span>Cost</span>
                    <span aria-hidden />
                  </div>
                  <ul className="v2-rcp-rows">
                    {rows.map((r) => (
                      <li key={r.ingredientId} className="v2-rcp-row">
                        <span className="v2-rcp-name" title={r.name ?? r.ingredientId}>
                          {r.name ?? r.ingredientId}
                        </span>
                        <Input
                          type="number"
                          step={displayStep(r.unit)}
                          min="0"
                          value={toDisplayQty(r.quantity, r.unit)}
                          onChange={(e) =>
                            updateRow(r.ingredientId, {
                              quantity: fromDisplayQty(Number(e.target.value), r.unit),
                            })
                          }
                          aria-label="Quantity"
                          className="v2-rcp-num"
                          trailingAdornment={<span className="v2-muted">{displayUnit(r.unit)}</span>}
                        />
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          max="100"
                          value={factorToPercent(r.wasteFactor)}
                          onChange={(e) =>
                            updateRow(r.ingredientId, {
                              wasteFactor: percentToFactor(Number(e.target.value)),
                            })
                          }
                          aria-label="Waste percentage"
                          className="v2-rcp-num"
                          trailingAdornment={<span className="v2-muted">%</span>}
                        />
                        <span className="tabular v2-rcp-cost">{formatPrice(lineCost(r))}</span>
                        <button
                          type="button"
                          className="v2-rcp-remove"
                          onClick={() => removeRow(r.ingredientId)}
                          aria-label={`Remove ${r.name ?? r.ingredientId}`}
                          title={`Remove ${r.name ?? r.ingredientId}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="v2-rcp-add">
                <Select
                  value={pickerIngId}
                  onChange={(e) => setPickerIngId(e.target.value)}
                  aria-label="Add ingredient"
                  placeholder="Pick an ingredient…"
                  options={availableIngredients.map((i) => ({
                    value: i.id,
                    label: `${i.name} · ${formatPrice(i.costPerUnit)}/${i.unit}`,
                  }))}
                />
                <Button leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={addIngredient} disabled={!pickerIngId}>
                  Add to recipe
                </Button>
              </div>
            </CardBody>
          </Card>

          <div className="v2-form-row-2">
            <Input
              label="Yield · portions per batch"
              type="number"
              min="1"
              value={yieldPortions}
              onChange={(e) => setYieldPortions(Math.max(1, Number(e.target.value) || 1))}
            />
            <Input
              label="Prep time (minutes)"
              type="number"
              min="0"
              value={prepTime}
              onChange={(e) => setPrepTime(e.target.value)}
              description="Used by KDS prep estimates"
            />
          </div>
          <Textarea label="Notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title={`Delete recipe for ${menuItem.name}?`}
        description="The menu item keeps its static cost. You can re-create the recipe at any time."
        confirmLabel="Delete recipe"
        destructive
      />
    </>
  );
}

// =============================================================
// Ingredients panel
// =============================================================

interface IngredientDialogState {
  open: boolean;
  ingredient: IngredientData | null;
}

function IngredientsPanel() {
  const toast = useToast();
  const [list, setList] = useState<IngredientData[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState<IngredientCategory | "all">("all");
  const [dialog, setDialog] = useState<IngredientDialogState>({ open: false, ingredient: null });
  const [pendingDelete, setPendingDelete] = useState<IngredientData | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ingredients");
      if (res.ok) {
        const data = await res.json();
        setList(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((i) => {
      if (catFilter !== "all" && i.category !== catFilter) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        (i.supplier?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [list, query, catFilter]);

  const cols: Column<IngredientData>[] = [
    {
      key: "name",
      header: "Ingredient",
      cell: (i) => <span>{i.name}</span>,
      sortValue: (i) => i.name,
    },
    {
      key: "category",
      header: "Category",
      cell: (i) => <Badge tone="neutral" variant="soft">{i.category}</Badge>,
      sortValue: (i) => i.category,
    },
    {
      key: "unit",
      header: "Unit",
      cell: (i) => i.unit,
      sortValue: (i) => i.unit,
    },
    {
      key: "cost",
      header: "Cost / unit",
      align: "right",
      cell: (i) => formatPrice(i.costPerUnit),
      sortValue: (i) => i.costPerUnit,
    },
    {
      key: "supplier",
      header: "Supplier",
      cell: (i) => i.supplier || <span className="v2-muted">—</span>,
      sortValue: (i) => i.supplier ?? "",
    },
    {
      key: "actions",
      header: "",
      cell: (i) => (
        <div className="v2-row-actions">
          <Button size="sm" variant="ghost" leadingIcon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setDialog({ open: true, ingredient: i })}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPendingDelete(i)} aria-label={`Delete ${i.name}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const doDelete = async () => {
    if (!pendingDelete) return;
    const res = await fetch(`/api/admin/ingredients?id=${encodeURIComponent(pendingDelete.id)}`, { method: "DELETE" });
    if (res.ok) {
      setList((arr) => arr.filter((i) => i.id !== pendingDelete.id));
      toast.success("Ingredient removed", pendingDelete.name);
    } else {
      toast.error("Delete failed");
    }
    setPendingDelete(null);
  };

  return (
    <>
      <div className="v2-filters">
        <div className="v2-filter-search">
          <Input
            placeholder="Search ingredients or suppliers…"
            leadingAdornment={<Search className="h-3.5 w-3.5" />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Tabs
          value={catFilter}
          onChange={(v) => setCatFilter(v as IngredientCategory | "all")}
          tabs={[
            { value: "all", label: "All", count: list.length },
            ...INGREDIENT_CATEGORIES.map((c) => ({
              value: c,
              label: c,
              count: list.filter((i) => i.category === c).length,
            })),
          ]}
          variant="pill"
          ariaLabel="Category filter"
        />
        <Button
          variant="primary"
          leadingIcon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => setDialog({ open: true, ingredient: null })}
        >
          New ingredient
        </Button>
      </div>

      {loading ? (
        <div className="v2-page-loading">Loading…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={FlaskConical}
              title={list.length === 0 ? "No ingredients yet" : "No matches"}
              description={list.length === 0 ? "Add your first ingredient to start building recipes." : "Try clearing filters."}
              action={
                list.length === 0 ? (
                  <Button variant="primary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setDialog({ open: true, ingredient: null })}>
                    New ingredient
                  </Button>
                ) : undefined
              }
            />
          </CardBody>
        </Card>
      ) : (
        <Card padding="none">
          <CardBody>
            <Table rows={filtered} columns={cols} rowKey={(i) => i.id} defaultSort={{ key: "name", dir: "asc" }} />
          </CardBody>
        </Card>
      )}

      <IngredientDialog
        state={dialog}
        onClose={() => setDialog({ open: false, ingredient: null })}
        onSaved={async () => {
          setDialog({ open: false, ingredient: null });
          await fetchAll();
          toast.success("Saved");
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={doDelete}
        title={`Delete ${pendingDelete?.name ?? "this ingredient"}?`}
        description="Recipes that reference this ingredient will lose this line item. The action is irreversible."
        confirmLabel="Delete"
        destructive
      />
    </>
  );
}

interface IngDialogProps {
  state: IngredientDialogState;
  onClose: () => void;
  onSaved: () => void;
}

function IngredientDialog({ state, onClose, onSaved }: IngDialogProps) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<IngredientCategory>("produce");
  const [unit, setUnit] = useState<IngredientUnit>("kg");
  const [costStr, setCostStr] = useState("0.00");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    const ing = state.ingredient;
    setName(ing?.name ?? "");
    setCategory(ing?.category ?? "produce");
    setUnit(ing?.unit ?? "kg");
    setCostStr(ing ? (ing.costPerUnit / 100).toFixed(2) : "0.00");
    setSupplier(ing?.supplier ?? "");
    setNotes(ing?.notes ?? "");
  }, [state]);

  if (!state.open) return <Dialog open={false} onClose={onClose} />;

  const save = async () => {
    if (!name.trim()) {
      toast.warning("Name required");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        id: state.ingredient?.id,
        name: name.trim(),
        category,
        unit,
        costPerUnit: Math.round(parseFloat(costStr || "0") * 100),
        supplier: supplier.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      const res = await fetch("/api/admin/ingredients", {
        method: state.ingredient ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        onSaved();
      } else {
        toast.error("Could not save");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={state.ingredient ? `Edit ${state.ingredient.name}` : "New ingredient"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy}>{state.ingredient ? "Save changes" : "Create ingredient"}</Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. San Marzano tomatoes" />
        <div className="v2-form-row-2">
          <Select
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value as IngredientCategory)}
            options={INGREDIENT_CATEGORIES.map((c) => ({ value: c, label: c }))}
          />
          <Select
            label="Unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value as IngredientUnit)}
            options={INGREDIENT_UNITS.map((u) => ({ value: u, label: u }))}
          />
        </div>
        <Input
          label={`Cost per ${unit}`}
          type="number"
          step="0.01"
          min="0"
          value={costStr}
          onChange={(e) => setCostStr(e.target.value)}
          trailingAdornment={<span className="v2-muted">zł</span>}
        />
        <Input label="Supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Optional" />
        <Textarea label="Notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Dialog>
  );
}
