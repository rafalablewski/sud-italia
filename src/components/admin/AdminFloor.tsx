"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Armchair, CalendarClock, Gauge, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import type {
  FloorTable,
  Reservation,
  ReservationStatus,
  TableStatus,
} from "@/data/types";
import { recommendSeating, type FloorTwin } from "@/lib/floor-twin";
import { useAdminLocation } from "./v2/LocationContext";
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
  Textarea,
  useToast,
  type BadgeTone,
  type Column,
  LocationFilter,
} from "./v2/ui";

type View = "tables" | "reservations" | "twin";

/** Live kitchen-load summary from the pace engine, for bottleneck pre-emption. */
interface KitchenLoad {
  tier: "calm" | "warn" | "risk";
  station: string | null;
  label: string | null;
  util: number;
}

interface ConflictHit {
  id: string;
  customerName: string;
  time: string;
  durationMin: number;
}

const TABLE_STATUS_TONE: Record<TableStatus, BadgeTone> = {
  available: "success",
  seated: "info",
  reserved: "warning",
  "out-of-service": "neutral",
};

const TABLE_STATUS_LABEL: Record<TableStatus, string> = {
  available: "Available",
  seated: "Seated",
  reserved: "Reserved",
  "out-of-service": "Out of service",
};

const RESERVATION_STATUS_TONE: Record<ReservationStatus, BadgeTone> = {
  booked: "info",
  seated: "success",
  completed: "neutral",
  cancelled: "danger",
  "no-show": "warning",
};

const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  booked: "Booked",
  seated: "Seated",
  completed: "Completed",
  cancelled: "Cancelled",
  "no-show": "No-show",
};

const TABLE_STATUS_OPTIONS = (Object.keys(TABLE_STATUS_LABEL) as TableStatus[]).map((s) => ({
  value: s,
  label: TABLE_STATUS_LABEL[s],
}));

const RESERVATION_STATUS_OPTIONS = (Object.keys(RESERVATION_STATUS_LABEL) as ReservationStatus[]).map(
  (s) => ({ value: s, label: RESERVATION_STATUS_LABEL[s] }),
);

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function AdminFloor() {
  const { location: globalLoc, activeLocations } = useAdminLocation();
  const toast = useToast();

  const fallbackLoc = activeLocations[0]?.slug ?? "krakow";
  const [pageLoc, setPageLoc] = useState<string>(globalLoc || fallbackLoc);
  useEffect(() => {
    if (globalLoc) setPageLoc(globalLoc);
  }, [globalLoc]);

  const [view, setView] = useState<View>("tables");
  const [date, setDate] = useState<string>(() => isoDate(new Date()));

  const [tables, setTables] = useState<FloorTable[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [loadingReservations, setLoadingReservations] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The live Floor Twin loads lazily when its tab opens (it scans orders).
  const [twin, setTwin] = useState<FloorTwin | null>(null);
  const [kitchen, setKitchen] = useState<KitchenLoad | null>(null);
  const [twinLoading, setTwinLoading] = useState(false);
  const [actingTable, setActingTable] = useState<string | null>(null);
  const fetchTwin = useCallback(async () => {
    setTwinLoading(true);
    try {
      const res = await fetch(`/api/admin/floor-twin?location=${encodeURIComponent(pageLoc)}`);
      const j = res.ok ? await res.json() : null;
      setTwin((j?.twin as FloorTwin) ?? null);
      setKitchen((j?.kitchen as KitchenLoad) ?? null);
    } finally {
      setTwinLoading(false);
    }
  }, [pageLoc]);

  useEffect(() => {
    if (view === "twin") void fetchTwin();
  }, [view, fetchTwin]);

  const seatClear = async (tableId: string, action: "seat" | "clear") => {
    setActingTable(tableId);
    try {
      const res = await fetch(`/api/admin/floor-twin?location=${encodeURIComponent(pageLoc)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, tableId }),
      });
      if (res.ok) {
        toast.success(action === "seat" ? "Table seated" : "Table cleared");
        await fetchTwin();
      } else {
        toast.error("Could not update table");
      }
    } finally {
      setActingTable(null);
    }
  };

  const [tableDialog, setTableDialog] = useState<{ open: boolean; table: FloorTable | null }>({
    open: false,
    table: null,
  });
  const [pendingTableDelete, setPendingTableDelete] = useState<FloorTable | null>(null);

  const [reservationDialog, setReservationDialog] = useState<{
    open: boolean;
    reservation: Reservation | null;
  }>({ open: false, reservation: null });
  const [pendingReservationDelete, setPendingReservationDelete] = useState<Reservation | null>(null);

  const locName = activeLocations.find((l) => l.slug === pageLoc)?.city ?? pageLoc;

  const fetchTables = useCallback(async () => {
    setLoadingTables(true);
    try {
      const res = await fetch(`/api/admin/floor/tables?location=${encodeURIComponent(pageLoc)}`);
      if (!res.ok) {
        setError("Could not load tables");
        return;
      }
      const data: FloorTable[] = await res.json();
      setTables(Array.isArray(data) ? data : []);
      setError(null);
    } catch {
      setError("Could not load tables");
    } finally {
      setLoadingTables(false);
    }
  }, [pageLoc]);

  const fetchReservations = useCallback(async () => {
    setLoadingReservations(true);
    try {
      const res = await fetch(
        `/api/admin/floor/reservations?location=${encodeURIComponent(pageLoc)}&date=${date}`,
      );
      if (!res.ok) {
        setError("Could not load reservations");
        return;
      }
      const data: Reservation[] = await res.json();
      setReservations(Array.isArray(data) ? data : []);
      setError(null);
    } catch {
      setError("Could not load reservations");
    } finally {
      setLoadingReservations(false);
    }
  }, [pageLoc, date]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  useEffect(() => {
    fetchReservations();
  }, [fetchReservations]);

  // --- Table mutations ---
  const saveTable = async (input: {
    id?: string;
    number: string;
    seats: number;
    zone?: string;
    status: TableStatus;
  }): Promise<boolean> => {
    const res = await fetch(`/api/admin/floor/tables?location=${encodeURIComponent(pageLoc)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (res.ok) {
      toast.success(input.id ? "Table updated" : "Table created");
      await fetchTables();
      return true;
    }
    const data = await res.json().catch(() => ({}));
    toast.error("Could not save table", (data as { error?: string }).error);
    return false;
  };

  const changeTableStatus = async (table: FloorTable, status: TableStatus) => {
    const prev = tables;
    setTables((arr) => arr.map((t) => (t.id === table.id ? { ...t, status } : t)));
    const res = await fetch(`/api/admin/floor/tables?location=${encodeURIComponent(pageLoc)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: table.id,
        number: table.number,
        seats: table.seats,
        zone: table.zone,
        status,
      }),
    });
    if (res.ok) {
      toast.success(`Table ${table.number} · ${TABLE_STATUS_LABEL[status]}`);
      await fetchTables();
    } else {
      setTables(prev);
      toast.error("Could not update status");
    }
  };

  const doTableDelete = async () => {
    if (!pendingTableDelete) return;
    const res = await fetch(
      `/api/admin/floor/tables?location=${encodeURIComponent(pageLoc)}&id=${encodeURIComponent(pendingTableDelete.id)}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      setTables((arr) => arr.filter((t) => t.id !== pendingTableDelete.id));
      toast.success("Table deleted", `Table ${pendingTableDelete.number}`);
    } else {
      toast.error("Could not delete table");
    }
    setPendingTableDelete(null);
  };

  // --- Reservation mutations ---
  const saveReservation = async (
    input: {
      id?: string;
      customerName: string;
      customerPhone?: string;
      partySize: number;
      date: string;
      time: string;
      durationMin: number;
      tableId?: string;
      status: ReservationStatus;
      notes?: string;
    },
    override: boolean,
  ): Promise<{ ok: boolean; conflicts: ConflictHit[] }> => {
    const res = await fetch(
      `/api/admin/floor/reservations?location=${encodeURIComponent(pageLoc)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, override }),
      },
    );
    if (res.ok) {
      toast.success(input.id ? "Reservation updated" : "Reservation booked");
      await fetchReservations();
      return { ok: true, conflicts: [] };
    }
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      conflicts?: ConflictHit[];
    };
    if (res.status === 409 && Array.isArray(data.conflicts)) {
      return { ok: false, conflicts: data.conflicts };
    }
    toast.error("Could not save reservation", data.error);
    return { ok: false, conflicts: [] };
  };

  const doReservationDelete = async () => {
    if (!pendingReservationDelete) return;
    const res = await fetch(
      `/api/admin/floor/reservations?location=${encodeURIComponent(pageLoc)}&id=${encodeURIComponent(pendingReservationDelete.id)}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      setReservations((arr) => arr.filter((r) => r.id !== pendingReservationDelete.id));
      toast.success("Reservation deleted", pendingReservationDelete.customerName);
    } else {
      toast.error("Could not delete reservation");
    }
    setPendingReservationDelete(null);
  };

  // --- Derived ---
  const sortedReservations = useMemo(
    () => [...reservations].sort((a, b) => a.time.localeCompare(b.time)),
    [reservations],
  );

  const tableLabel = useCallback(
    (tableId?: string) => {
      if (!tableId) return "Unassigned";
      const t = tables.find((x) => x.id === tableId);
      return t ? `Table ${t.number}` : "Unassigned";
    },
    [tables],
  );

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Floor</h1>
          <p className="v2-page-subtitle">
            Tables and dine-in reservations for {locName}. Track seating in real time and book the
            day&apos;s covers without double-seating a table.
          </p>
        </div>
        <div className="v2-page-actions">
          <Tabs
            value={view}
            onChange={(v) => setView(v as View)}
            tabs={[
              { value: "tables", label: "Tables", count: tables.length },
              { value: "reservations", label: "Reservations", count: reservations.length },
              { value: "twin", label: "Twin" },
            ]}
            variant="pill"
            ariaLabel="Floor view"
          />
          {view === "tables" ? (
            <Button
              variant="primary"
              leadingIcon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setTableDialog({ open: true, table: null })}
            >
              Add table
            </Button>
          ) : view === "reservations" ? (
            <Button
              variant="primary"
              leadingIcon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setReservationDialog({ open: true, reservation: null })}
            >
              New reservation
            </Button>
          ) : null}
        </div>
      </header>

      <div className="v2-filters">
        <LocationFilter value={pageLoc} onChange={setPageLoc} />
        {view === "reservations" && <DatePager unit="day" value={date} onChange={setDate} />}
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={
            <RefreshCw
              className={`h-3.5 w-3.5 ${loadingTables || loadingReservations || twinLoading ? "v2-spin" : ""}`}
            />
          }
          onClick={view === "twin" ? fetchTwin : view === "tables" ? fetchTables : fetchReservations}
        >
          Refresh
        </Button>
      </div>

      {error && <div className="v2-muted">{error}</div>}

      {view === "twin" ? (
        <FloorTwinView
          twin={twin}
          kitchen={kitchen}
          loading={twinLoading}
          acting={actingTable}
          onAction={seatClear}
        />
      ) : view === "tables" ? (
        loadingTables ? (
          <div className="v2-page-loading">Loading Floor…</div>
        ) : tables.length === 0 ? (
          <Card>
            <CardBody>
              <EmptyState
                icon={Armchair}
                title="No tables yet"
                description={`Add the floor plan for ${locName} to start tracking seating and reservations.`}
                action={
                  <Button
                    variant="primary"
                    leadingIcon={<Plus className="h-3.5 w-3.5" />}
                    onClick={() => setTableDialog({ open: true, table: null })}
                  >
                    Add table
                  </Button>
                }
              />
            </CardBody>
          </Card>
        ) : (
          <div className="v2-slot-grid">
            {tables.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTableDialog({ open: true, table: t })}
                className="v2-slot-card"
              >
                <div className="v2-slot-card-top">
                  <span className="v2-slot-time">Table {t.number}</span>
                  <Badge tone={TABLE_STATUS_TONE[t.status]} variant="soft" dot>
                    {TABLE_STATUS_LABEL[t.status]}
                  </Badge>
                </div>
                <div className="v2-slot-card-foot">
                  <span className="tabular">
                    <Users className="h-3 w-3 v2-muted" /> {t.seats} seat{t.seats === 1 ? "" : "s"}
                  </span>
                  {t.zone && <span className="v2-muted">{t.zone}</span>}
                </div>
              </button>
            ))}
          </div>
        )
      ) : loadingReservations ? (
        <div className="v2-page-loading">Loading Floor…</div>
      ) : sortedReservations.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={CalendarClock}
              title="No reservations for this day"
              description="Book a dine-in cover with the New reservation button."
              action={
                <Button
                  variant="primary"
                  leadingIcon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => setReservationDialog({ open: true, reservation: null })}
                >
                  New reservation
                </Button>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <Card padding="none">
          <CardBody>
            <ul className="v2-slot-orders">
              {sortedReservations.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="v2-reservation-row"
                    onClick={() => setReservationDialog({ open: true, reservation: r })}
                  >
                    <span className="mono tabular">{r.time}</span>
                    <span>{r.customerName}</span>
                    <span className="v2-muted">party of {r.partySize}</span>
                    <span className="v2-muted">{tableLabel(r.tableId)}</span>
                    <Badge tone={RESERVATION_STATUS_TONE[r.status]} variant="soft" dot>
                      {RESERVATION_STATUS_LABEL[r.status]}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <TableDialog
        open={tableDialog.open}
        table={tableDialog.table}
        onClose={() => setTableDialog({ open: false, table: null })}
        onSubmit={async (input) => {
          const ok = await saveTable(input);
          if (ok) setTableDialog({ open: false, table: null });
        }}
        onStatusChange={async (status) => {
          if (!tableDialog.table) return;
          await changeTableStatus(tableDialog.table, status);
        }}
        onDelete={
          tableDialog.table
            ? () => {
                setPendingTableDelete(tableDialog.table);
                setTableDialog({ open: false, table: null });
              }
            : undefined
        }
      />

      <ReservationDialog
        open={reservationDialog.open}
        reservation={reservationDialog.reservation}
        defaultDate={date}
        tables={tables}
        onClose={() => setReservationDialog({ open: false, reservation: null })}
        onSubmit={(input, override) => saveReservation(input, override)}
        onSubmitted={() => setReservationDialog({ open: false, reservation: null })}
        onDelete={
          reservationDialog.reservation
            ? () => {
                setPendingReservationDelete(reservationDialog.reservation);
                setReservationDialog({ open: false, reservation: null });
              }
            : undefined
        }
      />

      <ConfirmDialog
        open={pendingTableDelete !== null}
        onClose={() => setPendingTableDelete(null)}
        onConfirm={doTableDelete}
        title={`Delete table ${pendingTableDelete?.number ?? ""}?`}
        description="Removes the table from the floor plan. Existing reservations keep their record but will show as unassigned."
        confirmLabel="Delete table"
        destructive
      />

      <ConfirmDialog
        open={pendingReservationDelete !== null}
        onClose={() => setPendingReservationDelete(null)}
        onConfirm={doReservationDelete}
        title={`Delete ${pendingReservationDelete?.customerName ?? ""}'s reservation?`}
        description="Permanently removes the booking. To keep a record instead, set its status to Cancelled."
        confirmLabel="Delete reservation"
        destructive
      />
    </div>
  );
}

// =============================================================
// Floor Twin view (Module 3 keystone)
// =============================================================

const zl = (g: number) => `${Math.round(g / 100).toLocaleString("pl-PL")} zł`;

function FloorKpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "success" | "info" | "warning" | "danger";
}) {
  return (
    <div className="v2-kpi">
      <div className="v2-kpi-top">
        <div className="v2-kpi-label">{label}</div>
      </div>
      <div className="v2-kpi-value-row">
        <span className="v2-kpi-value tabular">{value}</span>
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

type TwinRow = FloorTwin["tables"][number];

function FloorTwinView({
  twin,
  kitchen,
  loading,
  acting,
  onAction,
}: {
  twin: FloorTwin | null;
  kitchen: KitchenLoad | null;
  loading: boolean;
  acting: string | null;
  onAction: (tableId: string, action: "seat" | "clear") => void;
}) {
  const [party, setParty] = useState("2");

  if (loading) return <div className="v2-page-loading">Modelling the floor…</div>;
  if (!twin || twin.tables.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState
            icon={Gauge}
            title="No tables to model"
            description="Add tables, then the Twin forecasts turn-times, spend velocity and seating from real dine-in orders."
          />
        </CardBody>
      </Card>
    );
  }

  const s = twin.summary;
  const partyN = Math.max(1, Math.min(50, Math.round(Number(party) || 0)));
  const recs = recommendSeating(twin, partyN);

  const cols: Column<TwinRow>[] = [
    {
      key: "number",
      header: "Table",
      cell: (t) => (
        <span className="mono">
          {t.number} <span className="v2-muted">· {t.seats}p</span>
        </span>
      ),
      sortValue: (t) => t.number,
    },
    {
      key: "state",
      header: "State",
      cell: (t) =>
        t.status === "out-of-service" ? (
          <Badge tone="neutral" variant="soft">out of service</Badge>
        ) : t.occupied ? (
          <Badge tone="warning" variant="soft" dot>
            seated{t.party ? ` · ${t.party}p` : ""}
          </Badge>
        ) : (
          <Badge tone="success" variant="soft" dot>open</Badge>
        ),
      sortValue: (t) => (t.occupied ? 1 : 0),
    },
    {
      key: "freein",
      header: "Frees in",
      cell: (t) =>
        t.predictedFreeInMin == null ? (
          <span className="v2-muted">—</span>
        ) : t.predictedFreeInMin <= 0 ? (
          <Badge tone="info" variant="soft">finishing</Badge>
        ) : (
          <span className="tabular">~{t.predictedFreeInMin}m</span>
        ),
      sortValue: (t) => t.predictedFreeInMin ?? 1e9,
    },
    {
      key: "turn",
      header: "Median turn",
      cell: (t) =>
        t.medianDwellMin == null ? (
          <span className="v2-muted">—</span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span className="tabular">{t.medianDwellMin}m</span>
            {t.dwellSource === "measured" && <Badge tone="info" variant="soft">measured</Badge>}
          </span>
        ),
      sortValue: (t) => t.medianDwellMin ?? 0,
    },
    {
      key: "velocity",
      header: "Spend / hr",
      align: "right",
      cell: (t) => (t.spendVelocityPerHourGrosze != null ? <span className="tabular">{zl(t.spendVelocityPerHourGrosze)}</span> : <span className="v2-muted">—</span>),
      sortValue: (t) => t.spendVelocityPerHourGrosze ?? 0,
    },
    {
      key: "turns",
      header: "Turns",
      align: "right",
      cell: (t) => <span className="tabular v2-muted">{t.turns}</span>,
      sortValue: (t) => t.turns,
    },
    {
      key: "act",
      header: "",
      align: "right",
      cell: (t) =>
        t.status === "out-of-service" ? null : t.occupied ? (
          <Button size="sm" variant="secondary" loading={acting === t.id} onClick={() => onAction(t.id, "clear")}>
            Clear
          </Button>
        ) : (
          <Button size="sm" variant="primary" loading={acting === t.id} onClick={() => onAction(t.id, "seat")}>
            Seat
          </Button>
        ),
    },
  ];

  return (
    <>
      {kitchen && kitchen.tier !== "calm" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderRadius: 10,
            marginBottom: 4,
            flexWrap: "wrap",
            border: "1px solid var(--admin-border, rgba(0,0,0,.1))",
            background: "var(--admin-surface-2, rgba(0,0,0,.03))",
          }}
        >
          <Gauge className="h-4 w-4" />
          <span style={{ fontWeight: 600 }}>
            Kitchen {kitchen.tier === "risk" ? "overloaded" : "filling up"}
          </span>
          <Badge tone={kitchen.tier === "risk" ? "danger" : "warning"} variant="soft" dot>
            {kitchen.label} · {kitchen.util}%
          </Badge>
          <span className="v2-muted" style={{ fontSize: 12 }}>
            Pace new seating — the line can&apos;t absorb more covers right now.
          </span>
        </div>
      )}
      <section className="v2-kpi-grid">
        <FloorKpi label="Occupancy" value={`${s.occupancyPct}%`} hint={`${s.seated}/${s.totalTables} seated`} tone={s.occupancyPct >= 85 ? "warning" : "info"} />
        <FloorKpi label="Open now" value={String(s.openTables)} hint={`${s.freeingSoon15} freeing ≤15m`} tone="success" />
        <FloorKpi label="Median turn" value={s.medianTurnMin != null ? `${s.medianTurnMin}m` : "—"} hint="realized" />
        <FloorKpi label="Spend / hr" value={s.spendVelocityPerHourGrosze != null ? zl(s.spendVelocityPerHourGrosze) : "—"} hint="per occupied table-hour" />
      </section>

      <Card padding="none">
        <CardHeader title="Where to seat the next party" description="Best-fit open tables first, then the soonest to free — computed live from the room's realized turn-times." />
        <CardBody>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <Users className="h-4 w-4 v2-muted" />
            <Input
              type="number"
              value={party}
              onChange={(e) => setParty(e.target.value)}
              style={{ width: 90 }}
              aria-label="Party size"
            />
            <span className="v2-muted">party size</span>
          </div>
          {recs.length === 0 ? (
            <div className="v2-muted">No table fits a party of {partyN}.</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {recs.map((r) => (
                <div
                  key={r.tableId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--admin-border, rgba(0,0,0,.1))",
                  }}
                >
                  <span className="mono" style={{ fontWeight: 600 }}>{r.number}</span>
                  <Badge tone={r.readyInMin === 0 ? "success" : "info"} variant="soft">
                    {r.readyInMin === 0 ? "open now" : `~${r.readyInMin}m`}
                  </Badge>
                  <span className="v2-muted" style={{ fontSize: 12 }}>{r.note}</span>
                  {r.readyInMin === 0 && (
                    <Button
                      size="sm"
                      variant="primary"
                      loading={acting === r.tableId}
                      onClick={() => onAction(r.tableId, "seat")}
                    >
                      Seat
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card padding="none">
        <CardHeader
          title="Live tables"
          description={`${s.seated} seated · ${s.openTables} open · ${s.freeingSoon30} freeing within 30m.`}
        />
        <CardBody>
          <Table rows={twin.tables} columns={cols} rowKey={(t) => t.id} defaultSort={{ key: "state", dir: "desc" }} />
        </CardBody>
      </Card>
    </>
  );
}

// =============================================================
// Table dialog
// =============================================================

interface TableDialogProps {
  open: boolean;
  table: FloorTable | null;
  onClose: () => void;
  onSubmit: (input: {
    id?: string;
    number: string;
    seats: number;
    zone?: string;
    status: TableStatus;
  }) => Promise<void> | void;
  onStatusChange: (status: TableStatus) => Promise<void> | void;
  onDelete?: () => void;
}

function TableDialog({ open, table, onClose, onSubmit, onStatusChange, onDelete }: TableDialogProps) {
  const toast = useToast();
  const [number, setNumber] = useState("");
  const [seats, setSeats] = useState("4");
  const [zone, setZone] = useState("");
  const [status, setStatus] = useState<TableStatus>("available");
  const [busy, setBusy] = useState(false);

  const isEdit = table !== null;

  useEffect(() => {
    if (!open) return;
    setNumber(table?.number ?? "");
    setSeats(table?.seats !== undefined ? String(table.seats) : "4");
    setZone(table?.zone ?? "");
    setStatus(table?.status ?? "available");
    setBusy(false);
  }, [open, table]);

  if (!open) return <Dialog open={false} onClose={onClose} />;

  const submit = async () => {
    if (!number.trim()) {
      toast.warning("Table number required");
      return;
    }
    setBusy(true);
    await onSubmit({
      id: table?.id,
      number: number.trim(),
      seats: Math.min(50, Math.max(1, Number(seats) || 1)),
      zone: zone.trim() || undefined,
      status,
    });
    setBusy(false);
  };

  // In edit mode, changing the status Select persists immediately.
  const handleStatusChange = async (next: TableStatus) => {
    setStatus(next);
    if (isEdit) await onStatusChange(next);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={isEdit ? `Edit table ${table?.number}` : "Add table"}
      footer={
        <>
          {isEdit && onDelete && (
            <Button variant="ghost" leadingIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={onDelete}>
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            {isEdit ? "Save changes" : "Add table"}
          </Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <div className="v2-form-row-2">
          <Input
            label="Number / label"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            description="Free-form, e.g. 12, Bar 3, Patio A."
          />
          <Input
            label="Seats"
            type="number"
            min="1"
            max="50"
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
          />
        </div>
        <Input label="Zone" value={zone} onChange={(e) => setZone(e.target.value)} description="Optional — e.g. Patio, Window, Bar." />
        <Select
          label="Status"
          value={status}
          onChange={(e) => handleStatusChange(e.target.value as TableStatus)}
          options={TABLE_STATUS_OPTIONS}
          description={isEdit ? "Saved instantly when changed." : undefined}
        />
      </div>
    </Dialog>
  );
}

// =============================================================
// Reservation dialog
// =============================================================

interface ReservationDialogProps {
  open: boolean;
  reservation: Reservation | null;
  defaultDate: string;
  tables: FloorTable[];
  onClose: () => void;
  onSubmit: (
    input: {
      id?: string;
      customerName: string;
      customerPhone?: string;
      partySize: number;
      date: string;
      time: string;
      durationMin: number;
      tableId?: string;
      status: ReservationStatus;
      notes?: string;
    },
    override: boolean,
  ) => Promise<{ ok: boolean; conflicts: ConflictHit[] }>;
  onSubmitted: () => void;
  onDelete?: () => void;
}

function ReservationDialog({
  open,
  reservation,
  defaultDate,
  tables,
  onClose,
  onSubmit,
  onSubmitted,
  onDelete,
}: ReservationDialogProps) {
  const toast = useToast();
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [partySize, setPartySize] = useState("2");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("19:00");
  const [durationMin, setDurationMin] = useState("90");
  const [tableId, setTableId] = useState("");
  const [status, setStatus] = useState<ReservationStatus>("booked");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictHit[]>([]);

  const isEdit = reservation !== null;

  useEffect(() => {
    if (!open) return;
    setCustomerName(reservation?.customerName ?? "");
    setCustomerPhone(reservation?.customerPhone ?? "");
    setPartySize(reservation?.partySize !== undefined ? String(reservation.partySize) : "2");
    setDate(reservation?.date ?? defaultDate);
    setTime(reservation?.time ?? "19:00");
    setDurationMin(reservation?.durationMin !== undefined ? String(reservation.durationMin) : "90");
    setTableId(reservation?.tableId ?? "");
    setStatus(reservation?.status ?? "booked");
    setNotes(reservation?.notes ?? "");
    setBusy(false);
    setConflicts([]);
  }, [open, reservation, defaultDate]);

  if (!open) return <Dialog open={false} onClose={onClose} />;

  const tableOptions = [
    { value: "", label: "Unassigned" },
    ...tables.map((t) => ({
      value: t.id,
      label: `Table ${t.number} · ${t.seats} seat${t.seats === 1 ? "" : "s"}${t.zone ? ` · ${t.zone}` : ""}`,
    })),
  ];

  const buildPayload = () => ({
    id: reservation?.id,
    customerName: customerName.trim(),
    customerPhone: customerPhone.trim() || undefined,
    partySize: Math.min(50, Math.max(1, Number(partySize) || 1)),
    date,
    time,
    durationMin: Math.min(600, Math.max(15, Number(durationMin) || 90)),
    tableId: tableId || undefined,
    status,
    notes: notes.trim() || undefined,
  });

  const submit = async (override: boolean) => {
    if (!customerName.trim()) {
      toast.warning("Customer name required");
      return;
    }
    setBusy(true);
    const result = await onSubmit(buildPayload(), override);
    setBusy(false);
    if (result.ok) {
      onSubmitted();
    } else if (result.conflicts.length > 0) {
      setConflicts(result.conflicts);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={isEdit ? `Edit reservation · ${reservation?.customerName}` : "New reservation"}
      footer={
        <>
          {isEdit && onDelete && (
            <Button variant="ghost" leadingIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={onDelete}>
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {conflicts.length > 0 ? (
            <Button variant="danger" onClick={() => submit(true)} loading={busy}>
              Book anyway
            </Button>
          ) : (
            <Button variant="primary" onClick={() => submit(false)} loading={busy}>
              {isEdit ? "Save changes" : "Book reservation"}
            </Button>
          )}
        </>
      }
    >
      <div className="v2-stack-12">
        {conflicts.length > 0 && (
          <div className="v2-field">
            <Badge tone="warning" variant="soft" dot>
              Table already booked
            </Badge>
            <ul className="v2-stack-12" style={{ marginTop: 8 }}>
              {conflicts.map((c) => (
                <li key={c.id} className="v2-muted">
                  {c.time} ({c.durationMin} min) — {c.customerName}
                </li>
              ))}
            </ul>
            <div className="v2-field-desc">Use Book anyway to double-seat this table.</div>
          </div>
        )}
        <Input
          label="Customer name"
          value={customerName}
          onChange={(e) => {
            setCustomerName(e.target.value);
            setConflicts([]);
          }}
        />
        <div className="v2-form-row-2">
          <Input label="Phone" type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
          <Input
            label="Party size"
            type="number"
            min="1"
            max="50"
            value={partySize}
            onChange={(e) => setPartySize(e.target.value)}
          />
        </div>
        <div className="v2-form-row-2">
          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setConflicts([]);
            }}
          />
          <Input
            label="Time"
            type="time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              setConflicts([]);
            }}
          />
        </div>
        <div className="v2-form-row-2">
          <Input
            label="Duration (min)"
            type="number"
            min="15"
            max="600"
            value={durationMin}
            onChange={(e) => {
              setDurationMin(e.target.value);
              setConflicts([]);
            }}
          />
          <Select
            label="Table"
            value={tableId}
            onChange={(e) => {
              setTableId(e.target.value);
              setConflicts([]);
            }}
            options={tableOptions}
          />
        </div>
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as ReservationStatus)}
          options={RESERVATION_STATUS_OPTIONS}
        />
        <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Dialog>
  );
}
