"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, ShieldCheck, Trash2, UserCog } from "lucide-react";
import type { AdminRole, AdminUser, AdminUserStatus } from "@/data/types";
import { getActiveLocations } from "@/data/locations";
import { useToast } from "./v2/ui/Toast";
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
  const toast = useToast();
  const [list, setList] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<AdminRole | "all">("all");
  const [dialog, setDialog] = useState<DialogState>({ open: false, user: null });
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null);

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
      key: "actions",
      header: "",
      cell: (u) => (
        <div className="v2-row-actions">
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
            Plan per-user accounts and role mappings. Today the dashboard uses a single shared admin password — these users are the staging ground for future per-user authentication. Sensitive write APIs already gate on owner / manager via the new role helpers.
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
        <div className="v2-page-loading">Loading users…</div>
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
        <div className="v2-inline">
          <ShieldCheck className="h-4 w-4 v2-muted" />
          <span className="v2-muted">
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
    </div>
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
