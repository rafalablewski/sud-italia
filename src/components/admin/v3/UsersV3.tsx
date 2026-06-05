"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, KeyRound, Lock, Plus, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import type { AdminRole } from "@/lib/admin-roles";
import { Badge, Button, Dialog, Kpi, Table, type BadgeTone, type ColumnV3 } from "./ui";

interface WebauthnKey { id: string; name?: string; createdAt: string }
interface UserRow {
  id: string; name: string; email?: string; role: AdminRole; status?: string; locationSlug?: string; notes?: string;
  totpEnabled?: boolean; webauthnKeys?: WebauthnKey[]; hasPassword?: boolean; hasPin?: boolean;
}
interface Me { id: string; role: AdminRole }

const ROLES: AdminRole[] = ["owner", "manager", "franchisee", "staff", "kitchen"];
const ROLE_LABEL: Record<AdminRole, string> = { owner: "Owner", manager: "Manager", franchisee: "Franchisee", staff: "Staff", kitchen: "Kitchen" };
const ROLE_TONE: Record<AdminRole, BadgeTone> = { owner: "brand", manager: "info", franchisee: "info", staff: "neutral", kitchen: "warn" };

type SecFilter = "all" | "secured" | "no2fa" | "passkey";
const SEC_FILTERS: { id: SecFilter; label: string }[] = [
  { id: "all", label: "All" }, { id: "secured", label: "Secured" }, { id: "no2fa", label: "No 2FA" }, { id: "passkey", label: "Has passkey" },
];

const has2fa = (u: UserRow) => !!u.totpEnabled || (u.webauthnKeys?.length ?? 0) > 0;
function posture(u: UserRow): { label: string; tone: BadgeTone } {
  return has2fa(u) ? { label: "Secured", tone: "ok" } : { label: "No 2FA", tone: "warn" };
}

export function UsersV3() {
  const all = useMemo(() => getActiveLocations(), []);
  const [list, setList] = useState<UserRow[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | AdminRole>("all");
  const [secFilter, setSecFilter] = useState<SecFilter>("all");
  const [edit, setEdit] = useState<UserRow | "new" | null>(null);
  const [sec, setSec] = useState<{ kind: "cred" | "mfa" | "passkey"; user: UserRow } | null>(null);

  const load = useCallback(async () => {
    const [res, m] = await Promise.all([
      fetch("/api/admin/users").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/admin/me").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    setList(Array.isArray(res) ? res : []);
    if (m?.id) setMe({ id: m.id, role: m.role });
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (id: string) => { const r = await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`, { method: "DELETE" }); if (r.ok) await load(); };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: list.length };
    for (const u of list) c[u.role] = (c[u.role] ?? 0) + 1;
    return c;
  }, [list]);
  const securedCount = list.filter(has2fa).length;
  const passkeyUsers = list.filter((u) => (u.webauthnKeys?.length ?? 0) > 0).length;

  const rows = useMemo(() => list.filter((u) => {
    if (filter !== "all" && u.role !== filter) return false;
    if (secFilter === "secured" && !has2fa(u)) return false;
    if (secFilter === "no2fa" && has2fa(u)) return false;
    if (secFilter === "passkey" && (u.webauthnKeys?.length ?? 0) === 0) return false;
    return true;
  }), [list, filter, secFilter]);
  const chips: ("all" | AdminRole)[] = ["all", ...ROLES];

  const cols: ColumnV3<UserRow>[] = [
    { key: "name", header: "Name", render: (u) => <span style={{ fontWeight: 600 }}>{u.name}</span> },
    { key: "email", header: "Email", render: (u) => <span className="av3-cell-muted">{u.email || "—"}</span> },
    { key: "role", header: "Role", render: (u) => <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge> },
    { key: "loc", header: "Site", render: (u) => <span className="av3-cell-muted">{u.locationSlug ? all.find((l) => l.slug === u.locationSlug)?.city ?? u.locationSlug : "All"}</span> },
    {
      key: "signin", header: "Sign-in", render: (u) => {
        const p = posture(u); const keys = u.webauthnKeys?.length ?? 0;
        return (
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <Badge tone={p.tone} dot>{p.label}</Badge>
            {keys > 0 && <Badge tone="brand"><Fingerprint style={{ width: 11, height: 11 }} /> {keys}</Badge>}
            {u.totpEnabled && <Badge tone="info"><KeyRound style={{ width: 11, height: 11 }} /> MFA</Badge>}
          </span>
        );
      },
    },
    { key: "st", header: "Status", render: (u) => <Badge tone={u.status === "inactive" ? "neutral" : "ok"} dot>{u.status === "inactive" ? "Inactive" : "Active"}</Badge> },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Users &amp; roles</h1>
          <div className="av3-pagehead-sub">Team accounts · role-based access · auth posture</div>
        </div>
        <div className="av3-pagehead-actions">
          <Button variant="primary" size="sm" onClick={() => setEdit("new")}><Plus className="av3-btn-ico" /> Add user</Button>
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="Users" icon={ShieldCheck} value={`${list.length}`} accentVar="--av3-c3" />
        <Kpi label="Secured (2FA)" icon={ShieldCheck} value={`${securedCount}/${list.length}`} accentVar="--av3-c4" />
        <Kpi label="No 2FA" icon={ShieldCheck} value={`${list.length - securedCount}`} accentVar="--av3-c1" invertDelta />
        <Kpi label="With passkeys" icon={Fingerprint} value={`${passkeyUsers}`} accentVar="--av3-c2" />
      </div>

      <div className="av3-toolbar">
        <div className="av3-filterchips">
          {chips.map((f) => (
            <button key={f} type="button" className={`av3-fchip ${filter === f ? "is-active" : ""}`} onClick={() => setFilter(f)}>
              {f === "all" ? "All roles" : ROLE_LABEL[f]}<span className="av3-fchip-count">{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>
        <span className="av3-toolbar-spacer" />
        <div className="av3-filterchips">
          {SEC_FILTERS.map((f) => (
            <button key={f.id} type="button" className={`av3-fchip ${secFilter === f.id ? "is-active" : ""}`} onClick={() => setSecFilter(f.id)}>{f.label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading users…</div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No users</div><div className="av3-empty-text">{filter === "all" && secFilter === "all" ? "Add a team member to grant them access." : "No users match the filters."}</div></div>
          ) : (
            <Table columns={cols} rows={rows} rowKey={(u) => u.id} onRowClick={(u) => setEdit(u)} />
          )}
        </div>
      )}

      {edit && (
        <UserDialog
          user={edit === "new" ? null : edit}
          locations={all}
          onClose={() => setEdit(null)}
          onSaved={async () => { await load(); setEdit(null); }}
          onDelete={edit !== "new" ? async () => { await remove((edit as UserRow).id); setEdit(null); } : undefined}
          onSecurity={edit !== "new" ? (kind) => setSec({ kind, user: edit as UserRow }) : undefined}
        />
      )}
      {sec?.kind === "cred" && <CredentialsDialogV3 user={sec.user} onClose={() => setSec(null)} onChanged={load} />}
      {sec?.kind === "mfa" && <MfaDialogV3 user={sec.user} me={me} onClose={() => setSec(null)} onChanged={load} />}
      {sec?.kind === "passkey" && <PasskeyDialogV3 user={sec.user} me={me} onClose={() => setSec(null)} onChanged={load} />}
    </>
  );
}

function UserDialog({ user, locations, onClose, onSaved, onDelete, onSecurity }: {
  user: UserRow | null;
  locations: ReturnType<typeof getActiveLocations>;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDelete?: () => Promise<void>;
  onSecurity?: (kind: "cred" | "mfa" | "passkey") => void;
}) {
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
    <Dialog open onClose={onClose} title={user ? user.name : "New user"} headerExtra={<Badge tone={ROLE_TONE[role]}>{ROLE_LABEL[role]}</Badge>} width={540}
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
      <label className="av3-field" style={{ marginBottom: onSecurity ? 14 : 0 }}><span className="av3-field-label">Notes</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>

      {onSecurity && (
        <>
          <div className="av3-subhead">Security &amp; sign-in</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="secondary" size="sm" onClick={() => onSecurity("cred")}><Lock className="av3-btn-ico" /> Password &amp; PIN</Button>
            <Button variant="secondary" size="sm" onClick={() => onSecurity("mfa")}><KeyRound className="av3-btn-ico" /> Two-factor (MFA)</Button>
            <Button variant="secondary" size="sm" onClick={() => onSecurity("passkey")}><Fingerprint className="av3-btn-ico" /> Passkeys &amp; keys</Button>
          </div>
          <div className="av3-cell-muted" style={{ fontSize: 11.5, marginTop: 8 }}>Granular permissions for this account are managed on the <strong>Permission matrix</strong> page.</div>
        </>
      )}
    </Dialog>
  );
}

function Msg({ msg }: { msg: { tone: "ok" | "bad"; text: string } | null }) {
  if (!msg) return null;
  return <div style={{ fontSize: 12, marginTop: 4, color: msg.tone === "ok" ? "var(--av3-ok)" : "var(--av3-bad)" }}>{msg.text}</div>;
}

function CredentialsDialogV3({ user, onClose, onChanged }: { user: UserRow; onClose: () => void; onChanged: () => Promise<void> | void }) {
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const call = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/credentials`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (res.ok) { setMsg({ tone: "ok", text: ok }); setPassword(""); setPin(""); await onChanged(); }
      else setMsg({ tone: "bad", text: data?.error || "Could not update" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} title={`Login & credentials — ${user.name}`} width={460}
      footer={<Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Close</Button>}>
      <label className="av3-field" style={{ marginBottom: 6 }}><span className="av3-field-label">New password</span><input className="av3-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <Button variant="primary" size="sm" loading={busy} disabled={password.length < 8} onClick={() => call({ password }, "Password set")}>Set password</Button>
        {user.hasPassword && <Button variant="ghost" size="sm" disabled={busy} onClick={() => call({ password: null }, "Password cleared")}>Clear</Button>}
      </div>
      <label className="av3-field" style={{ marginBottom: 6 }}><span className="av3-field-label">Terminal PIN</span><input className="av3-input" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="4–10 digits" /></label>
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="primary" size="sm" loading={busy} disabled={pin.length < 4} onClick={() => call({ pin }, "PIN set")}>Set PIN</Button>
        {user.hasPin && <Button variant="ghost" size="sm" disabled={busy} onClick={() => call({ pin: null }, "PIN cleared")}>Clear</Button>}
      </div>
      <Msg msg={msg} />
    </Dialog>
  );
}

function MfaDialogV3({ user, me, onClose, onChanged }: { user: UserRow; me: Me | null; onClose: () => void; onChanged: () => Promise<void> | void }) {
  const [enrollment, setEnrollment] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const isSelf = me?.id === user.id;
  const isOwner = me?.role === "owner";

  const call = (body: Record<string, unknown>) => fetch(`/api/admin/users/${encodeURIComponent(user.id)}/mfa`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => null) }));

  const begin = async () => { setBusy(true); setMsg(null); try { const { ok, data } = await call({ action: "begin" }); if (ok && data?.secret) setEnrollment({ secret: data.secret, uri: data.uri }); else setMsg({ tone: "bad", text: data?.error || "Could not start" }); } finally { setBusy(false); } };
  const enable = async () => { setBusy(true); setMsg(null); try { const { ok, data } = await call({ action: "enable", token: code }); if (ok) { await onChanged(); onClose(); } else setMsg({ tone: "bad", text: data?.error || "Invalid code" }); } finally { setBusy(false); } };
  const disable = async () => { setBusy(true); setMsg(null); try { const { ok, data } = await call({ action: "disable", token: code || undefined }); if (ok) { await onChanged(); onClose(); } else setMsg({ tone: "bad", text: data?.error || "Could not disable" }); } finally { setBusy(false); } };

  return (
    <Dialog open onClose={onClose} title={`Two-factor (MFA) — ${user.name}`} width={460}
      footer={<Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Close</Button>}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Badge tone={user.totpEnabled ? "ok" : "neutral"} dot>MFA {user.totpEnabled ? "on" : "off"}</Badge>
        <span className="av3-cell-muted" style={{ fontSize: 12 }}>A 6-digit authenticator code required at every sign-in.</span>
      </div>

      {user.totpEnabled ? (
        isSelf || isOwner ? (
          <>
            {isSelf && <label className="av3-field" style={{ marginBottom: 8 }}><span className="av3-field-label">Current 6-digit code (to confirm)</span><input className="av3-input" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" /></label>}
            <Button variant="danger" size="sm" loading={busy} disabled={busy || (isSelf && code.length !== 6)} onClick={disable}>{isOwner && !isSelf ? "Force-disable MFA" : "Disable MFA"}</Button>
          </>
        ) : <div className="av3-cell-muted" style={{ fontSize: 12 }}>Only the holder or an owner can change this.</div>
      ) : isSelf ? (
        !enrollment ? (
          <Button variant="primary" size="sm" loading={busy} onClick={begin}><KeyRound className="av3-btn-ico" /> Start setup</Button>
        ) : (
          <>
            <div className="av3-cell-muted" style={{ fontSize: 12, marginBottom: 6 }}>Add this secret to your authenticator app (Google Authenticator, 1Password), then enter the 6-digit code to confirm.</div>
            <div style={{ fontFamily: "var(--av3-mono)", fontSize: 13, background: "var(--av3-s2)", border: "1px solid var(--av3-line)", borderRadius: "var(--av3-r-sm)", padding: "8px 10px", marginBottom: 10, wordBreak: "break-all" }}>{enrollment.secret}</div>
            <label className="av3-field" style={{ marginBottom: 8 }}><span className="av3-field-label">6-digit code</span><input className="av3-input" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" /></label>
            <Button variant="primary" size="sm" loading={busy} disabled={code.length !== 6} onClick={enable}>Enable MFA</Button>
          </>
        )
      ) : <div className="av3-cell-muted" style={{ fontSize: 12 }}>MFA can only be enrolled by its holder, signed in as this user.</div>}
      <Msg msg={msg} />
    </Dialog>
  );
}

function PasskeyDialogV3({ user, me, onClose, onChanged }: { user: UserRow; me: Me | null; onClose: () => void; onChanged: () => Promise<void> | void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const isSelf = me?.id === user.id;
  const isOwner = me?.role === "owner";
  const keys = user.webauthnKeys ?? [];

  const enroll = async () => {
    setBusy(true); setMsg(null);
    try {
      const begin = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/webauthn`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "register-begin" }) });
      const options = await begin.json().catch(() => null);
      if (!begin.ok) { setMsg({ tone: "bad", text: options?.error || "Could not start" }); return; }
      const attestation = await startRegistration({ optionsJSON: options });
      const finish = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/webauthn`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "register-finish", response: attestation, name: name.trim() || undefined }) });
      const data = await finish.json().catch(() => null);
      if (finish.ok) { setMsg({ tone: "ok", text: "Security key registered" }); setName(""); await onChanged(); }
      else setMsg({ tone: "bad", text: data?.error || "Could not register" });
    } catch (err) {
      setMsg({ tone: "bad", text: err instanceof Error && /abort|cancel/i.test(err.message) ? "Cancelled" : "Enrollment failed" });
    } finally { setBusy(false); }
  };

  const remove = async (credentialId: string) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/webauthn`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", credentialId }) });
      if (res.ok) { setMsg({ tone: "ok", text: "Key removed" }); await onChanged(); }
      else { const data = await res.json().catch(() => null); setMsg({ tone: "bad", text: data?.error || "Could not remove" }); }
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} title={`Passkeys & security keys — ${user.name}`} width={460}
      footer={<Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Close</Button>}>
      <div className="av3-cell-muted" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
        Phishing-resistant sign-in with a hardware key (YubiKey) or device passkey (Touch ID, Windows Hello) — the holder enters their email and taps the key, no password needed.
      </div>
      {keys.length === 0 ? (
        <div className="av3-cell-muted" style={{ fontSize: 12.5, marginBottom: 12 }}>No keys registered yet.</div>
      ) : (
        <div style={{ marginBottom: 12 }}>
          {keys.map((k) => (
            <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--av3-line)" }}>
              <KeyRound style={{ width: 14, height: 14, color: "var(--av3-ok)" }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>{k.name || "Security key"}</div>
                <div className="av3-cell-muted" style={{ fontSize: 11 }}>Added {new Date(k.createdAt).toLocaleDateString("pl-PL")}</div>
              </div>
              {(isSelf || isOwner) && <button type="button" className="av3-iconbtn-sm" aria-label="Remove key" disabled={busy} onClick={() => remove(k.id)}><Trash2 /></button>}
            </div>
          ))}
        </div>
      )}
      {isSelf ? (
        <>
          <label className="av3-field" style={{ marginBottom: 8 }}><span className="av3-field-label">Key name (optional)</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. YubiKey 5C, MacBook Touch ID" /></label>
          <Button variant="primary" size="sm" loading={busy} onClick={enroll}><Fingerprint className="av3-btn-ico" /> Register a key on this device</Button>
        </>
      ) : (
        <div className="av3-cell-muted" style={{ fontSize: 12 }}>A key can only be enrolled by its holder, signed in as this user.{isOwner ? " As an owner you can remove a lost key here." : ""}</div>
      )}
      <Msg msg={msg} />
    </Dialog>
  );
}
