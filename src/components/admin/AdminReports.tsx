"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Coins,
  DollarSign,
  Download,
  HandCoins,
  PiggyBank,
  Receipt,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { useAdminLocation } from "./v2/LocationContext";
import { useToast } from "./v2/ui/Toast";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  Tabs,
  Table,
  type Column,
} from "./v2/ui";
import { AreaChart, BarChart, KpiCard, PieChart } from "./v2/charts";

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

type RangePreset = "today" | "7d" | "30d" | "90d" | "custom";

const PRESET_DAYS: Record<Exclude<RangePreset, "custom">, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function presetRange(p: Exclude<RangePreset, "custom">): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (PRESET_DAYS[p] - 1));
  return { from: isoDate(from), to: isoDate(to) };
}

function pctDelta(a: number, b: number): number | undefined {
  if (!b) return undefined;
  return ((a - b) / b) * 100;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) =>
      r
        .map((cell) => {
          const v = String(cell ?? "");
          if (v.includes(",") || v.includes('"') || v.includes("\n")) {
            return `"${v.replace(/"/g, '""')}"`;
          }
          return v;
        })
        .join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AdminReports() {
  const { location } = useAdminLocation();
  const toast = useToast();

  const [preset, setPreset] = useState<RangePreset>("30d");
  const [from, setFrom] = useState<string>(() => presetRange("30d").from);
  const [to, setTo] = useState<string>(() => presetRange("30d").to);

  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [prevSummary, setPrevSummary] = useState<SummaryData | null>(null);
  const [tipReport, setTipReport] = useState<{
    days: { date: string; tipGrosze: number; tippedOrders: number }[];
    totals: {
      totalTipGrosze: number;
      totalTippedOrders: number;
      averageTipRate: number;
      averageTipPerOrder: number;
    };
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const locParam = location ? `&location=${location}` : "";
      const [a, tips] = await Promise.all([
        fetch(`/api/admin/analytics?from=${from}&to=${to}${locParam}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/admin/reports/tips?from=${from}&to=${to}${locParam}`).then((r) => (r.ok ? r.json() : null)),
      ]);
      setSummary(a);
      setTipReport(tips);

      // Previous-window delta computation
      const days = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000 + 1;
      const prevTo = new Date(from);
      prevTo.setDate(prevTo.getDate() - 1);
      const prevFrom = new Date(prevTo);
      prevFrom.setDate(prevFrom.getDate() - (days - 1));
      const b = await fetch(
        `/api/admin/analytics?from=${isoDate(prevFrom)}&to=${isoDate(prevTo)}${locParam}`,
      ).then((r) => (r.ok ? r.json() : null));
      setPrevSummary(b);
    } finally {
      setLoading(false);
    }
  }, [from, to, location]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const onPreset = (p: RangePreset) => {
    setPreset(p);
    if (p !== "custom") {
      const r = presetRange(p);
      setFrom(r.from);
      setTo(r.to);
    }
  };

  const trendData = useMemo(() => {
    if (!summary?.dailyStats) return [];
    return summary.dailyStats.map((d) => ({
      date: d.date,
      revenue: Math.round(d.revenue / 100),
      cost: Math.round(d.cost / 100),
      profit: Math.round(d.profit / 100),
    }));
  }, [summary]);

  const ordersTrend = useMemo(() => {
    if (!summary?.dailyStats) return [];
    return summary.dailyStats.map((d) => ({
      date: d.date,
      orders: d.orderCount,
      aov: Math.round(d.avgOrderValue / 100),
    }));
  }, [summary]);

  const categoryRows = useMemo(() => {
    const map = summary?.categoryBreakdown ?? {};
    return Object.entries(map)
      .map(([cat, v]) => ({
        category: cat,
        revenue: v.revenue,
        cost: v.cost,
        count: v.count,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [summary]);

  const categoryPie = useMemo(
    () => categoryRows.map((c) => ({ name: c.category, value: Math.round(c.revenue / 100) })),
    [categoryRows],
  );

  const topItems = (summary?.topItems ?? []).slice(0, 10);

  const k = {
    revenue: summary?.totalRevenue ?? 0,
    revenuePrev: prevSummary?.totalRevenue ?? 0,
    cost: summary?.totalCost ?? 0,
    profit: summary?.totalProfit ?? 0,
    profitPrev: prevSummary?.totalProfit ?? 0,
    margin: summary?.profitMargin ?? 0,
    marginPrev: prevSummary?.profitMargin ?? 0,
    orders: summary?.totalOrders ?? 0,
    ordersPrev: prevSummary?.totalOrders ?? 0,
    aov: summary?.avgOrderValue ?? 0,
    aovPrev: prevSummary?.avgOrderValue ?? 0,
  };

  const handleExport = () => {
    if (!summary) return;
    const rows: (string | number)[][] = [
      ["Date", "Revenue (PLN)", "Cost (PLN)", "Profit (PLN)", "Margin %", "Orders", "Items", "AOV (PLN)", "Takeout", "Delivery"],
      ...summary.dailyStats.map((d) => [
        d.date,
        (d.revenue / 100).toFixed(2),
        (d.cost / 100).toFixed(2),
        (d.profit / 100).toFixed(2),
        d.revenue > 0 ? (((d.revenue - d.cost) / d.revenue) * 100).toFixed(1) : "0.0",
        d.orderCount,
        d.itemCount,
        (d.avgOrderValue / 100).toFixed(2),
        d.takeoutCount,
        d.deliveryCount,
      ]),
    ];
    downloadCsv(`reports-${from}_${to}.csv`, rows);
    toast.success("CSV exported", `${summary.dailyStats.length} day(s)`);
  };

  const categoryCols: Column<(typeof categoryRows)[number]>[] = [
    { key: "cat", header: "Category", cell: (r) => <span style={{ textTransform: "capitalize" }}>{r.category}</span>, sortValue: (r) => r.category },
    { key: "rev", header: "Revenue", align: "right", cell: (r) => formatPrice(r.revenue), sortValue: (r) => r.revenue },
    { key: "cost", header: "Cost", align: "right", cell: (r) => formatPrice(r.cost), sortValue: (r) => r.cost },
    { key: "profit", header: "Profit", align: "right", cell: (r) => formatPrice(r.revenue - r.cost), sortValue: (r) => r.revenue - r.cost },
    {
      key: "margin",
      header: "Margin",
      align: "right",
      cell: (r) => {
        const m = r.revenue > 0 ? Math.round(((r.revenue - r.cost) / r.revenue) * 100) : 0;
        return (
          <Badge tone={m < 50 ? "danger" : m < 65 ? "warning" : "success"} variant="soft">
            {m}%
          </Badge>
        );
      },
      sortValue: (r) => (r.revenue > 0 ? (r.revenue - r.cost) / r.revenue : 0),
    },
    { key: "qty", header: "Items sold", align: "right", cell: (r) => r.count.toLocaleString(), sortValue: (r) => r.count },
  ];

  const itemCols: Column<(typeof topItems)[number]>[] = [
    { key: "name", header: "Item", cell: (r) => r.name, sortValue: (r) => r.name },
    { key: "qty", header: "Sold", align: "right", cell: (r) => r.quantity, sortValue: (r) => r.quantity },
    { key: "rev", header: "Revenue", align: "right", cell: (r) => formatPrice(r.revenue), sortValue: (r) => r.revenue },
  ];

  const channelMix = useMemo(() => {
    const t = summary?.takeoutCount ?? 0;
    const d = summary?.deliveryCount ?? 0;
    return [
      { name: "Takeout", value: t },
      { name: "Delivery", value: d },
    ].filter((r) => r.value > 0);
  }, [summary]);

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Reports & Finance</h1>
          <p className="v2-page-subtitle">
            {location ? `${location.toUpperCase()} · ` : "All locations · "}
            Revenue, cost of goods, profit, category mix. Real numbers from real orders.
          </p>
        </div>
        <div className="v2-page-actions">
          <Tabs
            value={preset}
            onChange={(v) => onPreset(v as RangePreset)}
            tabs={[
              { value: "today", label: "Today" },
              { value: "7d", label: "7d" },
              { value: "30d", label: "30d" },
              { value: "90d", label: "90d" },
              { value: "custom", label: "Custom" },
            ]}
            variant="pill"
            ariaLabel="Range preset"
          />
          <Button variant="secondary" leadingIcon={<Download className="h-3.5 w-3.5" />} onClick={handleExport} disabled={!summary}>
            Export CSV
          </Button>
        </div>
      </header>

      {preset === "custom" && (
        <div className="v2-filters">
          <Input type="date" label="From" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" label="To" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      )}

      <section className="v2-kpi-grid">
        <KpiCard
          label="Revenue"
          value={k.revenue / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          delta={pctDelta(k.revenue, k.revenuePrev)}
          icon={DollarSign}
          tone="brand"
        />
        <KpiCard
          label="COGS"
          value={k.cost / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Coins}
          tone="warning"
          higherIsBetter={false}
        />
        <KpiCard
          label="Gross profit"
          value={k.profit / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          delta={pctDelta(k.profit, k.profitPrev)}
          icon={PiggyBank}
          tone="success"
        />
        <KpiCard
          label="Margin"
          value={k.margin}
          display={`${k.margin.toFixed(1)}%`}
          delta={pctDelta(k.margin, k.marginPrev)}
          icon={k.margin >= k.marginPrev ? TrendingUp : TrendingDown}
          tone={k.margin >= 60 ? "success" : k.margin >= 45 ? "warning" : "danger"}
        />
        <KpiCard
          label="Orders"
          value={k.orders}
          delta={pctDelta(k.orders, k.ordersPrev)}
          icon={ShoppingCart}
          tone="info"
        />
        <KpiCard
          label="Avg order value"
          value={k.aov / 100}
          format={(n) => `${n.toFixed(2)} zł`}
          delta={pctDelta(k.aov, k.aovPrev)}
          icon={Receipt}
          tone="success"
        />
        <KpiCard
          label="Tips"
          value={(tipReport?.totals.totalTipGrosze ?? 0) / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={HandCoins}
          tone="success"
          hint={
            tipReport && tipReport.totals.totalTippedOrders > 0
              ? `${tipReport.totals.totalTippedOrders} tipped orders · avg ${formatPrice(tipReport.totals.averageTipPerOrder)} (${(tipReport.totals.averageTipRate * 100).toFixed(1)}% of revenue)`
              : "No tips in this window"
          }
        />
      </section>

      <section className="v2-grid-2-1">
        <Card>
          <CardHeader title="Revenue, cost, profit" description="Daily totals in zł" />
          <CardBody>
            {trendData.length === 0 ? (
              <EmptyState icon={BarChart3} title="No data" description="No orders in the selected window." compact />
            ) : (
              <AreaChart
                data={trendData}
                xKey="date"
                series={[
                  { key: "revenue", label: "Revenue" },
                  { key: "cost", label: "Cost" },
                  { key: "profit", label: "Profit" },
                ]}
                height={280}
                yFormat={(n) => `${Math.round(n / 1000)}k`}
                xFormat={(v) => String(v).slice(5)}
                tooltipValue={(n) => `${n.toLocaleString("pl-PL")} zł`}
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Channel mix" description="Orders by fulfillment type" />
          <CardBody>
            {channelMix.length === 0 ? (
              <EmptyState icon={ShoppingCart} title="No channel data" compact />
            ) : (
              <PieChart data={channelMix} format={(n, name) => `${n} ${name}`} />
            )}
          </CardBody>
        </Card>
      </section>

      <section className="v2-grid-2">
        <Card>
          <CardHeader title="Orders & AOV" description="Volume vs basket size" />
          <CardBody>
            {ordersTrend.length === 0 ? (
              <EmptyState icon={ShoppingCart} title="No orders" compact />
            ) : (
              <BarChart
                data={ordersTrend}
                xKey="date"
                series={[{ key: "orders", label: "Orders" }]}
                height={240}
                xFormat={(v) => String(v).slice(5)}
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Category revenue share" description="By dish category" />
          <CardBody>
            {categoryPie.length === 0 ? (
              <EmptyState icon={BarChart3} title="No category data" compact />
            ) : (
              <PieChart data={categoryPie} format={(n) => `${n.toLocaleString("pl-PL")} zł`} />
            )}
          </CardBody>
        </Card>
      </section>

      <section>
        <Card padding="none">
          <CardHeader title="Category P&L" description="Per dish category, sortable" />
          <CardBody>
            {categoryRows.length === 0 ? (
              <EmptyState icon={BarChart3} title="No category data" compact />
            ) : (
              <Table rows={categoryRows} columns={categoryCols} rowKey={(r) => r.category} defaultSort={{ key: "rev", dir: "desc" }} />
            )}
          </CardBody>
        </Card>
      </section>

      <section>
        <Card padding="none">
          <CardHeader title="Top items" description="Best-selling SKUs in the selected period" />
          <CardBody>
            {topItems.length === 0 ? (
              <EmptyState icon={ShoppingCart} title="No items sold" compact />
            ) : (
              <Table rows={topItems} columns={itemCols} rowKey={(r) => r.name} defaultSort={{ key: "rev", dir: "desc" }} />
            )}
          </CardBody>
        </Card>
      </section>

      {loading && <div className="v2-page-loading">Loading…</div>}
    </div>
  );
}
