"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  FileWarning,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useAdminLocation } from "./v2/LocationContext";
import { useToast } from "./v2/ui/Toast";

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Input,
  Select,
  Table,
  Textarea,
  type Column,
  PageHero,
} from "./v2/ui";
import { locations as ALL_LOCATIONS } from "@/data/locations";
import {
  COMPLIANCE_KIND_LABELS,
  COMPLIANCE_KINDS,
  type ComplianceItem,
  type ComplianceKind,
} from "@/data/types";

function daysUntil(iso: string): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.ceil((t - Date.now()) / (24 * 60 * 60 * 1000));
}

function statusTone(days: number): { tone: "success" | "warning" | "danger"; label: string } {
  if (days < 0) return { tone: "danger", label: `Expired ${Math.abs(days)}d ago` };
  if (days <= 7) return { tone: "danger", label: `${days}d left` };
  if (days <= 30) return { tone: "warning", label: `${days}d left` };
  return { tone: "success", label: `${days}d left` };
}

export function AdminCompliance() {
  return <AdminComplianceDesktop />;
}

function AdminComplianceDesktop() {
  const { location } = useAdminLocation();
  const toast = useToast();
  const [items, setItems] = useState<ComplianceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ComplianceItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ComplianceItem | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const url = location
        ? `/api/admin/compliance?location=${encodeURIComponent(location)}`
        : "/api/admin/compliance";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  }, [location]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const counts = useMemo(() => {
    let expired = 0;
    let urgent = 0;
    let soon = 0;
    let healthy = 0;
    for (const i of items) {
      const d = daysUntil(i.expiresAt);
      if (d < 0) expired++;
      else if (d <= 7) urgent++;
      else if (d <= 30) soon++;
      else healthy++;
    }
    return { expired, urgent, soon, healthy };
  }, [items]);

  const handleSave = async (input: Omit<ComplianceItem, "createdAt" | "updatedAt">) => {
    const isUpdate = !!input.id;
    const res = await fetch("/api/admin/compliance", {
      method: isUpdate ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (res.ok) {
      toast.success(isUpdate ? "Compliance item updated" : "Compliance item added");
      await fetchAll();
      return true;
    }
    const data = await res.json().catch(() => ({}));
    toast.error("Could not save", data?.error || "Check the form and try again.");
    return false;
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/admin/compliance?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setItems((arr) => arr.filter((c) => c.id !== id));
      toast.success("Removed compliance item");
    } else {
      toast.error("Could not delete");
    }
  };

  const cols: Column<ComplianceItem>[] = [
    {
      key: "kind",
      header: "Kind",
      cell: (c) => (
        <Badge tone="neutral" variant="soft">
          {COMPLIANCE_KIND_LABELS[c.kind]}
        </Badge>
      ),
      sortValue: (c) => c.kind,
      width: "150px",
    },
    {
      key: "title",
      header: "Title",
      cell: (c) => <span style={{ fontWeight: 500 }}>{c.title}</span>,
      sortValue: (c) => c.title,
    },
    {
      key: "location",
      header: "Location",
      cell: (c) => <Badge tone="neutral" variant="outline">{c.locationSlug}</Badge>,
      sortValue: (c) => c.locationSlug,
    },
    {
      key: "expires",
      header: "Expires",
      cell: (c) => {
        const d = daysUntil(c.expiresAt);
        const status = statusTone(d);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <span>{new Date(c.expiresAt).toLocaleDateString()}</span>
            <Badge tone={status.tone} variant="soft" dot>
              {status.label}
            </Badge>
          </div>
        );
      },
      sortValue: (c) => c.expiresAt,
    },
    {
      key: "actions",
      header: "",
      cell: (c) => (
        <div className="v2-row-actions">
          <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" leadingIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setPendingDelete(c)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="v2-page">
      <PageHero
        title="Compliance calendar"
        subtitle="License renewals, inspections, insurance. A lapsed permit closes the truck — track every expiry here."
        actions={
          <Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreating(true)}>
            New item
          </Button>
        }
      />

      <section className="v2-kpi-grid">
        <Card padding="compact">
          <div className="v2-kds-stat">
            <FileWarning className="h-4 w-4" style={{ color: "var(--danger)" }} />
            <div>
              <div className="v2-kds-stat-value tabular">{counts.expired}</div>
              <div className="v2-kds-stat-label">Expired</div>
            </div>
          </div>
        </Card>
        <Card padding="compact">
          <div className="v2-kds-stat">
            <CalendarClock className="h-4 w-4" style={{ color: "var(--danger)" }} />
            <div>
              <div className="v2-kds-stat-value tabular">{counts.urgent}</div>
              <div className="v2-kds-stat-label">Due in 7 days</div>
            </div>
          </div>
        </Card>
        <Card padding="compact">
          <div className="v2-kds-stat">
            <CalendarCheck2 className="h-4 w-4" style={{ color: "var(--warning)" }} />
            <div>
              <div className="v2-kds-stat-value tabular">{counts.soon}</div>
              <div className="v2-kds-stat-label">Due in 30 days</div>
            </div>
          </div>
        </Card>
        <Card padding="compact">
          <div className="v2-kds-stat">
            <CheckCircle2 className="h-4 w-4" style={{ color: "var(--success)" }} />
            <div>
              <div className="v2-kds-stat-value tabular">{counts.healthy}</div>
              <div className="v2-kds-stat-label">Healthy</div>
            </div>
          </div>
        </Card>
      </section>

      {loading ? (
        <div className="v2-page-loading">Loading Compliance…</div>
      ) : items.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={ShieldCheck}
              title="No compliance items yet"
              description="Add your first license, insurance, or inspection record. The dashboard tile will start showing 30-day renewal warnings."
              action={
                <Button variant="primary" size="sm" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreating(true)}>
                  Add the first one
                </Button>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <Card padding="none">
          <CardHeader title="Tracked items" description="Sorted soonest-expiring first." />
          <Table flush rows={items} columns={cols} rowKey={(c) => c.id} defaultSort={{ key: "expires", dir: "asc" }} />
        </Card>
      )}

      {(editing || creating) && (
        <ComplianceDialog
          key={editing?.id ?? "new"}
          initial={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSubmit={async (payload) => {
            const ok = await handleSave(payload);
            if (ok) {
              setEditing(null);
              setCreating(false);
            }
          }}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) await handleDelete(pendingDelete.id);
        }}
        title="Delete compliance item?"
        description="Removes the record. Audit log keeps a trace."
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}

interface DialogProps {
  initial: ComplianceItem | null;
  onClose: () => void;
  onSubmit: (input: Omit<ComplianceItem, "createdAt" | "updatedAt">) => Promise<void>;
}

function ComplianceDialog({ initial, onClose, onSubmit }: DialogProps) {
  const activeLocations = ALL_LOCATIONS.filter((l) => l.isActive);
  const [kind, setKind] = useState<ComplianceKind>(initial?.kind ?? "alcohol_license");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [locationSlug, setLocationSlug] = useState(initial?.locationSlug ?? activeLocations[0]?.slug ?? "krakow");
  const [expiresAt, setExpiresAt] = useState(initial?.expiresAt ?? "");
  const [lastRenewedAt, setLastRenewedAt] = useState(initial?.lastRenewedAt ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit({
        id: initial?.id ?? "",
        kind,
        title: title.trim(),
        locationSlug,
        expiresAt,
        lastRenewedAt: lastRenewedAt || undefined,
        notes: notes.trim() || undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={initial ? "Edit compliance item" : "New compliance item"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={busy || !title.trim() || !expiresAt}
          >
            {busy ? "Saving…" : initial ? "Save changes" : "Add item"}
          </Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <div className="v2-form-row-2">
          <Select
            label="Kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as ComplianceKind)}
            options={COMPLIANCE_KINDS.map((k) => ({ value: k, label: COMPLIANCE_KIND_LABELS[k] }))}
          />
          <Select
            label="Location"
            value={locationSlug}
            onChange={(e) => setLocationSlug(e.target.value)}
            options={activeLocations.map((l) => ({ value: l.slug, label: l.city }))}
          />
        </div>
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Concession alcohol license (Stary Rynek)"
        />
        <div className="v2-form-row-2">
          <Input
            label="Expires on"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
          <Input
            label="Last renewed"
            type="date"
            value={lastRenewedAt}
            onChange={(e) => setLastRenewedAt(e.target.value)}
            description="Optional, helps track renewal cadence."
          />
        </div>
        <Textarea
          label="Notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Renewal procedure, lawyer contact, doc location…"
        />
      </div>
    </Dialog>
  );
}
