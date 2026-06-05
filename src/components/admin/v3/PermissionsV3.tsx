"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ALL_PERMISSION_KEYS, PERMISSION_GROUPS, ROLE_DEFAULT_PERMISSIONS } from "@/lib/permissions";
import type { AdminRole } from "@/lib/admin-roles";
import { Badge, Card, CardBody, CardHead } from "./ui";

interface UserRow { id: string; name: string; email?: string; role: AdminRole; status?: string; locationSlug?: string; notes?: string; permissions?: string[] }

const ROLE_LABEL: Record<AdminRole, string> = { owner: "Owner", manager: "Manager", franchisee: "Franchisee", staff: "Staff", kitchen: "Kitchen" };

export function PermissionsV3() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users").then((r) => (r.ok ? r.json() : [])).catch(() => []);
    const arr: UserRow[] = Array.isArray(res) ? res : [];
    setUsers(arr);
    setSelId((cur) => cur || arr.find((u) => u.role !== "owner")?.id || arr[0]?.id || "");
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const user = users.find((u) => u.id === selId) ?? null;
  const isOwner = user?.role === "owner";
  const effective = useMemo(() => {
    if (!user) return new Set<string>();
    if (isOwner) return new Set<string>(ALL_PERMISSION_KEYS);
    return new Set<string>(user.permissions ?? ROLE_DEFAULT_PERMISSIONS[user.role] ?? []);
  }, [user, isOwner]);
  const isCustom = !!user?.permissions;

  const toggle = async (key: string) => {
    if (!user || isOwner) return;
    const has = effective.has(key);
    const next = has ? [...effective].filter((k) => k !== key) : [...effective, key];
    setBusy(key);
    setUsers((arr) => arr.map((u) => (u.id === user.id ? { ...u, permissions: next } : u)));
    try {
      await fetch("/api/admin/users", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: user.id, name: user.name, email: user.email, role: user.role, status: user.status, locationSlug: user.locationSlug, notes: user.notes, permissions: next }) });
    } finally { setBusy(null); }
  };

  if (loading) return <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading permissions…</div>;

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Permission matrix</h1>
          <div className="av3-pagehead-sub">Action-level RBAC · grant capabilities per user</div>
        </div>
        <div className="av3-pagehead-actions">
          <span className="av3-scope">
            <select aria-label="User" value={selId} onChange={(e) => setSelId(e.target.value)} style={{ appearance: "none", height: 30, padding: "0 26px 0 10px", border: "1px solid var(--av3-line)", borderRadius: "var(--av3-r-sm)", background: "var(--av3-s1)", color: "var(--av3-fg)", font: "inherit", fontSize: 12.5 }}>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name} · {ROLE_LABEL[u.role]}</option>)}
            </select>
          </span>
        </div>
      </div>

      {user && (
        <div className="av3-callout" style={{ alignItems: "center" }}>
          <span style={{ fontSize: 12.5 }}>
            <b>{user.name}</b> — {ROLE_LABEL[user.role]}.{" "}
            {isOwner ? "Owners have full access (all capabilities)." : isCustom ? "Carrying a custom grant (overrides role defaults)." : "On role defaults — toggling any capability starts a custom grant."}
          </span>
          <span style={{ marginLeft: "auto" }}><Badge tone={isOwner ? "brand" : isCustom ? "warn" : "neutral"}>{isOwner ? "All access" : isCustom ? "Custom" : "Role default"}</Badge></span>
        </div>
      )}

      <div className="av3-grid-2">
        {PERMISSION_GROUPS.map((g) => (
          <Card key={g.id}>
            <CardHead title={g.label} />
            <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
              {g.permissions.map((p) => {
                const on = effective.has(p.key);
                return (
                  <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--av3-line)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500 }}>{p.label}</div>
                      <div className="av3-cell-muted" style={{ fontSize: 11 }}>{p.description}</div>
                    </div>
                    <button type="button" className="av3-toggle" data-on={on} disabled={isOwner || busy === p.key} onClick={() => toggle(p.key)} style={{ padding: "0 12px", flexShrink: 0 }}>{on ? "Granted" : "—"}</button>
                  </div>
                );
              })}
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
