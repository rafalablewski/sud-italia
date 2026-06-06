"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Check, Grid3x3, Minus, ShieldCheck, Sparkles, Users } from "lucide-react";
import { ALL_PERMISSION_KEYS, PERMISSION_GROUPS, ROLE_DEFAULT_PERMISSIONS } from "@/lib/permissions";
import type { AdminRole } from "@/lib/admin-roles";
import { Badge, Card, CardBody, CardHead, Kpi, Switch } from "./ui";

interface UserRow { id: string; name: string; email?: string; role: AdminRole; status?: string; locationSlug?: string; notes?: string; permissions?: string[] }

const ROLE_LABEL: Record<AdminRole, string> = { owner: "Owner", manager: "Manager", franchisee: "Franchisee", staff: "Staff", kitchen: "Kitchen" };
const MATRIX_ROLES: AdminRole[] = ["owner", "manager", "franchisee", "staff", "kitchen"];

export function PermissionsV3() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<"user" | "role">("user");

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

  // role default lookups for the cross-tab (owner = all)
  const roleHas = (role: AdminRole, key: string) => role === "owner" || (ROLE_DEFAULT_PERMISSIONS[role] ?? []).includes(key as never);

  const stats = useMemo(() => ({
    caps: ALL_PERMISSION_KEYS.length,
    roles: MATRIX_ROLES.length,
    users: users.length,
    custom: users.filter((u) => Array.isArray(u.permissions)).length,
  }), [users]);

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
          <div className="av3-pagehead-sub">Action-level RBAC · capability grants per role &amp; per user</div>
        </div>
        <div className="av3-pagehead-actions">
          <div className="av3-viewtoggle">
            <button type="button" className={view === "user" ? "is-active" : ""} onClick={() => setView("user")} title="By user">By user</button>
            <button type="button" className={view === "role" ? "is-active" : ""} onClick={() => setView("role")} title="By role">By role</button>
          </div>
          {view === "user" && (
            <span className="av3-scope">
              <select aria-label="User" value={selId} onChange={(e) => setSelId(e.target.value)} style={{ appearance: "none", height: 30, padding: "0 26px 0 10px", border: "1px solid var(--av3-line)", borderRadius: "var(--av3-r-sm)", background: "var(--av3-s1)", color: "var(--av3-fg)", font: "inherit", fontSize: 12.5 }}>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name} · {ROLE_LABEL[u.role]}</option>)}
              </select>
            </span>
          )}
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="Capabilities" icon={ShieldCheck} value={`${stats.caps}`} accentVar="--av3-c3" />
        <Kpi label="Roles" icon={Grid3x3} value={`${stats.roles}`} accentVar="--av3-c2" />
        <Kpi label="User accounts" icon={Users} value={`${stats.users}`} accentVar="--av3-c4" />
        <Kpi label="Custom grants" icon={Sparkles} value={`${stats.custom}`} accentVar="--av3-c5" />
      </div>

      {view === "user" ? (
        <>
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
                        <Switch checked={on} disabled={isOwner || busy === p.key} label={on ? "Granted" : "—"} onChange={() => toggle(p.key)} />
                      </div>
                    );
                  })}
                </CardBody>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="av3-callout" style={{ alignItems: "center" }}>
            <span style={{ fontSize: 12.5 }}>Baseline capabilities each <b>role</b> receives by default. Owners are always all-access; per-user overrides live on the <b>By user</b> tab.</span>
          </div>
          <div className="av3-card" style={{ padding: 0 }}>
            <div className="av3-matrix-wrap">
              <table className="av3-matrix">
                <thead>
                  <tr>
                    <th>Capability</th>
                    {MATRIX_ROLES.map((r) => <th key={r} className={r === "owner" ? "av3-mx-owner" : undefined}>{ROLE_LABEL[r]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_GROUPS.map((g) => (
                    <Fragment key={g.id}>
                      <tr className="av3-mx-group"><td colSpan={MATRIX_ROLES.length + 1}>{g.label}</td></tr>
                      {g.permissions.map((p) => (
                        <tr key={p.key}>
                          <td className="av3-mx-cap">{p.label}<small>{p.description}</small></td>
                          {MATRIX_ROLES.map((r) => (
                            <td key={r} className={`av3-mx-cell ${r === "owner" ? "av3-mx-owner" : ""}`}>
                              {roleHas(r, p.key)
                                ? <span className="av3-mx-yes" title="granted"><Check /></span>
                                : <span className="av3-mx-no" title="not granted"><Minus /></span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
