"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Award,
  Clock,
  Coins,
  HardHat,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  Search,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { getActiveLocations } from "@/data/locations";
import type { StaffMember, StaffRole, StaffStatus, TimePunch } from "@/data/types";
import { useAdminLocation } from "./v2/LocationContext";
import { useToast } from "./v2/ui/Toast";
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
  Tabs,
  Table,
  Textarea,
  type Column,
} from "./v2/ui";
import { KpiCard } from "./v2/charts";

const ROLE_LABEL: Record<StaffRole, string> = {
  manager: "Manager",
  kitchen: "Kitchen",
  front: "Front of house",
  driver: "Driver",
  courier: "Courier",
};

const ROLE_TONE: Record<StaffRole, "info" | "warning" | "success" | "brand"> = {
  manager: "brand",
  kitchen: "warning",
  front: "info",
  driver: "success",
  courier: "info",
};

const activeLocations = getActiveLocations();

type StatusFilter = "all" | StaffStatus;
type DialogState = { open: boolean; member: StaffMember | null };

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export function AdminStaff() {
  const { location } = useAdminLocation();
  const toast = useToast();

  const [list, setList] = useState<StaffMember[]>([]);
  const [punches, setPunches] = useState<TimePunch[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [dialog, setDialog] = useState<DialogState>({ open: false, member: null });
  const [pendingDelete, setPendingDelete] = useState<StaffMember | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const sinceIso = new Date(Date.now() - 7 * 86400_000).toISOString();
      const [s, p] = await Promise.all([
        fetch(`/api/admin/staff${location ? `?location=${location}` : ""}`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/admin/time-punches?from=${sinceIso}`).then((r) => (r.ok ? r.json() : [])),
      ]);
      setList(Array.isArray(s) ? s : []);
      setPunches(Array.isArray(p) ? p : []);
    } finally {
      setLoading(false);
    }
  }, [location]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q) ||
        (s.phone?.toLowerCase().includes(q) ?? false) ||
        (s.email?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [list, query, statusFilter]);

  const totals = useMemo(() => {
    const active = list.filter((s) => s.status === "active");
    const roleCounts = active.reduce<Record<string, number>>((acc, s) => {
      acc[s.role] = (acc[s.role] ?? 0) + 1;
      return acc;
    }, {});

    // Approximate labor hours over the last 7 days from real time punches
    let totalSeconds = 0;
    const byStaff = new Map<string, TimePunch[]>();
    for (const p of punches) {
      const arr = byStaff.get(p.staffId) || [];
      arr.push(p);
      byStaff.set(p.staffId, arr);
    }
    for (const arr of byStaff.values()) {
      arr.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
      let inAt: number | null = null;
      for (const p of arr) {
        const t = new Date(p.occurredAt).getTime();
        if (p.type === "clock-in") inAt = t;
        else if (p.type === "clock-out" && inAt !== null) {
          totalSeconds += Math.max(0, (t - inAt) / 1000);
          inAt = null;
        }
      }
    }

    const laborGrosze = (() => {
      // Cost = sum_per_member(hours × rate)
      let cost = 0;
      for (const [staffId, arr] of byStaff) {
        const member = list.find((s) => s.id === staffId);
        if (!member) continue;
        let seconds = 0;
        let inAt: number | null = null;
        for (const p of arr) {
          const t = new Date(p.occurredAt).getTime();
          if (p.type === "clock-in") inAt = t;
          else if (p.type === "clock-out" && inAt !== null) {
            seconds += Math.max(0, (t - inAt) / 1000);
            inAt = null;
          }
        }
        cost += (seconds / 3600) * member.hourlyRateGrosze;
      }
      return Math.round(cost);
    })();

    const openShifts = punches.reduce((acc, p, i, arr) => {
      // count members with a clock-in not yet followed by a clock-out
      if (p.type !== "clock-in") return acc;
      const closed = arr.find((x) => x.type === "clock-out" && x.staffId === p.staffId && x.occurredAt > p.occurredAt);
      return acc + (closed ? 0 : 1);
    }, 0);

    return {
      activeCount: active.length,
      roleCounts,
      hours7d: totalSeconds / 3600,
      labor7d: laborGrosze,
      openShifts,
    };
  }, [list, punches]);

  const handlePunch = async (member: StaffMember, type: TimePunch["type"]) => {
    const res = await fetch("/api/admin/time-punches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId: member.id, type }),
    });
    if (res.ok) {
      toast.success(`${type === "clock-in" ? "Clocked in" : "Clocked out"}`, member.name);
      await fetchAll();
    } else {
      toast.error("Could not record punch");
    }
  };

  const doDelete = async () => {
    if (!pendingDelete) return;
    const res = await fetch(`/api/admin/staff?id=${encodeURIComponent(pendingDelete.id)}`, { method: "DELETE" });
    if (res.ok) {
      setList((arr) => arr.filter((s) => s.id !== pendingDelete.id));
      toast.success("Removed", pendingDelete.name);
    }
    setPendingDelete(null);
  };

  const cols: Column<StaffMember>[] = [
    {
      key: "name",
      header: "Name",
      cell: (s) => (
        <div className="v2-cell-stack">
          <span>{s.name}</span>
          <span className="v2-cell-sub">{s.phone ?? s.email ?? "—"}</span>
        </div>
      ),
      sortValue: (s) => s.name,
    },
    {
      key: "role",
      header: "Role",
      cell: (s) => (
        <Badge tone={ROLE_TONE[s.role]} variant="soft" dot>
          {ROLE_LABEL[s.role]}
        </Badge>
      ),
      sortValue: (s) => s.role,
    },
    {
      key: "loc",
      header: "Location",
      cell: (s) => <Badge tone="neutral" variant="outline">{s.locationSlug}</Badge>,
      sortValue: (s) => s.locationSlug,
    },
    {
      key: "rate",
      header: "Hourly",
      align: "right",
      cell: (s) => formatPrice(s.hourlyRateGrosze),
      sortValue: (s) => s.hourlyRateGrosze,
    },
    {
      key: "status",
      header: "Status",
      cell: (s) => (
        <Badge tone={s.status === "active" ? "success" : "neutral"} variant="soft" dot>
          {s.status}
        </Badge>
      ),
      sortValue: (s) => s.status,
    },
    {
      key: "actions",
      header: "",
      cell: (s) => (
        <div className="v2-row-actions">
          <Button size="sm" variant="ghost" leadingIcon={<LogIn className="h-3.5 w-3.5" />} onClick={() => handlePunch(s, "clock-in")}>
            In
          </Button>
          <Button size="sm" variant="ghost" leadingIcon={<LogOut className="h-3.5 w-3.5" />} onClick={() => handlePunch(s, "clock-out")}>
            Out
          </Button>
          <Button size="sm" variant="ghost" leadingIcon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setDialog({ open: true, member: s })}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPendingDelete(s)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Staff</h1>
          <p className="v2-page-subtitle">
            Roster, hourly rates, clock-in / clock-out. Labor cost over the last 7 days computed from real time punches.
          </p>
        </div>
        <div className="v2-page-actions">
          <Button variant="primary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setDialog({ open: true, member: null })}>
            New staff member
          </Button>
        </div>
      </header>

      <section className="v2-kpi-grid">
        <KpiCard label="Active staff" value={totals.activeCount} icon={Users} tone="info" />
        <KpiCard label="Currently clocked in" value={totals.openShifts} icon={Clock} tone={totals.openShifts > 0 ? "success" : "neutral"} />
        <KpiCard
          label="Labor hours (7d)"
          value={totals.hours7d}
          format={(n) => `${n.toFixed(1)}h`}
          icon={HardHat}
          tone="warning"
        />
        <KpiCard
          label="Labor cost (7d)"
          value={totals.labor7d / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Coins}
          tone="brand"
        />
      </section>

      <div className="v2-filters">
        <div className="v2-filter-search">
          <Input
            placeholder="Search by name, phone, email, role…"
            leadingAdornment={<Search className="h-3.5 w-3.5" />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Tabs
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          tabs={[
            { value: "active", label: "Active", count: list.filter((s) => s.status === "active").length },
            { value: "inactive", label: "Inactive", count: list.filter((s) => s.status === "inactive").length },
            { value: "all", label: "All", count: list.length },
          ]}
          variant="pill"
          ariaLabel="Status filter"
        />
      </div>

      {loading ? (
        <div className="v2-page-loading">Loading staff…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={Award}
              title={list.length === 0 ? "No staff members yet" : "No matches"}
              description={
                list.length === 0
                  ? "Add a staff member to start tracking shifts and labor cost."
                  : "Try clearing the filters."
              }
              action={
                list.length === 0 ? (
                  <Button variant="primary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setDialog({ open: true, member: null })}>
                    Add staff
                  </Button>
                ) : undefined
              }
            />
          </CardBody>
        </Card>
      ) : (
        <Card padding="none">
          <CardBody>
            <Table rows={filtered} columns={cols} rowKey={(s) => s.id} defaultSort={{ key: "name", dir: "asc" }} />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Recent time punches" description="Latest clock-in / clock-out events" actions={<User className="h-4 w-4 v2-muted" />} />
        <CardBody>
          {punches.length === 0 ? (
            <EmptyState icon={Clock} title="No punches yet" compact />
          ) : (
            <ul className="v2-mov-list">
              {punches.slice(0, 20).map((p) => {
                const member = list.find((s) => s.id === p.staffId);
                const isIn = p.type === "clock-in";
                return (
                  <li key={p.id} className="v2-mov-row">
                    <span className={`v2-mov-icon v2-mov-tone-${isIn ? "success" : "warning"}`}>
                      {isIn ? <LogIn className="h-3 w-3" /> : <LogOut className="h-3 w-3" />}
                    </span>
                    <div className="v2-mov-text">
                      <div className="v2-mov-title">
                        <span>{member?.name ?? p.staffId}</span>
                        <span className="v2-muted">{isIn ? "Clock-in" : "Clock-out"}</span>
                      </div>
                      <div className="v2-mov-sub">{member ? `${ROLE_LABEL[member.role]} · ${member.locationSlug}` : ""}</div>
                    </div>
                    <span className="v2-mov-time">{fmtTime(p.occurredAt)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <StaffDialog state={dialog} onClose={() => setDialog({ open: false, member: null })} onSaved={async () => {
        setDialog({ open: false, member: null });
        await fetchAll();
        toast.success("Saved");
      }} />

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={doDelete}
        title={`Remove ${pendingDelete?.name ?? "staff member"}?`}
        description="Shift and time-punch history are preserved but the member can no longer be scheduled."
        confirmLabel="Remove"
        destructive
      />
    </div>
  );
}

function StaffDialog({ state, onClose, onSaved }: { state: DialogState; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("kitchen");
  const [loc, setLoc] = useState(activeLocations[0]?.slug ?? "krakow");
  const [rateStr, setRateStr] = useState("30.00");
  const [hireDate, setHireDate] = useState("");
  const [dob, setDob] = useState("");
  const [status, setStatus] = useState<StaffStatus>("active");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    const m = state.member;
    setName(m?.name ?? "");
    setPhone(m?.phone ?? "");
    setEmail(m?.email ?? "");
    setRole(m?.role ?? "kitchen");
    setLoc(m?.locationSlug ?? activeLocations[0]?.slug ?? "krakow");
    setRateStr(m ? (m.hourlyRateGrosze / 100).toFixed(2) : "30.00");
    setHireDate(m?.hireDate ?? "");
    setDob(m?.dob ?? "");
    setStatus(m?.status ?? "active");
    setNotes(m?.notes ?? "");
    setBusy(false);
  }, [state]);

  if (!state.open) return <Dialog open={false} onClose={onClose} />;

  const submit = async () => {
    if (!name.trim()) {
      toast.warning("Name required");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        id: state.member?.id,
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        role,
        locationSlug: loc,
        hourlyRateGrosze: Math.round(parseFloat(rateStr || "0") * 100),
        hireDate: hireDate || undefined,
        dob: dob || undefined,
        status,
        notes: notes.trim() || undefined,
      };
      const res = await fetch("/api/admin/staff", {
        method: state.member ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) onSaved();
      else toast.error("Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={state.member ? `Edit ${state.member.name}` : "New staff member"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>{state.member ? "Save changes" : "Create"}</Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="v2-form-row-2">
          <Input label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="v2-form-row-2">
          <Select
            label="Role"
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
            label="Location"
            value={loc}
            onChange={(e) => setLoc(e.target.value)}
            options={activeLocations.map((l) => ({ value: l.slug, label: l.city }))}
          />
        </div>
        <div className="v2-form-row-2">
          <Input
            label="Hourly rate"
            type="number"
            step="0.01"
            min="0"
            value={rateStr}
            onChange={(e) => setRateStr(e.target.value)}
            trailingAdornment={<span className="v2-muted">zł / h</span>}
          />
          <Input label="Hire date" type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
        </div>
        <Input
          label="Date of birth"
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          description="Optional. Required for under-18 scheduling rules in alcohol-serving locations (Polish Labor Code §190)."
        />
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as StaffStatus)}
          options={[
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
        />
        <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Dialog>
  );
}
