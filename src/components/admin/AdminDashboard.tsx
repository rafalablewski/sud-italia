"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Banknote,
  Boxes,
  ChefHat,
  Clock,
  ClipboardList,
  Coins,
  Flame,
  HardHat,
  MapPin,
  PiggyBank,
  Receipt,
  RefreshCw,
  Star,
  Users,
} from "lucide-react";
import { useAdminLocation } from "./v2/LocationContext";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Tabs, type Column, Table } from "./v2/ui";
import { AreaChart, BarChart, Heatmap, KpiCard } from "./v2/charts";

type Period = "today" | "7d" | "30d" | "90d";

interface DailyStats {
  date: string;
  revenue: number;
  cost: number;
  profit: number;
  orderCount: number;
  itemCount: number;
  avgOrderValue: number;
  takeoutCount: number;
  deliveryCount: number;
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
  cancellationRate: number;
}

interface InsightsData {
  locationComparison: LocationComparison[];
  topSellers: { name: string; quantity: number; revenue: number }[];
  cancelledOrders: number;
  cancellationRate: number;
  peakHours: { hour: number; orderCount: number; revenue: number }[];
  repeatCustomers: { name: string; phone: string; orderCount: number; totalSpent: number }[];
}

interface NotificationItem {
  id: string;
  type: "new_order" | "slot_full" | "daily_summary" | "low_slots" | "order_status";
  title: string;
  message: string;
  locationSlug?: string;
  orderId?: string;
  createdAt: string;
  read: boolean;
}

interface OrderRow {
  id: string;
  locationSlug: string;
  status: string;
  totalAmount: number;
  customerName: string;
  createdAt: string;
  slotDate?: string;
  /** Optional — the orders endpoint returns it for paid orders. Used by the
   *  "next 60 min" widget to surface tickets coming due. */
  slotTime?: string;
}

const PERIOD_LABEL: Record<Period, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};

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

function fmtCurrency(grosze: number): string {
  return `${(grosze / 100).toLocaleString("pl-PL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} zł`;
}

function fmtPercent(n: number, digits = 0): string {
  return `${n.toFixed(digits)}%`;
}

function pctDelta(curr: number, prev: number): number | undefined {
  if (!prev) return undefined;
  return ((curr - prev) / prev) * 100;
}

const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}`);
const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayOfWeek(iso: string): number {
  const d = new Date(iso);
  const jd = d.getDay();
  return jd === 0 ? 6 : jd - 1;
}

export function AdminDashboard() {
  const [period, setPeriod] = useState<Period>("7d");
  const { location } = useAdminLocation();

  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [prevSummary, setPrevSummary] = useState<SummaryData | null>(null);
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [laborRatio, setLaborRatio] = useState<{
    revenueGrosze: number;
    laborGrosze: number;
    ratio: number | null;
    openShifts: number;
  } | null>(null);
  const [upcomingSlots, setUpcomingSlots] = useState<
    { id: string; time: string; spotsLeft: number; fulfillmentTypes: string[] }[]
  >([]);
  const [lowStock, setLowStock] = useState<{ name: string; onHand: number; reorderPoint: number; unit: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    const { from, to } = dateRange(period);
    const prev = previousRange(period);
    const locParam = location ? `&location=${location}` : "";

    try {
      // The "next 60 min" widget needs today's slots and current low-stock
      // alerts. Both endpoints only respond when scoped to a single
      // location (slots requires it, stock is per-location), so we skip
      // them when "All locations" is selected.
      const today = new Date().toISOString().slice(0, 10);
      const slotsP = location
        ? fetch(`/api/slots?location=${location}&date=${today}`).then((r) =>
            r.ok ? r.json() : [],
          )
        : Promise.resolve([]);
      const stockP = location
        ? fetch(`/api/admin/stock?location=${location}`).then((r) =>
            r.ok ? r.json() : [],
          )
        : Promise.resolve([]);

      const [a, b, ins, ord, notif, labor, slots, stock] = await Promise.all([
        fetch(`/api/admin/analytics?from=${from}&to=${to}${locParam}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/admin/analytics?from=${prev.from}&to=${prev.to}${locParam}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/admin/insights?from=${from}&to=${to}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/admin/orders${location ? `?location=${location}` : ""}`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/admin/notifications`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/admin/labor-ratio${location ? `?location=${location}` : ""}`).then((r) => (r.ok ? r.json() : null)),
        slotsP,
        stockP,
      ]);
      setSummary(a);
      setPrevSummary(b);
      setInsights(ins);
      setOrders(Array.isArray(ord) ? ord : []);
      setNotifications(Array.isArray(notif) ? notif : []);
      setLaborRatio(labor);
      setUpcomingSlots(Array.isArray(slots) ? slots : []);
      setLowStock(
        Array.isArray(stock)
          ? (stock as { name: string; onHand: number; reorderPoint: number; unit: string }[]).filter(
              (s) => s.reorderPoint > 0 && s.onHand <= s.reorderPoint,
            )
          : [],
      );
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

  const kpis = useMemo(() => {
    const rev = summary?.totalRevenue ?? 0;
    const prevRev = prevSummary?.totalRevenue ?? 0;
    const oTot = summary?.totalOrders ?? 0;
    const prevOrders = prevSummary?.totalOrders ?? 0;
    const aov = summary?.avgOrderValue ?? 0;
    const prevAov = prevSummary?.avgOrderValue ?? 0;
    const margin = summary?.profitMargin ?? 0;
    const prevMargin = prevSummary?.profitMargin ?? 0;
    const profit = summary?.totalProfit ?? 0;
    return {
      rev,
      revDelta: pctDelta(rev, prevRev),
      orders: oTot,
      ordersDelta: pctDelta(oTot, prevOrders),
      aov,
      aovDelta: pctDelta(aov, prevAov),
      margin,
      marginDelta: pctDelta(margin, prevMargin),
      profit,
    };
  }, [summary, prevSummary]);

  const trendData = useMemo(() => {
    if (!summary?.dailyStats) return [];
    return summary.dailyStats.map((d) => ({
      date: d.date,
      revenue: Math.round(d.revenue / 100),
      profit: Math.round(d.profit / 100),
    }));
  }, [summary]);

  const revenueSpark = useMemo(() => trendData.map((d) => d.revenue), [trendData]);
  const ordersSpark = useMemo(
    () => (summary?.dailyStats ?? []).map((d) => d.orderCount),
    [summary],
  );

  const heatCells = useMemo(() => {
    const { from } = dateRange(period);
    const grid = new Map<string, number>();
    for (const o of orders) {
      if (o.status === "pending" || o.status === "cancelled") continue;
      const day = o.slotDate || o.createdAt.split("T")[0];
      if (day < from) continue;
      const ts = new Date(o.createdAt);
      if (Number.isNaN(ts.getTime())) continue;
      const dow = DOW_LABELS[dayOfWeek(day)];
      const hour = String(ts.getHours()).padStart(2, "0");
      const key = `${dow}|${hour}`;
      grid.set(key, (grid.get(key) ?? 0) + 1);
    }
    const cells: { x: string; y: string; value: number }[] = [];
    for (const [k, v] of grid) {
      const [y, x] = k.split("|");
      cells.push({ x, y, value: v });
    }
    return cells;
  }, [orders, period]);

  const topSellers = useMemo(
    () =>
      (insights?.topSellers ?? []).slice(0, 8).map((t) => ({
        name: t.name,
        quantity: t.quantity,
      })),
    [insights],
  );

  const recentAlerts = useMemo(() => notifications.slice(0, 6), [notifications]);

  const onManualRefresh = () => {
    setRefreshing(true);
    fetchAll();
  };

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Executive Overview</h1>
          <p className="v2-page-subtitle">
            {location ? `${location.toUpperCase()} • ` : "All locations • "}
            Real-time operations, finance, and customer health.
          </p>
        </div>
        <div className="v2-page-actions">
          <Tabs
            value={period}
            onChange={(v) => setPeriod(v as Period)}
            tabs={[
              { value: "today", label: "Today" },
              { value: "7d", label: "7d" },
              { value: "30d", label: "30d" },
              { value: "90d", label: "90d" },
            ]}
            variant="pill"
            ariaLabel="Date range"
          />
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "v2-spin" : ""}`} />}
            onClick={onManualRefresh}
            disabled={refreshing}
          >
            Refresh
          </Button>
        </div>
      </header>

      <Next60Widget
        location={location}
        orders={orders}
        slots={upcomingSlots}
        lowStock={lowStock}
        openShifts={laborRatio?.openShifts ?? 0}
      />

      <section className="v2-kpi-grid">
        <KpiCard
          label="Revenue"
          value={kpis.rev / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          delta={kpis.revDelta}
          higherIsBetter
          trend={revenueSpark}
          icon={Banknote}
          tone="brand"
          hint={`vs ${PERIOD_LABEL[period].toLowerCase()} prior`}
        />
        <KpiCard
          label="Orders"
          value={kpis.orders}
          delta={kpis.ordersDelta}
          higherIsBetter
          trend={ordersSpark}
          icon={ClipboardList}
          tone="info"
          hint={`${kpis.orders ? Math.round(((summary?.totalItems ?? 0) / kpis.orders) * 10) / 10 : 0} items/order`}
        />
        <KpiCard
          label="Avg order value"
          value={kpis.aov / 100}
          format={(n) => `${n.toFixed(2)} zł`}
          delta={kpis.aovDelta}
          higherIsBetter
          icon={Receipt}
          tone="success"
        />
        <KpiCard
          label="Profit margin"
          value={kpis.margin}
          display={fmtPercent(kpis.margin)}
          delta={kpis.marginDelta}
          higherIsBetter
          icon={PiggyBank}
          tone="success"
          hint={`Net ${fmtCurrency(kpis.profit)}`}
        />
        <KpiCard
          label="Repeat customers"
          value={insights?.repeatCustomers.length ?? 0}
          icon={Users}
          tone="info"
          hint="2+ orders in period"
        />
        <KpiCard
          label="Cancellation rate"
          value={insights?.cancellationRate ?? 0}
          display={fmtPercent(insights?.cancellationRate ?? 0, 1)}
          icon={AlertTriangle}
          tone="warning"
          higherIsBetter={false}
          hint={`${insights?.cancelledOrders ?? 0} cancelled`}
        />
        {(() => {
          const r = laborRatio?.ratio ?? null;
          // Target labour band for QSR: ~22–28%. Above 35% warrants action;
          // > 45% is a red alert. Tile is muted until at least one order
          // and one open shift exist so we don't flash 0% all morning.
          const tone: "success" | "warning" | "danger" | "neutral" =
            r === null
              ? "neutral"
              : r > 0.45
                ? "danger"
                : r > 0.35
                  ? "warning"
                  : "success";
          const display =
            r === null
              ? laborRatio && laborRatio.laborGrosze > 0
                ? "No sales yet"
                : "—"
              : `${(r * 100).toFixed(1)}%`;
          return (
            <KpiCard
              label="Labour / revenue (today)"
              value={r ?? 0}
              display={display}
              icon={HardHat}
              tone={tone}
              higherIsBetter={false}
              hint={
                laborRatio
                  ? `${(laborRatio.laborGrosze / 100).toLocaleString("pl-PL", { maximumFractionDigits: 0 })} zł labour · ${laborRatio.openShifts} on the floor`
                  : "Live · target 22–28%"
              }
            />
          );
        })()}
      </section>

      <section className="v2-grid-2-1">
        <Card>
          <CardHeader
            title="Revenue & profit trend"
            description={`Daily totals in zł over the last ${PERIOD_LABEL[period].toLowerCase()}`}
            actions={
              <Badge tone="info" variant="soft" dot>
                Live · 30s
              </Badge>
            }
          />
          <CardBody>
            {trendData.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="No orders yet in this period"
                description="When orders come in, daily revenue and profit appear here."
                compact
              />
            ) : (
              <AreaChart
                data={trendData}
                xKey="date"
                series={[
                  { key: "revenue", label: "Revenue" },
                  { key: "profit", label: "Profit" },
                ]}
                height={260}
                yFormat={(n) => `${Math.round(n / 1000)}k zł`}
                xFormat={(v) => {
                  const s = String(v);
                  return s.length >= 10 ? s.slice(5) : s;
                }}
                tooltipValue={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Operational alerts"
            description="Most recent first"
            actions={
              <Link href="/admin#notifications" className="v2-link-sm">
                All <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          <CardBody>
            {recentAlerts.length === 0 ? (
              <EmptyState icon={Activity} title="All clear" description="No operational warnings." compact />
            ) : (
              <ul className="v2-alert-list">
                {recentAlerts.map((n) => (
                  <li key={n.id} className={`v2-alert-row ${n.read ? "" : "is-unread"}`}>
                    <div className="v2-alert-text">
                      <div className="v2-alert-title">{n.title}</div>
                      <div className="v2-alert-message">{n.message}</div>
                    </div>
                    {n.locationSlug && (
                      <Badge tone="neutral" variant="soft" icon={<MapPin className="h-3 w-3" />}>
                        {n.locationSlug}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </section>

      <section className="v2-grid-2">
        <Card>
          <CardHeader
            title="Top sellers"
            description="By quantity in the selected period"
            actions={<Star className="h-4 w-4 v2-muted" aria-hidden />}
          />
          <CardBody>
            {topSellers.length === 0 ? (
              <EmptyState icon={Flame} title="No best-sellers yet" description="Add menu items and start taking orders." compact />
            ) : (
              <BarChart
                data={topSellers}
                xKey="name"
                series={[{ key: "quantity", label: "Sold" }]}
                layout="vertical"
                height={Math.max(180, topSellers.length * 36)}
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Order heatmap"
            description="Day of week × hour of day"
            actions={<Coins className="h-4 w-4 v2-muted" aria-hidden />}
          />
          <CardBody>
            {heatCells.length === 0 ? (
              <EmptyState icon={Flame} title="No orders mapped yet" description="Heatmap fills in as orders arrive." compact />
            ) : (
              <Heatmap cells={heatCells} xLabels={HOUR_LABELS} yLabels={DOW_LABELS} rowHeight={22} format={(v) => `${v} orders`} />
            )}
          </CardBody>
        </Card>
      </section>

      <section>
        <Card padding="none">
          <CardHeader
            title="Location performance"
            description="Side-by-side benchmark for active locations"
          />
          <CardBody>
            {insights?.locationComparison && insights.locationComparison.length > 0 ? (
              <LocationTable rows={insights.locationComparison} />
            ) : (
              <EmptyState icon={MapPin} title="Need more data" description="Once orders exist across locations, comparison appears here." compact />
            )}
          </CardBody>
        </Card>
      </section>

      {loading && <div className="v2-page-loading">Loading…</div>}
    </div>
  );
}

function LocationTable({ rows }: { rows: LocationComparison[] }) {
  const cols: Column<LocationComparison>[] = [
    {
      key: "city",
      header: "Location",
      cell: (r) => (
        <span className="v2-loc-cell">
          <span className="v2-loc-cell-dot" aria-hidden />
          <span>{r.city}</span>
        </span>
      ),
      sortValue: (r) => r.city,
    },
    {
      key: "revenue",
      header: "Revenue",
      align: "right",
      cell: (r) => fmtCurrency(r.revenue),
      sortValue: (r) => r.revenue,
    },
    {
      key: "profit",
      header: "Profit",
      align: "right",
      cell: (r) => fmtCurrency(r.profit),
      sortValue: (r) => r.profit,
    },
    {
      key: "margin",
      header: "Margin",
      align: "right",
      cell: (r) => fmtPercent(r.profitMargin, 1),
      sortValue: (r) => r.profitMargin,
    },
    {
      key: "orders",
      header: "Orders",
      align: "right",
      cell: (r) => r.orderCount.toLocaleString(),
      sortValue: (r) => r.orderCount,
    },
    {
      key: "aov",
      header: "AOV",
      align: "right",
      cell: (r) => fmtCurrency(r.avgOrderValue),
      sortValue: (r) => r.avgOrderValue,
    },
    {
      key: "cancel",
      header: "Cancel %",
      align: "right",
      cell: (r) => (
        <Badge tone={r.cancellationRate > 10 ? "danger" : r.cancellationRate > 5 ? "warning" : "success"} variant="soft">
          {fmtPercent(r.cancellationRate, 1)}
        </Badge>
      ),
      sortValue: (r) => r.cancellationRate,
    },
  ];
  return (
    <Table
      rows={rows}
      columns={cols}
      rowKey={(r) => r.locationSlug}
      defaultSort={{ key: "revenue", dir: "desc" }}
    />
  );
}

interface Next60Props {
  location: string | null | undefined;
  orders: OrderRow[];
  slots: { id: string; time: string; spotsLeft: number; fulfillmentTypes: string[] }[];
  lowStock: { name: string; onHand: number; reorderPoint: number; unit: string }[];
  openShifts: number;
}

/**
 * The single most valuable view in a restaurant: what's about to happen in
 * the next 60 minutes. Composes existing data sources (orders, slots, stock,
 * shifts) into one strip so a manager doesn't have to alt-tab between pages.
 *
 * The widget is location-scoped: slot + stock data only loads when a single
 * location is selected (matching the underlying API contracts), so "All
 * locations" shows a clear "pick a truck" empty state instead of misleading
 * partial counts.
 */
function Next60Widget({ location, orders, slots, lowStock, openShifts }: Next60Props) {
  const now = new Date();
  const horizon = new Date(now.getTime() + 60 * 60 * 1000);
  const todayDate = now.toISOString().slice(0, 10);
  const horizonClock = horizon.toTimeString().slice(0, 5);
  const nowClock = now.toTimeString().slice(0, 5);

  // Slots whose pickup time falls in the next 60 min. The /api/slots payload
  // only includes future / available slots so we don't have to filter out
  // past ones explicitly — the time-range check is still defensive.
  const upcomingSlots = slots
    .filter((s) => s.time >= nowClock && s.time <= horizonClock)
    .slice(0, 5);
  const upcomingCapacity = upcomingSlots.reduce((acc, s) => acc + s.spotsLeft, 0);

  // Orders coming due: paid (confirmed → ready) with slot time inside the
  // next hour. Completed / cancelled are excluded — the manager wants
  // open work, not history.
  const dueOrders = orders
    .filter((o) => {
      if (!["confirmed", "preparing", "ready"].includes(o.status)) return false;
      if (!o.slotTime) return false;
      const slotDay = o.slotDate || todayDate;
      if (slotDay !== todayDate) return false;
      return o.slotTime >= nowClock && o.slotTime <= horizonClock;
    })
    .sort((a, b) => (a.slotTime || "").localeCompare(b.slotTime || ""))
    .slice(0, 5);

  // Sort low-stock by urgency (smallest ratio of on-hand to reorder point).
  const sortedLowStock = [...lowStock]
    .sort(
      (a, b) =>
        a.onHand / (a.reorderPoint || 1) - b.onHand / (b.reorderPoint || 1),
    )
    .slice(0, 5);

  const tile = (title: string, count: number, hint: string, tone: "neutral" | "warning" | "danger" | "success", icon: React.ReactNode) => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.25rem",
        padding: "0.75rem 1rem",
        borderRight: "1px solid var(--v2-border, #e5e7eb)",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--v2-text-muted, #6b7280)" }}>
        {icon}
        {title}
      </div>
      <div style={{ fontSize: "1.5rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
        <Badge tone={tone} variant="soft">{count}</Badge>
      </div>
      <div style={{ fontSize: "0.75rem", color: "var(--v2-text-muted, #6b7280)" }}>{hint}</div>
    </div>
  );

  return (
    <Card>
      <CardHeader
        title={`Next 60 minutes — until ${horizonClock}`}
        description={
          location
            ? "Slots, tickets, stock, and floor — at a glance."
            : "Pick a single truck to see live ops here."
        }
      />
      <CardBody>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            border: "1px solid var(--v2-border, #e5e7eb)",
            borderRadius: "0.5rem",
            overflow: "hidden",
          }}
        >
          {tile(
            "Slots",
            upcomingSlots.length,
            upcomingSlots.length > 0
              ? `${upcomingCapacity} spots left · earliest ${upcomingSlots[0].time}`
              : location
                ? "No slots in the next hour."
                : "—",
            upcomingCapacity === 0 && upcomingSlots.length > 0 ? "danger" : upcomingSlots.length > 0 ? "success" : "neutral",
            <Clock className="h-3.5 w-3.5" />,
          )}
          {tile(
            "Tickets due",
            dueOrders.length,
            dueOrders.length > 0
              ? `next ${dueOrders[0].slotTime} · ${dueOrders[0].customerName || "Guest"}`
              : "Nothing coming due.",
            dueOrders.length > 5 ? "warning" : dueOrders.length > 0 ? "success" : "neutral",
            <ChefHat className="h-3.5 w-3.5" />,
          )}
          {tile(
            "Low stock",
            sortedLowStock.length,
            sortedLowStock.length > 0
              ? `${sortedLowStock[0].name} ${sortedLowStock[0].onHand}${sortedLowStock[0].unit} of ${sortedLowStock[0].reorderPoint}${sortedLowStock[0].unit}`
              : location
                ? "All ingredients above reorder."
                : "—",
            sortedLowStock.length > 0 ? "danger" : "success",
            <Boxes className="h-3.5 w-3.5" />,
          )}
          {tile(
            "On the floor",
            openShifts,
            openShifts > 0 ? "currently clocked in" : "No one clocked in.",
            openShifts > 0 ? "success" : "warning",
            <HardHat className="h-3.5 w-3.5" />,
          )}
        </div>

        {(dueOrders.length > 0 || sortedLowStock.length > 0) && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "0.75rem",
              marginTop: "0.75rem",
            }}
          >
            {dueOrders.length > 0 && (
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--v2-text-muted, #6b7280)", marginBottom: "0.25rem" }}>
                  TICKETS DUE
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  {dueOrders.map((o) => (
                    <li key={o.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
                      <Link href={`/admin/orders#${o.id}`} className="v2-link-cell">
                        <span className="mono">{o.id.slice(-6).toUpperCase()}</span>
                        <span className="v2-muted"> · {o.customerName || "Guest"}</span>
                      </Link>
                      <span className="v2-muted">{o.slotTime}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {sortedLowStock.length > 0 && (
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--v2-text-muted, #6b7280)", marginBottom: "0.25rem" }}>
                  LOW STOCK
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  {sortedLowStock.map((s) => (
                    <li key={s.name} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
                      <Link href="/admin/inventory" className="v2-link-cell">
                        {s.name}
                      </Link>
                      <span className="v2-muted">
                        {s.onHand}
                        {s.unit} / {s.reorderPoint}
                        {s.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
