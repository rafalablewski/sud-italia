"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, CalendarDays, LayoutGrid, ListChecks, Plus, Radio, Rows3, Users, X } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import type { BookingEvent, BookingEventStatus, EventRunSheet, RunSheetSegment } from "@/data/types";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, type BadgeTone, Button, type ColumnV3, Dialog, InfoButton, Kpi, SkeletonRows, Table } from "./ui";

const STATUS_LABEL: Record<BookingEventStatus, string> = { scheduled: "Scheduled", live: "Live", done: "Done", cancelled: "Cancelled" };
const STATUS_TONE: Record<BookingEventStatus, BadgeTone> = { scheduled: "warn", live: "info", done: "ok", cancelled: "neutral" };
const STATUSES: BookingEventStatus[] = ["scheduled", "live", "done", "cancelled"];

export function EventsV3() {
  const { location } = useAdminLocationV3();
  const all = useMemo(() => getActiveLocations(), []);
  const loc = location || all[0]?.slug || "krakow";
  const city = all.find((l) => l.slug === loc)?.city ?? loc;

  const [events, setEvents] = useState<BookingEvent[]>([]);
  const [routes, setRoutes] = useState<EventRunSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"events" | "routes">("events");
  const [view, setView] = useState<"board" | "table">("board");
  const [eventDialog, setEventDialog] = useState<BookingEvent | "new" | null>(null);
  const [routeDialog, setRouteDialog] = useState<EventRunSheet | "new" | null>(null);

  const load = useCallback(async () => {
    const [ev, rt] = await Promise.all([
      fetch(`/api/admin/events?location=${loc}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`/api/admin/run-sheets?location=${loc}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    setEvents(Array.isArray(ev) ? ev : []);
    setRoutes(Array.isArray(rt) ? rt : []);
    setLoading(false);
  }, [loc]);
  useEffect(() => { load(); }, [load]);

  const delEvent = async (id: string) => { const r = await fetch(`/api/admin/events?id=${encodeURIComponent(id)}`, { method: "DELETE" }); if (r.ok) await load(); };
  const delRoute = async (id: string) => { const r = await fetch(`/api/admin/run-sheets?id=${encodeURIComponent(id)}`, { method: "DELETE" }); if (r.ok) await load(); };

  const eventCols: ColumnV3<BookingEvent>[] = [
    { key: "name", header: "Event", render: (e) => <span style={{ fontWeight: 600 }}>{e.name}</span> },
    { key: "date", header: "Date", render: (e) => <span className="av3-cell-muted">{e.date}</span> },
    { key: "exp", header: "Expected", num: true, render: (e) => (e.expectedAttendance != null ? e.expectedAttendance.toLocaleString("pl-PL") : "—") },
    { key: "actual", header: "Revenue", num: true, render: (e) => (e.actualRevenueGrosze != null ? formatPrice(e.actualRevenueGrosze) : "—") },
    { key: "st", header: "Status", render: (e) => <Badge tone={STATUS_TONE[e.status]} dot>{STATUS_LABEL[e.status]}</Badge> },
    { key: "del", header: "", render: (e) => <button type="button" className="av3-iconbtn-sm" aria-label="Delete" onClick={(ev) => { ev.stopPropagation(); delEvent(e.id); }}><X /></button> },
  ];
  const routeCols: ColumnV3<EventRunSheet>[] = [
    { key: "name", header: "Run sheet", render: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { key: "desc", header: "Description", render: (r) => <span className="av3-cell-muted">{r.description || "—"}</span> },
    { key: "stops", header: "Segments", num: true, render: (r) => `${r.stops?.length ?? 0}` },
    { key: "del", header: "", render: (r) => <button type="button" className="av3-iconbtn-sm" aria-label="Delete" onClick={(ev) => { ev.stopPropagation(); delRoute(r.id); }}><X /></button> },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Events &amp; bookings</h1>
          <div className="av3-pagehead-sub">Private bookings, catering &amp; special events · {city}{!location ? " (pick a location to switch)" : ""}</div>
        </div>
        <div className="av3-pagehead-actions">
          {tab === "events" ? (
            <Button variant="primary" size="sm" onClick={() => setEventDialog("new")}><Plus className="av3-btn-ico" /> Add event</Button>
          ) : (
            <Button variant="primary" size="sm" onClick={() => setRouteDialog("new")}><Plus className="av3-btn-ico" /> Add run sheet</Button>
          )}
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="Events" icon={CalendarDays} value={`${events.length}`} accentVar="--av3-c3" />
        <Kpi label="Revenue" icon={Banknote} value={formatPrice(events.reduce((s, e) => s + (e.actualRevenueGrosze ?? 0), 0))} accentVar="--av3-c1"
          info={<InfoButton title="Event revenue" description="Total recorded takings across this location's events — private bookings, catering and special events."
            institutional="Events are a capacity-light growth channel: they borrow the brand and the kitchen without a second lease. The discipline is yield per event — revenue ÷ events should clear the marginal cost of staffing and stock for the day, and ideally beat an average in-store day. A long tail of low-revenue events is brand exposure, not a P&L line; treat those as marketing, not revenue."
            plain="If eight events brought in 24,000 zł, that's ~3,000 zł a day the kitchen earned on top of the dining room. One strong private booking can be worth a slow weekday of covers."
            tips="Record actual revenue on every 'done' event so this stays real; double down on the event types with the best per-event yield; pair high-expected-guest events with extra stock and a second pair of hands; cancel rather than under-staff a thin booking."
            methodology="Sum of actualRevenueGrosze over the location's events (/api/admin/events). Events without recorded revenue contribute zero — fill it in on the event editor when the day closes." />} />
        <Kpi label="Expected guests" icon={Users} value={events.reduce((s, e) => s + (e.expectedAttendance ?? 0), 0).toLocaleString("pl-PL")} accentVar="--av3-c4"
          info={<InfoButton title="Expected guests" description="Sum of expected attendance across the location's scheduled and upcoming events — your demand-planning number."
            institutional="Expected attendance is the input to prep, stock and staffing for event days. The institutional value is in the gap between expected and actual: a persistent over-estimate wastes stock and labour, a persistent under-estimate sells out early and leaves money (and goodwill) on the table. Calibrate it against recorded revenue to turn guesses into a forecast."
            plain="If three weekend events expect 1,200 guests between them, you know roughly how much dough to prep and how many people to roster — instead of finding out at 13:00 that you're short."
            tips="Set a realistic expected count on every event from the organiser's figure or last year's; after the event, compare to actual revenue and adjust your conversion assumption; flag big events early so purchasing and rota can react."
            methodology="Sum of expectedAttendance over the location's events. Used for prep/stock planning; compare against the Revenue tile to sanity-check your spend-per-guest assumption." />} />
        <Kpi label="Live / upcoming" icon={Radio} value={`${events.filter((e) => e.status === "live" || e.status === "scheduled").length}`} accentVar="--av3-c5" />
      </div>

      <div className="av3-filterchips">
        <button type="button" className={`av3-fchip ${tab === "events" ? "is-active" : ""}`} onClick={() => setTab("events")}>Events<span className="av3-fchip-count">{events.length}</span></button>
        <button type="button" className={`av3-fchip ${tab === "routes" ? "is-active" : ""}`} onClick={() => setTab("routes")}>Run sheets<span className="av3-fchip-count">{routes.length}</span></button>
      </div>

      {tab === "events" && !loading && events.length > 0 && (
        <div className="av3-toolbar">
          <span className="av3-toolbar-spacer" />
          <span className="av3-cell-muted" style={{ fontSize: 12 }}>{events.length} event{events.length === 1 ? "" : "s"}</span>
          <div className="av3-viewtoggle" role="tablist" aria-label="Event view">
            <button type="button" role="tab" aria-selected={view === "board"} className={view === "board" ? "is-active" : ""} onClick={() => setView("board")} aria-label="Board view" title="Board view"><LayoutGrid /></button>
            <button type="button" role="tab" aria-selected={view === "table"} className={view === "table" ? "is-active" : ""} onClick={() => setView("table")} aria-label="Table view" title="Table view"><Rows3 /></button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={6} /></div>
      ) : tab === "events" ? (
        events.length === 0 ? (
          <div className="av3-card" style={{ padding: 0 }}><div className="av3-empty"><div className="av3-empty-title">No events</div><div className="av3-empty-text">Schedule a private booking, catering job or special event.</div></div></div>
        ) : view === "table" ? (
          <div className="av3-card" style={{ padding: 0 }}>
            <Table columns={eventCols} rows={events} rowKey={(e) => e.id} onRowClick={(e) => setEventDialog(e)} />
          </div>
        ) : (
          <EventBoard events={events} onOpen={(e) => setEventDialog(e)} />
        )
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {routes.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No run sheets</div><div className="av3-empty-text">Build a run sheet — timed segments for an event (setup, service, teardown).</div></div>
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

/* ── event board (card view) ───────────────────────────────────────────── */
function EventBoard({ events, onOpen }: { events: BookingEvent[]; onOpen: (e: BookingEvent) => void }) {
  // Upcoming (scheduled/live) first, then by date — mirrors how the day runs.
  const sorted = useMemo(() => {
    const rank = (e: BookingEvent) => (e.status === "live" ? 0 : e.status === "scheduled" ? 1 : e.status === "done" ? 2 : 3);
    return [...events].sort((a, b) => rank(a) - rank(b) || a.date.localeCompare(b.date));
  }, [events]);
  return (
    <div className="av3-board">
      {sorted.map((e) => (
        <div key={e.id} className="av3-dcard" data-dim={e.status === "cancelled"} role="button" tabIndex={0}
          onClick={() => onOpen(e)}
          onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onOpen(e); } }}>
          <div className="av3-dcard-name">{e.name}</div>
          <div className="av3-dcard-badges">
            <Badge tone={STATUS_TONE[e.status]} dot>{STATUS_LABEL[e.status]}</Badge>
            <Badge tone="neutral">{e.date}</Badge>
          </div>
          <div className="av3-dcard-foot">
            <div>
              <div className="av3-dcard-price">{e.actualRevenueGrosze != null ? formatPrice(e.actualRevenueGrosze) : "—"}</div>
              <div className="av3-dcard-sub">{e.expectedAttendance != null ? `${e.expectedAttendance.toLocaleString("pl-PL")} expected` : "no estimate"}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EventDialog({ event, routes, locationSlug, onClose, onSaved }: { event: BookingEvent | null; routes: EventRunSheet[]; locationSlug: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(event?.name ?? "");
  const [date, setDate] = useState(event?.date ?? new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<BookingEventStatus>(event?.status ?? "scheduled");
  const [expected, setExpected] = useState(event?.expectedAttendance != null ? String(event.expectedAttendance) : "");
  const [routeId, setRouteId] = useState(event?.routeId ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = { ...(event ? { id: event.id } : {}), name: name.trim(), date, status, expectedAttendance: expected ? Number(expected) : undefined, routeId: routeId || undefined, notes: notes.trim() || undefined, locationSlug };
      const res = await fetch("/api/admin/events", { method: event ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
        <label className="av3-field"><span className="av3-field-label">Status</span><select className="av3-select" value={status} onChange={(e) => setStatus(e.target.value as BookingEventStatus)}>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></label>
        <label className="av3-field"><span className="av3-field-label">Expected</span><input className="av3-input" type="number" value={expected} onChange={(e) => setExpected(e.target.value)} /></label>
      </div>
      <label className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Run sheet (optional)</span><select className="av3-select" value={routeId} onChange={(e) => setRouteId(e.target.value)}><option value="">—</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label className="av3-field"><span className="av3-field-label">Notes</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="dietary needs, setup notes…" /></label>
    </Dialog>
  );
}

function RouteDialog({ route, locationSlug, onClose, onSaved }: { route: EventRunSheet | null; locationSlug: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(route?.name ?? "");
  const [description, setDescription] = useState(route?.description ?? "");
  const [stops, setStops] = useState<RunSheetSegment[]>(route?.stops ?? []);
  const [saving, setSaving] = useState(false);

  const setStop = (i: number, patch: Partial<RunSheetSegment>) => setStops((a) => a.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addStop = () => setStops((a) => [...a, { name: "" }]);
  const removeStop = (i: number) => setStops((a) => a.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = { ...(route ? { id: route.id } : {}), name: name.trim(), description: description.trim() || undefined, stops: stops.filter((s) => s.name.trim()), locationSlug };
      const res = await fetch("/api/admin/run-sheets", { method: route ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={route ? route.name : "New run sheet"} headerExtra={<Badge tone="neutral"><ListChecks style={{ width: 11, height: 11 }} /> run sheet</Badge>} width={560}
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" loading={saving} disabled={!name.trim()} onClick={save}>Save</Button></>}>
      <div className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Name</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={name} onChange={(e) => setName(e.target.value)} /></div>
      <label className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Description</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <div className="av3-subhead">Segments</div>
      {stops.length === 0 ? <div className="av3-empty-text" style={{ padding: "6px 0", color: "var(--av3-subtle)" }}>No segments yet.</div> : stops.map((s, i) => (
        <div key={i} className="av3-cfgrow" style={{ gridTemplateColumns: "1fr 90px 90px 30px", gap: 8, padding: "5px 0" }}>
          <input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={s.name} onChange={(e) => setStop(i, { name: e.target.value })} placeholder="Segment name" aria-label="Segment name" title="Segment name" />
          <input className="av3-input" type="time" style={{ fontFamily: "var(--av3-ui)" }} value={s.startTime ?? ""} onChange={(e) => setStop(i, { startTime: e.target.value })} aria-label="Start time" title="Start time" />
          <input className="av3-input" type="time" style={{ fontFamily: "var(--av3-ui)" }} value={s.endTime ?? ""} onChange={(e) => setStop(i, { endTime: e.target.value })} aria-label="End time" title="End time" />
          <button type="button" className="av3-iconbtn-sm" aria-label="Remove segment" onClick={() => removeStop(i)}><X /></button>
        </div>
      ))}
      <div style={{ marginTop: 10 }}><Button variant="secondary" size="sm" onClick={addStop}><Plus className="av3-btn-ico" /> Add segment</Button></div>
    </Dialog>
  );
}
