"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, Plus } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import type { ExpansionChecklist, ExpansionChecklistItem } from "@/data/types";
import { Badge, Button, type ColumnV3, Dialog, Kpi, SkeletonRows, Table } from "./ui";

const DEFAULT_ITEMS: Omit<ExpansionChecklistItem, "id" | "done">[] = [
  { label: "Register local business entity", category: "legal" },
  { label: "Obtain food handling permits", category: "legal" },
  { label: "Secure liability + property insurance", category: "legal" },
  { label: "Sign commercial lease / parking permit", category: "site" },
  { label: "Install kitchen equipment + utilities", category: "site" },
  { label: "Confirm Wi-Fi and POS connectivity", category: "site" },
  { label: "Onboard local ingredient suppliers", category: "supply" },
  { label: "Hire + train opening crew", category: "ops" },
  { label: "Configure time slots + capacity", category: "ops" },
];
function defaultItems(): ExpansionChecklistItem[] {
  return DEFAULT_ITEMS.map((it, i) => ({ ...it, id: `it-${i}`, done: false }));
}

interface Row { slug: string; city: string; isActive: boolean; checklist: ExpansionChecklist | null }

export function ExpansionV3() {
  const all = useMemo(() => getActiveLocations(), []);
  const [list, setList] = useState<ExpansionChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/expansion").then((r) => (r.ok ? r.json() : [])).catch(() => []);
    setList(Array.isArray(res) ? res : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo<Row[]>(() => {
    const map = new Map(list.map((c) => [c.locationSlug, c]));
    const known = new Set(all.map((l) => l.slug));
    const out: Row[] = all.map((l) => ({ slug: l.slug, city: l.city, isActive: l.isActive, checklist: map.get(l.slug) ?? null }));
    for (const c of list) if (!known.has(c.locationSlug)) out.push({ slug: c.locationSlug, city: c.city ?? c.locationSlug, isActive: false, checklist: c });
    return out.sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.city.localeCompare(b.city));
  }, [list, all]);

  const persist = async (c: ExpansionChecklist) => {
    const res = await fetch("/api/admin/expansion", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
    if (res.ok) { const saved = await res.json(); setList((arr) => [...arr.filter((x) => x.locationSlug !== saved.locationSlug), saved]); }
  };

  const progress = (c: ExpansionChecklist | null) => { if (!c || c.items.length === 0) return null; const done = c.items.filter((i) => i.done).length; return { done, total: c.items.length, pct: Math.round((done / c.items.length) * 100) }; };

  const selRow = rows.find((r) => r.slug === selected) ?? null;
  const plannedCount = rows.filter((r) => !r.isActive).length;

  const cols: ColumnV3<Row>[] = [
    { key: "city", header: "Location", render: (r) => <span style={{ fontWeight: 600 }}>{r.city}</span> },
    { key: "status", header: "Status", render: (r) => <Badge tone={r.isActive ? "ok" : "info"} dot>{r.isActive ? "Live" : "Planned"}</Badge> },
    { key: "prog", header: "Readiness", render: (r) => { const p = progress(r.checklist); if (!p) return <span className="av3-cell-muted">—</span>; return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, width: 160 }}>
        <span className="av3-bar-track" style={{ flex: 1 }}><span className="av3-bar-fill" style={{ width: `${p.pct}%`, background: p.pct === 100 ? "var(--av3-ok)" : "var(--av3-platinum)" }} /></span>
        <span className="av3-cell-muted mono" style={{ fontFamily: "var(--av3-mono)", fontSize: 11 }}>{p.done}/{p.total}</span>
      </span>
    ); } },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Expansion</h1>
          <div className="av3-pagehead-sub">New-site readiness checklists</div>
        </div>
        <div className="av3-pagehead-actions">
          <Button variant="primary" size="sm" onClick={() => setAdding(true)}><Plus className="av3-btn-ico" /> Add planned site</Button>
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="Live sites" icon={MapPin} value={`${rows.filter((r) => r.isActive).length}`} accentVar="--av3-c4" />
        <Kpi label="Planned sites" icon={MapPin} value={`${plannedCount}`} accentVar="--av3-c3" />
      </div>

      {loading ? (
        <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={6} /></div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          <Table columns={cols} rows={rows} rowKey={(r) => r.slug} onRowClick={(r) => setSelected(r.slug)} />
        </div>
      )}

      {selRow && (
        <ChecklistDialog
          row={selRow}
          onClose={() => setSelected(null)}
          onToggle={(itemId) => { const c = selRow.checklist ?? { locationSlug: selRow.slug, city: selRow.city, items: defaultItems(), updatedAt: new Date().toISOString() }; persist({ ...c, items: c.items.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)), updatedAt: new Date().toISOString() }); }}
        />
      )}
      {adding && <AddDialog existing={new Set(rows.map((r) => r.slug))} onClose={() => setAdding(false)} onAdd={async (slug, city) => { await persist({ locationSlug: slug, city, items: defaultItems(), updatedAt: new Date().toISOString() }); setAdding(false); setSelected(slug); }} />}
    </>
  );
}

function ChecklistDialog({ row, onClose, onToggle }: { row: Row; onClose: () => void; onToggle: (itemId: string) => void }) {
  const items = row.checklist?.items ?? defaultItems();
  const cats = [...new Set(items.map((i) => i.category))];
  return (
    <Dialog open onClose={onClose} title={row.city} subtitle="Site-readiness checklist" headerExtra={<Badge tone={row.isActive ? "ok" : "info"}>{row.isActive ? "Live" : "Planned"}</Badge>} width={520}>
      {cats.map((cat) => (
        <div key={cat} style={{ marginBottom: 12 }}>
          <div className="av3-subhead" style={{ marginTop: 0 }}>{cat}</div>
          {items.filter((i) => i.category === cat).map((i) => (
            <button key={i.id} type="button" onClick={() => onToggle(i.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "none", border: "none", color: "inherit", cursor: "pointer", padding: "7px 0", borderBottom: "1px solid var(--av3-line)" }}>
              <span style={{ width: 18, height: 18, borderRadius: 5, border: "1px solid var(--av3-line-strong)", display: "grid", placeItems: "center", background: i.done ? "var(--av3-ok)" : "transparent", color: "#fff", fontSize: 12, flexShrink: 0 }}>{i.done ? "✓" : ""}</span>
              <span style={{ fontSize: 13, color: i.done ? "var(--av3-muted)" : "var(--av3-fg)", textDecoration: i.done ? "line-through" : "none" }}>{i.label}</span>
            </button>
          ))}
        </div>
      ))}
    </Dialog>
  );
}

function AddDialog({ existing, onClose, onAdd }: { existing: Set<string>; onClose: () => void; onAdd: (slug: string, city: string) => Promise<void> }) {
  const [city, setCity] = useState("");
  const [saving, setSaving] = useState(false);
  const slug = city.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const dupe = !!slug && existing.has(slug);
  return (
    <Dialog open onClose={onClose} title="Add planned site" width={420}
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" loading={saving} disabled={!city.trim() || dupe} onClick={async () => { setSaving(true); try { await onAdd(slug, city.trim()); } finally { setSaving(false); } }}>Add</Button></>}>
      <label className="av3-field"><span className="av3-field-label">City</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Wrocław" autoFocus /></label>
      {dupe && <div style={{ fontSize: 11.5, color: "var(--av3-bad)", marginTop: 6 }}>A site with that slug already exists.</div>}
    </Dialog>
  );
}
