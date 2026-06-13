"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Users } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import { STAFF_ROLE_LABEL, STAFF_ROLE_OPTIONS } from "@/lib/staff-roles";
import type { StaffMember, StaffRole, StaffStatus } from "@/data/types";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, type BadgeTone, Button, type ColumnV3, Dialog, Kpi, SkeletonKpiRail, SkeletonRows, Table } from "./ui";

interface Punch { id: string; staffId: string; type: "clock-in" | "clock-out"; at?: string; occurredAt?: string; createdAt?: string }

function roleTone(role: StaffRole): BadgeTone {
  if (role === "manager") return "brand";
  if (["pizzaiolo", "chef", "kp", "kitchen"].includes(role)) return "warn";
  if (["waiter", "front"].includes(role)) return "info";
  return "neutral";
}
function startOfTodayIso() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); }
function punchTime(p: Punch) { return new Date(p.at || p.occurredAt || p.createdAt || 0).getTime(); }

export function StaffV3() {
  const { location } = useAdminLocationV3();
  const all = useMemo(() => getActiveLocations(), []);
  const [list, setList] = useState<StaffMember[]>([]);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StaffStatus>("active");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<StaffMember | null>(null);
  const [adding, setAdding] = useState(false);
  const [punchBusy, setPunchBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([
      fetch(`/api/admin/staff${location ? `?location=${location}` : ""}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`/api/admin/time-punches?from=${startOfTodayIso()}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    setList(Array.isArray(s) ? s : []);
    setPunches(Array.isArray(p) ? p : []);
    setLoading(false);
  }, [location]);
  useEffect(() => { load(); }, [load]);

  // who's on shift now: last punch today is a clock-in
  const onShift = useMemo(() => {
    const last = new Map<string, Punch>();
    for (const p of [...punches].sort((a, b) => punchTime(a) - punchTime(b))) last.set(p.staffId, p);
    const set = new Set<string>();
    for (const [id, p] of last) if (p.type === "clock-in") set.add(id);
    return set;
  }, [punches]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return list.filter((s) => s.status === filter && (!needle || s.name.toLowerCase().includes(needle) || (STAFF_ROLE_LABEL[s.role] ?? s.role).toLowerCase().includes(needle) || (s.email ?? "").toLowerCase().includes(needle)));
  }, [list, filter, q]);
  const counts = { active: list.filter((s) => s.status === "active").length, inactive: list.filter((s) => s.status === "inactive").length };

  const punch = async (m: StaffMember) => {
    setPunchBusy(m.id);
    try {
      const type = onShift.has(m.id) ? "clock-out" : "clock-in";
      const res = await fetch("/api/admin/time-punches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staffId: m.id, type }) });
      if (res.ok) await load();
    } finally {
      setPunchBusy(null);
    }
  };

  const cols: ColumnV3<StaffMember>[] = [
    { key: "name", header: "Name", render: (s) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
        {onShift.has(s.id) && <span className="av3-live-dot" aria-hidden title="on shift" />}
        <span style={{ fontWeight: 600 }}>{s.name}</span>
      </span>
    ) },
    { key: "role", header: "Role", render: (s) => <Badge tone={roleTone(s.role)}>{STAFF_ROLE_LABEL[s.role] ?? s.role}</Badge> },
    { key: "site", header: "Site", render: (s) => <span className="av3-cell-muted">{all.find((l) => l.slug === s.locationSlug)?.city ?? s.locationSlug}</span> },
    { key: "rate", header: "Rate/hr (brutto)", num: true, render: (s) => formatPrice(s.hourlyRateGrosze) },
    { key: "punch", header: "", render: (s) => (
      <Button variant={onShift.has(s.id) ? "secondary" : "ghost"} size="sm" loading={punchBusy === s.id} onClick={(e) => { e.stopPropagation(); punch(s); }}>
        {onShift.has(s.id) ? "Clock out" : "Clock in"}
      </Button>
    ) },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Staff</h1>
          <div className="av3-pagehead-sub">Team directory · clock in/out · {location ? all.find((l) => l.slug === location)?.city : "all sites"}</div>
        </div>
        <div className="av3-pagehead-actions">
          <Button variant="primary" size="sm" onClick={() => setAdding(true)}><Plus className="av3-btn-ico" /> Add staff</Button>
        </div>
      </div>

      {loading && list.length === 0 ? <SkeletonKpiRail count={2} /> : (
      <div className="av3-kpi-rail">
        <Kpi label="Active staff" icon={Users} value={`${counts.active}`} accentVar="--av3-c3" />
        <Kpi label="On shift now" icon={Users} value={`${onShift.size}`} accentVar="--av3-c4" />
      </div>
      )}

      <div className="av3-toolbar">
        <div className="av3-filterchips">
          <button type="button" className={`av3-fchip ${filter === "active" ? "is-active" : ""}`} onClick={() => setFilter("active")}>Active<span className="av3-fchip-count">{counts.active}</span></button>
          <button type="button" className={`av3-fchip ${filter === "inactive" ? "is-active" : ""}`} onClick={() => setFilter("inactive")}>Inactive<span className="av3-fchip-count">{counts.inactive}</span></button>
        </div>
        <span className="av3-toolbar-spacer" />
        <input className="av3-input" style={{ fontFamily: "var(--av3-ui)", width: 220, height: 32 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, role, email…" />
      </div>

      {loading && list.length === 0 ? (
        <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={6} /></div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No {filter} staff</div><div className="av3-empty-text">Add a team member with “Add staff”.</div></div>
          ) : (
            <Table columns={cols} rows={rows} rowKey={(s) => s.id} onRowClick={(s) => setEdit(s)} />
          )}
        </div>
      )}

      {(edit || adding) && (
        <StaffDialog member={edit} locations={all} onClose={() => { setEdit(null); setAdding(false); }} onSaved={async () => { await load(); setEdit(null); setAdding(false); }} />
      )}
    </>
  );
}

function StaffDialog({ member, locations, onClose, onSaved }: { member: StaffMember | null; locations: ReturnType<typeof getActiveLocations>; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(member?.name ?? "");
  const [role, setRole] = useState<StaffRole>(member?.role ?? "waiter");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [rate, setRate] = useState(member ? String(member.hourlyRateGrosze / 100) : "");
  const [locationSlug, setLocationSlug] = useState(member?.locationSlug ?? locations[0]?.slug ?? "krakow");
  const [status, setStatus] = useState<StaffStatus>(member?.status ?? "active");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ...(member ? { id: member.id } : {}),
        name: name.trim(), role, phone: phone.trim() || undefined, email: email.trim() || undefined,
        hourlyRateGrosze: Math.max(0, Math.round((Number(rate) || 0) * 100)), locationSlug, status,
      };
      const res = await fetch("/api/admin/staff", { method: member ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) await onSaved();
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!member) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/staff?id=${encodeURIComponent(member.id)}`, { method: "DELETE" });
      if (res.ok) await onSaved();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog
      open onClose={onClose}
      title={member ? member.name : "New staff member"}
      subtitle={member ? "Edit team member" : "Add a team member"}
      width={520}
      footer={<>{member && <Button variant="danger" size="sm" loading={deleting} onClick={remove} style={{ marginRight: "auto" }}>Delete</Button>}<Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" loading={saving} disabled={!name.trim()} onClick={save}>Save</Button></>}
    >
      <div className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Name</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 10 }}>
        <label className="av3-field"><span className="av3-field-label">Role</span>
          <select className="av3-select" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
            {STAFF_ROLE_OPTIONS.map((g) => <optgroup key={g.group} label={g.group}>{g.roles.map((r) => <option key={r} value={r}>{STAFF_ROLE_LABEL[r]}</option>)}</optgroup>)}
          </select>
        </label>
        <label className="av3-field"><span className="av3-field-label">Rate / hr (zł brutto)</span><input className="av3-input" type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} /></label>
      </div>
      <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 10 }}>
        <label className="av3-field"><span className="av3-field-label">Phone</span><input className="av3-input" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        <label className="av3-field"><span className="av3-field-label">Email</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      </div>
      <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <label className="av3-field"><span className="av3-field-label">Site</span>
          <select className="av3-select" value={locationSlug} onChange={(e) => setLocationSlug(e.target.value)}>{locations.map((l) => <option key={l.slug} value={l.slug}>{l.city}</option>)}</select>
        </label>
        <label className="av3-field"><span className="av3-field-label">Status</span>
          <select className="av3-select" value={status} onChange={(e) => setStatus(e.target.value as StaffStatus)}><option value="active">Active</option><option value="inactive">Inactive</option></select>
        </label>
      </div>
    </Dialog>
  );
}
