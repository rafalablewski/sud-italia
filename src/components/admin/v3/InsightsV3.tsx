"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, Brain, ChefHat, MessageSquare, Plus, RefreshCw, Users, X } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, Button, Card, CardBody, CardHead, Dialog, Kpi, Table, type BadgeTone, type ColumnV3 } from "./ui";

interface ForecastDay { date: string; predictedOrders: number; lower?: number; upper?: number }
interface Forecast { source?: string; days?: ForecastDay[]; reasoning?: string; generatedAt?: string }
interface Faq { id: string; keyword: string; response: string; hits?: number }
interface DailyStat { date: string; revenue: number; orderCount: number; avgOrderValue: number }
interface Summary { dailyStats?: DailyStat[] }
interface Insights { peakHours?: { hour: number; orderCount: number; revenue: number }[] }
interface StockRow { ingredientId: string; name: string; onHand: number; parLevel: number; reorderPoint: number; unit: string; costPerUnit: number }

type Tab = "forecast" | "anomalies" | "reorder" | "staffing" | "faq";
type AnomalyMetric = "revenue" | "orderCount" | "avgOrderValue";

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

export function InsightsV3() {
  const { location } = useAdminLocationV3();
  const all = useMemo(() => getActiveLocations(), []);
  const loc = location || all[0]?.slug || "krakow";
  const city = all.find((l) => l.slug === loc)?.city ?? loc;

  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [tab, setTab] = useState<Tab>("forecast");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [faqEdit, setFaqEdit] = useState<Faq | "new" | null>(null);

  const load = useCallback(async () => {
    const to = isoDate(new Date());
    const from = isoDate(new Date(Date.now() - 30 * 86400000));
    const [fc, fq, an, ins, st] = await Promise.all([
      fetch(`/api/admin/ai/forecast?location=${loc}&days=14`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/admin/chatbot-faq`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`/api/admin/analytics?from=${from}&to=${to}&location=${loc}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/admin/insights?from=${from}&to=${to}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/admin/stock?location=${loc}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    setForecast(fc);
    setFaqs(Array.isArray(fq) ? fq : []);
    setSummary(an);
    setInsights(ins);
    setStock(Array.isArray(st) ? st : []);
    setLoading(false);
    setRefreshing(false);
  }, [loc]);
  useEffect(() => { load(); }, [load]);

  const delFaq = async (id: string) => { const r = await fetch(`/api/admin/chatbot-faq?id=${encodeURIComponent(id)}`, { method: "DELETE" }); if (r.ok) await load(); };

  const days = forecast?.days ?? [];
  const fcMax = Math.max(1, ...days.map((d) => d.upper ?? d.predictedOrders));

  // --- Anomalies: today vs trailing 28-day average ---
  const anomalies = useMemo(() => {
    const daily = summary?.dailyStats ?? [];
    if (daily.length < 14) return [];
    const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted[sorted.length - 1];
    const priorWindow = sorted.slice(-29, -1);
    if (!priorWindow.length || !last) return [];
    const flag = (metric: AnomalyMetric, label: string, format: (n: number) => string) => {
      const current = Number(last[metric] ?? 0);
      const avg = priorWindow.reduce((acc, d) => acc + Number(d[metric] ?? 0), 0) / priorWindow.length;
      if (avg === 0) return null;
      const deltaPct = ((current - avg) / avg) * 100;
      if (Math.abs(deltaPct) < 20) return null;
      const tone: BadgeTone = deltaPct > 30 ? "ok" : deltaPct < -30 ? "bad" : "warn";
      return { label, current: format(current), expected: format(avg), deltaPct, tone };
    };
    const out = [];
    const specs: [AnomalyMetric, string, (n: number) => string][] = [
      ["revenue", "Revenue", (n) => formatPrice(Math.round(n))],
      ["orderCount", "Orders", (n) => Math.round(n).toLocaleString("pl-PL")],
      ["avgOrderValue", "Avg order value", (n) => formatPrice(Math.round(n))],
    ];
    for (const [m, l, f] of specs) { const r = flag(m, l, f); if (r) out.push(r); }
    return out;
  }, [summary]);

  // --- Reorder: stock at/below reorder point ---
  const reorderRows = useMemo(
    () => stock
      .filter((s) => s.onHand <= s.reorderPoint)
      .map((s) => { const suggested = Math.max(0, s.parLevel - s.onHand); return { ...s, suggested, estCost: Math.round(suggested * s.costPerUnit) }; })
      .sort((a, b) => b.estCost - a.estCost),
    [stock],
  );
  const totalReorderCost = reorderRows.reduce((a, r) => a + r.estCost, 0);

  // --- Staffing: rank hours by demand, recommend coverage ---
  const staffingRows = useMemo(
    () => (insights?.peakHours ?? [])
      .slice().sort((a, b) => b.orderCount - a.orderCount).slice(0, 6)
      .map((p) => ({ hour: `${String(p.hour).padStart(2, "0")}:00`, orderCount: p.orderCount, revenue: p.revenue, headcount: p.orderCount > 30 ? 4 : p.orderCount > 15 ? 3 : 2 })),
    [insights],
  );

  const reorderCols: ColumnV3<(typeof reorderRows)[number]>[] = [
    { key: "name", header: "Ingredient", render: (s) => <span style={{ fontWeight: 500 }}>{s.name}</span> },
    { key: "onHand", header: "On hand", num: true, render: (s) => `${s.onHand} ${s.unit}` },
    { key: "par", header: "Par", num: true, render: (s) => `${s.parLevel} ${s.unit}` },
    { key: "sug", header: "Order", num: true, render: (s) => <span style={{ fontWeight: 600 }}>{s.suggested} {s.unit}</span> },
    { key: "cost", header: "Est. cost", num: true, render: (s) => formatPrice(s.estCost) },
  ];
  const staffingCols: ColumnV3<(typeof staffingRows)[number]>[] = [
    { key: "hour", header: "Hour", render: (r) => <span style={{ fontFamily: "var(--av3-mono)" }}>{r.hour}</span> },
    { key: "orders", header: "Orders", num: true, render: (r) => r.orderCount.toLocaleString("pl-PL") },
    { key: "rev", header: "Revenue", num: true, render: (r) => formatPrice(r.revenue) },
    { key: "hc", header: "Suggested staff", num: true, render: (r) => <Badge tone={r.headcount >= 4 ? "warn" : "info"}>{r.headcount}</Badge> },
  ];

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "forecast", label: "Forecast" },
    { id: "anomalies", label: "Anomalies", count: anomalies.length },
    { id: "reorder", label: "Reorder", count: reorderRows.length },
    { id: "staffing", label: "Staffing", count: staffingRows.length },
    { id: "faq", label: "Chatbot FAQ", count: faqs.length },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Insights</h1>
          <div className="av3-pagehead-sub">Heuristic forecasts, anomaly checks, reorder + staffing tips from real orders &amp; stock · {city}{!location ? " (pick a location to switch)" : ""}</div>
        </div>
        <div className="av3-pagehead-actions">
          <Button variant="ghost" size="sm" onClick={() => { setRefreshing(true); load(); }}>
            <RefreshCw className="av3-btn-ico" style={refreshing ? { animation: "av3-spin .7s linear infinite" } : undefined} /> Refresh
          </Button>
        </div>
      </div>

      <div className="av3-filterchips">
        {tabs.map((t) => (
          <button key={t.id} type="button" className={`av3-fchip ${tab === t.id ? "is-active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}{typeof t.count === "number" && <span className="av3-fchip-count">{t.count}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading insights…</div>
      ) : tab === "forecast" ? (
        <Card>
          <CardHead title="Demand forecast" description="Predicted orders per day" actions={<Badge tone={forecast?.source === "claude" ? "brand" : "neutral"}>{forecast?.source === "claude" ? "Claude" : "moving-avg"}</Badge>} />
          <CardBody>
            {days.length === 0 ? (
              <div className="av3-empty-text" style={{ color: "var(--av3-subtle)" }}>No forecast available yet.</div>
            ) : (
              <>
                <div className="av3-flow" style={{ height: 90, gap: 5 }}>
                  {days.map((d) => (
                    <div key={d.date} title={`${d.date}: ${d.predictedOrders}`} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 4 }}>
                      <span className="mono" style={{ fontFamily: "var(--av3-mono)", fontSize: 10, color: "var(--av3-muted)" }}>{d.predictedOrders}</span>
                      <div style={{ width: "70%", background: "var(--av3-c3)", borderRadius: "3px 3px 0 0", height: `${(d.predictedOrders / fcMax) * 64}px`, minHeight: 2 }} />
                      <span style={{ fontSize: 9, color: "var(--av3-subtle)" }}>{d.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
                {forecast?.reasoning && <div style={{ marginTop: 12, fontSize: 12, color: "var(--av3-muted)", lineHeight: 1.5 }}>{forecast.reasoning}</div>}
              </>
            )}
          </CardBody>
        </Card>
      ) : tab === "anomalies" ? (
        <Card>
          <CardHead title="Anomalies" description="Today vs the trailing 28-day average — only ±20%+ swings shown" />
          <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
            {anomalies.length === 0 ? (
              <div className="av3-empty" style={{ padding: "24px 0" }}><AlertTriangle style={{ width: 22, height: 22, color: "var(--av3-ok)", margin: "0 auto 8px" }} /><div className="av3-empty-title">Nothing unusual today</div><div className="av3-empty-text">Every tracked metric is within ±20% of the 28-day norm.</div></div>
            ) : anomalies.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--av3-line)" }}>
                <Badge tone={a.tone} dot>{a.deltaPct > 0 ? "+" : ""}{a.deltaPct.toFixed(0)}%</Badge>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{a.label}</div>
                  <div className="av3-cell-muted" style={{ fontSize: 12 }}>now {a.current} · expected {a.expected}</div>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : tab === "reorder" ? (
        reorderRows.length === 0 ? (
          <Card><CardBody><div className="av3-empty" style={{ padding: "24px 0" }}><Boxes style={{ width: 22, height: 22, color: "var(--av3-ok)", margin: "0 auto 8px" }} /><div className="av3-empty-title">Nothing to reorder</div><div className="av3-empty-text">All tracked SKUs are above their reorder point.</div></div></CardBody></Card>
        ) : (
          <>
            <div className="av3-kpi-rail">
              <Kpi label="SKUs to reorder" icon={Boxes} value={`${reorderRows.length}`} accentVar="--av3-c5" />
              <Kpi label="Est. reorder cost" icon={Boxes} value={formatPrice(totalReorderCost)} accentVar="--av3-c1" />
            </div>
            <Card style={{ padding: 0 }}>
              <CardHead title="Suggested reorder" description="At or below reorder point · quantity = par − on-hand" />
              <Table columns={reorderCols} rows={reorderRows} rowKey={(s) => s.ingredientId} />
            </Card>
          </>
        )
      ) : tab === "staffing" ? (
        staffingRows.length === 0 ? (
          <Card><CardBody><div className="av3-empty" style={{ padding: "24px 0" }}><ChefHat style={{ width: 22, height: 22, color: "var(--av3-subtle)", margin: "0 auto 8px" }} /><div className="av3-empty-title">No staffing signal yet</div><div className="av3-empty-text">Suggestions appear once we know peak-hour demand.</div></div></CardBody></Card>
        ) : (
          <Card style={{ padding: 0 }}>
            <CardHead title="Staffing by peak hour" description="Busiest hours + a suggested floor headcount" actions={<Badge tone="neutral"><Users style={{ width: 11, height: 11 }} /> heuristic</Badge>} />
            <Table columns={staffingCols} rows={staffingRows} rowKey={(r) => r.hour} />
          </Card>
        )
      ) : (
        <Card style={{ padding: 0 }}>
          <CardHead title="Chatbot FAQ" description="Keyword → response for the guest assistant" actions={<Button variant="primary" size="sm" onClick={() => setFaqEdit("new")}><Plus className="av3-btn-ico" /> Add</Button>} />
          <CardBody style={{ paddingTop: 4, paddingBottom: 4 }}>
            {faqs.length === 0 ? (
              <div className="av3-empty-text" style={{ color: "var(--av3-subtle)" }}>No FAQ entries.</div>
            ) : faqs.map((f) => (
              <div key={f.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--av3-line)" }}>
                <button type="button" onClick={() => setFaqEdit(f)} style={{ flex: 1, textAlign: "left", background: "none", border: "none", color: "inherit", cursor: "pointer", minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{f.keyword}{typeof f.hits === "number" && <span className="av3-cell-muted" style={{ fontWeight: 400, fontSize: 11, marginLeft: 6 }}>· {f.hits} hits</span>}</div>
                  <div className="av3-cell-muted" style={{ fontSize: 12, marginTop: 1 }}>{f.response}</div>
                </button>
                <button type="button" className="av3-iconbtn-sm" aria-label="Delete" onClick={() => delFaq(f.id)}><X /></button>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {faqEdit && <FaqDialog faq={faqEdit === "new" ? null : faqEdit} onClose={() => setFaqEdit(null)} onSaved={async () => { await load(); setFaqEdit(null); }} />}
    </>
  );
}

function FaqDialog({ faq, onClose, onSaved }: { faq: Faq | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [keyword, setKeyword] = useState(faq?.keyword ?? "");
  const [response, setResponse] = useState(faq?.response ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!keyword.trim() || !response.trim()) return;
    setSaving(true);
    try {
      const body = { ...(faq ? { id: faq.id } : {}), keyword: keyword.trim(), response: response.trim() };
      const res = await fetch("/api/admin/chatbot-faq", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={faq ? "Edit FAQ" : "New FAQ"} headerExtra={<Badge tone="neutral"><MessageSquare style={{ width: 11, height: 11 }} /> faq</Badge>} width={500}
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" loading={saving} disabled={!keyword.trim() || !response.trim()} onClick={save}>Save</Button></>}>
      <label className="av3-field" style={{ marginBottom: 10 }}><span className="av3-field-label">Keyword / trigger</span><input className="av3-input" style={{ fontFamily: "var(--av3-ui)" }} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. opening hours" /></label>
      <label className="av3-field"><span className="av3-field-label">Response</span><textarea className="av3-input" style={{ fontFamily: "var(--av3-ui)", height: 90, padding: "8px 10px" }} value={response} onChange={(e) => setResponse(e.target.value)} /></label>
    </Dialog>
  );
}
