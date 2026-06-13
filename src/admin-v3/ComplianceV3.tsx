"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck2, Plus } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { COMPLIANCE_KINDS, COMPLIANCE_KIND_LABELS, type ComplianceItem, type ComplianceKind } from "@/data/types";
import { Badge, type BadgeTone, Button, type ColumnV3, Dialog, Kpi, SkeletonKpiRail, SkeletonRows, Table } from "./ui";

function daysTo(iso: string) { return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000); }
function statusOf(iso: string): { tone: BadgeTone; label: string } {
  const d = daysTo(iso);
  if (d < 0) return { tone: "bad", label: `Expired ${-d}d ago` };
  if (d <= 7) return { tone: "bad", label: `${d}d left` };
  if (d <= 30) return { tone: "warn", label: `${d}d left` };
  return { tone: "ok", label: `${d}d left` };
}

export function ComplianceV3() {
  const all = useMemo(() => getActiveLocations(), []);
  const [items, setItems] = useState<ComplianceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<ComplianceItem | "new" | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/compliance").then((r) => (r.ok ? r.json() : [])).catch(() => []);
    setItems(Array.isArray(res) ? res : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (id: string) => { const r = await fetch(`/api/admin/compliance?id=${encodeURIComponent(id)}`, { method: "DELETE" }); if (r.ok) await load(); };

  const counts = useMemo(() => {
    let expired = 0, urgent = 0, soon = 0;
    for (const c of items) { const d = daysTo(c.expiresAt); if (d < 0) expired++; else if (d <= 7) urgent++; else if (d <= 30) soon++; }
    return { expired, urgent, soon };
  }, [items]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...items]
      .filter((c) => !needle || c.title.toLowerCase().includes(needle) || (COMPLIANCE_KIND_LABELS[c.kind] ?? c.kind).toLowerCase().includes(needle) || (all.find((l) => l.slug === c.locationSlug)?.city ?? c.locationSlug).toLowerCase().includes(needle))
      .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());
  }, [items, q, all]);

  const cols: ColumnV3<ComplianceItem>[] = [
    { key: "title", header: "Item", render: (c) => <span style={{ fontWeight: 600 }}>{c.title}</span> },
    { key: "kind", header: "Type", render: (c) => <Badge tone="neutral">{COMPLIANCE_KIND_LABELS[c.kind] ?? c.kind}</Badge> },
    { key: "loc", header: "Site", render: (c) => <span className="av3-cell-muted">{all.find((l) => l.slug === c.locationSlug)?.city ?? c.locationSlug}</span> },
    { key: "exp", header: "Expires", render: (c) => <span className="av3-cell-muted">{c.expiresAt?.slice(0, 10)}</span> },
    { key: "st", header: "Status", render: (c) => { const s = statusOf(c.expiresAt); return <Badge tone={s.tone} dot>{s.label}</Badge>; } },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Compliance</h1>
          <div className="av3-pagehead-sub">License renewals · inspections · insurance — a lapsed permit closes the restaurant</div>
        </div>
        <div className="av3-pagehead-actions"><Button variant="primary" size="sm" onClick={() => setEdit("new")}><Plus className="av3-btn-ico" /> Add item</Button></div>
      </div>

      {loading && items.length === 0 ? <SkeletonKpiRail count={3} /> : (
      <div className="av3-kpi-rail">
        <Kpi label="Expired" icon={CalendarCheck2} value={`${counts.expired}`} accentVar="--av3-c1" />
        <Kpi label="Due ≤ 7 days" icon={CalendarCheck2} value={`${counts.urgent}`} accentVar="--av3-c1" />
        <Kpi label="Due ≤ 30 days" icon={CalendarCheck2} value={`${counts.soon}`} accentVar="--av3-c5" />
      </div>
      )}

      <div className="av3-toolbar">
        <input className="av3-input" style={{ fontFamily: "var(--av3-ui)", width: 240, height: 32 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search item, type or site…" />
        <span className="av3-toolbar-spacer" />
        <span className="av3-cell-muted" style={{ fontSize: 12 }}>{rows.length} shown</span>
      </div>

      {loading ? (
        <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={6} /></div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">{items.length === 0 ? "Nothing tracked" : "No matches"}</div><div className="av3-empty-text">{items.length === 0 ? "Add licenses, inspections and insurance with expiry dates." : "No item matches that search."}</div></div>
          ) : (
            <Table columns={cols} rows={rows} rowKey={(c) => c.id} onRowClick={(c) => setEdit(c)} />
          )}
        </div>
      )}

      {edit && <ItemDialog item={edit === "new" ? null : edit} locations={all} onClose={() => setEdit(null)} onSaved={async () => { await load(); setEdit(null); }} onDelete={edit !== "new" ? async () => { await remove((edit as ComplianceItem).id); setEdit(null); } : undefined} />}
    </>
  );
}

function ItemDialog({ item, locations, onClose, onSaved, onDelete }: { item: ComplianceItem | null; locations: ReturnType<typeof getActiveLocations>; onClose: () => void; onSaved: () => Promise<void>; onDelete?: () => Promise<void> }) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [kind, setKind] = useState<ComplianceKind>(item?.kind ?? "other");
  const [locationSlug, setLocationSlug] = useState(item?.locationSlug ?? locations[0]?.slug ?? "krakow");
  const [expiresAt, setExpiresAt] = useState(item?.expiresAt?.slice(0, 10) ?? "");
  const [lastRenewedAt, setLastRenewedAt] = useState(item?.lastRenewedAt?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    if (!title.trim() || !expiresAt) return;
    setSaving(true);
    try {
      const payload = { ...(item ? { id: item.id } : {}), title: title.trim(), kind, locationSlug, expiresAt: new Date(expiresAt).toISOString(), lastRenewedAt: lastRenewedAt ? new Date(lastRenewedAt).toISOString() : undefined, notes: notes.trim() || undefined };
      const res = await fetch("/api/admin/compliance", { method: item ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) await onSaved();
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onClose={onClose} title={item ? item.title : "New compliance item"} width={520}
      footer={<>{onDelete && <Button variant="danger" size="sm" loading={deleting} onClick={async () => { setDeleting(true); try { await onDelete(); } finally { setDeleting(false); } }} style={{ marginRight: "auto" }}>Delete</Button>}<Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" loading={saving} disabled={!title.trim() || !expiresAt} onClick={save}>Save</Button></>}>
      <label className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Title</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 10 }}>
        <label className="av3-field"><span className="av3-field-label">Type</span><select className="av3-select" value={kind} onChange={(e) => setKind(e.target.value as ComplianceKind)}>{COMPLIANCE_KINDS.map((k) => <option key={k} value={k}>{COMPLIANCE_KIND_LABELS[k]}</option>)}</select></label>
        <label className="av3-field"><span className="av3-field-label">Site</span><select className="av3-select" value={locationSlug} onChange={(e) => setLocationSlug(e.target.value)}>{locations.map((l) => <option key={l.slug} value={l.slug}>{l.city}</option>)}</select></label>
      </div>
      <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 10 }}>
        <label className="av3-field"><span className="av3-field-label">Expires</span><input className="av3-input" type="date" style={{ fontFamily: "var(--av3-ui)" }} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></label>
        <label className="av3-field"><span className="av3-field-label">Last renewed</span><input className="av3-input" type="date" style={{ fontFamily: "var(--av3-ui)" }} value={lastRenewedAt} onChange={(e) => setLastRenewedAt(e.target.value)} /></label>
      </div>
      <label className="av3-field"><span className="av3-field-label">Notes</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="renewal procedure, contact…" /></label>
    </Dialog>
  );
}
