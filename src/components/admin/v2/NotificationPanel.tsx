"use client";

import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAdminBase } from "./useAdminBase";
import { withAdminBase } from "@/lib/admin-base";
import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, CheckCheck, Trash2, X } from "lucide-react";

interface NotificationRow {
  id: string;
  type: "new_order" | "slot_full" | "daily_summary" | "low_slots" | "order_status";
  title: string;
  message: string;
  locationSlug?: string;
  orderId?: string;
  createdAt: string;
  read: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called whenever the unread count may have changed (mark read / delete). */
  onChanged?: () => void;
}

const TYPE_TONE: Record<NotificationRow["type"], string> = {
  new_order: "v2-notif-tone-info",
  order_status: "v2-notif-tone-info",
  slot_full: "v2-notif-tone-warning",
  low_slots: "v2-notif-tone-warning",
  daily_summary: "v2-notif-tone-success",
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function notificationHref(n: NotificationRow): string {
  if (n.orderId) return `/admin/orders#${n.orderId}`;
  if (n.type === "slot_full" || n.type === "low_slots") return "/core/service/slots";
  if (n.type === "daily_summary") return "/admin/reports";
  return "/admin";
}

export function NotificationPanel({ open, onClose, onChanged }: Props) {
  const router = useRouter();
  const base = useAdminBase();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/notifications");
      if (!r.ok) return;
      const data = await r.json();
      if (Array.isArray(data)) setItems(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const markRead = async (id: string) => {
    setItems((arr) => arr.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await fetch("/api/admin/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    onChanged?.();
  };

  const markAllRead = async () => {
    setItems((arr) => arr.map((n) => ({ ...n, read: true })));
    await fetch("/api/admin/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
    onChanged?.();
  };

  const remove = async (id: string) => {
    setItems((arr) => arr.filter((n) => n.id !== id));
    await fetch("/api/admin/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    onChanged?.();
  };

  const openItem = async (n: NotificationRow) => {
    if (!n.read) await markRead(n.id);
    onClose();
    router.push(withAdminBase(base, notificationHref(n)));
  };

  if (!open || !mounted) return null;

  const unread = items.filter((n) => !n.read).length;

  return createPortal(
    <div className="v2-panel-root">
      <div className="v2-panel-scrim" onClick={onClose} aria-hidden />
      <aside role="dialog" aria-modal="true" aria-label="Notifications" className="v2-panel">
        <header className="v2-panel-header">
          <div className="v2-panel-title">
            <Bell className="h-4 w-4" />
            <span>Notifications</span>
            {unread > 0 && <span className="v2-panel-count">{unread}</span>}
          </div>
          <div className="v2-panel-actions">
            <button
              type="button"
              onClick={markAllRead}
              disabled={unread === 0}
              className="v2-panel-action"
              aria-label="Mark all as read"
              title="Mark all as read"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>Mark all read</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="v2-icon-btn"
              aria-label="Close notifications"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="v2-panel-body">
          {loading && items.length === 0 && <div className="v2-panel-empty">Loading…</div>}
          {!loading && items.length === 0 && (
            <div className="v2-panel-empty">
              <BellOff className="h-6 w-6" aria-hidden />
              <div>You&apos;re all caught up.</div>
              <div className="v2-panel-empty-sub">New orders and operational alerts will appear here.</div>
            </div>
          )}
          {items.map((n) => (
            <div
              key={n.id}
              className={`v2-notif ${n.read ? "" : "is-unread"} ${TYPE_TONE[n.type]}`}
            >
              <button type="button" className="v2-notif-main" onClick={() => openItem(n)}>
                <span className="v2-notif-dot" aria-hidden />
                <span className="v2-notif-text">
                  <span className="v2-notif-title">{n.title}</span>
                  <span className="v2-notif-message">{n.message}</span>
                  <span className="v2-notif-meta">
                    {formatRelative(n.createdAt)}
                    {n.locationSlug && <span className="v2-notif-loc"> · {n.locationSlug}</span>}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="v2-notif-remove"
                onClick={() => remove(n.id)}
                aria-label="Dismiss"
                title="Dismiss"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
