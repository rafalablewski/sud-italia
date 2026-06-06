"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, FlaskConical, LayoutGrid, Percent, Plus, RefreshCw, Rows3, Trash2, TrendingDown, UtensilsCrossed, X } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { formatPrice, getBaseSlug } from "@/lib/utils";
import { ALLERGEN_LABELS } from "@/data/types";
import type { Allergen, MenuCategory, MenuRole, ModifierGroup, ModifierOption } from "@/data/types";
import { Badge, type BadgeTone, Button, type ColumnV3, Dialog, Kpi, SkeletonRows, Switch, Table } from "./ui";

type MenuTag = "vegetarian" | "vegan" | "spicy" | "gluten-free";
type Halal = "halal" | "non-halal" | "uncertified";
type Nutri = "A" | "B" | "C" | "D";

/** The enriched item shape returned by GET /api/admin/menu (the subset we read). */
interface RawItem {
  id: string;
  name: string;
  description: string;
  price: number; // grosze
  cost: number; // grosze
  category: MenuCategory;
  tags: MenuTag[];
  available: boolean;
  sku?: string;
  menuRole?: MenuRole;
  deliveryOnly?: boolean;
  packagingCost?: number;
  modifierGroups?: ModifierGroup[];
  allergens?: Allergen[];
  halalStatus?: Halal;
  nutriGrade?: Nutri;
  containsPork?: boolean;
  containsAlcohol?: boolean;
  _hasRecipe?: boolean;
  _hasOverride?: boolean;
  _isCustom?: boolean;
  _hidden?: boolean;
}
interface Variant { slug: string; city: string; item: RawItem }
interface Unified {
  baseSlug: string;
  primary: RawItem;
  category: MenuCategory;
  variants: Variant[];
  prices: number[];
  margins: number[];
  availableCount: number;
  anyHidden: boolean;
  allHidden: boolean;
  anyOverride: boolean;
  anyRecipe: boolean;
  isCustom: boolean;
}

const CATEGORY_ORDER: MenuCategory[] = ["pizza", "pasta", "antipasti", "panini", "drinks", "desserts"];
const CATEGORY_LABEL: Record<MenuCategory, string> = {
  pizza: "Pizza", pasta: "Pasta", antipasti: "Antipasti", panini: "Panini", drinks: "Drinks", desserts: "Desserts",
};
const MENU_TAGS: { key: MenuTag; label: string }[] = [
  { key: "vegetarian", label: "Vegetarian" }, { key: "vegan", label: "Vegan" }, { key: "spicy", label: "Spicy" }, { key: "gluten-free", label: "Gluten-free" },
];
const MENU_ROLES: { key: MenuRole; label: string }[] = [
  { key: "hero", label: "Hero" }, { key: "profit-driver", label: "Profit driver" }, { key: "anchor", label: "Anchor" }, { key: "lto", label: "LTO" },
];
const ALLERGENS = Object.keys(ALLERGEN_LABELS) as Allergen[];
const HALAL_OPTIONS: Halal[] = ["halal", "non-halal", "uncertified"];
const NUTRI_OPTIONS: Nutri[] = ["A", "B", "C", "D"];

function marginPct(price: number, cost: number): number {
  return price > 0 ? ((price - cost) / price) * 100 : 0;
}
function marginTone(m: number): BadgeTone {
  if (m >= 65) return "ok";
  if (m >= 50) return "warn";
  return "bad";
}
function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function MenuV3() {
  const allLocations = useMemo(() => getActiveLocations(), []);
  const [byLoc, setByLoc] = useState<Record<string, RawItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cat, setCat] = useState<"all" | MenuCategory>("all");
  const [showHidden, setShowHidden] = useState(false);
  const [view, setView] = useState<"board" | "table">("board");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editSlug, setEditSlug] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [bulkEditing, setBulkEditing] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const entries = await Promise.all(
        allLocations.map(async (l) => {
          const items = await fetch(`/api/admin/menu?location=${l.slug}`).then((r) => (r.ok ? r.json() : []));
          return [l.slug, Array.isArray(items) ? (items as RawItem[]) : []] as const;
        }),
      );
      setByLoc(Object.fromEntries(entries));
    } catch (e) {
      console.error("Menu refresh failed:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [allLocations]);

  useEffect(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  // unify by base slug — one row per dish, chain-wide (rule #10)
  const unified = useMemo(() => {
    const groups = new Map<string, Variant[]>();
    for (const l of allLocations) {
      for (const item of byLoc[l.slug] ?? []) {
        const base = getBaseSlug(item.id);
        const arr = groups.get(base) ?? [];
        arr.push({ slug: l.slug, city: l.city, item });
        groups.set(base, arr);
      }
    }
    const out: Unified[] = [];
    for (const [baseSlug, variants] of groups) {
      const primary = variants[0].item;
      out.push({
        baseSlug,
        primary,
        category: primary.category,
        variants,
        prices: variants.map((v) => v.item.price),
        margins: variants.map((v) => marginPct(v.item.price, v.item.cost)),
        availableCount: variants.filter((v) => v.item.available && !v.item._hidden).length,
        anyHidden: variants.some((v) => v.item._hidden),
        allHidden: variants.every((v) => v.item._hidden),
        anyOverride: variants.some((v) => v.item._hasOverride),
        anyRecipe: variants.some((v) => v.item._hasRecipe),
        isCustom: variants.every((v) => v.item._isCustom),
      });
    }
    return out.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.primary.name.localeCompare(b.primary.name));
  }, [byLoc, allLocations]);

  const visible = useMemo(() => unified.filter((u) => showHidden || !u.allHidden), [unified, showHidden]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: visible.length };
    for (const u of visible) c[u.category] = (c[u.category] ?? 0) + 1;
    return c;
  }, [visible]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return visible.filter(
      (u) =>
        (cat === "all" || u.category === cat) &&
        (!needle || u.primary.name.toLowerCase().includes(needle) || (u.primary.description || "").toLowerCase().includes(needle)),
    );
  }, [visible, cat, q]);

  // KPI rail — chain-wide menu health (over all visible dishes, not the filter)
  const kpis = useMemo(() => {
    const dishMargins = visible.map((u) => u.margins.reduce((s, m) => s + m, 0) / (u.margins.length || 1));
    const avgMargin = dishMargins.length ? dishMargins.reduce((s, m) => s + m, 0) / dishMargins.length : 0;
    return {
      dishes: visible.length,
      avgMargin,
      off: visible.filter((u) => u.availableCount === 0).length,
      lowMargin: dishMargins.filter((m) => m < 50).length,
      noRecipe: visible.filter((u) => !u.anyRecipe && u.category !== "drinks").length,
    };
  }, [visible]);

  const totalSites = allLocations.length;
  const editing = editSlug ? unified.find((u) => u.baseSlug === editSlug) ?? null : null;

  // selection helpers
  const toggleSel = (baseSlug: string) =>
    setSelected((s) => { const n = new Set(s); if (n.has(baseSlug)) n.delete(baseSlug); else n.add(baseSlug); return n; });
  const allRowsSelected = rows.length > 0 && rows.every((u) => selected.has(u.baseSlug));
  const toggleAll = () =>
    setSelected((s) => {
      if (rows.every((u) => s.has(u.baseSlug))) { const n = new Set(s); for (const u of rows) n.delete(u.baseSlug); return n; }
      const n = new Set(s); for (const u of rows) n.add(u.baseSlug); return n;
    });
  const selectedDishes = useMemo(() => unified.filter((u) => selected.has(u.baseSlug)), [unified, selected]);
  const selectedIds = useMemo(() => selectedDishes.flatMap((u) => u.variants.map((v) => v.item.id)), [selectedDishes]);

  // bulk runner over /api/admin/menu/bulk
  const runBulk = useCallback(async (body: Record<string, unknown>, confirmMsg?: string) => {
    if (selectedIds.length === 0) return;
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBulkBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/menu/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: selectedIds, ...body }) });
      if (r.ok) { await fetchAll(); setSelected(new Set()); }
      else setErr((await r.json().catch(() => null))?.error ?? "Bulk action failed");
    } catch { setErr("Network error"); }
    finally { setBulkBusy(false); }
  }, [selectedIds, fetchAll]);

  const cols: ColumnV3<Unified>[] = [
    {
      key: "sel",
      header: <input type="checkbox" checked={allRowsSelected} onChange={toggleAll} aria-label="Select all" style={{ cursor: "pointer" }} />,
      render: (u) => (
        <input
          type="checkbox"
          checked={selected.has(u.baseSlug)}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleSel(u.baseSlug)}
          aria-label={`Select ${u.primary.name}`}
          style={{ cursor: "pointer" }}
        />
      ),
    },
    {
      key: "name", header: "Dish", render: (u) => (
        <div>
          <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {u.primary.name}
            {u.anyRecipe && <span title="has recipe" style={{ color: "var(--av3-platinum)" }} aria-hidden>●</span>}
            {u.isCustom && <Badge tone="info">custom</Badge>}
            {u.anyHidden && <Badge tone="bad">hidden</Badge>}
            {u.anyOverride && !u.isCustom && <Badge tone="neutral">edited</Badge>}
            {u.primary.deliveryOnly && <Badge tone="neutral">delivery</Badge>}
            {(u.primary.modifierGroups?.length ?? 0) > 0 && <Badge tone="neutral">{u.primary.modifierGroups!.length} mods</Badge>}
          </div>
          <div className="av3-cell-muted" style={{ fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 340 }}>{u.primary.description}</div>
        </div>
      ),
    },
    { key: "cat", header: "Category", render: (u) => <span className="av3-cell-muted">{CATEGORY_LABEL[u.category]}</span> },
    {
      key: "price", header: "Price", num: true, render: (u) => {
        const min = Math.min(...u.prices), max = Math.max(...u.prices);
        return (
          <span className="av3-pricecell">
            {min === max ? formatPrice(min) : `${formatPrice(min)}–${formatPrice(max)}`}
            {min !== max && <Badge tone="warn"><span className="av3-varies">varies</span></Badge>}
          </span>
        );
      },
    },
    {
      key: "margin", header: "Margin", num: true, render: (u) => {
        const avg = u.margins.reduce((s, m) => s + m, 0) / (u.margins.length || 1);
        return <Badge tone={marginTone(avg)}>{avg.toFixed(0)}%</Badge>;
      },
    },
    {
      key: "avail", header: "On menu", render: (u) => {
        if (u.variants.length < totalSites) return <Badge tone="info">{u.variants.map((l) => l.city.slice(0, 3)).join("/")} only</Badge>;
        if (u.availableCount === 0) return <Badge tone="bad" dot>Off</Badge>;
        if (u.availableCount < u.variants.length) return <Badge tone="warn" dot>Partial</Badge>;
        return <Badge tone="ok" dot>On</Badge>;
      },
    },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Menu</h1>
          <div className="av3-pagehead-sub">Chain-wide product board · one row per dish · price &amp; availability vary per site</div>
        </div>
        <div className="av3-pagehead-actions">
          <Button variant="ghost" size="sm" onClick={() => setShowHidden((v) => !v)}>{showHidden ? "Hide hidden" : "Show hidden"}</Button>
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}><Plus className="av3-btn-ico" /> Add item</Button>
          <Button variant="ghost" size="sm" onClick={() => { setRefreshing(true); fetchAll(); }}>
            <RefreshCw className="av3-btn-ico" style={refreshing ? { animation: "av3-spin .7s linear infinite" } : undefined} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="Dishes" icon={UtensilsCrossed} value={kpis.dishes.toLocaleString("pl-PL")} accentVar="--av3-c3" />
        <Kpi label="Avg margin" icon={Percent} value={`${kpis.avgMargin.toFixed(0)}%`} accentVar="--av3-c4" />
        <Kpi label="Low margin" icon={TrendingDown} value={`${kpis.lowMargin}`} accentVar="--av3-c1" />
        <Kpi label="86’d (off)" icon={Ban} value={`${kpis.off}`} accentVar="--av3-c5" />
        <Kpi label="No recipe" icon={FlaskConical} value={`${kpis.noRecipe}`} accentVar="--av3-c2" />
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
          <button key={c} type="button" className={`av3-fchip ${cat === c ? "is-active" : ""}`} onClick={() => setCat(c)}>
            {CATEGORY_LABEL[c]}<span className="av3-fchip-count">{counts[c]}</span>
          </button>
        ))}
      </div>

      {/* bulk toolbar */}
      {selected.size > 0 && (
        <div className="av3-card" style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", position: "sticky", top: 50, zIndex: 3 }}>
          <span style={{ fontWeight: 600, fontSize: 12.5 }}>{selected.size} dish{selected.size > 1 ? "es" : ""} · {selectedIds.length} site rows</span>
          <span style={{ flex: 1 }} />
          <Button variant="secondary" size="sm" loading={bulkBusy} onClick={() => runBulk({ action: "edit", scope: "current", patch: { available: true } })}>Mark available</Button>
          <Button variant="secondary" size="sm" loading={bulkBusy} onClick={() => runBulk({ action: "edit", scope: "current", patch: { available: false } })}>86 (hide)</Button>
          <Button variant="secondary" size="sm" loading={bulkBusy} onClick={() => setBulkEditing(true)}>Bulk edit…</Button>
          {allLocations.map((l) => (
            <Button key={l.slug} variant="ghost" size="sm" loading={bulkBusy} onClick={() => runBulk({ action: "clone_to", target: l.slug })}>Clone → {l.city}</Button>
          ))}
          <Button variant="ghost" size="sm" loading={bulkBusy} onClick={() => runBulk({ action: "reset" }, "Reset all overrides on the selected dishes back to seed values?")}>Reset overrides</Button>
          <Button variant="danger" size="sm" loading={bulkBusy} onClick={() => runBulk({ action: "delete", scope: "current" }, `Delete ${selected.size} dish(es)? Seed items hide (restorable); custom items are removed.`)}><Trash2 className="av3-btn-ico" /> Delete</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}><X className="av3-btn-ico" /> Clear</Button>
        </div>
      )}
      {err && <div className="av3-card" style={{ padding: "8px 12px", color: "var(--av3-bad)", fontSize: 12.5, display: "flex", gap: 8 }}><span style={{ flex: 1 }}>{err}</span><button type="button" className="av3-iconbtn-sm" onClick={() => setErr(null)} aria-label="Dismiss"><X /></button></div>}

      {loading && unified.length === 0 ? (
        <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={6} /></div>
      ) : rows.length === 0 ? (
        <div className="av3-card" style={{ padding: 0 }}>
          <div className="av3-empty"><div className="av3-empty-title">No dishes</div><div className="av3-empty-text">{q ? "No dish matches that search." : "Nothing in this category."}</div></div>
        </div>
      ) : view === "table" ? (
        <div className="av3-card" style={{ padding: 0 }}>
          <Table columns={cols} rows={rows} rowKey={(u) => u.baseSlug} onRowClick={(u) => setEditSlug(u.baseSlug)} />
        </div>
      ) : (
        <MenuBoard rows={rows} totalSites={totalSites} selected={selected} onToggleSel={toggleSel} onOpen={(u) => setEditSlug(u.baseSlug)} />
      )}

      {editing && <MenuEditDialog item={editing} onClose={() => setEditSlug(null)} onSaved={fetchAll} />}
      {adding && <AddItemDialog locations={allLocations} onClose={() => setAdding(false)} onSaved={fetchAll} />}
      {bulkEditing && <BulkEditDialog count={selected.size} onClose={() => setBulkEditing(false)} onApply={async (patch) => { setBulkEditing(false); await runBulk({ action: "edit", scope: "current", patch }); }} />}
    </>
  );
}

/* ── board (card) view ─────────────────────────────────────────────────── */
function availability(u: Unified, totalSites: number): { tone: BadgeTone; label: string } {
  if (u.variants.length < totalSites) return { tone: "info", label: `${u.variants.map((l) => l.city.slice(0, 3)).join("/")} only` };
  if (u.availableCount === 0) return { tone: "bad", label: "Off" };
  if (u.availableCount < u.variants.length) return { tone: "warn", label: "Partial" };
  return { tone: "ok", label: "On" };
}

function MenuBoard({ rows, totalSites, selected, onToggleSel, onOpen }: {
  rows: Unified[]; totalSites: number; selected: Set<string>; onToggleSel: (s: string) => void; onOpen: (u: Unified) => void;
}) {
  // group by category, preserving the menu order
  const sections = useMemo(() => {
    const map = new Map<MenuCategory, Unified[]>();
    for (const u of rows) { const arr = map.get(u.category) ?? []; arr.push(u); map.set(u.category, arr); }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({ category: c, items: map.get(c)! }));
  }, [rows]);

  return (
    <div>
      {sections.map((s) => (
        <div key={s.category}>
          <div className="av3-board-section">{CATEGORY_LABEL[s.category]}<span className="c">{s.items.length}</span></div>
          <div className="av3-board">
            {s.items.map((u) => <DishCard key={u.baseSlug} u={u} totalSites={totalSites} selected={selected.has(u.baseSlug)} onToggleSel={onToggleSel} onOpen={onOpen} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function DishCard({ u, totalSites, selected, onToggleSel, onOpen }: {
  u: Unified; totalSites: number; selected: boolean; onToggleSel: (s: string) => void; onOpen: (u: Unified) => void;
}) {
  const min = Math.min(...u.prices), max = Math.max(...u.prices);
  const avg = u.margins.reduce((s, m) => s + m, 0) / (u.margins.length || 1);
  const av = availability(u, totalSites);
  return (
    <div className="av3-dcard" data-sel={selected} data-dim={u.allHidden} onClick={() => onOpen(u)} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(u); }}>
      <input type="checkbox" className="av3-dcard-check" checked={selected} onClick={(e) => e.stopPropagation()} onChange={() => onToggleSel(u.baseSlug)} aria-label={`Select ${u.primary.name}`} />
      <div className="av3-dcard-name">
        {u.anyRecipe && <span title="has recipe" style={{ color: "var(--av3-platinum)", marginRight: 5 }} aria-hidden>●</span>}
        {u.primary.name}
      </div>
      <div className="av3-dcard-desc">{u.primary.description || "—"}</div>
      <div className="av3-dcard-badges">
        <Badge tone={av.tone} dot>{av.label}</Badge>
        {u.isCustom && <Badge tone="info">custom</Badge>}
        {u.anyHidden && <Badge tone="bad">hidden</Badge>}
        {u.anyOverride && !u.isCustom && <Badge tone="neutral">edited</Badge>}
        {u.primary.deliveryOnly && <Badge tone="neutral">delivery</Badge>}
        {(u.primary.modifierGroups?.length ?? 0) > 0 && <Badge tone="neutral">{u.primary.modifierGroups!.length} mods</Badge>}
      </div>
      <div className="av3-dcard-foot">
        <div>
          <div className="av3-dcard-price">{min === max ? formatPrice(min) : `${formatPrice(min)}–${formatPrice(max)}`}</div>
          <div className="av3-dcard-sub">{min === max ? "all sites" : "varies by site"}</div>
        </div>
        <Badge tone={marginTone(avg)}>{avg.toFixed(0)}% margin</Badge>
      </div>
    </div>
  );
}

/* ── chip + field helpers ──────────────────────────────────────────────── */
function ChipToggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="av3-badge" style={{ cursor: "pointer", border: `1px solid ${on ? "var(--av3-platinum)" : "var(--av3-line-strong)"}`, background: on ? "color-mix(in oklab, var(--av3-platinum) 18%, var(--av3-s1))" : "transparent", color: on ? "var(--av3-fg)" : "var(--av3-muted)" }}>
      {children}
    </button>
  );
}

/* ── modifier groups editor (chain-wide) ───────────────────────────────── */
function ModifierEditor({ groups, onChange }: { groups: ModifierGroup[]; onChange: (g: ModifierGroup[]) => void }) {
  const patchGroup = (i: number, patch: Partial<ModifierGroup>) => onChange(groups.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  const patchOption = (gi: number, oi: number, patch: Partial<ModifierOption>) =>
    onChange(groups.map((g, idx) => (idx === gi ? { ...g, options: (g.options ?? []).map((o, j) => (j === oi ? { ...o, ...patch } : o)) } : g)));
  const addGroup = () => onChange([...groups, { id: uid("grp"), label: "New group", minSelections: 0, maxSelections: 1, options: [{ id: uid("opt"), label: "Option", priceDelta: 0 }] }]);
  const rmGroup = (i: number) => onChange(groups.filter((_, idx) => idx !== i));
  const addOption = (gi: number) => onChange(groups.map((g, idx) => (idx === gi ? { ...g, options: [...(g.options ?? []), { id: uid("opt"), label: "Option", priceDelta: 0 }] } : g)));
  const rmOption = (gi: number, oi: number) => onChange(groups.map((g, idx) => (idx === gi ? { ...g, options: (g.options ?? []).filter((_, j) => j !== oi) } : g)));

  return (
    <div>
      {groups.length === 0 && <div className="av3-cell-muted" style={{ fontSize: 11.5, marginBottom: 8 }}>No modifier groups. Add one for size upgrades, extra toppings, crust types…</div>}
      {groups.map((g, gi) => (
        <div key={g.id} style={{ border: "1px solid var(--av3-line)", borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
            <label className="av3-field" style={{ flex: 1, minWidth: 140 }}><span className="av3-field-label">Group label</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={g.label} onChange={(e) => patchGroup(gi, { label: e.target.value })} /></label>
            <label className="av3-field" style={{ width: 72 }}><span className="av3-field-label">Min</span><input className="av3-input" type="number" min={0} max={10} value={g.minSelections ?? 0} onChange={(e) => patchGroup(gi, { minSelections: Number(e.target.value) || 0 })} /></label>
            <label className="av3-field" style={{ width: 72 }}><span className="av3-field-label">Max</span><input className="av3-input" type="number" min={1} max={10} value={g.maxSelections ?? 1} onChange={(e) => patchGroup(gi, { maxSelections: Number(e.target.value) || 1 })} /></label>
            <button type="button" className="av3-iconbtn-sm" aria-label="Remove group" onClick={() => rmGroup(gi)}><X /></button>
          </div>
          <div className="av3-locrow-head" style={{ gridTemplateColumns: "1fr 90px 90px 56px 28px", marginTop: 8 }}><span>Option</span><span>+ Price zł</span><span>+ Cost zł</span><span>KDS</span><span /></div>
          {(g.options ?? []).map((o, oi) => (
            <div key={o.id} className="av3-locrow" style={{ gridTemplateColumns: "1fr 90px 90px 56px 28px", padding: "3px 0", borderBottom: "none" }}>
              <input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={o.label} onChange={(e) => patchOption(gi, oi, { label: e.target.value })} />
              <input className="av3-input" type="number" step="0.01" value={o.priceDelta / 100} onChange={(e) => patchOption(gi, oi, { priceDelta: Math.round((Number(e.target.value) || 0) * 100) })} />
              <input className="av3-input" type="number" step="0.01" value={(o.costDelta ?? 0) / 100} onChange={(e) => patchOption(gi, oi, { costDelta: Math.round((Number(e.target.value) || 0) * 100) })} />
              <Switch aria-label="Flag on KDS" checked={o.flagOnKds ?? false} onChange={() => patchOption(gi, oi, { flagOnKds: !o.flagOnKds })} />
              <button type="button" className="av3-iconbtn-sm" aria-label="Remove option" onClick={() => rmOption(gi, oi)} disabled={(g.options ?? []).length <= 1}><X /></button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => addOption(gi)} style={{ marginTop: 6 }}><Plus className="av3-btn-ico" /> Option</Button>
        </div>
      ))}
      <Button variant="secondary" size="sm" onClick={addGroup} disabled={groups.length >= 8}><Plus className="av3-btn-ico" /> Add modifier group</Button>
    </div>
  );
}

/* ── edit dialog ───────────────────────────────────────────────────────── */
function MenuEditDialog({ item, onClose, onSaved }: { item: Unified; onClose: () => void; onSaved: () => Promise<void> }) {
  const p = item.primary;
  const [name, setName] = useState(p.name);
  const [description, setDescription] = useState(p.description);
  const [category, setCategory] = useState<MenuCategory>(p.category);
  const [tags, setTags] = useState<MenuTag[]>(p.tags ?? []);
  const [menuRole, setMenuRole] = useState<MenuRole | "">(p.menuRole ?? "");
  const [deliveryOnly, setDeliveryOnly] = useState(Boolean(p.deliveryOnly));
  const [packaging, setPackaging] = useState(String((p.packagingCost ?? 0) / 100));
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>(p.modifierGroups ?? []);
  const [allergens, setAllergens] = useState<Allergen[]>(p.allergens ?? []);
  const [halalStatus, setHalalStatus] = useState<Halal | "">(p.halalStatus ?? "");
  const [nutriGrade, setNutriGrade] = useState<Nutri | "">(p.nutriGrade ?? "");
  const [containsPork, setContainsPork] = useState(Boolean(p.containsPork));
  const [containsAlcohol, setContainsAlcohol] = useState(Boolean(p.containsAlcohol));
  const [perLoc, setPerLoc] = useState(
    item.variants.map((v) => ({ slug: v.slug, city: v.city, id: v.item.id, price: String(v.item.price / 100), cost: String(v.item.cost / 100), available: v.item.available, sku: v.item.sku ?? "", hasRecipe: Boolean(v.item._hasRecipe) })),
  );
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"product" | "pricing" | "modifiers" | "disclosures">("product");

  // live price/margin recap from the per-site draft (editing aid, always visible)
  const recap = useMemo(() => {
    const prices = perLoc.map((r) => (Number(r.price) || 0) * 100).filter((n) => n > 0);
    const margins = perLoc.map((r) => marginPct((Number(r.price) || 0) * 100, (Number(r.cost) || 0) * 100));
    const min = prices.length ? Math.min(...prices) : 0;
    const max = prices.length ? Math.max(...prices) : 0;
    const avgM = margins.length ? margins.reduce((s, m) => s + m, 0) / margins.length : 0;
    return { min, max, avgM };
  }, [perLoc]);
  const discCount = allergens.length + (halalStatus ? 1 : 0) + (nutriGrade ? 1 : 0) + (containsPork ? 1 : 0) + (containsAlcohol ? 1 : 0);

  const toggleTag = (t: MenuTag) => setTags((a) => (a.includes(t) ? a.filter((x) => x !== t) : [...a, t]));
  const toggleAllergen = (a: Allergen) => setAllergens((arr) => (arr.includes(a) ? arr.filter((x) => x !== a) : [...arr, a]));
  const setRow = (slug: string, patch: Partial<{ price: string; cost: string; available: boolean; sku: string }>) =>
    setPerLoc((arr) => arr.map((r) => (r.slug === slug ? { ...r, ...patch } : r)));

  const cleanModifiers = (): ModifierGroup[] =>
    modifierGroups
      .map((g) => ({ ...g, label: g.label.trim(), options: (g.options ?? []).filter((o) => o.label?.trim()).map((o) => ({ ...o, label: o.label.trim() })) }))
      .filter((g) => g.label && g.options.length > 0);

  const save = async () => {
    setSaving(true);
    try {
      const mods = cleanModifiers();
      const meta = {
        name, description, category,
        tags,
        menuRole: (menuRole || null) as MenuRole | null,
        deliveryOnly,
        packagingCost: Math.round((Number(packaging) || 0) * 100),
        modifierGroups: mods,
        allergens,
        halalStatus: (halalStatus || null) as Halal | null,
        nutriGrade: (nutriGrade || null) as Nutri | null,
        containsPork,
        containsAlcohol,
      };
      const items: Record<string, Record<string, unknown>> = {};
      for (const r of perLoc) {
        items[r.id] = {
          ...meta,
          price: Math.round((Number(r.price) || 0) * 100),
          // recipe-attached dishes derive cost from the recipe — don't fight it
          ...(r.hasRecipe ? {} : { cost: Math.round((Number(r.cost) || 0) * 100) }),
          available: r.available,
          sku: r.sku.trim() || null,
        };
      }
      const res = await fetch("/api/admin/menu", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
      if (res.ok) { await onSaved(); onClose(); }
    } finally {
      setSaving(false);
    }
  };

  const dishBulk = async (body: Record<string, unknown>, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    try {
      const ids = item.variants.map((v) => v.item.id);
      const r = await fetch("/api/admin/menu/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, ...body }) });
      if (r.ok) { await onSaved(); onClose(); }
    } finally { setBusy(false); }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={item.primary.name}
      subtitle={`Chain-wide product · ${item.variants.length} site${item.variants.length > 1 ? "s" : ""}`}
      headerExtra={item.anyRecipe ? <Badge tone="brand"><FlaskConical style={{ width: 11, height: 11 }} /> recipe</Badge> : undefined}
      width={640}
      footer={
        <>
          <Button variant="ghost" size="sm" loading={busy} onClick={() => dishBulk({ action: "reset" }, "Reset this dish's overrides back to seed?")}>Reset</Button>
          <Button variant="danger" size="sm" loading={busy} onClick={() => dishBulk({ action: "delete", scope: "current" }, "Delete this dish? Seed hides (restorable); custom removes.")}>Delete</Button>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={saving} onClick={save}>Save</Button>
        </>
      }
    >
      {/* live recap — price range + avg margin from the per-site draft */}
      <div className="av3-recap" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <div className="av3-recap-cell"><div className="av3-recap-k">Price</div><div className="av3-recap-v">{recap.min === recap.max ? formatPrice(recap.min) : `${formatPrice(recap.min)}–${formatPrice(recap.max)}`}</div></div>
        <div className="av3-recap-cell"><div className="av3-recap-k">Avg margin</div><div className="av3-recap-v" style={{ color: `var(--av3-${marginTone(recap.avgM) === "ok" ? "ok" : marginTone(recap.avgM) === "warn" ? "warn" : "bad"})` }}>{recap.avgM.toFixed(0)}%</div></div>
        <div className="av3-recap-cell"><div className="av3-recap-k">Sites</div><div className="av3-recap-v">{item.variants.length}</div></div>
      </div>

      <div className="av3-dtabs">
        <button type="button" className={`av3-dtab ${tab === "product" ? "is-active" : ""}`} onClick={() => setTab("product")}>Product</button>
        <button type="button" className={`av3-dtab ${tab === "pricing" ? "is-active" : ""}`} onClick={() => setTab("pricing")}>Pricing</button>
        <button type="button" className={`av3-dtab ${tab === "modifiers" ? "is-active" : ""}`} onClick={() => setTab("modifiers")}>Modifiers{modifierGroups.length > 0 && <span className="av3-dtab-count">{modifierGroups.length}</span>}</button>
        <button type="button" className={`av3-dtab ${tab === "disclosures" ? "is-active" : ""}`} onClick={() => setTab("disclosures")}>Disclosures{discCount > 0 && <span className="av3-dtab-count">{discCount}</span>}</button>
      </div>

      {tab === "product" && (
        <>
          <div className="av3-edhint" style={{ marginBottom: 12 }}>These fields apply to <b>every site</b> — a Margherita reads identically in Kraków and Warszawa (rule #10).</div>
          <div className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Name</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Description</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label className="av3-field" style={{ width: 160 }}><span className="av3-field-label">Category</span><select className="av3-select" value={category} onChange={(e) => setCategory(e.target.value as MenuCategory)}>{CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select></label>
            <label className="av3-field" style={{ width: 160 }}><span className="av3-field-label">Menu role</span><select className="av3-select" value={menuRole} onChange={(e) => setMenuRole(e.target.value as MenuRole | "")}><option value="">— none —</option>{MENU_ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select></label>
          </div>
          <div style={{ marginTop: 10 }}>
            <span className="av3-field-label" style={{ display: "block", marginBottom: 6 }}>Dietary tags</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{MENU_TAGS.map((t) => <ChipToggle key={t.key} on={tags.includes(t.key)} onClick={() => toggleTag(t.key)}>{t.label}</ChipToggle>)}</div>
          </div>
        </>
      )}

      {tab === "pricing" && (
        <>
          <div className="av3-subhead" style={{ marginTop: 0 }}>Per-site pricing &amp; availability</div>
          <div className="av3-locrow-head" style={{ gridTemplateColumns: "1.1fr 92px 92px 1fr 52px" }}><span>Site</span><span>Price</span><span>Cost</span><span>SKU</span><span>Live</span></div>
          {perLoc.map((r) => {
            const m = marginPct((Number(r.price) || 0) * 100, (Number(r.cost) || 0) * 100);
            return (
              <div className="av3-locrow" key={r.slug} style={{ gridTemplateColumns: "1.1fr 92px 92px 1fr 52px" }}>
                <span className="av3-locrow-city">{r.city}<span style={{ color: marginTone(m) === "bad" ? "var(--av3-bad)" : marginTone(m) === "warn" ? "var(--av3-warn)" : "var(--av3-ok)", fontSize: 11, marginLeft: 6 }}>{m.toFixed(0)}%</span></span>
                <span className="av3-affix" data-suffix="zł"><input className="av3-input" type="number" step="0.01" value={r.price} onChange={(e) => setRow(r.slug, { price: e.target.value })} /></span>
                <span className="av3-affix" data-suffix="zł"><input className="av3-input" type="number" step="0.01" value={r.cost} disabled={r.hasRecipe} title={r.hasRecipe ? "Cost derives from the recipe" : undefined} onChange={(e) => setRow(r.slug, { cost: e.target.value })} /></span>
                <input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} placeholder="—" value={r.sku} onChange={(e) => setRow(r.slug, { sku: e.target.value })} />
                <Switch aria-label="Available" checked={r.available} onChange={() => setRow(r.slug, { available: !r.available })} />
              </div>
            );
          })}
          <div className="av3-subhead">Service &amp; channel</div>
          <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
            <label className="av3-field" style={{ width: 150 }}><span className="av3-field-label">Packaging cost</span><span className="av3-affix" data-suffix="zł"><input className="av3-input" type="number" step="0.01" value={packaging} onChange={(e) => setPackaging(e.target.value)} /></span></label>
            <div className="av3-field" style={{ width: 140 }}><span className="av3-field-label">Delivery-only</span><Switch aria-label="Delivery-only" checked={deliveryOnly} onChange={setDeliveryOnly} /></div>
          </div>
        </>
      )}

      {tab === "modifiers" && (
        <>
          <div className="av3-edhint" style={{ marginBottom: 12 }}>Size upgrades, extra toppings, crust types… Structure is chain-wide; price/cost deltas apply on top of the base.</div>
          <ModifierEditor groups={modifierGroups} onChange={setModifierGroups} />
        </>
      )}

      {tab === "disclosures" && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <label className="av3-field" style={{ width: 150 }}><span className="av3-field-label">Halal status</span><select className="av3-select" value={halalStatus} onChange={(e) => setHalalStatus(e.target.value as Halal | "")}><option value="">— none —</option>{HALAL_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>
            <label className="av3-field" style={{ width: 130 }}><span className="av3-field-label">Nutri-Grade</span><select className="av3-select" value={nutriGrade} onChange={(e) => setNutriGrade(e.target.value as Nutri | "")}><option value="">— none —</option>{NUTRI_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            <div className="av3-field" style={{ width: 110 }}><span className="av3-field-label">Contains pork</span><Switch aria-label="Contains pork" checked={containsPork} onChange={setContainsPork} /></div>
            <div className="av3-field" style={{ width: 110 }}><span className="av3-field-label">Contains alcohol</span><Switch aria-label="Contains alcohol" checked={containsAlcohol} onChange={setContainsAlcohol} /></div>
          </div>
          <span className="av3-field-label" style={{ display: "block", marginBottom: 6 }}>Allergens</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{ALLERGENS.map((a) => <ChipToggle key={a} on={allergens.includes(a)} onClick={() => toggleAllergen(a)}>{ALLERGEN_LABELS[a].emoji} {ALLERGEN_LABELS[a].en}</ChipToggle>)}</div>
        </>
      )}
    </Dialog>
  );
}

/* ── bulk edit dialog ──────────────────────────────────────────────────── */
function BulkEditDialog({ count, onClose, onApply }: { count: number; onClose: () => void; onApply: (patch: Record<string, unknown>) => Promise<void> }) {
  const [fields, setFields] = useState({ price: false, cost: false, category: false, deliveryOnly: false, packagingCost: false });
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [category, setCategory] = useState<MenuCategory>("pizza");
  const [deliveryOnly, setDeliveryOnly] = useState(false);
  const [packagingCost, setPackagingCost] = useState("");

  const apply = () => {
    const patch: Record<string, unknown> = {};
    if (fields.price) patch.price = Math.round((Number(price) || 0) * 100);
    if (fields.cost) patch.cost = Math.round((Number(cost) || 0) * 100);
    if (fields.category) patch.category = category;
    if (fields.deliveryOnly) patch.deliveryOnly = deliveryOnly;
    if (fields.packagingCost) patch.packagingCost = Math.round((Number(packagingCost) || 0) * 100);
    if (Object.keys(patch).length === 0) return;
    onApply(patch);
  };
  const row = (k: keyof typeof fields, children: React.ReactNode) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
      <input type="checkbox" checked={fields[k]} onChange={() => setFields((f) => ({ ...f, [k]: !f[k] }))} style={{ cursor: "pointer" }} />
      {children}
    </div>
  );

  return (
    <Dialog open onClose={onClose} title="Bulk edit" subtitle={`Apply to ${count} selected dish${count > 1 ? "es" : ""} (every site row)`} width={460}
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" onClick={apply}>Apply</Button></>}>
      <div className="av3-cell-muted" style={{ fontSize: 11.5, marginBottom: 8 }}>Tick a field to include it in the patch. Unticked fields are left untouched.</div>
      {row("price", <label className="av3-field" style={{ width: 160 }}><span className="av3-field-label">Price (zł)</span><input className="av3-input" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} disabled={!fields.price} /></label>)}
      {row("cost", <label className="av3-field" style={{ width: 160 }}><span className="av3-field-label">Cost (zł)</span><input className="av3-input" type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} disabled={!fields.cost} /></label>)}
      {row("category", <label className="av3-field" style={{ width: 160 }}><span className="av3-field-label">Category</span><select className="av3-select" value={category} onChange={(e) => setCategory(e.target.value as MenuCategory)} disabled={!fields.category}>{CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select></label>)}
      {row("packagingCost", <label className="av3-field" style={{ width: 160 }}><span className="av3-field-label">Packaging (zł)</span><input className="av3-input" type="number" step="0.01" value={packagingCost} onChange={(e) => setPackagingCost(e.target.value)} disabled={!fields.packagingCost} /></label>)}
      {row("deliveryOnly", <div className="av3-field" style={{ width: 160 }}><span className="av3-field-label">Delivery-only</span><Switch aria-label="Delivery-only" checked={deliveryOnly} disabled={!fields.deliveryOnly} onChange={setDeliveryOnly} /></div>)}
    </Dialog>
  );
}

/* ── add custom item dialog (chain-wide) ───────────────────────────────── */
function AddItemDialog({ locations, onClose, onSaved }: { locations: { slug: string; city: string }[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<MenuCategory>("pizza");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [tags, setTags] = useState<MenuTag[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const baseId = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
  const toggleTag = (t: MenuTag) => setTags((a) => (a.includes(t) ? a.filter((x) => x !== t) : [...a, t]));

  const save = async () => {
    if (!name.trim() || baseId.length < 1) { setErr("Enter a name"); return; }
    setSaving(true);
    setErr(null);
    try {
      const priceGrosze = Math.round((Number(price) || 0) * 100);
      const costGrosze = Math.round((Number(cost) || 0) * 100);
      // Create one custom row per active site so the dish exists chain-wide
      // and groups under one board row (id prefix = slug.slice(0,3), matching getBaseSlug).
      const results = await Promise.all(
        locations.map((l) =>
          fetch("/api/admin/menu/custom", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: `${l.slug.slice(0, 3)}-${baseId}`, locationSlug: l.slug, name: name.trim(), description, price: priceGrosze, cost: costGrosze, category, tags, available: true }),
          }).then((r) => r.ok),
        ),
      );
      if (results.every(Boolean)) { await onSaved(); onClose(); }
      else setErr("Some sites failed (id may clash with an existing item)");
    } catch { setErr("Network error"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onClose={onClose} title="Add menu item" subtitle={`Created on all ${locations.length} site${locations.length > 1 ? "s" : ""} · chain-wide`} width={480}
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" loading={saving} onClick={save}>Create</Button></>}>
      {err && <div style={{ color: "var(--av3-bad)", fontSize: 12, marginBottom: 8 }}>{err}</div>}
      <div className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Name</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
      {baseId && <div className="av3-cell-muted" style={{ fontSize: 11, marginBottom: 10 }}>id: {locations.map((l) => `${l.slug.slice(0, 3)}-${baseId}`).join(", ")}</div>}
      <div className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Description</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label className="av3-field" style={{ width: 150 }}><span className="av3-field-label">Category</span><select className="av3-select" value={category} onChange={(e) => setCategory(e.target.value as MenuCategory)}>{CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select></label>
        <label className="av3-field" style={{ width: 110 }}><span className="av3-field-label">Price (zł)</span><input className="av3-input" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <label className="av3-field" style={{ width: 110 }}><span className="av3-field-label">Cost (zł)</span><input className="av3-input" type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></label>
      </div>
      <div style={{ marginTop: 10 }}>
        <span className="av3-field-label" style={{ display: "block", marginBottom: 6 }}>Dietary tags</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{MENU_TAGS.map((t) => <ChipToggle key={t.key} on={tags.includes(t.key)} onClick={() => toggleTag(t.key)}>{t.label}</ChipToggle>)}</div>
      </div>
    </Dialog>
  );
}
