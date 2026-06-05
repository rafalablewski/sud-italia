"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FlaskConical, Plus, RefreshCw, X } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { formatPrice, getBaseSlug } from "@/lib/utils";
import type { MenuCategory } from "@/data/types";
import { Badge, Button, Dialog, Table, type BadgeTone, type ColumnV3 } from "./ui";

interface MenuItemData { id: string; name: string; price: number; category: MenuCategory }
interface Ingredient { id: string; name: string; unit: string; category?: string; costPerUnit: number }
interface RecipeLine { ingredientId: string; quantity: number; wasteFactor?: number; name?: string; unit?: string; unitCost?: number; lineCost?: number }
interface RecipeData { menuItemId: string; ingredients: RecipeLine[]; enrichedIngredients?: RecipeLine[]; yieldPortions?: number; calculatedCost?: number }

interface Dish {
  baseSlug: string;
  name: string;
  category: MenuCategory;
  primaryId: string;
  avgPrice: number;
  siteCount: number;
}

const CATEGORY_ORDER: MenuCategory[] = ["pizza", "pasta", "antipasti", "panini", "drinks", "desserts"];
const CATEGORY_LABEL: Record<MenuCategory, string> = { pizza: "Pizza", pasta: "Pasta", antipasti: "Antipasti", panini: "Panini", drinks: "Drinks", desserts: "Desserts" };

function foodCostTone(pct: number): BadgeTone {
  if (pct <= 0) return "neutral";
  if (pct <= 30) return "ok";
  if (pct <= 38) return "warn";
  return "bad";
}

export function RecipesV3() {
  const allLocations = useMemo(() => getActiveLocations(), []);
  const [byLoc, setByLoc] = useState<Record<string, MenuItemData[]>>({});
  const [recipes, setRecipes] = useState<RecipeData[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cat, setCat] = useState<"all" | MenuCategory>("all");
  const [editSlug, setEditSlug] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [menus, r, i] = await Promise.all([
        Promise.all(allLocations.map((l) => fetch(`/api/admin/menu?location=${l.slug}`).then((res) => (res.ok ? res.json() : [])).catch(() => []))),
        fetch(`/api/admin/recipes`).then((res) => (res.ok ? res.json() : [])).catch(() => []),
        fetch(`/api/admin/ingredients`).then((res) => (res.ok ? res.json() : [])).catch(() => []),
      ]);
      const map: Record<string, MenuItemData[]> = {};
      allLocations.forEach((l, idx) => { map[l.slug] = Array.isArray(menus[idx]) ? menus[idx] : []; });
      setByLoc(map);
      setRecipes(Array.isArray(r) ? r : []);
      setIngredients(Array.isArray(i) ? i : []);
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

  const rows = useMemo(() => (cat === "all" ? dishes : dishes.filter((d) => d.category === cat)), [dishes, cat]);
  const editing = editSlug ? dishes.find((d) => d.baseSlug === editSlug) ?? null : null;

  const cols: ColumnV3<Dish>[] = [
    { key: "name", header: "Dish", render: (d) => <span style={{ fontWeight: 600 }}>{d.name}</span> },
    { key: "cat", header: "Category", render: (d) => <span className="av3-cell-muted">{CATEGORY_LABEL[d.category]}</span> },
    { key: "ings", header: "Recipe", render: (d) => {
      const r = recipeByBase.get(d.baseSlug);
      if (!r || (r.ingredients?.length ?? 0) === 0) return <Badge tone="neutral">No recipe</Badge>;
      return <Badge tone="info"><FlaskConical style={{ width: 11, height: 11 }} />{r.ingredients.length} ingredient{r.ingredients.length > 1 ? "s" : ""}</Badge>;
    } },
    { key: "cost", header: "Food cost", num: true, render: (d) => { const r = recipeByBase.get(d.baseSlug); return r?.calculatedCost ? formatPrice(r.calculatedCost) : <span className="av3-cell-muted">—</span>; } },
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
          <div className="av3-pagehead-sub">Chain-wide formulas · one recipe per dish, shared everywhere (rule #10)</div>
        </div>
        <div className="av3-pagehead-actions">
          <Badge tone="neutral">{counts.withRecipe}/{counts.all} costed</Badge>
          <Button variant="ghost" size="sm" onClick={() => { setRefreshing(true); fetchAll(); }}>
            <RefreshCw className="av3-btn-ico" style={refreshing ? { animation: "av3-spin .7s linear infinite" } : undefined} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="av3-filterchips">
        <button type="button" className={`av3-fchip ${cat === "all" ? "is-active" : ""}`} onClick={() => setCat("all")}>All<span className="av3-fchip-count">{counts.all ?? 0}</span></button>
        {CATEGORY_ORDER.filter((c) => counts[c]).map((c) => (
          <button key={c} type="button" className={`av3-fchip ${cat === c ? "is-active" : ""}`} onClick={() => setCat(c)}>{CATEGORY_LABEL[c]}<span className="av3-fchip-count">{counts[c]}</span></button>
        ))}
      </div>

      {loading && dishes.length === 0 ? (
        <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading recipes…</div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No dishes</div><div className="av3-empty-text">Nothing in this category.</div></div>
          ) : (
            <Table columns={cols} rows={rows} rowKey={(d) => d.baseSlug} onRowClick={(d) => setEditSlug(d.baseSlug)} />
          )}
        </div>
      )}

      {editing && (
        <RecipeEditDialog
          dish={editing}
          recipe={recipeByBase.get(editing.baseSlug)}
          ingredients={ingredients}
          onClose={() => setEditSlug(null)}
          onSaved={fetchAll}
        />
      )}
    </>
  );
}

interface DraftLine { ingredientId: string; quantity: string; wastePct: string }

function RecipeEditDialog({ dish, recipe, ingredients, onClose, onSaved }: {
  dish: Dish; recipe?: RecipeData; ingredients: Ingredient[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const sortedIngredients = useMemo(() => [...ingredients].sort((a, b) => a.name.localeCompare(b.name)), [ingredients]);

  const [lines, setLines] = useState<DraftLine[]>(
    (recipe?.ingredients ?? []).map((l) => ({ ingredientId: l.ingredientId, quantity: String(l.quantity), wastePct: String(Math.round((l.wasteFactor ?? 0) * 100)) })),
  );
  const [yieldPortions, setYieldPortions] = useState(String(recipe?.yieldPortions ?? 1));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const setLine = (i: number, patch: Partial<DraftLine>) => setLines((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((arr) => [...arr, { ingredientId: sortedIngredients[0]?.id ?? "", quantity: "", wastePct: "0" }]);
  const removeLine = (i: number) => setLines((arr) => arr.filter((_, idx) => idx !== i));

  const lineCost = (l: DraftLine): number => {
    const ing = ingById.get(l.ingredientId);
    if (!ing) return 0;
    const qty = Number(l.quantity) || 0;
    const waste = (Number(l.wastePct) || 0) / 100;
    return qty * ing.costPerUnit * (1 + waste);
  };
  const estCost = lines.reduce((s, l) => s + lineCost(l), 0);
  const fcPct = dish.avgPrice > 0 ? (estCost / dish.avgPrice) * 100 : 0;

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
            .map((l) => ({ ingredientId: l.ingredientId, quantity: Number(l.quantity), wasteFactor: (Number(l.wastePct) || 0) / 100 })),
          yieldPortions: Number(yieldPortions) || 1,
        }),
      });
      if (res.ok) { await onSaved(); onClose(); }
    } finally {
      setSaving(false);
    }
  };

  const deleteRecipe = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/recipes?menuItemId=${encodeURIComponent(dish.primaryId)}`, { method: "DELETE" });
      if (res.ok) { await onSaved(); onClose(); }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={dish.name}
      subtitle={`Chain-wide recipe · applies to all ${dish.siteCount} site${dish.siteCount > 1 ? "s" : ""}`}
      headerExtra={<Badge tone="brand"><FlaskConical style={{ width: 11, height: 11 }} /> formula</Badge>}
      width={580}
      footer={
        <>
          {recipe && (recipe.ingredients?.length ?? 0) > 0 && (
            <Button variant="danger" size="sm" loading={deleting} onClick={deleteRecipe} style={{ marginRight: "auto" }}>Delete recipe</Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={saving} onClick={save}>Save recipe</Button>
        </>
      }
    >
      <div className="av3-formrow" style={{ gridTemplateColumns: "120px 1fr", alignItems: "end", marginBottom: 6 }}>
        <label className="av3-field"><span className="av3-field-label">Yield (portions)</span><input className="av3-input" type="number" min={1} value={yieldPortions} onChange={(e) => setYieldPortions(e.target.value)} /></label>
      </div>

      <div className="av3-subhead">Ingredients</div>
      {lines.length === 0 ? (
        <div className="av3-empty-text" style={{ padding: "8px 0", color: "var(--av3-subtle)" }}>No ingredients yet — add the first line.</div>
      ) : (
        <>
          <div className="av3-reciperow-head"><span>Ingredient</span><span>Qty</span><span>Waste%</span><span style={{ textAlign: "right" }}>Cost</span><span /></div>
          {lines.map((l, i) => {
            const ing = ingById.get(l.ingredientId);
            return (
              <div className="av3-reciperow" key={i}>
                <select className="av3-select" value={l.ingredientId} onChange={(e) => setLine(i, { ingredientId: e.target.value })}>
                  {sortedIngredients.map((ig) => <option key={ig.id} value={ig.id}>{ig.name}</option>)}
                </select>
                <input className="av3-input" type="number" step="0.001" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} placeholder={ing?.unit ?? ""} />
                <input className="av3-input" type="number" value={l.wastePct} onChange={(e) => setLine(i, { wastePct: e.target.value })} />
                <span className="av3-reciperow-cost">{formatPrice(Math.round(lineCost(l)))}</span>
                <button type="button" className="av3-iconbtn-sm" aria-label="Remove" onClick={() => removeLine(i)}><X /></button>
              </div>
            );
          })}
        </>
      )}
      <div style={{ marginTop: 10 }}>
        <Button variant="secondary" size="sm" onClick={addLine}><Plus className="av3-btn-ico" /> Add ingredient</Button>
      </div>

      <div className="av3-recipe-summary">
        <div>
          <div className="av3-field-label">Estimated food cost</div>
          <div style={{ fontSize: 11, color: "var(--av3-subtle)" }}>vs avg price {formatPrice(Math.round(dish.avgPrice))} · server recomputes on save</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <span className="v">{formatPrice(Math.round(estCost))}</span>
          {dish.avgPrice > 0 && <span style={{ marginLeft: 8 }}><Badge tone={foodCostTone(fcPct)}>{fcPct.toFixed(0)}%</Badge></span>}
        </div>
      </div>
    </Dialog>
  );
}
