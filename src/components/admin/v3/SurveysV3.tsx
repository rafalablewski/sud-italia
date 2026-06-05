"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Gauge, MessageSquare, Star } from "lucide-react";
import {
  averageStars,
  computePulseScore,
  SURVEY_TRIGGER_LABEL,
  type SurveyDefinition,
  type SurveyResponse,
} from "@/lib/surveys";
import { Badge, Kpi, Table, type BadgeTone, type ColumnV3 } from "./ui";

function pulseTone(score: number): BadgeTone {
  if (score >= 50) return "ok";
  if (score >= 0) return "info";
  if (score >= -25) return "warn";
  return "bad";
}
function fmtDate(iso?: string) {
  return iso ? new Date(iso).toLocaleString("pl-PL", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}

export function SurveysV3() {
  const [surveys, setSurveys] = useState<SurveyDefinition[]>([]);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"catalogue" | "responses">("catalogue");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/surveys").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setSurveys(Array.isArray(res?.surveys) ? res.surveys : []);
    setResponses(Array.isArray(res?.responses) ? res.responses : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const pulse = useMemo(() => computePulseScore(responses), [responses]);
  const avg = useMemo(() => averageStars(responses), [responses]);

  const toggle = async (s: SurveyDefinition) => {
    setBusy(s.id);
    const active = !s.active;
    setSurveys((arr) => arr.map((x) => (x.id === s.id ? { ...x, active } : x)));
    try {
      await fetch("/api/admin/surveys", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id, active }) });
    } finally {
      setBusy(null);
    }
  };

  const surveyCols: ColumnV3<SurveyDefinition>[] = [
    { key: "q", header: "Question", render: (s) => <span style={{ fontWeight: 500 }}>{s.question}</span> },
    { key: "trigger", header: "Fires", render: (s) => <Badge tone="neutral">{SURVEY_TRIGGER_LABEL[s.trigger] ?? s.trigger}</Badge> },
    { key: "resp", header: "Responses", num: true, render: (s) => `${responses.filter((r) => r.surveyId === s.id).length}` },
    { key: "active", header: "", render: (s) => (
      <button type="button" className="av3-toggle" data-on={s.active} disabled={busy === s.id} onClick={(e) => { e.stopPropagation(); toggle(s); }} style={{ padding: "0 12px" }}>
        {s.active ? "Active" : "Paused"}
      </button>
    ) },
  ];

  const respCols: ColumnV3<SurveyResponse>[] = [
    { key: "t", header: "When", render: (r) => <span className="av3-cell-muted">{fmtDate(r.date)}</span> },
    { key: "trig", header: "Trigger", render: (r) => <span className="av3-cell-muted">{SURVEY_TRIGGER_LABEL[r.trigger] ?? r.trigger}</span> },
    { key: "rating", header: "Rating", render: (r) => <Badge tone={r.rating >= 4 ? "ok" : r.rating === 3 ? "warn" : "bad"}><Star style={{ width: 11, height: 11 }} />{r.rating}</Badge> },
    { key: "comment", header: "Comment", render: (r) => <span className="av3-cell-muted" style={{ fontStyle: r.comment ? "italic" : "normal" }}>{r.comment || "—"}</span> },
  ];

  const recentResponses = useMemo(() => [...responses].sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()).slice(0, 60), [responses]);

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Pulse surveys</h1>
          <div className="av3-pagehead-sub">One-tap guest sentiment · NPS-style pulse</div>
        </div>
      </div>

      <div className="av3-kpi-rail">
        <Kpi label="Pulse score" icon={Gauge} value={`${pulse > 0 ? "+" : ""}${pulse}`} accentVar={pulseTone(pulse) === "ok" ? "--av3-c4" : pulseTone(pulse) === "bad" ? "--av3-c1" : "--av3-c3"} />
        <Kpi label="Avg rating" icon={Star} value={avg ? `${avg.toFixed(1)}` : "—"} accentVar="--av3-c2" />
        <Kpi label="Responses" icon={MessageSquare} value={`${responses.length}`} accentVar="--av3-c3" />
      </div>

      <div className="av3-filterchips">
        <button type="button" className={`av3-fchip ${tab === "catalogue" ? "is-active" : ""}`} onClick={() => setTab("catalogue")}>Catalogue<span className="av3-fchip-count">{surveys.length}</span></button>
        <button type="button" className={`av3-fchip ${tab === "responses" ? "is-active" : ""}`} onClick={() => setTab("responses")}>Responses<span className="av3-fchip-count">{responses.length}</span></button>
      </div>

      {loading && surveys.length === 0 ? (
        <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading surveys…</div>
      ) : tab === "catalogue" ? (
        <div className="av3-card" style={{ padding: 0 }}>
          {surveys.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No surveys</div><div className="av3-empty-text">Pulse surveys are seeded per trigger moment.</div></div>
          ) : (
            <Table columns={surveyCols} rows={surveys} rowKey={(s) => s.id} />
          )}
        </div>
      ) : (
        <div className="av3-card" style={{ padding: 0 }}>
          {recentResponses.length === 0 ? (
            <div className="av3-empty"><div className="av3-empty-title">No responses yet</div><div className="av3-empty-text">Guest answers land here as surveys fire.</div></div>
          ) : (
            <Table columns={respCols} rows={recentResponses} rowKey={(r) => r.id} />
          )}
        </div>
      )}
    </>
  );
}
