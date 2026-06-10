"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Check, Pin, Archive, Trash2, RotateCcw } from "lucide-react";
import { Skeleton } from "@/admin-v3/ui/Skeleton";
import type { Task, Announcement, AnnouncementState } from "@/lib/comms";

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
  const [anns, setAnns] = useState<AnnRow[] | null>(null);
  const [tab, setTab] = useState<AnnouncementState>("inbox");
  const [openId, setOpenId] = useState<string | null>(null);
  const [unreadShown, setUnreadShown] = useState(UNREAD_PAGE);

  const load = useCallback(async () => {
    const [t, a] = await Promise.all([
      fetch("/api/admin/my-tasks").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/admin/my-announcements").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    setTasks(Array.isArray(t) ? t : []);
    setAnns(Array.isArray(a) ? a : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const markDone = async (id: string) => {
    setTasks((arr) => (arr ? arr.map((t) => (t.id === id ? { ...t, status: "done" } : t)) : arr));
    await fetch("/api/admin/my-tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "done" }),
    });
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
  if (tasks === null || anns === null) return <PortalInboxSkeleton />;

  const openTasks = tasks.filter((t) => t.status === "open");
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
                        {/* Collapsed only: the full date+time lives at the foot of
                            the opened body, so showing the short date here too
                            would be redundant. */}
                        {!isOpen && (
                          <span style={{ fontSize: "11px", color: "var(--av3-subtle)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                            {fmtDate(a.createdAt)}
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

      {/* Your to-do list */}
      <section className="av3-portal-section">
        <div className="av3-section-label">Your to-do list</div>
        <div className="av3-card av3-card-p">
          {openTasks.length === 0 ? (
            <p style={{ margin: 0, fontSize: "12.5px", color: "var(--av3-muted)" }}>
              Nothing on your list — you&rsquo;re all caught up.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {openTasks.map((t) => (
                <div key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, marginTop: 6, flexShrink: 0, background: PRIORITY_COLOR[t.priority] ?? "var(--av3-subtle)" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13.5px", fontWeight: 600 }}>{t.title}</div>
                    {t.detail && <div style={{ fontSize: "12px", color: "var(--av3-muted)", marginTop: 2 }}>{t.detail}</div>}
                    <div style={{ fontSize: "11.5px", color: "var(--av3-subtle)", marginTop: 3 }}>
                      {t.dueDate ? `Due ${fmtDate(t.dueDate)}` : "No due date"} · from {t.createdByName}
                    </div>
                  </div>
                  <button type="button" className="av3-btn av3-btn-sm" onClick={() => markDone(t.id)}>
                    <Check className="av3-btn-ico" />
                    Done
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
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
const loadMoreBtn: React.CSSProperties = {
  width: "100%", border: "none", borderTop: "1px solid var(--av3-line)", background: "var(--av3-s1)",
  color: "var(--av3-info)", fontSize: "12.5px", fontWeight: 600, padding: 11, cursor: "pointer",
};

/**
 * Loading stand-in for {@link PortalInbox}. Mirrors the loaded shape — a
 * Notifications inbox card (avatar + two text lines per row) above a to-do
 * card — so the portal reserves the space and doesn't jump when the feeds land.
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

      <section className="av3-portal-section" aria-busy="true">
        <div className="av3-section-label">
          <Skeleton width={108} height={11} radius={999} />
        </div>
        <div className="av3-card av3-card-p">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <Skeleton width={7} height={7} radius={999} style={{ marginTop: 6, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  <Skeleton width="55%" height={13} radius={999} />
                  <Skeleton width="35%" height={11} radius={999} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
