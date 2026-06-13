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
import { Badge, type BadgeTone, type ColumnV3, InfoButton, Kpi, KpiRail, SkeletonRows, Switch, Table } from "./ui";

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
  useEffect(() => { setLoading(true); load(); }, [load]);

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
      <Switch checked={s.active} disabled={busy === s.id} label={s.active ? "Active" : "Paused"} onClick={(e) => e.stopPropagation()} onChange={() => toggle(s)} />
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
          <h1 style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            Pulse surveys
            <InfoButton
              title="How Pulse surveys work"
              description="Pulse fires a one-tap 1–5★ question at the right moment in a guest's visit, then nets the answers into an NPS-style score so you can see — and move — how guests actually feel."
              institutional="A continuous voice-of-customer instrument, not a one-off CSAT poll. The gate: a Pulse score below 0 is a churn signal (more detractors than promoters); steer for 30+. Read it alongside response volume — a high score off a handful of answers is noise."
              plain="Instead of a long survey nobody fills in, the storefront asks one star-rating at a telling moment (after ordering, on exit intent, on the rewards page). Each survey targets a specific moment, so a low score tells you exactly where the friction is."
              tips="Activate the surveys whose 'Fires on' moment you most want to read; open the Responses tab and fix the top recurring detractor snag first; turn 4★ passives into promoters with a small post-order delight."
              methodology="Per-survey results net into Pulse score = round((promoters − detractors) / total × 100), promoter = 5★, detractor ≤ 3★, passive = 4★. Source: every SurveyResponse in the store (computePulseScore / averageStars in src/lib/surveys.ts) — no sampling."
            />
          </h1>
          <div className="av3-pagehead-sub">One-tap guest sentiment · NPS-style pulse</div>
        </div>
      </div>

      <KpiRail loading={loading} empty={responses.length === 0}>
        <Kpi
          label="Pulse score"
          icon={Gauge}
          value={`${pulse > 0 ? "+" : ""}${pulse}`}
          accentVar={pulseTone(pulse) === "ok" ? "--av3-c4" : pulseTone(pulse) === "bad" ? "--av3-c1" : "--av3-c3"}
          info={
            <InfoButton
              title="Pulse score (NPS-style)"
              description="The net of promoters (5★) minus detractors (1–3★) as a share of all answers, on a −100…+100 scale — a classic NPS computed from the 5-star Pulse prompts."
              institutional="A standard relationship-NPS gate: below 0 means more detractors than promoters (churn risk), 0–30 is workable, 30–50 good, and 50+ is best-in-class loyalty for QSR. Read it alongside response volume — a +80 off 4 answers is noise; treat anything under ~30 responses as directional."
              plain="If 100 guests tap a rating after ordering — 60 give 5★ (promoters), 25 give 4★ (passives, ignored), 15 give ≤3★ (detractors) — Pulse = 60 − 15 = +45. It's the same scorecard a 50 zł Margherita regular gives a friend: 'worth telling people about' vs 'meh'."
              tips="Read every detractor comment in the Responses tab and fix the top recurring snag; use the 'Fires on' moment to localise it (a low 'prolonged browsing' pulse = hard-to-navigate menu; low 'after ordering' = checkout friction); convert a 4★ passive with a small post-order delight (a free-espresso voucher on the receipt)."
              methodology="round((promoters − detractors) / total × 100), promoter = 5★, detractor ≤ 3★, passive = 4★ (ignored). Source: every SurveyResponse in the selected set (computePulseScore in src/lib/surveys.ts) — all answers counted, no sampling."
            />
          }
        />
        <Kpi label="Avg rating" icon={Star} value={avg ? `${avg.toFixed(1)}` : "—"} accentVar="--av3-c2" />
        <Kpi label="Responses" icon={MessageSquare} value={`${responses.length}`} accentVar="--av3-c3" />
      </KpiRail>

      <div className="av3-filterchips">
        <button type="button" className={`av3-fchip ${tab === "catalogue" ? "is-active" : ""}`} onClick={() => setTab("catalogue")}>Catalogue<span className="av3-fchip-count">{surveys.length}</span></button>
        <button type="button" className={`av3-fchip ${tab === "responses" ? "is-active" : ""}`} onClick={() => setTab("responses")}>Responses<span className="av3-fchip-count">{responses.length}</span></button>
      </div>

      {loading && surveys.length === 0 ? (
        <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={6} /></div>
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
