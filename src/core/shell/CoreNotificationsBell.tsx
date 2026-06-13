"use client";

import { useCallback, useEffect, useState } from "react";
import { usePolling } from "@/lib/usePolling";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  locationSlug?: string;
}

const TONE: Record<string, string> = {
  new_order: "brand",
  low_stock: "amber",
  low_slots: "amber",
  slot_full: "info",
  bundle_low_margin: "amber",
  dispute: "brand",
  order_status: "info",
  daily_summary: "basil",
};

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
};

/**
 * Core notifications center — a bell in the shell command bar with an
 * unread badge and a dropdown panel over the real notifications store
 * (/api/admin/notifications). Polls the unread count every 20s; loads the
 * list on open. Mark one / mark all read.
 */
export function CoreNotificationsBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationRow[]>([]);

  const loadCount = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/notifications?count=true");
      if (!r.ok) return;
      const d = await r.json();
      setUnread(typeof d.unread === "number" ? d.unread : 0);
    } catch {
      /* offline */
    }
  }, []);
  usePolling(loadCount, 20000);
  useEffect(() => { void loadCount(); }, [loadCount]);

  const loadList = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/notifications");
      if (!r.ok) return;
      const d = await r.json();
      setItems(Array.isArray(d) ? d.slice(0, 40) : []);
    } catch {
      /* offline */
    }
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void loadList();
  };

  const markRead = async (id: string) => {
    setItems((arr) => arr.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
    try { await fetch("/api/admin/notifications", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); } catch { /* */ }
  };
  const markAll = async () => {
    setItems((arr) => arr.map((n) => ({ ...n, read: true })));
    setUnread(0);
    try { await fetch("/api/admin/notifications", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markAll: true }) }); } catch { /* */ }
  };

  return (
    <div className="core-notif">
      <button type="button" className="core-iconbtn core-notif-btn" onClick={toggle} title="Notifications" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && <span className="core-notif-badge">{unread > 99 ? "99+" : unread}</span>}
      </button>

      {open && (
        <>
          <div className="core-notif-scrim" onClick={() => setOpen(false)} />
          <div className="core-notif-panel" role="dialog" aria-label="Notifications">
            <div className="core-notif-head">
              <strong>Notifications</strong>
              {unread > 0 && <button type="button" className="core-notif-all" onClick={() => void markAll()}>Mark all read</button>}
            </div>
            <div className="core-notif-list">
              {items.length === 0 ? (
                <div className="core-notif-empty">You&rsquo;re all caught up.</div>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={`core-notif-item ${n.read ? "" : "unread"}`}
                    onClick={() => { if (!n.read) void markRead(n.id); }}
                  >
                    <span className={`core-notif-dot ${TONE[n.type] ?? "info"}`} aria-hidden />
                    <span className="core-notif-body">
                      <span className="core-notif-title">{n.title}</span>
                      <span className="core-notif-msg">{n.message}</span>
                    </span>
                    <span className="core-notif-time">{ago(n.createdAt)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
