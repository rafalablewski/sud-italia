"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Coins,
  MapPin,
  Plus,
  Route,
  Trash2,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { getActiveLocations } from "@/data/locations";
import type {
  TruckEvent,
  TruckEventStatus,
  TruckRoute,
  TruckStop,
} from "@/data/types";
import { useAdminLocation } from "@/shared/LocationContext";
import { useToast } from "@/ui/Toast";

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
} from "@/ui";
import { KpiCard } from "./v2/charts";

const activeLocations = getActiveLocations();
const FALLBACK_LOC = activeLocations[0]?.slug ?? "krakow";

const STATUS_TONE: Record<TruckEventStatus, "warning" | "info" | "success" | "neutral"> = {
  scheduled: "warning",
  live: "info",
  done: "success",
  cancelled: "neutral",
};

const STATUS_LABEL: Record<TruckEventStatus, string> = {
  scheduled: "Scheduled",
  live: "Live",
  done: "Done",
  cancelled: "Cancelled",
};

type Tab = "events" | "routes";

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export function AdminTruck() {
  return <AdminTruckDesktop />;
}

function AdminTruckDesktop() {
  const { location: globalLoc } = useAdminLocation();
  const toast = useToast();
  // Site comes from the shell scope (topbar ScopeSwitcher); "all" → first truck.
  const pageLoc = globalLoc || FALLBACK_LOC;

  const [tab, setTab] = useState<Tab>("events");
  const [routes, setRoutes] = useState<TruckRoute[]>([]);
  const [events, setEvents] = useState<TruckEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const [routeDialog, setRouteDialog] = useState<{ open: boolean; route: TruckRoute | null }>({ open: false, route: null });
  const [eventDialog, setEventDialog] = useState<{ open: boolean; event: TruckEvent | null }>({ open: false, event: null });
  const [pendingRouteDelete, setPendingRouteDelete] = useState<TruckRoute | null>(null);
  const [pendingEventDelete, setPendingEventDelete] = useState<TruckEvent | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [r, e] = await Promise.all([
        fetch(`/api/admin/truck-routes?location=${pageLoc}`).then((res) => (res.ok ? res.json() : [])),
        fetch(`/api/admin/truck-events?location=${pageLoc}`).then((res) => (res.ok ? res.json() : [])),
      ]);
      setRoutes(Array.isArray(r) ? r : []);
      setEvents(Array.isArray(e) ? e : []);
    } finally {
      setLoading(false);
    }
  }, [pageLoc]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const totals = useMemo(() => {
    const done = events.filter((e) => e.status === "done");
    const revenue = done.reduce((acc, e) => acc + (e.actualRevenueGrosze ?? 0), 0);
    const orders = done.reduce((acc, e) => acc + (e.actualOrders ?? 0), 0);
    const expectedAtt = events.reduce((acc, e) => acc + (e.expectedAttendance ?? 0), 0);
    const aov = orders > 0 ? Math.round(revenue / orders) : 0;
    return { revenue, orders, expectedAtt, aov, done: done.length };
  }, [events]);

  const submitRoute = async (route: Partial<TruckRoute> & { name: string; stops: TruckStop[] }) => {
    const res = await fetch("/api/admin/truck-routes", {
      method: route.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...route, locationSlug: pageLoc }),
    });
    if (res.ok) {
      toast.success(route.id ? "Route updated" : "Route created");
      setRouteDialog({ open: false, route: null });
      await fetchAll();
    } else {
      toast.error("Could not save route");
    }
  };

  const submitEvent = async (input: Partial<TruckEvent> & {
    name: string;
    date: string;
    status: TruckEventStatus;
  }) => {
    const res = await fetch("/api/admin/truck-events", {
      method: input.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, locationSlug: pageLoc }),
    });
    if (res.ok) {
      toast.success(input.id ? "Event updated" : "Event created");
      setEventDialog({ open: false, event: null });
      await fetchAll();
    } else {
      toast.error("Could not save event");
    }
  };

  const doDeleteRoute = async () => {
    if (!pendingRouteDelete) return;
    const res = await fetch(`/api/admin/truck-routes?id=${encodeURIComponent(pendingRouteDelete.id)}`, { method: "DELETE" });
    if (res.ok) {
      setRoutes((arr) => arr.filter((r) => r.id !== pendingRouteDelete.id));
      toast.success("Route deleted");
    }
    setPendingRouteDelete(null);
  };

  const doDeleteEvent = async () => {
    if (!pendingEventDelete) return;
    const res = await fetch(`/api/admin/truck-events?id=${encodeURIComponent(pendingEventDelete.id)}`, { method: "DELETE" });
    if (res.ok) {
      setEvents((arr) => arr.filter((e) => e.id !== pendingEventDelete.id));
      toast.success("Event deleted");
    }
    setPendingEventDelete(null);
  };

  // Per-stop revenue ranking (rough — match events whose route includes this stop name)
  const hotspots = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; events: number }>();
    const routeMap = new Map(routes.map((r) => [r.id, r]));
    for (const ev of events) {
      if (ev.status !== "done") continue;
      const stops = ev.routeId ? routeMap.get(ev.routeId)?.stops ?? [] : [];
      // If event has no route, attribute to event name
      if (stops.length === 0) {
        const k = ev.name || "Untitled";
        const cur = map.get(k) ?? { name: k, revenue: 0, events: 0 };
        cur.revenue += ev.actualRevenueGrosze ?? 0;
        cur.events += 1;
        map.set(k, cur);
      } else {
        const split = Math.round((ev.actualRevenueGrosze ?? 0) / stops.length);
        for (const s of stops) {
          const cur = map.get(s.name) ?? { name: s.name, revenue: 0, events: 0 };
          cur.revenue += split;
          cur.events += 1;
          map.set(s.name, cur);
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [events, routes]);

  const eventCols: Column<TruckEvent>[] = [
    {
      key: "date",
      header: "Date",
      cell: (e) => fmtDate(e.date),
      sortValue: (e) => e.date,
    },
    {
      key: "name",
      header: "Event",
      cell: (e) => (
        <div className="v2-cell-stack">
          <span>{e.name}</span>
          {e.routeId && (
            <span className="v2-cell-sub">
              {routes.find((r) => r.id === e.routeId)?.name ?? "Unknown route"}
            </span>
          )}
        </div>
      ),
      sortValue: (e) => e.name,
    },
    {
      key: "status",
      header: "Status",
      cell: (e) => (
        <Badge tone={STATUS_TONE[e.status]} variant="soft" dot>
          {STATUS_LABEL[e.status]}
        </Badge>
      ),
      sortValue: (e) => e.status,
    },
    {
      key: "expected",
      header: "Expected",
      align: "right",
      cell: (e) => (e.expectedAttendance ?? "—").toLocaleString(),
      sortValue: (e) => e.expectedAttendance ?? -1,
    },
    {
      key: "revenue",
      header: "Revenue",
      align: "right",
      cell: (e) => (e.actualRevenueGrosze !== undefined ? formatPrice(e.actualRevenueGrosze) : <span className="v2-muted">—</span>),
      sortValue: (e) => e.actualRevenueGrosze ?? -1,
    },
    {
      key: "orders",
      header: "Orders",
      align: "right",
      cell: (e) => (e.actualOrders ?? "—").toLocaleString(),
      sortValue: (e) => e.actualOrders ?? -1,
    },
    {
      key: "actions",
      header: "",
      cell: (e) => (
        <div className="v2-row-actions">
          <Button size="sm" variant="ghost" onClick={() => setEventDialog({ open: true, event: e })}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPendingEventDelete(e)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="v2-page">
      <PageHero
        title="Truck operations"
        subtitle="Plan routes for the truck, log events, see which stops earn the most. Map placement is optional — fill lat/lng if you want a future map view."        nav={{
          value: tab,
          onChange: (v) => setTab(v as Tab),
          options: [
            { value: "events", label: "Events", icon: <Calendar className="h-3.5 w-3.5" /> },
            { value: "routes", label: "Routes", icon: <Route className="h-3.5 w-3.5" /> },
          ],
          ariaLabel: "Section",
        }}
      />

      <section className="v2-kpi-grid">
        <KpiCard
          label="Events"
          value={events.length}
          icon={Calendar}
          tone="info"
          hint={`${totals.done} completed`}
        />
        <KpiCard
          label="Total revenue"
          value={totals.revenue / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Coins}
          tone="brand"
        />
        <KpiCard
          label="Orders served"
          value={totals.orders}
          icon={TrendingUp}
          tone="success"
          hint={totals.aov ? `AOV ${formatPrice(totals.aov)}` : undefined}
        />
        <KpiCard
          label="Expected attendance"
          value={totals.expectedAtt}
          icon={Users}
          tone="warning"
          hint="Sum across all scheduled events"
        />
      </section>

      {loading ? (
        <div className="v2-page-loading">Loading Truck ops…</div>
      ) : tab === "events" ? (
        <>
          <div className="v2-filters">
            <h2 className="v2-section-h">Event log</h2>
            <Button variant="primary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEventDialog({ open: true, event: null })}>
              New event
            </Button>
          </div>

          {events.length === 0 ? (
            <Card>
              <CardBody>
                <EmptyState
                  icon={Truck}
                  title="No events yet"
                  description="Log an event to track expected vs actual revenue and orders per spot."
                  action={
                    <Button variant="primary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEventDialog({ open: true, event: null })}>
                      New event
                    </Button>
                  }
                />
              </CardBody>
            </Card>
          ) : (
            <Card padding="none">
              <Table flush rows={events} columns={eventCols} rowKey={(e) => e.id} defaultSort={{ key: "date", dir: "desc" }} />
            </Card>
          )}

          <Card padding="none">
            <CardHeader title="Hotspots" description="Revenue split across stops of completed events" />
            <CardBody>
              {hotspots.length === 0 ? (
                <EmptyState icon={MapPin} title="No completed events with revenue logged" compact />
              ) : (
                <ul className="v2-mov-list">
                  {hotspots.map((h) => (
                    <li key={h.name} className="v2-mov-row">
                      <span className="v2-mov-icon v2-mov-tone-info">
                        <MapPin className="h-3 w-3" />
                      </span>
                      <div className="v2-mov-text">
                        <div className="v2-mov-title">
                          <span>{h.name}</span>
                          <span className="tabular">{formatPrice(h.revenue)}</span>
                        </div>
                        <div className="v2-mov-sub">
                          {h.events} event{h.events === 1 ? "" : "s"}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </>
      ) : (
        <>
          <div className="v2-filters">
            <h2 className="v2-section-h">Saved routes</h2>
            <Button variant="primary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setRouteDialog({ open: true, route: null })}>
              New route
            </Button>
          </div>
          {routes.length === 0 ? (
            <Card>
              <CardBody>
                <EmptyState
                  icon={Route}
                  title="No routes yet"
                  description="Routes group several stops so you can quickly schedule recurring drives."
                  action={
                    <Button variant="primary" onClick={() => setRouteDialog({ open: true, route: null })}>
                      New route
                    </Button>
                  }
                />
              </CardBody>
            </Card>
          ) : (
            <div className="v2-rewards-grid">
              {routes.map((r) => (
                <Card key={r.id}>
                  <CardHeader
                    title={r.name}
                    description={r.description || `${r.stops.length} stop${r.stops.length === 1 ? "" : "s"}`}
                    actions={
                      <div className="v2-row-actions">
                        <Button size="sm" variant="ghost" onClick={() => setRouteDialog({ open: true, route: r })}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setPendingRouteDelete(r)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    }
                  />
                  <CardBody>
                    {r.stops.length === 0 ? (
                      <span className="v2-muted">No stops yet</span>
                    ) : (
                      <ol className="v2-stop-list">
                        {r.stops.map((s, i) => (
                          <li key={`${s.name}-${i}`}>
                            <span className="v2-stop-num">{i + 1}.</span>
                            <span>{s.name}</span>
                            {s.startTime && <span className="v2-muted mono">{s.startTime}–{s.endTime}</span>}
                          </li>
                        ))}
                      </ol>
                    )}
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <RouteDialog
        state={routeDialog}
        onClose={() => setRouteDialog({ open: false, route: null })}
        onSubmit={submitRoute}
      />

      <EventDialog
        state={eventDialog}
        routes={routes}
        onClose={() => setEventDialog({ open: false, event: null })}
        onSubmit={submitEvent}
      />

      <ConfirmDialog
        open={pendingRouteDelete !== null}
        onClose={() => setPendingRouteDelete(null)}
        onConfirm={doDeleteRoute}
        title={`Delete route ${pendingRouteDelete?.name ?? ""}?`}
        confirmLabel="Delete"
        destructive
      />
      <ConfirmDialog
        open={pendingEventDelete !== null}
        onClose={() => setPendingEventDelete(null)}
        onConfirm={doDeleteEvent}
        title={`Delete event ${pendingEventDelete?.name ?? ""}?`}
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}

interface RouteDialogProps {
  state: { open: boolean; route: TruckRoute | null };
  onClose: () => void;
  onSubmit: (input: Partial<TruckRoute> & { name: string; stops: TruckStop[] }) => Promise<void> | void;
}

function RouteDialog({ state, onClose, onSubmit }: RouteDialogProps) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [stops, setStops] = useState<TruckStop[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    const r = state.route;
    setName(r?.name ?? "");
    setDesc(r?.description ?? "");
    setStops(r?.stops ?? []);
    setBusy(false);
  }, [state]);

  if (!state.open) return <Dialog open={false} onClose={onClose} />;

  const addStop = () =>
    setStops((arr) => [...arr, { name: "", startTime: "", endTime: "" }]);
  const updateStop = (idx: number, patch: Partial<TruckStop>) =>
    setStops((arr) => arr.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  const removeStop = (idx: number) => setStops((arr) => arr.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await onSubmit({
      id: state.route?.id,
      name: name.trim(),
      description: desc.trim() || undefined,
      stops: stops.filter((s) => s.name.trim()),
    });
    setBusy(false);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={state.route ? `Edit ${state.route.name}` : "New route"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>{state.route ? "Save" : "Create"}</Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Friday evening loop" />
        <Textarea label="Description" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
        <div>
          <div className="v2-filters">
            <span className="v2-field-label">Stops</span>
            <Button size="sm" variant="ghost" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={addStop}>
              Add stop
            </Button>
          </div>
          {stops.length === 0 ? (
            <div className="v2-muted">No stops yet.</div>
          ) : (
            <ul className="v2-rcp-rows">
              {stops.map((s, i) => (
                <li key={i} className="v2-rcp-row">
                  <Input value={s.name} onChange={(e) => updateStop(i, { name: e.target.value })} placeholder="Stop name (e.g. Rynek)" aria-label="Stop name" />
                  <Input type="time" value={s.startTime ?? ""} onChange={(e) => updateStop(i, { startTime: e.target.value })} aria-label="Start" />
                  <Input type="time" value={s.endTime ?? ""} onChange={(e) => updateStop(i, { endTime: e.target.value })} aria-label="End" />
                  <span />
                  <Button size="sm" variant="ghost" onClick={() => removeStop(i)} aria-label="Remove stop">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Dialog>
  );
}

interface EventDialogProps {
  state: { open: boolean; event: TruckEvent | null };
  routes: TruckRoute[];
  onClose: () => void;
  onSubmit: (input: Partial<TruckEvent> & { name: string; date: string; status: TruckEventStatus }) => Promise<void> | void;
}

function EventDialog({ state, routes, onClose, onSubmit }: EventDialogProps) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [routeId, setRouteId] = useState<string>("");
  const [status, setStatus] = useState<TruckEventStatus>("scheduled");
  const [expected, setExpected] = useState("");
  const [revenue, setRevenue] = useState("");
  const [orders, setOrders] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    const e = state.event;
    setName(e?.name ?? "");
    setDate(e?.date ?? new Date().toISOString().split("T")[0]);
    setRouteId(e?.routeId ?? "");
    setStatus(e?.status ?? "scheduled");
    setExpected(e?.expectedAttendance !== undefined ? String(e.expectedAttendance) : "");
    setRevenue(e?.actualRevenueGrosze !== undefined ? (e.actualRevenueGrosze / 100).toFixed(2) : "");
    setOrders(e?.actualOrders !== undefined ? String(e.actualOrders) : "");
    setNotes(e?.notes ?? "");
    setBusy(false);
  }, [state]);

  if (!state.open) return <Dialog open={false} onClose={onClose} />;

  const submit = async () => {
    if (!name.trim() || !date) return;
    setBusy(true);
    await onSubmit({
      id: state.event?.id,
      name: name.trim(),
      date,
      routeId: routeId || undefined,
      status,
      expectedAttendance: expected ? Number(expected) : undefined,
      actualRevenueGrosze: revenue ? Math.round(parseFloat(revenue) * 100) : undefined,
      actualOrders: orders ? Number(orders) : undefined,
      notes: notes.trim() || undefined,
    });
    setBusy(false);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={state.event ? `Edit ${state.event.name}` : "New truck event"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>{state.event ? "Save" : "Create"}</Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <Input label="Event name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wawel Christmas market" />
        <div className="v2-form-row-2">
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Select
            label="Route"
            value={routeId}
            onChange={(e) => setRouteId(e.target.value)}
            options={[{ value: "", label: "No route — one-off" }, ...routes.map((r) => ({ value: r.id, label: r.name }))]}
          />
        </div>
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as TruckEventStatus)}
          options={[
            { value: "scheduled", label: STATUS_LABEL.scheduled },
            { value: "live", label: STATUS_LABEL.live },
            { value: "done", label: STATUS_LABEL.done },
            { value: "cancelled", label: STATUS_LABEL.cancelled },
          ]}
        />
        <div className="v2-form-row-2">
          <Input label="Expected attendance" type="number" min="0" value={expected} onChange={(e) => setExpected(e.target.value)} />
          <Input label="Actual orders" type="number" min="0" value={orders} onChange={(e) => setOrders(e.target.value)} />
        </div>
        <Input
          label="Actual revenue"
          type="number"
          step="0.01"
          min="0"
          value={revenue}
          onChange={(e) => setRevenue(e.target.value)}
          trailingAdornment={<span className="v2-muted">zł</span>}
          description="Used in hotspot ROI calculations once status flips to Done."
        />
        <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Weather, road closures, takeaways…" />
      </div>
    </Dialog>
  );
}
