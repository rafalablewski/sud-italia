"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PackageSearch, Plus, X } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, Button, Dialog, Table, type BadgeTone, type ColumnV3 } from "./ui";

type POStatus = "draft" | "sent" | "received" | "cancelled";
interface POLine { ingredientId: string; quantity: number; unitCost: number; name?: string; unit?: string; lineTotal?: number }
interface PORow {
  id: string; supplierId: string; supplierName: string; locationSlug: string;
  status: POStatus; lines: POLine[]; lineCount: number; totalCents: number;
  expectedAt?: string; createdAt: string;
}
interface Supplier { id: string; name: string }
interface Ingredient { id: string; name: string; unit: string; costPerUnit: number }

const STATUS_LABEL: Record<POStatus, string> = { draft: "Draft", sent: "Sent", received: "Received", cancelled: "Cancelled" };
const STATUS_TONE: Record<POStatus, BadgeTone> = { draft: "warn", sent: "info", received: "ok", cancelled: "neutral" };

function fmtDate(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "short" }) : "—";
}

export function PurchaseOrdersV3() {
  const { location } = useAdminLocationV3();
  const all = useMemo(() => getActiveLocations(), []);
  const loc = location || all[0]?.slug || "krakow";
  const city = all.find((l) => l.slug === loc)?.city ?? loc;

  const [orders, setOrders] = useState<PORow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | POStatus>("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [po, sup, ing] = await Promise.all([
      fetch(`/api/admin/purchase-orders?location=${loc}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`/api/admin/suppliers`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`/api/admin/ingredients`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    setOrders(Array.isArray(po) ? po : []);
    setSuppliers(Array.isArray(sup) ? sup : []);
    setIngredients(Array.isArray(ing) ? ing : []);
    setLoading(false);
  }, [loc]);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length, draft: 0, sent: 0, received: 0, cancelled: 0 };
    for (const o of orders) c[o.status]++;
    return c;
  }, [orders]);

  const rows = useMemo(() => (filter === "all" ? orders : orders.filter((o) => o.status === filter)), [orders, filter]);
  const detail = detailId ? orders.find((o) => o.id === detailId) ?? null : null;

  const advance = async (id: string, status: POStatus) => {
    setBusy(id);
    try {
      const res = await fetch("/api/admin/purchase-orders", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
      if (res.ok) { await load(); }
    } finally {
      setBusy(null);
    }
  };
  const remove = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/purchase-orders?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) { setDetailId(null); await load(); }
    } finally {
      setBusy(null);
    }
  };

  const chips: ("all" | POStatus)[] = ["all", "draft", "sent", "received", "cancelled"];
  const cols: ColumnV3<PORow>[] = [
    { key: "id", header: "PO", render: (p) => <span className="av3-cell-muted">{p.id.slice(-6).toUpperCase()}</span> },
    { key: "sup", header: "Supplier", render: (p) => <span style={{ fontWeight: 500 }}>{p.supplierName}</span> },
    { key: "lines", header: "Lines", num: true, render: (p) => `${p.lineCount}` },
    { key: "total", header: "Total", num: true, render: (p) => formatPrice(p.totalCents) },
    { key: "exp", header: "Expected", render: (p) => <span className="av3-cell-muted">{fmtDate(p.expectedAt)}</span> },
    { key: "st", header: "Status", render: (p) => <Badge tone={STATUS_TONE[p.status]} dot>{STATUS_LABEL[p.status]}</Badge> },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Purchase orders</h1>
          <div className="av3-pagehead-sub">Restock orders · {city}{!location ? " (pick a location to switch)" : ""}</div>
        </div>
        <div className="av3-pagehead-actions">
          <Button variant="primary" size="sm" onClick={() => setCreating(true)} disabled={suppliers.length === 0}><Plus className="av3-btn-ico" /> New PO</Button>
        </div>
      </div>

      <div className="av3-filterchips">
        {chips.map((f) => (
          <button key={f} type="button" className={`av3-fchip ${filter === f ? "is-active" : ""}`} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : STATUS_LABEL[f]}<span className="av3-fchip-count">{counts[f] ?? 0}</span>
          </button>
        ))}
      </div>

      {loading && orders.length === 0 ? (
        <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading purchase orders…</div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No purchase orders</div><div className="av3-empty-text">{suppliers.length === 0 ? "Add a supplier first, then raise a PO." : "Raise a restock order with “New PO”."}</div></div>
          ) : (
            <Table columns={cols} rows={rows} rowKey={(p) => p.id} onRowClick={(p) => setDetailId(p.id)} />
          )}
        </div>
      )}

      {/* detail + actions */}
      <Dialog
        open={!!detail}
        onClose={() => setDetailId(null)}
        title={detail ? `PO ${detail.id.slice(-6).toUpperCase()}` : ""}
        subtitle={detail ? `${detail.supplierName} · raised ${fmtDate(detail.createdAt)}` : undefined}
        headerExtra={detail ? <Badge tone={STATUS_TONE[detail.status]} dot>{STATUS_LABEL[detail.status]}</Badge> : undefined}
        width={520}
        footer={detail && (
          <>
            {(detail.status === "draft" || detail.status === "cancelled") && (
              <Button variant="danger" size="sm" loading={busy === detail.id} onClick={() => remove(detail.id)} style={{ marginRight: "auto" }}>Delete</Button>
            )}
            {(detail.status === "draft" || detail.status === "sent") && (
              <Button variant="ghost" size="sm" loading={busy === detail.id} onClick={() => advance(detail.id, "cancelled")}>Cancel</Button>
            )}
            {detail.status === "draft" && <Button variant="secondary" size="sm" loading={busy === detail.id} onClick={() => advance(detail.id, "sent")}>Mark sent</Button>}
            {detail.status === "sent" && <Button variant="primary" size="sm" loading={busy === detail.id} onClick={() => advance(detail.id, "received")}>Receive (credit stock)</Button>}
          </>
        )}
      >
        {detail && (
          <>
            {detail.lines.map((l, i) => (
              <div className="av3-od-line" key={i}>
                <div><span className="q">{l.quantity}{l.unit ? ` ${l.unit}` : ""}×</span>{l.name ?? l.ingredientId}</div>
                <span className="lp">{formatPrice(l.lineTotal ?? Math.round(l.quantity * l.unitCost))}</span>
              </div>
            ))}
            <div className="av3-od-total"><span className="av3-section-label" style={{ marginBottom: 0 }}>Total</span><span className="v">{formatPrice(detail.totalCents)}</span></div>
            {detail.status === "sent" && <div style={{ fontSize: 11.5, color: "var(--av3-subtle)", marginTop: 10 }}>Receiving auto-credits stock on hand and logs the movement.</div>}
          </>
        )}
      </Dialog>

      {creating && <CreatePODialog locationSlug={loc} suppliers={suppliers} ingredients={ingredients} onClose={() => setCreating(false)} onSaved={async () => { await load(); setCreating(false); }} />}
    </>
  );
}

interface DraftLine { ingredientId: string; quantity: string; unitCost: number }

function CreatePODialog({ locationSlug, suppliers, ingredients, onClose, onSaved }: {
  locationSlug: string; suppliers: Supplier[]; ingredients: Ingredient[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const ingById = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [expectedAt, setExpectedAt] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);

  const addLine = () => { const ing = ingredients[0]; setLines((a) => [...a, { ingredientId: ing?.id ?? "", quantity: "", unitCost: ing?.costPerUnit ?? 0 }]); };
  const setLine = (i: number, patch: Partial<DraftLine>) => setLines((a) => a.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((a) => a.filter((_, idx) => idx !== i));
  const onPickIngredient = (i: number, id: string) => setLine(i, { ingredientId: id, unitCost: ingById.get(id)?.costPerUnit ?? 0 });

  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * l.unitCost, 0);
  const canSave = supplierId && lines.some((l) => l.ingredientId && Number(l.quantity) > 0);

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        supplierId, locationSlug,
        expectedAt: expectedAt || undefined,
        lines: lines.filter((l) => l.ingredientId && Number(l.quantity) > 0).map((l) => ({ ingredientId: l.ingredientId, quantity: Number(l.quantity), unitCost: l.unitCost })),
      };
      const res = await fetch("/api/admin/purchase-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="New purchase order"
      subtitle="Draft a restock order against a supplier"
      headerExtra={<Badge tone="neutral"><PackageSearch style={{ width: 11, height: 11 }} /> PO</Badge>}
      width={580}
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" loading={saving} disabled={!canSave} onClick={save}>Create draft</Button></>}
    >
      <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 140px", marginBottom: 6 }}>
        <label className="av3-field"><span className="av3-field-label">Supplier</span>
          <select className="av3-select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
        <label className="av3-field"><span className="av3-field-label">Expected</span><input className="av3-input" type="date" style={{ fontFamily: "var(--av3-ui)" }} value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} /></label>
      </div>

      <div className="av3-subhead">Lines</div>
      {lines.length === 0 ? (
        <div className="av3-empty-text" style={{ padding: "8px 0", color: "var(--av3-subtle)" }}>No lines yet — add the first ingredient.</div>
      ) : (
        <>
          <div className="av3-reciperow-head"><span>Ingredient</span><span>Qty</span><span>Unit cost</span><span style={{ textAlign: "right" }}>Total</span><span /></div>
          {lines.map((l, i) => {
            const ing = ingById.get(l.ingredientId);
            return (
              <div className="av3-reciperow" key={i}>
                <select className="av3-select" value={l.ingredientId} onChange={(e) => onPickIngredient(i, e.target.value)}>
                  {ingredients.map((ig) => <option key={ig.id} value={ig.id}>{ig.name}</option>)}
                </select>
                <input className="av3-input" type="number" step="0.001" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} placeholder={ing?.unit ?? ""} />
                <span className="av3-reciperow-cost" style={{ textAlign: "left" }}>{formatPrice(l.unitCost)}</span>
                <span className="av3-reciperow-cost">{formatPrice(Math.round((Number(l.quantity) || 0) * l.unitCost))}</span>
                <button type="button" className="av3-iconbtn-sm" aria-label="Remove" onClick={() => removeLine(i)}><X /></button>
              </div>
            );
          })}
        </>
      )}
      <div style={{ marginTop: 10 }}><Button variant="secondary" size="sm" onClick={addLine} disabled={ingredients.length === 0}><Plus className="av3-btn-ico" /> Add line</Button></div>

      <div className="av3-recipe-summary"><div className="av3-field-label">Order total</div><span className="v">{formatPrice(Math.round(total))}</span></div>
    </Dialog>
  );
}
