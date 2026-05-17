"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, ClipboardList, Download, PiggyBank, Receipt } from "lucide-react";
import { useAdminLocation } from "../v2/LocationContext";
import {
  MobilePage,
  PageHeader,
  PullToRefresh,
  SegmentControl,
  Section,
  StatRow,
  type StatItem,
} from "../v2/mobile";
import { AreaChart } from "../v2/charts";
import { Sparkline } from "../v2/charts/Sparkline";

type Period = "today" | "7d" | "30d" | "90d";

interface SummaryData {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  profitMargin: number;
  totalOrders: number;
  totalItems: number;
  avgOrderValue: number;
  dailyStats: { date: string; revenue: number; profit: number; orderCount: number }[];
  topItems: { name: string; quantity: number; revenue: number }[];
  categoryBreakdown: Record<string, { revenue: number; cost: number; count: number }>;
}

const PERIOD_DAYS: Record<Period, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 };
function isoDate(d: Date) { return d.toISOString().split("T")[0]; }
function dateRange(p: Period) {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (PERIOD_DAYS[p] - 1));
  return { from: isoDate(from), to: isoDate(to) };
}
function previousRange(p: Period) {
  const days = PERIOD_DAYS[p];
  const to = new Date(); to.setDate(to.getDate() - days);
  const from = new Date(); from.setDate(from.getDate() - days * 2 + 1);
  return { from: isoDate(from), to: isoDate(to) };
}
function pctDelta(a: number, b: number): number | undefined {
  if (!b) return undefined;
  return ((a - b) / b) * 100;
}
function fmtZl(grosze: number): string {
  const zl = grosze / 100;
  if (Math.abs(zl) >= 1000) return `${(zl / 1000).toFixed(1)}k zł`;
  return `${Math.round(zl).toLocaleString("pl-PL")} zł`;
}

/**
 * Mobile financial reports. KPI pager + revenue trend + category split +
 * top items. Side-by-side charts are stacked; CSV export is a single
 * tap. The desktop view (~250 LOC) reflows poorly on a phone.
 */
export function MobileReports() {
  const { location } = useAdminLocation();
  const [period, setPeriod] = useState<Period>("7d");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [prev, setPrev] = useState<SummaryData | null>(null);

  const refresh = useCallback(async () => {
    const { from, to } = dateRange(period);
    const p = previousRange(period);
    const loc = location ? `&location=${location}` : "";
    const [a, b] = await Promise.all([
      fetch(`/api/admin/analytics?from=${from}&to=${to}${loc}`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/admin/analytics?from=${p.from}&to=${p.to}${loc}`).then((r) => r.ok ? r.json() : null),
    ]);
    setSummary(a);
    setPrev(b);
  }, [period, location]);

  useEffect(() => { refresh(); }, [refresh]);

  const stats: StatItem[] = useMemo(() => {
    const s = summary;
    if (!s) return [];
    const spark = s.dailyStats.map((d) => d.revenue / 100);
    return [
      {
        label: "Revenue",
        value: fmtZl(s.totalRevenue),
        delta: pctDelta(s.totalRevenue, prev?.totalRevenue ?? 0),
        higherIsBetter: true,
        icon: Banknote,
        tone: "brand",
        trend: spark.length > 1 ? <Sparkline values={spark} color="var(--brand)" /> : null,
      },
      {
        label: "Profit",
        value: fmtZl(s.totalProfit),
        delta: pctDelta(s.totalProfit, prev?.totalProfit ?? 0),
        higherIsBetter: true,
        icon: PiggyBank,
        tone: "success",
        hint: `${s.profitMargin.toFixed(1)}% margin`,
      },
      {
        label: "Orders",
        value: s.totalOrders.toLocaleString("pl-PL"),
        delta: pctDelta(s.totalOrders, prev?.totalOrders ?? 0),
        higherIsBetter: true,
        icon: ClipboardList,
        tone: "info",
      },
      {
        label: "AOV",
        value: fmtZl(s.avgOrderValue),
        delta: pctDelta(s.avgOrderValue, prev?.avgOrderValue ?? 0),
        higherIsBetter: true,
        icon: Receipt,
        tone: "success",
      },
    ];
  }, [summary, prev]);

  const trend = useMemo(
    () => (summary?.dailyStats ?? []).map((d) => ({
      date: d.date,
      revenue: Math.round(d.revenue / 100),
      profit: Math.round(d.profit / 100),
    })),
    [summary],
  );

  const categories = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.categoryBreakdown)
      .map(([cat, v]) => ({ cat, revenue: v.revenue, count: v.count }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [summary]);

  const totalCatRevenue = useMemo(
    () => categories.reduce((a, c) => a + c.revenue, 0),
    [categories],
  );

  const downloadCsv = () => {
    if (!summary) return;
    const { from, to } = dateRange(period);
    const loc = location ? `&location=${location}` : "";
    window.location.href = `/api/admin/reports/export.csv?from=${from}&to=${to}${loc}`;
  };

  return (
    <PullToRefresh onRefresh={refresh}>
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
            ariaLabel="Period"
          />
        }
      >
        <PageHeader
          title="Reports"
          subtitle={location ? location.toUpperCase() : "All locations"}
          actions={
            <button
              type="button"
              className="v2-m-icon-btn"
              aria-label="Export CSV"
              onClick={downloadCsv}
            >
              <Download className="h-5 w-5" />
            </button>
          }
        />

        <StatRow items={stats} />

        <Section title="Revenue & profit">
          <div
            style={{
              padding: 12,
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              borderRadius: "var(--m-card-radius)",
            }}
          >
            {trend.length === 0 ? (
              <div className="v2-m-empty">
                <div className="v2-m-empty-title">No orders in this period</div>
              </div>
            ) : (
              <AreaChart
                data={trend}
                xKey="date"
                series={[
                  { key: "revenue", label: "Revenue" },
                  { key: "profit", label: "Profit" },
                ]}
                height={200}
                yFormat={(n) => `${Math.round(n / 1000)}k`}
                xFormat={(v) => String(v).slice(5)}
                tooltipValue={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
              />
            )}
          </div>
        </Section>

        {categories.length > 0 && (
          <Section title="By category">
            <ul role="list" className="v2-m-list">
              {categories.map((c) => {
                const pct = totalCatRevenue ? (c.revenue / totalCatRevenue) * 100 : 0;
                return (
                  <li key={c.cat}>
                    <div className="v2-m-list-row">
                      <span className="v2-m-list-stack">
                        <span className="v2-m-list-title" style={{ textTransform: "capitalize" }}>
                          {c.cat}
                        </span>
                        <span className="v2-m-list-sub">{c.count} sold</span>
                        <span
                          aria-hidden
                          style={{
                            display: "block",
                            height: 3,
                            background: "var(--surface-3)",
                            borderRadius: 2,
                            marginTop: 6,
                            overflow: "hidden",
                          }}
                        >
                          <span
                            style={{
                              display: "block",
                              width: `${pct}%`,
                              height: "100%",
                              background: "var(--brand)",
                              transition: "width 220ms cubic-bezier(0.32,0.72,0,1)",
                            }}
                          />
                        </span>
                      </span>
                      <span className="v2-m-list-metric tabular">{fmtZl(c.revenue)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        <Section title={`Top sellers (${summary?.topItems.length ?? 0})`}>
          <ul role="list" className="v2-m-list">
            {(summary?.topItems ?? []).slice(0, 10).map((t, i) => (
              <li key={t.name}>
                <div className="v2-m-list-row">
                  <span className="v2-m-list-icon v2-m-tone-neutral">
                    <span style={{ fontWeight: 600, fontSize: 12 }}>{i + 1}</span>
                  </span>
                  <span className="v2-m-list-stack">
                    <span className="v2-m-list-title">{t.name}</span>
                    <span className="v2-m-list-sub">{t.quantity} sold</span>
                  </span>
                  <span className="v2-m-list-metric tabular">{fmtZl(t.revenue)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </MobilePage>
    </PullToRefresh>
  );
}
