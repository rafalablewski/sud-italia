"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, MapPin, Plus, Radio, Truck, Users, X } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import type { TruckEvent, TruckEventStatus, TruckRoute, TruckStop } from "@/data/types";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, Button, Dialog, Kpi, Table, type BadgeTone, type ColumnV3 } from "./ui";

const STATUS_LABEL: Record<TruckEventStatus, string> = { scheduled: "Scheduled", live: "Live", done: "Done", cancelled: "Cancelled" };
const STATUS_TONE: Record<TruckEventStatus, BadgeTone> = { scheduled: "warn", live: "info", done: "ok", cancelled: "neutral" };
const STATUSES: TruckEventStatus[] = ["scheduled", "live", "done", "cancelled"];

export function TruckV3() {
  const { location } = useAdminLocationV3();
  const all = useMemo(() => getActiveLocations(), []);
  const loc = location || all[0]?.slug || "krakow";
  const city = all.find((l) => l.slug === loc)?.city ?? loc;

  const [events, setEvents] = useState<TruckEvent[]>([]);
  const [routes, setRoutes] = useState<TruckRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"events" | "routes">("events");
  const [eventDialog, setEventDialog] = useState<TruckEvent | "new" | null>(null);
  const [routeDialog, setRouteDialog] = useState<TruckRoute | "new" | null>(null);

  const load = useCallback(async () => {
    const [ev, rt] = await Promise.all([
      fetch(`/api/admin/truck-events?location=${loc}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`/api/admin/truck-routes?location=${loc}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    setEvents(Array.isArray(ev) ? ev : []);
    setRoutes(Array.isArray(rt) ? rt : []);
    setLoading(false);
  }, [loc]);
  useEffect(() => { load(); }, [load]);

  const delEvent = async (id: string) => { const r = await fetch(`/api/admin/truck-events?id=${encodeURIComponent(id)}`, { method: "DELETE" }); if (r.ok) await load(); };
  const delRoute = async (id: string) => { const r = await fetch(`/api/admin/truck-routes?id=${encodeURIComponent(id)}`, { method: "DELETE" }); if (r.ok) await load(); };

  const eventCols: ColumnV3<TruckEvent>[] = [
    { key: "name", header: "Event", render: (e) => <span style={{ fontWeight: 600 }}>{e.name}</span> },
    { key: "date", header: "Date", render: (e) => <span className="av3-cell-muted">{e.date}</span> },
    { key: "exp", header: "Expected", num: true, render: (e) => (e.expectedAttendance != null ? e.expectedAttendance.toLocaleString("pl-PL") : "—") },
    { key: "actual", header: "Revenue", num: true, render: (e) => (e.actualRevenueGrosze != null ? formatPrice(e.actualRevenueGrosze) : "—") },
    { key: "st", header: "Status", render: (e) => <Badge tone={STATUS_TONE[e.status]} dot>{STATUS_LABEL[e.status]}</Badge> },
    { key: "del", header: "", render: (e) => <button type="button" className="av3-iconbtn-sm" aria-label="Delete" onClick={(ev) => { ev.stopPropagation(); delEvent(e.id); }}><X /></button> },
  ];
  const routeCols: ColumnV3<TruckRoute>[] = [
    { key: "name", header: "Route", render: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { key: "desc", header: "Description", render: (r) => <span className="av3-cell-muted">{r.description || "—"}</span> },
    { key: "stops", header: "Stops", num: true, render: (r) => `${r.stops?.length ?? 0}` },
    { key: "del", header: "", render: (r) => <button type="button" className="av3-iconbtn-sm" aria-label="Delete" onClick={(ev) => { ev.stopPropagation(); delRoute(r.id); }}><X /></button> },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Truck ops</h1>
          <div className="av3-pagehead-sub">Events &amp; routes · {city}{!location ? " (pick a location to switch)" : ""}</div>
        </div>
        <div className="av3-pagehead-actions">
          {tab === "events" ? (
            <Button variant="primary" size="sm" onClick={() => setEventDialog("new")}><Plus className="av3-btn-ico" /> Add event</Button>
          ) : (
            <Button variant="primary" size="sm" onClick={() => setRouteDialog("new")}><Plus className="av3-btn-ico" /> Add route</Button>
          )}
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="Events" icon={Truck} value={`${events.length}`} accentVar="--av3-c3" />
        <Kpi label="Revenue" icon={Banknote} value={formatPrice(events.reduce((s, e) => s + (e.actualRevenueGrosze ?? 0), 0))} accentVar="--av3-c1" />
        <Kpi label="Expected guests" icon={Users} value={events.reduce((s, e) => s + (e.expectedAttendance ?? 0), 0).toLocaleString("pl-PL")} accentVar="--av3-c4" />
        <Kpi label="Live / upcoming" icon={Radio} value={`${events.filter((e) => e.status === "live" || e.status === "scheduled").length}`} accentVar="--av3-c5" />
      </div>

      <div className="av3-filterchips">
        <button type="button" className={`av3-fchip ${tab === "events" ? "is-active" : ""}`} onClick={() => setTab("events")}>Events<span className="av3-fchip-count">{events.length}</span></button>
        <button type="button" className={`av3-fchip ${tab === "routes" ? "is-active" : ""}`} onClick={() => setTab("routes")}>Routes<span className="av3-fchip-count">{routes.length}</span></button>
      </div>

      {loading ? (
        <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading truck ops…</div>
      ) : tab === "events" ? (
        <div className="av3-card" style={{ padding: 0 }}>
          {events.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No events</div><div className="av3-empty-text">Schedule a pop-up, market or private booking.</div></div>
          ) : (
            <Table columns={eventCols} rows={events} rowKey={(e) => e.id} onRowClick={(e) => setEventDialog(e)} />
          )}
        </div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {routes.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No routes</div><div className="av3-empty-text">Define a route with stops the truck runs.</div></div>
          ) : (
            <Table columns={routeCols} rows={routes} rowKey={(r) => r.id} onRowClick={(r) => setRouteDialog(r)} />
          )}
        </div>
      )}

      {eventDialog && <EventDialog event={eventDialog === "new" ? null : eventDialog} routes={routes} locationSlug={loc} onClose={() => setEventDialog(null)} onSaved={async () => { await load(); setEventDialog(null); }} />}
      {routeDialog && <RouteDialog route={routeDialog === "new" ? null : routeDialog} locationSlug={loc} onClose={() => setRouteDialog(null)} onSaved={async () => { await load(); setRouteDialog(null); }} />}
    </>
  );
}

function EventDialog({ event, routes, locationSlug, onClose, onSaved }: { event: TruckEvent | null; routes: TruckRoute[]; locationSlug: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(event?.name ?? "");
  const [date, setDate] = useState(event?.date ?? new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<TruckEventStatus>(event?.status ?? "scheduled");
  const [expected, setExpected] = useState(event?.expectedAttendance != null ? String(event.expectedAttendance) : "");
  const [routeId, setRouteId] = useState(event?.routeId ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = { ...(event ? { id: event.id } : {}), name: name.trim(), date, status, expectedAttendance: expected ? Number(expected) : undefined, routeId: routeId || undefined, notes: notes.trim() || undefined, locationSlug };
      const res = await fetch("/api/admin/truck-events", { method: event ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={event ? event.name : "New event"} width={520}
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" loading={saving} disabled={!name.trim()} onClick={save}>Save</Button></>}>
      <div className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Name</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 1fr 110px", marginBottom: 10 }}>
        <label className="av3-field"><span className="av3-field-label">Date</span><input className="av3-input" type="date" style={{ fontFamily: "var(--av3-ui)" }} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="av3-field"><span className="av3-field-label">Status</span><select className="av3-select" value={status} onChange={(e) => setStatus(e.target.value as TruckEventStatus)}>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></label>
        <label className="av3-field"><span className="av3-field-label">Expected</span><input className="av3-input" type="number" value={expected} onChange={(e) => setExpected(e.target.value)} /></label>
      </div>
      <label className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Route (optional)</span><select className="av3-select" value={routeId} onChange={(e) => setRouteId(e.target.value)}><option value="">—</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label className="av3-field"><span className="av3-field-label">Notes</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="weather, road closures…" /></label>
    </Dialog>
  );
}

function RouteDialog({ route, locationSlug, onClose, onSaved }: { route: TruckRoute | null; locationSlug: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(route?.name ?? "");
  const [description, setDescription] = useState(route?.description ?? "");
  const [stops, setStops] = useState<TruckStop[]>(route?.stops ?? []);
  const [saving, setSaving] = useState(false);

  const setStop = (i: number, patch: Partial<TruckStop>) => setStops((a) => a.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addStop = () => setStops((a) => [...a, { name: "" }]);
  const removeStop = (i: number) => setStops((a) => a.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = { ...(route ? { id: route.id } : {}), name: name.trim(), description: description.trim() || undefined, stops: stops.filter((s) => s.name.trim()), locationSlug };
      const res = await fetch("/api/admin/truck-routes", { method: route ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={route ? route.name : "New route"} headerExtra={<Badge tone="neutral"><MapPin style={{ width: 11, height: 11 }} /> route</Badge>} width={560}
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" loading={saving} disabled={!name.trim()} onClick={save}>Save</Button></>}>
      <div className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Name</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={name} onChange={(e) => setName(e.target.value)} /></div>
      <label className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Description</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <div className="av3-subhead">Stops</div>
      {stops.length === 0 ? <div className="av3-empty-text" style={{ padding: "6px 0", color: "var(--av3-subtle)" }}>No stops yet.</div> : stops.map((s, i) => (
        <div key={i} className="av3-cfgrow" style={{ gridTemplateColumns: "1fr 90px 90px 30px", gap: 8, padding: "5px 0" }}>
          <input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={s.name} onChange={(e) => setStop(i, { name: e.target.value })} placeholder="Stop name" />
          <input className="av3-input" type="time" style={{ fontFamily: "var(--av3-ui)" }} value={s.startTime ?? ""} onChange={(e) => setStop(i, { startTime: e.target.value })} />
          <input className="av3-input" type="time" style={{ fontFamily: "var(--av3-ui)" }} value={s.endTime ?? ""} onChange={(e) => setStop(i, { endTime: e.target.value })} />
          <button type="button" className="av3-iconbtn-sm" aria-label="Remove stop" onClick={() => removeStop(i)}><X /></button>
        </div>
      ))}
      <div style={{ marginTop: 10 }}><Button variant="secondary" size="sm" onClick={addStop}><Plus className="av3-btn-ico" /> Add stop</Button></div>
    </Dialog>
  );
}
