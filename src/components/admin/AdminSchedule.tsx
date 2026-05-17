"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, MapPin, Plus, Trash2 } from "lucide-react";
import type { Shift, ShiftStatus, StaffMember, StaffRole } from "@/data/types";
import dynamic from "next/dynamic";
import { getActiveLocations } from "@/data/locations";
import { useAdminLocation } from "./v2/LocationContext";
import { useIsMobile } from "./v2/mobile";
import { useToast } from "./v2/ui/Toast";

const MobileSchedule = dynamic(
  () => import("./mobile/MobileSchedule").then((m) => m.MobileSchedule),
  { ssr: false },
);
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
} from "./v2/ui";

const activeLocations = getActiveLocations();
const FALLBACK_LOC = activeLocations[0]?.slug ?? "krakow";

const STATUS_TONE: Record<ShiftStatus, "warning" | "info" | "success" | "danger"> = {
  scheduled: "warning",
  "in-progress": "info",
  done: "success",
  missed: "danger",
};

const STATUS_LABEL: Record<ShiftStatus, string> = {
  scheduled: "Scheduled",
  "in-progress": "In progress",
  done: "Done",
  missed: "Missed",
};

const ROLE_LABEL: Record<StaffRole, string> = {
  manager: "Manager",
  kitchen: "Kitchen",
  front: "Front of house",
  driver: "Driver",
  courier: "Courier",
};

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/** Returns the Monday on or before `iso`. */
function weekStartIso(iso: string): string {
  const d = new Date(iso);
  const dow = d.getDay(); // 0=Sun..6=Sat
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offset);
  return isoDate(d);
}

function rangeDays(start: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(start, i));
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

function shiftHours(s: Shift): number {
  const ms = new Date(s.endAt).getTime() - new Date(s.startAt).getTime();
  return Math.max(0, ms / 3_600_000);
}

interface ShiftDialogState {
  open: boolean;
  shift: Shift | null;
  /** Defaults when creating: date + staff. */
  defaults?: { date: string };
}

export function AdminSchedule() {
  const { isMobile, ready } = useIsMobile();
  if (ready && isMobile) {
    return <MobileSchedule />;
  }
  return <AdminScheduleDesktop />;
}

function AdminScheduleDesktop() {
  const { location: globalLoc } = useAdminLocation();
  const toast = useToast();
  const [pageLoc, setPageLoc] = useState<string>(globalLoc || FALLBACK_LOC);
  useEffect(() => {
    if (globalLoc) setPageLoc(globalLoc);
  }, [globalLoc]);

  const [weekStart, setWeekStart] = useState<string>(() => weekStartIso(isoDate(new Date())));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<ShiftDialogState>({ open: false, shift: null });
  const [pendingDelete, setPendingDelete] = useState<Shift | null>(null);

  const days = useMemo(() => rangeDays(weekStart, 7), [weekStart]);
  const rangeFrom = days[0];
  const rangeTo = `${days[6]}T23:59:59`;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sh, st] = await Promise.all([
        fetch(`/api/admin/shifts?location=${pageLoc}&from=${rangeFrom}&to=${rangeTo}`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/admin/staff?location=${pageLoc}`).then((r) => (r.ok ? r.json() : [])),
      ]);
      setShifts(Array.isArray(sh) ? sh : []);
      setStaff(Array.isArray(st) ? st : []);
    } finally {
      setLoading(false);
    }
  }, [pageLoc, rangeFrom, rangeTo]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const shiftsByDay = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const day of days) m.set(day, []);
    for (const s of shifts) {
      const d = s.startAt.split("T")[0];
      if (m.has(d)) m.get(d)!.push(s);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return m;
  }, [shifts, days]);

  const totals = useMemo(() => {
    const totalHours = shifts.reduce((acc, s) => acc + shiftHours(s), 0);
    const totalCost = shifts.reduce((acc, s) => {
      const member = staff.find((x) => x.id === s.staffId);
      return acc + shiftHours(s) * (member?.hourlyRateGrosze ?? 0);
    }, 0);
    return { totalHours, totalCost: Math.round(totalCost) };
  }, [shifts, staff]);

  const submitShift = async (input: {
    id?: string;
    staffId: string;
    startAt: string;
    endAt: string;
    role: StaffRole;
    status: ShiftStatus;
    notes?: string;
  }) => {
    const res = await fetch("/api/admin/shifts", {
      method: input.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...input,
        locationSlug: pageLoc,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      // Surface scheduling-rule warnings (48 h cap, < 11 h rest, missing DOB)
      // even on a successful save — they don't block the shift but the
      // manager needs to see them.
      const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
      if (warnings.length > 0) {
        toast.warning(
          input.id ? "Shift updated with warnings" : "Shift created with warnings",
          warnings.map((w: { message: string }) => w.message).join(" · "),
        );
      } else {
        toast.success(input.id ? "Shift updated" : "Shift created");
      }
      await fetchAll();
      return true;
    }
    // 409 = blocked by an `error`-severity violation (double-booking, under-18).
    if (res.status === 409 && Array.isArray(data?.violations)) {
      const msg = data.violations
        .map((v: { message: string }) => v.message)
        .join(" · ");
      toast.error("Shift violates scheduling rules", msg);
    } else {
      toast.error("Could not save shift", data?.error);
    }
    return false;
  };

  const doDelete = async () => {
    if (!pendingDelete) return;
    const res = await fetch(`/api/admin/shifts?id=${encodeURIComponent(pendingDelete.id)}`, { method: "DELETE" });
    if (res.ok) {
      setShifts((arr) => arr.filter((s) => s.id !== pendingDelete.id));
      toast.success("Shift removed");
    }
    setPendingDelete(null);
  };

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Schedule</h1>
          <p className="v2-page-subtitle">
            Weekly grid · drag-style add per day · cost rolls up from real hourly rates.
          </p>
        </div>
        <div className="v2-page-actions">
          <div className="v2-field-inline">
            <MapPin className="h-3.5 w-3.5 v2-muted" />
            <Select
              value={pageLoc}
              onChange={(e) => setPageLoc(e.target.value)}
              options={activeLocations.map((l) => ({ value: l.slug, label: l.city }))}
              aria-label="Location"
            />
          </div>
          <DatePager unit="week" value={weekStart} onChange={setWeekStart} />
        </div>
      </header>

      <Card padding="compact">
        <div className="v2-summary-row">
          <span className="v2-muted">Hours · cost</span>
          <span className="tabular v2-summary-val">
            {totals.totalHours.toFixed(1)}h · {(totals.totalCost / 100).toLocaleString("pl-PL", { maximumFractionDigits: 0 })} zł
          </span>
        </div>
      </Card>

      {loading ? (
        <div className="v2-page-loading">Loading shifts…</div>
      ) : staff.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={CalendarDays}
              title="Add staff before scheduling"
              description="Create staff members on the Staff page first, then come back to schedule shifts."
              action={
                <Button variant="primary" onClick={() => { window.location.href = "/admin/staff"; }}>
                  Go to Staff
                </Button>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <div className="v2-schedule-grid">
          {days.map((d) => {
            const list = shiftsByDay.get(d) ?? [];
            const dayHours = list.reduce((acc, s) => acc + shiftHours(s), 0);
            return (
              <Card key={d} padding="none">
                <CardHeader
                  title={
                    <div className="v2-schedule-day-title">
                      <span>{new Date(d).toLocaleDateString(undefined, { weekday: "short" })}</span>
                      <span className="mono v2-muted">{d.slice(5)}</span>
                    </div>
                  }
                  description={list.length === 0 ? "No shifts" : `${list.length} shift${list.length === 1 ? "" : "s"} · ${dayHours.toFixed(1)}h`}
                  actions={
                    <Button size="sm" variant="ghost" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setDialog({ open: true, shift: null, defaults: { date: d } })}>
                      Add
                    </Button>
                  }
                />
                <CardBody>
                  {list.length === 0 ? (
                    <div className="v2-muted v2-schedule-empty">No shifts</div>
                  ) : (
                    <ul className="v2-schedule-shifts">
                      {list.map((s) => {
                        const member = staffById.get(s.staffId);
                        return (
                          <li key={s.id} className="v2-schedule-shift">
                            <button type="button" onClick={() => setDialog({ open: true, shift: s })} className="v2-schedule-shift-body">
                              <div className="v2-schedule-shift-head">
                                <span className="mono">{fmtTime(s.startAt)}–{fmtTime(s.endAt)}</span>
                                <Badge tone={STATUS_TONE[s.status]} variant="soft">
                                  {STATUS_LABEL[s.status]}
                                </Badge>
                              </div>
                              <div className="v2-schedule-shift-name">{member?.name ?? s.staffId}</div>
                              <div className="v2-schedule-shift-role v2-muted">{ROLE_LABEL[s.role]}</div>
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDelete(s)}
                              className="v2-schedule-shift-del"
                              aria-label="Remove shift"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      <ShiftDialog
        state={dialog}
        staff={staff}
        onClose={() => setDialog({ open: false, shift: null })}
        onSubmit={async (input) => {
          const ok = await submitShift(input);
          if (ok) setDialog({ open: false, shift: null });
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={doDelete}
        title="Remove this shift?"
        description="Time-punch history is preserved. Only the planned shift is deleted."
        confirmLabel="Remove"
        destructive
      />
    </div>
  );
}

function ShiftDialog({
  state,
  staff,
  onClose,
  onSubmit,
}: {
  state: ShiftDialogState;
  staff: StaffMember[];
  onClose: () => void;
  onSubmit: (input: { id?: string; staffId: string; startAt: string; endAt: string; role: StaffRole; status: ShiftStatus; notes?: string }) => Promise<void> | void;
}) {
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [role, setRole] = useState<StaffRole>("kitchen");
  const [status, setStatus] = useState<ShiftStatus>("scheduled");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    if (state.shift) {
      const s = state.shift;
      setStaffId(s.staffId);
      const start = new Date(s.startAt);
      const end = new Date(s.endAt);
      setDate(start.toISOString().split("T")[0]);
      setStartTime(`${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`);
      setEndTime(`${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`);
      setRole(s.role);
      setStatus(s.status);
      setNotes(s.notes ?? "");
    } else {
      setStaffId(staff[0]?.id ?? "");
      setDate(state.defaults?.date ?? isoDate(new Date()));
      setStartTime("09:00");
      setEndTime("17:00");
      setRole(staff[0]?.role ?? "kitchen");
      setStatus("scheduled");
      setNotes("");
    }
    setBusy(false);
  }, [state, staff]);

  if (!state.open) return <Dialog open={false} onClose={onClose} />;

  const submit = async () => {
    if (!staffId) return;
    const startAt = new Date(`${date}T${startTime}:00`).toISOString();
    const endAt = new Date(`${date}T${endTime}:00`).toISOString();
    setBusy(true);
    await onSubmit({
      id: state.shift?.id,
      staffId,
      startAt,
      endAt,
      role,
      status,
      notes: notes.trim() || undefined,
    });
    setBusy(false);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={state.shift ? "Edit shift" : "New shift"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>{state.shift ? "Save" : "Create"}</Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <Select
          label="Staff member"
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          options={staff.map((s) => ({ value: s.id, label: `${s.name} · ${ROLE_LABEL[s.role]}` }))}
        />
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="v2-form-row-2">
          <Input label="Start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <Input label="End" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
        <Select
          label="Role on this shift"
          value={role}
          onChange={(e) => setRole(e.target.value as StaffRole)}
          options={[
            { value: "manager", label: ROLE_LABEL.manager },
            { value: "kitchen", label: ROLE_LABEL.kitchen },
            { value: "front", label: ROLE_LABEL.front },
            { value: "driver", label: ROLE_LABEL.driver },
          ]}
        />
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as ShiftStatus)}
          options={[
            { value: "scheduled", label: STATUS_LABEL.scheduled },
            { value: "in-progress", label: STATUS_LABEL["in-progress"] },
            { value: "done", label: STATUS_LABEL.done },
            { value: "missed", label: STATUS_LABEL.missed },
          ]}
        />
        <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Dialog>
  );
}
