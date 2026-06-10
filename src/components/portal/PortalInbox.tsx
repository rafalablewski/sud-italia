"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Pin } from "lucide-react";
import type { Task, Announcement } from "@/lib/comms";

type AnnRow = Announcement & { read: boolean };

const PRIORITY_COLOR: Record<string, string> = {
  high: "var(--av3-bad)",
  normal: "var(--av3-info)",
  low: "var(--av3-subtle)",
};

function fmtDate(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "short" }) : "";
}

/**
 * The signed-in teammate's personal comms, surfaced on their role portal
 * (Manager / Franchisee). Reads the two unmapped, any-authed feeds
 * (`/api/admin/my-tasks`, `/api/admin/my-announcements`) — never the management
 * board — so it works for any role without a permission. The to-do list always
 * shows (discoverability, rule #5); announcements only when something's posted.
 */
export function PortalInbox() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [anns, setAnns] = useState<AnnRow[] | null>(null);

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

  // Avoid a layout flash before the feeds resolve.
  if (tasks === null || anns === null) return null;

  const openTasks = tasks.filter((t) => t.status === "open");

  return (
    <>
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

      {anns.length > 0 && (
        <section className="av3-portal-section">
          <div className="av3-section-label">Announcements</div>
          <div className="av3-card av3-card-p">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {anns.map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, opacity: a.read ? 0.66 : 1 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13.5px", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      {a.pinned && <Pin style={{ width: 12, height: 12, color: "var(--av3-platinum)" }} />}
                      {!a.read && <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: "var(--av3-brand)" }} />}
                      {a.title}
                    </div>
                    <div style={{ fontSize: "12.5px", color: "var(--av3-muted)", marginTop: 3, whiteSpace: "pre-wrap" }}>{a.body}</div>
                    <div style={{ fontSize: "11.5px", color: "var(--av3-subtle)", marginTop: 4 }}>
                      {fmtDate(a.createdAt)} · {a.createdByName}
                    </div>
                  </div>
                  {!a.read && (
                    <button type="button" className="av3-btn av3-btn-ghost av3-btn-sm" onClick={() => markRead(a.id)}>
                      Mark read
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
