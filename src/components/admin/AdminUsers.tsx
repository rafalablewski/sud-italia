"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Fingerprint, KeyRound, Lock, Pencil, Plus, RotateCcw, Search, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import type { AdminRole, AdminUser, AdminUserStatus } from "@/data/types";
import { userLocationSlugs } from "@/lib/user-locations";
import { landingPathForRole } from "@/lib/staff-roles";

/** A passkey / security key as listed by the API (no public key, no counter). */
type WebauthnKey = { id: string; name?: string; createdAt: string; transports?: string[] };
/** Row shape from /api/admin/users — secrets stripped, "is set" flags added. */
type AdminUserRow = AdminUser & {
  hasPassword?: boolean;
  hasPin?: boolean;
  webauthnKeys?: WebauthnKey[];
};
import { getActiveLocations } from "@/data/locations";
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_GROUPS,
  ROLE_DEFAULT_PERMISSIONS,
} from "@/lib/permissions";
import { useToast } from "./v2/ui/Toast";

import {
  Badge,
  Button,
  Card,
  CardBody,
  Chip,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Input,
  Select,
  Switch,
  Tabs,
  Table,
  Textarea,
  type Column,
} from "./v2/ui";

const ROLE_LABEL: Record<AdminRole, string> = {
  owner: "Owner",
  manager: "Manager",
  franchisee: "Franchisee",
  staff: "Staff",
  kitchen: "Kitchen",
};

/** Human label for the surface a role lands on after sign-in. */
function landingLabel(role: AdminRole): string {
  const p = landingPathForRole(role);
  if (p === "/admin/kds") return "the Kitchen Display (KDS)";
  if (p === "/admin/pos") return "the POS till";
  return "the admin dashboard";
}

/**
 * Plain-language account of how a given account signs in — which doors are
 * open (password / PIN / passkey), whether MFA is required, where they land,
 * and any location restriction. Drives the per-row hint + the Login dialog so
 * an operator can see exactly how each person gets in.
 */
function describeLogin(u: AdminUserRow): { methods: string[]; mfa: boolean; landing: string; locations: string[] } {
  const methods: string[] = [];
  if (u.role === "owner") {
    methods.push(`Email + ${u.hasPassword ? "their own password" : "the shared owner password"} at /admin/login`);
  } else {
    methods.push(
      u.hasPassword
        ? "Email + their own password at /admin/login"
        : "Email + the shared admin password at /admin/login (no personal password set yet)",
    );
  }
  if (u.hasPin) methods.push("A 4–10 digit PIN on the shared terminal at /terminal");
  if ((u.webauthnKeys?.length ?? 0) > 0) methods.push("A passkey / security key (YubiKey, Touch ID) at /admin/login — passwordless");
  return {
    methods,
    mfa: !!u.totpEnabled,
    landing: landingLabel(u.role),
    locations: userLocationSlugs(u),
  };
}

/** One-word landing tag for the dense table cell. */
function landingTag(role: AdminRole): string {
  const p = landingPathForRole(role);
  return p === "/admin/kds" ? "KDS" : p === "/admin/pos" ? "POS" : "Admin";
}

const ROLE_TONE: Record<AdminRole, "info" | "brand" | "warning" | "success"> = {
  owner: "brand",
  manager: "info",
  franchisee: "info",
  staff: "warning",
  kitchen: "success",
};

const STATUS_TONE: Record<AdminUserStatus, "success" | "neutral"> = {
  active: "success",
  disabled: "neutral",
};

const activeLocations = getActiveLocations();

type DialogState = { open: boolean; user: AdminUser | null };

export function AdminUsers() {
  return <AdminUsersDesktop />;
}

function AdminUsersDesktop() {
  const toast = useToast();
  const [list, setList] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<AdminRole | "all">("all");
  const [dialog, setDialog] = useState<DialogState>({ open: false, user: null });
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null);
  const [mfaUser, setMfaUser] = useState<AdminUser | null>(null);
  const [credUser, setCredUser] = useState<AdminUserRow | null>(null);
  const [keysUser, setKeysUser] = useState<AdminUserRow | null>(null);
  const [me, setMe] = useState<{ id: string; role: AdminRole } | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setList(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setMe({ id: d.id, role: d.role }))
      .catch(() => {});
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        (u.email?.toLowerCase().includes(q) ?? false) ||
        u.role.toLowerCase().includes(q)
      );
    });
  }, [list, query, roleFilter]);

  const doDelete = async () => {
    if (!pendingDelete) return;
    const res = await fetch(`/api/admin/users?id=${encodeURIComponent(pendingDelete.id)}`, { method: "DELETE" });
    if (res.ok) {
      setList((arr) => arr.filter((u) => u.id !== pendingDelete.id));
      toast.success("Removed", pendingDelete.name);
    } else if (res.status === 403) {
      toast.error("Forbidden", "Only an owner can remove users.");
    }
    setPendingDelete(null);
  };

  const counts = useMemo(() => {
    const c: Record<AdminRole | "all", number> = { all: list.length, owner: 0, manager: 0, franchisee: 0, staff: 0, kitchen: 0 };
    for (const u of list) c[u.role]++;
    return c;
  }, [list]);

  const isOwner = me?.role === "owner";
  const cols: Column<AdminUserRow>[] = [
    {
      key: "name",
      header: "Name",
      cell: (u) => (
        <div className="v2-cell-stack">
          <span>{u.name}</span>
          {u.email && <span className="v2-cell-sub">{u.email}</span>}
        </div>
      ),
      sortValue: (u) => u.name,
    },
    {
      key: "role",
      header: "Role",
      cell: (u) => (
        <Badge tone={ROLE_TONE[u.role]} variant="soft" dot>
          {ROLE_LABEL[u.role]}
        </Badge>
      ),
      sortValue: (u) => u.role,
    },
    {
      key: "access",
      header: "Access",
      cell: (u) =>
        u.role === "owner" ? (
          <Badge tone="brand" variant="soft">Full access</Badge>
        ) : Array.isArray(u.permissions) ? (
          <Badge tone="info" variant="outline">{`Custom · ${u.permissions.length}`}</Badge>
        ) : (
          <span className="v2-muted">Role default</span>
        ),
      sortValue: (u) => (Array.isArray(u.permissions) ? 1 : 0),
    },
    {
      key: "loc",
      header: "Locations",
      cell: (u) => {
        const slugs = userLocationSlugs(u);
        return slugs.length === 0 ? (
          <span className="v2-muted">All</span>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {slugs.map((s) => (
              <Badge key={s} tone="neutral" variant="outline">{s}</Badge>
            ))}
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (u) => (
        <Badge tone={STATUS_TONE[u.status]} variant="soft" dot>
          {u.status}
        </Badge>
      ),
      sortValue: (u) => u.status,
    },
    {
      key: "signin",
      header: "Sign-in",
      cell: (u) => (
        <div className="v2-cell-stack">
          {u.role === "owner" ? (
            <span className="v2-muted">Password (own / shared)</span>
          ) : (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <Badge tone={u.hasPassword ? "success" : "neutral"} variant={u.hasPassword ? "soft" : "outline"}>
                {u.hasPassword ? "Password" : "Shared pwd"}
              </Badge>
              {u.hasPin && <Badge tone="info" variant="soft">PIN</Badge>}
              {(u.webauthnKeys?.length ?? 0) > 0 && (
                <Badge tone="brand" variant="soft">{`${u.webauthnKeys!.length} key${u.webauthnKeys!.length > 1 ? "s" : ""}`}</Badge>
              )}
            </div>
          )}
          {/* Where this account lands after sign-in, + MFA flag. */}
          <span className="v2-cell-sub">
            → {landingTag(u.role)}{u.totpEnabled ? " · MFA" : ""}
          </span>
        </div>
      ),
      sortValue: (u) => (u.hasPassword ? 1 : 0),
    },
    {
      key: "mfa",
      header: "MFA",
      cell: (u) =>
        u.totpEnabled ? (
          <Badge tone="success" variant="soft" dot>On</Badge>
        ) : (
          <Badge tone="neutral" variant="outline">Off</Badge>
        ),
      sortValue: (u) => (u.totpEnabled ? 1 : 0),
    },
    {
      key: "actions",
      header: "",
      cell: (u) => (
        <div className="v2-row-actions">
          {isOwner && u.role !== "owner" && (
            <Button size="sm" variant="ghost" leadingIcon={<Lock className="h-3.5 w-3.5" />} onClick={() => setCredUser(u)}>
              Login
            </Button>
          )}
          <Button size="sm" variant="ghost" leadingIcon={<KeyRound className="h-3.5 w-3.5" />} onClick={() => setMfaUser(u)}>
            MFA
          </Button>
          <Button size="sm" variant="ghost" leadingIcon={<Fingerprint className="h-3.5 w-3.5" />} onClick={() => setKeysUser(u)}>
            Keys
          </Button>
          <Button size="sm" variant="ghost" leadingIcon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setDialog({ open: true, user: u })}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPendingDelete(u)}>
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
          <h1 className="v2-page-title">Users & roles</h1>
          <p className="v2-page-subtitle">
            Per-user accounts, roles, granular permissions, and two-factor auth. Each non-owner account can either inherit its role&rsquo;s default permissions or carry a fully-custom, action-level grant. Permissions are enforced everywhere — the sidebar hides what a user can&rsquo;t reach and every admin API rejects calls they aren&rsquo;t granted. Owners always have full access.
          </p>
        </div>
        <Button variant="primary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setDialog({ open: true, user: null })}>
          New user
        </Button>
      </header>

      <div className="v2-filters">
        <div className="v2-filter-search">
          <Input
            placeholder="Search by name, email, or role…"
            leadingAdornment={<Search className="h-3.5 w-3.5" />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Tabs
          value={roleFilter}
          onChange={(v) => setRoleFilter(v as AdminRole | "all")}
          tabs={[
            { value: "all", label: "All", count: counts.all },
            { value: "owner", label: ROLE_LABEL.owner, count: counts.owner },
            { value: "manager", label: ROLE_LABEL.manager, count: counts.manager },
            { value: "staff", label: ROLE_LABEL.staff, count: counts.staff },
            { value: "kitchen", label: ROLE_LABEL.kitchen, count: counts.kitchen },
          ]}
          variant="pill"
          ariaLabel="Role filter"
        />
      </div>

      {loading ? (
        <div className="v2-page-loading">Loading Users & roles…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={UserCog}
              title={list.length === 0 ? "No users yet" : "No matches"}
              description={
                list.length === 0
                  ? "Add owners + managers + staff to define who can access what once per-user logins are wired."
                  : "Try clearing the filters."
              }
              action={
                list.length === 0 ? (
                  <Button variant="primary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setDialog({ open: true, user: null })}>
                    New user
                  </Button>
                ) : undefined
              }
            />
          </CardBody>
        </Card>
      ) : (
        <Card padding="none">
          <CardBody>
            <Table rows={filtered} columns={cols} rowKey={(u) => u.id} defaultSort={{ key: "role", dir: "asc" }} />
          </CardBody>
        </Card>
      )}

      <Card padding="compact">
        <div className="v2-note">
          <ShieldCheck className="h-4 w-4" />
          <span>
            <strong>Only an owner can manage users and grant permissions.</strong> Granular permissions are enforced end-to-end: the sidebar + a page guard hide forbidden surfaces, <span className="mono">withAdmin</span> rejects ungranted <span className="mono">/api/admin/*</span> calls, and high-value actions (refunds, cash, GDPR export, loyalty adjustments, purchase orders, settings) re-check the specific capability at the call site. A user with a custom grant is governed by their permissions (not role rank); accounts left on &ldquo;role default&rdquo; keep the legacy role-rank behaviour. Owners are always full-access.
          </span>
        </div>
      </Card>

      <UserDialog state={dialog} onClose={() => setDialog({ open: false, user: null })} onSaved={async () => {
        setDialog({ open: false, user: null });
        await fetchAll();
        toast.success("Saved");
      }} />

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={doDelete}
        title={`Remove ${pendingDelete?.name ?? "user"}?`}
        confirmLabel="Remove"
        destructive
      />

      <MfaDialog
        user={mfaUser}
        me={me}
        onClose={() => setMfaUser(null)}
        onChanged={fetchAll}
      />

      <CredentialsDialog
        user={credUser}
        onClose={() => setCredUser(null)}
        onChanged={fetchAll}
      />

      <PasskeyDialog
        user={keysUser}
        me={me}
        onClose={() => setKeysUser(null)}
        onChanged={fetchAll}
      />
    </div>
  );
}

function PasskeyDialog({
  user,
  me,
  onClose,
  onChanged,
}: {
  user: AdminUserRow | null;
  me: { id: string; role: AdminRole } | null;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName("");
    setBusy(false);
  }, [user]);

  if (!user) return <Dialog open={false} onClose={onClose} />;

  const isSelf = me?.id === user.id;
  const isOwner = me?.role === "owner";
  const keys = user.webauthnKeys ?? [];

  const enroll = async () => {
    setBusy(true);
    try {
      const begin = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/webauthn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register-begin" }),
      });
      const options = await begin.json().catch(() => null);
      if (!begin.ok) {
        toast.error("Could not start", options?.error || "");
        return;
      }
      const attestation = await startRegistration({ optionsJSON: options });
      const finish = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/webauthn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register-finish", response: attestation, name: name.trim() || undefined }),
      });
      const data = await finish.json().catch(() => null);
      if (finish.ok) {
        toast.success("Security key registered");
        await onChanged();
        setName("");
      } else {
        toast.error("Could not register", data?.error || "");
      }
    } catch (err) {
      toast.error("Enrollment failed", err instanceof Error && /abort|cancel/i.test(err.message) ? "Cancelled" : "");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (credentialId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/webauthn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", credentialId }),
      });
      if (res.ok) {
        toast.success("Key removed");
        await onChanged();
      } else {
        const data = await res.json().catch(() => null);
        toast.error("Could not remove", data?.error || "");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={`Passkeys & security keys — ${user.name}`}
      footer={<Button variant="ghost" onClick={onClose} disabled={busy}>Close</Button>}
    >
      <div className="v2-stack-12">
        <div className="v2-note">
          <Fingerprint className="h-4 w-4" />
          <span>
            Phishing-resistant sign-in with a hardware key (YubiKey) or device passkey (Touch ID, Windows Hello). At <span className="mono">/admin/login</span>, the holder enters their email and taps the key — no password needed.
          </span>
        </div>

        {keys.length === 0 ? (
          <p className="v2-muted">No keys registered yet.</p>
        ) : (
          <ul className="v2-mov-list">
            {keys.map((k) => (
              <li key={k.id} className="v2-mov-row">
                <span className="v2-mov-icon v2-mov-tone-success"><KeyRound className="h-3 w-3" /></span>
                <div className="v2-mov-text">
                  <div className="v2-mov-title"><span>{k.name || "Security key"}</span></div>
                  <div className="v2-mov-sub">Added {new Date(k.createdAt).toLocaleDateString()}</div>
                </div>
                {(isSelf || isOwner) && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => remove(k.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {isSelf ? (
          <>
            <Input
              label="Key name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. YubiKey 5C, MacBook Touch ID"
            />
            <Button variant="primary" onClick={enroll} loading={busy} leadingIcon={<Fingerprint className="h-3.5 w-3.5" />}>
              Register a key on this device
            </Button>
          </>
        ) : (
          <p className="v2-muted">
            A key can only be enrolled by its holder, signed in as this user. {isOwner ? "As an owner you can remove a lost key here." : ""}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function CredentialsDialog({
  user,
  onClose,
  onChanged,
}: {
  user: AdminUserRow | null;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPassword("");
    setPin("");
    setBusy(false);
  }, [user]);

  if (!user) return <Dialog open={false} onClose={onClose} />;

  const call = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        toast.success(ok);
        await onChanged();
        setPassword("");
        setPin("");
      } else {
        toast.error("Could not update", data?.error || "");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={`Login & credentials — ${user.name}`}
      footer={<Button variant="ghost" onClick={onClose} disabled={busy}>Close</Button>}
    >
      <div className="v2-stack-12">
        {/* Plain-language summary of exactly how this person gets in. */}
        {(() => {
          const d = describeLogin(user);
          return (
            <div className="v2-note">
              <Lock className="h-4 w-4" />
              <span>
                <strong>How {user.name} signs in</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {d.methods.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
                {d.mfa && <div style={{ marginTop: 4 }}>Every sign-in also requires a 6-digit MFA code.</div>}
                <div style={{ marginTop: 4 }}>
                  Lands on <strong>{d.landing}</strong>
                  {d.locations.length > 0
                    ? `, limited to ${d.locations.join(", ")}.`
                    : ", across all locations."}
                </div>
              </span>
            </div>
          );
        })()}

        <Input
          label="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          description="At least 8 characters."
        />
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="primary" disabled={busy || password.length < 8} onClick={() => call({ password }, "Password set")}>
            Set password
          </Button>
          {user.hasPassword && (
            <Button variant="ghost" disabled={busy} onClick={() => call({ password: null }, "Password cleared")}>
              Clear
            </Button>
          )}
        </div>

        <Input
          label="Terminal PIN"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 10))}
          description="4–10 digits, unique within the location."
        />
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="primary" disabled={busy || pin.length < 4} onClick={() => call({ pin }, "PIN set")}>
            Set PIN
          </Button>
          {user.hasPin && (
            <Button variant="ghost" disabled={busy} onClick={() => call({ pin: null }, "PIN cleared")}>
              Clear
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function MfaDialog({
  user,
  me,
  onClose,
  onChanged,
}: {
  user: AdminUser | null;
  me: { id: string; role: AdminRole } | null;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [enrollment, setEnrollment] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEnrollment(null);
    setCode("");
    setBusy(false);
  }, [user]);

  if (!user) return <Dialog open={false} onClose={onClose} />;

  const isSelf = me?.id === user.id;
  const isOwner = me?.role === "owner";

  const call = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/mfa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  };

  const begin = async () => {
    setBusy(true);
    try {
      const { ok, data } = await call({ action: "begin" });
      if (ok && data?.secret) setEnrollment({ secret: data.secret, uri: data.uri });
      else toast.error("Could not start", data?.error || "");
    } finally {
      setBusy(false);
    }
  };

  const enable = async () => {
    setBusy(true);
    try {
      const { ok, data } = await call({ action: "enable", token: code });
      if (ok) {
        toast.success("MFA enabled");
        await onChanged();
        onClose();
      } else {
        toast.error("Could not enable", data?.error || "");
      }
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      // Self-disable needs a current code; an owner can force-disable without one.
      const { ok, data } = await call({ action: "disable", token: code || undefined });
      if (ok) {
        toast.success("MFA disabled");
        await onChanged();
        onClose();
      } else {
        toast.error("Could not disable", data?.error || "");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={`Two-factor auth — ${user.name}`}
      footer={<Button variant="ghost" onClick={onClose} disabled={busy}>Close</Button>}
    >
      <div className="v2-stack-12">
        {user.totpEnabled ? (
          <>
            <div className="v2-note">
              <ShieldCheck className="h-4 w-4" />
              <span>MFA is <strong>enabled</strong> for this account. A 6-digit code is required at login.</span>
            </div>
            {isSelf && !isOwner && (
              <Input
                label="Current authenticator code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                description="Required to turn off your own MFA."
              />
            )}
            {(isSelf || isOwner) ? (
              <Button variant="primary" onClick={disable} loading={busy}>
                {isOwner && !isSelf ? "Force-disable (recovery)" : "Disable MFA"}
              </Button>
            ) : (
              <p className="v2-muted">Only the account holder or an owner can change this.</p>
            )}
          </>
        ) : !isSelf ? (
          <p className="v2-muted">
            MFA can only be set up by the account holder, signed in as this user. Owners can force-disable an existing MFA for recovery.
          </p>
        ) : !enrollment ? (
          <>
            <p className="v2-muted">
              Protect your login with a time-based code from an authenticator app
              (Google Authenticator, 1Password, Authy…).
            </p>
            <Button variant="primary" onClick={begin} loading={busy} leadingIcon={<KeyRound className="h-3.5 w-3.5" />}>
              Begin setup
            </Button>
          </>
        ) : (
          <>
            <p className="v2-muted">
              Add this secret to your authenticator app, then enter the current code to confirm.
            </p>
            <div className="v2-note">
              <span>
                Setup key: <span className="mono" style={{ wordBreak: "break-all" }}>{enrollment.secret}</span>
              </span>
            </div>
            <p className="v2-muted" style={{ fontSize: "0.75rem", wordBreak: "break-all" }}>
              otpauth URI: {enrollment.uri}
            </p>
            <Input
              label="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <Button variant="primary" onClick={enable} loading={busy} disabled={code.length !== 6}>
              Confirm & enable
            </Button>
          </>
        )}
      </div>
    </Dialog>
  );
}

function UserDialog({ state, onClose, onSaved }: { state: DialogState; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("manager");
  const [status, setStatus] = useState<AdminUserStatus>("active");
  // Multi-location scope. Empty set = all locations. A manager can run several.
  const [locSet, setLocSet] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  // Granular permissions: `customPerms` off = inherit the role's defaults;
  // on = `permSet` is the authoritative per-user grant.
  const [customPerms, setCustomPerms] = useState(false);
  const [permSet, setPermSet] = useState<Set<string>>(new Set());

  const roleDefaults = ROLE_DEFAULT_PERMISSIONS[role] ?? [];
  const isOwner = role === "owner";

  useEffect(() => {
    if (!state.open) return;
    const u = state.user;
    const r = u?.role ?? "manager";
    setName(u?.name ?? "");
    setEmail(u?.email ?? "");
    setRole(r);
    setStatus(u?.status ?? "active");
    setLocSet(new Set(u ? userLocationSlugs(u) : []));
    setNotes(u?.notes ?? "");
    const hasCustom = Array.isArray(u?.permissions);
    setCustomPerms(hasCustom);
    setPermSet(
      new Set(hasCustom ? u!.permissions! : ROLE_DEFAULT_PERMISSIONS[r] ?? []),
    );
    setBusy(false);
  }, [state]);

  if (!state.open) return <Dialog open={false} onClose={onClose} />;

  // Changing the role while "Customize" is off must re-seed the editor's
  // baseline to the NEW role's defaults — otherwise toggling Customize on later
  // would show the previously-selected role's defaults. Handled in the change
  // handler (not an effect) so we never clobber an existing custom grant: when
  // Customize is on, the operator's edits are preserved across a role change.
  const onRoleChange = (next: AdminRole) => {
    setRole(next);
    if (!customPerms) setPermSet(new Set(ROLE_DEFAULT_PERMISSIONS[next] ?? []));
  };

  const enableCustom = (on: boolean) => setCustomPerms(on);

  const togglePerm = (key: string) =>
    setPermSet((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const setGroup = (keys: readonly string[], on: boolean) =>
    setPermSet((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });

  const resetToRoleDefaults = () => setPermSet(new Set(roleDefaults));

  const submit = async () => {
    if (!name.trim()) {
      toast.warning("Name required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: state.user ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: state.user?.id,
          name: name.trim(),
          email: email.trim() || undefined,
          role,
          status,
          // Owners see every site, so we never scope them. Otherwise the chosen
          // set is canonical (empty = all); clear the legacy single field.
          locationSlug: undefined,
          locationSlugs: isOwner ? null : Array.from(locSet),
          notes: notes.trim() || undefined,
          // Owners are implicitly all-access, so we never persist a grant for
          // them. Otherwise: a custom grant is sent as an array; "role default"
          // is sent as null to clear any stored grant.
          permissions: isOwner || !customPerms ? null : Array.from(permSet),
        }),
      });
      if (res.ok) {
        onSaved();
      } else if (res.status === 403) {
        toast.error("Forbidden", "Only an owner can create or edit users and grant permissions.");
      } else {
        toast.error("Could not save");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={state.user ? `Edit ${state.user.name}` : "New user"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>{state.user ? "Save changes" : "Create user"}</Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="v2-form-row-2">
          <Select
            label="Role"
            value={role}
            onChange={(e) => onRoleChange(e.target.value as AdminRole)}
            options={[
              { value: "owner", label: ROLE_LABEL.owner },
              { value: "manager", label: ROLE_LABEL.manager },
              { value: "staff", label: ROLE_LABEL.staff },
              { value: "kitchen", label: ROLE_LABEL.kitchen },
            ]}
          />
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as AdminUserStatus)}
            options={[
              { value: "active", label: "Active" },
              { value: "disabled", label: "Disabled" },
            ]}
          />
        </div>
        <div>
          <label className="v2-field-label" style={{ display: "block", marginBottom: 6 }}>Scoped to locations</label>
          {isOwner ? (
            <p className="v2-muted" style={{ fontSize: "0.8rem" }}>
              Owners see every location — scope can&rsquo;t be narrowed.
            </p>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <Chip
                  selected={locSet.size === 0}
                  onClick={() => setLocSet(new Set())}
                >
                  All locations
                </Chip>
                {activeLocations.map((l) => (
                  <Chip
                    key={l.slug}
                    selected={locSet.has(l.slug)}
                    onClick={() =>
                      setLocSet((prev) => {
                        const next = new Set(prev);
                        if (next.has(l.slug)) next.delete(l.slug);
                        else next.add(l.slug);
                        return next;
                      })
                    }
                  >
                    {l.city}
                  </Chip>
                ))}
              </div>
              <p className="v2-muted" style={{ fontSize: "0.75rem", marginTop: 6 }}>
                {locSet.size === 0
                  ? "Unrestricted — this account sees every location."
                  : `Scoped to ${locSet.size} location${locSet.size > 1 ? "s" : ""}. The session and every admin API are restricted to ${locSet.size > 1 ? "these sites" : "this site"}.`}
              </p>
            </>
          )}
        </div>
        <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />

        <PermissionEditor
          isOwner={isOwner}
          role={role}
          roleDefaultsCount={roleDefaults.length}
          customPerms={customPerms}
          onToggleCustom={enableCustom}
          permSet={permSet}
          onTogglePerm={togglePerm}
          onSetGroup={setGroup}
          onReset={resetToRoleDefaults}
        />
      </div>
    </Dialog>
  );
}

function PermissionEditor({
  isOwner,
  role,
  roleDefaultsCount,
  customPerms,
  onToggleCustom,
  permSet,
  onTogglePerm,
  onSetGroup,
  onReset,
}: {
  isOwner: boolean;
  role: AdminRole;
  roleDefaultsCount: number;
  customPerms: boolean;
  onToggleCustom: (on: boolean) => void;
  permSet: Set<string>;
  onTogglePerm: (key: string) => void;
  onSetGroup: (keys: readonly string[], on: boolean) => void;
  onReset: () => void;
}) {
  const grantedCount = permSet.size;

  return (
    <div className="v2-stack-12" style={{ borderTop: "1px solid var(--v2-border, rgba(255,255,255,0.08))", paddingTop: 12 }}>
      <div className="v2-perm-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600 }}>Permissions</div>
          <div className="v2-muted" style={{ fontSize: "0.8rem" }}>
            {isOwner
              ? "Owners have unrestricted access to every surface — permissions can’t be narrowed."
              : customPerms
                ? `Custom grant — ${grantedCount} of ${ALL_PERMISSION_KEYS.length} capabilities enabled.`
                : `Inheriting ${ROLE_LABEL[role]} defaults — ${roleDefaultsCount} capabilities.`}
          </div>
        </div>
        {!isOwner && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="v2-muted" style={{ fontSize: "0.8rem" }}>Customize</span>
            <Switch checked={customPerms} onChange={onToggleCustom} label="Customize permissions" />
          </div>
        )}
      </div>

      {!isOwner && customPerms && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button size="sm" variant="ghost" leadingIcon={<RotateCcw className="h-3.5 w-3.5" />} onClick={onReset}>
              Reset to {ROLE_LABEL[role]} defaults
            </Button>
          </div>
          <div className="v2-perm-groups" style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 360, overflowY: "auto", paddingRight: 4 }}>
            {PERMISSION_GROUPS.map((group) => {
              const keys = group.permissions.map((p) => p.key);
              const onCount = keys.filter((k) => permSet.has(k)).length;
              const allOn = onCount === keys.length;
              return (
                <div key={group.id} className="v2-perm-group" style={{ border: "1px solid var(--v2-border, rgba(255,255,255,0.08))", borderRadius: 10, padding: "8px 12px" }}>
                  <div className="v2-perm-group-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>{group.label}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="v2-muted" style={{ fontSize: "0.72rem" }}>{onCount}/{keys.length}</span>
                      <Button size="sm" variant="ghost" onClick={() => onSetGroup(keys, !allOn)}>
                        {allOn ? "None" : "All"}
                      </Button>
                    </div>
                  </div>
                  <div className="v2-perm-rows">
                    {group.permissions.map((perm) => (
                      <label key={perm.key} className="v2-perm-row" style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 0", cursor: "pointer" }}>
                        <Switch
                          checked={permSet.has(perm.key)}
                          onChange={() => onTogglePerm(perm.key)}
                          label={perm.label}
                        />
                        <span style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontSize: "0.82rem" }}>{perm.label}</span>
                          <span className="v2-muted" style={{ fontSize: "0.72rem" }}>{perm.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
