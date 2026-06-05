"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { STAFF_ROLE_LABEL, STAFF_ROLE_OPTIONS } from "@/lib/staff-roles";
import type { Shift, ShiftStatus, StaffMember, StaffRole } from "@/data/types";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, Button, Dialog, type BadgeTone } from "./ui";

const STATUS_TONE: Record<ShiftStatus, BadgeTone> = { scheduled: "info", "in-progress": "warn", done: "ok", missed: "bad" };
const STATUS_LABEL: Record<ShiftStatus, string> = { scheduled: "Scheduled", "in-progress": "In progress", done: "Done", missed: "Missed" };

function isoDay(d: Date) { return d.toISOString().slice(0, 10); }
function hhmm(iso: string) { return new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }); }
function dayLabel(d: Date) { return d.toLocaleDateString("pl-PL", { weekday: "short", day: "numeric", month: "short" }); }

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
  useEffect(() => { load(); }, [load]);

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

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Schedule</h1>
          <div className="av3-pagehead-sub">This week’s shifts · {city}{!location ? " (pick a location to switch)" : ""}</div>
        </div>
      </div>

      {loading && shifts.length === 0 ? (
        <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading schedule…</div>
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

function ShiftDialog({ shift, date, locationSlug, staff, onClose, onSaved }: {
  shift: Shift | null; date: string; locationSlug: string; staff: StaffMember[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [staffId, setStaffId] = useState(shift?.staffId ?? staff[0]?.id ?? "");
  const [d, setD] = useState(shift ? shift.startAt.slice(0, 10) : date);
  const [start, setStart] = useState(shift ? new Date(shift.startAt).toTimeString().slice(0, 5) : "10:00");
  const [end, setEnd] = useState(shift ? new Date(shift.endAt).toTimeString().slice(0, 5) : "18:00");
  const [role, setRole] = useState<StaffRole>(shift?.role ?? staff[0]?.role ?? "waiter");
  const [status, setStatus] = useState<ShiftStatus>(shift?.status ?? "scheduled");
  const [notes, setNotes] = useState(shift?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const onPickStaff = (id: string) => { setStaffId(id); const m = staff.find((x) => x.id === id); if (m && !shift) setRole(m.role); };

  const save = async () => {
    if (!staffId) return;
    setSaving(true);
    try {
      const startAt = new Date(`${d}T${start}`).toISOString();
      const endAt = new Date(`${d}T${end}`).toISOString();
      const res = await fetch("/api/admin/shifts", {
        method: shift ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(shift ? { id: shift.id } : {}), staffId, startAt, endAt, role, status, notes: notes.trim() || undefined, locationSlug }),
      });
      if (res.ok) await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open onClose={onClose}
      title={shift ? "Edit shift" : "Add shift"}
      subtitle={dayLabel(new Date(`${d}T00:00`))}
      width={520}
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" loading={saving} disabled={!staffId} onClick={save}>Save shift</Button></>}
    >
      <div className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Staff</span>
        <select className="av3-select" value={staffId} onChange={(e) => onPickStaff(e.target.value)}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </div>
      <div className="av3-formrow" style={{ marginBottom: 10 }}>
        <label className="av3-field"><span className="av3-field-label">Date</span><input className="av3-input" type="date" style={{ fontFamily: "var(--av3-ui)" }} value={d} onChange={(e) => setD(e.target.value)} /></label>
        <label className="av3-field"><span className="av3-field-label">Start</span><input className="av3-input" type="time" style={{ fontFamily: "var(--av3-ui)" }} value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="av3-field"><span className="av3-field-label">End</span><input className="av3-input" type="time" style={{ fontFamily: "var(--av3-ui)" }} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
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
    </Dialog>
  );
}
