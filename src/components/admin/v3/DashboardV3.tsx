"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  ClipboardList,
  Coins,
  Percent,
  PiggyBank,
  Receipt,
  RefreshCw,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, Button, Card, CardBody, CardHead, ChipRow, Kpi, Sparkline, Table, type BadgeTone, type ColumnV3 } from "./ui";

type Period = "today" | "7d" | "30d" | "90d";

const PERIOD_DAYS: Record<Period, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 };
const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

interface DailyStats {
  date: string;
  revenue: number;
  profit: number;
  orderCount: number;
  avgOrderValue: number;
}
interface SummaryData {
  totalRevenue: number;
  totalProfit: number;
  profitMargin: number;
  totalOrders: number;
  avgOrderValue: number;
  dailyStats: DailyStats[];
  topItems: { name: string; quantity: number; revenue: number }[];
}
interface LocationComparison {
  locationSlug: string;
  city: string;
  revenue: number;
  profit: number;
  profitMargin: number;
  orderCount: number;
  avgOrderValue: number;
}
interface InsightsData {
  locationComparison: LocationComparison[];
  topSellers: { name: string; quantity: number; revenue: number }[];
  cancellationRate: number;
}
interface OrderRow {
  id: string;
  status: string;
  totalAmount: number;
  customerName: string;
  createdAt: string;
}
interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
}

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}
function dateRange(period: Period) {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (PERIOD_DAYS[period] - 1));
  return { from: isoDate(from), to: isoDate(to) };
}
function previousRange(period: Period) {
  const days = PERIOD_DAYS[period];
  const to = new Date();
  to.setDate(to.getDate() - days);
  const from = new Date();
  from.setDate(from.getDate() - days * 2 + 1);
  return { from: isoDate(from), to: isoDate(to) };
}
function pctDelta(curr: number, prev: number): number | null {
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
}
function zl(grosze: number): string {
  return `${(grosze / 100).toLocaleString("pl-PL", { maximumFractionDigits: 0 })} zł`;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  completed: "ok",
  paid: "brand",
  preparing: "info",
  ready: "info",
  pending: "warn",
  cancelled: "bad",
  refunded: "bad",
};
function statusTone(s: string): BadgeTone {
  return STATUS_TONE[s.toLowerCase()] ?? "neutral";
}
function notifTone(type: string): string {
  if (type === "new_order") return "var(--av3-info)";
  if (type === "slot_full" || type === "low_slots") return "var(--av3-warn)";
  if (type === "order_status") return "var(--av3-ok)";
  return "var(--av3-subtle)";
}
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function DashboardV3() {
  const { location, activeLocations } = useAdminLocationV3();
  const [period, setPeriod] = useState<Period>("7d");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [prev, setPrev] = useState<SummaryData | null>(null);
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [laborRatio, setLaborRatio] = useState<{ ratio: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    const { from, to } = dateRange(period);
    const pr = previousRange(period);
    const locParam = location ? `&location=${location}` : "";
    try {
      const [a, b, ins, ord, notif, labor] = await Promise.all([
        fetch(`/api/admin/analytics?from=${from}&to=${to}${locParam}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/admin/analytics?from=${pr.from}&to=${pr.to}${locParam}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/admin/insights?from=${from}&to=${to}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/admin/orders${location ? `?location=${location}` : ""}`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/admin/notifications`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/admin/labor-ratio${location ? `?location=${location}` : ""}`).then((r) => (r.ok ? r.json() : null)),
      ]);
      setSummary(a);
      setPrev(b);
      setInsights(ins);
      setOrders(Array.isArray(ord) ? ord : []);
      setNotifications(Array.isArray(notif) ? notif : []);
      setLaborRatio(labor);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, location]);

  useEffect(() => {
    setLoading(true);
    fetchAll();
    const interval = setInterval(fetchAll, 30_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const daily = summary?.dailyStats ?? [];
  const revSpark = daily.map((d) => d.revenue);
  const ordersSpark = daily.map((d) => d.orderCount);
  const aovSpark = daily.map((d) => d.avgOrderValue);

  const scopeLabel = location ? activeLocations.find((l) => l.slug === location)?.city ?? location : "All locations";

  const recentOrders = useMemo(
    () =>
      [...orders]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 8),
    [orders],
  );

  const topSellers = (insights?.topSellers ?? summary?.topItems ?? []).slice(0, 6);
  const maxSeller = Math.max(1, ...topSellers.map((s) => s.revenue));

  const orderCols: ColumnV3<OrderRow>[] = [
    { key: "id", header: "Order", render: (o) => <span className="av3-cell-muted">#{o.id.slice(-5)}</span> },
    { key: "customer", header: "Customer", render: (o) => o.customerName || "Walk-in" },
    { key: "status", header: "Status", render: (o) => <Badge tone={statusTone(o.status)} dot>{o.status}</Badge> },
    { key: "total", header: "Total", num: true, render: (o) => zl(o.totalAmount) },
  ];

  const locCols: ColumnV3<LocationComparison>[] = [
    { key: "city", header: "Location", render: (l) => l.city },
    { key: "rev", header: "Revenue", num: true, render: (l) => zl(l.revenue) },
    { key: "orders", header: "Orders", num: true, render: (l) => l.orderCount.toLocaleString("pl-PL") },
    { key: "aov", header: "AOV", num: true, render: (l) => zl(l.avgOrderValue) },
    { key: "margin", header: "Margin", num: true, render: (l) => `${l.profitMargin.toFixed(1)}%` },
  ];

  if (loading && !summary) {
    return (
      <div className="av3-loading">
        <span className="av3-spin" aria-hidden /> Loading live metrics…
      </div>
    );
  }

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Executive Overview</h1>
          <div className="av3-pagehead-sub">
            {scopeLabel} · live, refreshing every 30s
          </div>
        </div>
        <div className="av3-pagehead-actions">
          <ChipRow options={PERIOD_OPTIONS} value={period} onChange={setPeriod} ariaLabel="Period" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRefreshing(true);
              fetchAll();
            }}
            aria-label="Refresh"
          >
            <RefreshCw className="av3-btn-ico" style={refreshing ? { animation: "av3-spin 0.7s linear infinite" } : undefined} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI rail — dense, sparkline-backed */}
      <div className="av3-kpi-rail">
        <Kpi label="Revenue" icon={Banknote} value={zl(summary?.totalRevenue ?? 0)} deltaPct={pctDelta(summary?.totalRevenue ?? 0, prev?.totalRevenue ?? 0)} spark={revSpark} accentVar="--av3-c1" />
        <Kpi label="Orders" icon={ClipboardList} value={(summary?.totalOrders ?? 0).toLocaleString("pl-PL")} deltaPct={pctDelta(summary?.totalOrders ?? 0, prev?.totalOrders ?? 0)} spark={ordersSpark} accentVar="--av3-c3" />
        <Kpi label="Avg order" icon={Receipt} value={zl(summary?.avgOrderValue ?? 0)} deltaPct={pctDelta(summary?.avgOrderValue ?? 0, prev?.avgOrderValue ?? 0)} spark={aovSpark} accentVar="--av3-c2" />
        <Kpi label="Profit margin" icon={Percent} value={`${(summary?.profitMargin ?? 0).toFixed(1)}%`} deltaPct={pctDelta(summary?.profitMargin ?? 0, prev?.profitMargin ?? 0)} accentVar="--av3-c4" />
        <Kpi label="Gross profit" icon={PiggyBank} value={zl(summary?.totalProfit ?? 0)} deltaPct={pctDelta(summary?.totalProfit ?? 0, prev?.totalProfit ?? 0)} accentVar="--av3-c4" />
        <Kpi label="Cancellations" icon={XCircle} value={`${(insights?.cancellationRate ?? 0).toFixed(1)}%`} invertDelta accentVar="--av3-c1" />
        {typeof laborRatio?.ratio === "number" && (
          <Kpi label="Labour ratio" icon={Coins} value={`${laborRatio.ratio.toFixed(1)}%`} invertDelta accentVar="--av3-c5" />
        )}
      </div>

      {/* Trend + alerts */}
      <div className="av3-grid-2-1">
        <Card>
          <CardHead title="Revenue trend" description={`Daily revenue · last ${PERIOD_DAYS[period]} day${PERIOD_DAYS[period] > 1 ? "s" : ""}`} />
          <CardBody>
            {revSpark.length > 1 ? (
              <>
                <Sparkline data={revSpark} width={680} height={120} strokeVar="--av3-c1" className="av3-trend" />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, color: "var(--av3-subtle)", fontVariantNumeric: "tabular-nums" }}>
                  <span>{daily[0]?.date}</span>
                  <span>peak {zl(Math.max(...revSpark))}</span>
                  <span>{daily[daily.length - 1]?.date}</span>
                </div>
              </>
            ) : (
              <div className="av3-empty"><div className="av3-empty-title">{zl(summary?.totalRevenue ?? 0)}</div><div className="av3-empty-text">Single-day window — pick a longer period to see the trend.</div></div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Operational alerts" />
          <CardBody>
            {notifications.length === 0 ? (
              <div className="av3-empty"><div className="av3-empty-title">All clear</div><div className="av3-empty-text">No operational alerts right now.</div></div>
            ) : (
              <div className="av3-alert-list">
                {notifications.slice(0, 6).map((n) => (
                  <div key={n.id} className="av3-alert-row">
                    <span className="av3-alert-dot" style={{ background: notifTone(n.type) }} aria-hidden />
                    <div className="av3-alert-body">
                      <div className="av3-alert-title">{n.title}</div>
                      <div className="av3-alert-sub">{n.message}</div>
                    </div>
                    <span className="av3-alert-time">{relTime(n.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Top sellers + recent orders */}
      <div className="av3-grid-2">
        <Card>
          <CardHead title="Top sellers" description="By revenue this period" />
          <CardBody>
            {topSellers.length === 0 ? (
              <div className="av3-empty"><div className="av3-empty-title">No sales yet</div><div className="av3-empty-text">Items will rank here once orders land.</div></div>
            ) : (
              <div className="av3-bars">
                {topSellers.map((s) => (
                  <div key={s.name} className="av3-bar-row">
                    <div>
                      <div className="av3-bar-label">{s.name}</div>
                      <div className="av3-bar-track"><div className="av3-bar-fill" style={{ width: `${(s.revenue / maxSeller) * 100}%` }} /></div>
                    </div>
                    <div className="av3-bar-val">{zl(s.revenue)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Recent orders" actions={<Badge tone="neutral">{orders.length} total</Badge>} />
          {recentOrders.length === 0 ? (
            <CardBody><div className="av3-empty"><div className="av3-empty-title">No orders</div><div className="av3-empty-text">New orders appear here in real time.</div></div></CardBody>
          ) : (
            <Table columns={orderCols} rows={recentOrders} rowKey={(o) => o.id} />
          )}
        </Card>
      </div>

      {/* Location network — only meaningful across all sites */}
      {!location && insights?.locationComparison && insights.locationComparison.length > 0 && (
        <Card>
          <CardHead title="Location network" description="Revenue, orders and margin by site" actions={<TrendingUp className="av3-btn-ico" style={{ color: "var(--av3-subtle)" }} />} />
          <Table columns={locCols} rows={insights.locationComparison} rowKey={(l) => l.locationSlug} />
        </Card>
      )}
    </>
  );
}
