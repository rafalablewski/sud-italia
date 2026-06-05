"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FlaskConical, RefreshCw } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { formatPrice, getBaseSlug } from "@/lib/utils";
import type { MenuCategory } from "@/data/types";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, Button, Dialog, Table, type BadgeTone, type ColumnV3 } from "./ui";

interface MenuItemData {
  id: string;
  name: string;
  description: string;
  price: number; // grosze
  cost: number; // grosze
  category: MenuCategory;
  tags: string[];
  available: boolean;
  _hasRecipe?: boolean;
}
interface LocVariant { slug: string; city: string; item: MenuItemData }
interface Unified {
  baseSlug: string;
  name: string;
  description: string;
  category: MenuCategory;
  tags: string[];
  locations: LocVariant[];
  prices: number[];
  margins: number[];
  availableCount: number;
}

const CATEGORY_ORDER: MenuCategory[] = ["pizza", "pasta", "antipasti", "panini", "drinks", "desserts"];
const CATEGORY_LABEL: Record<MenuCategory, string> = {
  pizza: "Pizza", pasta: "Pasta", antipasti: "Antipasti", panini: "Panini", drinks: "Drinks", desserts: "Desserts",
};

function marginPct(price: number, cost: number): number {
  return price > 0 ? ((price - cost) / price) * 100 : 0;
}
function marginTone(m: number): BadgeTone {
  if (m >= 65) return "ok";
  if (m >= 50) return "warn";
  return "bad";
}

export function MenuV3() {
  const { location } = useAdminLocationV3();
  const allLocations = useMemo(() => getActiveLocations(), []);
  const [byLoc, setByLoc] = useState<Record<string, MenuItemData[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cat, setCat] = useState<"all" | MenuCategory>("all");
  const [editSlug, setEditSlug] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const entries = await Promise.all(
        allLocations.map(async (l) => {
          const items = await fetch(`/api/admin/menu?location=${l.slug}`).then((r) => (r.ok ? r.json() : []));
          return [l.slug, Array.isArray(items) ? (items as MenuItemData[]) : []] as const;
        }),
      );
      setByLoc(Object.fromEntries(entries));
    } catch (err) {
      console.error("Menu refresh failed:", err);
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
    const groups = new Map<string, LocVariant[]>();
    for (const l of allLocations) {
      for (const item of byLoc[l.slug] ?? []) {
        const base = getBaseSlug(item.id);
        const arr = groups.get(base) ?? [];
        arr.push({ slug: l.slug, city: l.city, item });
        groups.set(base, arr);
      }
    }
    const out: Unified[] = [];
    for (const [baseSlug, locs] of groups) {
      const primary = locs[0].item;
      out.push({
        baseSlug,
        name: primary.name,
        description: primary.description,
        category: primary.category,
        tags: primary.tags ?? [],
        locations: locs,
        prices: locs.map((l) => l.item.price),
        margins: locs.map((l) => marginPct(l.item.price, l.item.cost)),
        availableCount: locs.filter((l) => l.item.available).length,
      });
    }
    return out.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name));
  }, [byLoc, allLocations]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: unified.length };
    for (const u of unified) c[u.category] = (c[u.category] ?? 0) + 1;
    return c;
  }, [unified]);

  const rows = useMemo(() => (cat === "all" ? unified : unified.filter((u) => u.category === cat)), [unified, cat]);

  const totalSites = allLocations.length;
  const editing = editSlug ? unified.find((u) => u.baseSlug === editSlug) ?? null : null;

  const cols: ColumnV3<Unified>[] = [
    { key: "name", header: "Dish", render: (u) => (
      <div>
        <div style={{ fontWeight: 600 }}>{u.name}{u.locations.some((l) => l.item._hasRecipe) && <span title="has recipe" style={{ marginLeft: 6, color: "var(--av3-platinum)" }} aria-hidden>●</span>}</div>
        <div className="av3-cell-muted" style={{ fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 360 }}>{u.description}</div>
      </div>
    ) },
    { key: "cat", header: "Category", render: (u) => <span className="av3-cell-muted">{CATEGORY_LABEL[u.category]}</span> },
    { key: "price", header: "Price", num: true, render: (u) => {
      const min = Math.min(...u.prices), max = Math.max(...u.prices);
      return (
        <span className="av3-pricecell">
          {min === max ? formatPrice(min) : `${formatPrice(min)}–${formatPrice(max)}`}
          {min !== max && <Badge tone="warn"><span className="av3-varies">varies</span></Badge>}
        </span>
      );
    } },
    { key: "margin", header: "Margin", num: true, render: (u) => {
      const avg = u.margins.reduce((s, m) => s + m, 0) / (u.margins.length || 1);
      return <Badge tone={marginTone(avg)}>{avg.toFixed(0)}%</Badge>;
    } },
    { key: "avail", header: "On menu", render: (u) => {
      if (u.locations.length < totalSites) return <Badge tone="info">{u.locations.map((l) => l.city.slice(0, 3)).join("/")} only</Badge>;
      if (u.availableCount === 0) return <Badge tone="bad" dot>Off</Badge>;
      if (u.availableCount < u.locations.length) return <Badge tone="warn" dot>Partial</Badge>;
      return <Badge tone="ok" dot>On</Badge>;
    } },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Menu</h1>
          <div className="av3-pagehead-sub">Chain-wide product board · one row per dish · only price varies per site</div>
        </div>
        <div className="av3-pagehead-actions">
          <Button variant="ghost" size="sm" onClick={() => { setRefreshing(true); fetchAll(); }}>
            <RefreshCw className="av3-btn-ico" style={refreshing ? { animation: "av3-spin .7s linear infinite" } : undefined} />
            Refresh
          </Button>
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

      {loading && unified.length === 0 ? (
        <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading the menu…</div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No dishes</div><div className="av3-empty-text">Nothing in this category.</div></div>
          ) : (
            <Table columns={cols} rows={rows} rowKey={(u) => u.baseSlug} onRowClick={(u) => setEditSlug(u.baseSlug)} />
          )}
        </div>
      )}

      {editing && <MenuEditDialog item={editing} onClose={() => setEditSlug(null)} onSaved={fetchAll} />}
    </>
  );
}

function MenuEditDialog({ item, onClose, onSaved }: { item: Unified; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description);
  const [category, setCategory] = useState<MenuCategory>(item.category);
  const [perLoc, setPerLoc] = useState(
    item.locations.map((l) => ({ slug: l.slug, city: l.city, id: l.item.id, price: String(l.item.price / 100), cost: String(l.item.cost / 100), available: l.item.available })),
  );
  const [saving, setSaving] = useState(false);

  const setRow = (slug: string, patch: Partial<{ price: string; cost: string; available: boolean }>) =>
    setPerLoc((arr) => arr.map((r) => (r.slug === slug ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    try {
      const items: Record<string, Record<string, unknown>> = {};
      for (const r of perLoc) {
        items[r.id] = {
          // chain-wide metadata propagates to every location (rule #10)
          name, description, category,
          // only price/cost/availability vary per site
          price: Math.round((Number(r.price) || 0) * 100),
          cost: Math.round((Number(r.cost) || 0) * 100),
          available: r.available,
        };
      }
      const res = await fetch("/api/admin/menu", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (res.ok) { await onSaved(); onClose(); }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={item.name}
      subtitle={`Chain-wide product · ${item.locations.length} site${item.locations.length > 1 ? "s" : ""}`}
      headerExtra={item.locations.some((l) => l.item._hasRecipe) ? <Badge tone="brand"><FlaskConical style={{ width: 11, height: 11 }} /> recipe</Badge> : undefined}
      width={560}
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" loading={saving} onClick={save}>Save</Button></>}
    >
      <div className="av3-subhead" style={{ marginTop: 0 }}>Product (applies to every site)</div>
      <div className="av3-field" style={{ marginBottom: 10 }}>
        <span className="av3-field-label">Name</span>
        <input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="av3-field" style={{ marginBottom: 10 }}>
        <span className="av3-field-label">Description</span>
        <input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="av3-field">
        <span className="av3-field-label">Category</span>
        <select className="av3-select" value={category} onChange={(e) => setCategory(e.target.value as MenuCategory)}>
          {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
      </div>

      <div className="av3-subhead">Per-site pricing</div>
      <div className="av3-locrow-head"><span>Site</span><span>Price (zł)</span><span>Cost (zł)</span><span>Live</span></div>
      {perLoc.map((r) => {
        const m = marginPct((Number(r.price) || 0) * 100, (Number(r.cost) || 0) * 100);
        return (
          <div className="av3-locrow" key={r.slug}>
            <span className="av3-locrow-city">{r.city}<span style={{ color: marginTone(m) === "bad" ? "var(--av3-bad)" : "var(--av3-subtle)", fontSize: 11, marginLeft: 6 }}>{m.toFixed(0)}% margin</span></span>
            <input className="av3-input" type="number" step="0.01" value={r.price} onChange={(e) => setRow(r.slug, { price: e.target.value })} />
            <input className="av3-input" type="number" step="0.01" value={r.cost} onChange={(e) => setRow(r.slug, { cost: e.target.value })} />
            <button type="button" className="av3-toggle" data-on={r.available} onClick={() => setRow(r.slug, { available: !r.available })}>{r.available ? "On" : "Off"}</button>
          </div>
        );
      })}
    </Dialog>
  );
}
