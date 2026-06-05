"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, PackagePlus, RefreshCw, Trash2, TrendingUp } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import type { StockMovementType } from "@/data/types";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, Button, Dialog, Kpi, Table, type BadgeTone, type ColumnV3 } from "./ui";

interface StockRow {
  id: string;
  ingredientId: string;
  locationSlug: string;
  name: string;
  category?: string;
  unit: string;
  onHand: number;
  parLevel: number;
  reorderPoint: number;
  costPerUnit: number; // grosze
  supplier?: string;
}
interface Movement {
  id: string;
  ingredientId: string;
  locationSlug: string;
  type: StockMovementType;
  quantity: number;
  costImpact?: number;
  reason?: string;
  occurredAt: string;
}

type StatusFilter = "all" | "ok" | "low" | "out";

const MOVEMENT_LABEL: Record<StockMovementType, string> = {
  receive: "Received",
  waste: "Wasted",
  consume: "Consumed",
  adjust: "Adjusted",
};
const MOVEMENT_TONE: Record<StockMovementType, BadgeTone> = {
  receive: "ok",
  waste: "warn",
  consume: "info",
  adjust: "neutral",
};

function classify(r: StockRow): "ok" | "low" | "out" {
  if (r.onHand <= 0) return "out";
  if (r.onHand <= r.reorderPoint) return "low";
  return "ok";
}
const STATUS_TONE: Record<"ok" | "low" | "out", BadgeTone> = { ok: "ok", low: "warn", out: "bad" };
const STATUS_LABEL: Record<"ok" | "low" | "out", string> = { ok: "In stock", low: "Low", out: "Out" };

function fmtAgo(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function InventoryV3() {
  const { location } = useAdminLocationV3();
  const allLocations = useMemo(() => getActiveLocations(), []);
  const cityFor = useCallback((slug: string) => allLocations.find((l) => l.slug === slug)?.city ?? slug, [allLocations]);

  const [stock, setStock] = useState<StockRow[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<"stock" | "movements">("stock");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [edit, setEdit] = useState<StockRow | null>(null);

  const fetchAll = useCallback(async () => {
    const locs = location ? [location] : allLocations.map((l) => l.slug);
    try {
      const stockParts = await Promise.all(
        locs.map((loc) =>
          Promise.all([
            fetch(`/api/admin/stock?location=${loc}`).then((r) => (r.ok ? r.json() : [])),
            fetch(`/api/admin/stock-movements?location=${loc}&limit=50`).then((r) => (r.ok ? r.json() : [])),
          ]),
        ),
      );
      setStock(stockParts.flatMap(([s]) => (Array.isArray(s) ? (s as StockRow[]) : [])));
      setMovements(stockParts.flatMap(([, m]) => (Array.isArray(m) ? (m as Movement[]) : [])));
    } catch (err) {
      console.error("Inventory refresh failed:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [location, allLocations]);

  useEffect(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: stock.length, ok: 0, low: 0, out: 0 };
    for (const r of stock) c[classify(r)]++;
    return c;
  }, [stock]);

  const totalValue = useMemo(() => stock.reduce((s, r) => s + Math.round(r.onHand * r.costPerUnit), 0), [stock]);
  const waste7d = useMemo(() => {
    const cutoff = Date.now() - 7 * 86400000;
    const cost = new Map(stock.map((r) => [r.ingredientId, r.costPerUnit]));
    let total = 0;
    for (const m of movements) {
      if (m.type !== "waste" || new Date(m.occurredAt).getTime() < cutoff) continue;
      total += m.costImpact ?? Math.abs(m.quantity) * (cost.get(m.ingredientId) ?? 0);
    }
    return Math.round(total);
  }, [movements, stock]);

  const filteredStock = useMemo(() => {
    const rows = filter === "all" ? stock : stock.filter((r) => classify(r) === filter);
    return [...rows].sort((a, b) => {
      const order = { out: 0, low: 1, ok: 2 } as const;
      return order[classify(a)] - order[classify(b)] || a.name.localeCompare(b.name);
    });
  }, [stock, filter]);

  const sortedMovements = useMemo(
    () => [...movements].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).slice(0, 60),
    [movements],
  );

  const showLoc = !location;
  const filterChips: StatusFilter[] = ["all", "out", "low", "ok"];
  const filterLabel: Record<StatusFilter, string> = { all: "All", ok: "In stock", low: "Low", out: "Out" };

  const stockCols: ColumnV3<StockRow>[] = [
    { key: "name", header: "Ingredient", render: (r) => <span style={{ fontWeight: 500 }}>{r.name}</span> },
    ...(showLoc ? [{ key: "loc", header: "Site", render: (r: StockRow) => <span className="av3-cell-muted">{cityFor(r.locationSlug)}</span> }] : []),
    { key: "cat", header: "Category", render: (r) => <span className="av3-cell-muted">{r.category ?? "—"}</span> },
    { key: "onhand", header: "On hand", num: true, render: (r) => `${r.onHand} ${r.unit}` },
    { key: "reorder", header: "Reorder", num: true, render: (r) => `${r.reorderPoint}` },
    { key: "status", header: "Status", render: (r) => { const s = classify(r); return <Badge tone={STATUS_TONE[s]} dot>{STATUS_LABEL[s]}</Badge>; } },
    { key: "value", header: "Value", num: true, render: (r) => formatPrice(Math.round(r.onHand * r.costPerUnit)) },
  ];

  const moveCols: ColumnV3<Movement>[] = [
    { key: "time", header: "When", render: (m) => <span className="av3-cell-muted">{fmtAgo(m.occurredAt)}</span> },
    { key: "item", header: "Ingredient", render: (m) => stock.find((s) => s.ingredientId === m.ingredientId && s.locationSlug === m.locationSlug)?.name ?? m.ingredientId },
    ...(showLoc ? [{ key: "loc", header: "Site", render: (m: Movement) => <span className="av3-cell-muted">{cityFor(m.locationSlug)}</span> }] : []),
    { key: "type", header: "Type", render: (m) => <Badge tone={MOVEMENT_TONE[m.type]}>{MOVEMENT_LABEL[m.type]}</Badge> },
    { key: "qty", header: "Qty", num: true, render: (m) => `${m.quantity > 0 ? "+" : ""}${m.quantity}` },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Inventory</h1>
          <div className="av3-pagehead-sub">Stock on hand · reorder points · waste — {location ? cityFor(location) : "all sites"}</div>
        </div>
        <div className="av3-pagehead-actions">
          <div className="av3-viewtoggle" role="tablist" aria-label="View">
            <button type="button" className={view === "stock" ? "is-active" : ""} aria-selected={view === "stock"} onClick={() => setView("stock")} style={{ width: "auto", padding: "0 10px", fontSize: 12 }}>Stock</button>
            <button type="button" className={view === "movements" ? "is-active" : ""} aria-selected={view === "movements"} onClick={() => setView("movements")} style={{ width: "auto", padding: "0 10px", fontSize: 12 }}>Movements</button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setRefreshing(true); fetchAll(); }}>
            <RefreshCw className="av3-btn-ico" style={refreshing ? { animation: "av3-spin .7s linear infinite" } : undefined} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="Inventory value" icon={Boxes} value={formatPrice(totalValue)} accentVar="--av3-c2" />
        <Kpi label="Low / out" icon={TrendingUp} value={`${counts.low + counts.out}`} accentVar="--av3-c1" />
        <Kpi label="Waste · 7 days" icon={Trash2} value={formatPrice(waste7d)} accentVar="--av3-c1" />
      </div>

      {view === "stock" && (
        <div className="av3-filterchips">
          {filterChips.map((f) => (
            <button key={f} type="button" className={`av3-fchip ${filter === f ? "is-active" : ""}`} onClick={() => setFilter(f)}>
              {filterLabel[f]}<span className="av3-fchip-count">{counts[f]}</span>
            </button>
          ))}
        </div>
      )}

      {loading && stock.length === 0 ? (
        <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading stock…</div>
      ) : view === "stock" ? (
        <div className="av3-card" style={{ padding: 0 }}>
          {filteredStock.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">Nothing here</div><div className="av3-empty-text">No {filter === "all" ? "" : filterLabel[filter].toLowerCase()} stock items.</div></div>
          ) : (
            <Table columns={stockCols} rows={filteredStock} rowKey={(r) => r.id} onRowClick={(r) => setEdit(r)} />
          )}
        </div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {sortedMovements.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-text">No stock movements recorded yet.</div></div>
          ) : (
            <Table columns={moveCols} rows={sortedMovements} rowKey={(m) => m.id} />
          )}
        </div>
      )}

      {edit && <EditDialog row={edit} city={cityFor(edit.locationSlug)} onClose={() => setEdit(null)} onSaved={fetchAll} />}
    </>
  );
}

// ── edit + movement dialog ──────────────────────────────────────────────────
function EditDialog({ row, city, onClose, onSaved }: { row: StockRow; city: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [onHand, setOnHand] = useState(String(row.onHand));
  const [par, setPar] = useState(String(row.parLevel));
  const [reorder, setReorder] = useState(String(row.reorderPoint));
  const [savingStock, setSavingStock] = useState(false);

  const [mvType, setMvType] = useState<StockMovementType>("receive");
  const [mvQty, setMvQty] = useState("");
  const [mvReason, setMvReason] = useState("");
  const [savingMove, setSavingMove] = useState(false);

  const saveStock = async () => {
    setSavingStock(true);
    try {
      const r = await fetch("/api/admin/stock", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredientId: row.ingredientId,
          locationSlug: row.locationSlug,
          onHand: Number(onHand) || 0,
          parLevel: Number(par) || 0,
          reorderPoint: Number(reorder) || 0,
          lastCountedAt: new Date().toISOString(),
          lastCountedBy: "admin",
        }),
      });
      if (r.ok) { await onSaved(); onClose(); }
    } finally {
      setSavingStock(false);
    }
  };

  const recordMove = async () => {
    const q = Number(mvQty);
    if (!q) return;
    // waste/consume reduce stock → store as a signed delta like v2 (negative for outflows)
    const signed = mvType === "receive" ? Math.abs(q) : mvType === "adjust" ? q : -Math.abs(q);
    setSavingMove(true);
    try {
      const r = await fetch("/api/admin/stock-movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredientId: row.ingredientId, locationSlug: row.locationSlug, type: mvType, quantity: signed, reason: mvReason || undefined }),
      });
      if (r.ok) { setMvQty(""); setMvReason(""); await onSaved(); onClose(); }
    } finally {
      setSavingMove(false);
    }
  };

  const status = classify(row);
  return (
    <Dialog
      open
      onClose={onClose}
      title={row.name}
      subtitle={`${city}${row.supplier ? ` · ${row.supplier}` : ""} · ${row.onHand} ${row.unit} on hand`}
      headerExtra={<Badge tone={STATUS_TONE[status]} dot>{STATUS_LABEL[status]}</Badge>}
      width={520}
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Close</Button><Button variant="primary" size="sm" loading={savingStock} onClick={saveStock}>Save levels</Button></>}
    >
      <div className="av3-formrow">
        <label className="av3-field"><span className="av3-field-label">On hand ({row.unit})</span><input className="av3-input" type="number" value={onHand} onChange={(e) => setOnHand(e.target.value)} /></label>
        <label className="av3-field"><span className="av3-field-label">Par level</span><input className="av3-input" type="number" value={par} onChange={(e) => setPar(e.target.value)} /></label>
        <label className="av3-field"><span className="av3-field-label">Reorder pt</span><input className="av3-input" type="number" value={reorder} onChange={(e) => setReorder(e.target.value)} /></label>
      </div>

      <div className="av3-subhead">Record a movement</div>
      <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 1fr", alignItems: "end" }}>
        <label className="av3-field"><span className="av3-field-label">Type</span>
          <select className="av3-select" value={mvType} onChange={(e) => setMvType(e.target.value as StockMovementType)}>
            <option value="receive">Receive (delivery)</option>
            <option value="waste">Waste</option>
            <option value="adjust">Adjust (count)</option>
          </select>
        </label>
        <label className="av3-field"><span className="av3-field-label">Quantity ({row.unit})</span><input className="av3-input" type="number" value={mvQty} onChange={(e) => setMvQty(e.target.value)} placeholder="0" /></label>
      </div>
      <label className="av3-field" style={{ marginTop: 10 }}><span className="av3-field-label">Reason (optional)</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={mvReason} onChange={(e) => setMvReason(e.target.value)} placeholder="e.g. spoilage, weekly count" /></label>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <Button variant="secondary" size="sm" loading={savingMove} onClick={recordMove}>
          <PackagePlus className="av3-btn-ico" /> Log {MOVEMENT_LABEL[mvType].toLowerCase()}
        </Button>
      </div>
    </Dialog>
  );
}
