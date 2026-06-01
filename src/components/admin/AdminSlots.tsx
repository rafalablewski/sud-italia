"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarPlus,
  Clock,
  Gauge,
  Package,
  Plus,
  RefreshCw,
  Trash2,
  Truck,
  Utensils,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { getActiveLocations } from "@/data/locations";
import type { DemandBoard, DemandTier, DemandAction } from "@/lib/demand-exchange";
import { useAdminLocation } from "./v2/LocationContext";
import { useToast } from "./v2/ui/Toast";

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  DatePager,
  Dialog,
  EmptyState,
  Input,
  Select,
  Table,
  Tabs,
  LocationFilter,
  type Column,
} from "./v2/ui";

interface SlotOrder {
  id: string;
  customerName: string;
  customerPhone: string;
  totalAmount: number;
  fulfillmentType: string;
  status: string;
  itemCount: number;
  createdAt: string;
}

interface SlotData {
  id: string;
  locationSlug: string;
  date: string;
  time: string;
  maxOrders: number;
  currentOrders: number;
  fulfillmentTypes: string[];
  status: "draft" | "active";
  orders?: SlotOrder[];
}

const activeLocations = getActiveLocations();
const FALLBACK_LOC = activeLocations[0]?.slug ?? "krakow";

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

function weekRangeFor(date: string): string[] {
  // 7 days starting from `date`
  return Array.from({ length: 7 }, (_, i) => addDays(date, i));
}

function utilization(s: SlotData): number {
  if (s.maxOrders <= 0) return 0;
  return Math.min(100, Math.round((s.currentOrders / s.maxOrders) * 100));
}

function utilTone(u: number): "success" | "info" | "warning" | "danger" {
  if (u >= 100) return "danger";
  if (u >= 80) return "warning";
  if (u >= 30) return "info";
  return "success";
}

type View = "day" | "week" | "demand";

export function AdminSlots() {
  return <AdminSlotsDesktop />;
}

function AdminSlotsDesktop() {
  const { location: globalLoc } = useAdminLocation();
  const toast = useToast();
  const [pageLoc, setPageLoc] = useState<string>(globalLoc || FALLBACK_LOC);
  useEffect(() => {
    if (globalLoc) setPageLoc(globalLoc);
  }, [globalLoc]);

  const [date, setDate] = useState<string>(() => isoDate(new Date()));
  const [view, setView] = useState<View>("day");
  const [slots, setSlots] = useState<SlotData[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [bulkCreating, setBulkCreating] = useState(false);
  const [editing, setEditing] = useState<SlotData | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SlotData | null>(null);
  const [demand, setDemand] = useState<DemandBoard | null>(null);
  const [demandLoading, setDemandLoading] = useState(false);
  const [applyingSlot, setApplyingSlot] = useState<string | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);
  const [confirmApplyAll, setConfirmApplyAll] = useState(false);

  const fetchDemand = useCallback(async () => {
    setDemandLoading(true);
    try {
      const res = await fetch(`/api/admin/demand-exchange?location=${pageLoc}&date=${date}`);
      const j = res.ok ? await res.json() : null;
      setDemand((j?.board as DemandBoard) ?? null);
    } finally {
      setDemandLoading(false);
    }
  }, [pageLoc, date]);

  useEffect(() => {
    if (view === "demand") void fetchDemand();
  }, [view, fetchDemand]);

  const applyResize = async (slotId: string, maxOrders: number) => {
    setApplyingSlot(slotId);
    try {
      const res = await fetch(`/api/admin/demand-exchange?location=${pageLoc}&date=${date}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId, maxOrders }),
      });
      if (res.ok) {
        toast.success("Capacity resized", `→ ${maxOrders} orders`);
        await Promise.all([fetchDemand(), fetchSlots()]);
      } else {
        toast.error("Could not resize slot");
      }
    } finally {
      setApplyingSlot(null);
    }
  };

  const applyAllResizes = async () => {
    setApplyingAll(true);
    try {
      const res = await fetch(`/api/admin/demand-exchange?location=${pageLoc}&date=${date}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "apply-all" }),
      });
      if (res.ok) {
        const j = (await res.json()) as { applied: number };
        toast.success("Capacities applied", `${j.applied} slot(s) resized to demand`);
        await Promise.all([fetchDemand(), fetchSlots()]);
      } else {
        toast.error("Could not apply capacities");
      }
    } finally {
      setApplyingAll(false);
      setConfirmApplyAll(false);
    }
  };

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
      let url: string;
      if (view === "day") {
        url = `/api/admin/slots?location=${pageLoc}&date=${date}&includeOrders=true`;
      } else {
        url = `/api/admin/slots?location=${pageLoc}&includeOrders=true`;
      }
      const res = await fetch(url);
      if (!res.ok) return;
      const data: SlotData[] = await res.json();
      if (view === "week") {
        const range = new Set(weekRangeFor(date));
        setSlots(data.filter((s) => range.has(s.date)));
      } else {
        setSlots(data);
      }
    } finally {
      setLoading(false);
    }
  }, [pageLoc, date, view]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  // --- Mutations ---
  const persistSlot = async (slot: Partial<SlotData> & { id: string }) => {
    const res = await fetch("/api/admin/slots", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slot.id, updates: slot }),
    });
    return res.ok;
  };

  const toggleSlotActive = async (s: SlotData) => {
    const next: SlotData["status"] = s.status === "active" ? "draft" : "active";
    const optimistic: SlotData[] = slots.map((x) => (x.id === s.id ? { ...x, status: next } : x));
    setSlots(optimistic);
    const ok = await persistSlot({ id: s.id, status: next });
    if (!ok) {
      setSlots(slots);
      toast.error("Could not toggle status");
    } else {
      toast.success(next === "active" ? "Slot activated" : "Slot drafted");
    }
  };

  const submitCreate = async (input: {
    time: string;
    maxOrders: number;
    fulfillmentTypes: string[];
    status: "draft" | "active";
  }) => {
    const res = await fetch("/api/admin/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationSlug: pageLoc,
        date,
        time: input.time,
        maxOrders: input.maxOrders,
        fulfillmentTypes: input.fulfillmentTypes,
        status: input.status,
      }),
    });
    if (res.ok) {
      toast.success("Slot created");
      await fetchSlots();
      return true;
    }
    const data = await res.json().catch(() => ({}));
    toast.error("Could not create slot", (data as { error?: string }).error);
    return false;
  };

  const submitBulk = async (input: {
    fromDate: string;
    toDate: string;
    times: string[];
    maxOrders: number;
    fulfillmentTypes: string[];
    status: "draft" | "active";
  }) => {
    const res = await fetch("/api/admin/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationSlug: pageLoc,
        maxOrders: input.maxOrders,
        fulfillmentTypes: input.fulfillmentTypes,
        status: input.status,
        bulk: { fromDate: input.fromDate, toDate: input.toDate, times: input.times },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      toast.success("Slots created", `${Array.isArray(data) ? data.length : 0} new`);
      await fetchSlots();
      return true;
    }
    toast.error("Bulk create failed");
    return false;
  };

  const submitEdit = async (input: {
    maxOrders: number;
    fulfillmentTypes: string[];
    status: "draft" | "active";
  }) => {
    if (!editing) return false;
    const ok = await persistSlot({
      id: editing.id,
      maxOrders: input.maxOrders,
      fulfillmentTypes: input.fulfillmentTypes,
      status: input.status,
    });
    if (ok) {
      toast.success("Slot updated");
      await fetchSlots();
    } else {
      toast.error("Could not save");
    }
    return ok;
  };

  const doDelete = async () => {
    if (!pendingDelete) return;
    const res = await fetch(`/api/admin/slots?id=${encodeURIComponent(pendingDelete.id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setSlots((arr) => arr.filter((s) => s.id !== pendingDelete.id));
      toast.success("Slot deleted");
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error("Could not delete", (data as { error?: string }).error);
    }
    setPendingDelete(null);
  };

  // --- Derived ---
  const dayMetrics = useMemo(() => {
    const list = view === "day" ? slots : slots.filter((s) => s.date === date);
    const cap = list.reduce((acc, s) => acc + s.maxOrders, 0);
    const used = list.reduce((acc, s) => acc + s.currentOrders, 0);
    const orderTotal = list.reduce((acc, s) => acc + (s.orders?.reduce((a, o) => a + o.totalAmount, 0) ?? 0), 0);
    return { slots: list.length, capacity: cap, used, util: cap > 0 ? Math.round((used / cap) * 100) : 0, revenue: orderTotal };
  }, [slots, view, date]);

  const slotsByDate = useMemo(() => {
    const m = new Map<string, SlotData[]>();
    for (const s of slots) {
      const arr = m.get(s.date) || [];
      arr.push(s);
      m.set(s.date, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.time.localeCompare(b.time));
    return m;
  }, [slots]);

  const weekDates = view === "week" ? weekRangeFor(date) : [date];

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Time slots</h1>
          <p className="v2-page-subtitle">
            Cap pickup capacity per location and time window. Active slots accept new orders, draft slots hide them from the customer site.
          </p>
        </div>
        <div className="v2-page-actions">
          <Tabs
            value={view}
            onChange={(v) => setView(v as View)}
            tabs={[
              { value: "day", label: "Day" },
              { value: "week", label: "Week" },
              { value: "demand", label: "Demand" },
            ]}
            variant="pill"
            ariaLabel="View"
          />
          <Button variant="secondary" leadingIcon={<CalendarPlus className="h-3.5 w-3.5" />} onClick={() => setBulkCreating(true)}>
            Bulk create
          </Button>
          <Button variant="primary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreating(true)}>
            New slot
          </Button>
        </div>
      </header>

      <div className="v2-filters">
        <LocationFilter value={pageLoc} onChange={setPageLoc} />
        <DatePager unit={view === "week" ? "week" : "day"} value={date} onChange={setDate} />
        <Button size="sm" variant="secondary" leadingIcon={<RefreshCw className={`h-3.5 w-3.5 ${loading || demandLoading ? "v2-spin" : ""}`} />} onClick={view === "demand" ? fetchDemand : fetchSlots}>Refresh</Button>
      </div>

      {view === "demand" ? (
        <DemandView
          board={demand}
          loading={demandLoading}
          applyingSlot={applyingSlot}
          applyingAll={applyingAll}
          onApply={(r) => applyResize(r.slotId, r.recommendedMaxOrders)}
          onApplyAll={() => setConfirmApplyAll(true)}
        />
      ) : (
        <>
      <section className="v2-kpi-grid">
        <SlotKpi label="Slots" value={dayMetrics.slots} />
        <SlotKpi label="Capacity (orders)" value={dayMetrics.capacity} />
        <SlotKpi label="Booked" value={dayMetrics.used} hint={`${dayMetrics.util}% utilization`} tone={utilTone(dayMetrics.util)} />
        <SlotKpi label="Slot revenue" valueFormatted={formatPrice(dayMetrics.revenue)} />
      </section>

      {loading ? (
        <div className="v2-page-loading">Loading Slots…</div>
      ) : slots.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={Clock}
              title="No slots for this period"
              description="Create slots manually with the New slot button, or use Bulk create to seed a week at once."
              action={
                <Button variant="primary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreating(true)}>
                  New slot
                </Button>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <div className="v2-slots-stack">
          {weekDates.map((d) => {
            const list = slotsByDate.get(d) ?? [];
            const cap = list.reduce((acc, s) => acc + s.maxOrders, 0);
            const used = list.reduce((acc, s) => acc + s.currentOrders, 0);
            const util = cap > 0 ? Math.round((used / cap) * 100) : 0;
            return (
              <Card key={d} padding="none">
                <CardHeader
                  title={new Date(d).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                  description={list.length === 0 ? "No slots yet" : `${list.length} slots · ${used}/${cap} booked`}
                  actions={list.length > 0 && <Badge tone={utilTone(util)} variant="soft" dot>{util}%</Badge>}
                />
                <CardBody>
                  {list.length === 0 ? (
                    <div className="v2-muted">No slots configured. Use "New slot" to add one.</div>
                  ) : (
                    <div className="v2-slot-grid">
                      {list.map((s) => {
                        const u = utilization(s);
                        return (
                          <button key={s.id} type="button" onClick={() => setEditing(s)} className="v2-slot-card">
                            <div className="v2-slot-card-top">
                              <span className="v2-slot-time mono">{s.time}</span>
                              <Badge tone={s.status === "active" ? "success" : "warning"} variant="soft" dot>
                                {s.status}
                              </Badge>
                            </div>
                            <div className="v2-slot-meter" aria-hidden>
                              <div className={`v2-slot-meter-bar v2-slot-meter-${utilTone(u)}`} style={{ width: `${Math.min(100, u)}%` }} />
                            </div>
                            <div className="v2-slot-card-foot">
                              <span className="tabular">{s.currentOrders}/{s.maxOrders}</span>
                              <span className="v2-slot-channels">
                                {s.fulfillmentTypes.includes("takeout") && <Package className="h-3 w-3" />}
                                {s.fulfillmentTypes.includes("delivery") && <Truck className="h-3 w-3" />}
                                {s.fulfillmentTypes.includes("dine-in") && <Utensils className="h-3 w-3" />}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
        </>
      )}

      <SlotDialog
        open={creating}
        mode="create"
        onClose={() => setCreating(false)}
        onSubmit={async (input) => {
          const ok = await submitCreate(input);
          if (ok) setCreating(false);
        }}
      />
      <BulkSlotDialog
        open={bulkCreating}
        defaultFromDate={date}
        onClose={() => setBulkCreating(false)}
        onSubmit={async (input) => {
          const ok = await submitBulk(input);
          if (ok) setBulkCreating(false);
        }}
      />
      <SlotDialog
        open={editing !== null}
        mode="edit"
        slot={editing}
        onClose={() => setEditing(null)}
        onToggle={editing ? () => toggleSlotActive(editing) : undefined}
        onDelete={editing ? () => setPendingDelete(editing) : undefined}
        onSubmit={async (input) => {
          const ok = await submitEdit(input);
          if (ok) setEditing(null);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={doDelete}
        title={`Delete ${pendingDelete?.time ?? ""} slot?`}
        description={
          pendingDelete && pendingDelete.currentOrders > 0
            ? `This slot has ${pendingDelete.currentOrders} active orders. Move them to another slot first.`
            : "Removes the slot from the schedule. Orders aren't affected."
        }
        confirmLabel="Delete slot"
        destructive
      />

      <ConfirmDialog
        open={confirmApplyAll}
        onClose={() => setConfirmApplyAll(false)}
        onConfirm={applyAllResizes}
        title="Apply all recommended capacities?"
        description={`Resizes ${
          demand?.slots.filter((s) => s.recommendedMaxOrders !== s.maxOrders).length ?? 0
        } slot(s) to the demand-matched capacity (never below what's already booked). You can still edit any slot afterwards.`}
        confirmLabel="Apply all"
      />
    </div>
  );
}

function SlotKpi({
  label,
  value,
  valueFormatted,
  hint,
  tone,
}: {
  label: string;
  value?: number;
  valueFormatted?: string;
  hint?: string;
  tone?: "success" | "info" | "warning" | "danger";
}) {
  return (
    <div className="v2-kpi">
      <div className="v2-kpi-top">
        <div className="v2-kpi-label">{label}</div>
      </div>
      <div className="v2-kpi-value-row">
        <span className="v2-kpi-value tabular">{valueFormatted ?? (value ?? 0).toLocaleString("pl-PL")}</span>
      </div>
      <div className="v2-kpi-foot">
        {hint && (
          <span className={`v2-kpi-delta v2-kpi-delta-${tone === "danger" || tone === "warning" ? "down" : "up"}`}>
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}

// =============================================================
// Demand Exchange view
// =============================================================

const TIER_TONE: Record<DemandTier, "success" | "info" | "warning" | "danger"> = {
  under: "info",
  healthy: "success",
  tight: "warning",
  over: "danger",
  "kitchen-capped": "danger",
};
const TIER_LABEL: Record<DemandTier, string> = {
  under: "Under-demand",
  healthy: "Healthy",
  tight: "Tight",
  over: "Over-demand",
  "kitchen-capped": "Kitchen-capped",
};
const ACTION_TONE: Record<DemandAction, "success" | "info" | "warning" | "danger"> = {
  raise: "info",
  trim: "warning",
  protect: "danger",
  hold: "success",
};
const ACTION_LABEL: Record<DemandAction, string> = {
  raise: "Raise capacity",
  trim: "Trim / promote",
  protect: "Protect kitchen",
  hold: "Hold",
};

type DemandRow = DemandBoard["slots"][number];

function DemandView({
  board,
  loading,
  applyingSlot,
  applyingAll,
  onApply,
  onApplyAll,
}: {
  board: DemandBoard | null;
  loading: boolean;
  applyingSlot: string | null;
  applyingAll: boolean;
  onApply: (r: DemandRow) => void;
  onApplyAll: () => void;
}) {
  if (loading) return <div className="v2-page-loading">Forecasting demand…</div>;
  if (!board || board.slots.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState
            icon={Gauge}
            title="No demand to forecast"
            description="No slots on this date. Create slots, then the Demand view forecasts covers vs capacity from real same-weekday order history."
          />
        </CardBody>
      </Card>
    );
  }
  const s = board.summary;
  const cols: Column<DemandRow>[] = [
    {
      key: "time",
      header: "Slot",
      cell: (r) => <span className="mono">{r.time}</span>,
      sortValue: (r) => r.time,
    },
    {
      key: "tier",
      header: "Demand",
      cell: (r) => (
        <Badge tone={TIER_TONE[r.tier]} variant="soft" dot>
          {TIER_LABEL[r.tier]}
        </Badge>
      ),
      sortValue: (r) => r.predictedDemand,
    },
    {
      key: "fig",
      header: "Forecast / capacity",
      cell: (r) => (
        <span className="tabular">
          ~{r.predictedDemand} / {r.maxOrders}
          {r.throughputCapacity != null && <span className="v2-muted"> · kitchen {r.throughputCapacity}</span>}
        </span>
      ),
      sortValue: (r) => r.advertisedUtil,
    },
    {
      key: "missed",
      header: "Walked",
      align: "right",
      cell: (r) => (r.missedDemand > 0 ? <Badge tone="danger" variant="soft">{r.missedDemand}</Badge> : <span className="v2-muted">—</span>),
      sortValue: (r) => r.missedDemand,
    },
    {
      key: "action",
      header: "Recommendation",
      cell: (r) => {
        const changed = r.recommendedMaxOrders !== r.maxOrders;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Badge tone={ACTION_TONE[r.action]} variant="soft">
              {ACTION_LABEL[r.action]}
              {changed && ` → ${r.recommendedMaxOrders}`}
            </Badge>
            {changed && (
              <Button
                size="sm"
                variant="secondary"
                loading={applyingSlot === r.slotId}
                disabled={applyingAll}
                onClick={() => onApply(r)}
              >
                Apply
              </Button>
            )}
          </div>
        );
      },
    },
  ];
  const actionable = board.slots.filter((r) => r.action !== "hold");
  const changeCount = board.slots.filter((r) => r.recommendedMaxOrders !== r.maxOrders).length;
  return (
    <>
      <section className="v2-kpi-grid">
        <SlotKpi
          label="Predicted covers"
          value={Math.round(s.predictedCovers)}
          hint={`${s.fillForecastPct}% of capacity`}
          tone={s.fillForecastPct > 90 ? "warning" : "info"}
        />
        <SlotKpi label="Advertised capacity" value={s.advertisedCapacity} />
        <SlotKpi
          label="Kitchen ceiling"
          valueFormatted={board.kitchenCoversPerHour != null ? `${board.kitchenCoversPerHour}/hr` : "—"}
          hint={board.kitchenCoversPerHour != null ? "demonstrated peak" : "not enough history"}
        />
        <SlotKpi
          label="Missed demand"
          value={s.missedDemand}
          hint={s.missedDemand > 0 ? "guests who walked" : "none logged"}
          tone={s.missedDemand > 0 ? "danger" : "success"}
        />
      </section>
      <Card padding="none">
        <CardHeader
          title="Per-slot yield"
          description={`Demand forecast from same-weekday history vs the kitchen's demonstrated ceiling — ${s.overCount} over · ${s.underCount} under · ${s.kitchenCappedCount} kitchen-capped.`}
          actions={
            changeCount > 0 && (
              <Button size="sm" variant="primary" loading={applyingAll} onClick={onApplyAll}>
                Apply all ({changeCount})
              </Button>
            )
          }
        />
        <CardBody>
          <Table rows={board.slots} columns={cols} rowKey={(r) => r.slotId} defaultSort={{ key: "time", dir: "asc" }} />
          {actionable.length > 0 && (
            <ul className="v2-stack-12" style={{ marginTop: 14, listStyle: "none", padding: 0 }}>
              {actionable.slice(0, 8).map((r) => (
                <li key={r.slotId} style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                  <span className="mono">{r.time}</span> <span className="v2-muted">{r.note}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}

// =============================================================
// Dialog
// =============================================================

interface SlotDialogProps {
  open: boolean;
  mode: "create" | "edit";
  slot?: SlotData | null;
  onClose: () => void;
  onSubmit: (input: { time: string; maxOrders: number; fulfillmentTypes: string[]; status: "draft" | "active" }) => Promise<void> | void;
  onToggle?: () => void;
  onDelete?: () => void;
}

function SlotDialog({ open, mode, slot, onClose, onSubmit, onToggle, onDelete }: SlotDialogProps) {
  const [time, setTime] = useState("");
  const [maxOrders, setMaxOrders] = useState("10");
  const [fulfillmentTypes, setFulfillmentTypes] = useState<string[]>(["takeout"]);
  const [status, setStatus] = useState<"draft" | "active">("active");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && slot) {
      setTime(slot.time);
      setMaxOrders(String(slot.maxOrders));
      setFulfillmentTypes(slot.fulfillmentTypes);
      setStatus(slot.status);
    } else {
      setTime("12:00");
      setMaxOrders("10");
      setFulfillmentTypes(["takeout"]);
      setStatus("active");
    }
    setBusy(false);
  }, [open, mode, slot]);

  if (!open) return <Dialog open={false} onClose={onClose} />;

  const toggleType = (t: string) => {
    setFulfillmentTypes((arr) =>
      arr.includes(t) ? arr.filter((x) => x !== t) : [...arr, t],
    );
  };

  const submit = async () => {
    setBusy(true);
    await onSubmit({
      time,
      maxOrders: Math.max(1, Number(maxOrders) || 1),
      fulfillmentTypes: fulfillmentTypes.length > 0 ? fulfillmentTypes : ["takeout"],
      status,
    });
    setBusy(false);
  };

  const orders = slot?.orders ?? [];

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={mode === "create" ? "New time slot" : `Edit slot · ${slot?.time}`}
      description={mode === "edit" && slot ? `${slot.currentOrders}/${slot.maxOrders} orders booked` : undefined}
      footer={
        <>
          {mode === "edit" && onDelete && (
            <Button variant="ghost" leadingIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={onDelete}>
              Delete
            </Button>
          )}
          {mode === "edit" && onToggle && (
            <Button variant="ghost" onClick={onToggle}>
              {slot?.status === "active" ? "Set draft" : "Activate"}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>{mode === "create" ? "Create slot" : "Save"}</Button>
        </>
      }
    >
      <div className="v2-stack-12">
        {mode === "create" && (
          <Input label="Time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        )}
        <Input
          label="Capacity (max orders)"
          type="number"
          min="1"
          value={maxOrders}
          onChange={(e) => setMaxOrders(e.target.value)}
        />
        <div className="v2-field">
          <label className="v2-field-label">Fulfillment types</label>
          <div className="v2-toggle-row">
            <label className="v2-toggle">
              <input
                type="checkbox"
                checked={fulfillmentTypes.includes("takeout")}
                onChange={() => toggleType("takeout")}
              />
              <span>Takeout</span>
            </label>
            <label className="v2-toggle">
              <input
                type="checkbox"
                checked={fulfillmentTypes.includes("delivery")}
                onChange={() => toggleType("delivery")}
              />
              <span>Delivery</span>
            </label>
            <label className="v2-toggle">
              <input
                type="checkbox"
                checked={fulfillmentTypes.includes("dine-in")}
                onChange={() => toggleType("dine-in")}
              />
              <span>Dine-in</span>
            </label>
          </div>
        </div>
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as "draft" | "active")}
          options={[
            { value: "active", label: "Active — accepts orders" },
            { value: "draft", label: "Draft — hidden from customers" },
          ]}
        />
        {mode === "edit" && orders.length > 0 && (
          <Card padding="none">
            <CardHeader title="Orders in this slot" description={`${orders.length} order${orders.length === 1 ? "" : "s"}`} />
            <CardBody>
              <ul className="v2-slot-orders">
                {orders.map((o) => (
                  <li key={o.id}>
                    <span className="mono">{o.id.slice(-6).toUpperCase()}</span>
                    <span>{o.customerName || "Guest"}</span>
                    <span className="v2-muted">{o.itemCount} items</span>
                    <span className="mono tabular">{formatPrice(o.totalAmount)}</span>
                    <Badge tone="neutral" variant="soft">{o.status}</Badge>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </div>
    </Dialog>
  );
}

interface BulkProps {
  open: boolean;
  defaultFromDate: string;
  onClose: () => void;
  onSubmit: (input: {
    fromDate: string;
    toDate: string;
    times: string[];
    maxOrders: number;
    fulfillmentTypes: string[];
    status: "draft" | "active";
  }) => Promise<void> | void;
}

function BulkSlotDialog({ open, defaultFromDate, onClose, onSubmit }: BulkProps) {
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(addDays(defaultFromDate, 6));
  const [timesStr, setTimesStr] = useState("11:00, 12:00, 13:00, 18:00, 19:00, 20:00");
  const [maxOrders, setMaxOrders] = useState("10");
  const [fulfillmentTypes, setFulfillmentTypes] = useState<string[]>(["takeout"]);
  const [status, setStatus] = useState<"draft" | "active">("active");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setFromDate(defaultFromDate);
      setToDate(addDays(defaultFromDate, 6));
      setBusy(false);
    }
  }, [open, defaultFromDate]);

  if (!open) return <Dialog open={false} onClose={onClose} />;

  const toggleType = (t: string) => {
    setFulfillmentTypes((arr) =>
      arr.includes(t) ? arr.filter((x) => x !== t) : [...arr, t],
    );
  };

  const submit = async () => {
    const times = timesStr.split(",").map((t) => t.trim()).filter((t) => /^\d{2}:\d{2}$/.test(t));
    if (times.length === 0) return;
    setBusy(true);
    await onSubmit({
      fromDate,
      toDate,
      times,
      maxOrders: Math.max(1, Number(maxOrders) || 1),
      fulfillmentTypes: fulfillmentTypes.length > 0 ? fulfillmentTypes : ["takeout"],
      status,
    });
    setBusy(false);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title="Bulk create slots"
      description="Create the same set of slots across a date range. Existing slots aren't touched."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>Create slots</Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <div className="v2-form-row-2">
          <Input label="From" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <Input label="To" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <Input
          label="Times (comma-separated, HH:MM)"
          value={timesStr}
          onChange={(e) => setTimesStr(e.target.value)}
          description="Each time creates one slot per date in the range."
        />
        <Input label="Capacity per slot" type="number" min="1" value={maxOrders} onChange={(e) => setMaxOrders(e.target.value)} />
        <div className="v2-field">
          <label className="v2-field-label">Fulfillment types</label>
          <div className="v2-toggle-row">
            <label className="v2-toggle">
              <input type="checkbox" checked={fulfillmentTypes.includes("takeout")} onChange={() => toggleType("takeout")} />
              <span>Takeout</span>
            </label>
            <label className="v2-toggle">
              <input type="checkbox" checked={fulfillmentTypes.includes("delivery")} onChange={() => toggleType("delivery")} />
              <span>Delivery</span>
            </label>
            <label className="v2-toggle">
              <input type="checkbox" checked={fulfillmentTypes.includes("dine-in")} onChange={() => toggleType("dine-in")} />
              <span>Dine-in</span>
            </label>
          </div>
        </div>
        <Select
          label="Initial status"
          value={status}
          onChange={(e) => setStatus(e.target.value as "draft" | "active")}
          options={[
            { value: "active", label: "Active" },
            { value: "draft", label: "Draft" },
          ]}
        />
      </div>
    </Dialog>
  );
}
