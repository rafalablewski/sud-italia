"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import type { AdminRole } from "@/lib/admin-roles";
import { Badge, Button, Dialog, Kpi, Table, type BadgeTone, type ColumnV3 } from "./ui";

interface UserRow { id: string; name: string; email?: string; role: AdminRole; status?: string; locationSlug?: string; notes?: string }
const ROLES: AdminRole[] = ["owner", "manager", "franchisee", "staff", "kitchen"];
const ROLE_LABEL: Record<AdminRole, string> = { owner: "Owner", manager: "Manager", franchisee: "Franchisee", staff: "Staff", kitchen: "Kitchen" };
const ROLE_TONE: Record<AdminRole, BadgeTone> = { owner: "brand", manager: "info", franchisee: "info", staff: "neutral", kitchen: "warn" };

export function UsersV3() {
  const all = useMemo(() => getActiveLocations(), []);
  const [list, setList] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | AdminRole>("all");
  const [edit, setEdit] = useState<UserRow | "new" | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users").then((r) => (r.ok ? r.json() : [])).catch(() => []);
    setList(Array.isArray(res) ? res : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (id: string) => { const r = await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`, { method: "DELETE" }); if (r.ok) await load(); };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: list.length };
    for (const u of list) c[u.role] = (c[u.role] ?? 0) + 1;
    return c;
  }, [list]);
  const rows = useMemo(() => (filter === "all" ? list : list.filter((u) => u.role === filter)), [list, filter]);
  const chips: ("all" | AdminRole)[] = ["all", ...ROLES];

  const cols: ColumnV3<UserRow>[] = [
    { key: "name", header: "Name", render: (u) => <span style={{ fontWeight: 600 }}>{u.name}</span> },
    { key: "email", header: "Email", render: (u) => <span className="av3-cell-muted">{u.email || "—"}</span> },
    { key: "role", header: "Role", render: (u) => <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge> },
    { key: "loc", header: "Site", render: (u) => <span className="av3-cell-muted">{u.locationSlug ? all.find((l) => l.slug === u.locationSlug)?.city ?? u.locationSlug : "All"}</span> },
    { key: "st", header: "Status", render: (u) => <Badge tone={u.status === "inactive" ? "neutral" : "ok"} dot>{u.status === "inactive" ? "Inactive" : "Active"}</Badge> },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Users &amp; roles</h1>
          <div className="av3-pagehead-sub">Team accounts · role-based access</div>
        </div>
        <div className="av3-pagehead-actions">
          <Button variant="primary" size="sm" onClick={() => setEdit("new")}><Plus className="av3-btn-ico" /> Add user</Button>
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="Users" icon={ShieldCheck} value={`${list.length}`} accentVar="--av3-c3" />
        <Kpi label="Owners" icon={ShieldCheck} value={`${counts.owner ?? 0}`} accentVar="--av3-c1" />
        <Kpi label="Active" icon={ShieldCheck} value={`${list.filter((u) => u.status !== "inactive").length}`} accentVar="--av3-c4" />
      </div>

      <div className="av3-filterchips">
        {chips.map((f) => (
          <button key={f} type="button" className={`av3-fchip ${filter === f ? "is-active" : ""}`} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : ROLE_LABEL[f]}<span className="av3-fchip-count">{counts[f] ?? 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading users…</div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No users</div><div className="av3-empty-text">Add a team member to grant them access.</div></div>
          ) : (
            <Table columns={cols} rows={rows} rowKey={(u) => u.id} onRowClick={(u) => setEdit(u)} />
          )}
        </div>
      )}

      {edit && <UserDialog user={edit === "new" ? null : edit} locations={all} onClose={() => setEdit(null)} onSaved={async () => { await load(); setEdit(null); }} onDelete={edit !== "new" ? async () => { await remove((edit as UserRow).id); setEdit(null); } : undefined} />}
    </>
  );
}

function UserDialog({ user, locations, onClose, onSaved, onDelete }: { user: UserRow | null; locations: ReturnType<typeof getActiveLocations>; onClose: () => void; onSaved: () => Promise<void>; onDelete?: () => Promise<void> }) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<AdminRole>(user?.role ?? "staff");
  const [status, setStatus] = useState(user?.status ?? "active");
  const [locationSlug, setLocationSlug] = useState(user?.locationSlug ?? "");
  const [notes, setNotes] = useState(user?.notes ?? "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ...(user ? { id: user.id } : {}),
        name: name.trim(), email: email.trim() || undefined, role, status,
        locationSlug: locationSlug || undefined, notes: notes.trim() || undefined,
      };
      if (password.trim()) payload.password = password;
      const res = await fetch("/api/admin/users", { method: user ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) await onSaved();
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onClose={onClose} title={user ? user.name : "New user"} headerExtra={<Badge tone={ROLE_TONE[role]}>{ROLE_LABEL[role]}</Badge>} width={520}
      footer={<>{onDelete && <Button variant="danger" size="sm" loading={deleting} onClick={async () => { setDeleting(true); try { await onDelete(); } finally { setDeleting(false); } }} style={{ marginRight: "auto" }}>Delete</Button>}<Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" loading={saving} disabled={!name.trim()} onClick={save}>Save</Button></>}>
      <div className="av3-formrow" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 10 }}>
        <label className="av3-field"><span className="av3-field-label">Name</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="av3-field"><span className="av3-field-label">Email</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      </div>
      <div className="av3-formrow" style={{ marginBottom: 10 }}>
        <label className="av3-field"><span className="av3-field-label">Role</span><select className="av3-select" value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
        <label className="av3-field"><span className="av3-field-label">Status</span><select className="av3-select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        <label className="av3-field"><span className="av3-field-label">Site</span><select className="av3-select" value={locationSlug} onChange={(e) => setLocationSlug(e.target.value)}><option value="">All sites</option>{locations.map((l) => <option key={l.slug} value={l.slug}>{l.city}</option>)}</select></label>
      </div>
      <label className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">{user ? "Reset password (optional)" : "Password (optional — else shared owner password)"}</span><input className="av3-input" type="password" style={{ fontFamily: "var(--av3-ui)" }} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" /></label>
      <label className="av3-field"><span className="av3-field-label">Notes</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
    </Dialog>
  );
}
