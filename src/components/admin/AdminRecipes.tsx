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
        <div className="v2-rcp-board">
          {grouped.map(([cat, items]) => {
            const Icon = CATEGORY_ICON[cat];
            return (
              <section key={cat} className="v2-rcp-group">
                <header className="v2-rcp-group-header">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  <span className="v2-rcp-group-name">{MENU_CATEGORY_LABELS[cat]}</span>
                  <span className="v2-rcp-group-count">{items.length}</span>
                </header>
                <div className="v2-rcp-grid">
                  {items.map((item) => {
                    const recipe = recipeByMenuId.get(item.id);
                    const hasRecipe = !!recipe;
                    const enriched = (recipe?.enrichedIngredients ?? []) as EnrichedRecipeIngredient[];
                    const calculatedCost = recipe?.calculatedCost ?? 0;
                    const margin = item.price > 0 ? Math.round(((item.price - calculatedCost) / item.price) * 100) : 0;
                    const marginTone: "success" | "warning" | "danger" = margin >= 65 ? "success" : margin >= 50 ? "warning" : "danger";
                    return (
                      <RecipeCard
                        key={item.id}
                        item={item}
                        recipe={recipe}
                        hasRecipe={hasRecipe}
                        ingredients={enriched}
                        calculatedCost={calculatedCost}
                        margin={margin}
                        marginTone={marginTone}
                        onEdit={() => setEditing(item)}
                      />
                    );
                  })}
                </div>
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
// Recipe card (board view)
// =============================================================

/**
 * Stable palette of segment colours for the cost-breakdown bar. We pick a
 * colour per ingredient by hashing its id, so the same ingredient lights up
 * the same colour on every dish — easier to scan than a per-card random
 * palette. Six tones is enough to feel varied without a rainbow.
 */
const COST_BAR_COLORS = [
  "var(--brand)",
  "var(--info)",
  "var(--success)",
  "var(--warning)",
  "#a855f7",
  "#06b6d4",
] as const;
function colorForIngredient(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return COST_BAR_COLORS[Math.abs(h) % COST_BAR_COLORS.length];
}

interface RecipeCardProps {
  item: MenuItemData;
  recipe: RecipeData | undefined;
  hasRecipe: boolean;
  ingredients: EnrichedRecipeIngredient[];
  calculatedCost: number;
  margin: number;
  marginTone: "success" | "warning" | "danger";
  onEdit: () => void;
}

function RecipeCard({
  item,
  recipe,
  hasRecipe,
  ingredients,
  calculatedCost,
  margin,
  marginTone,
  onEdit,
}: RecipeCardProps) {
  // Sort ingredients by cost share descending so the bar reads largest→smallest.
  // Anything <2% of total cost is grouped into "Other" so the bar doesn't end
  // in a row of one-pixel slivers that are impossible to hover.
  const segments = useMemo(() => {
    if (!hasRecipe || ingredients.length === 0 || calculatedCost <= 0) return [];
    const total = ingredients.reduce((s, ri) => s + (ri.lineCost ?? 0), 0);
    if (total <= 0) return [];
    const sorted = [...ingredients].sort((a, b) => (b.lineCost ?? 0) - (a.lineCost ?? 0));
    const visible: { id: string; name: string; cost: number; pct: number; color: string }[] = [];
    let otherCost = 0;
    for (const ri of sorted) {
      const cost = ri.lineCost ?? 0;
      const pct = (cost / total) * 100;
      if (pct < 2) {
        otherCost += cost;
      } else {
        visible.push({
          id: ri.ingredientId,
          name: ri.name ?? "Unknown",
          cost,
          pct,
          color: colorForIngredient(ri.ingredientId),
        });
      }
    }
    if (otherCost > 0) {
      visible.push({
        id: "__other__",
        name: "Other",
        cost: otherCost,
        pct: (otherCost / total) * 100,
        color: "var(--fg-subtle)",
      });
    }
    return visible;
  }, [hasRecipe, ingredients, calculatedCost]);

  return (
    <article
      className={`v2-rcp-card ${hasRecipe ? "" : "is-empty"}`}
      data-margin-tone={hasRecipe ? marginTone : "neutral"}
    >
      <header className="v2-rcp-card-header">
        <h3 className="v2-rcp-card-name">{item.name}</h3>
        {hasRecipe ? (
          <span className="v2-rcp-card-badge is-info">{ingredients.length} ingredients</span>
        ) : (
          <span className="v2-rcp-card-badge is-warning">No recipe</span>
        )}
      </header>

      {hasRecipe ? (
        <>
          <div className="v2-rcp-cost-bar" role="img" aria-label={`Cost breakdown: ${segments.map((s) => `${s.name} ${Math.round(s.pct)}%`).join(", ")}`}>
            {segments.map((s) => (
              <span
                key={s.id}
                className="v2-rcp-cost-bar-seg"
                style={{ width: `${s.pct}%`, background: s.color }}
                title={`${s.name} · ${formatPrice(s.cost)} · ${Math.round(s.pct)}%`}
              />
            ))}
          </div>
          <ul className="v2-rcp-legend">
            {segments.slice(0, 4).map((s) => (
              <li key={s.id} className="v2-rcp-legend-item">
                <span className="v2-rcp-legend-dot" style={{ background: s.color }} aria-hidden />
                <span className="v2-rcp-legend-name">{s.name}</span>
                <span className="v2-rcp-legend-pct tabular">{Math.round(s.pct)}%</span>
              </li>
            ))}
            {segments.length > 4 && (
              <li className="v2-rcp-legend-item v2-rcp-legend-item-more">
                <span className="v2-rcp-legend-name">+{segments.length - 4} more</span>
              </li>
            )}
          </ul>
        </>
      ) : (
        <div className="v2-rcp-empty">
          <FlaskConical className="h-6 w-6 v2-muted" aria-hidden />
          <p>No ingredients linked yet. Cost is unknown until you build the recipe.</p>
        </div>
      )}

      <dl className="v2-rcp-stats">
        <div className="v2-rcp-stat">
          <dt>Price</dt>
          <dd className="tabular">{formatPrice(item.price)}</dd>
        </div>
        <div className="v2-rcp-stat">
          <dt>Cost</dt>
          <dd className="tabular">{hasRecipe ? formatPrice(calculatedCost) : "—"}</dd>
        </div>
        <div className="v2-rcp-stat">
          <dt>Margin</dt>
          <dd className={`tabular v2-rcp-margin v2-rcp-margin-${hasRecipe ? marginTone : "neutral"}`}>
            {hasRecipe ? `${margin}%` : "—"}
          </dd>
        </div>
      </dl>

      <footer className="v2-rcp-card-footer">
        {recipe?.prepTimeMinutes ? (
          <span className="v2-rcp-prep tabular">{recipe.prepTimeMinutes} min prep</span>
        ) : (
          <span aria-hidden />
        )}
        <Button
          variant={hasRecipe ? "ghost" : "primary"}
          size="sm"
          leadingIcon={hasRecipe ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          onClick={onEdit}
        >
          {hasRecipe ? "Edit recipe" : "Create recipe"}
        </Button>
      </footer>
    </article>
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

          {/* Ingredients table — uses the same `v2-mng-section` class system
              as the Menu page so the section header (icon + name + count) +
              row padding + hover + bold names all match exactly. */}
          <section className="v2-mng-section" data-variant="recipe-edit">
            {rows.length === 0 ? (
              <div style={{ padding: "12px 14px" }}>
                <EmptyState
                  icon={Coins}
                  title="No ingredients yet"
                  description="Pick one from the dropdown below to start building the recipe."
                  compact
                />
              </div>
            ) : (
              <>
                <header className="v2-mng-section-header">
                  <span className="v2-mng-section-eyebrow">
                    <Coins className="h-3.5 w-3.5" aria-hidden />
                    <span className="v2-mng-section-name">Ingredients</span>
                    <span className="v2-mng-section-count">{rows.length}</span>
                  </span>
                  <span className="v2-mng-col">Qty</span>
                  <span
                    className="v2-mng-col"
                    title="Waste / trim loss as a percentage of the raw weight. 5% = lose 5 g out of every 100 g."
                  >
                    Waste
                  </span>
                  <span className="v2-mng-col">Cost</span>
                  <span aria-hidden />
                </header>
                <ul className="v2-mng-list">
                  {rows.map((r) => (
                    <li key={r.ingredientId} className="v2-mng-row v2-mng-row-recipe">
                      <div className="v2-mng-row-main">
                        <div className="v2-mng-row-headline">
                          <span className="v2-mng-row-name" title={r.name ?? r.ingredientId}>
                            {r.name ?? r.ingredientId}
                          </span>
                        </div>
                      </div>
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
              </>
            )}
          </section>

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
