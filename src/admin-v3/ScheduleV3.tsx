"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarRange, Clock, Coins, LayoutGrid, Plus, Rows3, Trash2, Users } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import { STAFF_ROLE_LABEL, STAFF_ROLE_OPTIONS } from "@/lib/staff-roles";
import type { Shift, ShiftStatus, StaffMember, StaffRole } from "@/data/types";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, type BadgeTone, Button, Dialog, Kpi, KpiRail, SkeletonRows } from "./ui";

function roleColor(role: StaffRole): string {
  const t = roleToneOf(role);
  return t === "brand" ? "var(--av3-brand)" : t === "warn" ? "var(--av3-warn)" : t === "info" ? "var(--av3-info)" : "var(--av3-line-strong)";
}

const STATUS_TONE: Record<ShiftStatus, BadgeTone> = { scheduled: "info", "in-progress": "warn", done: "ok", missed: "bad" };
const STATUS_LABEL: Record<ShiftStatus, string> = { scheduled: "Scheduled", "in-progress": "In progress", done: "Done", missed: "Missed" };

function isoDay(d: Date) { return d.toISOString().slice(0, 10); }
function hhmm(iso: string) { return new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }); }
function dayLabel(d: Date) { return d.toLocaleDateString("pl-PL", { weekday: "short", day: "numeric", month: "short" }); }
/** YYYY-MM-DD in LOCAL time (no UTC shift) — matches the `<input type="date">` value. */
function localDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** Inclusive list of YYYY-MM-DD day strings from `startDay` to `endDay`. Falls
 *  back to just the start day when the end is empty, invalid or before start. */
function daysInRange(startDay: string, endDay: string): string[] {
  const s = new Date(`${startDay}T00:00`);
  const e = new Date(`${endDay}T00:00`);
  if (!endDay || Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return [startDay];
  const out: string[] = [];
  for (const cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) out.push(localDay(cur));
  return out;
}

export function ScheduleV3() {
  const { location } = useAdminLocationV3();
  const all = useMemo(() => getActiveLocations(), []);
  const loc = location || all[0]?.slug || "krakow";
  const city = all.find((l) => l.slug === loc)?.city ?? loc;

  const week = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, []);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<{ shift: Shift | null; date: string } | null>(null);
  const [view, setView] = useState<"week" | "list">("week");

  const load = useCallback(async () => {
    const from = isoDay(week[0]);
    const to = isoDay(new Date(week[6].getTime() + 86400000));
    const [sh, st] = await Promise.all([
      fetch(`/api/admin/shifts?location=${loc}&from=${from}&to=${to}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`/api/admin/staff?location=${loc}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    setShifts(Array.isArray(sh) ? sh : []);
    setStaff(Array.isArray(st) ? st : []);
    setLoading(false);
  }, [loc, week]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const byDay = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const s of shifts) {
      const day = s.startAt.slice(0, 10);
      const arr = m.get(day) ?? []; arr.push(s); m.set(day, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return m;
  }, [shifts]);

  const removeShift = async (id: string) => {
    const res = await fetch(`/api/admin/shifts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) await load();
  };

  // week stats — hours, labour cost, coverage
  const stats = useMemo(() => {
    let mins = 0, cost = 0;
    const onRota = new Set<string>();
    for (const s of shifts) {
      const dur = (new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / 60000;
      if (dur > 0) { mins += dur; cost += (dur / 60) * (staffById.get(s.staffId)?.hourlyRateGrosze ?? 0); }
      onRota.add(s.staffId);
    }
    const covered = new Set(shifts.map((s) => s.startAt.slice(0, 10)));
    return { count: shifts.length, hours: mins / 60, cost: Math.round(cost), onRota: onRota.size, uncovered: week.filter((d) => !covered.has(isoDay(d))).length };
  }, [shifts, staffById, week]);

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Schedule</h1>
          <div className="av3-pagehead-sub">This week’s shifts · {city}{!location ? " (pick a location to switch)" : ""}</div>
        </div>
        <div className="av3-pagehead-actions">
          <Button variant="secondary" size="sm" onClick={() => setDialog({ shift: null, date: isoDay(new Date()) })}><Plus className="av3-btn-ico" /> Add shift</Button>
        </div>
      </div>

      <KpiRail loading={loading} empty={shifts.length === 0}>
        <Kpi label="Shifts" icon={CalendarRange} value={`${stats.count}`} accentVar="--av3-c3" />
        <Kpi label="Hours" icon={Clock} value={stats.hours ? `${stats.hours.toFixed(0)}h` : "—"} accentVar="--av3-c4" />
        <Kpi label="Labour cost (brutto)" icon={Coins} value={formatPrice(stats.cost)} accentVar="--av3-c2" />
        <Kpi label="On rota" icon={Users} value={`${stats.onRota}`} accentVar="--av3-c5" />
        <Kpi label="Uncovered days" icon={AlertTriangle} value={`${stats.uncovered}`} accentVar="--av3-c1" />
      </KpiRail>

      <div className="av3-toolbar">
        <span className="av3-toolbar-spacer" />
        <span className="av3-cell-muted" style={{ fontSize: 12 }}>{dayLabel(week[0])} – {dayLabel(week[6])}</span>
        <div className="av3-viewtoggle">
          <button type="button" className={view === "week" ? "is-active" : ""} onClick={() => setView("week")} aria-label="Week grid" title="Week grid"><LayoutGrid /></button>
          <button type="button" className={view === "list" ? "is-active" : ""} onClick={() => setView("list")} aria-label="List view" title="List view"><Rows3 /></button>
        </div>
      </div>

      {loading && shifts.length === 0 ? (
        <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={6} /></div>
      ) : view === "week" ? (
        <div className="av3-week-wrap">
          <div className="av3-week">
            {week.map((d) => {
              const day = isoDay(d);
              const list = byDay.get(day) ?? [];
              const isToday = day === isoDay(new Date());
              return (
                <div className="av3-weekcol" data-today={isToday} key={day}>
                  <div className="av3-weekcol-h">
                    <span className="av3-weekcol-day">{d.toLocaleDateString("pl-PL", { weekday: "short" })} <b>{d.getDate()}</b>{list.length > 0 && <span className="av3-weekcol-cnt">{list.length}</span>}</span>
                    <button type="button" className="av3-weekcol-add" aria-label={`Add shift ${dayLabel(d)}`} onClick={() => setDialog({ shift: null, date: day })}><Plus /></button>
                  </div>
                  <div className="av3-weekcol-body">
                    {list.length === 0 ? (
                      <div className="av3-weekcol-empty">—</div>
                    ) : (
                      list.map((s) => (
                        <div key={s.id} className="av3-shiftcard" style={{ borderLeftColor: roleColor(s.role) }} role="button" tabIndex={0}
                          onClick={() => setDialog({ shift: s, date: day })} onKeyDown={(e) => { if (e.key === "Enter") setDialog({ shift: s, date: day }); }}>
                          <button type="button" className="av3-shift-del" aria-label="Delete shift" onClick={(e) => { e.stopPropagation(); removeShift(s.id); }}><Trash2 /></button>
                          <div className="av3-shift-time">{hhmm(s.startAt)}–{hhmm(s.endAt)}</div>
                          <div className="av3-shift-name">{staffById.get(s.staffId)?.name ?? s.staffId}</div>
                          <div className="av3-shift-meta">
                            <Badge tone={roleToneOf(s.role)}>{STAFF_ROLE_LABEL[s.role] ?? s.role}</Badge>
                            <Badge tone={STATUS_TONE[s.status]} dot>{STATUS_LABEL[s.status]}</Badge>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {week.map((d) => {
            const day = isoDay(d);
            const list = byDay.get(day) ?? [];
            const isToday = day === isoDay(new Date());
            return (
              <div className="av3-card" key={day}>
                <div className="av3-card-head">
                  <div className="av3-card-title">{dayLabel(d)}{isToday && <span style={{ marginLeft: 8 }}><Badge tone="brand">Today</Badge></span>}</div>
                  <Button variant="ghost" size="sm" onClick={() => setDialog({ shift: null, date: day })}><Plus className="av3-btn-ico" /> Add shift</Button>
                </div>
                <div className="av3-card-body" style={{ paddingTop: 6, paddingBottom: 6 }}>
                  {list.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--av3-subtle)", padding: "6px 0" }}>No shifts</div>
                  ) : (
                    list.map((s) => (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--av3-line)" }}>
                        <span className="mono" style={{ fontFamily: "var(--av3-mono)", fontSize: 12.5, width: 110, color: "var(--av3-muted)" }}>{hhmm(s.startAt)}–{hhmm(s.endAt)}</span>
                        <button type="button" onClick={() => setDialog({ shift: s, date: day })} style={{ flex: 1, textAlign: "left", background: "none", border: "none", color: "inherit", cursor: "pointer", fontWeight: 500, fontSize: 13 }}>
                          {staffById.get(s.staffId)?.name ?? s.staffId}
                        </button>
                        <Badge tone={roleToneOf(s.role)}>{STAFF_ROLE_LABEL[s.role] ?? s.role}</Badge>
                        <Badge tone={STATUS_TONE[s.status]} dot>{STATUS_LABEL[s.status]}</Badge>
                        <button type="button" className="av3-iconbtn-sm" aria-label="Delete shift" onClick={() => removeShift(s.id)}><Trash2 /></button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dialog && (
        <ShiftDialog
          shift={dialog.shift}
          date={dialog.date}
          locationSlug={loc}
          staff={staff}
          onClose={() => setDialog(null)}
          onReload={load}
          onSaved={async () => { await load(); setDialog(null); }}
        />
      )}
    </>
  );
}

function roleToneOf(role: StaffRole): BadgeTone {
  if (role === "manager") return "brand";
  if (["pizzaiolo", "chef", "kp", "kitchen"].includes(role)) return "warn";
  if (["waiter", "front"].includes(role)) return "info";
  return "neutral";
}

function ShiftDialog({ shift, date, locationSlug, staff, onClose, onReload, onSaved }: {
  shift: Shift | null; date: string; locationSlug: string; staff: StaffMember[]; onClose: () => void; onReload: () => Promise<void>; onSaved: () => Promise<void>;
}) {
  const [staffId, setStaffId] = useState(shift?.staffId ?? staff[0]?.id ?? "");
  const [d, setD] = useState(shift ? shift.startAt.slice(0, 10) : date);
  const [untilDay, setUntilDay] = useState("");
  const [start, setStart] = useState(shift ? new Date(shift.startAt).toTimeString().slice(0, 5) : "10:00");
  const [end, setEnd] = useState(shift ? new Date(shift.endAt).toTimeString().slice(0, 5) : "18:00");
  const [role, setRole] = useState<StaffRole>(shift?.role ?? staff[0]?.role ?? "waiter");
  const [status, setStatus] = useState<ShiftStatus>(shift?.status ?? "scheduled");
  const [notes, setNotes] = useState(shift?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editing touches a single shift; adding can span a date range (assign
  // someone for several days at once) — one shift created per day.
  const days = useMemo(() => (shift ? [d] : daysInRange(d, untilDay)), [shift, d, untilDay]);

  const onPickStaff = (id: string) => { setStaffId(id); const m = staff.find((x) => x.id === id); if (m && !shift) setRole(m.role); };

  const save = async () => {
    if (!staffId || days.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      let ok = 0;
      const failedDays: string[] = [];
      for (const day of days) {
        const startAt = new Date(`${day}T${start}`).toISOString();
        const endAt = new Date(`${day}T${end}`).toISOString();
        const res = await fetch("/api/admin/shifts", {
          method: shift ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...(shift ? { id: shift.id } : {}), staffId, startAt, endAt, role, status, notes: notes.trim() || undefined, locationSlug }),
        });
        if (res.ok) ok++;
        else failedDays.push(day);
      }
      if (failedDays.length === 0) {
        await onSaved();
      } else {
        // Some days clashed with scheduling rules (overlap / rest). Keep the
        // dialog open, refresh what did save, and say what didn't.
        await onReload();
        setError(`${ok} shift${ok === 1 ? "" : "s"} created · ${failedDays.length} skipped (scheduling-rule conflict on ${failedDays.map((x) => x.slice(5)).join(", ")}).`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open onClose={onClose}
      title={shift ? "Edit shift" : "Add shift"}
      subtitle={shift || days.length <= 1 ? dayLabel(new Date(`${d}T00:00`)) : `${days.length} days · ${dayLabel(new Date(`${days[0]}T00:00`))} → ${dayLabel(new Date(`${days[days.length - 1]}T00:00`))}`}
      width={520}
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" loading={saving} disabled={!staffId} onClick={save}>{!shift && days.length > 1 ? `Add ${days.length} shifts` : "Save shift"}</Button></>}
    >
      <div className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Staff</span>
        <select className="av3-select" value={staffId} onChange={(e) => onPickStaff(e.target.value)}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </div>
      <div className="av3-formrow" style={{ marginBottom: 10 }}>
        <label className="av3-field"><span className="av3-field-label">{shift ? "Date" : "Start date"}</span><input className="av3-input" type="date" style={{ fontFamily: "var(--av3-ui)" }} value={d} onChange={(e) => setD(e.target.value)} /></label>
        <label className="av3-field"><span className="av3-field-label">Start</span><input className="av3-input" type="time" style={{ fontFamily: "var(--av3-ui)" }} value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="av3-field"><span className="av3-field-label">End</span><input className="av3-input" type="time" style={{ fontFamily: "var(--av3-ui)" }} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      {!shift && (
        <label className="av3-field" style={{ marginBottom: 10 }}>
          <span className="av3-field-label">Repeat through (optional) — assign for several days at once</span>
          <input className="av3-input" type="date" style={{ fontFamily: "var(--av3-ui)" }} min={d} value={untilDay} onChange={(e) => setUntilDay(e.target.value)} />
          {days.length > 1 && <span style={{ fontSize: 11.5, color: "var(--av3-muted)", marginTop: 5 }}>Creates {days.length} shifts — one per day, {start}–{end} each.</span>}
        </label>
      )}
      <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <label className="av3-field"><span className="av3-field-label">Role</span>
          <select className="av3-select" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
            {STAFF_ROLE_OPTIONS.map((g) => <optgroup key={g.group} label={g.group}>{g.roles.map((r) => <option key={r} value={r}>{STAFF_ROLE_LABEL[r]}</option>)}</optgroup>)}
          </select>
        </label>
        <label className="av3-field"><span className="av3-field-label">Status</span>
          <select className="av3-select" value={status} onChange={(e) => setStatus(e.target.value as ShiftStatus)}>{(Object.keys(STATUS_LABEL) as ShiftStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
        </label>
      </div>
      <label className="av3-field" style={{ marginTop: 10 }}><span className="av3-field-label">Notes</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Station, cover-for, training… (optional)" /></label>
      {error && <div className="av3-edhint" data-tone="warn" style={{ marginTop: 12 }}>{error}</div>}
    </Dialog>
  );
}
