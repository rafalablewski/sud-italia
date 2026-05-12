"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Award,
  Banknote,
  Clock,
  MapPin,
  PiggyBank,
  Receipt,
  ShoppingBag,
  Trophy,
} from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { Badge, Card, CardBody, CardHeader, EmptyState, Tabs } from "./v2/ui";
import { AreaChart, BarChart, KpiCard } from "./v2/charts";
import { formatPrice } from "@/lib/utils";

interface LocationComparison {
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
}

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
}

interface InsightsData {
  locationComparison: LocationComparison[];
}

type Period = "today" | "7d" | "30d" | "90d";

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

const activeLocations = getActiveLocations();

export function AdminLocations() {
  const [period, setPeriod] = useState<Period>("30d");
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [perLoc, setPerLoc] = useState<Map<string, SummaryData>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = dateRange(period);
      const [ins, ...summaries] = await Promise.all([
        fetch(`/api/admin/insights?from=${from}&to=${to}`).then((r) => (r.ok ? r.json() : null)),
        ...activeLocations.map((l) =>
          fetch(`/api/admin/analytics?from=${from}&to=${to}&location=${l.slug}`).then((r) =>
            r.ok ? r.json() : null,
          ),
        ),
      ]);
      setInsights(ins);
      const map = new Map<string, SummaryData>();
      activeLocations.forEach((l, i) => {
        if (summaries[i]) map.set(l.slug, summaries[i] as SummaryData);
      });
      setPerLoc(map);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const comparison = insights?.locationComparison ?? [];

  // Identify the "winner" per metric for highlight badges
  const winners = useMemo(() => {
    const w: Record<string, string | undefined> = {};
    if (comparison.length === 0) return w;
    const pick = (key: keyof LocationComparison, dir: "max" | "min") => {
      const reducer = (best: LocationComparison, c: LocationComparison) => {
        const a = c[key] as number;
        const b = best[key] as number;
        return dir === "max" ? (a > b ? c : best) : a < b ? c : best;
      };
      return comparison.reduce(reducer).locationSlug;
    };
    w.revenue = pick("revenue", "max");
    w.profit = pick("profit", "max");
    w.margin = pick("profitMargin", "max");
    w.orders = pick("orderCount", "max");
    w.aov = pick("avgOrderValue", "max");
    w.cancellation = pick("cancellationRate", "min");
    return w;
  }, [comparison]);

  // Trend chart: pivot daily stats per location into a wide row per date
  const trendData = useMemo(() => {
    const dates = new Set<string>();
    perLoc.forEach((s) => s.dailyStats.forEach((d) => dates.add(d.date)));
    const sortedDates = Array.from(dates).sort();
    return sortedDates.map((date) => {
      const row: Record<string, string | number> = { date };
      perLoc.forEach((s, slug) => {
        const day = s.dailyStats.find((d) => d.date === date);
        row[slug] = day ? Math.round(day.revenue / 100) : 0;
      });
      return row;
    });
  }, [perLoc]);

  const trendSeries = activeLocations.map((l) => ({
    key: l.slug,
    label: l.city,
  }));

  // Comparison bar chart (orders + revenue side-by-side)
  const ordersBarData = comparison.map((c) => ({
    city: c.city,
    orders: c.orderCount,
    revenue: Math.round(c.revenue / 100),
  }));

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Multi-location</h1>
          <p className="v2-page-subtitle">Side-by-side benchmark across active locations.</p>
        </div>
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
          ariaLabel="Range"
        />
      </header>

      {loading ? (
        <div className="v2-page-loading">Loading benchmark…</div>
      ) : comparison.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={MapPin}
              title="Not enough data yet"
              description="Once both locations have orders in the selected period, the comparison fills in here."
            />
          </CardBody>
        </Card>
      ) : (
        <>
          <section className="v2-grid-2">
            {comparison.map((c) => (
              <Card key={c.locationSlug}>
                <CardHeader
                  title={
                    <span className="v2-inline">
                      <MapPin className="h-4 w-4 v2-muted" />
                      <span>{c.city}</span>
                    </span>
                  }
                  description={`${c.orderCount.toLocaleString()} orders · ${c.avgItemsPerOrder.toFixed(1)} items/order`}
                />
                <CardBody>
                  <div className="v2-loc-stats">
                    <StatLine
                      icon={Banknote}
                      label="Revenue"
                      value={formatPrice(c.revenue)}
                      winner={winners.revenue === c.locationSlug}
                    />
                    <StatLine
                      icon={PiggyBank}
                      label="Profit"
                      value={formatPrice(c.profit)}
                      winner={winners.profit === c.locationSlug}
                    />
                    <StatLine
                      icon={Trophy}
                      label="Margin"
                      value={`${c.profitMargin.toFixed(1)}%`}
                      winner={winners.margin === c.locationSlug}
                    />
                    <StatLine
                      icon={ShoppingBag}
                      label="Orders"
                      value={c.orderCount.toLocaleString()}
                      winner={winners.orders === c.locationSlug}
                    />
                    <StatLine
                      icon={Receipt}
                      label="AOV"
                      value={formatPrice(c.avgOrderValue)}
                      winner={winners.aov === c.locationSlug}
                    />
                    <StatLine
                      icon={Clock}
                      label="Cancel rate"
                      value={`${c.cancellationRate.toFixed(1)}%`}
                      tone={c.cancellationRate > 10 ? "danger" : c.cancellationRate > 5 ? "warning" : "success"}
                      winner={winners.cancellation === c.locationSlug}
                      winnerHint="Lowest"
                    />
                  </div>
                </CardBody>
              </Card>
            ))}
          </section>

          <section className="v2-kpi-grid">
            <KpiCard
              label="Combined revenue"
              value={comparison.reduce((acc, c) => acc + c.revenue, 0) / 100}
              format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
              icon={Banknote}
              tone="brand"
            />
            <KpiCard
              label="Combined orders"
              value={comparison.reduce((acc, c) => acc + c.orderCount, 0)}
              icon={ShoppingBag}
              tone="info"
            />
            <KpiCard
              label="Combined profit"
              value={comparison.reduce((acc, c) => acc + c.profit, 0) / 100}
              format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
              icon={PiggyBank}
              tone="success"
            />
            <KpiCard
              label="Cancellation rate"
              value={(() => {
                const tot = comparison.reduce((acc, c) => acc + c.orderCount + c.cancelledCount, 0);
                const can = comparison.reduce((acc, c) => acc + c.cancelledCount, 0);
                return tot > 0 ? (can / tot) * 100 : 0;
              })()}
              display={`${(() => {
                const tot = comparison.reduce((acc, c) => acc + c.orderCount + c.cancelledCount, 0);
                const can = comparison.reduce((acc, c) => acc + c.cancelledCount, 0);
                return tot > 0 ? ((can / tot) * 100).toFixed(1) : "0.0";
              })()}%`}
              icon={Award}
              tone="warning"
              higherIsBetter={false}
            />
          </section>

          <section className="v2-grid-2-1">
            <Card>
              <CardHeader title="Revenue over time" description="Daily totals per location" />
              <CardBody>
                {trendData.length === 0 ? (
                  <EmptyState icon={Banknote} title="No data" compact />
                ) : (
                  <AreaChart
                    data={trendData as Array<Record<string, unknown>>}
                    xKey="date"
                    series={trendSeries}
                    height={280}
                    yFormat={(n) => `${Math.round(n / 1000)}k`}
                    xFormat={(v) => String(v).slice(5)}
                    tooltipValue={(n) => `${n.toLocaleString("pl-PL")} zł`}
                  />
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Order volume" description="Total orders by location" />
              <CardBody>
                {ordersBarData.length === 0 ? (
                  <EmptyState icon={ShoppingBag} title="No data" compact />
                ) : (
                  <BarChart
                    data={ordersBarData}
                    xKey="city"
                    series={[{ key: "orders", label: "Orders" }]}
                    height={280}
                  />
                )}
              </CardBody>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

interface StatLineProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  winner?: boolean;
  winnerHint?: string;
  tone?: "success" | "warning" | "danger" | "neutral";
}

function StatLine({ icon: Icon, label, value, winner, winnerHint = "Leader", tone = "neutral" }: StatLineProps) {
  return (
    <div className="v2-loc-stat-line">
      <span className="v2-loc-stat-label">
        <Icon className="h-3.5 w-3.5 v2-muted" />
        {label}
      </span>
      <span className="v2-loc-stat-value">
        <span className="tabular">{value}</span>
        {winner && (
          <Badge tone={tone === "neutral" ? "success" : tone} variant="soft">
            <Trophy className="h-3 w-3" /> {winnerHint}
          </Badge>
        )}
      </span>
    </div>
  );
}
