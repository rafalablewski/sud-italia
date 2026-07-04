"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CoreShell } from "@/core/shell/CoreShell";
import { CoreCrumb } from "@/core/shell/CoreCrumb";
import { CoreSectionHead } from "@/core/shell/CoreSectionHead";
import { CoreSurfToolbar } from "@/core/shell/CoreSurfToolbar";
import { PlusIcon } from "@/core/shell/toolIcons";
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
// Service period label derived from the day's real slot times (Rule #1) — the
// mockup's "dinner"/"lunch" tag under the section head.
function servicePeriod(times: string[]): string {
  const hrs = times.map((t) => parseInt(t.slice(0, 2), 10)).filter((n) => Number.isFinite(n));
  if (!hrs.length) return "";
  const min = Math.min(...hrs), max = Math.max(...hrs);
  const lunch = min < 16, dinner = max >= 16;
  if (lunch && dinner) return "lunch + dinner";
  if (dinner) return "dinner";
  if (min < 11) return "breakfast";
  return "lunch";
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
  const [range, setRange] = useState<"day" | "week">("day");
  // Leading Manage|Demand segment. Both panels stay mounted on desktop; the
  // toggle only chooses which one shows once the grid collapses to one column.
  const [panel, setPanel] = useState<"manage" | "demand">("manage");
  // Channel filter behind the "Filters" ghost button — real, wired to slot
  // fulfillmentTypes (Rule #1), cycles all → dine-in → takeaway → delivery.
  const [chan, setChan] = useState<FulfillmentType | "all">("all");
  const [surgeDismissed, setSurgeDismissed] = useState(false);
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
  // Demand exchange sits alongside Manage (dense-console: both columns live),
  // so the board loads on every date/location change, not on a tab toggle.
  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const week = useMemo(() => weekDates(date), [date]);
  const scoped = useMemo(() => {
    const base = range === "week" ? slots.filter((s) => week.includes(s.date)) : slots.filter((s) => s.date === date);
    return chan === "all" ? base : base.filter((s) => s.fulfillmentTypes.includes(chan));
  }, [slots, range, week, date, chan]);
  const ordered = useMemo(() => [...scoped].sort((a, b) => a.time.localeCompare(b.time)), [scoped]);
  const byDay = useMemo(() => week.map((d) => [d, ordered.filter((s) => s.date === d)] as const), [week, ordered]);
  // Dense-console stat strip + surge state — every figure from live slot data
  // (Rule #1). A "surge window" is one filled ≥85%; peak drives demand price.
  const stat = useMemo(() => {
    const cap = scoped.reduce((s, x) => s + x.maxOrders, 0);
    const booked = scoped.reduce((s, x) => s + x.currentOrders, 0);
    const active = scoped.filter((x) => x.status === "active").length;
    const withPct = scoped.map((x) => ({ x, pct: x.maxOrders ? x.currentOrders / x.maxOrders : 0 }));
    const surge = withPct.filter((r) => r.pct >= 0.85);
    const peak = withPct.reduce((m, r) => (r.pct > m.pct ? r : m), { x: undefined as TimeSlot | undefined, pct: 0 });
    const fillPct = cap ? Math.round((booked / cap) * 100) : 0;
    const mult = peak.pct >= 0.85 ? "1.2×" : peak.pct >= 0.7 ? "1.1×" : "1.0×";
    // Surge windows sorted by time, for the banner range.
    const surgeTimes = surge.map((r) => r.x.time).sort();
    return {
      booked, cap, active, fillPct,
      surgeCount: surge.length,
      peakPct: Math.round(peak.pct * 100),
      peakTime: peak.x?.time ?? "—",
      mult,
      surgeRange: surgeTimes.length ? `${surgeTimes[0]}–${surgeTimes[surgeTimes.length - 1]}` : "",
    };
  }, [scoped]);
  const showSurge = stat.surgeCount > 0 && !surgeDismissed;

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

  const period = servicePeriod(ordered.map((s) => s.time));
  const dateDisplay = date ? new Date(`${date}T00:00:00`).toLocaleDateString("en-GB") : "—";
  const CHAN_CYCLE: (FulfillmentType | "all")[] = ["all", "dine-in", "takeout", "delivery"];
  const cycleChan = () => setChan((c) => CHAN_CYCLE[(CHAN_CYCLE.indexOf(c) + 1) % CHAN_CYCLE.length]);
  const chanLabel = chan === "all" ? "Filters" : `Filters · ${FULFIL.find((f) => f.key === chan)?.label ?? chan}`;
  const refresh = () => {
    void loadSlots();
    void loadBoard();
    toast("Refreshed slots + demand", "success");
  };

  // Dense-console service-window row (mockup `.mslot`): time · fill bar with a
  // booked/status meta line · tier chip · N/max. Tap the tier chip to toggle
  // active/draft; hover reveals a delete affordance (both features preserved).
  const slotRow = (s: TimeSlot) => {
    const pct = s.maxOrders ? Math.round((s.currentOrders / s.maxOrders) * 100) : 0;
    const tier = pct >= 100 ? "full" : pct >= 70 ? "tight" : "healthy";
    const statusText = pct >= 100 ? "full" : pct >= 85 ? "filling fast" : `seats to ${s.maxOrders}`;
    return (
      <div key={s.id} className={`core-mslot ${s.status === "draft" ? "draft" : ""}`}>
        <span className="tm">{s.time}</span>
        <div className="barwrap">
          <div className="mbar"><i className={tier} style={{ width: `${Math.min(100, pct)}%` }} /></div>
          <div className="meta">
            <span>{s.currentOrders} booked{s.minSpendGrosze ? ` · min ${zl0(s.minSpendGrosze)}` : ""}</span>
            <span>{statusText}</span>
          </div>
        </div>
        <button className={`core-tchip ${tier}`} title={`${s.status} — tap to ${s.status === "active" ? "unpublish" : "publish"}`} onClick={() => void toggleSlot(s)}>{tier}</button>
        <span className="mcap">{s.currentOrders} / {s.maxOrders}</span>
        <button className="mslot-x" title="Delete slot" onClick={() => void deleteSlot(s)} aria-label="Delete slot">✕</button>
      </div>
    );
  };
  const LEVER: Record<DemandSlotRow["action"], { cls: string; label: (r: DemandSlotRow) => string }> = {
    raise: { cls: "raise", label: (r) => (r.recommendedMaxOrders > r.maxOrders ? `raise +${r.recommendedMaxOrders - r.maxOrders}` : "raise") },
    trim: { cls: "trim", label: (r) => (r.recommendedMaxOrders < r.maxOrders ? `trim −${r.maxOrders - r.recommendedMaxOrders}` : "trim") },
    protect: { cls: "protect", label: () => "protect" },
    hold: { cls: "hold", label: () => "hold" },
  };

  return (
    <CoreShell eyebrow="Service · Tables & Slots" tabs={serviceTabs("slots")}>
      <div className="core-guest-inbox">
        <CoreCrumb section="SERVICE" page="SLOTS" mode="demand exchange" />
        <CoreSectionHead
          section="Service"
          page="Slots"
          sub={<>{loc}{date ? ` · ${dayLabel(date).toLowerCase()}` : " · today"}{period ? ` · ${period}` : ""}</>}
          actions={
            /* Manage|Demand mode switch — the view/scope toggle, pinned title-row right. */
            <div className="core-seg" role="tablist" aria-label="Mode">
              <span className="sglab">Mode</span>
              <button type="button" role="tab" aria-selected={panel === "manage"} className={panel === "manage" ? "on" : undefined} onClick={() => setPanel("manage")}>Manage</button>
              <button type="button" role="tab" aria-selected={panel === "demand"} className={panel === "demand" ? "on" : undefined} onClick={() => setPanel("demand")}>Demand</button>
            </div>
          }
        />
        {/* Row 4 — filters left (range · date · channel), actions right (New slot · Refresh). */}
        <CoreSurfToolbar
          ariaLabel="Slot controls"
          left={
            <>
              <div className="core-seg">
                <button className={range === "day" ? "on" : ""} onClick={() => setRange("day")}>Day</button>
                <button className={range === "week" ? "on" : ""} onClick={() => setRange("week")}>Week</button>
              </div>
              <label className="core-datefield core-slots-date" title="Change date">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M8 2v4M16 2v4M3 8h18M4 6h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" /></svg>
                <span className="dv">{dateDisplay}</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="m6 9 6 6 6-6" /></svg>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} onClick={(e) => { try { (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* not supported */ } }} aria-label="Date" />
              </label>
              <button type="button" className={`core-ghostbtn ${chan !== "all" ? "on" : ""}`} onClick={cycleChan}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 6h16M7 12h10M10 18h4" /></svg>{chanLabel}
              </button>
            </>
          }
          right={
            <>
              <button type="button" className="core-slot-add" onClick={() => setCreateOpen(true)}><PlusIcon />New slot</button>
              <button type="button" className="core-ghostbtn" onClick={refresh}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" /></svg>Refresh
              </button>
            </>
          }
        />

        {/* dense-console 6-up stat strip — every figure from live slot data (Rule #1). */}
        <div className="core-statstrip" role="group" aria-label="Slot metrics">
          <div className="cell">
            <span className="lab">Booked</span>
            <span className="val">{stat.booked}</span>
            <span className="delta">{scoped.length} window{scoped.length === 1 ? "" : "s"}</span>
          </div>
          <div className="cell">
            <span className="lab">Capacity</span>
            <span className="val">{stat.cap}</span>
            <span className="delta">{stat.active} active</span>
          </div>
          <div className="cell">
            <span className="lab">Fill</span>
            <span className="val basil">{stat.fillPct}<small>%</small></span>
            <span className="delta">peak {stat.peakPct}%</span>
          </div>
          <div className="cell">
            <span className="lab">Surge windows</span>
            <span className={stat.surgeCount > 0 ? "val amber" : "val"}>{stat.surgeCount}</span>
            <span className={stat.surgeCount > 0 ? "delta dn" : "delta"}>{stat.surgeCount > 0 ? stat.surgeRange : "on pace"}</span>
          </div>
          <div className="cell">
            <span className="lab">Covers booked</span>
            <span className="val info">{stat.booked}</span>
            <span className="delta">{board ? `${board.summary.predictedCovers} forecast` : `${scoped.length} windows`}</span>
          </div>
          <div className="cell">
            <span className="lab">No-show risk</span>
            <span className="val">—</span>
            <span className="delta dn">unconfirmed</span>
          </div>
        </div>

        {showSurge && (
          <div className="core-surge-banner" role="status">
            <span className="sb-ic" aria-hidden>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7z" /></svg>
            </span>
            <span className="sb-txt">
              <span className="sb-h">Demand surge · {stat.surgeRange}</span>
              <span className="sb-s"><b>{stat.surgeCount} window{stat.surgeCount === 1 ? "" : "s"} at booking pace</b> · peak {stat.peakPct}% at {stat.peakTime}. Raise prices or protect walk-in tables.</span>
            </span>
            {changeCount > 0 && <button type="button" className="sb-act" disabled={acting} onClick={() => void applyAll()}>Apply surge levers</button>}
            <button type="button" className="sb-x" onClick={() => setSurgeDismissed(true)} aria-label="Dismiss">✕</button>
          </div>
        )}

        <div className={`core-slots-grid focus-${panel}`}>
          {/* Manage · service windows */}
          <div className="core-frame">
            <div className="core-frame-h">
              <span className="t">Manage · service windows</span>
              {stat.surgeCount > 0 ? <span className="fbadge surge">▲ {stat.surgeCount} full</span> : <span className="fbadge">{scoped.length} windows</span>}
            </div>
            <div className="core-frame-b">
              {ordered.length === 0 ? (
                <div className="core-kds-empty">No slots for this {range === "week" ? "week" : "day"}.</div>
              ) : range === "week" ? (
                <div className="core-slot-week">
                  {byDay.map(([d, daySlots]) => (
                    <div key={d} className="core-slot-day">
                      <div className="core-slot-day-h">
                        <span>{dayLabel(d)}</span>
                        <span className="n">{daySlots.length}</span>
                      </div>
                      {daySlots.length === 0 ? <div className="core-slot-day-empty">No slots</div> : daySlots.map(slotRow)}
                    </div>
                  ))}
                </div>
              ) : (
                ordered.map(slotRow)
              )}
            </div>
          </div>

          {/* Demand exchange · pace-based levers */}
          <div className="core-frame">
            <div className="core-exch-head">
              <span className="t">Demand exchange <span className="sub">pace-based levers</span></span>
              {changeCount > 0 && <button type="button" className="core-applyall" disabled={acting} onClick={() => void applyAll()}>⚡ Apply all</button>}
            </div>
            <div className="core-frame-b">
              {!board ? (
                <div className="core-kds-empty">Loading demand board…</div>
              ) : board.slots.length === 0 ? (
                <div className="core-kds-empty">No slots to forecast for this day.</div>
              ) : (
                board.slots.map((r) => {
                  const changed = r.recommendedMaxOrders !== r.maxOrders || r.recommendedMinSpendGrosze !== r.minSpendGrosze;
                  const lever = LEVER[r.action];
                  const tierCls = r.tier === "kitchen-capped" ? "kitchen-capped" : r.tier;
                  return (
                    <div key={r.slotId} className="core-exrow" title={r.note}>
                      <span className="tm">{r.time}</span>
                      <span className={`core-tier ${tierCls}`}>{r.tier}</span>
                      <div className="core-lever">
                        <span className={`lv ${lever.cls}`}>{lever.label(r)}{r.recommendedMinSpendGrosze > 0 ? ` · min ${zl(r.recommendedMinSpendGrosze)}` : ""}</span>
                        <span className="why">{r.note}</span>
                      </div>
                      {changed ? (
                        <button type="button" className="core-apply" disabled={acting} onClick={() => void applyOne(r)}>Apply</button>
                      ) : (
                        <button type="button" className="core-apply hold" disabled>Hold</button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
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
