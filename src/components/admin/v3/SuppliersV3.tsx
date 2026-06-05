"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Plus } from "lucide-react";
import { Badge, Button, Dialog, Table, type ColumnV3 } from "./ui";

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

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/suppliers").then((r) => (r.ok ? r.json() : [])).catch(() => []);
    setSuppliers(Array.isArray(res) ? res : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const cols: ColumnV3<Supplier>[] = [
    { key: "name", header: "Supplier", render: (s) => <span style={{ fontWeight: 600 }}>{s.name}</span> },
    { key: "contact", header: "Contact", render: (s) => <span className="av3-cell-muted">{s.contactName || s.email || s.phone || "—"}</span> },
    { key: "phone", header: "Phone", render: (s) => <span className="av3-cell-muted">{s.phone || "—"}</span> },
    { key: "lead", header: "Lead time", num: true, render: (s) => (s.leadTimeDays != null ? `${s.leadTimeDays}d` : "—") },
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

      {loading && suppliers.length === 0 ? (
        <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading suppliers…</div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {suppliers.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No suppliers yet</div><div className="av3-empty-text">Add your first distributor to raise purchase orders against it.</div></div>
          ) : (
            <Table columns={cols} rows={suppliers} rowKey={(s) => s.id} onRowClick={(s) => setEdit(s)} />
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
