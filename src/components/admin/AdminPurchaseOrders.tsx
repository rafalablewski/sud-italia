"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type {
  IngredientUnit,
  PurchaseOrderLine,
  PurchaseOrderStatus,
} from "@/data/types";
import { getActiveLocations } from "@/data/locations";
import { useAdminLocation } from "./v2/LocationContext";
import { useToast } from "@/ui/Toast";

import {
  Badge,
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Input,
  Select,
  Tabs,
  Table,
  Textarea,
  type Column,
  PageHero,
} from "@/ui";

interface SupplierLite {
  id: string;
  name: string;
  leadTimeDays?: number;
}

interface IngredientLite {
  id: string;
  name: string;
  unit: IngredientUnit;
  costPerUnit: number;
}

interface EnrichedLine extends PurchaseOrderLine {
  name?: string;
  unit?: IngredientUnit;
  lineTotal?: number;
}

interface PORow {
  id: string;
  supplierId: string;
  supplierName: string;
  locationSlug: string;
  status: PurchaseOrderStatus;
  lines: EnrichedLine[];
  lineCount: number;
  totalCents: number;
  expectedAt?: string;
  receivedAt?: string;
  notes?: string;
  createdAt: string;
}

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  received: "Received",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<PurchaseOrderStatus, "warning" | "info" | "success" | "neutral"> = {
  draft: "warning",
  sent: "info",
  received: "success",
  cancelled: "neutral",
};

const activeLocations = getActiveLocations();
const FALLBACK_LOC = activeLocations[0]?.slug ?? "krakow";

type StatusFilter = "all" | PurchaseOrderStatus;

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export function AdminPurchaseOrders() {
  return <AdminPurchaseOrdersDesktop />;
}

function AdminPurchaseOrdersDesktop() {
  const { location: globalLoc } = useAdminLocation();
  const toast = useToast();
  // Site comes from the shell scope (topbar ScopeSwitcher); "all" → first truck.
  const pageLoc = globalLoc || FALLBACK_LOC;

  const [orders, setOrders] = useState<PORow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);
  const [ingredients, setIngredients] = useState<IngredientLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [editing, setEditing] = useState<PORow | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PORow | null>(null);
  const [pendingReceive, setPendingReceive] = useState<PORow | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pos, sups, ings] = await Promise.all([
        fetch(`/api/admin/purchase-orders?location=${pageLoc}`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/admin/suppliers`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/admin/ingredients`).then((r) => (r.ok ? r.json() : [])),
      ]);
      setOrders(Array.isArray(pos) ? pos : []);
      setSuppliers(Array.isArray(sups) ? sups : []);
      setIngredients(Array.isArray(ings) ? ings : []);
    } finally {
      setLoading(false);
    }
  }, [pageLoc]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    return orders.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      return true;
    });
  }, [orders, statusFilter]);

  const counts = useMemo(() => {
    const c = { all: orders.length, draft: 0, sent: 0, received: 0, cancelled: 0 };
    for (const o of orders) c[o.status]++;
    return c;
  }, [orders]);

  const advance = async (po: PORow, status: PurchaseOrderStatus) => {
    const res = await fetch("/api/admin/purchase-orders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: po.id, status }),
    });
    if (res.ok) {
      toast.success(`PO ${STATUS_LABEL[status].toLowerCase()}`, po.supplierName);
      await fetchAll();
    } else {
      toast.error("Could not update");
    }
  };

  const doDelete = async () => {
    if (!pendingDelete) return;
    const res = await fetch(`/api/admin/purchase-orders?id=${encodeURIComponent(pendingDelete.id)}`, { method: "DELETE" });
    if (res.ok) {
      setOrders((arr) => arr.filter((p) => p.id !== pendingDelete.id));
      toast.success("PO deleted");
    }
    setPendingDelete(null);
  };

  const doReceive = async () => {
    if (!pendingReceive) return;
    await advance(pendingReceive, "received");
    setPendingReceive(null);
  };

  const cols: Column<PORow>[] = [
    {
      key: "id",
      header: "PO",
      cell: (p) => <span className="mono">{p.id.slice(-6).toUpperCase()}</span>,
      sortValue: (p) => p.id,
      width: "110px",
    },
    {
      key: "supplier",
      header: "Supplier",
      cell: (p) => p.supplierName,
      sortValue: (p) => p.supplierName,
    },
    {
      key: "lines",
      header: "Lines",
      align: "right",
      cell: (p) => p.lineCount,
      sortValue: (p) => p.lineCount,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      cell: (p) => formatPrice(p.totalCents),
      sortValue: (p) => p.totalCents,
    },
    {
      key: "expected",
      header: "Expected",
      cell: (p) => fmtDate(p.expectedAt),
      sortValue: (p) => p.expectedAt ?? "",
    },
    {
      key: "status",
      header: "Status",
      cell: (p) => (
        <Badge tone={STATUS_TONE[p.status]} variant="soft" dot>
          {STATUS_LABEL[p.status]}
        </Badge>
      ),
      sortValue: (p) => p.status,
    },
    {
      key: "created",
      header: "Created",
      cell: (p) => fmtDate(p.createdAt),
      sortValue: (p) => p.createdAt,
    },
    {
      key: "actions",
      header: "",
      cell: (p) => (
        <div className="v2-row-actions">
          <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
            View
          </Button>
          {p.status === "draft" && (
            <Button size="sm" variant="ghost" leadingIcon={<Send className="h-3.5 w-3.5" />} onClick={() => advance(p, "sent")}>
              Send
            </Button>
          )}
          {p.status === "sent" && (
            <Button size="sm" variant="ghost" leadingIcon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => setPendingReceive(p)}>
              Receive
            </Button>
          )}
          {(p.status === "draft" || p.status === "sent") && (
            <Button size="sm" variant="ghost" leadingIcon={<X className="h-3.5 w-3.5" />} onClick={() => advance(p, "cancelled")}>
              Cancel
            </Button>
          )}
          {(p.status === "draft" || p.status === "cancelled") && (
            <Button size="sm" variant="ghost" onClick={() => setPendingDelete(p)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="v2-page">
      <PageHero
        title="Purchase orders"
        subtitle="Raise POs against suppliers. Marking one received auto-credits stock and updates the audit log."
        actions={
          <Button
            variant="primary"
            leadingIcon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setCreating(true)}
            disabled={suppliers.length === 0 || ingredients.length === 0}
            aria-label="New PO"
            title={
              suppliers.length === 0
                ? "Add a supplier first."
                : ingredients.length === 0
                  ? "Add ingredients first."
                  : "New PO"
            }
          />
        }        filter={{
          value: statusFilter,
          onChange: (v) => setStatusFilter(v as StatusFilter),
          ariaLabel: "Status filter",
          options: [
            { value: "all", label: "All", count: counts.all },
            { value: "draft", label: "Draft", count: counts.draft },
            { value: "sent", label: "Sent", count: counts.sent },
            { value: "received", label: "Received", count: counts.received },
            { value: "cancelled", label: "Cancelled", count: counts.cancelled },
          ],
        }}
      />

      {loading ? (
        <div className="v2-page-loading">Loading Purchase orders…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={ClipboardList}
              title={orders.length === 0 ? "No purchase orders yet" : "No matches"}
              description={orders.length === 0 ? "Create a PO to start restocking." : "Try a different status."}
            />
          </CardBody>
        </Card>
      ) : (
        <Card padding="none">
          <Table flush rows={filtered} columns={cols} rowKey={(p) => p.id} defaultSort={{ key: "created", dir: "desc" }} />
        </Card>
      )}

      <POEditor
        open={creating || editing !== null}
        po={editing}
        readOnly={!!editing && editing.status === "received"}
        suppliers={suppliers}
        ingredients={ingredients}
        locationSlug={pageLoc}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={async () => {
          setCreating(false);
          setEditing(null);
          await fetchAll();
          toast.success("Purchase order saved");
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={doDelete}
        title={`Delete PO ${pendingDelete?.id.slice(-6).toUpperCase() ?? ""}?`}
        description="Permanently removes the PO. Stock movements already booked from a received PO are NOT reverted."
        confirmLabel="Delete"
        destructive
      />

      <ConfirmDialog
        open={pendingReceive !== null}
        onClose={() => setPendingReceive(null)}
        onConfirm={doReceive}
        title={`Receive PO ${pendingReceive?.id.slice(-6).toUpperCase() ?? ""}?`}
        description="Each line will be credited to inventory with a receive movement. Reverse manually with waste/adjust if needed."
        confirmLabel="Mark received"
      />
    </div>
  );
}

interface POEditorProps {
  open: boolean;
  po: PORow | null;
  readOnly: boolean;
  suppliers: SupplierLite[];
  ingredients: IngredientLite[];
  locationSlug: string;
  onClose: () => void;
  onSaved: () => void;
}

interface DraftLine extends PurchaseOrderLine {
  _key: string;
}

function POEditor({ open, po, readOnly, suppliers, ingredients, locationSlug, onClose, onSaved }: POEditorProps) {
  const toast = useToast();
  const [supplierId, setSupplierId] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [pickerIngId, setPickerIngId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (po) {
      setSupplierId(po.supplierId);
      setExpectedAt(po.expectedAt ? po.expectedAt.split("T")[0] : "");
      setNotes(po.notes ?? "");
      setLines(
        po.lines.map((l, i) => ({
          _key: `${l.ingredientId}-${i}`,
          ingredientId: l.ingredientId,
          quantity: l.quantity,
          unitCost: l.unitCost,
        })),
      );
    } else {
      setSupplierId(suppliers[0]?.id ?? "");
      setExpectedAt("");
      setNotes("");
      setLines([]);
    }
    setPickerIngId("");
    setBusy(false);
  }, [open, po, suppliers]);

  if (!open) return <Dialog open={false} onClose={onClose} />;

  const ingMap = new Map(ingredients.map((i) => [i.id, i]));
  const total = lines.reduce((acc, l) => acc + Math.round(l.quantity * l.unitCost), 0);
  const availableIngredients = ingredients.filter((i) => !lines.some((l) => l.ingredientId === i.id));

  const addLine = () => {
    if (!pickerIngId) return;
    const ing = ingMap.get(pickerIngId);
    if (!ing) return;
    setLines((arr) => [
      ...arr,
      { _key: `${ing.id}-${Date.now()}`, ingredientId: ing.id, quantity: 1, unitCost: ing.costPerUnit },
    ]);
    setPickerIngId("");
  };

  const updateLine = (key: string, patch: Partial<PurchaseOrderLine>) => {
    setLines((arr) => arr.map((l) => (l._key === key ? { ...l, ...patch } : l)));
  };

  const removeLine = (key: string) => {
    setLines((arr) => arr.filter((l) => l._key !== key));
  };

  const submit = async (status: PurchaseOrderStatus) => {
    if (!supplierId) {
      toast.warning("Pick a supplier");
      return;
    }
    if (lines.length === 0) {
      toast.warning("Add at least one line");
      return;
    }
    setBusy(true);
    try {
      const body = {
        id: po?.id,
        supplierId,
        locationSlug,
        status,
        expectedAt: expectedAt ? new Date(expectedAt).toISOString() : undefined,
        notes: notes.trim() || undefined,
        lines: lines.map((l) => ({
          ingredientId: l.ingredientId,
          quantity: l.quantity,
          unitCost: l.unitCost,
        })),
      };
      const res = await fetch("/api/admin/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) onSaved();
      else toast.error("Could not save PO");
    } finally {
      setBusy(false);
    }
  };

  const title = po ? `PO ${po.id.slice(-6).toUpperCase()}` : "New purchase order";
  const description = po ? `${po.supplierName} · ${STATUS_LABEL[po.status]}` : "Draft a new restock order.";

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {readOnly ? "Close" : "Cancel"}
          </Button>
          {!readOnly && (
            <>
              <Button variant="secondary" onClick={() => submit("draft")} loading={busy}>
                Save draft
              </Button>
              <Button variant="primary" leadingIcon={<Send className="h-3.5 w-3.5" />} onClick={() => submit("sent")} loading={busy}>
                Save & send
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="v2-stack-12">
        <div className="v2-form-row-2">
          <Select
            label="Supplier"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            disabled={readOnly}
            options={suppliers.map((s) => ({
              value: s.id,
              label: s.leadTimeDays !== undefined ? `${s.name} · ${s.leadTimeDays}d lead` : s.name,
            }))}
            placeholder={suppliers.length === 0 ? "No suppliers — add one first" : undefined}
          />
          <Input
            label="Expected delivery"
            type="date"
            value={expectedAt}
            disabled={readOnly}
            onChange={(e) => setExpectedAt(e.target.value)}
          />
        </div>

        <Card padding="none">
          <CardBody>
            {lines.length === 0 ? (
              <div className="v2-muted">No lines yet.</div>
            ) : (
              <ul className="v2-po-lines">
                {lines.map((l) => {
                  const ing = ingMap.get(l.ingredientId);
                  return (
                    <li key={l._key} className="v2-po-line">
                      <span className="v2-po-line-name">{ing?.name ?? l.ingredientId}</span>
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        value={l.quantity}
                        disabled={readOnly}
                        onChange={(e) => updateLine(l._key, { quantity: Number(e.target.value) || 0 })}
                        trailingAdornment={<span className="v2-muted">{ing?.unit ?? ""}</span>}
                        aria-label="Quantity"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={(l.unitCost / 100).toFixed(2)}
                        disabled={readOnly}
                        onChange={(e) => updateLine(l._key, { unitCost: Math.round(parseFloat(e.target.value || "0") * 100) })}
                        trailingAdornment={<span className="v2-muted">zł / {ing?.unit ?? "unit"}</span>}
                        aria-label="Unit cost"
                      />
                      <span className="tabular v2-rcp-cost">{formatPrice(Math.round(l.quantity * l.unitCost))}</span>
                      {!readOnly && (
                        <Button size="sm" variant="ghost" onClick={() => removeLine(l._key)} aria-label="Remove line">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {!readOnly && (
              <div className="v2-rcp-add">
                <Select
                  value={pickerIngId}
                  onChange={(e) => setPickerIngId(e.target.value)}
                  aria-label="Add ingredient line"
                  placeholder="Pick an ingredient…"
                  options={availableIngredients.map((i) => ({
                    value: i.id,
                    label: `${i.name} · ${formatPrice(i.costPerUnit)}/${i.unit}`,
                  }))}
                />
                <Button leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={addLine} disabled={!pickerIngId}>
                  Add line
                </Button>
              </div>
            )}
            <div className="v2-po-total">
              <span className="v2-muted">Total</span>
              <span className="tabular v2-summary-val">{formatPrice(total)}</span>
            </div>
          </CardBody>
        </Card>

        <Textarea label="Notes" rows={3} value={notes} disabled={readOnly} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Dialog>
  );
}
