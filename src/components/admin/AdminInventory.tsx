"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  History,
  PackageMinus,
  PackagePlus,
  Plus,
  Scale,
  Search,
  Trash2,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import {
  type IngredientCategory,
  type IngredientUnit,
  type StockMovementType,
} from "@/data/types";
import { getActiveLocations } from "@/data/locations";
import { useAdminLocation } from "./v2/LocationContext";
import { useToast } from "./v2/ui/Toast";

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  EmptyState,
  Input,
  Select,
  Tabs,
  Table,
  Textarea,
  type Column,
  LocationFilter,
} from "./v2/ui";
import { KpiCard } from "./v2/charts";

interface StockRow {
  ingredientId: string;
  locationSlug: string;
  onHand: number;
  parLevel: number;
  reorderPoint: number;
  lastCountedAt?: string;
  lastCountedBy?: string;
  updatedAt: string;
  // enriched
  name: string;
  unit: IngredientUnit;
  category: IngredientCategory;
  costPerUnit: number;
  supplier?: string;
}

interface IngredientLite {
  id: string;
  name: string;
  category: IngredientCategory;
  unit: IngredientUnit;
  costPerUnit: number;
  supplier?: string;
}

interface Movement {
  id: string;
  ingredientId: string;
  locationSlug: string;
  type: StockMovementType;
  quantity: number;
  reason?: string;
  occurredAt: string;
  byUser?: string;
}

const activeLocations = getActiveLocations();
const FALLBACK_LOC = activeLocations[0]?.slug ?? "krakow";

type StatusFilter = "all" | "ok" | "low" | "out";

const MOVEMENT_TONE: Record<StockMovementType, "success" | "warning" | "info" | "neutral"> = {
  receive: "success",
  waste: "warning",
  consume: "info",
  adjust: "neutral",
};

const MOVEMENT_LABEL: Record<StockMovementType, string> = {
  receive: "Received",
  waste: "Wasted",
  consume: "Consumed",
  adjust: "Adjusted",
};

function classifyStatus(row: StockRow): "ok" | "low" | "out" {
  if (row.onHand <= 0) return "out";
  if (row.onHand <= row.reorderPoint) return "low";
  return "ok";
}

function stockTone(s: "ok" | "low" | "out"): "success" | "warning" | "danger" {
  if (s === "ok") return "success";
  if (s === "low") return "warning";
  return "danger";
}

function fmtTime(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function AdminInventory() {
  return <AdminInventoryDesktop />;
}

function AdminInventoryDesktop() {
  const { location: globalLoc } = useAdminLocation();
  const toast = useToast();
  const [pageLoc, setPageLoc] = useState<string>(globalLoc || FALLBACK_LOC);
  useEffect(() => {
    if (globalLoc) setPageLoc(globalLoc);
  }, [globalLoc]);

  const [stock, setStock] = useState<StockRow[]>([]);
  const [ingredients, setIngredients] = useState<IngredientLite[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [variance, setVariance] = useState<{
    name: string;
    unit: string;
    theoreticalUsage: number;
    actualUsage: number;
    variance: number;
    variancePercent: number;
    varianceCostGrosze: number;
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [movementDialog, setMovementDialog] = useState<{
    row: StockRow | null;
    type: StockMovementType;
  }>({ row: null, type: "receive" });
  const [editDialog, setEditDialog] = useState<StockRow | null>(null);
  const [addDialog, setAddDialog] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, i, m, v] = await Promise.all([
        fetch(`/api/admin/stock?location=${pageLoc}`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/admin/ingredients`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/admin/stock-movements?location=${pageLoc}&limit=50`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/admin/inventory/variance?location=${pageLoc}`).then((r) => (r.ok ? r.json() : null)),
      ]);
      setStock(Array.isArray(s) ? s : []);
      setIngredients(Array.isArray(i) ? i : []);
      setMovements(Array.isArray(m) ? m : []);
      setVariance(v && Array.isArray(v.rows) ? v.rows : []);
    } finally {
      setLoading(false);
    }
  }, [pageLoc]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stock.filter((r) => {
      const status = classifyStatus(r);
      if (statusFilter !== "all" && statusFilter !== status) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        (r.supplier?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [stock, search, statusFilter]);

  const counts = useMemo(() => {
    const c = { all: stock.length, ok: 0, low: 0, out: 0 };
    for (const r of stock) c[classifyStatus(r)]++;
    return c;
  }, [stock]);

  const totalValue = useMemo(
    () => stock.reduce((acc, r) => acc + Math.round(r.onHand * r.costPerUnit), 0),
    [stock],
  );
  const wasteValue7d = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const ingMap = new Map(ingredients.map((i) => [i.id, i]));
    let total = 0;
    for (const m of movements) {
      if (m.type !== "waste") continue;
      if (new Date(m.occurredAt).getTime() < cutoff) continue;
      const ing = ingMap.get(m.ingredientId);
      if (!ing) continue;
      total += Math.abs(m.quantity) * ing.costPerUnit;
    }
    return Math.round(total);
  }, [movements, ingredients]);

  const submitMovement = async (input: {
    ingredientId: string;
    type: StockMovementType;
    quantity: number;
    reason?: string;
  }) => {
    const res = await fetch("/api/admin/stock-movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ingredientId: input.ingredientId,
        locationSlug: pageLoc,
        type: input.type,
        quantity: input.quantity,
        reason: input.reason,
      }),
    });
    if (res.ok) {
      toast.success(`${MOVEMENT_LABEL[input.type]}`, `${input.quantity} units logged.`);
      await fetchAll();
      return true;
    }
    toast.error("Could not log movement");
    return false;
  };

  const upsertStock = async (row: {
    ingredientId: string;
    onHand: number;
    parLevel: number;
    reorderPoint: number;
  }) => {
    const res = await fetch("/api/admin/stock", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ingredientId: row.ingredientId,
        locationSlug: pageLoc,
        onHand: row.onHand,
        parLevel: row.parLevel,
        reorderPoint: row.reorderPoint,
        lastCountedAt: new Date().toISOString(),
        lastCountedBy: "admin",
      }),
    });
    if (res.ok) {
      toast.success("Stock saved");
      await fetchAll();
      return true;
    }
    toast.error("Could not save");
    return false;
  };

  const cols: Column<StockRow>[] = [
    {
      key: "name",
      header: "Ingredient",
      cell: (r) => (
        <div className="v2-cell-stack">
          <span>{r.name}</span>
          <span className="v2-cell-sub">{r.category}{r.supplier ? ` · ${r.supplier}` : ""}</span>
        </div>
      ),
      sortValue: (r) => r.name,
    },
    {
      key: "onHand",
      header: "On hand",
      align: "right",
      cell: (r) => (
        <span className="tabular">
          {r.onHand.toLocaleString()}<span className="v2-muted"> {r.unit}</span>
        </span>
      ),
      sortValue: (r) => r.onHand,
    },
    {
      key: "par",
      header: "Par / Reorder",
      align: "right",
      cell: (r) => (
        <span className="tabular v2-muted">
          {r.parLevel.toLocaleString()} / {r.reorderPoint.toLocaleString()}
        </span>
      ),
      sortValue: (r) => r.reorderPoint,
    },
    {
      key: "value",
      header: "Stock value",
      align: "right",
      cell: (r) => <span className="tabular">{formatPrice(Math.round(r.onHand * r.costPerUnit))}</span>,
      sortValue: (r) => r.onHand * r.costPerUnit,
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => {
        const s = classifyStatus(r);
        return (
          <Badge tone={stockTone(s)} variant="soft" dot>
            {s === "ok" ? "Healthy" : s === "low" ? "Low stock" : "Out of stock"}
          </Badge>
        );
      },
      sortValue: (r) => classifyStatus(r),
    },
    {
      key: "counted",
      header: "Counted",
      cell: (r) => <span className="v2-muted">{r.lastCountedAt ? fmtTime(r.lastCountedAt) : "Never"}</span>,
      sortValue: (r) => r.lastCountedAt ?? "",
    },
    {
      key: "actions",
      header: "",
      cell: (r) => (
        <div className="v2-row-actions">
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<PackagePlus className="h-3.5 w-3.5" />}
            onClick={() => setMovementDialog({ row: r, type: "receive" })}
          >
            Receive
          </Button>
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<PackageMinus className="h-3.5 w-3.5" />}
            onClick={() => setMovementDialog({ row: r, type: "waste" })}
          >
            Waste
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditDialog(r)}>
            Edit
          </Button>
        </div>
      ),
    },
  ];

  const lowStockCount = counts.low + counts.out;

  const ingMap = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const trackedIds = new Set(stock.map((s) => s.ingredientId));
  const untracked = ingredients.filter((i) => !trackedIds.has(i.id));

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Inventory</h1>
          <p className="v2-page-subtitle">
            On-hand stock per location · low-stock alerts · receive / waste / consume log.
          </p>
        </div>
        <div className="v2-page-actions">
          <LocationFilter value={pageLoc} onChange={setPageLoc} />
          <Button
            variant="primary"
            leadingIcon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setAddDialog(true)}
            disabled={untracked.length === 0}
            title={untracked.length === 0 ? "All ingredients are tracked here." : undefined}
          >
            Track ingredient
          </Button>
        </div>
      </header>

      <section className="v2-kpi-grid">
        <KpiCard
          label="Tracked SKUs"
          value={stock.length}
          icon={Boxes}
          tone="info"
        />
        <KpiCard
          label="Stock value"
          value={totalValue / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Scale}
          tone="brand"
          hint={`Across ${stock.length} SKU${stock.length === 1 ? "" : "s"}`}
        />
        <KpiCard
          label="Need reorder"
          value={lowStockCount}
          icon={AlertTriangle}
          tone={lowStockCount > 0 ? "warning" : "success"}
          higherIsBetter={false}
          hint={`${counts.out} out of stock`}
        />
        <KpiCard
          label="Waste (7d)"
          value={wasteValue7d / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Trash2}
          tone="danger"
          higherIsBetter={false}
        />
      </section>

      <VarianceCard rows={variance} />

      <div className="v2-filters">
        <div className="v2-filter-search">
          <Input
            placeholder="Search ingredient, supplier…"
            leadingAdornment={<Search className="h-3.5 w-3.5" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Tabs
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          tabs={[
            { value: "all", label: "All", count: counts.all },
            { value: "ok", label: "Healthy", count: counts.ok },
            { value: "low", label: "Low", count: counts.low },
            { value: "out", label: "Out", count: counts.out },
          ]}
          variant="pill"
          ariaLabel="Status filter"
        />
      </div>

      <div className="v2-grid-2-1">
        {loading ? (
          <div className="v2-page-loading">Loading Stock…</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardBody>
              <EmptyState
                icon={Boxes}
                title={stock.length === 0 ? "No SKUs tracked yet" : "No matches"}
                description={
                  stock.length === 0
                    ? "Start tracking an ingredient to monitor on-hand quantity, par levels, and reorder points."
                    : "Try clearing the filters."
                }
                action={
                  stock.length === 0 ? (
                    <Button variant="primary" onClick={() => setAddDialog(true)}>
                      Track an ingredient
                    </Button>
                  ) : undefined
                }
              />
            </CardBody>
          </Card>
        ) : (
          <Card padding="none">
            <CardBody>
              <Table
                rows={filtered}
                columns={cols}
                rowKey={(r) => r.ingredientId}
                defaultSort={{ key: "status", dir: "asc" }}
              />
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="Recent movements" description="Last 50 events at this location" actions={<History className="h-4 w-4 v2-muted" aria-hidden />} />
          <CardBody>
            {movements.length === 0 ? (
              <EmptyState icon={History} title="No movements yet" description="Receiving, waste, and consume events appear here." compact />
            ) : (
              <ul className="v2-mov-list">
                {movements.slice(0, 20).map((m) => {
                  const ing = ingMap.get(m.ingredientId);
                  const tone = MOVEMENT_TONE[m.type];
                  const Arrow = m.quantity >= 0 ? ArrowUpRight : ArrowDownLeft;
                  return (
                    <li key={m.id} className="v2-mov-row">
                      <span className={`v2-mov-icon v2-mov-tone-${tone}`}>
                        <Arrow className="h-3 w-3" />
                      </span>
                      <div className="v2-mov-text">
                        <div className="v2-mov-title">
                          <span>{MOVEMENT_LABEL[m.type]}</span>
                          <span className="tabular v2-muted">
                            {m.quantity > 0 ? "+" : ""}
                            {m.quantity}
                            {ing && <span> {ing.unit}</span>}
                          </span>
                        </div>
                        <div className="v2-mov-sub">
                          {ing?.name ?? m.ingredientId}
                          {m.reason && <span> · {m.reason}</span>}
                        </div>
                      </div>
                      <span className="v2-mov-time">{fmtTime(m.occurredAt)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <MovementDialog
        state={movementDialog}
        onClose={() => setMovementDialog({ row: null, type: "receive" })}
        onSubmit={async (input) => {
          const ok = await submitMovement(input);
          if (ok) setMovementDialog({ row: null, type: "receive" });
        }}
      />

      <StockEditDialog
        row={editDialog}
        onClose={() => setEditDialog(null)}
        onSubmit={async (row) => {
          const ok = await upsertStock(row);
          if (ok) setEditDialog(null);
        }}
      />

      <AddIngredientDialog
        open={addDialog}
        untracked={untracked}
        onClose={() => setAddDialog(false)}
        onSubmit={async (row) => {
          const ok = await upsertStock(row);
          if (ok) setAddDialog(false);
        }}
      />
    </div>
  );
}

// =============================================================
// Dialogs
// =============================================================

interface MovementDialogProps {
  state: { row: StockRow | null; type: StockMovementType };
  onClose: () => void;
  onSubmit: (input: { ingredientId: string; type: StockMovementType; quantity: number; reason?: string }) => Promise<void> | void;
}

function MovementDialog({ state, onClose, onSubmit }: MovementDialogProps) {
  const [type, setType] = useState<StockMovementType>(state.type);
  const [qtyStr, setQtyStr] = useState("0");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setType(state.type);
    setQtyStr("0");
    setReason("");
    setBusy(false);
  }, [state]);

  if (!state.row) return <Dialog open={false} onClose={onClose} />;
  const row = state.row;

  const submit = async () => {
    const q = Number(qtyStr);
    if (!Number.isFinite(q) || q === 0) return;
    setBusy(true);
    await onSubmit({ ingredientId: row.ingredientId, type, quantity: q, reason: reason || undefined });
    setBusy(false);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={`${MOVEMENT_LABEL[type]} · ${row.name}`}
      description={`Current on-hand: ${row.onHand} ${row.unit} at ${row.locationSlug}.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>Log movement</Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <Select
          label="Movement type"
          value={type}
          onChange={(e) => setType(e.target.value as StockMovementType)}
          options={[
            { value: "receive", label: "Receive (delivery)" },
            { value: "waste", label: "Waste (spoilage / dropped)" },
            { value: "consume", label: "Consume (used in prep)" },
            { value: "adjust", label: "Adjust (stocktake correction)" },
          ]}
        />
        <Input
          label="Quantity"
          type="number"
          step="0.001"
          value={qtyStr}
          onChange={(e) => setQtyStr(e.target.value)}
          trailingAdornment={<span className="v2-muted">{row.unit}</span>}
          description={
            type === "adjust"
              ? "Signed — negative reduces, positive increases."
              : type === "receive"
                ? "Positive number — quantity received."
                : "Positive magnitude — will be subtracted from stock."
          }
        />
        <Textarea
          label="Reason / notes"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. 'received from supplier X' or 'spoilage'"
        />
      </div>
    </Dialog>
  );
}

interface StockEditDialogProps {
  row: StockRow | null;
  onClose: () => void;
  onSubmit: (row: { ingredientId: string; onHand: number; parLevel: number; reorderPoint: number }) => Promise<void> | void;
}

function StockEditDialog({ row, onClose, onSubmit }: StockEditDialogProps) {
  const [onHand, setOnHand] = useState("0");
  const [par, setPar] = useState("0");
  const [reorder, setReorder] = useState("0");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!row) return;
    setOnHand(String(row.onHand));
    setPar(String(row.parLevel));
    setReorder(String(row.reorderPoint));
    setBusy(false);
  }, [row]);

  if (!row) return <Dialog open={false} onClose={onClose} />;

  const submit = async () => {
    setBusy(true);
    await onSubmit({
      ingredientId: row.ingredientId,
      onHand: Number(onHand) || 0,
      parLevel: Number(par) || 0,
      reorderPoint: Number(reorder) || 0,
    });
    setBusy(false);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={`Stocktake · ${row.name}`}
      description={`Last counted ${row.lastCountedAt ? fmtTime(row.lastCountedAt) : "never"}.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>Save</Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <Input
          label="On hand (current count)"
          type="number"
          step="0.001"
          value={onHand}
          onChange={(e) => setOnHand(e.target.value)}
          trailingAdornment={<span className="v2-muted">{row.unit}</span>}
          description="Overrides current quantity directly. Use the Waste/Consume actions for normal day-to-day movement so the audit log captures the cause."
        />
        <div className="v2-form-row-2">
          <Input
            label="Par level"
            type="number"
            min="0"
            step="0.001"
            value={par}
            onChange={(e) => setPar(e.target.value)}
            trailingAdornment={<span className="v2-muted">{row.unit}</span>}
            description="Target full-stock quantity."
          />
          <Input
            label="Reorder point"
            type="number"
            min="0"
            step="0.001"
            value={reorder}
            onChange={(e) => setReorder(e.target.value)}
            trailingAdornment={<span className="v2-muted">{row.unit}</span>}
            description="Alerts fire when on-hand ≤ this."
          />
        </div>
      </div>
    </Dialog>
  );
}

interface AddIngredientDialogProps {
  open: boolean;
  untracked: IngredientLite[];
  onClose: () => void;
  onSubmit: (row: { ingredientId: string; onHand: number; parLevel: number; reorderPoint: number }) => Promise<void> | void;
}

function AddIngredientDialog({ open, untracked, onClose, onSubmit }: AddIngredientDialogProps) {
  const [pick, setPick] = useState("");
  const [onHand, setOnHand] = useState("0");
  const [par, setPar] = useState("0");
  const [reorder, setReorder] = useState("0");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPick(untracked[0]?.id ?? "");
      setOnHand("0");
      setPar("0");
      setReorder("0");
      setBusy(false);
    }
  }, [open, untracked]);

  if (!open) return <Dialog open={false} onClose={onClose} />;

  const submit = async () => {
    if (!pick) return;
    setBusy(true);
    await onSubmit({
      ingredientId: pick,
      onHand: Number(onHand) || 0,
      parLevel: Number(par) || 0,
      reorderPoint: Number(reorder) || 0,
    });
    setBusy(false);
  };

  const ing = untracked.find((i) => i.id === pick);

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="Track ingredient"
      description="Start tracking on-hand stock for an existing ingredient at this location."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!pick}>Start tracking</Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <Select
          label="Ingredient"
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          options={untracked.map((i) => ({ value: i.id, label: `${i.name} · ${formatPrice(i.costPerUnit)}/${i.unit}` }))}
        />
        <Input
          label="On hand right now"
          type="number"
          step="0.001"
          value={onHand}
          onChange={(e) => setOnHand(e.target.value)}
          trailingAdornment={ing && <span className="v2-muted">{ing.unit}</span>}
        />
        <div className="v2-form-row-2">
          <Input
            label="Par level"
            type="number"
            min="0"
            step="0.001"
            value={par}
            onChange={(e) => setPar(e.target.value)}
          />
          <Input
            label="Reorder point"
            type="number"
            min="0"
            step="0.001"
            value={reorder}
            onChange={(e) => setReorder(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}

interface VarianceRow {
  name: string;
  unit: string;
  theoreticalUsage: number;
  actualUsage: number;
  variance: number;
  variancePercent: number;
  varianceCostGrosze: number;
}

/**
 * Variance alert card: theoretical (recipe × sold) vs actual (consume + waste)
 * consumption over the last 7 days. Positive variance ⇒ shrink / theft /
 * over-portioning. We only surface the worst 5 rows and only when there's
 * actually variance to show, so the card stays out of the way when ops
 * are clean.
 */
function VarianceCard({ rows }: { rows: VarianceRow[] }) {
  const flagged = rows.filter((r) => Math.abs(r.variancePercent) >= 5).slice(0, 5);
  if (flagged.length === 0) {
    // Show a quiet "all green" card when we have recipes + sales but no variance
    // worth surfacing. Skip entirely when the dataset is empty.
    if (rows.length === 0) return null;
    return (
      <Card>
        <CardHeader
          title="Inventory variance"
          description="Theoretical (recipe × sold) vs actual (consume + waste) over the last 7 days."
        />
        <CardBody>
          <EmptyState
            icon={Boxes}
            title="No significant variance"
            description={`All ${rows.length} tracked ingredients are within ±5% of theoretical. Recipes and stock movements look consistent.`}
            compact
          />
        </CardBody>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader
        title="Inventory variance — last 7 days"
        description="Theoretical (recipe × sold) vs actual (consume + waste). Positive variance is the canonical shrink / over-portion signal."
      />
      <CardBody>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {flagged.map((r) => {
            const overconsumed = r.variance > 0;
            const tone: "danger" | "warning" | "success" =
              Math.abs(r.variancePercent) > 25
                ? "danger"
                : overconsumed
                  ? "warning"
                  : "success";
            return (
              <li
                key={r.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1.4fr) 1fr 1fr auto",
                  gap: "0.75rem",
                  alignItems: "center",
                  padding: "0.5rem 0",
                  borderTop: "1px solid var(--border)",
                  fontSize: "0.875rem",
                }}
              >
                <span style={{ fontWeight: 500 }}>{r.name}</span>
                <span className="v2-muted">
                  theory {r.theoreticalUsage}
                  {r.unit}
                </span>
                <span className="v2-muted">
                  actual {r.actualUsage}
                  {r.unit}
                </span>
                <Badge tone={tone} variant="soft">
                  {overconsumed ? "+" : ""}
                  {r.variancePercent}% · {(r.varianceCostGrosze / 100).toLocaleString("pl-PL", { signDisplay: "exceptZero" })} zł
                </Badge>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}
