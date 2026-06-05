"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Brain, MessageSquare, Plus, RefreshCw, X } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { useAdminLocationV3 } from "./LocationContext";
import { Badge, Button, Card, CardBody, CardHead, Dialog } from "./ui";

interface ForecastDay { date: string; predictedOrders: number; lower?: number; upper?: number }
interface Forecast { source?: string; days?: ForecastDay[]; reasoning?: string; generatedAt?: string }
interface Faq { id: string; keyword: string; response: string; hits?: number }

export function InsightsV3() {
  const { location } = useAdminLocationV3();
  const all = useMemo(() => getActiveLocations(), []);
  const loc = location || all[0]?.slug || "krakow";
  const city = all.find((l) => l.slug === loc)?.city ?? loc;

  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [faqEdit, setFaqEdit] = useState<Faq | "new" | null>(null);

  const load = useCallback(async () => {
    const [fc, fq] = await Promise.all([
      fetch(`/api/admin/ai/forecast?location=${loc}&days=14`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/admin/chatbot-faq`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    setForecast(fc);
    setFaqs(Array.isArray(fq) ? fq : []);
    setLoading(false);
    setRefreshing(false);
  }, [loc]);
  useEffect(() => { load(); }, [load]);

  const delFaq = async (id: string) => { const r = await fetch(`/api/admin/chatbot-faq?id=${encodeURIComponent(id)}`, { method: "DELETE" }); if (r.ok) await load(); };

  const days = forecast?.days ?? [];
  const fcMax = Math.max(1, ...days.map((d) => d.upper ?? d.predictedOrders));

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Insights</h1>
          <div className="av3-pagehead-sub">AI demand forecast &amp; chatbot knowledge · {city}{!location ? " (pick a location to switch)" : ""}</div>
        </div>
        <div className="av3-pagehead-actions">
          <Button variant="ghost" size="sm" onClick={() => { setRefreshing(true); load(); }}>
            <RefreshCw className="av3-btn-ico" style={refreshing ? { animation: "av3-spin .7s linear infinite" } : undefined} /> Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading insights…</div>
      ) : (
        <>
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
        </>
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
