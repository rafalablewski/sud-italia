"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Pin } from "lucide-react";
import type { Task, Announcement } from "@/lib/comms";

type AnnRow = Announcement & { read: boolean };

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
 * Announcements lead the portal as a **Gmail-style notification inbox**: each
 * is an email row (sender avatar + subject + snippet + timestamp, unread bold
 * with a brand dot, pinned flagged). Tapping a row opens the full message and
 * marks it read. The personal to-do list follows beneath.
 */
export function PortalInbox() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [anns, setAnns] = useState<AnnRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

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

  const markRead = async (id: string) => {
    setAnns((arr) => (arr ? arr.map((a) => (a.id === id ? { ...a, read: true } : a)) : arr));
    await fetch("/api/admin/my-announcements", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  };

  // Open an email (Gmail behaviour): expand it, and mark it read on first open.
  const openEmail = (a: AnnRow) => {
    setOpenId((cur) => (cur === a.id ? null : a.id));
    if (!a.read) markRead(a.id);
  };

  const unread = useMemo(() => (anns ? anns.filter((a) => !a.read).length : 0), [anns]);

  // Avoid a layout flash before the feeds resolve.
  if (tasks === null || anns === null) return null;

  const openTasks = tasks.filter((t) => t.status === "open");

  return (
    <>
      {/* Notifications — the Gmail-style announcement inbox, leading the portal */}
      <section className="av3-portal-section">
        <div className="av3-section-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
        </div>
        <div className="av3-card" style={{ overflow: "hidden", padding: 0 }}>
          {anns.length === 0 ? (
            <p style={{ margin: 0, padding: "var(--av3-gap-4)", fontSize: "12.5px", color: "var(--av3-muted)" }}>
              No notifications — you&rsquo;re all caught up.
            </p>
          ) : (
            anns.map((a, i) => {
              const isOpen = openId === a.id;
              return (
                <div
                  key={a.id}
                  style={{
                    borderTop: i === 0 ? "none" : "1px solid var(--av3-line)",
                    background: a.read ? "transparent" : "var(--av3-s2)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => openEmail(a)}
                    aria-expanded={isOpen}
                    style={{
                      width: "100%", display: "flex", alignItems: "flex-start", gap: 12,
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
                            fontWeight: a.read ? 500 : 700,
                            color: "var(--av3-fg)",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}
                        >
                          {a.createdByName}
                        </span>
                        {a.pinned && <Pin style={{ width: 12, height: 12, color: "var(--av3-platinum)", flexShrink: 0 }} />}
                        {!a.read && (
                          <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: "var(--av3-brand)", flexShrink: 0 }} />
                        )}
                        <span style={{ fontSize: "11px", color: "var(--av3-subtle)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                          {fmtDate(a.createdAt)}
                        </span>
                      </span>
                      {/* Row 2: subject + snippet (collapsed) */}
                      <span
                        style={{
                          display: "block", fontSize: "12.5px", marginTop: 2,
                          fontWeight: a.read ? 400 : 600, color: "var(--av3-fg)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
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
                </div>
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
