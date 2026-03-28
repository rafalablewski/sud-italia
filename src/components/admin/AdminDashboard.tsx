"use client";

import { AdminNav } from "./AdminNav";
import { useState, useEffect, useCallback } from "react";
import { locations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import { formatSlotDate } from "@/lib/format";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingBag,
  Package,
  Truck,
  Clock,
  Bell,
  CheckCheck,
  ArrowRight,
  BarChart3,
  RefreshCw,
  MapPin,
  Users,
  XCircle,
  AlertTriangle,
  Layers,
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
  dailyStats: {
    date: string;
    revenue: number;
    profit: number;
    orderCount: number;
  }[];
  topItems: { name: string; quantity: number; revenue: number }[];
  categoryBreakdown: Record<string, { revenue: number; cost: number; count: number }>;
}

interface InsightsData {
  slotUtilization: {
    time: string;
    totalCapacity: number;
    totalUsed: number;
    utilization: number;
    slotCount: number;
  }[];
  locationComparison: {
    locationSlug: string;
    city: string;
    revenue: number;
    profit: number;
    profitMargin: number;
    orderCount: number;
    avgOrderValue: number;
    totalItems: number;
    avgItemsPerOrder: number;
    takeoutCount: number;
    deliveryCount: number;
    cancelledCount: number;
    cancellationRate: number;
  }[];
  repeatCustomers: {
    name: string;
    phone: string;
    orderCount: number;
    totalSpent: number;
    lastOrderDate: string;
  }[];
  avgItemsPerOrder: number;
  worstSellers: { name: string; quantity: number; revenue: number }[];
  cancelledOrders: number;
  cancellationRate: number;
  peakHours: { hour: number; orderCount: number; revenue: number }[];
}

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  locationSlug?: string;
  createdAt: string;
  read: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  preparing: "bg-orange-100 text-orange-800",
  ready: "bg-green-100 text-green-800",
  completed: "bg-gray-100 text-gray-600",
};

const NOTIF_ICONS: Record<string, string> = {
  new_order: "bg-blue-100 text-blue-600",
  slot_full: "bg-orange-100 text-orange-600",
  daily_summary: "bg-green-100 text-green-600",
  low_slots: "bg-yellow-100 text-yellow-600",
  order_status: "bg-purple-100 text-purple-600",
};

function getDateRange(period: string): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().split("T")[0];
  const from = new Date(today);

  switch (period) {
    case "today":
      return { from: to, to };
    case "week":
      from.setDate(from.getDate() - 7);
      break;
    case "month":
      from.setDate(from.getDate() - 30);
      break;
    case "year":
      from.setFullYear(from.getFullYear() - 1);
      break;
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
      if (ordersRes.ok) {
        const allOrders = await ordersRes.json();
        setOrders(allOrders.slice(0, 10));
      }
      if (notifsRes.ok) setNotifications(await notifsRes.json());
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [period, location]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const markAllRead = async () => {
    await fetch("/api/admin/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
    setNotifications((n) => n.map((x) => ({ ...x, read: true })));
  };

  const handleStatusChange = async (orderId: string, status: string) => {
    await fetch("/api/admin/orders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, status }),
    });
    fetchAll();
  };

  const maxRevenue = summary
    ? Math.max(...summary.dailyStats.map((d) => d.revenue), 1)
    : 1;

  const activeOrders = orders.filter((o) => o.status !== "completed");
  const unreadNotifs = notifications.filter((n) => !n.read);

  return (
    <>
      <AdminNav />
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold font-heading text-italia-dark">
            Dashboard
          </h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-italia-gray" />
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
              >
                <option value="">All locations</option>
                {activeLocations.map((l) => (
                  <option key={l.slug} value={l.slug}>{l.city}</option>
                ))}
              </select>
            </div>
            <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden">
              {["today", "week", "month", "year"].map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    period === p
                      ? "bg-italia-red text-white"
                      : "text-italia-gray hover:bg-gray-50"
                  }`}
                >
                  {p === "today" ? "Today" : p === "week" ? "7D" : p === "month" ? "30D" : "1Y"}
                </button>
              ))}
            </div>
            <button
              onClick={fetchAll}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 text-italia-gray ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* KPI Cards — row 1 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Revenue"
            value={summary ? formatPrice(summary.totalRevenue) : "—"}
            icon={<DollarSign className="h-5 w-5" />}
            color="green"
          />
          <KPICard
            label="Profit"
            value={summary ? formatPrice(summary.totalProfit) : "—"}
            sub={summary ? `${summary.profitMargin}% margin` : undefined}
            icon={summary && summary.totalProfit >= 0
              ? <TrendingUp className="h-5 w-5" />
              : <TrendingDown className="h-5 w-5" />}
            color={summary && summary.totalProfit >= 0 ? "green" : "red"}
          />
          <KPICard
            label="Orders"
            value={summary ? summary.totalOrders.toString() : "—"}
            sub={summary ? `${summary.takeoutCount} takeout / ${summary.deliveryCount} delivery` : undefined}
            icon={<ShoppingBag className="h-5 w-5" />}
            color="blue"
          />
          <KPICard
            label="Avg Order"
            value={summary ? formatPrice(summary.avgOrderValue) : "—"}
            sub={insights ? `${insights.avgItemsPerOrder} items/order` : undefined}
            icon={<BarChart3 className="h-5 w-5" />}
            color="gold"
          />
        </div>

        {/* KPI Cards — row 2 (new) */}
        {insights && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              label="Repeat Customers"
              value={insights.repeatCustomers.length.toString()}
              sub={`out of all customers`}
              icon={<Users className="h-5 w-5" />}
              color="blue"
            />
            <KPICard
              label="Items / Order"
              value={insights.avgItemsPerOrder.toString()}
              sub="avg across all orders"
              icon={<Layers className="h-5 w-5" />}
              color="gold"
            />
            <KPICard
              label="Cancellation Rate"
              value={`${insights.cancellationRate}%`}
              sub={`${insights.cancelledOrders} stuck in pending`}
              icon={<XCircle className="h-5 w-5" />}
              color={insights.cancellationRate > 10 ? "red" : "green"}
            />
            <KPICard
              label="Worst Seller"
              value={insights.worstSellers[0]?.name ?? "—"}
              sub={insights.worstSellers[0] ? `${insights.worstSellers[0].quantity} sold` : undefined}
              icon={<AlertTriangle className="h-5 w-5" />}
              color="red"
            />
          </div>
        )}

        {/* Revenue chart + Top items */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-italia-dark">Revenue & Profit</h2>
              <Link href="/admin/reports" className="text-xs text-italia-red font-medium flex items-center gap-1 hover:underline">
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
                          className="bg-italia-red/15 rounded-t-sm relative"
                          style={{ height: `${pct}%`, minHeight: pct > 0 ? "2px" : "0" }}
                        >
                          <div
                            className="absolute bottom-0 left-0 right-0 bg-italia-green/60 rounded-t-sm"
                            style={{ height: `${(profitPct / pct) * 100}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-[9px] text-italia-gray">{day.date.slice(8)}</span>
                      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-italia-dark text-white text-[10px] rounded-lg px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                        <div>{formatSlotDate(day.date)}</div>
                        <div>Rev: {formatPrice(day.revenue)}</div>
                        <div>Profit: {formatPrice(day.profit)}</div>
                        <div>{day.orderCount} orders</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-sm text-italia-gray">
                No data for this period
              </div>
            )}
            <div className="flex items-center gap-4 mt-3 text-xs text-italia-gray">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-italia-red/15" /> Revenue
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-italia-green/60" /> Profit
              </span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h2 className="font-bold text-italia-dark mb-4">Top Sellers</h2>
            {summary && summary.topItems.length > 0 ? (
              <div className="space-y-3">
                {summary.topItems.slice(0, 6).map((item, i) => (
                  <div key={item.name} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-italia-cream flex items-center justify-center text-xs font-bold text-italia-dark">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-italia-dark truncate">{item.name}</p>
                      <p className="text-xs text-italia-gray">{item.quantity} sold</p>
                    </div>
                    <span className="text-sm font-semibold text-italia-dark">
                      {formatPrice(item.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-italia-gray">No data yet</p>
            )}
          </div>
        </div>

        {/* Slot Utilization + Peak Hours */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Slot Utilization */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h2 className="font-bold text-italia-dark mb-1">Slot Utilization</h2>
            <p className="text-xs text-italia-gray mb-4">How full each time slot gets on average</p>
            {insights && insights.slotUtilization.length > 0 ? (
              <div className="space-y-2">
                {insights.slotUtilization.map((slot) => (
                  <div key={slot.time} className="flex items-center gap-3">
                    <span className="w-12 text-sm font-mono font-semibold text-italia-dark">
                      {slot.time}
                    </span>
                    <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden relative">
                      <div
                        className={`h-full rounded-full transition-all ${
                          slot.utilization >= 80
                            ? "bg-italia-red"
                            : slot.utilization >= 50
                              ? "bg-italia-gold"
                              : "bg-italia-green"
                        }`}
                        style={{ width: `${slot.utilization}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-italia-dark">
                        {slot.totalUsed}/{slot.totalCapacity}
                      </span>
                    </div>
                    <span className={`w-10 text-right text-xs font-bold ${
                      slot.utilization >= 80
                        ? "text-italia-red"
                        : slot.utilization >= 50
                          ? "text-italia-gold-dark"
                          : "text-italia-green"
                    }`}>
                      {slot.utilization}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-italia-gray py-4 text-center">No active slots in this period. Create and confirm slots to see utilization data.</p>
            )}
          </div>

          {/* Peak Hours */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h2 className="font-bold text-italia-dark mb-1">Peak Hours</h2>
            <p className="text-xs text-italia-gray mb-4">Orders and revenue by hour of day</p>
            {insights && insights.peakHours.length > 0 ? (
              <div className="space-y-2">
                {(() => {
                  const maxOrders = Math.max(...insights.peakHours.map((h) => h.orderCount), 1);
                  return insights.peakHours.map((h) => {
                    const pct = (h.orderCount / maxOrders) * 100;
                    return (
                      <div key={h.hour} className="flex items-center gap-3">
                        <span className="w-12 text-sm font-mono font-semibold text-italia-dark">
                          {String(h.hour).padStart(2, "0")}:00
                        </span>
                        <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden relative">
                          <div
                            className="h-full rounded-full bg-blue-400"
                            style={{ width: `${pct}%` }}
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-italia-dark">
                            {h.orderCount} orders
                          </span>
                        </div>
                        <span className="w-20 text-right text-xs font-semibold text-italia-dark">
                          {formatPrice(h.revenue)}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
            ) : (
              <p className="text-sm text-italia-gray py-4 text-center">No orders yet. Peak hours will appear once customers start ordering.</p>
            )}
          </div>
        </div>

        {/* Location Comparison */}
        {insights && insights.locationComparison.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h2 className="font-bold text-italia-dark mb-4">Location Comparison</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-4 font-semibold text-italia-gray">Location</th>
                    <th className="text-right py-2 px-3 font-semibold text-italia-gray">Revenue</th>
                    <th className="text-right py-2 px-3 font-semibold text-italia-gray">Profit</th>
                    <th className="text-right py-2 px-3 font-semibold text-italia-gray">Margin</th>
                    <th className="text-right py-2 px-3 font-semibold text-italia-gray">Orders</th>
                    <th className="text-right py-2 px-3 font-semibold text-italia-gray">Avg Order</th>
                    <th className="text-right py-2 px-3 font-semibold text-italia-gray">Items/Order</th>
                    <th className="text-center py-2 px-3 font-semibold text-italia-gray">T / D</th>
                    <th className="text-right py-2 px-3 font-semibold text-italia-gray">Cancel %</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.locationComparison.map((loc) => {
                    const best = insights.locationComparison.reduce((a, b) =>
                      a.revenue > b.revenue ? a : b
                    );
                    return (
                      <tr
                        key={loc.locationSlug}
                        className="border-b border-gray-50 hover:bg-gray-50/50"
                      >
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-italia-red" />
                            <span className="font-semibold text-italia-dark">{loc.city}</span>
                            {loc.locationSlug === best.locationSlug && loc.revenue > 0 && (
                              <span className="px-1.5 py-0.5 bg-italia-gold/15 text-italia-gold-dark text-[10px] font-bold rounded-full">
                                TOP
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="text-right py-3 px-3 font-semibold text-italia-dark">
                          {formatPrice(loc.revenue)}
                        </td>
                        <td className={`text-right py-3 px-3 font-semibold ${loc.profit >= 0 ? "text-italia-green" : "text-italia-red"}`}>
                          {formatPrice(loc.profit)}
                        </td>
                        <td className="text-right py-3 px-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                            loc.profitMargin >= 65
                              ? "bg-green-100 text-green-700"
                              : loc.profitMargin >= 50
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-red-100 text-red-700"
                          }`}>
                            {loc.profitMargin}%
                          </span>
                        </td>
                        <td className="text-right py-3 px-3 text-italia-dark">{loc.orderCount}</td>
                        <td className="text-right py-3 px-3 text-italia-dark">{formatPrice(loc.avgOrderValue)}</td>
                        <td className="text-right py-3 px-3 text-italia-dark">{loc.avgItemsPerOrder}</td>
                        <td className="text-center py-3 px-3 text-xs text-italia-gray">
                          {loc.takeoutCount} / {loc.deliveryCount}
                        </td>
                        <td className="text-right py-3 px-3">
                          <span className={`text-xs font-semibold ${
                            loc.cancellationRate > 10 ? "text-italia-red" : "text-italia-green"
                          }`}>
                            {loc.cancellationRate}%
                          </span>
                        </td>
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
          {/* Repeat Customers */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h2 className="font-bold text-italia-dark mb-1">Repeat Customers</h2>
            <p className="text-xs text-italia-gray mb-4">Customers who ordered more than once</p>
            {insights && insights.repeatCustomers.length > 0 ? (
              <div className="space-y-3">
                {insights.repeatCustomers.slice(0, 8).map((c, i) => (
                  <div key={c.phone} className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      i < 3 ? "bg-italia-gold/20 text-italia-gold-dark" : "bg-gray-100 text-italia-gray"
                    }`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-italia-dark truncate">{c.name}</p>
                      <p className="text-xs text-italia-gray">{c.orderCount} orders</p>
                    </div>
                    <span className="text-sm font-semibold text-italia-dark">
                      {formatPrice(c.totalSpent)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-italia-gray py-4 text-center">No repeat customers yet. This will populate as customers place multiple orders.</p>
            )}
          </div>

          {/* Worst Sellers */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h2 className="font-bold text-italia-dark mb-1">Worst Sellers</h2>
            <p className="text-xs text-italia-gray mb-4">Least popular items — consider removing or promoting</p>
            {insights && insights.worstSellers.length > 0 ? (
              <div className="space-y-3">
                {insights.worstSellers.map((item, i) => {
                  const maxQty = insights.worstSellers[insights.worstSellers.length - 1]?.quantity || 1;
                  const barWidth = (item.quantity / maxQty) * 100;
                  return (
                    <div key={item.name} className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-red-50 flex items-center justify-center text-xs font-bold text-italia-red">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-italia-dark truncate">{item.name}</span>
                          <span className="text-sm font-semibold text-italia-dark ml-2">{formatPrice(item.revenue)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-italia-red/40 rounded-full"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                          <span className="text-xs text-italia-gray">{item.quantity} sold</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-italia-gray py-4 text-center">No sales data yet. Worst sellers will appear once orders come in.</p>
            )}
          </div>
        </div>

        {/* Live orders + Notifications */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-italia-dark flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-italia-green opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-italia-green" />
                </span>
                Live Orders
                {activeOrders.length > 0 && (
                  <span className="ml-1 px-2 py-0.5 bg-italia-red/10 text-italia-red text-xs font-bold rounded-full">
                    {activeOrders.length}
                  </span>
                )}
              </h2>
              <Link
                href="/admin/orders"
                className="text-xs text-italia-red font-medium flex items-center gap-1 hover:underline"
              >
                All orders <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {activeOrders.length === 0 ? (
              <div className="py-8 text-center text-sm text-italia-gray">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No active orders right now
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {activeOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-xs font-bold">{order.id}</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[order.status]}`}>
                          {order.status}
                        </span>
                      </div>
                      <p className="text-sm text-italia-dark">{order.customerName}</p>
                      <div className="flex items-center gap-3 text-xs text-italia-gray mt-0.5">
                        <span className="flex items-center gap-1">
                          {order.fulfillmentType === "delivery" ? <Truck className="h-3 w-3" /> : <Package className="h-3 w-3" />}
                          {order.fulfillmentType}
                        </span>
                        <span>{order.slotTime}</span>
                        <span className="font-semibold text-italia-dark">{formatPrice(order.totalAmount)}</span>
                      </div>
                    </div>
                    <select
                      value={order.status}
                      onChange={(e) => handleStatusChange(order.id, e.target.value)}
                      className="px-2 py-1 border border-gray-200 rounded-lg text-xs"
                    >
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

          <div id="notifications" className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-italia-dark flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Notifications
                {unreadNotifs.length > 0 && (
                  <span className="px-2 py-0.5 bg-italia-red text-white text-xs font-bold rounded-full">
                    {unreadNotifs.length}
                  </span>
                )}
              </h2>
              {unreadNotifs.length > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-italia-gray hover:text-italia-dark flex items-center gap-1 transition-colors"
                >
                  <CheckCheck className="h-3 w-3" />
                  Mark all read
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-italia-gray">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No notifications yet
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {notifications.slice(0, 20).map((notif) => (
                  <div
                    key={notif.id}
                    className={`p-3 rounded-xl border transition-colors ${
                      notif.read
                        ? "bg-white border-gray-100"
                        : "bg-blue-50/50 border-blue-100"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${NOTIF_ICONS[notif.type] || "bg-gray-100 text-gray-600"}`}>
                        <Bell className="h-3 w-3" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-italia-dark">{notif.title}</p>
                        <p className="text-xs text-italia-gray mt-0.5">{notif.message}</p>
                        <p className="text-[10px] text-gray-400 mt-1">
                          {timeAgo(notif.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Category breakdown */}
        {summary && Object.keys(summary.categoryBreakdown).length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h2 className="font-bold text-italia-dark mb-4">Revenue by Category</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {Object.entries(summary.categoryBreakdown)
                .sort(([, a], [, b]) => b.revenue - a.revenue)
                .map(([cat, data]) => {
                  const margin = data.revenue > 0
                    ? Math.round(((data.revenue - data.cost) / data.revenue) * 100)
                    : 0;
                  return (
                    <div key={cat} className="p-3 rounded-xl bg-gray-50">
                      <p className="text-xs font-semibold text-italia-gray uppercase tracking-wide">
                        {cat}
                      </p>
                      <p className="text-lg font-bold text-italia-dark mt-1">
                        {formatPrice(data.revenue)}
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-italia-gray">{data.count} items</span>
                        <span className={`text-xs font-semibold ${margin >= 65 ? "text-italia-green" : margin >= 50 ? "text-italia-gold" : "text-italia-red"}`}>
                          {margin}%
                        </span>
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

// --- Helper components ---

function KPICard({
  label,
  value,
  sub,
  icon,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color: "green" | "red" | "blue" | "gold";
}) {
  const colors = {
    green: "bg-italia-green/10 text-italia-green",
    red: "bg-italia-red/10 text-italia-red",
    blue: "bg-blue-100 text-blue-600",
    gold: "bg-italia-gold/10 text-italia-gold-dark",
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${colors[color]}`}>
          {icon}
        </span>
        <span className="text-xs font-semibold text-italia-gray uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="text-xl font-bold text-italia-dark">{value}</p>
      {sub && <p className="text-xs text-italia-gray mt-0.5">{sub}</p>}
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
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
