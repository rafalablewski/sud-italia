"use client";

import { AdminNav } from "./AdminNav";
import { useState, useEffect, useCallback } from "react";
import { locations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import { formatSlotDate } from "@/lib/format";
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingBag, Package,
  Truck, Clock, Bell, CheckCheck, ArrowRight, BarChart3,
  RefreshCw, MapPin, Users, XCircle, AlertTriangle, Layers,
  Activity, CalendarDays,
} from "lucide-react";
import Link from "next/link";
import type { Order } from "@/data/types";

const activeLocations = locations.filter((l) => l.isActive);

interface SummaryData {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  profitMargin: number;
  totalOrders: number;
  totalItems: number;
  avgOrderValue: number;
  takeoutCount: number;
  deliveryCount: number;
  dailyStats: { date: string; revenue: number; profit: number; orderCount: number }[];
  topItems: { name: string; quantity: number; revenue: number }[];
  categoryBreakdown: Record<string, { revenue: number; cost: number; count: number }>;
}

interface InsightsData {
  slotUtilization: { time: string; totalCapacity: number; totalUsed: number; utilization: number; slotCount: number }[];
  locationComparison: { locationSlug: string; city: string; revenue: number; profit: number; profitMargin: number; orderCount: number; avgOrderValue: number; totalItems: number; avgItemsPerOrder: number; takeoutCount: number; deliveryCount: number; cancelledCount: number; cancellationRate: number }[];
  repeatCustomers: { name: string; phone: string; orderCount: number; totalSpent: number; lastOrderDate: string }[];
  avgItemsPerOrder: number;
  worstSellers: { name: string; quantity: number; revenue: number }[];
  cancelledOrders: number;
  cancellationRate: number;
  peakHours: { hour: number; orderCount: number; revenue: number }[];
}

interface NotificationItem {
  id: string; type: string; title: string; message: string;
  locationSlug?: string; createdAt: string; read: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-300",
  confirmed: "bg-blue-500/20 text-blue-300",
  preparing: "bg-orange-500/20 text-orange-300",
  ready: "bg-green-500/20 text-green-300",
  completed: "bg-slate-500/20 text-slate-400",
};

const NOTIF_ICONS: Record<string, string> = {
  new_order: "bg-blue-500/20 text-blue-400",
  slot_full: "bg-orange-500/20 text-orange-400",
  daily_summary: "bg-green-500/20 text-green-400",
  low_slots: "bg-yellow-500/20 text-yellow-400",
  order_status: "bg-purple-500/20 text-purple-400",
};

function getDateRange(period: string): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().split("T")[0];
  const from = new Date(today);
  switch (period) {
    case "today": return { from: to, to };
    case "week": from.setDate(from.getDate() - 7); break;
    case "month": from.setDate(from.getDate() - 30); break;
    case "year": from.setFullYear(from.getFullYear() - 1); break;
  }
  return { from: from.toISOString().split("T")[0], to };
}

export function AdminDashboard() {
  const [period, setPeriod] = useState("week");
  const [location, setLocation] = useState("");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { from, to } = getDateRange(period);
    const locParam = location ? `&location=${location}` : "";
    try {
      const [summaryRes, insightsRes, ordersRes, notifsRes] = await Promise.all([
        fetch(`/api/admin/analytics?from=${from}&to=${to}${locParam}`),
        fetch(`/api/admin/insights?from=${from}&to=${to}`),
        fetch(`/api/admin/orders${location ? `?location=${location}` : ""}`),
        fetch("/api/admin/notifications"),
      ]);
      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (insightsRes.ok) setInsights(await insightsRes.json());
      if (ordersRes.ok) { const all = await ordersRes.json(); setOrders(all.slice(0, 10)); }
      if (notifsRes.ok) setNotifications(await notifsRes.json());
    } catch (err) { console.error("Dashboard fetch error:", err); }
    finally { setLoading(false); }
  }, [period, location]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const markAllRead = async () => {
    await fetch("/api/admin/notifications", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markAll: true }) });
    setNotifications((n) => n.map((x) => ({ ...x, read: true })));
  };

  const handleStatusChange = async (orderId: string, status: string) => {
    await fetch("/api/admin/orders", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, status }) });
    fetchAll();
  };

  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    if (!loading) setLastRefresh(new Date());
  }, [loading]);

  const maxRevenue = summary ? Math.max(...summary.dailyStats.map((d) => d.revenue), 1) : 1;
  const activeOrders = orders.filter((o) => o.status !== "completed");
  const unreadNotifs = notifications.filter((n) => !n.read);

  const periodLabel = period === "today" ? "Today" : period === "week" ? "Last 7 days" : period === "month" ? "Last 30 days" : "Last year";

  return (
    <>
      <AdminNav />
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold font-heading gradient-text">Dashboard</h1>
            <p className="text-xs admin-text-dim mt-1 flex items-center gap-2">
              <Activity className="h-3 w-3" />
              <span>{periodLabel}</span>
              <span className="text-white/20">·</span>
              <span>Updated {timeAgo(lastRefresh.toISOString())}</span>
              {activeOrders.length > 0 && (
                <>
                  <span className="text-white/20">·</span>
                  <span className="text-emerald-400 font-medium">{activeOrders.length} active order{activeOrders.length !== 1 ? "s" : ""}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 admin-text-dim" />
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="glass-input px-3 py-1.5 rounded-lg text-sm"
              >
                <option value="">All locations</option>
                {activeLocations.map((l) => (
                  <option key={l.slug} value={l.slug}>{l.city}</option>
                ))}
              </select>
            </div>
            <div className="flex glass rounded-lg overflow-hidden">
              {["today", "week", "month", "year"].map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                    period === p
                      ? "bg-white/15 text-white"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {p === "today" ? "Today" : p === "week" ? "7D" : p === "month" ? "30D" : "1Y"}
                </button>
              ))}
            </div>
            <button
              onClick={fetchAll}
              disabled={loading}
              className="p-2 rounded-lg glass text-slate-400 hover:text-white hover:bg-white/10 transition-all duration-200 disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* KPI Row 1 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard label="Revenue" value={summary ? formatPrice(summary.totalRevenue) : undefined} icon={<DollarSign className="h-4 w-4" />} iconColor="text-slate-400" loading={!summary} />
          <KPICard label="Profit" value={summary ? formatPrice(summary.totalProfit) : undefined} sub={summary ? `${summary.profitMargin}% margin` : undefined} icon={summary && summary.totalProfit >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />} iconColor={summary && summary.totalProfit >= 0 ? "text-emerald-400" : "text-red-400"} loading={!summary} />
          <KPICard label="Orders" value={summary ? summary.totalOrders.toString() : undefined} sub={summary ? `${summary.takeoutCount} takeout · ${summary.deliveryCount} delivery` : undefined} icon={<ShoppingBag className="h-4 w-4" />} iconColor="text-slate-400" loading={!summary} />
          <KPICard label="Avg Order" value={summary ? formatPrice(summary.avgOrderValue) : undefined} sub={insights ? `${insights.avgItemsPerOrder} items/order` : undefined} icon={<BarChart3 className="h-4 w-4" />} iconColor="text-slate-400" loading={!summary} />
        </div>

        {/* KPI Row 2 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard label="Repeat Customers" value={insights ? insights.repeatCustomers.length.toString() : undefined} icon={<Users className="h-4 w-4" />} iconColor="text-slate-400" loading={!insights} />
          <KPICard label="Items / Order" value={insights ? insights.avgItemsPerOrder.toString() : undefined} sub="basket size" icon={<Layers className="h-4 w-4" />} iconColor="text-slate-400" loading={!insights} />
          <KPICard label="Cancellation" value={insights ? `${insights.cancellationRate}%` : undefined} sub={insights ? `${insights.cancelledOrders} cancelled` : undefined} icon={<XCircle className="h-4 w-4" />} iconColor={insights && insights.cancellationRate > 10 ? "text-red-400" : "text-emerald-400"} loading={!insights} />
          <KPICard label="Worst Seller" value={insights ? (insights.worstSellers[0]?.name ?? "None") : undefined} sub={insights?.worstSellers[0] ? `${insights.worstSellers[0].quantity} sold` : undefined} icon={<AlertTriangle className="h-4 w-4" />} iconColor="text-slate-400" loading={!insights} />
        </div>

        {/* Live Orders + Notifications — operational priority, above fold */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold admin-text flex items-center gap-2">
                <span className="inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                Live Orders
                {activeOrders.length > 0 && (
                  <span className="ml-1 px-2 py-0.5 bg-italia-red/20 text-red-300 text-xs font-bold rounded">{activeOrders.length}</span>
                )}
              </h2>
              <Link href="/admin/orders" className="text-xs admin-link font-medium flex items-center gap-1 hover:text-red-200 transition-colors">
                All orders <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {activeOrders.length === 0 ? (
              <div className="py-8 text-center">
                <Clock className="h-8 w-8 mx-auto mb-2 admin-text-dim opacity-40" />
                <p className="text-sm admin-text-muted">No active orders right now</p>
                <p className="text-xs admin-text-dim mt-1">New orders will appear here automatically</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {activeOrders.map((order) => (
                  <div key={order.id} className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-white/4 border border-white/6 hover:bg-white/6 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-xs font-bold admin-text">{order.id}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_COLORS[order.status]}`}>{order.status}</span>
                      </div>
                      <p className="text-sm admin-text">{order.customerName}</p>
                      <div className="flex items-center gap-3 text-xs admin-text-dim mt-0.5">
                        <span className="flex items-center gap-1">{order.fulfillmentType === "delivery" ? <Truck className="h-3 w-3" /> : <Package className="h-3 w-3" />} {order.fulfillmentType}</span>
                        <span>{order.slotTime}</span>
                        <span className="font-semibold admin-text">{formatPrice(order.totalAmount)}</span>
                      </div>
                    </div>
                    <select value={order.status} onChange={(e) => handleStatusChange(order.id, e.target.value)} className="glass-input px-2 py-1 rounded-lg text-xs">
                      <option value="pending">pending</option>
                      <option value="confirmed">confirmed</option>
                      <option value="preparing">preparing</option>
                      <option value="ready">ready</option>
                      <option value="completed">completed</option>
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div id="notifications" className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold admin-text flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Notifications
                {unreadNotifs.length > 0 && (
                  <span className="px-2 py-0.5 bg-italia-red text-white text-xs font-bold rounded-full">{unreadNotifs.length}</span>
                )}
              </h2>
              {unreadNotifs.length > 0 && (
                <button onClick={markAllRead} className="text-xs admin-text-dim hover:text-white flex items-center gap-1 transition-colors">
                  <CheckCheck className="h-3 w-3" /> Mark all read
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <div className="py-8 text-center">
                <Bell className="h-8 w-8 mx-auto mb-2 admin-text-dim opacity-40" />
                <p className="text-sm admin-text-muted">All caught up</p>
                <p className="text-xs admin-text-dim mt-1">System alerts will show here</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {notifications.slice(0, 20).map((notif) => (
                  <div key={notif.id} className={`p-3 rounded-lg border transition-colors ${notif.read ? "bg-white/3 border-white/5" : "bg-blue-500/8 border-blue-500/15"}`}>
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${NOTIF_ICONS[notif.type] || "bg-white/8 admin-text-dim"}`}>
                        <Bell className="h-3 w-3" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold admin-text">{notif.title}</p>
                          <span className="text-[10px] admin-text-dim whitespace-nowrap flex-shrink-0">{timeAgo(notif.createdAt)}</span>
                        </div>
                        <p className="text-xs admin-text-dim mt-0.5">{notif.message}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Revenue chart */}
          <div className="lg:col-span-2 glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold admin-text">Revenue & Profit</h2>
                {summary && summary.dailyStats.length > 0 && (
                  <p className="text-xs admin-text-dim mt-0.5">{summary.dailyStats.length} day{summary.dailyStats.length !== 1 ? "s" : ""} of data</p>
                )}
              </div>
              <Link href="/admin/reports" className="text-xs admin-link font-medium flex items-center gap-1 hover:text-red-200 transition-colors">
                Full reports <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {summary && summary.dailyStats.length > 0 ? (
              <div className="flex items-end gap-1 h-40">
                {summary.dailyStats.slice(-14).map((day) => {
                  const pct = (day.revenue / maxRevenue) * 100;
                  const profitPct = (day.profit / maxRevenue) * 100;
                  return (
                    <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div className="w-full flex flex-col items-stretch" style={{ height: "128px" }}>
                        <div className="flex-1" />
                        <div
                          className="bg-italia-red/20 rounded-t-sm relative transition-all duration-300 group-hover:bg-italia-red/30"
                          style={{ height: `${pct}%`, minHeight: pct > 0 ? "2px" : "0" }}
                        >
                          <div
                            className="absolute bottom-0 left-0 right-0 bg-emerald-500/40 rounded-t-sm"
                            style={{ height: `${(profitPct / pct) * 100}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-[9px] admin-text-dim">{day.date.slice(8)}</span>
                      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 glass-light text-white text-[10px] rounded-lg px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                        <div className="font-semibold">{formatSlotDate(day.date)}</div>
                        <div>Rev: {formatPrice(day.revenue)}</div>
                        <div>Profit: {formatPrice(day.profit)}</div>
                        <div>{day.orderCount} orders</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : !summary ? (
              <div className="h-40 flex items-end gap-1">
                {Array.from({ length: 14 }).map((_, i) => (
                  <div key={i} className="flex-1 bg-white/5 rounded-t-sm animate-pulse" style={{ height: `${20 + Math.random() * 60}%` }} />
                ))}
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center">
                <div className="text-center">
                  <BarChart3 className="h-8 w-8 mx-auto mb-2 admin-text-dim opacity-40" />
                  <p className="text-sm admin-text-muted">No revenue data for this period</p>
                  <p className="text-xs admin-text-dim mt-1">Try selecting a wider date range</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-4 mt-3 text-xs admin-text-dim">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-italia-red/20" /> Revenue</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500/40" /> Profit</span>
            </div>
          </div>

          {/* Top Sellers */}
          <div className="glass-card p-5">
            <h2 className="font-bold admin-text mb-4">Top Sellers</h2>
            {summary && summary.topItems.length > 0 ? (
              <div className="space-y-3">
                {summary.topItems.slice(0, 6).map((item, i) => (
                  <div key={item.name} className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${
                      i === 0 ? "bg-amber-500/25 text-amber-300" : i < 3 ? "bg-amber-500/15 text-amber-400" : "bg-white/8 admin-text-dim"
                    }`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium admin-text truncate ${i === 0 ? "font-semibold" : ""}`}>{item.name}</p>
                      <p className="text-xs admin-text-dim">{item.quantity} sold</p>
                    </div>
                    <span className="text-sm font-semibold admin-text">{formatPrice(item.revenue)}</span>
                  </div>
                ))}
              </div>
            ) : !summary ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-md bg-white/8 animate-pulse" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-4 w-28 bg-white/8 rounded animate-pulse" />
                      <div className="h-3 w-16 bg-white/5 rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center">
                <p className="text-sm admin-text-muted">No sales data yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Slot Utilization + Peak Hours */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold admin-text">Slot Utilization</h2>
              <Link href="/admin/slots" className="text-xs admin-link font-medium flex items-center gap-1 hover:text-red-200 transition-colors">
                Manage slots <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <p className="text-xs admin-text-dim mb-4">Fill rate per time slot</p>
            {insights && insights.slotUtilization.length > 0 ? (
              <div className="space-y-2">
                {insights.slotUtilization.map((slot) => (
                  <div key={slot.time} className="flex items-center gap-3">
                    <span className="w-12 text-sm font-mono font-semibold admin-text">{slot.time}</span>
                    <div className="flex-1 h-6 bg-white/5 rounded-full overflow-hidden relative">
                      <div className={`h-full rounded-full transition-all duration-500 ${slot.utilization >= 80 ? "bg-red-500/60" : slot.utilization >= 50 ? "bg-amber-500/60" : "bg-emerald-500/60"}`} style={{ width: `${slot.utilization}%` }} />
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold admin-text">{slot.totalUsed}/{slot.totalCapacity}</span>
                    </div>
                    <span className={`w-10 text-right text-xs font-bold ${slot.utilization >= 80 ? "text-red-400" : slot.utilization >= 50 ? "text-amber-400" : "text-emerald-400"}`}>{slot.utilization}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center">
                <CalendarDays className="h-8 w-8 mx-auto mb-2 admin-text-dim opacity-40" />
                <p className="text-sm admin-text-muted">No active slots</p>
                <p className="text-xs admin-text-dim mt-1">Configure time slots in Slot management</p>
              </div>
            )}
          </div>

          <div className="glass-card p-5">
            <h2 className="font-bold admin-text mb-1">Peak Hours</h2>
            <p className="text-xs admin-text-dim mb-4">Orders by hour of day</p>
            {insights && insights.peakHours.length > 0 ? (
              <div className="space-y-2">
                {(() => {
                  const max = Math.max(...insights.peakHours.map((h) => h.orderCount), 1);
                  return insights.peakHours.map((h) => (
                    <div key={h.hour} className="flex items-center gap-3">
                      <span className="w-12 text-sm font-mono font-semibold admin-text">{String(h.hour).padStart(2, "0")}:00</span>
                      <div className="flex-1 h-6 bg-white/5 rounded-full overflow-hidden relative">
                        <div className="h-full rounded-full bg-blue-500/50 transition-all duration-500" style={{ width: `${(h.orderCount / max) * 100}%` }} />
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold admin-text">{h.orderCount} orders</span>
                      </div>
                      <span className="w-20 text-right text-xs font-semibold admin-text">{formatPrice(h.revenue)}</span>
                    </div>
                  ));
                })()}
              </div>
            ) : (
              <div className="py-4 text-center">
                <Clock className="h-8 w-8 mx-auto mb-2 admin-text-dim opacity-40" />
                <p className="text-sm admin-text-muted">No order data yet</p>
                <p className="text-xs admin-text-dim mt-1">Peak hours appear after orders come in</p>
              </div>
            )}
          </div>
        </div>

        {/* Location Comparison */}
        {insights && insights.locationComparison.length > 0 && (
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold admin-text">Location Comparison</h2>
              <span className="text-xs admin-text-dim">{insights.locationComparison.length} location{insights.locationComparison.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8">
                    <th className="text-left py-2 pr-4 font-semibold admin-text-dim text-xs uppercase tracking-wider">Location</th>
                    <th className="text-right py-2 px-3 font-semibold admin-text-dim text-xs uppercase tracking-wider">Revenue</th>
                    <th className="text-right py-2 px-3 font-semibold admin-text-dim text-xs uppercase tracking-wider">Profit</th>
                    <th className="text-right py-2 px-3 font-semibold admin-text-dim text-xs uppercase tracking-wider">Margin</th>
                    <th className="text-right py-2 px-3 font-semibold admin-text-dim text-xs uppercase tracking-wider">Orders</th>
                    <th className="text-right py-2 px-3 font-semibold admin-text-dim text-xs uppercase tracking-wider">Avg Order</th>
                    <th className="text-center py-2 px-3 font-semibold admin-text-dim text-xs uppercase tracking-wider">T / D</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.locationComparison.map((loc) => {
                    const best = insights.locationComparison.reduce((a, b) => a.revenue > b.revenue ? a : b);
                    return (
                      <tr key={loc.locationSlug} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 admin-red" />
                            <span className="font-semibold admin-text">{loc.city}</span>
                            {loc.locationSlug === best.locationSlug && loc.revenue > 0 && (
                              <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] font-bold rounded-full">TOP</span>
                            )}
                          </div>
                        </td>
                        <td className="text-right py-3 px-3 font-semibold admin-text">{formatPrice(loc.revenue)}</td>
                        <td className={`text-right py-3 px-3 font-semibold ${loc.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatPrice(loc.profit)}</td>
                        <td className="text-right py-3 px-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${loc.profitMargin >= 65 ? "bg-emerald-500/20 text-emerald-400" : loc.profitMargin >= 50 ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400"}`}>{loc.profitMargin}%</span>
                        </td>
                        <td className="text-right py-3 px-3 admin-text">{loc.orderCount}</td>
                        <td className="text-right py-3 px-3 admin-text">{formatPrice(loc.avgOrderValue)}</td>
                        <td className="text-center py-3 px-3 text-xs admin-text-dim">{loc.takeoutCount} / {loc.deliveryCount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Repeat Customers + Worst Sellers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold admin-text">Repeat Customers</h2>
              <Link href="/admin/loyalty" className="text-xs admin-link font-medium flex items-center gap-1 hover:text-red-200 transition-colors">
                Loyalty <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <p className="text-xs admin-text-dim mb-4">Ordered more than once</p>
            {insights && insights.repeatCustomers.length > 0 ? (
              <div className="space-y-3">
                {insights.repeatCustomers.slice(0, 8).map((c, i) => (
                  <div key={c.phone} className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${i < 3 ? "bg-amber-500/20 text-amber-400" : "bg-white/8 admin-text-dim"}`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium admin-text truncate">{c.name}</p>
                      <p className="text-xs admin-text-dim">{c.orderCount} orders</p>
                    </div>
                    <span className="text-sm font-semibold admin-text">{formatPrice(c.totalSpent)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center">
                <Users className="h-8 w-8 mx-auto mb-2 admin-text-dim opacity-40" />
                <p className="text-sm admin-text-muted">No repeat customers yet</p>
                <p className="text-xs admin-text-dim mt-1">Customers who order again will appear here</p>
              </div>
            )}
          </div>

          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold admin-text">Worst Sellers</h2>
              <Link href="/admin/menu" className="text-xs admin-link font-medium flex items-center gap-1 hover:text-red-200 transition-colors">
                Edit menu <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <p className="text-xs admin-text-dim mb-4">Consider removing or promoting</p>
            {insights && insights.worstSellers.length > 0 ? (
              <div className="space-y-3">
                {insights.worstSellers.map((item, i) => {
                  const maxQty = insights.worstSellers[insights.worstSellers.length - 1]?.quantity || 1;
                  return (
                    <div key={item.name} className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-md bg-red-500/15 flex items-center justify-center text-xs font-bold text-red-400">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium admin-text truncate">{item.name}</span>
                          <span className="text-sm font-semibold admin-text ml-2">{formatPrice(item.revenue)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-red-500/40 rounded-full" style={{ width: `${(item.quantity / maxQty) * 100}%` }} />
                          </div>
                          <span className="text-xs admin-text-dim">{item.quantity} sold</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-4 text-center">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 admin-text-dim opacity-40" />
                <p className="text-sm admin-text-muted">No sales data yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Category Breakdown */}
        {summary && Object.keys(summary.categoryBreakdown).length > 0 && (
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold admin-text">Revenue by Category</h2>
              <span className="text-xs admin-text-dim">{Object.keys(summary.categoryBreakdown).length} categories</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {Object.entries(summary.categoryBreakdown)
                .sort(([, a], [, b]) => b.revenue - a.revenue)
                .map(([cat, data], i) => {
                  const margin = data.revenue > 0 ? Math.round(((data.revenue - data.cost) / data.revenue) * 100) : 0;
                  return (
                    <div key={cat} className={`p-3 rounded-lg hover:bg-white/8 transition-colors ${i === 0 ? "bg-white/8 border border-white/10" : "bg-white/5"}`}>
                      <p className="text-xs font-semibold admin-text-dim uppercase tracking-wide">{cat}</p>
                      <p className="text-lg font-bold admin-text mt-1">{formatPrice(data.revenue)}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs admin-text-dim">{data.count} items</span>
                        <span className={`text-xs font-semibold ${margin >= 65 ? "text-emerald-400" : margin >= 50 ? "text-amber-400" : "text-red-400"}`}>{margin}%</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function KPICard({ label, value, sub, icon, iconColor, loading }: {
  label: string; value?: string; sub?: string; icon: React.ReactNode;
  gradient?: string; iconColor: string; loading?: boolean;
}) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2.5 mb-2">
        <span className={`w-8 h-8 rounded-md flex items-center justify-center bg-white/6 ${iconColor}`}>
          {icon}
        </span>
        <span className="text-[11px] font-semibold admin-text-dim uppercase tracking-wider">{label}</span>
      </div>
      {loading || !value ? (
        <div className="space-y-1.5">
          <div className="h-6 w-24 bg-white/8 rounded animate-pulse" />
          <div className="h-3.5 w-16 bg-white/5 rounded animate-pulse" />
        </div>
      ) : (
        <>
          <p className="text-xl font-bold admin-text">{value}</p>
          {sub && <p className="text-xs admin-text-dim mt-0.5">{sub}</p>}
        </>
      )}
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
