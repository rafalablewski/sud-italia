"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, Trash2, Users } from "lucide-react";
import type { Shift, StaffMember, StaffRole } from "@/data/types";
import { useAdminLocation } from "../v2/LocationContext";
import { useToast } from "../v2/ui/Toast";
import {
  BottomSheet,
  Chip,
  ChipStrip,
  MobilePage,
  PageHeader,
  PullToRefresh,
} from "../v2/mobile";

const ROLE_LABEL: Record<StaffRole, string> = {
  manager: "Manager",
  kitchen: "Kitchen",
  front: "Front",
  driver: "Driver",
  courier: "Courier",
};

const ROLE_TONE: Record<StaffRole, "brand" | "info" | "success" | "warning" | "neutral"> = {
  manager: "brand",
  kitchen: "info",
  front: "success",
  driver: "warning",
  courier: "warning",
};

const ALL_ROLES: StaffRole[] = ["manager", "kitchen", "front", "driver", "courier"];

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function hoursBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.round((ms / (1000 * 60 * 60)) * 10) / 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function humanDay(iso: string): string {
  const today = isoDate(new Date());
  if (iso === today) return "Today";
  if (iso === addDays(today, 1)) return "Tomorrow";
  if (iso === addDays(today, -1)) return "Yesterday";
  return new Date(`${iso}T00:00:00`).toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

/**
 * Day-view mobile schedule. The desktop week-grid does not survive a phone;
 * the audit ranked this Critical. Mobile pages through days, lists shifts
 * vertically as cards, and opens an edit sheet on tap. Adds use a quick-add
 * sheet pre-populated with the day's typical bounds.
 */
export function MobileSchedule() {
  const { location } = useAdminLocation();
  const toast = useToast();
  const [day, setDay] = useState<string>(() => isoDate(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [editing, setEditing] = useState<Shift | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [roleFilter, setRoleFilter] = useState<StaffRole | "all">("all");

  const refresh = async () => {
    const qs = new URLSearchParams({ from: day, to: day });
    if (location) qs.set("location", location);
    const [shiftRes, staffRes] = await Promise.all([
      fetch(`/api/admin/shifts?${qs.toString()}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/admin/staff${location ? `?location=${location}` : ""}`).then((r) =>
        r.ok ? r.json() : [],
      ),
    ]);
    setShifts(Array.isArray(shiftRes) ? shiftRes : []);
    setStaff(Array.isArray(staffRes) ? staffRes : []);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, location]);

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  const filtered = useMemo(() => {
    return shifts
      .filter((s) => roleFilter === "all" || s.role === roleFilter)
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  }, [shifts, roleFilter]);

  const totalHours = useMemo(
    () => filtered.reduce((acc, s) => acc + hoursBetween(s.startAt, s.endAt), 0),
    [filtered],
  );

  const remove = async (id: string) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/shifts?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error("delete failed");
      setShifts((arr) => arr.filter((s) => s.id !== id));
      toast.success("Shift removed");
    } catch {
      toast.error("Could not remove shift");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PullToRefresh onRefresh={refresh}>
      <MobilePage
        toolbar={
          <ChipStrip ariaLabel="Filter by role">
            <Chip
              label="All roles"
              active={roleFilter === "all"}
              onClick={() => setRoleFilter("all")}
              count={shifts.length}
            />
            {ALL_ROLES.map((role) => {
              const count = shifts.filter((s) => s.role === role).length;
              if (count === 0) return null;
              return (
                <Chip
                  key={role}
                  label={ROLE_LABEL[role]}
                  active={roleFilter === role}
                  onClick={() => setRoleFilter(role)}
                  count={count}
                />
              );
            })}
          </ChipStrip>
        }
      >
        <PageHeader
          title={humanDay(day)}
          subtitle={`${filtered.length} shift${filtered.length === 1 ? "" : "s"} · ${totalHours.toFixed(1)}h`}
          actions={
            <div style={{ display: "inline-flex", gap: 4 }}>
              <button
                type="button"
                className="v2-m-icon-btn"
                aria-label="Previous day"
                onClick={() => setDay((d) => addDays(d, -1))}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="v2-m-icon-btn"
                aria-label="Next day"
                onClick={() => setDay((d) => addDays(d, 1))}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          }
        />

        {filtered.length === 0 ? (
          <div className="v2-m-empty">
            <Users className="h-6 w-6" aria-hidden />
            <div className="v2-m-empty-title">No shifts</div>
            <div className="v2-m-empty-desc">Tap the + below to add one.</div>
          </div>
        ) : (
          <ul role="list" className="v2-m-list">
            {filtered.map((s) => {
              const sm = staffById.get(s.staffId);
              const hrs = hoursBetween(s.startAt, s.endAt);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className="v2-m-list-row"
                    onClick={() => setEditing(s)}
                  >
                    <span
                      className={`v2-m-list-icon v2-m-tone-${ROLE_TONE[s.role]}`}
                      aria-hidden
                    >
                      <Users className="h-4 w-4" />
                    </span>
                    <span className="v2-m-list-stack">
                      <span className="v2-m-list-title">{sm?.name ?? s.staffId}</span>
                      <span className="v2-m-list-sub tabular">
                        {fmtTime(s.startAt)} – {fmtTime(s.endAt)} · {hrs}h
                      </span>
                    </span>
                    <span className={`v2-m-pill v2-m-pill-${ROLE_TONE[s.role]}`}>
                      {ROLE_LABEL[s.role]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <button
          type="button"
          className="v2-m-btn v2-m-btn-ghost"
          onClick={() => setAdding(true)}
          style={{ alignSelf: "flex-start", marginTop: 4 }}
        >
          <CalendarPlus className="h-4 w-4" aria-hidden /> Add shift
        </button>
      </MobilePage>

      <ShiftSheet
        open={!!editing}
        shift={editing}
        staff={staff}
        day={day}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          setShifts((arr) => arr.map((s) => (s.id === saved.id ? saved : s)));
          setEditing(null);
        }}
        onDelete={editing ? () => remove(editing.id) : undefined}
        busy={busy}
      />

      <ShiftSheet
        open={adding}
        shift={null}
        staff={staff}
        day={day}
        onClose={() => setAdding(false)}
        onSaved={(saved) => {
          setShifts((arr) => [...arr, saved]);
          setAdding(false);
        }}
        busy={busy}
      />
    </PullToRefresh>
  );
}

function ShiftSheet({
  open,
  shift,
  staff,
  day,
  onClose,
  onSaved,
  onDelete,
  busy,
}: {
  open: boolean;
  shift: Shift | null;
  staff: StaffMember[];
  day: string;
  onClose: () => void;
  onSaved: (s: Shift) => void;
  onDelete?: () => void;
  busy: boolean;
}) {
  const { location } = useAdminLocation();
  const toast = useToast();
  const [staffId, setStaffId] = useState<string>("");
  const [role, setRole] = useState<StaffRole>("kitchen");
  const [start, setStart] = useState("11:00");
  const [end, setEnd] = useState("19:00");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (shift) {
      setStaffId(shift.staffId);
      setRole(shift.role);
      setStart(new Date(shift.startAt).toTimeString().slice(0, 5));
      setEnd(new Date(shift.endAt).toTimeString().slice(0, 5));
    } else {
      setStaffId(staff[0]?.id ?? "");
      setRole(staff[0]?.role ?? "kitchen");
      setStart("11:00");
      setEnd("19:00");
    }
  }, [open, shift, staff]);

  const save = async () => {
    if (!staffId) {
      toast.error("Pick someone");
      return;
    }
    setSubmitting(true);
    try {
      const startAt = new Date(`${day}T${start}:00`).toISOString();
      const endAt = new Date(`${day}T${end}:00`).toISOString();
      const payload = {
        ...(shift ? { id: shift.id } : {}),
        staffId,
        locationSlug:
          shift?.locationSlug ??
          location ??
          staff.find((s) => s.id === staffId)?.locationSlug,
        startAt,
        endAt,
        role,
        status: shift?.status ?? "scheduled",
        notes: shift?.notes,
      };
      const r = await fetch("/api/admin/shifts", {
        method: shift ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const data: { error?: string } = await r.json().catch(() => ({}));
        toast.error("Could not save shift", data.error);
        return;
      }
      const saved = (await r.json()) as Shift;
      onSaved(saved);
      toast.success(shift ? "Shift updated" : "Shift added");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={shift ? "Edit shift" : "Add shift"}
      footer={
        <div style={{ display: "flex", gap: 8, flex: 1 }}>
          {onDelete && (
            <button
              type="button"
              className="v2-m-btn v2-m-btn-ghost"
              onClick={onDelete}
              disabled={busy || submitting}
              style={{ color: "var(--danger)" }}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          )}
          <button
            type="button"
            className="v2-m-btn v2-m-btn-primary"
            onClick={save}
            disabled={submitting || busy}
            style={{ flex: 1 }}
          >
            {submitting ? "Saving…" : shift ? "Save" : "Add shift"}
          </button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              color: "var(--fg-subtle)",
              textTransform: "uppercase",
              letterSpacing: 0.04,
            }}
          >
            Staff
          </span>
          <select
            value={staffId}
            onChange={(e) => {
              setStaffId(e.target.value);
              const s = staff.find((x) => x.id === e.target.value);
              if (s) setRole(s.role);
            }}
            style={{
              padding: "10px 12px",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              color: "var(--fg)",
              fontSize: 16,
              fontFamily: "var(--font-ui)",
            }}
          >
            <option value="">— select —</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({ROLE_LABEL[s.role]})
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              color: "var(--fg-subtle)",
              textTransform: "uppercase",
              letterSpacing: 0.04,
            }}
          >
            Role
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ALL_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                className={`v2-m-chip ${role === r ? "is-active" : ""}`}
                onClick={() => setRole(r)}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span
              style={{
                fontSize: 11,
                color: "var(--fg-subtle)",
                textTransform: "uppercase",
                letterSpacing: 0.04,
              }}
            >
              Start
            </span>
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              style={{
                padding: "10px 12px",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                color: "var(--fg)",
                fontSize: 16,
                fontFamily: "var(--font-ui)",
              }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span
              style={{
                fontSize: 11,
                color: "var(--fg-subtle)",
                textTransform: "uppercase",
                letterSpacing: 0.04,
              }}
            >
              End
            </span>
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              style={{
                padding: "10px 12px",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                color: "var(--fg)",
                fontSize: 16,
                fontFamily: "var(--font-ui)",
              }}
            />
          </label>
        </div>

        <div
          style={{
            fontSize: 12,
            color: "var(--fg-subtle)",
            padding: "4px 2px",
          }}
        >
          Total: {hoursBetween(`${day}T${start}:00`, `${day}T${end}:00`).toFixed(1)}h
        </div>
      </div>
    </BottomSheet>
  );
}
