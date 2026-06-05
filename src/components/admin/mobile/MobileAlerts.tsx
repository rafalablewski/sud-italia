"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminBase } from "../v2/useAdminBase";
import { withAdminBase } from "@/lib/admin-base";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import {
  Chip,
  ChipStrip,
  MobilePage,
  PageHeader,
  PullToRefresh,
} from "../v2/mobile";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  locationSlug?: string;
  orderId?: string;
  createdAt: string;
  read: boolean;
}

type Filter = "unread" | "all" | "orders" | "slots" | "stock" | "money";

const FILTERS: { value: Filter; label: string; match: (n: NotificationItem) => boolean }[] = [
  { value: "unread", label: "Unread", match: (n) => !n.read },
  { value: "all", label: "All", match: () => true },
  {
    value: "orders",
    label: "Orders",
    match: (n) => n.type === "new_order" || n.type === "order_status" || n.type === "dispute",
  },
  {
    value: "slots",
    label: "Slots",
    match: (n) => n.type === "slot_full" || n.type === "low_slots",
  },
  { value: "stock", label: "Stock", match: (n) => n.type === "low_stock" },
  {
    value: "money",
    label: "Money",
    match: (n) =>
      n.type === "dispute" ||
      n.type === "bundle_low_margin" ||
      n.type === "daily_summary",
  },
];

function toneFor(type: string): "info" | "success" | "warning" | "danger" | "brand" | "neutral" {
  if (type === "new_order" || type === "order_status") return "info";
  if (type === "slot_full" || type === "low_slots") return "warning";
  if (type === "dispute") return "danger";
  if (type === "daily_summary") return "success";
  if (type === "low_stock") return "warning";
  if (type === "bundle_low_margin") return "warning";
  return "neutral";
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

function hrefFor(n: NotificationItem): string {
  if (n.orderId) return `/admin/orders#${n.orderId}`;
  if (n.type === "slot_full" || n.type === "low_slots") return "/core/service/slots";
  if (n.type === "daily_summary") return "/admin/reports";
  if (n.type === "low_stock") return "/admin/inventory";
  return "/admin";
}

/**
 * Full-screen alerts view — replaces the 4-row preview on Home with the
 * complete action queue, grouped by recency. Filter chips, mark-all-
 * read, and tap-to-jump. Reachable from Home → "View all alerts" and
 * from anywhere by long-pressing the topbar bell.
 */
export function MobileAlerts() {
  const router = useRouter();
  const base = useAdminBase();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<Filter>("unread");

  const refresh = async () => {
    const r = await fetch("/api/admin/notifications");
    if (!r.ok) return;
    const data = (await r.json()) as NotificationItem[];
    setItems(Array.isArray(data) ? data : []);
  };

  useEffect(() => { refresh(); }, []);

  const matcher = FILTERS.find((f) => f.value === filter)?.match ?? (() => true);
  const filtered = useMemo(
    () =>
      items
        .filter(matcher)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [items, matcher],
  );

  const counts = useMemo(() => {
    const out: Partial<Record<Filter, number>> = {};
    for (const f of FILTERS) out[f.value] = items.filter(f.match).length;
    return out;
  }, [items]);

  const markRead = async (id: string) => {
    setItems((arr) => arr.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await fetch("/api/admin/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, read: true }),
    });
  };

  const markAllRead = async () => {
    const unread = items.filter((n) => !n.read);
    setItems((arr) => arr.map((n) => ({ ...n, read: true })));
    await Promise.all(
      unread.map((n) =>
        fetch("/api/admin/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: n.id, read: true }),
        }),
      ),
    );
  };

  const open = (n: NotificationItem) => {
    if (!n.read) markRead(n.id);
    router.push(withAdminBase(base, hrefFor(n)));
  };

  // Bucket by "today" / "yesterday" / "older" for sectioned scanning.
  const buckets = useMemo(() => {
    const today: NotificationItem[] = [];
    const yesterday: NotificationItem[] = [];
    const older: NotificationItem[] = [];
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    for (const n of filtered) {
      const at = new Date(n.createdAt);
      if (at >= todayStart) today.push(n);
      else if (at >= yesterdayStart) yesterday.push(n);
      else older.push(n);
    }
    return { today, yesterday, older };
  }, [filtered]);

  const totalUnread = items.filter((n) => !n.read).length;

  return (
    <PullToRefresh onRefresh={refresh}>
      <MobilePage
        toolbar={
          <ChipStrip ariaLabel="Filter">
            {FILTERS.map((f) => (
              <Chip
                key={f.value}
                label={f.label}
                active={filter === f.value}
                count={counts[f.value] ?? 0}
                onClick={() => setFilter(f.value)}
              />
            ))}
          </ChipStrip>
        }
      >
        <PageHeader
          title="Alerts"
          subtitle={`${totalUnread} unread of ${items.length}`}
          actions={
            totalUnread > 0 ? (
              <button
                type="button"
                className="v2-m-btn v2-m-btn-ghost"
                style={{ minHeight: 32, padding: "0 10px" }}
                onClick={markAllRead}
                aria-label="Mark all read"
                title="Mark all read"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null
          }
        />

        {filtered.length === 0 ? (
          <div className="v2-m-empty">
            <Bell className="h-6 w-6" aria-hidden />
            <div className="v2-m-empty-title">All clear</div>
            <div className="v2-m-empty-desc">No alerts in this filter.</div>
          </div>
        ) : (
          <>
            {buckets.today.length > 0 && (
              <Bucket title="Today" items={buckets.today} onOpen={open} />
            )}
            {buckets.yesterday.length > 0 && (
              <Bucket title="Yesterday" items={buckets.yesterday} onOpen={open} />
            )}
            {buckets.older.length > 0 && (
              <Bucket title="Earlier" items={buckets.older} onOpen={open} />
            )}
          </>
        )}
      </MobilePage>
    </PullToRefresh>
  );
}

function Bucket({
  title,
  items,
  onOpen,
}: {
  title: string;
  items: NotificationItem[];
  onOpen: (n: NotificationItem) => void;
}) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <h3
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 0.06,
          textTransform: "uppercase",
          color: "var(--fg-subtle)",
          margin: 0,
          padding: "4px 4px 0",
        }}
      >
        {title}
      </h3>
      <ul role="list" className="v2-m-list">
        {items.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              className={`v2-m-list-row ${n.read ? "" : "v2-m-notif-row is-unread"}`}
              onClick={() => onOpen(n)}
            >
              <span className={`v2-m-list-icon v2-m-tone-${toneFor(n.type)}`}>
                {n.type === "dispute" || n.type === "low_stock" ? (
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                ) : n.type === "daily_summary" ? (
                  <Sparkles className="h-4 w-4" aria-hidden />
                ) : (
                  <Bell className="h-4 w-4" aria-hidden />
                )}
              </span>
              <span className="v2-m-list-stack">
                <span className="v2-m-list-title">{n.title}</span>
                <span className="v2-m-list-sub">{n.message}</span>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: "var(--fg-subtle)" }} className="tabular">
                  {relTime(n.createdAt)}
                </span>
                <ChevronRight className="v2-m-list-chev" aria-hidden />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
