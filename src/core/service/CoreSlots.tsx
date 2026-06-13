"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CoreShell } from "@/core/shell/CoreShell";
import { CoreDialog } from "@/core/ui/Dialog";
import { useCoreToast } from "@/core/ui/Toast";
import { useLocation } from "@/shared/LocationContext";
import type { FulfillmentType, TimeSlot } from "@/data/types";
import { serviceTabs } from "./serviceTabs";

const FULFIL: { key: FulfillmentType; label: string }[] = [
  { key: "dine-in", label: "Dine-in" },
  { key: "takeout", label: "Takeaway" },
  { key: "delivery", label: "Delivery" },
];

interface DemandSlotRow {
  slotId: string;
  time: string;
  maxOrders: number;
  currentOrders: number;
  predictedDemand: number;
  tier: "under" | "healthy" | "tight" | "over" | "kitchen-capped";
  recommendedMaxOrders: number;
  minSpendGrosze: number;
  recommendedMinSpendGrosze: number;
  action: "raise" | "trim" | "protect" | "hold";
  missedDemand: number;
  note: string;
}
interface DemandBoard {
  date: string;
  kitchenCoversPerHour: number | null;
  slots: DemandSlotRow[];
  summary: { predictedCovers: number; fillForecastPct: number; missedDemand: number };
}

const ACTION_LABEL: Record<DemandSlotRow["action"], string> = {
  raise: "Raise capacity",
  trim: "Trim / promote",
  protect: "Protect kitchen",
  hold: "Hold",
};

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayLocal(): string {
  return isoOf(new Date());
}
// Mon→Sun ISO dates of the week containing `d`.
function weekDates(d: string): string[] {
  if (!d) return [];
  const base = new Date(`${d}T00:00:00`);
  const mondayOffset = (base.getDay() + 6) % 7;
  const mon = new Date(base);
  mon.setDate(base.getDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(mon);
    x.setDate(mon.getDate() + i);
    return isoOf(x);
  });
}
function dayLabel(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
const zl = (g: number) => (g / 100).toFixed(0);
const zl0 = (g: number) => `${Math.round(g / 100)} zł`;

/**
 * Core · Service · Slots — capacity + the Demand Exchange, wired to today's
 * /core/service/slots engine: GET /api/admin/slots (capacity) +
 * /api/admin/demand-exchange (forecast). Toggle active/draft (PUT slots), apply
 * a demand lever (POST demand-exchange single / apply-all). Own core- UI.
 */
export function CoreSlots() {
  const toast = useCoreToast();
  const { location, activeLocations } = useLocation();
  const loc = location || activeLocations[0]?.slug || "krakow";
  // Seed the date on the client only (local timezone) so SSR (UTC) doesn't
  // mismatch and trip a hydration warning.
  const [date, setDate] = useState("");
  useEffect(() => {
    setDate(todayLocal());
  }, []);
  const [tab, setTab] = useState<"manage" | "demand">("manage");
  const [range, setRange] = useState<"day" | "week">("day");
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [board, setBoard] = useState<DemandBoard | null>(null);
  const [acting, setActing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [cMode, setCMode] = useState<"bulk" | "single">("bulk");
  const [cTime, setCTime] = useState("18:00");
  const [cStart, setCStart] = useState("18:00");
  const [cEnd, setCEnd] = useState("21:00");
  const [cInterval, setCInterval] = useState("30");
  const [cMax, setCMax] = useState("16");
  const [cFulfil, setCFulfil] = useState<Set<FulfillmentType>>(new Set(["dine-in"]));

  const loadSlots = useCallback(async () => {
    if (!date) return;
    // Week view pulls the whole location (all dates) and slices client-side;
    // day view scopes to the date server-side.
    const qs = range === "week" ? `?location=${encodeURIComponent(loc)}` : `?location=${encodeURIComponent(loc)}&date=${date}`;
    const r = await fetch(`/api/admin/slots${qs}`);
    const d = r.ok ? await r.json() : [];
    setSlots(Array.isArray(d) ? d : d.slots ?? []);
  }, [loc, date, range]);
  const loadBoard = useCallback(async () => {
    if (!date) return;
    const r = await fetch(`/api/admin/demand-exchange?location=${encodeURIComponent(loc)}&date=${date}`);
    const d = r.ok ? await r.json() : null;
    setBoard(d?.board ?? null);
  }, [loc, date]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);
  useEffect(() => {
    if (tab === "demand") void loadBoard();
  }, [tab, loadBoard]);

  const week = useMemo(() => weekDates(date), [date]);
  const scoped = useMemo(
    () => (range === "week" ? slots.filter((s) => week.includes(s.date)) : slots.filter((s) => s.date === date)),
    [slots, range, week, date],
  );
  const ordered = useMemo(() => [...scoped].sort((a, b) => a.time.localeCompare(b.time)), [scoped]);
  const byDay = useMemo(() => week.map((d) => [d, ordered.filter((s) => s.date === d)] as const), [week, ordered]);
  const kpis = useMemo(() => {
    const cap = scoped.reduce((s, x) => s + x.maxOrders, 0);
    const booked = scoped.reduce((s, x) => s + x.currentOrders, 0);
    const peak = Math.max(0, ...scoped.map((x) => (x.maxOrders ? x.currentOrders / x.maxOrders : 0)));
    const mult = peak >= 0.85 ? "1.2×" : peak >= 0.7 ? "1.1×" : "1.0×";
    return [
      { l: range === "week" ? "Slots / wk" : "Slots", v: String(scoped.length) },
      { l: "Booked", v: String(booked) },
      { l: "Fill rate", v: cap ? `${Math.round((booked / cap) * 100)}%` : "—" },
      { l: "Demand price", v: mult },
    ];
  }, [scoped, range]);

  const toggleSlot = async (slot: TimeSlot) => {
    if (acting) return;
    setActing(true);
    try {
      const next = slot.status === "active" ? "draft" : "active";
      const r = await fetch("/api/admin/slots", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: slot.id, status: next }),
      });
      if (r.ok) {
        setSlots((xs) => xs.map((x) => (x.id === slot.id ? { ...x, status: next } : x)));
      } else toast("Could not update slot", "danger");
    } finally {
      setActing(false);
    }
  };

  const createSlots = async () => {
    const fulfil = [...cFulfil];
    const maxOrders = parseInt(cMax, 10);
    if (fulfil.length === 0 || !Number.isFinite(maxOrders)) {
      toast("Pick a channel + valid capacity", "danger");
      return;
    }
    setActing(true);
    try {
      let r: Response;
      if (cMode === "single") {
        r = await fetch("/api/admin/slots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locationSlug: loc, date, time: cTime, fulfillmentTypes: fulfil, maxOrders, status: "active" }),
        });
      } else {
        const interval = parseInt(cInterval, 10);
        if (!Number.isFinite(interval)) {
          toast("Enter a valid interval", "danger");
          setActing(false);
          return;
        }
        r = await fetch("/api/admin/slots?bulk=1", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locationSlug: loc,
            date,
            fulfillmentTypes: fulfil,
            bulk: { startTime: cStart, endTime: cEnd, interval },
            maxOrders,
            status: "active",
          }),
        });
      }
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        // Optimistic insert from the authoritative server response — the new
        // slot(s) appear instantly instead of vanishing until a refetch lands.
        const created = (Array.isArray(d) ? d : [d]).filter(
          (s): s is TimeSlot => !!s && typeof (s as TimeSlot).id === "string",
        );
        setSlots((xs) => {
          const have = new Set(xs.map((x) => x.id));
          return [...xs, ...created.filter((c) => !have.has(c.id))];
        });
        const n = created.length || (Array.isArray(d) ? d.length : 1);
        toast(`Created ${n} slot${n === 1 ? "" : "s"}`, "success");
        setCreateOpen(false);
      } else toast((d as { error?: string }).error || "Could not create slots", "danger");
    } finally {
      setActing(false);
    }
  };
  const deleteSlot = async (slot: TimeSlot) => {
    if (acting) return;
    setActing(true);
    try {
      const r = await fetch(`/api/admin/slots?id=${encodeURIComponent(slot.id)}`, { method: "DELETE" });
      if (r.ok) {
        setSlots((xs) => xs.filter((x) => x.id !== slot.id));
        toast(`${slot.time} slot deleted`, "success");
      } else toast("Could not delete", "danger");
    } finally {
      setActing(false);
    }
  };

  const applyOne = async (row: DemandSlotRow) => {
    if (acting) return;
    setActing(true);
    try {
      const r = await fetch(`/api/admin/demand-exchange?location=${encodeURIComponent(loc)}&date=${date}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: row.slotId, maxOrders: row.recommendedMaxOrders, minSpendGrosze: row.recommendedMinSpendGrosze }),
      });
      if (r.ok) {
        toast(`${row.time} → ${row.recommendedMaxOrders} covers`, "success");
        await Promise.all([loadBoard(), loadSlots()]);
      } else toast("Could not apply", "danger");
    } finally {
      setActing(false);
    }
  };
  const applyAll = async () => {
    if (acting) return;
    setActing(true);
    try {
      const r = await fetch(`/api/admin/demand-exchange?location=${encodeURIComponent(loc)}&date=${date}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "apply-all" }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        toast(`Applied ${d.applied ?? "all"} levers`, "success");
        await Promise.all([loadBoard(), loadSlots()]);
      } else toast("Could not apply", "danger");
    } finally {
      setActing(false);
    }
  };

  const changeCount = board?.slots.filter((r) => r.recommendedMaxOrders !== r.maxOrders || r.recommendedMinSpendGrosze !== r.minSpendGrosze).length ?? 0;

  const slotRow = (s: TimeSlot) => {
    const pct = s.maxOrders ? Math.round((s.currentOrders / s.maxOrders) * 100) : 0;
    return (
      <div key={s.id} className={`core-slot ${s.status === "draft" ? "draft" : ""}`}>
        <span className="st mono">{s.time}</span>
        <div className="bar"><div className="fill" style={{ width: `${Math.min(100, pct)}%`, background: pct >= 85 ? "var(--danger)" : pct >= 70 ? "var(--amber)" : "var(--basil)" }} /></div>
        <span className="cap mono">{s.currentOrders}/{s.maxOrders}</span>
        <span className="ch">
          {s.fulfillmentTypes.join(" · ")}
          {s.minSpendGrosze ? <span className="core-slot-min">min {zl0(s.minSpendGrosze)}</span> : null}
        </span>
        <button className={`core-pill-btn ${s.status}`} onClick={() => void toggleSlot(s)}>{s.status}</button>
        <button className="core-slot-x" title="Delete slot" onClick={() => void deleteSlot(s)} aria-label="Delete slot">✕</button>
      </div>
    );
  };

  return (
    <CoreShell
      eyebrow="Service · Floor & Slots"
      tabs={serviceTabs("slots")}
      subRight={
        <>
          <div className="core-seg">
            <button className={tab === "manage" ? "on" : ""} onClick={() => setTab("manage")}>Manage</button>
            <button className={tab === "demand" ? "on" : ""} onClick={() => setTab("demand")}>Demand</button>
          </div>
          {tab === "manage" && (
            <div className="core-seg">
              <button className={range === "day" ? "on" : ""} onClick={() => setRange("day")}>Day</button>
              <button className={range === "week" ? "on" : ""} onClick={() => setRange("week")}>Week</button>
            </div>
          )}
          {tab === "manage" && (
            <button type="button" className="core-chip" style={{ height: 32 }} onClick={() => setCreateOpen(true)}>+ New</button>
          )}
          <input className="core-inp" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ height: 32 }} />
        </>
      }
    >
      <div className="core-guest-inbox">
        {tab === "manage" ? (
          <>
            <div className="core-kpi-strip" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
              {kpis.map((k) => (
                <div className="k" key={k.l}><div className="kl">{k.l}</div><div className="kv mono">{k.v}</div></div>
              ))}
            </div>
            <div className="core-crm-table-wrap" style={{ padding: 16 }}>
              {ordered.length === 0 ? (
                <div className="core-kds-empty pad">No slots for this {range === "week" ? "week" : "day"}.</div>
              ) : range === "week" ? (
                <div className="core-slot-week">
                  {byDay.map(([d, daySlots]) => (
                    <div key={d} className="core-slot-day">
                      <div className="core-slot-day-h">
                        <span>{dayLabel(d)}</span>
                        <span className="n">{daySlots.length}</span>
                      </div>
                      {daySlots.length === 0 ? (
                        <div className="core-slot-day-empty">No slots</div>
                      ) : (
                        <div className="core-slot-list">{daySlots.map(slotRow)}</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="core-slot-list">{ordered.map(slotRow)}</div>
              )}
            </div>
          </>
        ) : (
          <>
            {board && (
              <div className="core-demand-head">
                <span className="core-cust-sub">~{board.summary.predictedCovers} covers · {Math.round(board.summary.fillForecastPct)}% fill · {board.summary.missedDemand} walked{board.kitchenCoversPerHour ? ` · kitchen ${board.kitchenCoversPerHour}/hr` : ""}</span>
                {changeCount > 0 && <button className="core-btn primary" disabled={acting} onClick={() => void applyAll()}>Apply all ({changeCount})</button>}
              </div>
            )}
            <div className="core-crm-table-wrap">
              {!board ? (
                <div className="core-kds-empty pad">Loading demand board…</div>
              ) : board.slots.length === 0 ? (
                <div className="core-kds-empty pad">No slots to forecast for this day.</div>
              ) : (
                <table className="core-tbl">
                  <thead>
                    <tr><th>Time</th><th>Tier</th><th className="num">Booked</th><th className="num">Forecast</th><th className="num">Cap → rec</th><th>Action</th><th></th></tr>
                  </thead>
                  <tbody>
                    {board.slots.map((r) => {
                      const changed = r.recommendedMaxOrders !== r.maxOrders || r.recommendedMinSpendGrosze !== r.minSpendGrosze;
                      return (
                        <tr key={r.slotId} title={r.note}>
                          <td className="mono">{r.time}</td>
                          <td><span className={`core-tier-d ${r.tier}`}>{r.tier}</span></td>
                          <td className="num mono">{r.currentOrders}</td>
                          <td className="num mono">{r.predictedDemand}</td>
                          <td className="num mono">{r.maxOrders}{changed ? ` → ${r.recommendedMaxOrders}` : ""}{r.recommendedMinSpendGrosze > 0 ? ` · min ${zl(r.recommendedMinSpendGrosze)}` : ""}</td>
                          <td><span className={`core-act ${r.action}`}>{ACTION_LABEL[r.action]}</span></td>
                          <td>{changed && <button className="core-btn sm" disabled={acting} onClick={() => void applyOne(r)}>Apply</button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      <CoreDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={`New ${cMode === "bulk" ? "slots" : "slot"} · ${date}`}
        footer={
          <>
            <div className="core-seg" style={{ marginRight: "auto" }}>
              <button type="button" className={cMode === "single" ? "on" : ""} onClick={() => setCMode("single")}>Single</button>
              <button type="button" className={cMode === "bulk" ? "on" : ""} onClick={() => setCMode("bulk")}>Bulk</button>
            </div>
            <button className="core-btn ghost" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="core-btn primary" disabled={acting} onClick={() => void createSlots()}>Create</button>
          </>
        }
      >
        <div className="core-slot-create">
          <label>Channels
            <div className="core-segs" style={{ marginTop: 6 }}>
              {FULFIL.map((f) => (
                <button
                  key={f.key}
                  className={cFulfil.has(f.key) ? "on" : ""}
                  onClick={() =>
                    setCFulfil((s) => {
                      const n = new Set(s);
                      if (n.has(f.key)) n.delete(f.key);
                      else n.add(f.key);
                      return n;
                    })
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>
          </label>
          {cMode === "single" ? (
            <div className="core-slot-create-grid two">
              <label>Time<input className="core-inp" type="time" value={cTime} onChange={(e) => setCTime(e.target.value)} /></label>
              <label>Capacity<input className="core-inp" value={cMax} onChange={(e) => setCMax(e.target.value)} /></label>
            </div>
          ) : (
            <div className="core-slot-create-grid">
              <label>Start<input className="core-inp" type="time" value={cStart} onChange={(e) => setCStart(e.target.value)} /></label>
              <label>End<input className="core-inp" type="time" value={cEnd} onChange={(e) => setCEnd(e.target.value)} /></label>
              <label>Every (min)<input className="core-inp" value={cInterval} onChange={(e) => setCInterval(e.target.value)} /></label>
              <label>Capacity<input className="core-inp" value={cMax} onChange={(e) => setCMax(e.target.value)} /></label>
            </div>
          )}
          <p className="core-cust-sub">
            {cMode === "single"
              ? `Adds one active slot at ${cTime}, ${cMax} covers.`
              : `Generates active slots from ${cStart} to ${cEnd} every ${cInterval} min, ${cMax} covers each.`}
          </p>
        </div>
      </CoreDialog>
    </CoreShell>
  );
}
