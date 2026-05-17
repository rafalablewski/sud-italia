"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Mail, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useIsMobile } from "./v2/mobile";
import { useToast } from "./v2/ui/Toast";

const MobileSuppliers = dynamic(
  () => import("./mobile/MobileSuppliers").then((m) => m.MobileSuppliers),
  { ssr: false },
);
import {
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Input,
  Table,
  Textarea,
  type Column,
} from "./v2/ui";

interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  leadTimeDays?: number;
  notes?: string;
  createdAt: string;
}

interface DialogState {
  open: boolean;
  supplier: Supplier | null;
}

export function AdminSuppliers() {
  const { isMobile, ready } = useIsMobile();
  if (ready && isMobile) {
    return <MobileSuppliers />;
  }
  return <AdminSuppliersDesktop />;
}

function AdminSuppliersDesktop() {
  const toast = useToast();
  const [list, setList] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<DialogState>({ open: false, supplier: null });
  const [pendingDelete, setPendingDelete] = useState<Supplier | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/suppliers");
      if (res.ok) {
        const data = await res.json();
        setList(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((s) => {
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.contactName?.toLowerCase().includes(q) ?? false) ||
        (s.email?.toLowerCase().includes(q) ?? false) ||
        (s.phone?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [list, query]);

  const cols: Column<Supplier>[] = [
    {
      key: "name",
      header: "Supplier",
      cell: (s) => (
        <div className="v2-cell-stack">
          <span>{s.name}</span>
          {s.contactName && <span className="v2-cell-sub">{s.contactName}</span>}
        </div>
      ),
      sortValue: (s) => s.name,
    },
    {
      key: "contact",
      header: "Contact",
      cell: (s) => (
        <div className="v2-cell-stack">
          {s.email && (
            <span>
              <Mail className="h-3 w-3 v2-muted" /> {s.email}
            </span>
          )}
          {s.phone && (
            <span>
              <Phone className="h-3 w-3 v2-muted" /> {s.phone}
            </span>
          )}
          {!s.email && !s.phone && <span className="v2-muted">—</span>}
        </div>
      ),
    },
    {
      key: "lead",
      header: "Lead time",
      align: "right",
      cell: (s) => (
        <span className="v2-muted">
          {s.leadTimeDays !== undefined ? `${s.leadTimeDays} day${s.leadTimeDays === 1 ? "" : "s"}` : "—"}
        </span>
      ),
      sortValue: (s) => s.leadTimeDays ?? Number.POSITIVE_INFINITY,
    },
    {
      key: "actions",
      header: "",
      cell: (s) => (
        <div className="v2-row-actions">
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<Pencil className="h-3.5 w-3.5" />}
            onClick={() => setDialog({ open: true, supplier: s })}
          >
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPendingDelete(s)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const doDelete = async () => {
    if (!pendingDelete) return;
    const res = await fetch(`/api/admin/suppliers?id=${encodeURIComponent(pendingDelete.id)}`, { method: "DELETE" });
    if (res.ok) {
      setList((arr) => arr.filter((s) => s.id !== pendingDelete.id));
      toast.success("Supplier deleted", pendingDelete.name);
    } else {
      toast.error("Could not delete");
    }
    setPendingDelete(null);
  };

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Suppliers</h1>
          <p className="v2-page-subtitle">Vendor directory feeding purchase orders and inventory restocks.</p>
        </div>
        <div className="v2-page-actions">
          <Button variant="primary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setDialog({ open: true, supplier: null })}>
            New supplier
          </Button>
        </div>
      </header>

      <div className="v2-filters">
        <div className="v2-filter-search">
          <Input
            placeholder="Search by name, contact, email or phone…"
            leadingAdornment={<Search className="h-3.5 w-3.5" />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="v2-page-loading">Loading…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={Building2}
              title={list.length === 0 ? "No suppliers yet" : "No matches"}
              description={list.length === 0 ? "Add your first supplier to start raising purchase orders." : "Try clearing the search."}
              action={
                list.length === 0 ? (
                  <Button variant="primary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setDialog({ open: true, supplier: null })}>
                    New supplier
                  </Button>
                ) : undefined
              }
            />
          </CardBody>
        </Card>
      ) : (
        <Card padding="none">
          <CardBody>
            <Table rows={filtered} columns={cols} rowKey={(s) => s.id} defaultSort={{ key: "name", dir: "asc" }} />
          </CardBody>
        </Card>
      )}

      <SupplierDialog
        state={dialog}
        onClose={() => setDialog({ open: false, supplier: null })}
        onSaved={async () => {
          setDialog({ open: false, supplier: null });
          await fetchAll();
          toast.success("Supplier saved");
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={doDelete}
        title={`Delete ${pendingDelete?.name ?? ""}?`}
        description="Purchase orders that reference this supplier will keep their snapshot, but new POs to this vendor will no longer be possible."
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}

interface SupplierDialogProps {
  state: DialogState;
  onClose: () => void;
  onSaved: () => void;
}

function SupplierDialog({ state, onClose, onSaved }: SupplierDialogProps) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [leadStr, setLeadStr] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    const s = state.supplier;
    setName(s?.name ?? "");
    setContactName(s?.contactName ?? "");
    setEmail(s?.email ?? "");
    setPhone(s?.phone ?? "");
    setLeadStr(s?.leadTimeDays !== undefined ? String(s.leadTimeDays) : "");
    setNotes(s?.notes ?? "");
    setBusy(false);
  }, [state]);

  if (!state.open) return <Dialog open={false} onClose={onClose} />;

  const submit = async () => {
    if (!name.trim()) {
      toast.warning("Name required");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        id: state.supplier?.id,
        name: name.trim(),
        contactName: contactName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        leadTimeDays: leadStr.trim() ? Number(leadStr) : undefined,
        notes: notes.trim() || undefined,
      };
      const res = await fetch("/api/admin/suppliers", {
        method: state.supplier ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) onSaved();
      else toast.error("Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={state.supplier ? `Edit ${state.supplier.name}` : "New supplier"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>{state.supplier ? "Save changes" : "Create supplier"}</Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <Input label="Company name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Contact person" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        <div className="v2-form-row-2">
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <Input
          label="Typical lead time (days)"
          type="number"
          min="0"
          value={leadStr}
          onChange={(e) => setLeadStr(e.target.value)}
          description="Used to forecast when a PO will arrive."
        />
        <Textarea label="Notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Dialog>
  );
}

