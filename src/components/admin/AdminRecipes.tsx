"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Coffee,
  Flame,
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
  type NutritionInfo,
} from "@/data/types";
import dynamic from "next/dynamic";
import { useAdminLocation } from "./v2/LocationContext";
import { useIsMobile } from "./v2/mobile";
import { useToast } from "./v2/ui/Toast";

const MobileRecipes = dynamic(
  () => import("./mobile/MobileRecipes").then((m) => m.MobileRecipes),
  { ssr: false },
);
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
  activeProductId?: string;
  /** All cost / macro fields below are derived — hydrated from the
   *  active `IngredientProduct` on read. Writes go through
   *  /api/admin/ingredient-products instead. */
  costPerUnit?: number;
  kcalPerUnit?: number;
  proteinPerUnit?: number;
  carbsPerUnit?: number;
  sugarPerUnit?: number;
  fiberPerUnit?: number;
  fatPerUnit?: number;
  supplier?: string;
  notes?: string;
}

interface ActiveOfferingInfo {
  productId: string;
  supplierId: string;
  supplierName: string;
  displayName: string | null;
  supplierSku: string | null;
}

interface EnrichedRecipeIngredient {
  ingredientId: string;
  quantity: number;
  wasteFactor: number;
  name?: string;
  unit?: string;
  unitCost?: number;
  unitKcal?: number | null;
  unitProtein?: number | null;
  unitCarbs?: number | null;
  unitSugar?: number | null;
  unitFiber?: number | null;
  unitFat?: number | null;
  lineCost?: number;
  lineKcal?: number | null;
  /** Which distributor offering this line is currently using. Null when
   *  the ingredient has no active offering yet — the row surfaces a
   *  "Link offering" affordance instead of provenance text. */
  activeOffering?: ActiveOfferingInfo | null;
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

/**
 * Nutrition-label basis for the kcal input + ingredients column. Storage
 * stays per-unit (per kg, per L, per piece) so recipe maths (kcalPerUnit
 * × quantity-in-unit × waste) stays exact; only the input/display layer
 * shows the operator-friendly "per 100g / 100ml / piece" basis that
 * matches what they read off real-world food packaging.
 */
function kcalBasisLabel(unit: IngredientUnit): string {
  if (unit === "kg" || unit === "g") return "100g";
  if (unit === "L" || unit === "ml") return "100ml";
  return unit;
}

function storedKcalToDisplay(stored: number | undefined, unit: IngredientUnit): string {
  if (typeof stored !== "number") return "";
  // For kg / L units, storage is per-kg / per-L but display is per-100g
  // / per-100ml — so divide by 10. Keep one decimal of precision so
  // values like 0.5g sugar per 100g salt round-trip exactly (typed "0.5"
  // → stored 5 → displayed "0.5" not "1").
  if (unit === "kg" || unit === "L") return String(stored / 10);
  if (unit === "g" || unit === "ml") return String(stored * 100);
  return String(stored);
}

function displayKcalToStored(display: number, unit: IngredientUnit): number {
  // Use Math.round only at storage time so small per-100g values
  // (sugar / fiber in trace amounts) keep their precision. For kg / L
  // we multiply by 10 (per-100g → per-kg).
  if (unit === "kg" || unit === "L") return Math.max(0, Math.round(display * 10));
  if (unit === "g" || unit === "ml") return Math.max(0, Math.round(display / 100));
  return Math.max(0, Math.round(display));
}

interface CalculatedNutrition {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  sugar: number | null;
  fiber: number | null;
  fat: number | null;
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
  /** Per-portion kcal computed from `ingredient.kcalPerUnit` × qty × waste.
   *  Null when any ingredient is missing its `kcalPerUnit` value — the
   *  recipe editor surfaces a "—" placeholder + a hint instead of a
   *  misleading partial sum. */
  calculatedCalories?: number | null;
  /** Per-portion macros (in grams) computed the same way. Each field is
   *  independent — `protein` is set when every line has `proteinPerUnit`,
   *  even if `fiber` is missing on one ingredient. */
  calculatedNutrition?: CalculatedNutrition;
}

interface MenuItemData {
  id: string;
  name: string;
  category: MenuCategory;
  price: number;
  cost: number;
  // Surface the rest of the product fields so the Recipe editor (now the
  // owner of product info + dietary disclosures) can render + edit them.
  description?: string;
  tags?: ("vegetarian" | "vegan" | "spicy" | "gluten-free")[];
  halalStatus?: "halal" | "non-halal" | "uncertified";
  nutriGrade?: "A" | "B" | "C" | "D";
  containsPork?: boolean;
  containsAlcohol?: boolean;
  nutrition?: NutritionInfo;
  _isCustom?: boolean;
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
  const { isMobile, ready } = useIsMobile();
  if (ready && isMobile) {
    return <MobileRecipes />;
  }
  return <AdminRecipesDesktop />;
}

function AdminRecipesDesktop() {
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
  /** Mounted alongside the recipe editor so a recipe row's "Link
   *  offering" affordance can open the ingredient dialog in-place,
   *  no tab hop required. */
  const [ingredientDialog, setIngredientDialog] = useState<IngredientDialogState>({
    open: false,
    ingredient: null,
  });
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
    toast.success("Saved");
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
        onEditIngredient={(id) => {
          const ing = ingredients.find((i) => i.id === id);
          if (ing) setIngredientDialog({ open: true, ingredient: ing });
        }}
      />

      <IngredientDialog
        state={ingredientDialog}
        onClose={() => setIngredientDialog({ open: false, ingredient: null })}
        onSaved={async () => {
          setIngredientDialog({ open: false, ingredient: null });
          await fetchAll();
          toast.success("Saved");
        }}
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
  /** Open the IngredientDialog for the given ingredient — lets the
   *  recipe row's "Link offering" button take operators straight to
   *  the place where they set up the per-distributor product without
   *  hopping tabs. */
  onEditIngredient?: (ingredientId: string) => void;
}

const MENU_TAGS: ("vegetarian" | "vegan" | "spicy" | "gluten-free")[] = [
  "vegetarian",
  "vegan",
  "spicy",
  "gluten-free",
];

const PRODUCT_CATEGORY_ORDER: MenuCategory[] = [
  "pizza",
  "pasta",
  "antipasti",
  "panini",
  "drinks",
  "desserts",
];

interface ProductDraft {
  name: string;
  description: string;
  category: MenuCategory;
  tags: ("vegetarian" | "vegan" | "spicy" | "gluten-free")[];
  halalStatus: "" | "halal" | "non-halal" | "uncertified";
  nutriGrade: "" | "A" | "B" | "C" | "D";
  containsPork: boolean;
  containsAlcohol: boolean;
}

function productDraftFromItem(item: MenuItemData): ProductDraft {
  return {
    name: item.name,
    description: item.description ?? "",
    category: item.category,
    tags: (item.tags ?? []).slice(),
    halalStatus: item.halalStatus ?? "",
    nutriGrade: item.nutriGrade ?? "",
    containsPork: Boolean(item.containsPork),
    containsAlcohol: Boolean(item.containsAlcohol),
  };
}

function RecipeEditor({ menuItem, recipe, ingredients, onClose, onSaved, onEditIngredient }: EditorProps) {
  const toast = useToast();
  const [rows, setRows] = useState<EnrichedRecipeIngredient[]>([]);
  const [yieldPortions, setYieldPortions] = useState(1);
  const [prepTime, setPrepTime] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [pickerIngId, setPickerIngId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Product info + dietary fields used to live on /admin/menu/[slug] but
  // were moved here so the kitchen owns the full product definition in
  // one place. Saved alongside the recipe ingredients on submit.
  const emptyProduct: ProductDraft = {
    name: "",
    description: "",
    category: "pizza",
    tags: [],
    halalStatus: "",
    nutriGrade: "",
    containsPork: false,
    containsAlcohol: false,
  };
  const [product, setProduct] = useState<ProductDraft>(emptyProduct);
  const [productInitial, setProductInitial] = useState<ProductDraft>(emptyProduct);

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
        unitKcal: r.unitKcal,
        unitProtein: r.unitProtein,
        unitCarbs: r.unitCarbs,
        unitSugar: r.unitSugar,
        unitFiber: r.unitFiber,
        unitFat: r.unitFat,
        activeOffering: r.activeOffering ?? null,
      })),
    );
    setYieldPortions(recipe?.yieldPortions ?? 1);
    setPrepTime(recipe?.prepTimeMinutes ? String(recipe.prepTimeMinutes) : "");
    setNotes(recipe?.notes ?? "");
    setPickerIngId("");
    const next = productDraftFromItem(menuItem);
    setProduct(next);
    setProductInitial(next);
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
        unitKcal: ing.kcalPerUnit,
        unitProtein: ing.proteinPerUnit,
        unitCarbs: ing.carbsPerUnit,
        unitSugar: ing.sugarPerUnit,
        unitFiber: ing.fiberPerUnit,
        unitFat: ing.fatPerUnit,
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
  // Per-portion macros computed locally so the KPI + nutrition panel
  // update as the operator edits quantities, without waiting for the
  // server roundtrip. Each macro is independent — calories can resolve
  // even if `fiber` is missing on one row — so operators can roll macros
  // out gradually without blanking everything.
  type MacroKey = "unitKcal" | "unitProtein" | "unitCarbs" | "unitSugar" | "unitFiber" | "unitFat";
  const perPortionMacro = (key: MacroKey): number | null => {
    if (rows.length === 0) return null;
    let total = 0;
    for (const r of rows) {
      const raw = r[key];
      if (typeof raw !== "number") return null;
      total += raw * r.quantity * (r.wasteFactor || 1);
    }
    return Math.round(total / (yieldPortions || 1));
  };
  const perPortionKcal = perPortionMacro("unitKcal");
  const perPortionProtein = perPortionMacro("unitProtein");
  const perPortionCarbs = perPortionMacro("unitCarbs");
  const perPortionSugar = perPortionMacro("unitSugar");
  const perPortionFiber = perPortionMacro("unitFiber");
  const perPortionFat = perPortionMacro("unitFat");
  const rowsMissingKcal = rows.filter((r) => typeof r.unitKcal !== "number");

  const save = async () => {
    if (!menuItem) return;
    if (!product.name.trim()) {
      toast.error("Name required");
      return;
    }
    setBusy(true);
    try {
      // 1. Ingredients + yield + prep time + notes — the original recipe
      //    save. Skip the round trip when the operator opened the dialog
      //    just to edit product info on an item that has no recipe yet
      //    and added no rows — otherwise we'd persist an empty recipe
      //    that flips the card from "No recipe" to "0 ingredients".
      if (rows.length > 0 || hasExisting) {
        const recipeRes = await fetch("/api/admin/recipes", {
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
        if (!recipeRes.ok) {
          toast.error("Recipe save failed", "Try again.");
          return;
        }
      }

      // 2. Product info + dietary fields — diff vs initial. The menu page
      //    no longer offers inputs for these, so the recipe editor is the
      //    single source of truth. Seed items go through PUT /api/admin/menu
      //    (override map); custom items go through PATCH /api/admin/menu/custom.
      const productPatch: Record<string, unknown> = {};
      if (product.name.trim() !== productInitial.name.trim()) {
        productPatch.name = product.name.trim();
      }
      if (product.description !== productInitial.description) {
        productPatch.description = product.description;
      }
      if (product.category !== productInitial.category) {
        productPatch.category = product.category;
      }
      if (
        JSON.stringify(product.tags.slice().sort()) !==
        JSON.stringify(productInitial.tags.slice().sort())
      ) {
        productPatch.tags = product.tags;
      }
      if (product.halalStatus !== productInitial.halalStatus) {
        productPatch.halalStatus =
          product.halalStatus === "" ? null : product.halalStatus;
      }
      if (product.nutriGrade !== productInitial.nutriGrade) {
        productPatch.nutriGrade =
          product.nutriGrade === "" ? null : product.nutriGrade;
      }
      if (Boolean(product.containsPork) !== Boolean(productInitial.containsPork)) {
        productPatch.containsPork = menuItem._isCustom
          ? product.containsPork
          : product.containsPork
          ? true
          : null;
      }
      if (
        Boolean(product.containsAlcohol) !== Boolean(productInitial.containsAlcohol)
      ) {
        productPatch.containsAlcohol = menuItem._isCustom
          ? product.containsAlcohol
          : product.containsAlcohol
          ? true
          : null;
      }

      if (Object.keys(productPatch).length > 0) {
        const productRes = menuItem._isCustom
          ? await fetch(
              `/api/admin/menu/custom?id=${encodeURIComponent(menuItem.id)}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(productPatch),
              },
            )
          : await fetch("/api/admin/menu", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ items: { [menuItem.id]: productPatch } }),
            });
        if (!productRes.ok) {
          toast.error(
            "Product info save failed",
            "Recipe saved but the product fields didn't update.",
          );
          return;
        }
      }

      onSaved();
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
        description={`Listed price ${formatPrice(menuItem.price)} · Product info, dietary disclosures, and recipe live here. Cost recalculates from real ingredient prices.`}
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
              Save changes
            </Button>
          </>
        }
      >
        <div className="v2-stack-12">
          {/* ============ KPI summary — 4 cards across the top ============ */}
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
            <KpiCard
              label="Calories"
              value={perPortionKcal ?? 0}
              display={perPortionKcal === null ? "—" : `${perPortionKcal} kcal`}
              icon={Flame}
              tone="neutral"
              staticValue
              hint={
                perPortionKcal === null
                  ? rowsMissingKcal.length === 0
                    ? "Add ingredients to compute"
                    : `${rowsMissingKcal.length} ingredient${
                        rowsMissingKcal.length === 1 ? "" : "s"
                      } missing kcal data`
                  : "Auto-computed from ingredient kcal × qty"
              }
            />
          </section>

          {/* ============ Per-portion macros ============
              Compact nutrition-label-style row. Each cell shows the
              computed gram value or "—" when any ingredient is missing
              that specific macro. Sugar is nested under carbs to mirror
              EU 1169/2011 + FDA NFP "of which sugars" convention. */}
          <section
            className="v2-rcp-nutrition"
            role="group"
            aria-label="Per-portion nutrition"
          >
            <header className="v2-rcp-nutrition-header">
              <span className="v2-rcp-nutrition-eyebrow">Per-portion nutrition</span>
              <span className="v2-rcp-nutrition-hint">
                Auto-computed from each ingredient&apos;s nutrition label.
              </span>
            </header>
            <dl className="v2-rcp-nutrition-grid">
              <div className="v2-rcp-nutrition-cell">
                <dt>Carbs</dt>
                <dd className="tabular">
                  {perPortionCarbs === null ? "—" : `${perPortionCarbs} g`}
                </dd>
                <small className="v2-rcp-nutrition-sub">
                  of which sugars{" "}
                  <span className="tabular">
                    {perPortionSugar === null ? "—" : `${perPortionSugar} g`}
                  </span>
                </small>
              </div>
              <div className="v2-rcp-nutrition-cell">
                <dt>Fiber</dt>
                <dd className="tabular">
                  {perPortionFiber === null ? "—" : `${perPortionFiber} g`}
                </dd>
              </div>
              <div className="v2-rcp-nutrition-cell">
                <dt>Protein</dt>
                <dd className="tabular">
                  {perPortionProtein === null ? "—" : `${perPortionProtein} g`}
                </dd>
              </div>
              <div className="v2-rcp-nutrition-cell">
                <dt>Fat</dt>
                <dd className="tabular">
                  {perPortionFat === null ? "—" : `${perPortionFat} g`}
                </dd>
              </div>
            </dl>
          </section>

          {/* ============ Ingredients table — the main recipe edit surface ============ */}
          {/* Uses the same `v2-mng-section` class system
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
                        {/* Inline provenance: surface which distributor
                            offering this line's cost + macros come from
                            so the recipe → ingredient → offering chain
                            is visible at a glance. Click jumps to the
                            ingredient editor to (re)link a distributor. */}
                        {r.activeOffering ? (
                          <button
                            type="button"
                            className="v2-rcp-row-offering"
                            onClick={() =>
                              onEditIngredient?.(r.ingredientId)
                            }
                            title="Edit distributor offerings for this ingredient"
                          >
                            via <strong>{r.activeOffering.supplierName}</strong>
                            {r.activeOffering.displayName
                              ? ` · ${r.activeOffering.displayName}`
                              : null}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="v2-rcp-row-offering is-empty"
                            onClick={() =>
                              onEditIngredient?.(r.ingredientId)
                            }
                            title="Add a distributor offering so cost + calories compute"
                          >
                            No offering linked — add one
                          </button>
                        )}
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
                label:
                  typeof i.costPerUnit === "number"
                    ? `${i.name} · ${formatPrice(i.costPerUnit)}/${i.unit}`
                    : `${i.name} · no active offering`,
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

          {/* ============ Product info ============
              Name + category + tags + description. Moved here from
              /admin/menu/[slug] so the kitchen owns the product
              definition. Edits flow into the menu override map (seed)
              or the custom-item row (custom), saved alongside the
              recipe on submit. */}
          <div className="v2-rcp-dialog-divider" role="separator" aria-hidden />
          <div className="v2-rcp-dialog-section">
            <h3 className="v2-rcp-dialog-section-title">Product info</h3>
            <p className="v2-rcp-dialog-section-hint">
              Name, category, tags, description — applies to {menuItem.name}
              {" "}on this location.
            </p>
            <Input
              label="Name"
              value={product.name}
              onChange={(e) => setProduct((p) => ({ ...p, name: e.target.value }))}
            />
            <div className="v2-form-row-2">
              <Select
                label="Category"
                value={product.category}
                onChange={(e) =>
                  setProduct((p) => ({
                    ...p,
                    category: e.target.value as MenuCategory,
                  }))
                }
                options={PRODUCT_CATEGORY_ORDER.map((cc) => ({
                  value: cc,
                  label: MENU_CATEGORY_LABELS[cc],
                }))}
              />
              <div className="v2-field">
                <label className="v2-field-label">Tags</label>
                <div
                  className="v2-detail-tags-row"
                  role="group"
                  aria-label="Dietary tags"
                >
                  {MENU_TAGS.map((tag) => {
                    const on = product.tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={`v2-chip ${on ? "is-on" : ""}`}
                        aria-pressed={on}
                        onClick={() =>
                          setProduct((p) => ({
                            ...p,
                            tags: on
                              ? p.tags.filter((t) => t !== tag)
                              : [...p.tags, tag],
                          }))
                        }
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <Textarea
              label="Description"
              value={product.description}
              onChange={(e) =>
                setProduct((p) => ({ ...p, description: e.target.value }))
              }
              rows={3}
            />
          </div>

          {/* ============ Dietary disclosures ============
              Halal status, Nutri-Grade, contains-pork / -alcohol. The
              customer card only renders each chip when the location's
              compliance zone enables that disclosure — see
              /admin/regulatory-compliance. */}
          <div className="v2-rcp-dialog-divider" role="separator" aria-hidden />
          <div className="v2-rcp-dialog-section">
            <h3 className="v2-rcp-dialog-section-title">Dietary disclosures</h3>
            <p className="v2-rcp-dialog-section-hint">
              Per-item flags surfaced as chips on the customer menu card.
              Calories are computed above from ingredient totals — set kcal
              per ingredient on the Ingredients tab.
            </p>
            <div className="v2-form-row-2">
              <Select
                label="Halal status"
                value={product.halalStatus}
                onChange={(e) =>
                  setProduct((p) => ({
                    ...p,
                    halalStatus: e.target.value as ProductDraft["halalStatus"],
                  }))
                }
                options={[
                  { value: "", label: "— No claim" },
                  { value: "halal", label: "Halal (MUIS-covered)" },
                  { value: "non-halal", label: "Non-halal" },
                  { value: "uncertified", label: "Uncertified" },
                ]}
                description="Renders only on SG trucks."
              />
              <Select
                label="Nutri-Grade"
                value={product.nutriGrade}
                onChange={(e) =>
                  setProduct((p) => ({
                    ...p,
                    nutriGrade: e.target.value as ProductDraft["nutriGrade"],
                  }))
                }
                options={[
                  { value: "", label: "— Not graded" },
                  { value: "A", label: "A — healthiest" },
                  { value: "B", label: "B" },
                  { value: "C", label: "C" },
                  { value: "D", label: "D — least healthy" },
                ]}
                description="SG NEA Nutri-Grade for sugar-sweetened beverages."
              />
            </div>
            <div className="v2-field">
              <label className="v2-field-label">Disclaimers</label>
              <label className="v2-detail-toggle">
                <input
                  type="checkbox"
                  checked={product.containsPork}
                  onChange={(e) =>
                    setProduct((p) => ({
                      ...p,
                      containsPork: e.target.checked,
                    }))
                  }
                />
                <span>Contains pork</span>
              </label>
              <label className="v2-detail-toggle">
                <input
                  type="checkbox"
                  checked={product.containsAlcohol}
                  onChange={(e) =>
                    setProduct((p) => ({
                      ...p,
                      containsAlcohol: e.target.checked,
                    }))
                  }
                />
                <span>Contains alcohol</span>
              </label>
            </div>
          </div>
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
      cell: (i) =>
        typeof i.costPerUnit === "number" ? (
          formatPrice(i.costPerUnit)
        ) : (
          <span
            className="v2-muted"
            title="No distributor offering linked yet — open the ingredient to add one."
          >
            —
          </span>
        ),
      sortValue: (i) => i.costPerUnit ?? -1,
    },
    {
      key: "kcal",
      header: "Calories",
      align: "right",
      cell: (i) =>
        typeof i.kcalPerUnit === "number" ? (
          <span className="tabular">
            {storedKcalToDisplay(i.kcalPerUnit, i.unit)}
            <span className="v2-muted"> / {kcalBasisLabel(i.unit)}</span>
          </span>
        ) : (
          <span className="v2-muted" title="No kcal set — recipes referencing this ingredient won't show a computed calorie value.">—</span>
        ),
      sortValue: (i) => i.kcalPerUnit ?? -1,
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

interface SupplierLite {
  id: string;
  name: string;
}

interface OfferingDraft {
  /** Server id once persisted. Drafts created in-dialog stay client-only
   *  until save spawns a POST. */
  id?: string;
  supplierId: string;
  supplierSku: string;
  displayName: string;
  costStr: string;
  kcalStr: string;
  proteinStr: string;
  carbsStr: string;
  sugarStr: string;
  fiberStr: string;
  fatStr: string;
  notes: string;
  /** Local key for React rendering — survives across renders without an
   *  id, since drafts may not have one yet. */
  key: string;
}

function emptyOffering(supplierId: string = ""): OfferingDraft {
  return {
    supplierId,
    supplierSku: "",
    displayName: "",
    costStr: "",
    kcalStr: "",
    proteinStr: "",
    carbsStr: "",
    sugarStr: "",
    fiberStr: "",
    fatStr: "",
    notes: "",
    key: `draft-${Math.random().toString(36).slice(2, 10)}`,
  };
}

function IngredientDialog({ state, onClose, onSaved }: IngDialogProps) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<IngredientCategory>("produce");
  const [unit, setUnit] = useState<IngredientUnit>("kg");
  const [notes, setNotes] = useState("");
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);
  const [offerings, setOfferings] = useState<OfferingDraft[]>([]);
  /** Tracks which offering should be active on save. Keyed by either
   *  the server id (for existing) or the draft key (for new). */
  const [activeKey, setActiveKey] = useState<string>("");
  /** Server ids of offerings present at open time but removed in the
   *  dialog — sent as DELETE on save so the server stays in sync. */
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    const ing = state.ingredient;
    setName(ing?.name ?? "");
    setCategory(ing?.category ?? "produce");
    setUnit(ing?.unit ?? "kg");
    setNotes(ing?.notes ?? "");
    setDeletedIds([]);
    // Load existing offerings (+ supplier list) in parallel. New
    // ingredients start with an empty offerings list — the operator
    // adds the first offering before saving the recipe-affecting cost.
    let cancelled = false;
    (async () => {
      const [supRes, offRes] = await Promise.all([
        fetch("/api/admin/suppliers"),
        ing
          ? fetch(`/api/admin/ingredient-products?ingredientId=${encodeURIComponent(ing.id)}`)
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      const sups: SupplierLite[] = supRes.ok ? await supRes.json() : [];
      setSuppliers(sups);
      let active = "";
      if (ing && offRes && offRes.ok) {
        const products = (await offRes.json()) as Array<{
          id: string;
          supplierId: string;
          supplierSku?: string;
          displayName?: string;
          costPerUnit: number;
          kcalPerUnit?: number;
          proteinPerUnit?: number;
          carbsPerUnit?: number;
          sugarPerUnit?: number;
          fiberPerUnit?: number;
          fatPerUnit?: number;
          notes?: string;
        }>;
        const next: OfferingDraft[] = products.map((p) => ({
          id: p.id,
          supplierId: p.supplierId,
          supplierSku: p.supplierSku ?? "",
          displayName: p.displayName ?? "",
          costStr: (p.costPerUnit / 100).toFixed(2),
          kcalStr: storedKcalToDisplay(p.kcalPerUnit, ing.unit),
          proteinStr: storedKcalToDisplay(p.proteinPerUnit, ing.unit),
          carbsStr: storedKcalToDisplay(p.carbsPerUnit, ing.unit),
          sugarStr: storedKcalToDisplay(p.sugarPerUnit, ing.unit),
          fiberStr: storedKcalToDisplay(p.fiberPerUnit, ing.unit),
          fatStr: storedKcalToDisplay(p.fatPerUnit, ing.unit),
          notes: p.notes ?? "",
          key: p.id,
        }));
        setOfferings(next);
        active = ing.activeProductId ?? next[0]?.id ?? "";
      } else {
        setOfferings([]);
      }
      setActiveKey(active);
    })();
    return () => {
      cancelled = true;
    };
  }, [state]);

  if (!state.open) return <Dialog open={false} onClose={onClose} />;

  const supplierLabel = (id: string): string => {
    if (!id) return "(no supplier)";
    if (id.startsWith("legacy:")) return id.slice("legacy:".length) || "(legacy)";
    return suppliers.find((s) => s.id === id)?.name ?? "(unknown supplier)";
  };

  const addOffering = () => {
    const next = emptyOffering(suppliers[0]?.id ?? "");
    setOfferings((arr) => [...arr, next]);
    // First offering on a fresh ingredient auto-becomes active; later
    // additions require an explicit pick so existing recipes don't
    // silently flip to an untested distributor.
    if (offerings.length === 0) setActiveKey(next.key);
  };

  const removeOffering = (key: string) => {
    setOfferings((arr) => {
      const target = arr.find((o) => o.key === key);
      if (target?.id) setDeletedIds((d) => [...d, target.id!]);
      const remaining = arr.filter((o) => o.key !== key);
      if (activeKey === key) setActiveKey(remaining[0]?.key ?? "");
      return remaining;
    });
  };

  const updateOffering = (key: string, patch: Partial<OfferingDraft>) => {
    setOfferings((arr) => arr.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  };

  const save = async () => {
    if (!name.trim()) {
      toast.warning("Name required");
      return;
    }
    // Every offering needs a supplier picked — otherwise the row makes
    // no sense (no distributor to attribute the cost to). Block save
    // with a clear message rather than silently dropping bad rows.
    const missingSupplier = offerings.find((o) => !o.supplierId);
    if (missingSupplier) {
      toast.error(
        "Pick a supplier for every offering",
        suppliers.length === 0
          ? "No suppliers yet — add one at /admin/suppliers first."
          : undefined,
      );
      return;
    }
    setBusy(true);
    try {
      // 1. Persist the ingredient row (identity only — cost + macros
      //    live on the offerings).
      const ingPayload = {
        id: state.ingredient?.id,
        name: name.trim(),
        category,
        unit,
        notes: notes.trim() || undefined,
        // Leave activeProductId off; we'll PATCH it after offerings
        // settle so we can reference newly-created products by their
        // server id.
        activeProductId: undefined,
      };
      const ingRes = await fetch("/api/admin/ingredients", {
        method: state.ingredient ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ingPayload),
      });
      if (!ingRes.ok) {
        toast.error("Could not save ingredient");
        return;
      }
      const savedIng = (await ingRes.json()) as { id: string };

      // 2. Per-offering CRUD. Convert per-100g display values back to
      //    per-unit storage via the same helpers used everywhere else
      //    so recipe maths stays exact.
      const parseMacro = (raw: string): number | null => {
        const t = raw.trim();
        if (t === "") return null;
        const n = displayKcalToStored(Number(t), unit);
        return Number.isFinite(n) ? n : null;
      };

      // Track which offering ends up active. For existing offerings the
      // server id is stable; for new offerings we read the id off the
      // POST response.
      let chosenActiveServerId: string | undefined;
      const failed: string[] = [];

      for (const o of offerings) {
        const payload = {
          id: o.id,
          ingredientId: savedIng.id,
          supplierId: o.supplierId,
          supplierSku: o.supplierSku.trim() || undefined,
          displayName: o.displayName.trim() || undefined,
          costPerUnit: Math.round(parseFloat(o.costStr || "0") * 100),
          kcalPerUnit: parseMacro(o.kcalStr),
          proteinPerUnit: parseMacro(o.proteinStr),
          carbsPerUnit: parseMacro(o.carbsStr),
          sugarPerUnit: parseMacro(o.sugarStr),
          fiberPerUnit: parseMacro(o.fiberStr),
          fatPerUnit: parseMacro(o.fatStr),
          notes: o.notes.trim() || undefined,
        };
        const res = await fetch("/api/admin/ingredient-products", {
          method: o.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          failed.push(supplierLabel(o.supplierId));
          continue;
        }
        const saved = (await res.json()) as { id: string };
        if (o.key === activeKey) chosenActiveServerId = saved.id;
      }

      // 3. DELETE offerings the operator removed.
      for (const id of deletedIds) {
        await fetch(`/api/admin/ingredient-products?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
      }

      // 4. Flip active offering. The product create / update routes
      //    auto-activate the first-ever offering for an ingredient, so
      //    new ingredients with one offering need no explicit PATCH —
      //    but multi-offering edits do.
      if (chosenActiveServerId) {
        await fetch("/api/admin/ingredient-products", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ingredientId: savedIng.id,
            productId: chosenActiveServerId,
          }),
        });
      }

      if (failed.length > 0) {
        toast.error(
          "Some offerings failed",
          `Couldn't save: ${failed.join(", ")}.`,
        );
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const ing = state.ingredient;

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={ing ? `Edit ${ing.name}` : "New ingredient"}
      description="Identity + per-distributor offerings. Cost + nutrition come from the active offering — switching distributors = activating a different row."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={busy}>
            {ing ? "Save changes" : "Create ingredient"}
          </Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. San Marzano tomatoes"
        />
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
        <Textarea
          label="Notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="v2-rcp-ing-nutrition">
          <header className="v2-rcp-ing-nutrition-header">
            <span className="v2-rcp-ing-nutrition-eyebrow">Distributor offerings</span>
            <span className="v2-rcp-ing-nutrition-hint">
              One row per supplier carrying this ingredient. Cost + nutrition
              from the <strong>active</strong> row drive recipe totals.
            </span>
          </header>
          {suppliers.length === 0 ? (
            <p className="v2-muted" style={{ fontSize: "var(--text-xs)" }}>
              No suppliers yet. Add one at{" "}
              <a href="/admin/suppliers" target="_blank" rel="noreferrer">
                /admin/suppliers
              </a>
              {" "}then come back to link offerings.
            </p>
          ) : null}
          {offerings.map((o) => (
            <fieldset key={o.key} className="v2-ing-offering">
              <legend>
                <label className="v2-detail-toggle" style={{ display: "inline-flex" }}>
                  <input
                    type="radio"
                    name="active-offering"
                    checked={activeKey === o.key}
                    onChange={() => setActiveKey(o.key)}
                  />
                  <span>
                    {activeKey === o.key ? "Active" : "Make active"} ·{" "}
                    {supplierLabel(o.supplierId)}
                  </span>
                </label>
                <button
                  type="button"
                  className="v2-rcp-remove"
                  onClick={() => removeOffering(o.key)}
                  title="Remove offering"
                  aria-label={`Remove offering from ${supplierLabel(o.supplierId)}`}
                  style={{ opacity: 1 }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </legend>
              <div className="v2-form-row-2">
                <Select
                  label="Supplier"
                  value={o.supplierId}
                  onChange={(e) => updateOffering(o.key, { supplierId: e.target.value })}
                  options={[
                    { value: "", label: "— Pick supplier" },
                    ...suppliers.map((s) => ({ value: s.id, label: s.name })),
                    ...(o.supplierId.startsWith("legacy:")
                      ? [{ value: o.supplierId, label: `${o.supplierId.slice("legacy:".length)} (legacy)` }]
                      : []),
                  ]}
                />
                <Input
                  label="Supplier SKU"
                  value={o.supplierSku}
                  onChange={(e) => updateOffering(o.key, { supplierSku: e.target.value })}
                  placeholder="e.g. SM-DOP-400G"
                />
              </div>
              <div className="v2-form-row-2">
                <Input
                  label="Display name"
                  value={o.displayName}
                  onChange={(e) => updateOffering(o.key, { displayName: e.target.value })}
                  placeholder="optional"
                />
                <Input
                  label={`Cost per ${unit}`}
                  type="number"
                  step="0.01"
                  min="0"
                  value={o.costStr}
                  onChange={(e) => updateOffering(o.key, { costStr: e.target.value })}
                  trailingAdornment={<span className="v2-muted">zł</span>}
                />
              </div>
              <div className="v2-form-row-2">
                <Input
                  label={`Energy per ${kcalBasisLabel(unit)}`}
                  type="number"
                  step="1"
                  min="0"
                  value={o.kcalStr}
                  onChange={(e) => updateOffering(o.key, { kcalStr: e.target.value })}
                  trailingAdornment={<span className="v2-muted">kcal</span>}
                  placeholder="—"
                />
                <Input
                  label={`Fat per ${kcalBasisLabel(unit)}`}
                  type="number"
                  step="1"
                  min="0"
                  value={o.fatStr}
                  onChange={(e) => updateOffering(o.key, { fatStr: e.target.value })}
                  trailingAdornment={<span className="v2-muted">g</span>}
                  placeholder="—"
                />
              </div>
              <div className="v2-form-row-2">
                <Input
                  label={`Carbs per ${kcalBasisLabel(unit)}`}
                  type="number"
                  step="1"
                  min="0"
                  value={o.carbsStr}
                  onChange={(e) => updateOffering(o.key, { carbsStr: e.target.value })}
                  trailingAdornment={<span className="v2-muted">g</span>}
                  placeholder="—"
                />
                <Input
                  label="of which sugars"
                  type="number"
                  step="1"
                  min="0"
                  value={o.sugarStr}
                  onChange={(e) => updateOffering(o.key, { sugarStr: e.target.value })}
                  trailingAdornment={<span className="v2-muted">g</span>}
                  placeholder="—"
                />
              </div>
              <div className="v2-form-row-2">
                <Input
                  label={`Fiber per ${kcalBasisLabel(unit)}`}
                  type="number"
                  step="1"
                  min="0"
                  value={o.fiberStr}
                  onChange={(e) => updateOffering(o.key, { fiberStr: e.target.value })}
                  trailingAdornment={<span className="v2-muted">g</span>}
                  placeholder="—"
                />
                <Input
                  label={`Protein per ${kcalBasisLabel(unit)}`}
                  type="number"
                  step="1"
                  min="0"
                  value={o.proteinStr}
                  onChange={(e) => updateOffering(o.key, { proteinStr: e.target.value })}
                  trailingAdornment={<span className="v2-muted">g</span>}
                  placeholder="—"
                />
              </div>
            </fieldset>
          ))}
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={<Plus className="h-3.5 w-3.5" />}
            onClick={addOffering}
            disabled={suppliers.length === 0}
          >
            Add distributor offering
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
