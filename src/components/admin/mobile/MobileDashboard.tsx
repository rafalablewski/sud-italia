"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  ChevronRight,
  ClipboardList,
  Flame,
  PiggyBank,
  Receipt,
  TrendingUp,
  Users,
} from "lucide-react";
import { useAdminLocation } from "../v2/LocationContext";
import {
  MobilePage,
  PageHeader,
  Section,
  StatRow,
  SegmentControl,
  PullToRefresh,
  type StatItem,
} from "../v2/mobile";
import { AreaChart } from "../v2/charts";
import { Sparkline } from "../v2/charts/Sparkline";

type Period = "today" | "7d" | "30d" | "90d";

interface DailyStats {
  date: string;
  revenue: number;
  cost: number;
  profit: number;
  orderCount: number;
  itemCount: number;
  avgOrderValue: number;
}

interface SummaryData {
  totalRevenue: number;
  totalProfit: number;
  profitMargin: number;
  totalOrders: number;
  totalItems: number;
  avgOrderValue: number;
  takeoutCount: number;
  deliveryCount: number;
  dailyStats: DailyStats[];
}

interface InsightsData {
  topSellers: { name: string; quantity: number; revenue: number }[];
  cancelledOrders: number;
  cancellationRate: number;
  repeatCustomers: { name: string; phone: string; orderCount: number; totalSpent: number }[];
}

interface NotificationItem {
  id: string;
  type: "new_order" | "slot_full" | "daily_summary" | "low_slots" | "order_status";
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
}

interface LowStockRow {
  name: string;
  onHand: number;
  reorderPoint: number;
  unit: string;
}

const PERIOD_DAYS: Record<Period, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function dateRange(period: Period): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (PERIOD_DAYS[period] - 1));
  return { from: isoDate(from), to: isoDate(to) };
}

function previousRange(period: Period): { from: string; to: string } {
  const days = PERIOD_DAYS[period];
  const to = new Date();
  to.setDate(to.getDate() - days);
  const from = new Date();
  from.setDate(from.getDate() - days * 2 + 1);
  return { from: isoDate(from), to: isoDate(to) };
}

function fmtCurrencyGrosze(grosze: number): string {
  const zl = grosze / 100;
  if (zl >= 1000) {
    return `${(zl / 1000).toFixed(1)}k`;
  }
  return Math.round(zl).toLocaleString("pl-PL");
}

function pctDelta(curr: number, prev: number): number | undefined {
  if (!prev) return undefined;
  return ((curr - prev) / prev) * 100;
}

/**
 * Mobile-native dashboard. Same APIs as `AdminDashboard`, restructured for
 * 390px screens. KPIs become a horizontal pager (one hero stat per page);
 * action queue surfaces the things needing attention; trend chart stays
 * but is right-sized.
 */
export function MobileDashboard() {
  const { location } = useAdminLocation();
  const [period, setPeriod] = useState<Period>("today");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [prevSummary, setPrevSummary] = useState<SummaryData | null>(null);
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [lowStock, setLowStock] = useState<LowStockRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const { from, to } = dateRange(period);
    const prev = previousRange(period);
    const locParam = location ? `&location=${location}` : "";
    try {
      const stockP = location
        ? fetch(`/api/admin/stock?location=${location}`).then((r) =>
            r.ok ? r.json() : [],
          )
        : Promise.resolve([]);
      const [a, b, ins, notif, stock] = await Promise.all([
        fetch(`/api/admin/analytics?from=${from}&to=${to}${locParam}`).then((r) =>
          r.ok ? r.json() : null,
        ),
        fetch(`/api/admin/analytics?from=${prev.from}&to=${prev.to}${locParam}`).then((r) =>
          r.ok ? r.json() : null,
        ),
        fetch(`/api/admin/insights?from=${from}&to=${to}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/admin/notifications`).then((r) => (r.ok ? r.json() : [])),
        stockP,
      ]);
      setSummary(a);
      setPrevSummary(b);
      setInsights(ins);
      setNotifications(Array.isArray(notif) ? notif : []);
      setLowStock(
        Array.isArray(stock)
          ? (stock as LowStockRow[]).filter(
              (s) => s.reorderPoint > 0 && s.onHand <= s.reorderPoint,
            )
          : [],
      );
    } finally {
      setLoading(false);
    }
  }, [period, location]);

  useEffect(() => {
    setLoading(true);
    fetchAll();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") fetchAll();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [fetchAll]);

  const stats: StatItem[] = useMemo(() => {
    const rev = summary?.totalRevenue ?? 0;
    const prevRev = prevSummary?.totalRevenue ?? 0;
    const orders = summary?.totalOrders ?? 0;
    const prevOrders = prevSummary?.totalOrders ?? 0;
    const aov = summary?.avgOrderValue ?? 0;
    const prevAov = prevSummary?.avgOrderValue ?? 0;
    const margin = summary?.profitMargin ?? 0;
    const prevMargin = prevSummary?.profitMargin ?? 0;
    const sparkRev = (summary?.dailyStats ?? []).map((d) => d.revenue / 100);
    const sparkOrders = (summary?.dailyStats ?? []).map((d) => d.orderCount);

    return [
      {
        label: "Revenue",
        value: `${fmtCurrencyGrosze(rev)} zł`,
        delta: pctDelta(rev, prevRev),
        higherIsBetter: true,
        icon: Banknote,
        tone: "brand",
        hint: "vs prior period",
        trend: sparkRev.length > 1 ? <Sparkline values={sparkRev} color="var(--brand)" /> : null,
      },
      {
        label: "Orders",
        value: orders.toLocaleString("pl-PL"),
        delta: pctDelta(orders, prevOrders),
        higherIsBetter: true,
        icon: ClipboardList,
        tone: "info",
        hint: `${summary?.totalItems ?? 0} items`,
        trend: sparkOrders.length > 1 ? <Sparkline values={sparkOrders} color="var(--info)" /> : null,
      },
      {
        label: "AOV",
        value: `${(aov / 100).toFixed(2)} zł`,
        delta: pctDelta(aov, prevAov),
        higherIsBetter: true,
        icon: Receipt,
        tone: "success",
        hint: "Avg order value",
      },
      {
        label: "Margin",
        value: `${margin.toFixed(1)}%`,
        delta: pctDelta(margin, prevMargin),
        higherIsBetter: true,
        icon: PiggyBank,
        tone: "success",
        hint: `Net ${fmtCurrencyGrosze(summary?.totalProfit ?? 0)} zł`,
      },
      {
        label: "Repeat",
        value: insights?.repeatCustomers.length ?? 0,
        icon: Users,
        tone: "info",
        hint: "2+ orders in period",
      },
      {
        label: "Cancel rate",
        value: `${(insights?.cancellationRate ?? 0).toFixed(1)}%`,
        icon: AlertTriangle,
        tone: (insights?.cancellationRate ?? 0) > 3 ? "warning" : "neutral",
        higherIsBetter: false,
        hint: `${insights?.cancelledOrders ?? 0} cancelled`,
      },
    ];
  }, [summary, prevSummary, insights]);

  const trendData = useMemo(() => {
    if (!summary?.dailyStats) return [];
    return summary.dailyStats.map((d) => ({
      date: d.date,
      revenue: Math.round(d.revenue / 100),
      profit: Math.round(d.profit / 100),
    }));
  }, [summary]);

  const recentAlerts = useMemo(
    () => notifications.filter((n) => !n.read).slice(0, 4),
    [notifications],
  );

  return (
    <PullToRefresh onRefresh={fetchAll}>
      <MobilePage
        toolbar={
          <SegmentControl<Period>
            value={period}
            onChange={setPeriod}
            options={[
              { value: "today", label: "Today" },
              { value: "7d", label: "7d" },
              { value: "30d", label: "30d" },
              { value: "90d", label: "90d" },
            ]}
            ariaLabel="Date range"
          />
        }
      >
        <PageHeader
          title={location ? location.toUpperCase() : "All locations"}
          subtitle={
            loading
              ? "Loading…"
              : "Live • " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          }
        />

        <StatRow items={stats} />

        {recentAlerts.length > 0 && (
          <Section
            title="Action queue"
            action={<Link href="/admin/orders">View all</Link>}
          >
            <ul role="list" className="v2-m-list">
              {recentAlerts.map((a) => (
                <li key={a.id}>
                  <Link
                    href={
                      a.type === "slot_full" || a.type === "low_slots"
                        ? "/admin/slots"
                        : "/admin/orders"
                    }
                    className="v2-m-list-row"
                  >
                    <span
                      className={`v2-m-list-icon v2-m-tone-${
                        a.type === "slot_full" || a.type === "low_slots"
                          ? "warning"
                          : a.type === "daily_summary"
                            ? "success"
                            : "info"
                      }`}
                    >
                      <Flame className="h-4 w-4" />
                    </span>
                    <span className="v2-m-list-stack">
                      <span className="v2-m-list-title">{a.title}</span>
                      <span className="v2-m-list-sub">{a.message}</span>
                    </span>
                    <ChevronRight className="v2-m-list-chev" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {lowStock.length > 0 && (
          <Section
            title="Low stock"
            action={<Link href="/admin/inventory">Manage</Link>}
          >
            <ul role="list" className="v2-m-list">
              {lowStock.slice(0, 4).map((s) => {
                const pct = (s.onHand / Math.max(s.reorderPoint, 1)) * 100;
                const tone: "warning" | "danger" = pct < 50 ? "danger" : "warning";
                return (
                  <li key={s.name}>
                    <div className="v2-m-list-row">
                      <span className={`v2-m-list-icon v2-m-tone-${tone}`}>
                        <AlertTriangle className="h-4 w-4" />
                      </span>
                      <span className="v2-m-list-stack">
                        <span className="v2-m-list-title">{s.name}</span>
                        <span className="v2-m-list-sub">
                          {s.onHand} {s.unit} of {s.reorderPoint} reorder pt
                        </span>
                      </span>
                      <span className={`v2-m-pill v2-m-pill-${tone}`}>
                        {Math.round(pct)}%
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        <Section title="Revenue & profit">
          <div
            style={{
              padding: 12,
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              borderRadius: "var(--m-card-radius)",
            }}
          >
            {trendData.length === 0 ? (
              <div className="v2-m-empty">
                <TrendingUp className="h-6 w-6" aria-hidden />
                <div className="v2-m-empty-title">No orders yet</div>
                <div className="v2-m-empty-desc">Daily totals appear as orders come in.</div>
              </div>
            ) : (
              <AreaChart
                data={trendData}
                xKey="date"
                series={[
                  { key: "revenue", label: "Revenue" },
                  { key: "profit", label: "Profit" },
                ]}
                height={200}
                yFormat={(n) => `${Math.round(n / 1000)}k`}
                xFormat={(v) => {
                  const s = String(v);
                  return s.length >= 10 ? s.slice(5) : s;
                }}
                tooltipValue={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
              />
            )}
          </div>
        </Section>

        <Section
          title="Top sellers"
          action={<Link href="/admin/reports">Reports</Link>}
        >
          {(insights?.topSellers ?? []).length === 0 ? (
            <div className="v2-m-empty">
              <div className="v2-m-empty-title">No data yet</div>
            </div>
          ) : (
            <ul role="list" className="v2-m-list">
              {(insights?.topSellers ?? []).slice(0, 6).map((t, i) => (
                <li key={t.name}>
                  <div className="v2-m-list-row">
                    <span className="v2-m-list-icon v2-m-tone-neutral">
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{i + 1}</span>
                    </span>
                    <span className="v2-m-list-stack">
                      <span className="v2-m-list-title">{t.name}</span>
                      <span className="v2-m-list-sub">{t.quantity} sold</span>
                    </span>
                    <span className="v2-m-list-metric tabular">
                      {Math.round(t.revenue / 100)} zł
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Drill in">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            <DrillCard href="/admin/reports" label="Reports" hint="Financials" />
            <DrillCard href="/admin/ai" label="Insights" hint="AI assist" />
            <DrillCard href="/admin/locations" label="Locations" hint="Compare units" />
            <DrillCard href="/admin/customers" label="Customers" hint="Ledger & LTV" />
          </div>
        </Section>
      </MobilePage>
    </PullToRefresh>
  );
}

function DrillCard({ href, label, hint }: { href: string; label: string; hint: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: 14,
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: "var(--m-card-radius)",
        textDecoration: "none",
        color: "inherit",
        minHeight: 78,
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{hint}</span>
    </Link>
  );
}
