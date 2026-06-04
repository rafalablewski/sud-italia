"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Brain,
  CheckCircle2,
  ChefHat,
  Coins,
  Lightbulb,
  MessageSquare,
  Plus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trash2,
} from "lucide-react";
import { useAdminLocation } from "./v2/LocationContext";
import { useToast } from "./v2/ui/Toast";

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  EmptyState,
  Input,
  Tabs,
  Table,
  Textarea,
  type Column,
  PageHero,
} from "./v2/ui";
import { AreaChart, KpiCard } from "./v2/charts";
import { formatPrice } from "@/lib/utils";

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
  totalOrders: number;
  dailyStats: DailyStats[];
  topItems: { name: string; quantity: number; revenue: number }[];
}

interface InsightsData {
  peakHours: { hour: number; orderCount: number; revenue: number }[];
}

interface StockRow {
  ingredientId: string;
  locationSlug: string;
  onHand: number;
  parLevel: number;
  reorderPoint: number;
  unit: string;
  costPerUnit: number;
  name: string;
}

interface FaqRow {
  id: string;
  keyword: string;
  response: string;
  hits?: number;
}

type TabKey = "forecast" | "anomalies" | "reorder" | "staffing" | "faq";

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

function rollingAverage(values: number[], window: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    out.push(slice.reduce((acc, v) => acc + v, 0) / slice.length);
  }
  return out;
}

export function AdminAI() {
  return <AdminAIDesktop />;
}

function AdminAIDesktop() {
  const { location } = useAdminLocation();
  const toast = useToast();
  const [tab, setTab] = useState<TabKey>("forecast");

  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Audit §3 — Claude-backed forecast pulled from /api/admin/ai/forecast
  // when the gateway is configured. Falls back to the in-component MA
  // when the endpoint replies with source="ma" (or never returns).
  const [aiForecast, setAiForecast] = useState<{
    source: "claude" | "ma";
    days: { date: string; predictedOrders: number; lower: number; upper: number }[];
    reasoning: string;
    generatedAt: string;
  } | null>(null);

  const [faqDialog, setFaqDialog] = useState<{ open: boolean; faq: FaqRow | null }>({ open: false, faq: null });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const from = daysAgo(28);
      const to = isoDate(new Date());
      const locParam = location ? `&location=${location}` : "";
      const forecastParam = location ? `?location=${location}` : "";
      const [a, ins, s, f, fc] = await Promise.all([
        fetch(`/api/admin/analytics?from=${from}&to=${to}${locParam}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/admin/insights?from=${from}&to=${to}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/admin/stock${location ? `?location=${location}` : ""}`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/admin/chatbot-faq`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/admin/ai/forecast${forecastParam}`).then((r) => (r.ok ? r.json() : null)),
      ]);
      setSummary(a);
      setInsights(ins);
      setStock(Array.isArray(s) ? s : []);
      setFaqs(Array.isArray(f) ? f : []);
      setAiForecast(fc && Array.isArray(fc.days) ? fc : null);
    } finally {
      setLoading(false);
    }
  }, [location]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // --- Demand forecast: 7-day moving average + naive next-7-day projection ---
  const forecast = useMemo(() => {
    const daily = summary?.dailyStats ?? [];
    if (daily.length === 0) return { rows: [], trend: 0 };
    const ordersByDate = new Map(daily.map((d) => [d.date, d.orderCount]));
    const dates = Array.from(ordersByDate.keys()).sort();
    const values = dates.map((d) => ordersByDate.get(d) || 0);
    const ma = rollingAverage(values, 7);

    // Project: use most recent MA value across the next 7 days
    const lastMa = ma[ma.length - 1] ?? 0;
    const projected: { date: string; actual?: number; ma?: number; forecast?: number }[] = dates.map((d, i) => ({
      date: d,
      actual: values[i],
      ma: Math.round(ma[i] * 10) / 10,
    }));

    const lastDate = dates[dates.length - 1];
    if (lastDate) {
      for (let i = 1; i <= 7; i++) {
        const d = new Date(lastDate);
        d.setDate(d.getDate() + i);
        projected.push({ date: isoDate(d), forecast: Math.round(lastMa * 10) / 10 });
      }
    }

    // Trend: slope of last 7 days vs prior 7 days
    const last7 = values.slice(-7).reduce((a, b) => a + b, 0);
    const prev7 = values.slice(-14, -7).reduce((a, b) => a + b, 0);
    const trend = prev7 > 0 ? ((last7 - prev7) / prev7) * 100 : 0;

    return { rows: projected, trend };
  }, [summary]);

  // --- Anomalies: today vs trailing 28-day average ---
  const anomalies = useMemo(() => {
    const daily = summary?.dailyStats ?? [];
    if (daily.length < 14) return [];
    const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted[sorted.length - 1];
    const priorWindow = sorted.slice(-29, -1);
    if (priorWindow.length === 0 || !last) return [];

    function flag(metric: keyof DailyStats, label: string, format: (n: number) => string): { label: string; current: string; expected: string; deltaPct: number; tone: "danger" | "warning" | "success" } | null {
      const current = Number(last[metric] ?? 0);
      const avg = priorWindow.reduce((acc, d) => acc + Number(d[metric] ?? 0), 0) / priorWindow.length;
      if (avg === 0) return null;
      const deltaPct = ((current - avg) / avg) * 100;
      if (Math.abs(deltaPct) < 20) return null;
      const tone = deltaPct > 30 ? "success" : deltaPct < -30 ? "danger" : "warning";
      return {
        label,
        current: format(current),
        expected: format(avg),
        deltaPct,
        tone,
      };
    }

    const out: NonNullable<ReturnType<typeof flag>>[] = [];
    const r = flag("revenue", "Revenue", (n) => formatPrice(Math.round(n)));
    if (r) out.push(r);
    const o = flag("orderCount", "Orders", (n) => Math.round(n).toLocaleString());
    if (o) out.push(o);
    const a = flag("avgOrderValue", "Avg order value", (n) => formatPrice(Math.round(n)));
    if (a) out.push(a);
    return out;
  }, [summary]);

  // --- Reorder suggestions: stock at/below reorder point ---
  const reorderRows = useMemo(() => {
    const ingredientUsage = new Map<string, number>(); // last-28-day quantity used per ingredient (best-effort: not directly available; use 0 fallback)
    // We approximate "velocity" via parLevel since we don't track recipe consumption rollup here yet.
    return stock
      .filter((s) => s.onHand <= s.reorderPoint)
      .map((s) => {
        const suggested = Math.max(0, s.parLevel - s.onHand);
        const cost = Math.round(suggested * s.costPerUnit);
        return {
          ...s,
          suggested,
          estCost: cost,
          velocityHint: ingredientUsage.get(s.ingredientId) ?? 0,
        };
      })
      .sort((a, b) => b.estCost - a.estCost);
  }, [stock]);

  // --- Staffing suggestion: rank hours by demand and recommend coverage ---
  const staffingRows = useMemo(() => {
    const peakHours = insights?.peakHours ?? [];
    if (peakHours.length === 0) return [];
    return peakHours
      .slice()
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, 6)
      .map((p) => ({
        hour: `${String(p.hour).padStart(2, "0")}:00`,
        orderCount: p.orderCount,
        revenue: p.revenue,
        suggestedHeadcount: p.orderCount > 30 ? 4 : p.orderCount > 15 ? 3 : 2,
      }));
  }, [insights]);

  const totalReorderCost = reorderRows.reduce((acc, r) => acc + r.estCost, 0);

  // --- FAQ CRUD ---
  const upsertFaq = async (faq: FaqRow) => {
    const res = await fetch("/api/admin/chatbot-faq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(faq),
    });
    if (res.ok) {
      toast.success("FAQ saved");
      setFaqDialog({ open: false, faq: null });
      await fetchAll();
    } else {
      toast.error("Could not save FAQ");
    }
  };

  const deleteFaq = async (id: string) => {
    const res = await fetch(`/api/admin/chatbot-faq?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) {
      setFaqs((arr) => arr.filter((f) => f.id !== id));
      toast.success("FAQ removed");
    }
  };

  const faqCols: Column<FaqRow>[] = [
    { key: "keyword", header: "Keyword", cell: (f) => <span className="mono">{f.keyword}</span>, sortValue: (f) => f.keyword },
    {
      key: "response",
      header: "Response",
      cell: (f) => <span className="v2-fb-comment">{f.response}</span>,
    },
    { key: "hits", header: "Hits", align: "right", cell: (f) => (f.hits ?? 0).toLocaleString(), sortValue: (f) => f.hits ?? 0 },
    {
      key: "actions",
      header: "",
      cell: (f) => (
        <div className="v2-row-actions">
          <Button size="sm" variant="ghost" onClick={() => setFaqDialog({ open: true, faq: f })}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => deleteFaq(f.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="v2-page">
      <PageHero
        title="Insights"
        subtitle="Heuristic forecasts, anomaly checks, reorder suggestions and staffing tips computed from real orders + stock data. No ML model is in the loop yet."
        actions={
          <a
            href="/admin/ai/agent"
            className="v2-btn v2-btn-primary v2-btn-sm inline-flex items-center gap-1.5 mt-2 w-fit"
            aria-label="Open Ops Agent"
            title="Open Ops Agent"
          >
            <Sparkles className="h-3.5 w-3.5" />
          </a>
        }
        filters={
          <Tabs
            value={tab}
            onChange={(v) => setTab(v as TabKey)}
            tabs={[
              { value: "forecast", label: "Forecast", icon: <TrendingUp className="h-3.5 w-3.5" /> },
              { value: "anomalies", label: "Anomalies", icon: <AlertTriangle className="h-3.5 w-3.5" />, count: anomalies.length },
              { value: "reorder", label: "Reorder", icon: <Boxes className="h-3.5 w-3.5" />, count: reorderRows.length },
              { value: "staffing", label: "Staffing", icon: <ChefHat className="h-3.5 w-3.5" /> },
              { value: "faq", label: "Chatbot FAQ", icon: <MessageSquare className="h-3.5 w-3.5" />, count: faqs.length },
            ]}
            variant="pill"
            ariaLabel="Insights section"
          />
        }
      />

      {loading ? (
        <div className="v2-page-loading">Loading Insights…</div>
      ) : tab === "forecast" ? (
        <>
          <section className="v2-kpi-grid">
            <KpiCard
              label="Orders trend (week-over-week)"
              value={forecast.trend}
              display={`${forecast.trend > 0 ? "+" : ""}${forecast.trend.toFixed(1)}%`}
              icon={forecast.trend >= 0 ? TrendingUp : TrendingDown}
              tone={forecast.trend >= 0 ? "success" : "danger"}
              hint="Last 7d vs prior 7d"
            />
            <KpiCard
              label="Forecast next 7 days"
              value={Math.round(((forecast.rows.find((r) => r.forecast)?.forecast ?? 0) * 7))}
              icon={Sparkles}
              tone="info"
              hint="Orders, projected from 7-day moving average"
            />
            <KpiCard
              label="Revenue (28d)"
              value={(summary?.totalRevenue ?? 0) / 100}
              format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
              icon={Coins}
              tone="brand"
            />
            <KpiCard
              label="Best-seller"
              value={0}
              display={summary?.topItems?.[0]?.name ?? "—"}
              icon={CheckCircle2}
              tone="success"
              hint={summary?.topItems?.[0] ? `${summary.topItems[0].quantity} sold` : undefined}
            />
          </section>

          <Card>
            <CardHeader
              title="Demand forecast"
              description={
                aiForecast?.source === "claude"
                  ? "Claude-backed 7-day forecast. Weekly seasonality, trend, and confidence band."
                  : "Actual vs 7-day moving average vs naive projection (heuristic — set ANTHROPIC_API_KEY for the Claude forecast)."
              }
              actions={
                aiForecast ? (
                  <Badge
                    tone={aiForecast.source === "claude" ? "success" : "warning"}
                    variant="soft"
                    dot
                  >
                    {aiForecast.source === "claude" ? "Claude" : "Heuristic"}
                  </Badge>
                ) : null
              }
            />
            <CardBody>
              {forecast.rows.length === 0 ? (
                <EmptyState icon={Brain} title="Not enough data" description="Forecast appears once orders accumulate." compact />
              ) : (
                <>
                  <AreaChart
                    data={(() => {
                      // When Claude responded, splice the model's
                      // predicted_orders + upper/lower into the chart
                      // rows so the operator sees the real forecast
                      // instead of the MA placeholder.
                      if (!aiForecast || aiForecast.source !== "claude") {
                        return forecast.rows as Array<Record<string, unknown>>;
                      }
                      const byDate = new Map(
                        aiForecast.days.map((d) => [d.date, d]),
                      );
                      return (forecast.rows as Array<Record<string, unknown>>).map((row) => {
                        const date = String(row.date ?? "");
                        const pred = byDate.get(date);
                        if (!pred) return row;
                        return {
                          ...row,
                          forecast: pred.predictedOrders,
                          lower: pred.lower,
                          upper: pred.upper,
                        };
                      });
                    })()}
                    xKey="date"
                    series={[
                      { key: "actual", label: "Actual orders" },
                      { key: "ma", label: "7-day MA" },
                      { key: "forecast", label: "Forecast" },
                      ...(aiForecast?.source === "claude"
                        ? [
                            { key: "lower", label: "Lower (80%)" },
                            { key: "upper", label: "Upper (80%)" },
                          ]
                        : []),
                    ]}
                    height={300}
                    xFormat={(v) => String(v).slice(5)}
                  />
                  {aiForecast?.reasoning && (
                    <p className="mt-3 text-sm v2-muted">
                      <Sparkles className="inline h-3.5 w-3.5 mr-1.5" />
                      {aiForecast.reasoning}
                    </p>
                  )}
                </>
              )}
            </CardBody>
          </Card>
        </>
      ) : tab === "anomalies" ? (
        anomalies.length === 0 ? (
          <Card>
            <CardBody>
              <EmptyState
                icon={CheckCircle2}
                title="Nothing unusual today"
                description="Today's metrics are within ±20% of the trailing 28-day average."
              />
            </CardBody>
          </Card>
        ) : (
          <div className="v2-rewards-grid">
            {anomalies.map((a) => (
              <Card key={a.label}>
                <CardHeader
                  title={a.label}
                  description={`Expected ~${a.expected} · today ${a.current}`}
                  actions={
                    <Badge tone={a.tone} variant="soft" dot>
                      {a.deltaPct > 0 ? "+" : ""}{a.deltaPct.toFixed(0)}%
                    </Badge>
                  }
                />
              </Card>
            ))}
          </div>
        )
      ) : tab === "reorder" ? (
        reorderRows.length === 0 ? (
          <Card>
            <CardBody>
              <EmptyState
                icon={Boxes}
                title="Nothing to reorder"
                description="All tracked SKUs are above their reorder point."
              />
            </CardBody>
          </Card>
        ) : (
          <>
            <section className="v2-kpi-grid">
              <KpiCard label="SKUs to reorder" value={reorderRows.length} icon={Boxes} tone="warning" higherIsBetter={false} />
              <KpiCard
                label="Estimated PO cost"
                value={totalReorderCost / 100}
                format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
                icon={Coins}
                tone="brand"
                hint="To restock to par level"
              />
            </section>
            <Card padding="none">
              <CardHeader title="Suggested reorder" description="Stock at or below reorder point. Quantity = par − on-hand." actions={<Lightbulb className="h-4 w-4 v2-muted" />} />
              <Table
                flush
                rows={reorderRows}
                columns={[
                    { key: "name", header: "Ingredient", cell: (r) => r.name, sortValue: (r) => r.name },
                    { key: "onhand", header: "On hand", align: "right", cell: (r) => `${r.onHand} ${r.unit}`, sortValue: (r) => r.onHand },
                    { key: "par", header: "Par", align: "right", cell: (r) => `${r.parLevel} ${r.unit}`, sortValue: (r) => r.parLevel },
                    {
                      key: "suggested",
                      header: "Order",
                      align: "right",
                      cell: (r) => <span className="tabular">{`${r.suggested} ${r.unit}`}</span>,
                      sortValue: (r) => r.suggested,
                    },
                    {
                      key: "cost",
                      header: "Est. cost",
                      align: "right",
                      cell: (r) => formatPrice(r.estCost),
                      sortValue: (r) => r.estCost,
                    },
                  ]}
                rowKey={(r) => r.ingredientId}
                defaultSort={{ key: "cost", dir: "desc" }}
              />
            </Card>
          </>
        )
      ) : tab === "staffing" ? (
        staffingRows.length === 0 ? (
          <Card>
            <CardBody>
              <EmptyState
                icon={ChefHat}
                title="Need more order history"
                description="Staffing suggestions appear once we know peak-hour demand."
              />
            </CardBody>
          </Card>
        ) : (
          <Card padding="none">
            <CardHeader
              title="Suggested coverage"
              description="Hours of peak demand and a baseline headcount recommendation. Adjust based on prep complexity per item."
              actions={<ChefHat className="h-4 w-4 v2-muted" />}
            />
            <Table
              flush
              rows={staffingRows}
              columns={[
                { key: "hour", header: "Hour", cell: (r) => <span className="mono">{r.hour}</span>, sortValue: (r) => r.hour },
                { key: "orders", header: "Orders", align: "right", cell: (r) => r.orderCount, sortValue: (r) => r.orderCount },
                { key: "revenue", header: "Revenue", align: "right", cell: (r) => formatPrice(r.revenue), sortValue: (r) => r.revenue },
                {
                  key: "headcount",
                  header: "Suggested headcount",
                  align: "right",
                  cell: (r) => (
                    <Badge tone={r.suggestedHeadcount >= 4 ? "danger" : r.suggestedHeadcount === 3 ? "warning" : "success"} variant="soft">
                      {r.suggestedHeadcount}
                    </Badge>
                  ),
                  sortValue: (r) => r.suggestedHeadcount,
                },
              ]}
              rowKey={(r) => r.hour}
              defaultSort={{ key: "orders", dir: "desc" }}
            />
          </Card>
        )
      ) : (
        // FAQ tab
        <>
          <div className="v2-filters">
            <h2 className="v2-section-h">Chatbot FAQ</h2>
            <Button variant="primary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setFaqDialog({ open: true, faq: null })}>
              New FAQ
            </Button>
          </div>
          {faqs.length === 0 ? (
            <Card>
              <CardBody>
                <EmptyState
                  icon={MessageSquare}
                  title="No FAQ entries"
                  description="Add keyword → response pairs to power the customer site chatbot."
                  action={
                    <Button variant="primary" onClick={() => setFaqDialog({ open: true, faq: null })}>
                      New FAQ
                    </Button>
                  }
                />
              </CardBody>
            </Card>
          ) : (
            <Card padding="none">
              <Table flush rows={faqs} columns={faqCols} rowKey={(f) => f.id} defaultSort={{ key: "hits", dir: "desc" }} />
            </Card>
          )}
        </>
      )}

      <FaqDialog
        state={faqDialog}
        onClose={() => setFaqDialog({ open: false, faq: null })}
        onSubmit={upsertFaq}
      />
    </div>
  );
}

interface FaqDialogProps {
  state: { open: boolean; faq: FaqRow | null };
  onClose: () => void;
  onSubmit: (faq: FaqRow) => Promise<void> | void;
}

function FaqDialog({ state, onClose, onSubmit }: FaqDialogProps) {
  const [keyword, setKeyword] = useState("");
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    setKeyword(state.faq?.keyword ?? "");
    setResponse(state.faq?.response ?? "");
    setBusy(false);
  }, [state]);

  if (!state.open) return <Dialog open={false} onClose={onClose} />;

  const submit = async () => {
    if (!keyword.trim() || !response.trim()) return;
    setBusy(true);
    await onSubmit({
      id: state.faq?.id ?? `faq-${Date.now().toString(36)}`,
      keyword: keyword.trim(),
      response: response.trim(),
      hits: state.faq?.hits,
    });
    setBusy(false);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={state.faq ? "Edit FAQ" : "New FAQ"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>{state.faq ? "Save" : "Create"}</Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <Input label="Keyword / trigger" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. 'opening hours'" />
        <Textarea label="Bot response" rows={4} value={response} onChange={(e) => setResponse(e.target.value)} />
      </div>
    </Dialog>
  );
}
