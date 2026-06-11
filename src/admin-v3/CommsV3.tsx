"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Megaphone, ListTodo, Plus, Trash2, Pin, Pencil, Repeat } from "lucide-react";
import { Card, CardHead, CardBody, Button, Badge, Switch, type BadgeTone } from "./ui";
import { useAdminLocationV3 } from "./LocationContext";
import {
  TASK_PRIORITIES,
  announcementAudienceLabel,
  routineAudienceLabel,
  type Task,
  type TaskPriority,
  type Announcement,
  type RoutineTemplate,
} from "@/lib/comms";
import type { AdminRole } from "@/lib/admin-roles";

interface DirUser {
  id: string;
  name: string;
  role: AdminRole;
  status?: string;
  locationSlug?: string;
  locationSlugs?: string[];
}

const PRIORITY_TONE: Record<TaskPriority, BadgeTone> = { high: "bad", normal: "info", low: "neutral" };
const TARGETABLE_ROLES: AdminRole[] = ["manager", "franchisee", "staff", "kitchen"];
const ROLE_LABEL: Record<AdminRole, string> = {
  owner: "Owner",
  manager: "Manager",
  franchisee: "Franchisee",
  staff: "Staff",
  kitchen: "Kitchen",
};

function fmtDate(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "short" }) : "—";
}

/**
 * The internal-comms management board, split into two standalone surfaces — the
 * `view` prop fixes which one renders (its own nav entry + route:
 * `/admin/comms/tasks` and `/admin/comms/announcements`). Tasks and
 * announcements are deliberately separate pages, not tabs of one screen.
 */
export function CommsV3({ view }: { view: "tasks" | "announcements" }) {
  const { activeLocations } = useAdminLocationV3();
  const [canManage, setCanManage] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [routines, setRoutines] = useState<RoutineTemplate[]>([]);
  const [anns, setAnns] = useState<Announcement[]>([]);
  const [users, setUsers] = useState<DirUser[]>([]);
  const [busy, setBusy] = useState(false);

  // New-task form.
  const [tTitle, setTTitle] = useState("");
  const [tDetail, setTDetail] = useState("");
  const [tAssignee, setTAssignee] = useState("");
  const [tLocation, setTLocation] = useState("");
  const [tPriority, setTPriority] = useState<TaskPriority>("normal");
  const [tDue, setTDue] = useState("");

  // New team-routine form (the recurring daily-ops checklist).
  const [rTitle, setRTitle] = useState("");
  const [rDetail, setRDetail] = useState("");
  const [rPriority, setRPriority] = useState<TaskPriority>("normal");
  const [rRoles, setRRoles] = useState<AdminRole[]>([]);
  const [rLocs, setRLocs] = useState<string[]>([]);

  // New / edit-announcement form. `aEditId` is null for a fresh post, or the
  // id of the announcement being edited (the POST upserts on id).
  const [aEditId, setAEditId] = useState<string | null>(null);
  const [aTitle, setATitle] = useState("");
  const [aBody, setABody] = useState("");
  const [aRoles, setARoles] = useState<AdminRole[]>([]);
  const [aLocs, setALocs] = useState<string[]>([]);
  const [aUsers, setAUsers] = useState<string[]>([]);
  const [aPinned, setAPinned] = useState(false);

  const load = useCallback(async () => {
    const [me, t, rt, a, u] = await Promise.all([
      fetch("/api/admin/me").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/admin/tasks").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/admin/routines").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/admin/announcements").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      // Owner gets the per-person picker; a comms-granted manager without
      // users.view degrades gracefully to role-group targeting (empty list).
      fetch("/api/admin/users").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    setCanManage(!!me && (me.allAccess || (Array.isArray(me.permissions) && me.permissions.includes("comms.manage"))));
    setTasks(Array.isArray(t) ? t : []);
    setRoutines(Array.isArray(rt) ? rt : []);
    setAnns(Array.isArray(a) ? a : []);
    setUsers(Array.isArray(u) ? u : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const assigneeOptions = useMemo(() => {
    const groups = TARGETABLE_ROLES.map((r) => ({ value: `role:${r}`, label: `All ${ROLE_LABEL[r].toLowerCase()}s` }));
    const people = users
      .filter((u) => u.status !== "disabled")
      .map((u) => ({ value: `user:${u.id}`, label: `${u.name} — ${ROLE_LABEL[u.role] ?? u.role}` }));
    return { groups, people };
  }, [users]);

  const createTask = async () => {
    if (!tTitle.trim() || !tAssignee) return;
    setBusy(true);
    const base = { title: tTitle.trim(), detail: tDetail.trim() || undefined, priority: tPriority, dueDate: tDue || undefined };
    const body = tAssignee.startsWith("role:")
      ? { ...base, assigneeRoles: [tAssignee.slice(5)], locationSlugs: tLocation ? [tLocation] : undefined }
      : { ...base, assigneeIds: [tAssignee.slice(5)], locationSlug: tLocation || undefined };
    try {
      const res = await fetch("/api/admin/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setTTitle(""); setTDetail(""); setTAssignee(""); setTLocation(""); setTPriority("normal"); setTDue("");
        await load();
      } else {
        const e = await res.json().catch(() => null);
        alert(e?.error ?? "Could not create task.");
      }
    } finally {
      setBusy(false);
    }
  };

  const deleteTask = async (id: string) => {
    setTasks((arr) => arr.filter((t) => t.id !== id));
    await fetch(`/api/admin/tasks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  };

  const createRoutine = async () => {
    if (!rTitle.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: rTitle.trim(),
          detail: rDetail.trim() || undefined,
          priority: rPriority,
          assigneeRoles: rRoles.length ? rRoles : undefined,
          locationSlugs: rLocs.length ? rLocs : undefined,
        }),
      });
      if (res.ok) {
        setRTitle(""); setRDetail(""); setRPriority("normal"); setRRoles([]); setRLocs([]);
        await load();
      } else {
        const e = await res.json().catch(() => null);
        alert(e?.error ?? "Could not create routine.");
      }
    } finally {
      setBusy(false);
    }
  };

  // Pause / resume a routine without deleting it (drops off / returns to every
  // matching teammate's daily list). Persists immediately — toggle = saved.
  const toggleRoutineActive = async (t: RoutineTemplate, active: boolean) => {
    setRoutines((arr) => arr.map((x) => (x.id === t.id ? { ...x, active } : x)));
    await fetch("/api/admin/routines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: t.id, title: t.title, detail: t.detail, priority: t.priority,
        assigneeRoles: t.assigneeRoles, locationSlugs: t.locationSlugs, active,
      }),
    });
  };

  const deleteRoutine = async (id: string) => {
    setRoutines((arr) => arr.filter((t) => t.id !== id));
    await fetch(`/api/admin/routines?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  };

  const toggleRRole = (r: AdminRole) =>
    setRRoles((s) => (s.includes(r) ? s.filter((x) => x !== r) : [...s, r]));
  const toggleRLoc = (slug: string) =>
    setRLocs((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]));

  const resetAnnForm = () => {
    setAEditId(null); setATitle(""); setABody("");
    setARoles([]); setALocs([]); setAUsers([]); setAPinned(false);
  };

  const submitAnnouncement = async () => {
    if (!aTitle.trim() || !aBody.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // `id` present ⇒ the store upserts (edit); absent ⇒ a fresh post.
          id: aEditId ?? undefined,
          title: aTitle.trim(),
          body: aBody.trim(),
          targetRoles: aRoles.length ? aRoles : undefined,
          targetLocationSlugs: aLocs.length ? aLocs : undefined,
          targetUserIds: aUsers.length ? aUsers : undefined,
          pinned: aPinned || undefined,
        }),
      });
      if (res.ok) {
        resetAnnForm();
        await load();
      } else {
        const e = await res.json().catch(() => null);
        alert(e?.error ?? "Could not save announcement.");
      }
    } finally {
      setBusy(false);
    }
  };

  const editAnnouncement = (a: Announcement) => {
    setAEditId(a.id);
    setATitle(a.title);
    setABody(a.body);
    setARoles(a.targetRoles ?? []);
    setALocs(a.targetLocationSlugs ?? []);
    setAUsers(a.targetUserIds ?? []);
    setAPinned(!!a.pinned);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteAnnouncement = async (id: string) => {
    if (aEditId === id) resetAnnForm();
    setAnns((arr) => arr.filter((a) => a.id !== id));
    await fetch(`/api/admin/announcements?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  };

  const toggleRole = (r: AdminRole) =>
    setARoles((s) => (s.includes(r) ? s.filter((x) => x !== r) : [...s, r]));
  const toggleLoc = (slug: string) =>
    setALocs((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]));
  const toggleUser = (id: string) =>
    setAUsers((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const targetableUsers = users.filter((u) => u.status !== "disabled");

  const openTasks = tasks.filter((t) => t.status === "open").length;
  const unreadAnns = anns.filter((a) => a.readBy.length === 0).length;

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>{view === "tasks" ? "Tasks" : "Announcements"}</h1>
          <div className="av3-pagehead-sub">
            {view === "tasks"
              ? <>Assign to-dos to your team · {openTasks} open task{openTasks === 1 ? "" : "s"}</>
              : <>Broadcast announcements to your team · {anns.length} announcement{anns.length === 1 ? "" : "s"}</>}
          </div>
        </div>
      </div>

      {view === "tasks" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--av3-gap-4)" }}>
          {canManage && (
            <Card>
              <CardHead title={<><ListTodo style={{ width: 14, height: 14, verticalAlign: "-2px", marginRight: 6 }} />New task</>} />
              <CardBody>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div className="av3-field">
                    <label className="av3-field-label">Task</label>
                    <input className="av3-input" value={tTitle} onChange={(e) => setTTitle(e.target.value)} placeholder="e.g. Recount walk-in freezer before close" maxLength={200} />
                  </div>
                  <div className="av3-field">
                    <label className="av3-field-label">Detail (optional)</label>
                    <textarea className="av3-input" value={tDetail} onChange={(e) => setTDetail(e.target.value)} rows={2} maxLength={2000} style={{ fontFamily: "var(--av3-ui)", resize: "vertical" }} />
                  </div>
                  <div className="av3-formgrid">
                    <div className="av3-field">
                      <label className="av3-field-label">Assign to</label>
                      <select className="av3-select" value={tAssignee} onChange={(e) => setTAssignee(e.target.value)}>
                        <option value="">Choose…</option>
                        <optgroup label="Whole role">
                          {assigneeOptions.groups.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </optgroup>
                        {assigneeOptions.people.length > 0 && (
                          <optgroup label="Person">
                            {assigneeOptions.people.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </optgroup>
                        )}
                      </select>
                    </div>
                    <div className="av3-field">
                      <label className="av3-field-label">Location (optional)</label>
                      <select className="av3-select" value={tLocation} onChange={(e) => setTLocation(e.target.value)}>
                        <option value="">{tAssignee.startsWith("role:") ? "All locations" : "—"}</option>
                        {activeLocations.map((l) => <option key={l.slug} value={l.slug}>{l.city}</option>)}
                      </select>
                    </div>
                    <div className="av3-field">
                      <label className="av3-field-label">Priority</label>
                      <select className="av3-select" value={tPriority} onChange={(e) => setTPriority(e.target.value as TaskPriority)}>
                        {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
                      </select>
                    </div>
                    <div className="av3-field">
                      <label className="av3-field-label">Due (optional)</label>
                      <input type="date" className="av3-input" value={tDue} onChange={(e) => setTDue(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <Button variant="primary" onClick={createTask} loading={busy} disabled={!tTitle.trim() || !tAssignee}>
                      <Plus style={{ width: 14, height: 14 }} />Assign task
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHead title="All tasks" actions={<Badge tone="neutral">{tasks.length}</Badge>} />
            <CardBody>
              {tasks.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--av3-muted)" }}>No tasks yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {tasks.map((t) => (
                    <div key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--av3-line)" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t.title}</div>
                        {t.detail && <div style={{ fontSize: 12, color: "var(--av3-muted)", marginTop: 2 }}>{t.detail}</div>}
                        <div style={{ fontSize: 11.5, color: "var(--av3-subtle)", marginTop: 4 }}>
                          {t.assigneeName} · {t.dueDate ? `due ${fmtDate(t.dueDate)}` : "no due date"} · by {t.createdByName}
                        </div>
                      </div>
                      <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
                      <Badge tone={t.status === "done" ? "ok" : t.status === "open" ? "warn" : "neutral"} dot>{t.status}</Badge>
                      {canManage && (
                        <Button variant="ghost" size="sm" onClick={() => deleteTask(t.id)} aria-label="Delete task">
                          <Trash2 style={{ width: 14, height: 14 }} />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Daily routines — the recurring "regular to-do list" (orders,
              delivery, clean walls, coffee-machine maintenance…). Defined once,
              they appear on every matching teammate's portal each day and reset
              at midnight; ticking is per-person, tracked server-side. */}
          {canManage && (
            <Card>
              <CardHead
                title={<><Repeat style={{ width: 14, height: 14, verticalAlign: "-2px", marginRight: 6 }} />New daily routine</>}
                description="A standing task the team does every day. It shows on each matching teammate's portal and resets daily — they tick it off for their own day."
              />
              <CardBody>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div className="av3-field">
                    <label className="av3-field-label">Routine</label>
                    <input className="av3-input" value={rTitle} onChange={(e) => setRTitle(e.target.value)} placeholder="e.g. Clean the coffee machine before close" maxLength={200} />
                  </div>
                  <div className="av3-field">
                    <label className="av3-field-label">Detail (optional)</label>
                    <textarea className="av3-input" value={rDetail} onChange={(e) => setRDetail(e.target.value)} rows={2} maxLength={2000} style={{ fontFamily: "var(--av3-ui)", resize: "vertical" }} />
                  </div>
                  <div className="av3-field">
                    <label className="av3-field-label">Who does it — roles (none = everyone)</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {TARGETABLE_ROLES.map((r) => (
                        <button key={r} type="button" className={`av3-chip ${rRoles.includes(r) ? "is-active" : ""}`} onClick={() => toggleRRole(r)}>
                          {ROLE_LABEL[r]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="av3-field">
                    <label className="av3-field-label">Where — locations (none = all)</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {activeLocations.map((l) => (
                        <button key={l.slug} type="button" className={`av3-chip ${rLocs.includes(l.slug) ? "is-active" : ""}`} onClick={() => toggleRLoc(l.slug)}>
                          {l.city}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="av3-field" style={{ maxWidth: 220 }}>
                    <label className="av3-field-label">Priority</label>
                    <select className="av3-select" value={rPriority} onChange={(e) => setRPriority(e.target.value as TaskPriority)}>
                      {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
                    </select>
                  </div>
                  <div>
                    <Button variant="primary" onClick={createRoutine} loading={busy} disabled={!rTitle.trim()}>
                      <Plus style={{ width: 14, height: 14 }} />Add routine
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHead title="Daily routines" actions={<Badge tone="neutral">{routines.length}</Badge>} />
            <CardBody>
              {routines.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--av3-muted)" }}>No daily routines yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {routines.map((t) => (
                    <div key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--av3-line)" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t.title}</div>
                        {t.detail && <div style={{ fontSize: 12, color: "var(--av3-muted)", marginTop: 2 }}>{t.detail}</div>}
                        <div style={{ fontSize: 11.5, color: "var(--av3-subtle)", marginTop: 4 }}>
                          {routineAudienceLabel(t)} · by {t.createdByName}
                        </div>
                      </div>
                      <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
                      {canManage && (
                        <>
                          <Switch checked={t.active} onChange={(v) => toggleRoutineActive(t, v)} label="Active" />
                          <Button variant="ghost" size="sm" onClick={() => deleteRoutine(t.id)} aria-label="Delete routine">
                            <Trash2 style={{ width: 14, height: 14 }} />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {view === "announcements" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--av3-gap-4)" }}>
          {canManage && (
            <Card>
              <CardHead
                title={<><Megaphone style={{ width: 14, height: 14, verticalAlign: "-2px", marginRight: 6 }} />{aEditId ? "Edit announcement" : "New announcement"}</>}
                description="A message you send your team. Separate from Alerts — the automated operational feed (orders, low stock, disputes) that rings the bell."
                actions={aEditId ? <Badge tone="info">editing</Badge> : undefined}
              />
              <CardBody>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div className="av3-field">
                    <label className="av3-field-label">Title</label>
                    <input className="av3-input" value={aTitle} onChange={(e) => setATitle(e.target.value)} placeholder="e.g. New winter menu launches Monday" maxLength={200} />
                  </div>
                  <div className="av3-field">
                    <label className="av3-field-label">Message</label>
                    <textarea className="av3-input" value={aBody} onChange={(e) => setABody(e.target.value)} rows={3} maxLength={5000} style={{ fontFamily: "var(--av3-ui)", resize: "vertical" }} />
                  </div>
                  <div className="av3-field">
                    <label className="av3-field-label">Audience — roles (none = everyone)</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {TARGETABLE_ROLES.map((r) => (
                        <button key={r} type="button" className={`av3-chip ${aRoles.includes(r) ? "is-active" : ""}`} onClick={() => toggleRole(r)}>
                          {ROLE_LABEL[r]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="av3-field">
                    <label className="av3-field-label">Audience — locations (none = all)</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {activeLocations.map((l) => (
                        <button key={l.slug} type="button" className={`av3-chip ${aLocs.includes(l.slug) ? "is-active" : ""}`} onClick={() => toggleLoc(l.slug)}>
                          {l.city}
                        </button>
                      ))}
                    </div>
                  </div>
                  {targetableUsers.length > 0 && (
                    <div className="av3-field">
                      <label className="av3-field-label">Also send to specific people (optional)</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {targetableUsers.map((u) => (
                          <button key={u.id} type="button" className={`av3-chip ${aUsers.includes(u.id) ? "is-active" : ""}`} onClick={() => toggleUser(u.id)}>
                            {u.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <Switch checked={aPinned} onChange={setAPinned} label="Pin to top" />
                    <div style={{ display: "flex", gap: 8 }}>
                      {aEditId && (
                        <Button variant="ghost" onClick={resetAnnForm} disabled={busy}>Cancel</Button>
                      )}
                      <Button variant="primary" onClick={submitAnnouncement} loading={busy} disabled={!aTitle.trim() || !aBody.trim()}>
                        <Megaphone style={{ width: 14, height: 14 }} />{aEditId ? "Save changes" : "Post announcement"}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHead title="Posted" actions={<Badge tone="neutral">{unreadAnns} unread by all</Badge>} />
            <CardBody>
              {anns.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--av3-muted)" }}>No announcements yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {anns.map((a) => (
                    <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--av3-line)" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                          {a.pinned && <Pin style={{ width: 12, height: 12, color: "var(--av3-platinum)" }} />}
                          {a.title}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--av3-muted)", marginTop: 2, whiteSpace: "pre-wrap" }}>{a.body}</div>
                        <div style={{ fontSize: 11.5, color: "var(--av3-subtle)", marginTop: 4 }}>
                          {announcementAudienceLabel(a)} · {fmtDate(a.createdAt)} · read by {a.readBy.length} · by {a.createdByName}
                        </div>
                      </div>
                      {canManage && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => editAnnouncement(a)} aria-label="Edit announcement">
                            <Pencil style={{ width: 14, height: 14 }} />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => deleteAnnouncement(a.id)} aria-label="Delete announcement">
                            <Trash2 style={{ width: 14, height: 14 }} />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
