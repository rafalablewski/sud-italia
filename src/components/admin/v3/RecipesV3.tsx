"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, FlaskConical, LayoutGrid, Percent, Plus, RefreshCw, Rows3, Star, Trash2, X } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { formatPrice, getBaseSlug } from "@/lib/utils";
import { INGREDIENT_CATEGORY_LABELS } from "@/data/types";
import type { IngredientCategory, IngredientUnit, MenuCategory } from "@/data/types";
import { Badge, type BadgeTone, Button, type ColumnV3, Dialog, Kpi, SkeletonPage, SkeletonRows, Table } from "./ui";

interface MenuItemData { id: string; name: string; price: number; category: MenuCategory }
/** Ingredient joined to its active offering (cost + macros are read-only cache). */
interface Ingredient {
  id: string; name: string; category?: IngredientCategory; unit: IngredientUnit;
  activeProductId?: string; notes?: string;
  costPerUnit?: number; kcalPerUnit?: number; proteinPerUnit?: number; carbsPerUnit?: number;
  sugarPerUnit?: number; fiberPerUnit?: number; fatPerUnit?: number; supplier?: string;
}
interface Offering {
  id: string; ingredientId: string; supplierId: string; supplierSku?: string; displayName?: string;
  costPerUnit: number; kcalPerUnit?: number; proteinPerUnit?: number; carbsPerUnit?: number;
  sugarPerUnit?: number; fiberPerUnit?: number; fatPerUnit?: number; notes?: string;
}
interface Supplier { id: string; name: string }
interface RecipeLine { ingredientId: string; quantity: number; wasteFactor?: number }
interface RecipeData { menuItemId: string; ingredients: RecipeLine[]; yieldPortions?: number; prepTimeMinutes?: number; notes?: string; calculatedCost?: number; calculatedCalories?: number }

interface Dish { baseSlug: string; name: string; category: MenuCategory; primaryId: string; avgPrice: number; siteCount: number }

const CATEGORY_ORDER: MenuCategory[] = ["pizza", "pasta", "antipasti", "panini", "drinks", "desserts"];
const CATEGORY_LABEL: Record<MenuCategory, string> = { pizza: "Pizza", pasta: "Pasta", antipasti: "Antipasti", panini: "Panini", drinks: "Drinks", desserts: "Desserts" };
const ING_CATEGORIES = Object.keys(INGREDIENT_CATEGORY_LABELS) as IngredientCategory[];
const ING_UNITS: IngredientUnit[] = ["kg", "g", "L", "ml", "piece", "bunch", "can", "bottle"];
const COST_COLORS = ["--av3-c1", "--av3-c2", "--av3-c3", "--av3-c4", "--av3-c5", "--av3-c6", "--av3-c7", "--av3-c8"];

function foodCostTone(pct: number): BadgeTone {
  if (pct <= 0) return "neutral";
  if (pct <= 30) return "ok";
  if (pct <= 38) return "warn";
  return "bad";
}

export function RecipesV3() {
  const allLocations = useMemo(() => getActiveLocations(), []);
  const [tab, setTab] = useState<"recipes" | "ingredients">("recipes");
  const [byLoc, setByLoc] = useState<Record<string, MenuItemData[]>>({});
  const [recipes, setRecipes] = useState<RecipeData[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cat, setCat] = useState<"all" | MenuCategory>("all");
  const [view, setView] = useState<"board" | "table">("board");
  const [q, setQ] = useState("");
  const [editSlug, setEditSlug] = useState<string | null>(null);
  const [editIng, setEditIng] = useState<Ingredient | "new" | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [menus, r, i, s] = await Promise.all([
        Promise.all(allLocations.map((l) => fetch(`/api/admin/menu?location=${l.slug}`).then((res) => (res.ok ? res.json() : [])).catch(() => []))),
        fetch(`/api/admin/recipes`).then((res) => (res.ok ? res.json() : [])).catch(() => []),
        fetch(`/api/admin/ingredients`).then((res) => (res.ok ? res.json() : [])).catch(() => []),
        fetch(`/api/admin/suppliers`).then((res) => (res.ok ? res.json() : [])).catch(() => []),
      ]);
      const map: Record<string, MenuItemData[]> = {};
      allLocations.forEach((l, idx) => { map[l.slug] = Array.isArray(menus[idx]) ? menus[idx] : []; });
      setByLoc(map);
      setRecipes(Array.isArray(r) ? r : []);
      setIngredients(Array.isArray(i) ? i : []);
      setSuppliers(Array.isArray(s) ? s : []);
    } catch (err) {
      console.error("Recipes refresh failed:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [allLocations]);

  useEffect(() => { setLoading(true); fetchAll(); }, [fetchAll]);

  const recipeByBase = useMemo(() => new Map(recipes.map((r) => [r.menuItemId, r])), [recipes]);

  const dishes = useMemo<Dish[]>(() => {
    const groups = new Map<string, { name: string; category: MenuCategory; primaryId: string; prices: number[] }>();
    for (const l of allLocations) {
      for (const item of byLoc[l.slug] ?? []) {
        const base = getBaseSlug(item.id);
        const g = groups.get(base);
        if (!g) groups.set(base, { name: item.name, category: item.category, primaryId: item.id, prices: [item.price] });
        else g.prices.push(item.price);
      }
    }
    return [...groups.entries()]
      .map(([baseSlug, g]) => ({ baseSlug, name: g.name, category: g.category, primaryId: g.primaryId, avgPrice: g.prices.reduce((s, p) => s + p, 0) / g.prices.length, siteCount: g.prices.length }))
      .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name));
  }, [byLoc, allLocations]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: dishes.length, withRecipe: 0 };
    for (const d of dishes) { c[d.category] = (c[d.category] ?? 0) + 1; if (recipeByBase.has(d.baseSlug)) c.withRecipe++; }
    return c;
  }, [dishes, recipeByBase]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return dishes.filter((d) => (cat === "all" || d.category === cat) && (!needle || d.name.toLowerCase().includes(needle)));
  }, [dishes, cat, q]);
  const editing = editSlug ? dishes.find((d) => d.baseSlug === editSlug) ?? null : null;

  // KPI rail — costing coverage + health across all dishes
  const kpis = useMemo(() => {
    const costedPcts: number[] = [];
    for (const d of dishes) {
      const r = recipeByBase.get(d.baseSlug);
      if (r?.calculatedCost && d.avgPrice) costedPcts.push((r.calculatedCost / d.avgPrice) * 100);
    }
    const avgFc = costedPcts.length ? costedPcts.reduce((s, p) => s + p, 0) / costedPcts.length : 0;
    return { costed: counts.withRecipe, total: counts.all, uncosted: counts.all - counts.withRecipe, avgFc, overTarget: costedPcts.filter((p) => p > 38).length };
  }, [dishes, recipeByBase, counts]);

  const cols: ColumnV3<Dish>[] = [
    { key: "name", header: "Dish", render: (d) => <span style={{ fontWeight: 600 }}>{d.name}</span> },
    { key: "cat", header: "Category", render: (d) => <span className="av3-cell-muted">{CATEGORY_LABEL[d.category]}</span> },
    { key: "ings", header: "Recipe", render: (d) => {
      const r = recipeByBase.get(d.baseSlug);
      if (!r || (r.ingredients?.length ?? 0) === 0) return <Badge tone="neutral">No recipe</Badge>;
      return <Badge tone="info"><FlaskConical style={{ width: 11, height: 11 }} />{r.ingredients.length} ingredient{r.ingredients.length > 1 ? "s" : ""}</Badge>;
    } },
    { key: "cost", header: "Food cost", num: true, render: (d) => { const r = recipeByBase.get(d.baseSlug); return r?.calculatedCost ? formatPrice(r.calculatedCost) : <span className="av3-cell-muted">—</span>; } },
    { key: "kcal", header: "kcal", num: true, render: (d) => { const r = recipeByBase.get(d.baseSlug); return r?.calculatedCalories ? <span className="mono" style={{ fontFamily: "var(--av3-mono)" }}>{r.calculatedCalories}</span> : <span className="av3-cell-muted">—</span>; } },
    { key: "fcpct", header: "Cost %", num: true, render: (d) => {
      const r = recipeByBase.get(d.baseSlug);
      if (!r?.calculatedCost || !d.avgPrice) return <span className="av3-cell-muted">—</span>;
      const pct = (r.calculatedCost / d.avgPrice) * 100;
      return <Badge tone={foodCostTone(pct)}>{pct.toFixed(0)}%</Badge>;
    } },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Recipes</h1>
          <div className="av3-pagehead-sub">Chain-wide formulas + ingredient catalog · one recipe per dish, shared everywhere (rule #10)</div>
        </div>
        <div className="av3-pagehead-actions">
          {tab === "recipes" && <Badge tone="neutral">{counts.withRecipe}/{counts.all} costed</Badge>}
          {tab === "ingredients" && <Button variant="secondary" size="sm" onClick={() => setEditIng("new")}><Plus className="av3-btn-ico" /> Add ingredient</Button>}
          <Button variant="ghost" size="sm" onClick={() => { setRefreshing(true); fetchAll(); }}>
            <RefreshCw className="av3-btn-ico" style={refreshing ? { animation: "av3-spin .7s linear infinite" } : undefined} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="av3-filterchips">
        <button type="button" className={`av3-fchip ${tab === "recipes" ? "is-active" : ""}`} onClick={() => setTab("recipes")}>Recipes<span className="av3-fchip-count">{dishes.length}</span></button>
        <button type="button" className={`av3-fchip ${tab === "ingredients" ? "is-active" : ""}`} onClick={() => setTab("ingredients")}>Ingredients<span className="av3-fchip-count">{ingredients.length}</span></button>
      </div>

      {tab === "recipes" ? (
        <>
          <div className="av3-kpi-rail">
            <Kpi label="Costed" icon={FlaskConical} value={`${kpis.costed}/${kpis.total}`} accentVar="--av3-c3" />
            <Kpi label="Avg food cost" icon={Percent} value={kpis.avgFc ? `${kpis.avgFc.toFixed(0)}%` : "—"} accentVar="--av3-c4" />
            <Kpi label="Over target" icon={AlertTriangle} value={`${kpis.overTarget}`} accentVar="--av3-c1" />
            <Kpi label="Uncosted" icon={AlertTriangle} value={`${kpis.uncosted}`} accentVar="--av3-c5" />
            <Kpi label="Ingredients" icon={Boxes} value={ingredients.length.toLocaleString("pl-PL")} accentVar="--av3-c2" />
          </div>

          <div className="av3-toolbar">
            <input className="av3-input" style={{ fontFamily: "var(--av3-ui)", width: 240, height: 32 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dishes…" />
            <span className="av3-toolbar-spacer" />
            <span className="av3-cell-muted" style={{ fontSize: 12 }}>{rows.length} shown</span>
            <div className="av3-viewtoggle">
              <button type="button" className={view === "board" ? "is-active" : ""} onClick={() => setView("board")} aria-label="Board view" title="Board view"><LayoutGrid /></button>
              <button type="button" className={view === "table" ? "is-active" : ""} onClick={() => setView("table")} aria-label="Table view" title="Table view"><Rows3 /></button>
            </div>
          </div>

          <div className="av3-filterchips">
            <button type="button" className={`av3-fchip ${cat === "all" ? "is-active" : ""}`} onClick={() => setCat("all")}>All<span className="av3-fchip-count">{counts.all ?? 0}</span></button>
            {CATEGORY_ORDER.filter((c) => counts[c]).map((c) => (
              <button key={c} type="button" className={`av3-fchip ${cat === c ? "is-active" : ""}`} onClick={() => setCat(c)}>{CATEGORY_LABEL[c]}<span className="av3-fchip-count">{counts[c]}</span></button>
            ))}
          </div>
          {loading && dishes.length === 0 ? (
            <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={6} /></div>
          ) : rows.length === 0 ? (
            <div className="av3-card" style={{ padding: 0 }}>
              <div className="av3-empty"><div className="av3-empty-title">No dishes</div><div className="av3-empty-text">{q ? "No dish matches that search." : "Nothing in this category."}</div></div>
            </div>
          ) : view === "table" ? (
            <div className="av3-card" style={{ padding: 0 }}>
              <Table columns={cols} rows={rows} rowKey={(d) => d.baseSlug} onRowClick={(d) => setEditSlug(d.baseSlug)} />
            </div>
          ) : (
            <RecipeBoard rows={rows} recipeByBase={recipeByBase} onOpen={(d) => setEditSlug(d.baseSlug)} />
          )}
        </>
      ) : (
        <IngredientsPanel ingredients={ingredients} suppliers={suppliers} loading={loading} onEdit={(ing) => setEditIng(ing)} />
      )}

      {editing && (
        <RecipeEditDialog dish={editing} recipe={recipeByBase.get(editing.baseSlug)} ingredients={ingredients} onClose={() => setEditSlug(null)} onSaved={fetchAll} />
      )}
      {editIng && (
        <IngredientDialog ingredient={editIng === "new" ? null : editIng} suppliers={suppliers} onClose={() => setEditIng(null)} onSaved={fetchAll} />
      )}
    </>
  );
}

/* ── board (card) view ─────────────────────────────────────────────────── */
function fcBarColor(pct: number): string {
  if (pct <= 30) return "var(--av3-ok)";
  if (pct <= 38) return "var(--av3-warn)";
  return "var(--av3-bad)";
}
function RecipeBoard({ rows, recipeByBase, onOpen }: {
  rows: Dish[]; recipeByBase: Map<string, RecipeData>; onOpen: (d: Dish) => void;
}) {
  const sections = useMemo(() => {
    const map = new Map<MenuCategory, Dish[]>();
    for (const d of rows) { const arr = map.get(d.category) ?? []; arr.push(d); map.set(d.category, arr); }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({ category: c, items: map.get(c)! }));
  }, [rows]);

  return (
    <div>
      {sections.map((s) => (
        <div key={s.category}>
          <div className="av3-board-section">{CATEGORY_LABEL[s.category]}<span className="c">{s.items.length}</span></div>
          <div className="av3-board">
            {s.items.map((d) => <RecipeCard key={d.baseSlug} d={d} recipe={recipeByBase.get(d.baseSlug)} onOpen={onOpen} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function RecipeCard({ d, recipe, onOpen }: { d: Dish; recipe?: RecipeData; onOpen: (d: Dish) => void }) {
  const costed = Boolean(recipe?.calculatedCost);
  const pct = costed && d.avgPrice ? (recipe!.calculatedCost! / d.avgPrice) * 100 : 0;
  const ingN = recipe?.ingredients?.length ?? 0;
  return (
    <div className="av3-dcard" data-dim={!costed} onClick={() => onOpen(d)} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(d); }}>
      <div className="av3-dcard-name">{d.name}</div>
      <div className="av3-dcard-badges">
        {costed ? <Badge tone="info"><FlaskConical style={{ width: 11, height: 11 }} />{ingN} ingredient{ingN > 1 ? "s" : ""}</Badge> : <Badge tone="neutral">No recipe</Badge>}
        {costed && recipe!.calculatedCalories ? <Badge tone="neutral">{recipe!.calculatedCalories} kcal</Badge> : null}
        {recipe?.prepTimeMinutes ? <Badge tone="neutral">{recipe.prepTimeMinutes} min</Badge> : null}
      </div>
      {costed ? (
        <>
          <div className="av3-fcbar"><i style={{ width: `${Math.min(100, pct)}%`, background: fcBarColor(pct) }} /></div>
          <div className="av3-dcard-foot">
            <div>
              <div className="av3-dcard-price">{formatPrice(recipe!.calculatedCost!)}</div>
              <div className="av3-dcard-sub">food cost / portion</div>
            </div>
            <Badge tone={foodCostTone(pct)}>{pct.toFixed(0)}%</Badge>
          </div>
        </>
      ) : (
        <div className="av3-dcard-foot">
          <span className="av3-dcard-sub">Avg price {formatPrice(d.avgPrice)}</span>
          <span className="av3-dcard-cta">+ Cost this dish</span>
        </div>
      )}
    </div>
  );
}

/* ── recipe editor ─────────────────────────────────────────────────────── */
interface DraftLine { ingredientId: string; quantity: string; wastePct: string }

function RecipeEditDialog({ dish, recipe, ingredients, onClose, onSaved }: {
  dish: Dish; recipe?: RecipeData; ingredients: Ingredient[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const sortedIngredients = useMemo(() => [...ingredients].sort((a, b) => a.name.localeCompare(b.name)), [ingredients]);

  // wasteFactor is a MULTIPLIER in the store (1.1 = +10%). Convert to/from a
  // human waste-% at the UI edge so the cost math matches the server exactly.
  const [lines, setLines] = useState<DraftLine[]>(
    (recipe?.ingredients ?? []).map((l) => ({ ingredientId: l.ingredientId, quantity: String(l.quantity), wastePct: String(Math.round(((l.wasteFactor ?? 1) - 1) * 100)) })),
  );
  const [yieldPortions, setYieldPortions] = useState(String(recipe?.yieldPortions ?? 1));
  const [prepTime, setPrepTime] = useState(String(recipe?.prepTimeMinutes ?? ""));
  const [notes, setNotes] = useState(recipe?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState<"build" | "nutrition" | "notes">("build");

  const setLine = (i: number, patch: Partial<DraftLine>) => setLines((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((arr) => [...arr, { ingredientId: sortedIngredients[0]?.id ?? "", quantity: "", wastePct: "0" }]);
  const removeLine = (i: number) => setLines((arr) => arr.filter((_, idx) => idx !== i));

  const wasteFactorOf = (l: DraftLine) => 1 + (Number(l.wastePct) || 0) / 100;
  const lineCost = (l: DraftLine): number => {
    const ing = ingById.get(l.ingredientId);
    if (!ing) return 0;
    return (Number(l.quantity) || 0) * (ing.costPerUnit ?? 0) * wasteFactorOf(l);
  };
  const yieldN = Math.max(1, Number(yieldPortions) || 1);
  const batchCost = lines.reduce((s, l) => s + lineCost(l), 0);
  const estCost = batchCost / yieldN;
  const fcPct = dish.avgPrice > 0 ? (estCost / dish.avgPrice) * 100 : 0;

  // Live per-portion macros (trim covered by waste doesn't reach the plate → no
  // wasteFactor on macros, matching the menu route).
  const macro = (key: keyof Ingredient): number => {
    let total = 0;
    for (const l of lines) { const ing = ingById.get(l.ingredientId); const v = ing?.[key]; if (typeof v === "number") total += v * (Number(l.quantity) || 0); }
    return Math.round(total / yieldN);
  };
  const missingKcal = lines.filter((l) => l.ingredientId && Number(l.quantity) > 0 && typeof ingById.get(l.ingredientId)?.kcalPerUnit !== "number");

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menuItemId: dish.primaryId, // store derives the base slug → chain-wide
          ingredients: lines
            .filter((l) => l.ingredientId && Number(l.quantity) > 0)
            .map((l) => ({ ingredientId: l.ingredientId, quantity: Number(l.quantity), wasteFactor: wasteFactorOf(l) })),
          yieldPortions: yieldN,
          prepTimeMinutes: prepTime ? Number(prepTime) : undefined,
          notes,
        }),
      });
      if (res.ok) { await onSaved(); onClose(); }
    } finally { setSaving(false); }
  };
  const deleteRecipe = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/recipes?menuItemId=${encodeURIComponent(dish.primaryId)}`, { method: "DELETE" });
      if (res.ok) { await onSaved(); onClose(); }
    } finally { setDeleting(false); }
  };

  return (
    <Dialog
      open onClose={onClose} title={dish.name}
      subtitle={`Chain-wide recipe · applies to all ${dish.siteCount} site${dish.siteCount > 1 ? "s" : ""}`}
      headerExtra={<Badge tone="brand"><FlaskConical style={{ width: 11, height: 11 }} /> formula</Badge>}
      width={620}
      footer={
        <>
          {recipe && (recipe.ingredients?.length ?? 0) > 0 && <Button variant="danger" size="sm" loading={deleting} onClick={deleteRecipe} style={{ marginRight: "auto" }}>Delete recipe</Button>}
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={saving} onClick={save}>Save recipe</Button>
        </>
      }
    >
      {/* sticky per-portion recap — always visible while editing */}
      <div className="av3-recap">
        <div className="av3-recap-cell"><div className="av3-recap-k">Cost / portion</div><div className="av3-recap-v">{formatPrice(Math.round(estCost))}</div></div>
        <div className="av3-recap-cell"><div className="av3-recap-k">Food cost %</div><div className="av3-recap-v" style={{ color: `var(--av3-${foodCostTone(fcPct) === "ok" ? "ok" : foodCostTone(fcPct) === "warn" ? "warn" : foodCostTone(fcPct) === "bad" ? "bad" : "fg"})` }}>{fcPct > 0 ? `${fcPct.toFixed(0)}%` : "—"}</div></div>
        <div className="av3-recap-cell"><div className="av3-recap-k">Batch cost</div><div className="av3-recap-v">{formatPrice(Math.round(batchCost))}</div></div>
        <div className="av3-recap-cell"><div className="av3-recap-k">kcal / portion</div><div className="av3-recap-v">{macro("kcalPerUnit") || "—"}</div></div>
      </div>

      <div className="av3-dtabs">
        <button type="button" className={`av3-dtab ${tab === "build" ? "is-active" : ""}`} onClick={() => setTab("build")}>Ingredients{lines.length > 0 && <span className="av3-dtab-count">{lines.length}</span>}</button>
        <button type="button" className={`av3-dtab ${tab === "nutrition" ? "is-active" : ""}`} data-flag={missingKcal.length > 0} onClick={() => setTab("nutrition")}>Nutrition</button>
        <button type="button" className={`av3-dtab ${tab === "notes" ? "is-active" : ""}`} data-flag={notes.trim().length > 0} onClick={() => setTab("notes")}>Notes</button>
      </div>

      {tab === "build" && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <label className="av3-field" style={{ width: 120 }}><span className="av3-field-label">Yield (portions)</span><input className="av3-input" type="number" min={1} value={yieldPortions} onChange={(e) => setYieldPortions(e.target.value)} /></label>
            <label className="av3-field" style={{ width: 120 }}><span className="av3-field-label">Prep</span><span className="av3-affix" data-suffix="min"><input className="av3-input" type="number" min={0} value={prepTime} onChange={(e) => setPrepTime(e.target.value)} placeholder="—" /></span></label>
          </div>

          {ingredients.length === 0 && <div className="av3-edhint" data-tone="warn" style={{ marginBottom: 8 }}>No ingredients in the catalog yet — add some on the Ingredients tab first.</div>}
          {lines.length === 0 ? (
            <div className="av3-empty-text" style={{ padding: "8px 0", color: "var(--av3-subtle)" }}>No ingredients yet — add the first line.</div>
          ) : (
            <>
              <div className="av3-reciperow-head"><span>Ingredient</span><span>Qty</span><span>Waste%</span><span style={{ textAlign: "right" }}>Cost</span><span /></div>
              {lines.map((l, i) => {
                const ing = ingById.get(l.ingredientId);
                const noKcal = ing && typeof ing.kcalPerUnit !== "number";
                const noOffering = ing && !ing.activeProductId;
                return (
                  <div className="av3-reciperow" key={i}>
                    <div style={{ minWidth: 0 }}>
                      <select className="av3-select" value={l.ingredientId} onChange={(e) => setLine(i, { ingredientId: e.target.value })}>
                        {sortedIngredients.map((ig) => <option key={ig.id} value={ig.id}>{ig.name}</option>)}
                      </select>
                      {(noKcal || noOffering) && <div style={{ fontSize: 10, color: "var(--av3-warn)", marginTop: 2 }}>{noOffering ? "no distributor linked" : "missing kcal"}</div>}
                    </div>
                    <span className="av3-affix" data-suffix={ing?.unit ?? ""}><input className="av3-input" type="number" step="0.001" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} placeholder={ing?.unit ?? ""} /></span>
                    <span className="av3-affix" data-suffix="%"><input className="av3-input" type="number" value={l.wastePct} onChange={(e) => setLine(i, { wastePct: e.target.value })} /></span>
                    <span className="av3-reciperow-cost">{formatPrice(Math.round(lineCost(l)))}</span>
                    <button type="button" className="av3-iconbtn-sm" aria-label="Remove" onClick={() => removeLine(i)}><X /></button>
                  </div>
                );
              })}
            </>
          )}
          <div style={{ marginTop: 10 }}>
            <Button variant="secondary" size="sm" onClick={addLine} disabled={sortedIngredients.length === 0}><Plus className="av3-btn-ico" /> Add ingredient</Button>
          </div>

          {batchCost > 0 && (
            <>
              <div className="av3-subhead">Cost breakdown</div>
              <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", marginBottom: 6 }}>
                {lines.map((l, i) => { const c = lineCost(l); if (c <= 0) return null; return <div key={i} title={`${ingById.get(l.ingredientId)?.name ?? ""}: ${formatPrice(Math.round(c))}`} style={{ width: `${(c / batchCost) * 100}%`, background: `var(${COST_COLORS[i % COST_COLORS.length]})` }} />; })}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 10.5, color: "var(--av3-muted)" }}>
                {lines.filter((l) => lineCost(l) > 0).slice(0, 6).map((l) => { const idx = lines.indexOf(l); return <span key={idx} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: `var(${COST_COLORS[idx % COST_COLORS.length]})` }} />{ingById.get(l.ingredientId)?.name} {Math.round((lineCost(l) / batchCost) * 100)}%</span>; })}
              </div>
            </>
          )}
        </>
      )}

      {tab === "nutrition" && (
        <>
          {missingKcal.length > 0 && <div className="av3-edhint" data-tone="warn" style={{ marginBottom: 10 }}>{missingKcal.length} ingredient{missingKcal.length > 1 ? "s" : ""} missing kcal — totals understated until set on the offering.</div>}
          <div className="av3-od-grid">
            <div className="av3-od-field"><div className="k">kcal / portion</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{macro("kcalPerUnit") || "—"}</div></div>
            {([["Protein", "proteinPerUnit"], ["Carbs", "carbsPerUnit"], ["Sugar", "sugarPerUnit"], ["Fiber", "fiberPerUnit"], ["Fat", "fatPerUnit"]] as [string, keyof Ingredient][]).map(([label, key]) => (
              <div className="av3-od-field" key={key}><div className="k">{label}</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{macro(key)} g</div></div>
            ))}
          </div>
        </>
      )}

      {tab === "notes" && (
        <textarea className="av3-input" style={{ fontFamily: "var(--av3-ui)", minHeight: 120, resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Method, plating, station notes for the KDS…" />
      )}
    </Dialog>
  );
}

/* ── ingredients catalog panel ─────────────────────────────────────────── */
function IngredientsPanel({ ingredients, suppliers, loading, onEdit }: {
  ingredients: Ingredient[]; suppliers: Supplier[]; loading: boolean; onEdit: (ing: Ingredient) => void;
}) {
  const [q, setQ] = useState("");
  const supplierName = (ing: Ingredient) => ing.supplier ?? (ing.activeProductId ? "—" : "not linked");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...ingredients]
      .filter((i) => !needle || i.name.toLowerCase().includes(needle) || (i.supplier ?? "").toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [ingredients, q]);

  const cols: ColumnV3<Ingredient>[] = [
    { key: "name", header: "Ingredient", render: (i) => <div><div style={{ fontWeight: 600 }}>{i.name}</div>{i.notes && <div className="av3-cell-muted" style={{ fontSize: 11, maxWidth: 320, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.notes}</div>}</div> },
    { key: "cat", header: "Category", render: (i) => <span className="av3-cell-muted">{i.category ? INGREDIENT_CATEGORY_LABELS[i.category] : "—"}</span> },
    { key: "supplier", header: "Active supplier", render: (i) => i.activeProductId ? <Badge tone="ok" dot>{supplierName(i)}</Badge> : <Badge tone="warn">not linked</Badge> },
    { key: "cost", header: "Cost / unit", num: true, render: (i) => i.costPerUnit != null ? <span className="mono" style={{ fontFamily: "var(--av3-mono)" }}>{formatPrice(i.costPerUnit)}/{i.unit}</span> : <span className="av3-cell-muted">—</span> },
    { key: "kcal", header: "kcal / unit", num: true, render: (i) => i.kcalPerUnit != null ? <span className="mono" style={{ fontFamily: "var(--av3-mono)" }}>{i.kcalPerUnit}</span> : <span className="av3-cell-muted">—</span> },
  ];

  if (loading && ingredients.length === 0) return <SkeletonPage />;
  return (
    <>
      <div className="av3-field" style={{ maxWidth: 280 }}><span className="av3-field-label">Search</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ingredient or supplier…" /></div>
      <div className="av3-card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <div className="av3-empty"><div className="av3-empty-title">No ingredients</div><div className="av3-empty-text">{ingredients.length === 0 ? "Add the first ingredient to start costing recipes." : "Nothing matches your search."}</div></div>
        ) : (
          <Table columns={cols} rows={filtered} rowKey={(i) => i.id} onRowClick={onEdit} />
        )}
      </div>
      {suppliers.length === 0 && <div className="av3-cell-muted" style={{ fontSize: 11.5 }}>Tip: add suppliers on the Suppliers page so offerings can be linked to a distributor.</div>}
    </>
  );
}

/* ── ingredient editor (identity + distributor offerings) ──────────────── */
function IngredientDialog({ ingredient, suppliers, onClose, onSaved }: {
  ingredient: Ingredient | null; suppliers: Supplier[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const isNew = ingredient === null;
  const [name, setName] = useState(ingredient?.name ?? "");
  const [category, setCategory] = useState<IngredientCategory>(ingredient?.category ?? "other");
  const [unit, setUnit] = useState<IngredientUnit>(ingredient?.unit ?? "kg");
  const [notes, setNotes] = useState(ingredient?.notes ?? "");
  const [activeProductId, setActiveProductId] = useState(ingredient?.activeProductId);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [editingOffer, setEditingOffer] = useState<Offering | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const supplierName = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);

  const loadOfferings = useCallback(async (ingId: string) => {
    const list = await fetch(`/api/admin/ingredient-products?ingredientId=${encodeURIComponent(ingId)}`).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    setOfferings(Array.isArray(list) ? list : []);
  }, []);
  useEffect(() => { if (ingredient) loadOfferings(ingredient.id); }, [ingredient, loadOfferings]);

  const saveIdentity = async () => {
    if (!name.trim()) { setErr("Name is required"); return; }
    setSaving(true);
    setErr(null);
    try {
      const body = { id: ingredient?.id, name: name.trim(), category, unit, notes: notes.trim() || undefined, activeProductId };
      const res = await fetch("/api/admin/ingredients", { method: isNew ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { await onSaved(); onClose(); }
      else setErr("Save failed");
    } finally { setSaving(false); }
  };
  const deleteIngredient = async () => {
    if (!ingredient || !window.confirm("Delete this ingredient and its offerings?")) return;
    setBusy(true);
    try { const r = await fetch(`/api/admin/ingredients?id=${encodeURIComponent(ingredient.id)}`, { method: "DELETE" }); if (r.ok) { await onSaved(); onClose(); } }
    finally { setBusy(false); }
  };
  const makeActive = async (productId: string) => {
    if (!ingredient) return;
    setBusy(true);
    try {
      await fetch("/api/admin/ingredient-products", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ingredientId: ingredient.id, productId }) });
      setActiveProductId(productId);
      await loadOfferings(ingredient.id);
    } finally { setBusy(false); }
  };
  const deleteOffering = async (id: string) => {
    if (!ingredient || !window.confirm("Delete this offering?")) return;
    setBusy(true);
    try { await fetch(`/api/admin/ingredient-products?id=${encodeURIComponent(id)}`, { method: "DELETE" }); await loadOfferings(ingredient.id); }
    finally { setBusy(false); }
  };

  return (
    <Dialog
      open onClose={onClose} title={isNew ? "Add ingredient" : ingredient!.name}
      subtitle="Chain-wide · cost + nutrition come from the active distributor offering"
      width={560}
      footer={
        <>
          {!isNew && <Button variant="danger" size="sm" loading={busy} onClick={deleteIngredient} style={{ marginRight: "auto" }}><Trash2 className="av3-btn-ico" /> Delete</Button>}
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={saving} onClick={saveIdentity}>Save</Button>
        </>
      }
    >
      {err && <div style={{ color: "var(--av3-bad)", fontSize: 12, marginBottom: 8 }}>{err}</div>}
      <div className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Name</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label className="av3-field" style={{ width: 170 }}><span className="av3-field-label">Category</span><select className="av3-select" value={category} onChange={(e) => setCategory(e.target.value as IngredientCategory)}>{ING_CATEGORIES.map((c) => <option key={c} value={c}>{INGREDIENT_CATEGORY_LABELS[c]}</option>)}</select></label>
        <label className="av3-field" style={{ width: 110 }}><span className="av3-field-label">Unit</span><select className="av3-select" value={unit} onChange={(e) => setUnit(e.target.value as IngredientUnit)}>{ING_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></label>
      </div>
      <div className="av3-field" style={{ marginTop: 10 }}><span className="av3-field-label">Notes</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

      {!isNew && (
        <>
          <div className="av3-subhead" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Distributor offerings</span>
            <Button variant="secondary" size="sm" onClick={() => setEditingOffer("new")}><Plus className="av3-btn-ico" /> Add</Button>
          </div>
          {offerings.length === 0 ? (
            <div className="av3-cell-muted" style={{ fontSize: 11.5 }}>No offerings yet. Add one to set cost + nutrition (it becomes the active source automatically).</div>
          ) : (
            offerings.map((o) => {
              const isActive = o.id === activeProductId;
              return (
                <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--av3-line)" }}>
                  <button type="button" className="av3-iconbtn-sm" title={isActive ? "Active source" : "Make active"} onClick={() => makeActive(o.id)} style={{ color: isActive ? "var(--av3-platinum)" : "var(--av3-subtle)" }}><Star style={{ fill: isActive ? "var(--av3-platinum)" : "none" }} /></button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 12.5 }}>{o.displayName || supplierName.get(o.supplierId) || "Offering"}{isActive && <Badge tone="ok">active</Badge>}</div>
                    <div className="av3-cell-muted" style={{ fontSize: 11 }}>{supplierName.get(o.supplierId) ?? o.supplierId}{o.supplierSku ? ` · ${o.supplierSku}` : ""} · {formatPrice(o.costPerUnit)}/{unit}{o.kcalPerUnit != null ? ` · ${o.kcalPerUnit} kcal` : ""}</div>
                  </div>
                  <button type="button" className="av3-btn av3-btn-sm av3-btn-ghost" onClick={() => setEditingOffer(o)}>Edit</button>
                  <button type="button" className="av3-iconbtn-sm" aria-label="Delete offering" onClick={() => deleteOffering(o.id)}><X /></button>
                </div>
              );
            })
          )}
        </>
      )}

      {editingOffer && ingredient && (
        <OfferingDialog ingredientId={ingredient.id} unit={unit} suppliers={suppliers} offering={editingOffer === "new" ? null : editingOffer} hasActive={Boolean(activeProductId)}
          onClose={() => setEditingOffer(null)} onSaved={async () => { setEditingOffer(null); await loadOfferings(ingredient.id); await onSaved(); }} />
      )}
    </Dialog>
  );
}

/* ── distributor offering editor ───────────────────────────────────────── */
function OfferingDialog({ ingredientId, unit, suppliers, offering, hasActive, onClose, onSaved }: {
  ingredientId: string; unit: IngredientUnit; suppliers: Supplier[]; offering: Offering | null; hasActive: boolean; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const isNew = offering === null;
  const [supplierId, setSupplierId] = useState(offering?.supplierId ?? suppliers[0]?.id ?? "");
  const [displayName, setDisplayName] = useState(offering?.displayName ?? "");
  const [supplierSku, setSupplierSku] = useState(offering?.supplierSku ?? "");
  const [cost, setCost] = useState(String((offering?.costPerUnit ?? 0) / 100));
  const [macros, setMacros] = useState({
    kcalPerUnit: offering?.kcalPerUnit ?? "", proteinPerUnit: offering?.proteinPerUnit ?? "", carbsPerUnit: offering?.carbsPerUnit ?? "",
    sugarPerUnit: offering?.sugarPerUnit ?? "", fiberPerUnit: offering?.fiberPerUnit ?? "", fatPerUnit: offering?.fatPerUnit ?? "",
  });
  const [makeActive, setMakeActive] = useState(isNew && !hasActive);
  const [notes, setNotes] = useState(offering?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setMacro = (k: keyof typeof macros, v: string) => setMacros((m) => ({ ...m, [k]: v }));
  const save = async () => {
    if (!supplierId) { setErr("Pick a supplier (add one on the Suppliers page first)"); return; }
    setSaving(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        ...(offering ? { id: offering.id } : {}),
        ingredientId, supplierId,
        displayName: displayName.trim() || undefined,
        supplierSku: supplierSku.trim() || undefined,
        costPerUnit: Math.round((Number(cost) || 0) * 100),
        notes: notes.trim() || undefined,
        makeActive,
      };
      for (const [k, v] of Object.entries(macros)) body[k] = v === "" ? undefined : Number(v);
      const res = await fetch("/api/admin/ingredient-products", { method: isNew ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { await onSaved(); }
      else setErr("Save failed");
    } finally { setSaving(false); }
  };

  const MACRO_LABELS: [keyof typeof macros, string][] = [["kcalPerUnit", `kcal / ${unit}`], ["proteinPerUnit", "Protein"], ["carbsPerUnit", "Carbs"], ["sugarPerUnit", "Sugar"], ["fiberPerUnit", "Fiber"], ["fatPerUnit", "Fat"]];

  return (
    <Dialog open onClose={onClose} title={isNew ? "Add offering" : "Edit offering"} subtitle={`Cost + nutrition per ${unit}`} width={480}
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" loading={saving} onClick={save}>Save offering</Button></>}>
      {err && <div style={{ color: "var(--av3-bad)", fontSize: 12, marginBottom: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label className="av3-field" style={{ flex: 1, minWidth: 170 }}><span className="av3-field-label">Supplier</span>
          <select className="av3-select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {suppliers.length === 0 && <option value="">— no suppliers —</option>}
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="av3-field" style={{ width: 120 }}><span className="av3-field-label">Cost / {unit} (zł)</span><input className="av3-input" type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></label>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        <label className="av3-field" style={{ flex: 1, minWidth: 150 }}><span className="av3-field-label">Display name</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Bufala 1kg pack" /></label>
        <label className="av3-field" style={{ width: 150 }}><span className="av3-field-label">Supplier SKU</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={supplierSku} onChange={(e) => setSupplierSku(e.target.value)} /></label>
      </div>

      <div className="av3-subhead">Nutrition (per {unit}, optional)</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {MACRO_LABELS.map(([k, label]) => (
          <label className="av3-field" style={{ width: 92 }} key={k}><span className="av3-field-label">{label}</span><input className="av3-input" type="number" min={0} value={macros[k]} onChange={(e) => setMacro(k, e.target.value)} placeholder="—" /></label>
        ))}
      </div>

      <div className="av3-field" style={{ marginTop: 10 }}><span className="av3-field-label">Notes</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12.5, cursor: "pointer" }}>
        <input type="checkbox" checked={makeActive} onChange={(e) => setMakeActive(e.target.checked)} /> Make this the active cost + nutrition source
      </label>
    </Dialog>
  );
}
