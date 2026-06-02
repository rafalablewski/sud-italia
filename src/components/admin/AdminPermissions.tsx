"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Grid3x3, KeyRound, Minus, Search, ShieldCheck, UserCog, Users as UsersIcon } from "lucide-react";
import type { AdminRole, AdminUser } from "@/data/types";
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_GROUPS,
  ROLE_DEFAULT_PERMISSIONS,
  effectiveHas,
  resolveEffectivePermissions,
  type PermissionKey,
} from "@/lib/permissions";
import { useToast } from "./v2/ui/Toast";
import { Badge, Card, CardBody, Chip, EmptyState, Input, Tabs } from "./v2/ui";
import { KpiCard } from "./v2/charts";

/** Row shape from /api/admin/users (secrets stripped; `permissions` kept). */
type UserRow = AdminUser & { hasPassword?: boolean; hasPin?: boolean };

const ROLE_LABEL: Record<AdminRole, string> = {
  owner: "Owner",
  franchisee: "Franchisee",
  manager: "Manager",
  staff: "Staff",
  kitchen: "Kitchen",
};
const ROLE_TONE: Record<AdminRole, "brand" | "info" | "warning" | "success"> = {
  owner: "brand",
  franchisee: "info",
  manager: "info",
  staff: "warning",
  kitchen: "success",
};
// Columns for the role view, most-privileged first.
const ROLE_ORDER: AdminRole[] = ["owner", "franchisee", "manager", "staff", "kitchen"];

// Precompute the default grant as a Set per role (owner = everything).
const ROLE_SETS: Record<AdminRole, Set<string>> = ROLE_ORDER.reduce((acc, r) => {
  acc[r] = r === "owner" ? new Set(ALL_PERMISSION_KEYS) : new Set(ROLE_DEFAULT_PERMISSIONS[r]);
  return acc;
}, {} as Record<AdminRole, Set<string>>);

type ViewMode = "role" | "user";

export function AdminPermissions() {
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [view, setView] = useState<ViewMode>("role");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("all");
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = res.ok ? await res.json() : [];
      setUsers(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCanEdit(!!d.allAccess))
      .catch(() => {});
  }, [fetchUsers]);

  // Permission rows after search + group filter, kept grouped.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PERMISSION_GROUPS.map((g) => ({
      id: g.id,
      label: g.label,
      permissions: g.permissions.filter(
        (p) =>
          !q ||
          p.label.toLowerCase().includes(q) ||
          p.key.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q),
      ),
    })).filter((g) => (group === "all" || g.id === group) && g.permissions.length > 0);
  }, [query, group]);

  // Users sorted owners → rank → name, for stable columns.
  const sortedUsers = useMemo(() => {
    const rank: Record<AdminRole, number> = { owner: 5, franchisee: 4, manager: 3, staff: 2, kitchen: 1 };
    return [...users].sort((a, b) => (rank[b.role] - rank[a.role]) || a.name.localeCompare(b.name));
  }, [users]);

  const customCount = useMemo(
    () => users.filter((u) => u.role !== "owner" && Array.isArray(u.permissions)).length,
    [users],
  );

  // Toggle one capability for one user → persists a custom grant (owner-only).
  const toggleUser = async (user: UserRow, key: PermissionKey, next: boolean) => {
    const eff = resolveEffectivePermissions(user);
    const set = new Set<string>(eff.keys);
    if (next) set.add(key);
    else set.delete(key);
    const permissions = Array.from(set);

    // Optimistic: mark the user as carrying this exact custom grant.
    setUsers((arr) => arr.map((u) => (u.id === user.id ? { ...u, permissions } : u)));
    setSavingKey(`${user.id}:${key}`);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          locationSlug: user.locationSlug,
          notes: user.notes,
          permissions,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error("Could not update", data?.error || (res.status === 403 ? "Owner only" : ""));
        await fetchUsers(); // revert to server truth
      }
    } catch {
      toast.error("Could not update");
      await fetchUsers();
    } finally {
      setSavingKey(null);
    }
  };

  const visiblePermCount = groups.reduce((n, g) => n + g.permissions.length, 0);

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Permission matrix</h1>
          <p className="v2-page-subtitle">
            Live cross-tab of every capability against your roles and your real accounts — built from the permission catalog (<span className="mono">src/lib/permissions.ts</span>), the role presets, and the current user list. Nothing here is hand-maintained: add a capability or a user and it shows up. <strong>By role</strong> shows the default grant each role inherits; <strong>By user</strong> shows each account&rsquo;s effective access (custom grants override their role) and lets an owner flip a cell to grant or revoke.
          </p>
        </div>
      </header>

      <section className="v2-kpi-grid">
        <KpiCard label="Capabilities" value={ALL_PERMISSION_KEYS.length} icon={KeyRound} tone="brand" />
        <KpiCard label="Roles" value={ROLE_ORDER.length} icon={ShieldCheck} tone="info" />
        <KpiCard label="User accounts" value={users.length} icon={UsersIcon} tone="info" />
        <KpiCard label="Custom grants" value={customCount} icon={UserCog} tone={customCount > 0 ? "warning" : "neutral"} />
      </section>

      <div className="v2-filters">
        <div className="v2-filter-search">
          <Input
            placeholder="Search capabilities by name, key, or description…"
            leadingAdornment={<Search className="h-3.5 w-3.5" />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Tabs
          value={view}
          onChange={(v) => setView(v as ViewMode)}
          tabs={[
            { value: "role", label: "By role" },
            { value: "user", label: "By user", count: users.length },
          ]}
          variant="pill"
          ariaLabel="Matrix view"
        />
      </div>

      <div className="v2-filters" style={{ flexWrap: "wrap", gap: 6 }}>
        <Chip selected={group === "all"} onClick={() => setGroup("all")}>
          All groups
        </Chip>
        {PERMISSION_GROUPS.map((g) => (
          <Chip key={g.id} selected={group === g.id} onClick={() => setGroup(g.id)}>
            {g.label}
          </Chip>
        ))}
      </div>

      {loading ? (
        <div className="v2-page-loading">Loading permission matrix…</div>
      ) : visiblePermCount === 0 ? (
        <Card>
          <CardBody>
            <EmptyState icon={Grid3x3} title="No matching capabilities" description="Try clearing the search or group filter." />
          </CardBody>
        </Card>
      ) : view === "role" ? (
        <RoleMatrix groups={groups} />
      ) : (
        <UserMatrix
          groups={groups}
          users={sortedUsers}
          canEdit={canEdit}
          savingKey={savingKey}
          onToggle={toggleUser}
        />
      )}

      <Card padding="compact">
        <div className="v2-note">
          <ShieldCheck className="h-4 w-4" />
          <span>
            <strong>Owners are always all-access</strong> and can&rsquo;t be narrowed. Toggling a cell in <strong>By user</strong> writes that account a fully-custom grant (it stops inheriting its role defaults) and persists immediately through the owner-only <span className="mono">/api/admin/users</span> — the same gate the Users editor uses. The matrix re-reads after every write, so what you see is what the server enforces.
          </span>
        </div>
      </Card>
    </div>
  );
}

function HeatCell({ on }: { on: boolean }) {
  return on ? (
    <span title="Granted" style={{ display: "inline-flex", color: "var(--success, #34d399)" }}>
      <Check className="h-4 w-4" />
    </span>
  ) : (
    <span title="Not granted" style={{ display: "inline-flex", color: "var(--v2-muted, rgba(255,255,255,0.3))" }}>
      <Minus className="h-4 w-4" />
    </span>
  );
}

const matrixWrap: React.CSSProperties = { overflowX: "auto", borderRadius: 12 };
const th: React.CSSProperties = {
  position: "sticky",
  top: 0,
  background: "var(--v2-surface, #15171c)",
  zIndex: 2,
  padding: "10px 12px",
  textAlign: "center",
  fontSize: "0.78rem",
  fontWeight: 600,
  whiteSpace: "nowrap",
};
const firstCol: React.CSSProperties = {
  position: "sticky",
  left: 0,
  background: "var(--v2-surface, #15171c)",
  zIndex: 1,
  padding: "8px 12px",
  minWidth: 260,
  textAlign: "left",
};
const cell: React.CSSProperties = { padding: "6px 12px", textAlign: "center", borderTop: "1px solid var(--v2-border, rgba(255,255,255,0.06))" };
const groupRow: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: "0.72rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  background: "var(--v2-surface-2, rgba(255,255,255,0.03))",
};

type Group = { id: string; label: string; permissions: readonly { key: string; label: string; description: string }[] };

function RoleMatrix({ groups }: { groups: Group[] }) {
  return (
    <Card padding="none">
      <CardBody>
        <div style={matrixWrap}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.85rem" }}>
            <thead>
              <tr>
                <th style={{ ...th, ...firstCol, textAlign: "left" }}>Capability</th>
                {ROLE_ORDER.map((r) => (
                  <th key={r} style={th}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <Badge tone={ROLE_TONE[r]} variant="soft">{ROLE_LABEL[r]}</Badge>
                      <span className="v2-muted" style={{ fontSize: "0.68rem" }}>{ROLE_SETS[r].size}/{ALL_PERMISSION_KEYS.length}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <RoleGroupRows key={g.id} group={g} />
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

function RoleGroupRows({ group }: { group: Group }) {
  return (
    <>
      <tr>
        <td style={{ ...groupRow, ...firstCol, background: "var(--v2-surface-2, rgba(255,255,255,0.03))" }}>{group.label}</td>
        {ROLE_ORDER.map((r) => (
          <td key={r} style={groupRow} />
        ))}
      </tr>
      {group.permissions.map((p) => (
        <tr key={p.key}>
          <td style={firstCol}>
            <div className="v2-cell-stack">
              <span>{p.label}</span>
              <span className="v2-cell-sub mono" style={{ fontSize: "0.7rem" }}>{p.key}</span>
            </div>
          </td>
          {ROLE_ORDER.map((r) => (
            <td key={r} style={cell}>
              <HeatCell on={ROLE_SETS[r].has(p.key)} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

type UserMeta = { has: (k: string) => boolean; custom: boolean; count: number };

function UserGroupRows({
  group,
  users,
  effByUser,
  canEdit,
  savingKey,
  onToggle,
}: {
  group: Group;
  users: UserRow[];
  effByUser: Map<string, UserMeta>;
  canEdit: boolean;
  savingKey: string | null;
  onToggle: (user: UserRow, key: PermissionKey, next: boolean) => void;
}) {
  return (
    <>
      <tr>
        <td style={{ ...groupRow, ...firstCol, background: "var(--v2-surface-2, rgba(255,255,255,0.03))" }}>{group.label}</td>
        {users.map((u) => <td key={u.id} style={groupRow} />)}
      </tr>
      {group.permissions.map((p) => (
        <tr key={p.key}>
          <td style={firstCol}>
            <div className="v2-cell-stack">
              <span>{p.label}</span>
              <span className="v2-cell-sub mono" style={{ fontSize: "0.7rem" }}>{p.key}</span>
            </div>
          </td>
          {users.map((u) => {
            const on = effByUser.get(u.id)?.has(p.key) ?? false;
            const locked = u.role === "owner" || !canEdit;
            const saving = savingKey === `${u.id}:${p.key}`;
            if (locked) {
              return (
                <td key={u.id} style={cell}>
                  <HeatCell on={on} />
                </td>
              );
            }
            return (
              <td key={u.id} style={cell}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onToggle(u, p.key as PermissionKey, !on)}
                  title={on ? "Click to revoke" : "Click to grant"}
                  style={{
                    display: "inline-flex",
                    border: "none",
                    background: "transparent",
                    cursor: saving ? "wait" : "pointer",
                    opacity: saving ? 0.4 : 1,
                    padding: 2,
                    borderRadius: 6,
                  }}
                >
                  <HeatCell on={on} />
                </button>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function UserMatrix({
  groups,
  users,
  canEdit,
  savingKey,
  onToggle,
}: {
  groups: Group[];
  users: UserRow[];
  canEdit: boolean;
  savingKey: string | null;
  onToggle: (user: UserRow, key: PermissionKey, next: boolean) => void;
}) {
  // Resolve each user's effective set once per render.
  const effByUser = useMemo(() => {
    const m = new Map<string, { has: (k: string) => boolean; custom: boolean; count: number }>();
    for (const u of users) {
      const eff = resolveEffectivePermissions(u);
      m.set(u.id, {
        has: (k) => effectiveHas(eff, k as PermissionKey),
        custom: eff.custom,
        count: eff.all ? ALL_PERMISSION_KEYS.length : eff.keys.size,
      });
    }
    return m;
  }, [users]);

  if (users.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState icon={UsersIcon} title="No user accounts yet" description="Create accounts in Users & roles to populate the matrix." />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card padding="none">
      <CardBody>
        <div style={matrixWrap}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.85rem" }}>
            <thead>
              <tr>
                <th style={{ ...th, ...firstCol, textAlign: "left" }}>Capability</th>
                {users.map((u) => {
                  const meta = effByUser.get(u.id)!;
                  return (
                    <th key={u.id} style={th}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 92 }}>
                        <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>{u.name}</span>
                        <Badge tone={ROLE_TONE[u.role]} variant="soft">{ROLE_LABEL[u.role]}</Badge>
                        <span className="v2-muted" style={{ fontSize: "0.66rem" }}>
                          {u.role === "owner" ? "all" : `${meta.count}/${ALL_PERMISSION_KEYS.length}`}
                          {meta.custom ? " · custom" : ""}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <UserGroupRows
                  key={g.id}
                  group={g}
                  users={users}
                  effByUser={effByUser}
                  canEdit={canEdit}
                  savingKey={savingKey}
                  onToggle={onToggle}
                />
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}
