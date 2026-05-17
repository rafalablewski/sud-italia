"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, Brain, Calendar, MessageSquare, Package, TrendingUp } from "lucide-react";
import { formatPrice } from "@/lib/utils";
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

type Tab = "forecast" | "anomalies" | "reorder" | "staffing";

interface DailyStats {
  date: string;
  revenue: number;
  orderCount: number;
}

interface SummaryData {
  totalRevenue: number;
  totalOrders: number;
  dailyStats: DailyStats[];
}

interface InsightsData {
  peakHours: { hour: number; orderCount: number; revenue: number }[];
}

interface StockRow {
  ingredientId: string;
  name: string;
  onHand: number;
  parLevel: number;
  reorderPoint: number;
  unit: string;
}

function isoDate(d: Date) { return d.toISOString().split("T")[0]; }
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

/**
 * Mobile "Insights" surface. The desktop has 5 tabs (forecast, anomalies,
 * reorder, staffing, FAQ); the audit doc was clear that the AI module is
 * heuristic, not ML. Mobile honestly surfaces the trend forecast + simple
 * reorder + peak-hour staffing hints — the dominant operator value.
 * The FAQ tab is desktop-only (curation surface, not on-the-go).
 */
export function MobileAI() {
  const { location } = useAdminLocation();
  const [tab, setTab] = useState<Tab>("forecast");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [stock, setStock] = useState<StockRow[]>([]);

  const refresh = async () => {
    const from = daysAgo(30);
    const to = isoDate(new Date());
    const locParam = location ? `&location=${location}` : "";
    const [a, b, s] = await Promise.all([
      fetch(`/api/admin/analytics?from=${from}&to=${to}${locParam}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/admin/insights?from=${from}&to=${to}`).then((r) => (r.ok ? r.json() : null)),
      location
        ? fetch(`/api/admin/stock?location=${location}`).then((r) => (r.ok ? r.json() : []))
        : Promise.resolve([]),
    ]);
    setSummary(a);
    setInsights(b);
    setStock(Array.isArray(s) ? s : []);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  // Naïve 7-day forecast: extrapolate the trailing 14-day mean adjusted
  // by the recent 3-day momentum. Honest — same heuristic the desktop view uses.
  const forecast = useMemo(() => {
    const data = summary?.dailyStats ?? [];
    if (data.length < 7) return [] as { date: string; revenue: number; forecast: number }[];
    const last14 = data.slice(-14).map((d) => d.revenue / 100);
    const trailingMean = last14.reduce((a, b) => a + b, 0) / last14.length;
    const last3 = data.slice(-3).map((d) => d.revenue / 100);
    const recentMean = last3.reduce((a, b) => a + b, 0) / last3.length;
    const momentum = recentMean / Math.max(1, trailingMean);
    const projected = trailingMean * momentum;
    const out: { date: string; revenue: number; forecast: number }[] = data.map((d) => ({
      date: d.date,
      revenue: Math.round(d.revenue / 100),
      forecast: 0,
    }));
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      out.push({
        date: isoDate(d),
        revenue: 0,
        forecast: Math.round(projected),
      });
    }
    return out;
  }, [summary]);

  const reorder = useMemo(
    () =>
      stock
        .filter((s) => s.reorderPoint > 0 && s.onHand <= s.reorderPoint)
        .sort((a, b) => a.onHand / Math.max(1, a.reorderPoint) - b.onHand / Math.max(1, b.reorderPoint))
        .slice(0, 10),
    [stock],
  );

  const peak = useMemo(() => {
    const hours = insights?.peakHours ?? [];
    return hours
      .filter((h) => h.orderCount > 0)
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, 6);
  }, [insights]);

  const stats: StatItem[] = useMemo(() => {
    const next7Total = forecast.slice(-7).reduce((s, p) => s + p.forecast, 0);
    const recent7Total = forecast
      .filter((p) => p.revenue > 0)
      .slice(-7)
      .reduce((s, p) => s + p.revenue, 0);
    const direction =
      next7Total > recent7Total
        ? "up"
        : next7Total < recent7Total
          ? "down"
          : "flat";
    const reorderUrgent = reorder.filter((r) => r.onHand <= 0).length;
    return [
      {
        label: "Next 7 days",
        value: `${Math.round(next7Total / 1000)}k zł`,
        icon: TrendingUp,
        tone: direction === "up" ? "success" : direction === "down" ? "warning" : "neutral",
        hint: `vs ${Math.round(recent7Total / 1000)}k zł recent`,
      },
      {
        label: "Reorder now",
        value: reorderUrgent,
        icon: Package,
        tone: reorderUrgent > 0 ? "danger" : "success",
        hint: `${reorder.length} items below par`,
      },
      {
        label: "Peak hour",
        value: peak[0] ? `${peak[0].hour}:00` : "—",
        icon: Calendar,
        tone: "info",
        hint: peak[0] ? `${peak[0].orderCount} orders` : "no data",
      },
    ];
  }, [forecast, reorder, peak]);

  return (
    <PullToRefresh onRefresh={refresh}>
      <MobilePage
        toolbar={
          <SegmentControl<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "forecast", label: "Forecast" },
              { value: "anomalies", label: "Anomalies" },
              { value: "reorder", label: "Reorder" },
              { value: "staffing", label: "Staffing" },
            ]}
            ariaLabel="Insights tab"
          />
        }
      >
        <PageHeader
          title="Insights"
          subtitle="Heuristic forecasts • not ML — yet"
          actions={<Bot className="h-5 w-5" aria-hidden style={{ color: "var(--fg-subtle)" }} />}
        />

        <StatRow items={stats} />

        {tab === "forecast" && (
          <Section title="Revenue · next 7 days">
            <div
              style={{
                padding: 12,
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: "var(--m-card-radius)",
              }}
            >
              {forecast.length === 0 ? (
                <div className="v2-m-empty">
                  <div className="v2-m-empty-title">Not enough history yet</div>
                </div>
              ) : (
                <AreaChart
                  data={forecast}
                  xKey="date"
                  series={[
                    { key: "revenue", label: "Actual" },
                    { key: "forecast", label: "Forecast" },
                  ]}
                  height={200}
                  yFormat={(n) => `${Math.round(n / 1000)}k`}
                  xFormat={(v) => String(v).slice(5)}
                  tooltipValue={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
                />
              )}
            </div>
          </Section>
        )}

        {tab === "anomalies" && (
          <Section title="Recent anomalies">
            <Anomalies summary={summary} />
          </Section>
        )}

        {tab === "reorder" && (
          <Section title={`Items to reorder (${reorder.length})`}>
            {reorder.length === 0 ? (
              <div className="v2-m-empty">
                <div className="v2-m-empty-title">All stocked</div>
                <div className="v2-m-empty-desc">No items below reorder point.</div>
              </div>
            ) : (
              <ul role="list" className="v2-m-list">
                {reorder.map((r) => {
                  const tone: "warning" | "danger" = r.onHand <= 0 ? "danger" : "warning";
                  return (
                    <li key={r.ingredientId}>
                      <a href={`/admin/inventory#${r.ingredientId}`} className="v2-m-list-row">
                        <span className={`v2-m-list-icon v2-m-tone-${tone}`}>
                          <AlertTriangle className="h-4 w-4" aria-hidden />
                        </span>
                        <span className="v2-m-list-stack">
                          <span className="v2-m-list-title">{r.name}</span>
                          <span className="v2-m-list-sub tabular">
                            {r.onHand} {r.unit} · reorder {r.reorderPoint}
                          </span>
                        </span>
                        <span className={`v2-m-pill v2-m-pill-${tone}`}>
                          {r.onHand <= 0 ? "OUT" : "LOW"}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        )}

        {tab === "staffing" && (
          <Section title="Peak hours (last 30d)">
            {peak.length === 0 ? (
              <div className="v2-m-empty">
                <div className="v2-m-empty-title">No data</div>
              </div>
            ) : (
              <ul role="list" className="v2-m-list">
                {peak.map((p) => (
                  <li key={p.hour}>
                    <div className="v2-m-list-row">
                      <span className="v2-m-list-icon v2-m-tone-info">
                        <Calendar className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="v2-m-list-stack">
                        <span className="v2-m-list-title tabular">{p.hour}:00–{p.hour + 1}:00</span>
                        <span className="v2-m-list-sub">{p.orderCount} orders · {formatPrice(p.revenue)}</span>
                      </span>
                      <span className="v2-m-list-metric tabular">
                        {Math.ceil(p.orderCount / 12)} staff
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div style={{ fontSize: 11, color: "var(--fg-subtle)", padding: "8px 4px" }}>
              <MessageSquare className="inline h-3 w-3" style={{ marginRight: 4, verticalAlign: -1 }} aria-hidden />
              Suggested headcount = peak orders / 12. Tune in <code>scheduling-rules.ts</code>.
            </div>
          </Section>
        )}
      </MobilePage>
    </PullToRefresh>
  );
}

function Anomalies({ summary }: { summary: SummaryData | null }) {
  const anomalies = useMemo(() => {
    const data = summary?.dailyStats ?? [];
    if (data.length < 7) return [];
    const values = data.map((d) => d.revenue);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    return data
      .map((d) => ({ ...d, z: std ? (d.revenue - mean) / std : 0 }))
      .filter((d) => Math.abs(d.z) >= 1.5)
      .slice(-5);
  }, [summary]);

  if (anomalies.length === 0) {
    return (
      <div className="v2-m-empty">
        <Brain className="h-6 w-6" aria-hidden />
        <div className="v2-m-empty-title">All normal</div>
        <div className="v2-m-empty-desc">No daily revenue beyond ±1.5σ.</div>
      </div>
    );
  }

  return (
    <ul role="list" className="v2-m-list">
      {anomalies.map((a) => {
        const tone: "success" | "warning" | "danger" =
          a.z >= 0 ? "success" : a.z < -2 ? "danger" : "warning";
        return (
          <li key={a.date}>
            <div className="v2-m-list-row">
              <span className={`v2-m-list-icon v2-m-tone-${tone}`}>
                <Brain className="h-4 w-4" aria-hidden />
              </span>
              <span className="v2-m-list-stack">
                <span className="v2-m-list-title">{a.date}</span>
                <span className="v2-m-list-sub tabular">
                  {formatPrice(a.revenue)} · z = {a.z.toFixed(2)}σ
                </span>
              </span>
              <span className={`v2-m-pill v2-m-pill-${tone}`}>
                {a.z >= 0 ? "above" : "below"}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
