"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, CheckCircle2, ChevronRight, Sparkles } from "lucide-react";
import { Button, SkeletonRows } from "./ui";

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
  { value: "orders", label: "Orders", match: (n) => n.type === "new_order" || n.type === "order_status" || n.type === "dispute" },
  { value: "slots", label: "Slots", match: (n) => n.type === "slot_full" || n.type === "low_slots" },
  { value: "stock", label: "Stock", match: (n) => n.type === "low_stock" },
  { value: "money", label: "Money", match: (n) => n.type === "dispute" || n.type === "bundle_low_margin" || n.type === "daily_summary" },
];

type Tone = "ok" | "warn" | "bad" | "info" | "neutral";
function toneFor(type: string): Tone {
  if (type === "new_order" || type === "order_status") return "info";
  if (type === "slot_full" || type === "low_slots") return "warn";
  if (type === "dispute") return "bad";
  if (type === "daily_summary") return "ok";
  if (type === "low_stock" || type === "bundle_low_margin") return "warn";
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

// Tap-to-jump — routes into the canonical /admin HQ.
function hrefFor(n: NotificationItem): string {
  if (n.orderId) return `/admin/orders`;
  if (n.type === "slot_full" || n.type === "low_slots") return "/core/service/slots";
  if (n.type === "daily_summary") return "/admin/reports";
  if (n.type === "low_stock") return "/admin/inventory";
  return "/admin";
}

function IconFor({ type }: { type: string }) {
  if (type === "dispute" || type === "low_stock") return <AlertTriangle aria-hidden />;
  if (type === "daily_summary") return <Sparkles aria-hidden />;
  return <Bell aria-hidden />;
}

/**
 * Alerts inbox — the v3 home for the v2 `MobileAlerts` action queue. Full-screen
 * list over `/api/admin/notifications`: filter chips with live counts, recency
 * buckets (Today / Yesterday / Earlier), per-type tone + icon, mark-read /
 * mark-all-read, and tap-to-jump to the relevant surface.
 */
export function AlertsV3() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("unread");

  const load = useCallback(async () => {
    const data = await fetch("/api/admin/notifications").then((r) => (r.ok ? r.json() : [])).catch(() => []);
    setItems(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const out: Partial<Record<Filter, number>> = {};
    for (const f of FILTERS) out[f.value] = items.filter(f.match).length;
    return out;
  }, [items]);

  const filtered = useMemo(() => {
    const matcher = FILTERS.find((f) => f.value === filter)?.match ?? (() => true);
    return items.filter(matcher).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [items, filter]);

  const buckets = useMemo(() => {
    const today: NotificationItem[] = [], yesterday: NotificationItem[] = [], older: NotificationItem[] = [];
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    for (const n of filtered) {
      const at = new Date(n.createdAt);
      if (at >= todayStart) today.push(n);
      else if (at >= yesterdayStart) yesterday.push(n);
      else older.push(n);
    }
    return [
      { title: "Today", rows: today },
      { title: "Yesterday", rows: yesterday },
      { title: "Earlier", rows: older },
    ].filter((b) => b.rows.length > 0);
  }, [filtered]);

  const totalUnread = items.filter((n) => !n.read).length;

  const markRead = async (id: string) => {
    setItems((arr) => arr.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await fetch("/api/admin/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, read: true }) }).catch(() => {});
  };
  const markAllRead = async () => {
    const unread = items.filter((n) => !n.read);
    setItems((arr) => arr.map((n) => ({ ...n, read: true })));
    await Promise.all(unread.map((n) => fetch("/api/admin/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: n.id, read: true }) }).catch(() => {})));
  };
  const open = (n: NotificationItem) => {
    if (!n.read) markRead(n.id);
    router.push(hrefFor(n));
  };

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Alerts</h1>
          <div className="av3-pagehead-sub">{totalUnread} unread of {items.length} · the full action queue</div>
        </div>
        <div className="av3-pagehead-actions">
          {totalUnread > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead}><CheckCircle2 className="av3-btn-ico" /> Mark all read</Button>
          )}
        </div>
      </div>

      <div className="av3-filterchips">
        {FILTERS.map((f) => (
          <button key={f.value} type="button" className={`av3-fchip ${filter === f.value ? "is-active" : ""}`} onClick={() => setFilter(f.value)}>
            {f.label}<span className="av3-fchip-count">{counts[f.value] ?? 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={6} /></div>
      ) : filtered.length === 0 ? (
        <div className="av3-card" style={{ padding: 0 }}>
          <div className="av3-empty"><Bell aria-hidden /><div className="av3-empty-title">All clear</div><div className="av3-empty-text">No alerts in this filter.</div></div>
        </div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {buckets.map((b) => (
            <section key={b.title}>
              <div className="av3-alert-sect-h">{b.title}</div>
              <div className="av3-alert-list">
                {b.rows.map((n) => (
                  <button key={n.id} type="button" className="av3-alert-row" data-unread={!n.read} onClick={() => open(n)}>
                    <span className="av3-alert-ico" data-tone={toneFor(n.type)}><IconFor type={n.type} /></span>
                    <span className="av3-alert-body">
                      <span className="av3-alert-title">{n.title}</span>
                      <span className="av3-alert-msg">{n.message}</span>
                    </span>
                    <span className="av3-alert-meta">
                      {n.locationSlug && <span className="av3-alert-loc">{n.locationSlug}</span>}
                      <span className="av3-alert-time">{relTime(n.createdAt)}</span>
                      {!n.read && <span className="av3-alert-dot" aria-hidden />}
                      <ChevronRight className="av3-alert-chev" aria-hidden />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
