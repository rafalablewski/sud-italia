"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Clock, Contact, Plus, Zap } from "lucide-react";
import { Badge, Button, type ColumnV3, Dialog, Kpi, SkeletonRows, Table } from "./ui";

interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  leadTimeDays?: number;
  notes?: string;
}

export function SuppliersV3() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Supplier | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/suppliers").then((r) => (r.ok ? r.json() : [])).catch(() => []);
    setSuppliers(Array.isArray(res) ? res : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle
      ? suppliers.filter((s) => [s.name, s.contactName, s.email, s.phone].some((v) => v?.toLowerCase().includes(needle)))
      : suppliers;
  }, [suppliers, q]);

  const stats = useMemo(() => {
    const leads = suppliers.map((s) => s.leadTimeDays).filter((n): n is number => typeof n === "number");
    return {
      total: suppliers.length,
      avgLead: leads.length ? Math.round(leads.reduce((a, b) => a + b, 0) / leads.length) : null,
      fastest: leads.length ? Math.min(...leads) : null,
      withContact: suppliers.filter((s) => s.email || s.phone || s.contactName).length,
    };
  }, [suppliers]);

  const cols: ColumnV3<Supplier>[] = [
    { key: "name", header: "Supplier", render: (s) => <div><div style={{ fontWeight: 600 }}>{s.name}</div>{s.contactName && <div className="av3-cell-muted" style={{ fontSize: 11 }}>{s.contactName}</div>}</div> },
    { key: "email", header: "Email", render: (s) => <span className="av3-cell-muted">{s.email || "—"}</span> },
    { key: "phone", header: "Phone", render: (s) => <span className="av3-cell-muted" style={{ fontFamily: s.phone ? "var(--av3-mono)" : undefined }}>{s.phone || "—"}</span> },
    { key: "lead", header: "Lead time", num: true, render: (s) => (s.leadTimeDays != null ? <Badge tone={s.leadTimeDays <= 2 ? "ok" : s.leadTimeDays <= 5 ? "warn" : "neutral"}>{s.leadTimeDays}d</Badge> : <span className="av3-cell-muted">—</span>) },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Suppliers</h1>
          <div className="av3-pagehead-sub">Distributor directory · chain-wide</div>
        </div>
        <div className="av3-pagehead-actions">
          <Button variant="primary" size="sm" onClick={() => setAdding(true)}><Plus className="av3-btn-ico" /> Add supplier</Button>
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="Suppliers" icon={Building2} value={`${stats.total}`} accentVar="--av3-c3" />
        <Kpi label="Avg lead time" icon={Clock} value={stats.avgLead != null ? `${stats.avgLead}d` : "—"} accentVar="--av3-c2" />
        <Kpi label="Fastest" icon={Zap} value={stats.fastest != null ? `${stats.fastest}d` : "—"} accentVar="--av3-c4" />
        <Kpi label="With contact" icon={Contact} value={`${stats.withContact}/${stats.total}`} accentVar="--av3-c5" />
      </div>

      <div className="av3-toolbar">
        <input className="av3-input" style={{ fontFamily: "var(--av3-ui)", width: 240, height: 32 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search supplier, contact, email…" />
        <span className="av3-toolbar-spacer" />
        <span className="av3-cell-muted" style={{ fontSize: 12 }}>{rows.length} shown</span>
      </div>

      {loading && suppliers.length === 0 ? (
        <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={6} /></div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">{suppliers.length === 0 ? "No suppliers yet" : "No matches"}</div><div className="av3-empty-text">{suppliers.length === 0 ? "Add your first distributor to raise purchase orders against it." : "No supplier matches that search."}</div></div>
          ) : (
            <Table columns={cols} rows={rows} rowKey={(s) => s.id} onRowClick={(s) => setEdit(s)} />
          )}
        </div>
      )}

      {(edit || adding) && (
        <SupplierDialog supplier={edit} onClose={() => { setEdit(null); setAdding(false); }} onSaved={async () => { await load(); setEdit(null); setAdding(false); }} />
      )}
    </>
  );
}

function SupplierDialog({ supplier, onClose, onSaved }: { supplier: Supplier | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(supplier?.name ?? "");
  const [contactName, setContactName] = useState(supplier?.contactName ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [lead, setLead] = useState(supplier?.leadTimeDays != null ? String(supplier.leadTimeDays) : "");
  const [notes, setNotes] = useState(supplier?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ...(supplier ? { id: supplier.id } : {}),
        name: name.trim(),
        contactName: contactName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        leadTimeDays: lead.trim() === "" ? undefined : Math.max(0, Math.round(Number(lead))),
        notes: notes.trim() || undefined,
      };
      const res = await fetch("/api/admin/suppliers", { method: supplier ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) await onSaved();
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!supplier) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/suppliers?id=${encodeURIComponent(supplier.id)}`, { method: "DELETE" });
      if (res.ok) await onSaved();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={supplier ? supplier.name : "New supplier"}
      subtitle={supplier ? "Edit distributor details" : "Add a distributor"}
      headerExtra={<Badge tone="neutral"><Building2 style={{ width: 11, height: 11 }} /> supplier</Badge>}
      width={500}
      footer={
        <>
          {supplier && <Button variant="danger" size="sm" loading={deleting} onClick={remove} style={{ marginRight: "auto" }}>Delete</Button>}
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={saving} disabled={!name.trim()} onClick={save}>Save</Button>
        </>
      }
    >
      <div className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Name</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 10 }}>
        <label className="av3-field"><span className="av3-field-label">Contact name</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={contactName} onChange={(e) => setContactName(e.target.value)} /></label>
        <label className="av3-field"><span className="av3-field-label">Lead time (days)</span><input className="av3-input" type="number" min={0} value={lead} onChange={(e) => setLead(e.target.value)} /></label>
      </div>
      <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 10 }}>
        <label className="av3-field"><span className="av3-field-label">Email</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="av3-field"><span className="av3-field-label">Phone</span><input className="av3-input" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
      </div>
      <label className="av3-field"><span className="av3-field-label">Notes</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
    </Dialog>
  );
}
