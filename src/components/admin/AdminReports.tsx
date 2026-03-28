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
  MapPin,
  Download,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

const activeLocations = locations.filter((l) => l.isActive);

interface DailyData {
  date: string;
  revenue: number;
  cost: number;
  profit: number;
  orderCount: number;
  itemCount: number;
  avgOrderValue: number;
  takeoutCount: number;
  deliveryCount: number;
  categoryBreakdown: Record<string, { revenue: number; cost: number; count: number }>;
  topItems: { name: string; quantity: number; revenue: number }[];
}

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
  dailyStats: DailyData[];
  categoryBreakdown: Record<string, { revenue: number; cost: number; count: number }>;
  topItems: { name: string; quantity: number; revenue: number }[];
}

function getDefaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  };
}

export function AdminReports() {
  const defaults = getDefaultRange();
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [location, setLocation] = useState("");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const locParam = location ? `&location=${location}` : "";
    try {
      const res = await fetch(
        `/api/admin/analytics?from=${dateFrom}&to=${dateTo}${locParam}`
      );
      if (res.ok) setSummary(await res.json());
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, location]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExportCSV = () => {
    if (!summary) return;
    const rows = [
      ["Date", "Revenue (PLN)", "Cost (PLN)", "Profit (PLN)", "Margin %", "Orders", "Items", "Avg Order (PLN)", "Takeout", "Delivery"],
      ...summary.dailyStats.map((d) => [
        d.date,
        (d.revenue / 100).toFixed(2),
        (d.cost / 100).toFixed(2),
        (d.profit / 100).toFixed(2),
        d.revenue > 0 ? ((d.profit / d.revenue) * 100).toFixed(1) : "0",
        d.orderCount.toString(),
        d.itemCount.toString(),
        (d.avgOrderValue / 100).toFixed(2),
        d.takeoutCount.toString(),
        d.deliveryCount.toString(),
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sud-italia-report-${dateFrom}-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <AdminNav />
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header with filters */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold font-heading gradient-text">
            Revenue & PnL Reports
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 admin-text-muted" />
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="px-3 py-1.5 glass-input rounded-lg text-sm"
              >
                <option value="">All locations</option>
                {activeLocations.map((l) => (
                  <option key={l.slug} value={l.slug}>{l.city}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-2 py-1.5 glass-input rounded-lg text-sm"
              />
              <span className="admin-text-muted">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-2 py-1.5 glass-input rounded-lg text-sm"
              />
            </div>
            <button
              onClick={handleExportCSV}
              disabled={!summary || summary.dailyStats.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 glass-btn-green text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 admin-text-muted">Loading...</div>
        ) : !summary ? (
          <div className="text-center py-12 admin-text-muted">Failed to load data</div>
        ) : (
          <>
            {/* Summary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <SummaryCard
                label="Total Revenue"
                value={formatPrice(summary.totalRevenue)}
                icon={<DollarSign className="h-4 w-4 text-italia-green" />}
              />
              <SummaryCard
                label="Total Cost"
                value={formatPrice(summary.totalCost)}
                icon={<ArrowDownRight className="h-4 w-4 text-italia-red" />}
              />
              <SummaryCard
                label="Net Profit"
                value={formatPrice(summary.totalProfit)}
                icon={summary.totalProfit >= 0
                  ? <ArrowUpRight className="h-4 w-4 text-italia-green" />
                  : <ArrowDownRight className="h-4 w-4 text-italia-red" />}
                highlight={summary.totalProfit >= 0 ? "green" : "red"}
              />
              <SummaryCard
                label="Profit Margin"
                value={`${summary.profitMargin}%`}
                icon={summary.profitMargin >= 60
                  ? <TrendingUp className="h-4 w-4 text-italia-green" />
                  : <TrendingDown className="h-4 w-4 text-italia-gold" />}
              />
              <SummaryCard
                label="Total Orders"
                value={summary.totalOrders.toString()}
                icon={<ShoppingBag className="h-4 w-4 text-blue-600" />}
              />
            </div>

            {/* PnL chart — stacked bar */}
            {summary.dailyStats.length > 0 && (
              <div className="glass-card rounded-2xl border border-white/10 p-5 shadow-sm">
                <h2 className="font-bold admin-text mb-4">Daily PnL Breakdown</h2>
                <div className="flex items-end gap-px h-48 mb-2">
                  {summary.dailyStats.map((day) => {
                    const maxVal = Math.max(...summary.dailyStats.map((d) => d.revenue), 1);
                    const revPct = (day.revenue / maxVal) * 100;
                    const costPct = (day.cost / maxVal) * 100;
                    const profitPct = revPct - costPct;
                    return (
                      <div key={day.date} className="flex-1 flex flex-col items-stretch group relative" style={{ height: "100%" }}>
                        <div className="flex-1" />
                        <div className="relative" style={{ height: `${revPct}%`, minHeight: revPct > 0 ? "2px" : "0" }}>
                          {/* Cost portion (bottom) */}
                          <div
                            className="absolute bottom-0 left-0 right-0 bg-italia-red/25 rounded-t-sm"
                            style={{ height: `${costPct > 0 ? (costPct / revPct) * 100 : 0}%` }}
                          />
                          {/* Profit portion (top) */}
                          <div
                            className="absolute top-0 left-0 right-0 bg-italia-green/50 rounded-t-sm"
                            style={{ height: `${profitPct > 0 ? (profitPct / revPct) * 100 : 0}%` }}
                          />
                        </div>
                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-italia-dark text-white text-[10px] rounded-lg px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                          <div className="font-semibold">{formatSlotDate(day.date)}</div>
                          <div>Rev: {formatPrice(day.revenue)}</div>
                          <div>Cost: {formatPrice(day.cost)}</div>
                          <div>Profit: {formatPrice(day.profit)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 text-xs admin-text-muted">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-italia-green/50" /> Profit</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-italia-red/25" /> Cost</span>
                </div>
              </div>
            )}

            {/* Daily breakdown table */}
            {summary.dailyStats.length > 0 && (
              <div className="glass-card rounded-2xl border border-white/10 overflow-hidden">
                <div className="p-5 border-b border-white/8">
                  <h2 className="font-bold admin-text">Daily Breakdown</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-white/5 text-left">
                        <th className="px-4 py-3 font-semibold admin-text-muted">Date</th>
                        <th className="px-4 py-3 font-semibold admin-text-muted text-right">Revenue</th>
                        <th className="px-4 py-3 font-semibold admin-text-muted text-right">Cost</th>
                        <th className="px-4 py-3 font-semibold admin-text-muted text-right">Profit</th>
                        <th className="px-4 py-3 font-semibold admin-text-muted text-right">Margin</th>
                        <th className="px-4 py-3 font-semibold admin-text-muted text-right">Orders</th>
                        <th className="px-4 py-3 font-semibold admin-text-muted text-right">Items</th>
                        <th className="px-4 py-3 font-semibold admin-text-muted text-right">Avg Order</th>
                        <th className="px-4 py-3 font-semibold admin-text-muted text-center">T / D</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...summary.dailyStats].reverse().map((day) => {
                        const margin = day.revenue > 0
                          ? Math.round(((day.revenue - day.cost) / day.revenue) * 100)
                          : 0;
                        return (
                          <tr key={day.date} className="border-t border-white/5 hover:bg-white/4/50">
                            <td className="px-4 py-3 font-medium admin-text">
                              {formatSlotDate(day.date)}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold admin-text">
                              {formatPrice(day.revenue)}
                            </td>
                            <td className="px-4 py-3 text-right admin-text-muted">
                              {formatPrice(day.cost)}
                            </td>
                            <td className={`px-4 py-3 text-right font-semibold ${day.profit >= 0 ? "text-italia-green" : "text-italia-red"}`}>
                              {formatPrice(day.profit)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                                margin >= 65
                                  ? "bg-green-500/20 text-green-400"
                                  : margin >= 50
                                    ? "bg-yellow-500/20 text-yellow-400"
                                    : "bg-red-500/20 text-red-400"
                              }`}>
                                {margin}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right admin-text">{day.orderCount}</td>
                            <td className="px-4 py-3 text-right admin-text-muted">{day.itemCount}</td>
                            <td className="px-4 py-3 text-right admin-text">
                              {formatPrice(day.avgOrderValue)}
                            </td>
                            <td className="px-4 py-3 text-center text-xs admin-text-muted">
                              {day.takeoutCount} / {day.deliveryCount}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {/* Totals row */}
                    <tfoot>
                      <tr className="border-t-2 border-white/12 bg-white/5 font-bold">
                        <td className="px-4 py-3 admin-text">Total</td>
                        <td className="px-4 py-3 text-right admin-text">{formatPrice(summary.totalRevenue)}</td>
                        <td className="px-4 py-3 text-right admin-text-muted">{formatPrice(summary.totalCost)}</td>
                        <td className={`px-4 py-3 text-right ${summary.totalProfit >= 0 ? "text-italia-green" : "text-italia-red"}`}>
                          {formatPrice(summary.totalProfit)}
                        </td>
                        <td className="px-4 py-3 text-right admin-text">{summary.profitMargin}%</td>
                        <td className="px-4 py-3 text-right admin-text">{summary.totalOrders}</td>
                        <td className="px-4 py-3 text-right admin-text-muted">{summary.totalItems}</td>
                        <td className="px-4 py-3 text-right admin-text">{formatPrice(summary.avgOrderValue)}</td>
                        <td className="px-4 py-3 text-center text-xs admin-text-muted">
                          {summary.takeoutCount} / {summary.deliveryCount}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Category PnL */}
            {Object.keys(summary.categoryBreakdown).length > 0 && (
              <div className="glass-card rounded-2xl border border-white/10 overflow-hidden">
                <div className="p-5 border-b border-white/8">
                  <h2 className="font-bold admin-text">Category PnL</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-white/5 text-left">
                        <th className="px-4 py-3 font-semibold admin-text-muted">Category</th>
                        <th className="px-4 py-3 font-semibold admin-text-muted text-right">Revenue</th>
                        <th className="px-4 py-3 font-semibold admin-text-muted text-right">Cost</th>
                        <th className="px-4 py-3 font-semibold admin-text-muted text-right">Profit</th>
                        <th className="px-4 py-3 font-semibold admin-text-muted text-right">Margin</th>
                        <th className="px-4 py-3 font-semibold admin-text-muted text-right">Items Sold</th>
                        <th className="px-4 py-3 font-semibold admin-text-muted text-right">% of Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(summary.categoryBreakdown)
                        .sort(([, a], [, b]) => b.revenue - a.revenue)
                        .map(([cat, data]) => {
                          const profit = data.revenue - data.cost;
                          const margin = data.revenue > 0 ? Math.round((profit / data.revenue) * 100) : 0;
                          const revShare = summary.totalRevenue > 0
                            ? Math.round((data.revenue / summary.totalRevenue) * 100)
                            : 0;
                          return (
                            <tr key={cat} className="border-t border-white/5 hover:bg-white/4/50">
                              <td className="px-4 py-3 font-medium admin-text capitalize">{cat}</td>
                              <td className="px-4 py-3 text-right font-semibold admin-text">{formatPrice(data.revenue)}</td>
                              <td className="px-4 py-3 text-right admin-text-muted">{formatPrice(data.cost)}</td>
                              <td className={`px-4 py-3 text-right font-semibold ${profit >= 0 ? "text-italia-green" : "text-italia-red"}`}>
                                {formatPrice(profit)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                                  margin >= 65 ? "bg-green-500/20 text-green-400" : margin >= 50 ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"
                                }`}>
                                  {margin}%
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right admin-text">{data.count}</td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-italia-red/50 rounded-full"
                                      style={{ width: `${revShare}%` }}
                                    />
                                  </div>
                                  <span className="text-xs admin-text-muted w-8 text-right">{revShare}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Top items */}
            {summary.topItems.length > 0 && (
              <div className="glass-card rounded-2xl border border-white/10 p-5 shadow-sm">
                <h2 className="font-bold admin-text mb-4">Top 10 Best Sellers</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {summary.topItems.map((item, i) => {
                    const maxQty = summary.topItems[0]?.quantity || 1;
                    const barWidth = (item.quantity / maxQty) * 100;
                    return (
                      <div key={item.name} className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          i < 3 ? "bg-italia-gold/20 text-italia-gold-dark" : "bg-gray-200 admin-text-muted"
                        }`}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium admin-text truncate">{item.name}</span>
                            <span className="text-sm font-bold admin-text ml-2">{formatPrice(item.revenue)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-italia-red rounded-full"
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>
                            <span className="text-xs admin-text-muted">{item.quantity} sold</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty state */}
            {summary.dailyStats.length === 0 && (
              <div className="glass-card rounded-2xl border border-white/10 p-12 text-center shadow-sm">
                <ShoppingBag className="h-12 w-12 mx-auto mb-4 text-slate-600" />
                <p className="text-lg font-medium admin-text-muted">No data for this period</p>
                <p className="text-sm text-slate-500 mt-1">
                  Orders will appear here once customers start placing them
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  highlight?: "green" | "red";
}) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${
      highlight === "green"
        ? "bg-green-500/10 border-green-500/20"
        : highlight === "red"
          ? "bg-red-500/10 border-red-500/20"
          : "bg-white border-white/8"
    }`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-semibold admin-text-muted uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-xl font-bold ${
        highlight === "green" ? "text-italia-green" : highlight === "red" ? "text-italia-red" : "admin-text"
      }`}>
        {value}
      </p>
    </div>
  );
}
