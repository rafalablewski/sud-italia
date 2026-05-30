"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Pencil, Plus, Search, ShieldCheck, Trash2, UserCog } from "lucide-react";
import type { AdminRole, AdminUser, AdminUserStatus } from "@/data/types";
import { getActiveLocations } from "@/data/locations";
import dynamic from "next/dynamic";
import { useIsMobile } from "./v2/mobile";
import { useToast } from "./v2/ui/Toast";

const MobileUsers = dynamic(
  () => import("./mobile/MobileUsers").then((m) => m.MobileUsers),
  { ssr: false },
);
import {
  Badge,
  Button,
  Card,
  CardBody,
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

const ROLE_LABEL: Record<AdminRole, string> = {
  owner: "Owner",
  manager: "Manager",
  franchisee: "Franchisee",
  staff: "Staff",
  kitchen: "Kitchen",
};

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
  const { isMobile, ready } = useIsMobile();
  if (ready && isMobile) {
    return <MobileUsers />;
  }
  return <AdminUsersDesktop />;
}

function AdminUsersDesktop() {
  const toast = useToast();
  const [list, setList] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<AdminRole | "all">("all");
  const [dialog, setDialog] = useState<DialogState>({ open: false, user: null });
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null);
  const [mfaUser, setMfaUser] = useState<AdminUser | null>(null);
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
      toast.error("Forbidden", "Only owner / manager can remove users.");
    }
    setPendingDelete(null);
  };

  const counts = useMemo(() => {
    const c: Record<AdminRole | "all", number> = { all: list.length, owner: 0, manager: 0, franchisee: 0, staff: 0, kitchen: 0 };
    for (const u of list) c[u.role]++;
    return c;
  }, [list]);

  const cols: Column<AdminUser>[] = [
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
      key: "loc",
      header: "Location",
      cell: (u) =>
        u.locationSlug ? (
          <Badge tone="neutral" variant="outline">{u.locationSlug}</Badge>
        ) : (
          <span className="v2-muted">All</span>
        ),
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
          <Button size="sm" variant="ghost" leadingIcon={<KeyRound className="h-3.5 w-3.5" />} onClick={() => setMfaUser(u)}>
            MFA
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
            Per-user accounts, role mappings, and two-factor auth. Users with an email log in with the shared password + their own role/location scope; enable MFA per account for a required 6-digit code. Admin APIs gate on owner / manager via the role helpers.
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
            Role gate active on <span className="mono">/api/admin/users</span> writes (owner / manager). Other endpoints will adopt the same gate as per-user sessions land.
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
    </div>
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
  const [locationSlug, setLocationSlug] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    const u = state.user;
    setName(u?.name ?? "");
    setEmail(u?.email ?? "");
    setRole(u?.role ?? "manager");
    setStatus(u?.status ?? "active");
    setLocationSlug(u?.locationSlug ?? "");
    setNotes(u?.notes ?? "");
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
      const res = await fetch("/api/admin/users", {
        method: state.user ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: state.user?.id,
          name: name.trim(),
          email: email.trim() || undefined,
          role,
          status,
          locationSlug: locationSlug || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (res.ok) {
        onSaved();
      } else if (res.status === 403) {
        toast.error("Forbidden", "Only owner / manager can edit users.");
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
      size="md"
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
            onChange={(e) => setRole(e.target.value as AdminRole)}
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
        <Select
          label="Scoped to location"
          value={locationSlug}
          onChange={(e) => setLocationSlug(e.target.value)}
          options={[{ value: "", label: "All locations" }, ...activeLocations.map((l) => ({ value: l.slug, label: l.city }))]}
          description="Future per-user filter: when set, the user only sees data for this location."
        />
        <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Dialog>
  );
}
