"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BellOff, CheckCheck, RefreshCcw } from "lucide-react";
import { BottomSheet } from "./BottomSheet";
import { SwipeRow } from "./SwipeRow";
import { haptic } from "./haptics";
import { useActionTiming } from "./useActionTiming";

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

type Filter = "all" | "orders" | "slots" | "summary";

const TYPE_FILTERS: Record<Filter, NotificationRow["type"][] | null> = {
  all: null,
  orders: ["new_order", "order_status"],
  slots: ["slot_full", "low_slots"],
  summary: ["daily_summary"],
};

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function hrefFor(n: NotificationRow): string {
  if (n.orderId) return `/admin/orders#${n.orderId}`;
  if (n.type === "slot_full" || n.type === "low_slots") return "/admin/slots";
  if (n.type === "daily_summary") return "/admin/reports";
  return "/admin";
}

export function MobileNotifications({ open, onClose, onChanged }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(false);

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

  const timing = useActionTiming();
  useEffect(() => {
    if (open) {
      timing.start("alerts.view");
      load();
    } else {
      timing.stop("alerts.view");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, load]);

  const visible = items.filter((n) => {
    const types = TYPE_FILTERS[filter];
    if (!types) return true;
    return types.includes(n.type);
  });

  const unread = items.filter((n) => !n.read).length;

  const markRead = async (id: string) => {
    setItems((arr) => arr.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await fetch("/api/admin/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, read: true }),
    });
    onChanged?.();
  };

  const dismiss = async (id: string) => {
    setItems((arr) => arr.filter((n) => n.id !== id));
    await fetch(`/api/admin/notifications?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    onChanged?.();
  };

  const markAllRead = async () => {
    const ids = items.filter((n) => !n.read).map((n) => n.id);
    if (ids.length === 0) return;
    haptic("success");
    setItems((arr) => arr.map((n) => ({ ...n, read: true })));
    await Promise.all(
      ids.map((id) =>
        fetch("/api/admin/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, read: true }),
        }),
      ),
    );
    onChanged?.();
  };

  const handleOpen = (n: NotificationRow) => {
    if (!n.read) markRead(n.id);
    router.push(hrefFor(n));
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          Notifications
          {unread > 0 && (
            <span className="v2-m-pill v2-m-pill-brand">{unread} new</span>
          )}
        </span>
      }
      size="full"
      footer={
        <div className="v2-m-notif-footer">
          <button
            type="button"
            className="v2-m-btn v2-m-btn-ghost"
            onClick={() => load()}
            disabled={loading}
          >
            <RefreshCcw className="h-3.5 w-3.5" aria-hidden /> Refresh
          </button>
          <button
            type="button"
            className="v2-m-btn v2-m-btn-primary"
            onClick={markAllRead}
            disabled={unread === 0}
          >
            <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Mark all read
          </button>
        </div>
      }
    >
      <div className="v2-m-chip-strip" role="tablist" aria-label="Filter notifications">
        {(["all", "orders", "slots", "summary"] as Filter[]).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            className={`v2-m-chip ${filter === f ? "is-active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="v2-m-empty">
          <BellOff className="h-6 w-6" aria-hidden />
          <div className="v2-m-empty-title">All clear</div>
          <div className="v2-m-empty-desc">
            Nothing new in this filter. New events show up here in real time.
          </div>
        </div>
      ) : (
        <ul role="list" className="v2-m-notif-list">
          {visible.map((n) => (
            <li key={n.id}>
              <SwipeRow
                leftAction={{
                  label: "Dismiss",
                  tone: "danger",
                  onCommit: () => dismiss(n.id),
                }}
                rightAction={
                  !n.read
                    ? {
                        label: "Read",
                        tone: "info",
                        onCommit: () => markRead(n.id),
                      }
                    : undefined
                }
              >
                <button
                  type="button"
                  className={`v2-m-notif-row v2-m-notif-${n.type} ${n.read ? "" : "is-unread"}`}
                  onClick={() => handleOpen(n)}
                >
                  <span className="v2-m-notif-dot" aria-hidden />
                  <span className="v2-m-notif-stack">
                    <span className="v2-m-notif-title">{n.title}</span>
                    <span className="v2-m-notif-msg">{n.message}</span>
                  </span>
                  <span className="v2-m-notif-time">{relTime(n.createdAt)}</span>
                </button>
              </SwipeRow>
            </li>
          ))}
        </ul>
      )}
    </BottomSheet>
  );
}
