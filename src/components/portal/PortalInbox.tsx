"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, Pin, Archive, Trash2, RotateCcw, Plus, RotateCw } from "lucide-react";
import { Skeleton } from "@/admin-v3/ui/Skeleton";
import { fmtRelative } from "@/lib/relative-time";
import type { Task, TaskStatus, TaskPriority, Announcement, AnnouncementState, RoutineLine } from "@/lib/comms";

type AnnRow = Announcement & { read: boolean; state: AnnouncementState };

const PRIORITY_COLOR: Record<string, string> = {
  high: "var(--av3-bad)",
  normal: "var(--av3-info)",
  low: "var(--av3-subtle)",
};

// A small, stable palette so each sender's avatar keeps one colour.
const AVATAR_COLORS = [
  "var(--av3-c1)", "var(--av3-c2)", "var(--av3-c3)", "var(--av3-c4)",
  "var(--av3-c5)", "var(--av3-c6)", "var(--av3-c7)", "var(--av3-c8)",
];

const TABS: { key: AnnouncementState; label: string }[] = [
  { key: "inbox", label: "Inbox" },
  { key: "archived", label: "Archived" },
  { key: "deleted", label: "Deleted" },
];

// How many unread rows the Inbox shows before "Load more" (Rule: last 3 unread).
const UNREAD_PAGE = 3;

// The personal to-do list's lifecycle buckets, in tab order.
const TASK_TABS: { key: TaskStatus; label: string }[] = [
  { key: "open", label: "To-do" },
  { key: "done", label: "Done" },
  { key: "archived", label: "Archived" },
  { key: "deleted", label: "Deleted" },
];

function fmtDate(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "short" }) : "";
}

function fmtDateTime(iso?: string) {
  return iso
    ? new Date(iso).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";
}

function initials(name?: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic colour per sender so the same person always reads the same.
function avatarColor(name?: string): string {
  const safe = name ?? "";
  let h = 0;
  for (let i = 0; i < safe.length; i++) h = (h * 31 + safe.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/**
 * The signed-in teammate's personal comms, surfaced on their role portal
 * (Manager / Franchisee). Reads the two unmapped, any-authed feeds
 * (`/api/admin/my-tasks`, `/api/admin/my-announcements`) — never the management
 * board — so it works for any role without a permission.
 *
 * Announcements lead as a **Gmail-style inbox** with three mailbox tabs —
 * **Inbox / Archived / Deleted**. The Inbox shows only the most-recent
 * `UNREAD_PAGE` unread rows with a "Load more" beneath (read-but-kept rows
 * follow). Each row carries hover actions: **Mark read**, **Archive**, **Delete**
 * (Archived/Deleted offer **Restore**). Every action hits
 * `PUT /api/admin/my-announcements` with an `action`, which moves the per-user
 * mailbox state AND writes an entry to the central Audit log (so an owner can
 * review the open/archive/delete history). The personal to-do list follows.
 */
export function PortalInbox() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [routines, setRoutines] = useState<RoutineLine[] | null>(null);
  const [anns, setAnns] = useState<AnnRow[] | null>(null);
  const [tab, setTab] = useState<AnnouncementState>("inbox");
  const [taskTab, setTaskTab] = useState<TaskStatus>("open");
  const [openId, setOpenId] = useState<string | null>(null);
  const [unreadShown, setUnreadShown] = useState(UNREAD_PAGE);
  // Quick-add box for the personal to-do list (one-off tasks).
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("normal");
  const [newDue, setNewDue] = useState("");
  const [adding, setAdding] = useState(false);
  // Quick-add box for personal recurring routines.
  const [rtTitle, setRtTitle] = useState("");
  const [rtPriority, setRtPriority] = useState<TaskPriority>("normal");
  const [addingRt, setAddingRt] = useState(false);

  const load = useCallback(async () => {
    const [t, r, a] = await Promise.all([
      fetch("/api/admin/my-tasks").then((res) => (res.ok ? res.json() : [])).catch(() => []),
      fetch("/api/admin/my-routines").then((res) => (res.ok ? res.json() : [])).catch(() => []),
      fetch("/api/admin/my-announcements").then((res) => (res.ok ? res.json() : [])).catch(() => []),
    ]);
    setTasks(Array.isArray(t) ? t : []);
    setRoutines(Array.isArray(r) ? r : []);
    setAnns(Array.isArray(a) ? a : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Move a task through its lifecycle (done / archive / delete / restore).
  // Optimistic: re-bucket locally, then persist; on failure re-sync.
  const setStatus = async (id: string, status: TaskStatus) => {
    setTasks((arr) => (arr ? arr.map((t) => (t.id === id ? { ...t, status } : t)) : arr));
    try {
      const res = await fetch("/api/admin/my-tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) await load();
    } catch {
      await load();
    }
  };

  // Permanently remove a to-do you added yourself (manager-assigned tasks have
  // no hard delete — the server rejects those, and the button only shows on
  // self-added rows in the Deleted bucket).
  const purgeTask = async (id: string) => {
    setTasks((arr) => (arr ? arr.filter((t) => t.id !== id) : arr));
    await fetch(`/api/admin/my-tasks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  };

  // Add a one-off item to your own list. The server stamps you as both assignee
  // and creator, then we fold the created Task into local state so it shows now.
  const addTask = async () => {
    const title = newTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    try {
      const res = await fetch("/api/admin/my-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, priority: newPriority, dueDate: newDue || undefined }),
      });
      if (res.ok) {
        const created: Task = await res.json();
        setTasks((arr) => [created, ...(arr ?? [])]);
        setNewTitle("");
        setNewPriority("normal");
        setNewDue("");
        setTaskTab("open");
      }
    } finally {
      setAdding(false);
    }
  };

  // Tick / un-tick a routine for today. Optimistic, then persist.
  const toggleRoutine = async (templateId: string, done: boolean) => {
    setRoutines((arr) => (arr ? arr.map((r) => (r.id === templateId ? { ...r, done } : r)) : arr));
    try {
      const res = await fetch("/api/admin/my-routines", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, done }),
      });
      if (!res.ok) await load();
    } catch {
      await load();
    }
  };

  // Add a recurring item to your own daily routine (personal, owned by you).
  const addRoutine = async () => {
    const title = rtTitle.trim();
    if (!title || addingRt) return;
    setAddingRt(true);
    try {
      const res = await fetch("/api/admin/my-routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, priority: rtPriority }),
      });
      if (res.ok) {
        const created: RoutineLine = await res.json();
        setRoutines((arr) => [...(arr ?? []), created]);
        setRtTitle("");
        setRtPriority("normal");
      }
    } finally {
      setAddingRt(false);
    }
  };

  // Remove a personal routine you own (team routines have no remove control).
  const removeRoutine = async (id: string) => {
    setRoutines((arr) => (arr ? arr.filter((r) => r.id !== id) : arr));
    await fetch(`/api/admin/my-routines?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  };

  // The single announcement-action path. Optimistically applies the new mailbox
  // state, then persists + audit-logs it server-side.
  const act = async (id: string, action: "read" | "archive" | "delete" | "restore") => {
    setAnns((arr) =>
      arr
        ? arr.map((a) => {
            if (a.id !== id) return a;
            if (action === "read") return { ...a, read: true };
            if (action === "archive") return { ...a, read: true, state: "archived" };
            if (action === "delete") return { ...a, state: "deleted" };
            return { ...a, state: "inbox" }; // restore
          })
        : arr,
    );
    if (openId === id && (action === "archive" || action === "delete")) setOpenId(null);
    // Optimistic above; if the write fails, re-sync from the server so the UI
    // doesn't drift from the persisted mailbox state.
    try {
      const res = await fetch("/api/admin/my-announcements", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) await load();
    } catch {
      await load();
    }
  };

  // Open an email (Gmail behaviour): expand it, and mark it read on first open.
  const openEmail = (a: AnnRow) => {
    setOpenId((cur) => (cur === a.id ? null : a.id));
    if (!a.read) act(a.id, "read");
  };

  const unread = useMemo(
    () => (anns ? anns.filter((a) => a.state === "inbox" && !a.read).length : 0),
    [anns],
  );

  // Hold the layout with a shimmer stand-in while the feeds resolve, so the
  // portal doesn't jump when the data lands (returning null would collapse it).
  if (tasks === null || routines === null || anns === null) return <PortalInboxSkeleton />;

  // Personal to-do list, bucketed by lifecycle for the tab filter.
  const taskCounts: Record<TaskStatus, number> = { open: 0, done: 0, archived: 0, deleted: 0 };
  for (const t of tasks) taskCounts[t.status]++;
  const tasksInTab = tasks.filter((t) => t.status === taskTab);
  const routineDone = routines.filter((r) => r.done).length;
  const routineAllDone = routines.length > 0 && routineDone === routines.length;
  const inTab = anns.filter((a) => a.state === tab);
  const counts = {
    inbox: anns.filter((a) => a.state === "inbox").length,
    archived: anns.filter((a) => a.state === "archived").length,
    deleted: anns.filter((a) => a.state === "deleted").length,
  };

  // Inbox tab: unread first (capped at `unreadShown`), then read-but-kept rows.
  // `shownUnreadCount` marks the boundary so "Load more" can sit directly below
  // the last unread row, above the read rows (not buried at the card's bottom).
  let visible: AnnRow[] = inTab;
  let hiddenUnread = 0;
  let shownUnreadCount = 0;
  if (tab === "inbox") {
    const unreadRows = inTab.filter((a) => !a.read);
    const readRows = inTab.filter((a) => a.read);
    const shownUnread = unreadRows.slice(0, unreadShown);
    shownUnreadCount = shownUnread.length;
    hiddenUnread = unreadRows.length - shownUnread.length;
    visible = [...shownUnread, ...readRows];
  }

  const emptyCopy: Record<AnnouncementState, string> = {
    inbox: "No notifications — you’re all caught up.",
    archived: "Nothing archived.",
    deleted: "Deleted is empty.",
  };

  return (
    <>
      {/* Notifications — the Gmail-style inbox with mailbox tabs */}
      <section className="av3-portal-section">
        <div
          className="av3-section-label"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Notifications
            {unread > 0 && (
              <span
                style={{
                  fontSize: "10.5px", fontWeight: 700, lineHeight: 1, color: "#fff",
                  background: "var(--av3-brand)", borderRadius: 999, padding: "3px 7px",
                }}
              >
                {unread}
              </span>
            )}
          </span>
          <div role="tablist" aria-label="Notification mailboxes" style={tabsWrap}>
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => { setTab(t.key); setOpenId(null); setUnreadShown(UNREAD_PAGE); }}
                  style={{
                    ...tabBtn,
                    background: active ? "var(--av3-s3)" : "transparent",
                    color: active ? "var(--av3-fg)" : "var(--av3-muted)",
                  }}
                >
                  {t.label}
                  {counts[t.key] > 0 && (
                    <span style={t.key === "inbox" && unread > 0 ? tabCntBrand : tabCntNeutral}>
                      {t.key === "inbox" ? unread || counts.inbox : counts[t.key]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="av3-card" style={{ overflow: "hidden", padding: 0 }}>
          {visible.length === 0 ? (
            <p style={{ margin: 0, padding: "var(--av3-gap-4)", fontSize: "12.5px", color: "var(--av3-muted)" }}>
              {emptyCopy[tab]}
            </p>
          ) : (
            visible.map((a, i) => {
              const isOpen = openId === a.id;
              const showUnread = tab === "inbox" && !a.read;
              return (
                <Fragment key={a.id}>
                <div
                  style={{
                    display: "flex", alignItems: "flex-start",
                    borderTop: i === 0 ? "none" : "1px solid var(--av3-line)",
                    background: showUnread ? "var(--av3-s2)" : "transparent",
                    opacity: tab === "inbox" ? 1 : 0.72,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => openEmail(a)}
                    aria-expanded={isOpen}
                    style={{
                      flex: 1, minWidth: 0, display: "flex", alignItems: "flex-start", gap: 12,
                      padding: "11px 14px", background: "transparent", border: "none",
                      textAlign: "left", cursor: "pointer", color: "inherit",
                    }}
                  >
                    {/* Sender avatar */}
                    <span
                      aria-hidden
                      style={{
                        flexShrink: 0, width: 34, height: 34, borderRadius: 999,
                        display: "grid", placeItems: "center",
                        background: avatarColor(a.createdByName), color: "#fff",
                        fontSize: "12px", fontWeight: 700, marginTop: 1,
                      }}
                    >
                      {initials(a.createdByName)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {/* Row 1: sender + timestamp */}
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            flex: 1, minWidth: 0, fontSize: "13px",
                            fontWeight: showUnread ? 700 : 500,
                            color: "var(--av3-fg)",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}
                        >
                          {a.createdByName}
                        </span>
                        {a.pinned && <Pin style={{ width: 12, height: 12, color: "var(--av3-platinum)", flexShrink: 0 }} />}
                        {showUnread && (
                          <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: "var(--av3-brand)", flexShrink: 0 }} />
                        )}
                        {/* Collapsed only: a scannable relative age ("3h",
                            "Yesterday"). The full absolute date+time lives at the
                            foot of the opened body, so repeating it here would be
                            redundant. */}
                        {!isOpen && (
                          <span style={{ fontSize: "11px", color: "var(--av3-subtle)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                            {fmtRelative(a.createdAt)}
                          </span>
                        )}
                      </span>
                      {/* Row 2: subject + snippet (collapsed) */}
                      <span
                        style={{
                          display: "block", fontSize: "12.5px", marginTop: 2,
                          fontWeight: showUnread ? 600 : 400, color: "var(--av3-fg)",
                          overflow: isOpen ? "visible" : "hidden",
                          textOverflow: "ellipsis", whiteSpace: isOpen ? "normal" : "nowrap",
                        }}
                      >
                        {a.title}
                        {!isOpen && (
                          <span style={{ fontWeight: 400, color: "var(--av3-muted)" }}>
                            {" — "}{(a.body ?? "").replace(/\s+/g, " ").trim()}
                          </span>
                        )}
                      </span>
                      {/* Full body, revealed when opened */}
                      {isOpen && (
                        <span style={{ display: "block", marginTop: 8 }}>
                          <span style={{ display: "block", fontSize: "12.5px", color: "var(--av3-muted)", whiteSpace: "pre-wrap" }}>
                            {a.body}
                          </span>
                          <span style={{ display: "block", fontSize: "11px", color: "var(--av3-subtle)", marginTop: 8 }}>
                            {fmtDateTime(a.createdAt)}
                          </span>
                        </span>
                      )}
                    </span>
                  </button>

                  {/* Hover actions (Gmail-style), per tab */}
                  <span style={rowActions}>
                    {tab === "inbox" && !a.read && (
                      <ActBtn label="Mark read" onClick={() => act(a.id, "read")}><Check style={actIco} /></ActBtn>
                    )}
                    {tab === "inbox" && (
                      <ActBtn label="Archive" onClick={() => act(a.id, "archive")}><Archive style={actIco} /></ActBtn>
                    )}
                    {tab === "archived" && (
                      <ActBtn label="Move back to inbox" onClick={() => act(a.id, "restore")}><RotateCcw style={actIco} /></ActBtn>
                    )}
                    {tab === "deleted" && (
                      <ActBtn label="Restore to inbox" onClick={() => act(a.id, "restore")}><RotateCcw style={actIco} /></ActBtn>
                    )}
                    {tab !== "deleted" && (
                      <ActBtn label="Delete" danger onClick={() => act(a.id, "delete")}><Trash2 style={actIco} /></ActBtn>
                    )}
                  </span>
                </div>
                {/* "Load more" sits directly under the last shown unread row,
                    above the read-but-kept rows. */}
                {tab === "inbox" && hiddenUnread > 0 && i === shownUnreadCount - 1 && (
                  <button type="button" onClick={() => setUnreadShown((n) => n + UNREAD_PAGE)} style={loadMoreBtn}>
                    Load {Math.min(UNREAD_PAGE, hiddenUnread)} more unread ({hiddenUnread} hidden)
                  </button>
                )}
                </Fragment>
              );
            })
          )}
        </div>
      </section>

      {/* Daily routine — the recurring "regular to-do list" that resets each
          day. Team routines (manager-defined, matched to your role + location)
          and your own personal routines, ticked off for today. */}
      <section className="av3-portal-section">
        <div
          className="av3-section-label"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
        >
          <span>Daily routine</span>
          <span style={{ display: "flex", alignItems: "center", gap: 9, textTransform: "none", letterSpacing: 0 }}>
            <span style={{ fontSize: "11px", fontWeight: 500, color: routineAllDone ? "var(--av3-ok)" : "var(--av3-subtle)" }}>
              {routines.length > 0 ? `${routineDone}/${routines.length} today` : "resets daily"}
            </span>
            {routines.length > 0 && (
              <span className="av3-todo-progress" style={{ width: 72 }} aria-hidden>
                <i style={{ width: `${Math.round((routineDone / routines.length) * 100)}%` }} />
              </span>
            )}
          </span>
        </div>
        <div className="av3-card av3-card-p">
          {/* Add a recurring item to your own routine (personal, only you see it). */}
          <div style={addRow}>
            <input
              className="av3-input"
              value={rtTitle}
              onChange={(e) => setRtTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addRoutine(); }}
              placeholder="Add a daily routine — e.g. Wipe down coffee machine"
              maxLength={200}
              aria-label="New daily routine"
              style={{ flex: 1, minWidth: 180 }}
            />
            <select
              className="av3-select"
              value={rtPriority}
              onChange={(e) => setRtPriority(e.target.value as TaskPriority)}
              aria-label="Priority"
              style={{ flexShrink: 0 }}
            >
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
            <button
              type="button"
              className="av3-btn av3-btn-sm av3-btn-primary"
              onClick={addRoutine}
              disabled={!rtTitle.trim() || addingRt}
              style={{ flexShrink: 0 }}
            >
              <Plus className="av3-btn-ico" />
              Add
            </button>
          </div>

          {routines.length === 0 ? (
            <p style={{ margin: "12px 2px 0", fontSize: "12.5px", color: "var(--av3-muted)", lineHeight: 1.5 }}>
              No daily routine yet — your manager&rsquo;s team routines and anything you add above will show here each day.
            </p>
          ) : (
            <div style={{ marginTop: 8 }}>
              {routineAllDone && (
                <div className="av3-todo-alldone">
                  <CheckCircle2 /> All done for today — nice work.
                </div>
              )}
              {routines.map((r) => (
                <div key={r.id} className="av3-todo-row">
                  {/* Tick box — toggles today's completion (check animates via CSS). */}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={r.done}
                    aria-label={r.done ? `Mark "${r.title}" not done` : `Mark "${r.title}" done`}
                    className="av3-todo-check"
                    onClick={() => toggleRoutine(r.id, !r.done)}
                  >
                    <Check />
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={`av3-todo-title${r.done ? " is-done" : ""}`}>{r.title}</div>
                    {r.detail && <div className="av3-todo-detail">{r.detail}</div>}
                    <div className="av3-todo-meta">
                      <span className={`av3-todo-scope ${r.scope === "personal" ? "is-mine" : "is-team"}`}>
                        {r.scope === "personal" ? "Yours" : "Team"}
                      </span>
                      <span aria-hidden className="av3-todo-dot" style={{ width: 6, height: 6, background: PRIORITY_COLOR[r.priority] ?? "var(--av3-subtle)" }} />
                      <span>{r.priority}</span>
                    </div>
                  </div>
                  {/* Only your own routines can be removed; team ones are read-only. */}
                  {r.scope === "personal" && (
                    <span className="av3-todo-acts">
                      <TodoAct label="Remove routine" danger onClick={() => removeRoutine(r.id)}><Trash2 /></TodoAct>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Your to-do list — one-off tasks (assigned + self-added), with a full
          lifecycle: Done · Archive · Delete (and Restore / Reopen). */}
      <section className="av3-portal-section">
        <div
          className="av3-section-label"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
        >
          <span>Your to-do list</span>
          <div role="tablist" aria-label="To-do buckets" style={tabsWrap}>
            {TASK_TABS.map((t) => {
              const active = taskTab === t.key;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTaskTab(t.key)}
                  style={{
                    ...tabBtn,
                    background: active ? "var(--av3-s3)" : "transparent",
                    color: active ? "var(--av3-fg)" : "var(--av3-muted)",
                  }}
                >
                  {t.label}
                  {taskCounts[t.key] > 0 && (
                    <span className={`av3-todo-tabcount${active ? " is-active" : ""}`}>{taskCounts[t.key]}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="av3-card av3-card-p">
          {/* Quick-add (one-off): anyone can put an item on their own list. */}
          <div style={addRow}>
            <input
              className="av3-input"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addTask(); }}
              placeholder="Add a one-off task — e.g. Call supplier about flour"
              maxLength={200}
              aria-label="New to-do"
              style={{ flex: 1, minWidth: 180 }}
            />
            <select
              className="av3-select"
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
              aria-label="Priority"
              style={{ flexShrink: 0 }}
            >
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
            <input
              className="av3-input"
              type="date"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
              aria-label="Due date (optional)"
              style={{ flexShrink: 0 }}
            />
            <button
              type="button"
              className="av3-btn av3-btn-sm av3-btn-primary"
              onClick={addTask}
              disabled={!newTitle.trim() || adding}
              style={{ flexShrink: 0 }}
            >
              <Plus className="av3-btn-ico" />
              Add
            </button>
          </div>

          {tasksInTab.length === 0 ? (
            <p style={{ margin: "12px 2px 0", fontSize: "12.5px", color: "var(--av3-muted)" }}>
              {taskTab === "open"
                ? "Nothing on your list — you’re all caught up."
                : taskTab === "done"
                ? "Nothing ticked off yet."
                : taskTab === "archived"
                ? "Nothing archived."
                : "Trash is empty."}
            </p>
          ) : (
            <div style={{ marginTop: 8 }}>
              {tasksInTab.map((t) => {
                const selfAdded = t.createdBy === t.assigneeId;
                return (
                <div key={t.id} className="av3-todo-row">
                  <span aria-hidden className="av3-todo-dot" style={{ marginTop: 6, background: PRIORITY_COLOR[t.priority] ?? "var(--av3-subtle)" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={`av3-todo-title${t.status === "done" ? " is-done" : ""}`}>{t.title}</div>
                    {t.detail && <div className="av3-todo-detail">{t.detail}</div>}
                    <div className="av3-todo-meta">
                      {t.dueDate ? `Due ${fmtDate(t.dueDate)}` : "No due date"} · {selfAdded ? "added by you" : `from ${t.createdByName}`}
                    </div>
                  </div>
                  {/* Per-bucket actions — the lifecycle controls (reveal on hover). */}
                  <span className="av3-todo-acts">
                    {taskTab === "open" && (
                      <>
                        <TodoAct label="Mark done" onClick={() => setStatus(t.id, "done")}><Check /></TodoAct>
                        <TodoAct label="Archive" onClick={() => setStatus(t.id, "archived")}><Archive /></TodoAct>
                        <TodoAct label="Delete" danger onClick={() => setStatus(t.id, "deleted")}><Trash2 /></TodoAct>
                      </>
                    )}
                    {taskTab === "done" && (
                      <>
                        <TodoAct label="Reopen" onClick={() => setStatus(t.id, "open")}><RotateCw /></TodoAct>
                        <TodoAct label="Archive" onClick={() => setStatus(t.id, "archived")}><Archive /></TodoAct>
                        <TodoAct label="Delete" danger onClick={() => setStatus(t.id, "deleted")}><Trash2 /></TodoAct>
                      </>
                    )}
                    {taskTab === "archived" && (
                      <>
                        <TodoAct label="Restore to to-do" onClick={() => setStatus(t.id, "open")}><RotateCcw /></TodoAct>
                        <TodoAct label="Delete" danger onClick={() => setStatus(t.id, "deleted")}><Trash2 /></TodoAct>
                      </>
                    )}
                    {taskTab === "deleted" && (
                      <>
                        <TodoAct label="Restore to to-do" onClick={() => setStatus(t.id, "open")}><RotateCcw /></TodoAct>
                        {/* Only items you created yourself can be purged for good;
                            manager-assigned ones stay (record kept). */}
                        {selfAdded && (
                          <TodoAct label="Delete forever" danger onClick={() => purgeTask(t.id)}><Trash2 /></TodoAct>
                        )}
                      </>
                    )}
                  </span>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

/** A small lifecycle action button on a routine / to-do row (icon-only). */
function TodoAct({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`av3-todo-act${danger ? " is-danger" : ""}`}
    >
      {children}
    </button>
  );
}

/** A small hover action button on an inbox row. */
function ActBtn({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      style={{ ...actBtn, color: danger ? "var(--av3-bad)" : "var(--av3-muted)" }}
    >
      {children}
    </button>
  );
}

/* Inline style objects (this component is built from tokens + inline styles on
   the .av3-portal / .av3-card scaffold — no bespoke CSS class, per the av3 doc). */
const tabsWrap: React.CSSProperties = {
  display: "flex", gap: 3, background: "var(--av3-s2)", border: "1px solid var(--av3-line)",
  borderRadius: 999, padding: 3,
};
const tabBtn: React.CSSProperties = {
  border: "none", fontSize: "11.5px", fontWeight: 600, padding: "5px 11px",
  borderRadius: 999, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
  textTransform: "none", letterSpacing: 0,
};
const tabCntBrand: React.CSSProperties = {
  fontSize: "10px", fontWeight: 700, color: "#fff", background: "var(--av3-brand)",
  borderRadius: 999, padding: "1px 6px",
};
const tabCntNeutral: React.CSSProperties = {
  fontSize: "10px", fontWeight: 600, color: "var(--av3-muted)", background: "var(--av3-s1)",
  border: "1px solid var(--av3-line)", borderRadius: 999, padding: "1px 6px",
};
// Pinned to the top of the row (not centered) so opening a message — which
// grows the row taller — leaves Archive/Delete exactly where they were,
// aligned with the sender line rather than sliding down to the new centre.
const rowActions: React.CSSProperties = {
  display: "flex", gap: 4, alignSelf: "flex-start", padding: "13px 12px 0 4px", flexShrink: 0,
};
const actBtn: React.CSSProperties = {
  width: 30, height: 30, display: "grid", placeItems: "center", borderRadius: "var(--av3-r-md)",
  background: "var(--av3-s3)", border: "1px solid var(--av3-line)", color: "var(--av3-muted)", cursor: "pointer",
};
const actIco: React.CSSProperties = { width: 15, height: 15 };
const addRow: React.CSSProperties = {
  display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8,
};
const loadMoreBtn: React.CSSProperties = {
  width: "100%", border: "none", borderTop: "1px solid var(--av3-line)", background: "var(--av3-s1)",
  color: "var(--av3-info)", fontSize: "12.5px", fontWeight: 600, padding: 11, cursor: "pointer",
};

/**
 * Loading stand-in for {@link PortalInbox}. Mirrors the loaded shape — a
 * Notifications inbox card above the Daily routine + to-do cards — so the portal
 * reserves the space and doesn't jump when the feeds land.
 */
function PortalInboxSkeleton() {
  return (
    <>
      <section className="av3-portal-section" aria-busy="true">
        <div className="av3-section-label">
          <Skeleton width={92} height={11} radius={999} />
        </div>
        <div className="av3-card" style={{ overflow: "hidden", padding: 0 }}>
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              style={{
                display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 14px",
                borderTop: i === 0 ? "none" : "1px solid var(--av3-line)",
              }}
            >
              <Skeleton width={34} height={34} radius={999} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                <Skeleton width="40%" height={12} radius={999} />
                <Skeleton width="85%" height={12} radius={999} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {[0, 1].map((s) => (
        <section key={s} className="av3-portal-section" aria-busy="true">
          <div className="av3-section-label">
            <Skeleton width={s === 0 ? 96 : 108} height={11} radius={999} />
          </div>
          <div className="av3-card av3-card-p">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {Array.from({ length: 2 }, (_, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <Skeleton width={s === 0 ? 19 : 7} height={s === 0 ? 19 : 7} radius={s === 0 ? 6 : 999} style={{ marginTop: 4, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                    <Skeleton width="55%" height={13} radius={999} />
                    <Skeleton width="35%" height={11} radius={999} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}
    </>
  );
}
