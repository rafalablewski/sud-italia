"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Gauge,
  MessageSquare,
  Star,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
} from "lucide-react";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  InfoButton,
  Switch,
  Table,
  Tabs,
  useToast,
  type Column,
} from "./v2/ui";
import { BarChart, KpiCard } from "./v2/charts";
import { StarRating } from "@/components/rating/StarRating";
import { MetricExplainer } from "./Explainers";
import {
  averageStars,
  computePulseScore,
  pulseBreakdown,
  SURVEY_TRIGGER_LABEL,
  type SurveyDefinition,
  type SurveyResponse,
  type SurveyTrigger,
} from "@/lib/surveys";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pulseTone(score: number): "success" | "info" | "warning" | "danger" {
  if (score >= 50) return "success";
  if (score >= 0) return "info";
  if (score >= -25) return "warning";
  return "danger";
}

export function AdminSurveys() {
  const toast = useToast();
  const [surveys, setSurveys] = useState<SurveyDefinition[]>([]);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"overview" | "catalogue" | "responses">("overview");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/surveys");
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as {
        surveys: SurveyDefinition[];
        responses: SurveyResponse[];
      };
      setSurveys(data.surveys ?? []);
      setResponses(data.responses ?? []);
    } catch {
      toast.error("Could not load surveys");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const { total, pulse, promoters, detractors } = pulseBreakdown(responses);
    const avg = averageStars(responses);
    const counts = [0, 0, 0, 0, 0];
    for (const r of responses) {
      if (r.rating >= 1 && r.rating <= 5) counts[r.rating - 1]++;
    }
    const ratingDist = [1, 2, 3, 4, 5].map((star) => ({
      rating: `${star}★`,
      count: counts[star - 1],
    }));
    return { total, pulse, avg, promoters, detractors, ratingDist };
  }, [responses]);

  // Per-survey roll-up: response count, avg stars, pulse score.
  const perSurvey = useMemo(() => {
    const byId = new Map<string, SurveyResponse[]>();
    for (const r of responses) {
      const list = byId.get(r.surveyId) ?? [];
      list.push(r);
      byId.set(r.surveyId, list);
    }
    return surveys.map((s) => {
      const rs = byId.get(s.id) ?? [];
      return {
        survey: s,
        count: rs.length,
        avg: averageStars(rs),
        pulse: computePulseScore(rs),
      };
    });
  }, [surveys, responses]);

  const triggerDist = useMemo(() => {
    return (Object.keys(SURVEY_TRIGGER_LABEL) as SurveyTrigger[]).map((t) => ({
      trigger: SURVEY_TRIGGER_LABEL[t],
      count: responses.filter((r) => r.trigger === t).length,
    }));
  }, [responses]);

  const patchSurvey = useCallback(
    async (id: string, updates: Partial<SurveyDefinition>) => {
      setBusy((s) => new Set(s).add(id));
      // Optimistic — toggle = saved (rule 7).
      setSurveys((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...updates } : s)),
      );
      try {
        const res = await fetch("/api/admin/surveys", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...updates }),
        });
        if (!res.ok) throw new Error("save failed");
        if (typeof updates.active === "boolean") {
          toast.success(updates.active ? "Survey activated" : "Survey paused");
        } else {
          toast.success("Survey updated");
        }
      } catch {
        toast.error("Could not save — reverting");
        await load();
      } finally {
        setBusy((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
      }
    },
    [toast, load],
  );

  const catalogueCols: Column<(typeof perSurvey)[number]>[] = [
    {
      key: "question",
      header: "Survey",
      cell: ({ survey }) => (
        <div className="v2-cell-stack">
          <span style={{ fontWeight: 500 }}>{survey.question}</span>
          <span className="v2-cell-sub">{survey.subtext || "—"}</span>
        </div>
      ),
    },
    {
      key: "trigger",
      header: "Fires on",
      cell: ({ survey }) => (
        <Badge tone="info" variant="soft">
          {SURVEY_TRIGGER_LABEL[survey.trigger]}
        </Badge>
      ),
    },
    {
      key: "count",
      header: "Responses",
      align: "right",
      cell: ({ count }) => <span className="mono">{count}</span>,
    },
    {
      key: "avg",
      header: "Avg",
      align: "right",
      cell: ({ avg, count }) => (
        <span className="mono">{count ? `${avg.toFixed(2)}★` : "—"}</span>
      ),
    },
    {
      key: "pulse",
      header: "Pulse",
      align: "right",
      cell: ({ pulse, count }) =>
        count ? (
          <Badge tone={pulseTone(pulse)} variant="soft">
            {pulse > 0 ? `+${pulse}` : pulse}
          </Badge>
        ) : (
          <span className="v2-muted">—</span>
        ),
    },
    {
      key: "active",
      header: "Live",
      align: "center",
      cell: ({ survey }) => (
        <Switch
          checked={survey.active}
          disabled={busy.has(survey.id)}
          label={survey.active ? "Pause survey" : "Activate survey"}
          onChange={(next) => patchSurvey(survey.id, { active: next })}
        />
      ),
    },
  ];

  const responseCols: Column<SurveyResponse>[] = [
    {
      key: "rating",
      header: "Rating",
      cell: (r) => <StarRating rating={r.rating} size="sm" showValue={false} />,
    },
    {
      key: "survey",
      header: "Survey",
      cell: (r) => {
        const s = surveys.find((x) => x.id === r.surveyId);
        return (
          <div className="v2-cell-stack">
            <span style={{ fontWeight: 500 }}>{s?.question ?? r.surveyId}</span>
            <span className="v2-cell-sub">
              {SURVEY_TRIGGER_LABEL[r.trigger] ?? r.trigger}
            </span>
          </div>
        );
      },
    },
    {
      key: "comment",
      header: "Comment",
      cell: (r) =>
        r.comment ? (
          <span style={{ fontStyle: "italic" }}>&ldquo;{r.comment}&rdquo;</span>
        ) : (
          <span className="v2-muted">No comment</span>
        ),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (r) =>
        r.customerName || r.customerPhone ? (
          <div className="v2-cell-stack">
            <span>{r.customerName || "—"}</span>
            <span className="v2-cell-sub mono">{r.customerPhone || ""}</span>
          </div>
        ) : (
          <span className="v2-muted">Anonymous</span>
        ),
    },
    {
      key: "where",
      header: "Where",
      cell: (r) => (
        <span className="v2-muted mono" style={{ fontSize: "0.8125rem" }}>
          {r.locationSlug || r.pagePath || "—"}
        </span>
      ),
    },
    {
      key: "date",
      header: "When",
      cell: (r) => <span className="v2-muted">{fmtDate(r.date)}</span>,
    },
  ];

  if (loading) {
    // Canonical admin loading state — the .v2-page-loading pill wrapped in
    // .v2-page (admin/theme/components.md → "Loading states"), same as every
    // other admin page. Never an EmptyState.
    return (
      <div className="v2-page">
        <div className="v2-page-loading">Loading surveys…</div>
      </div>
    );
  }

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1
            className="v2-page-title"
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            Pulse surveys
            <InfoButton title="How Pulse surveys work" size="md">
              <MetricExplainer
                description="Pulse fires a one-tap 1–5★ question at the right moment in a guest's visit, then nets the answers into an NPS-style score so you can see — and move — how guests actually feel."
                institutional={
                  <p style={{ margin: 0 }}>
                    Treat this as a continuous relationship-NPS instrument, not a
                    one-off CSAT poll. The gate: a Pulse score below 0 is a churn
                    signal, 0–30 workable, 30–50 good, 50+ best-in-class for QSR.
                    Always read a score against its response count — anything
                    under ~30 answers is directional, not decisive. Because every
                    prompt is tagged with the moment it fired (after ordering,
                    prolonged browsing, exit intent…), you can localise a problem
                    to a stage of the funnel instead of guessing.
                  </p>
                }
                plain={
                  <p style={{ margin: 0 }}>
                    Think of it as quietly asking guests &ldquo;would you tell a
                    friend?&rdquo; at the moments that matter. If 100 people answer
                    after ordering — 60 tap 5★, 25 tap 4★, 15 tap ≤3★ — your Pulse
                    is 60 − 15 = <strong>+45</strong>. The same gut-feel a regular
                    who spends 50 zł a week would give when a friend asks
                    &ldquo;is that pizza place any good?&rdquo;
                  </p>
                }
                tips={
                  <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
                    <li><strong>Activate the right surveys</strong> in the Catalogue tab — start with the two defaults (after ordering, prolonged browsing), then add one at a time so you can read each signal cleanly.</li>
                    <li><strong>Read every detractor comment</strong> in the Responses tab and fix the top recurring snag first — that single fix moves the score most.</li>
                    <li><strong>Use the trigger breakdown</strong>: a weak &ldquo;prolonged browsing&rdquo; Pulse means the menu is hard to navigate; a weak &ldquo;after ordering&rdquo; Pulse means checkout friction.</li>
                    <li><strong>Don&apos;t over-ask.</strong> The storefront already caps prompts to one per session with an 8h gap and a per-survey cooldown — adding more active surveys widens coverage, it doesn&apos;t nag the same guest more.</li>
                  </ul>
                }
                methodology={
                  <p style={{ margin: 0 }}>
                    Prompts are elected client-side by the trigger engine
                    (<code>src/store/survey.ts</code> + <code>SurveyTriggerEngine</code>)
                    and rendered by <code>SurveyPrompt</code>; answers POST to
                    <code>/api/surveys</code> (rate-limited per IP + phone) and
                    persist to the <code>survey_responses</code> table. Active
                    surveys ship via <code>/api/settings/public</code>; the whole
                    feature is gated by the <code>showNpsSurvey</code> Layout
                    toggle. Pulse score = <code>round((promoters − detractors) / total × 100)</code>{" "}
                    with promoter = 5★, detractor ≤ 3★, passive = 4★ ignored. No
                    sampling — every response counts.
                  </p>
                }
              />
            </InfoButton>
          </h1>
          <p className="v2-page-subtitle">
            NPS-style micro-surveys captured across the storefront — after
            ordering, on prolonged browsing, on exit intent. One tap, 1–5 stars.
          </p>
        </div>
      </header>

      <section className="v2-kpi-grid">
        <KpiCard
          label={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              Pulse score
              <InfoButton title="Pulse score (NPS-style)" size="sm">
                <MetricExplainer
                  description="The net of promoters (5★) minus detractors (1–3★) as a share of all answers, on a −100…+100 scale — a classic NPS computed from the 5-star Pulse prompts."
                  institutional={
                    <p style={{ margin: 0 }}>
                      A standard relationship-NPS gate: below 0 means more
                      detractors than promoters (churn risk), 0–30 is workable,
                      30–50 good, and 50+ is best-in-class loyalty for QSR.
                      Read it alongside response volume — a +80 off 4 answers is
                      noise; treat anything under ~30 responses as directional.
                    </p>
                  }
                  plain={
                    <p style={{ margin: 0 }}>
                      Imagine 100 guests tap a rating after ordering: 60 give
                      5★ (promoters), 25 give 4★ (passives, ignored), 15 give
                      ≤3★ (detractors). Pulse = 60 − 15 = <strong>+45</strong>.
                      It&apos;s the same scorecard a 50 zł Margherita regular
                      would give a friend — &ldquo;worth telling people about&rdquo;
                      vs &ldquo;meh&rdquo;.
                    </p>
                  }
                  tips={
                    <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
                      <li>Open the <strong>Responses</strong> tab and read every detractor comment — fix the top recurring snag first.</li>
                      <li>Use <strong>Fires on</strong> targeting: a low &ldquo;prolonged browsing&rdquo; pulse means the menu is hard to navigate; a low &ldquo;after ordering&rdquo; pulse means checkout friction.</li>
                      <li>Turn a passive (4★) into a promoter with a small post-order delight — a free espresso voucher in the receipt.</li>
                    </ul>
                  }
                  methodology={
                    <p style={{ margin: 0 }}>
                      <code>round((promoters − detractors) / total × 100)</code>{" "}
                      where promoter = 5★, detractor ≤ 3★, passive = 4★
                      (ignored). Source: every <code>SurveyResponse</code> in
                      the selected set (<code>computePulseScore</code> in
                      <code>src/lib/surveys.ts</code>). Responses persist via
                      the store — no sampling, all answers counted.
                    </p>
                  }
                />
              </InfoButton>
            </span>
          }
          value={totals.pulse}
          display={totals.total ? (totals.pulse > 0 ? `+${totals.pulse}` : `${totals.pulse}`) : "—"}
          icon={Gauge}
          tone={pulseTone(totals.pulse)}
          hint={`${totals.total} responses`}
        />
        <KpiCard
          label="Avg rating"
          value={totals.avg}
          display={totals.avg ? `${totals.avg.toFixed(2)} ★` : "—"}
          icon={Star}
          tone={
            totals.total === 0
              ? "neutral"
              : totals.avg >= 4
                ? "success"
                : totals.avg >= 3
                  ? "warning"
                  : "danger"
          }
        />
        <KpiCard
          label="Promoters (5★)"
          value={totals.promoters}
          icon={ThumbsUp}
          tone="success"
        />
        <KpiCard
          label="Detractors (≤3★)"
          value={totals.detractors}
          icon={ThumbsDown}
          tone="danger"
          higherIsBetter={false}
        />
      </section>

      <div style={{ margin: "1rem 0" }}>
        <Tabs
          value={tab}
          onChange={(v) => setTab(v as typeof tab)}
          tabs={[
            { value: "overview", label: "Overview" },
            { value: "catalogue", label: `Catalogue (${surveys.length})` },
            { value: "responses", label: `Responses (${responses.length})` },
          ]}
        />
      </div>

      {tab === "overview" && (
        <section className="v2-grid-2">
          <Card>
            <CardHeader title="Rating distribution" description="All Pulse answers, 1–5★." />
            <CardBody>
              {totals.ratingDist.every((r) => r.count === 0) ? (
                <EmptyState icon={Star} title="No ratings yet" compact />
              ) : (
                <BarChart
                  data={totals.ratingDist}
                  xKey="rating"
                  series={[{ key: "count", label: "Responses" }]}
                  height={220}
                />
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Responses by trigger"
              description="Which moment is capturing the most voice-of-customer."
            />
            <CardBody>
              {triggerDist.every((t) => t.count === 0) ? (
                <EmptyState icon={Sparkles} title="No responses yet" compact />
              ) : (
                <BarChart
                  data={triggerDist}
                  xKey="trigger"
                  series={[{ key: "count", label: "Responses" }]}
                  height={220}
                />
              )}
            </CardBody>
          </Card>
        </section>
      )}

      {tab === "catalogue" && (
        <Card padding="none">
          <CardHeader
            title="Survey catalogue"
            description="Flip a survey live to start collecting. Each fires on a specific browsing moment; the storefront shows at most one per session and respects each survey's cooldown."
          />
          <Table
            flush
            rows={perSurvey}
            columns={catalogueCols}
            rowKey={(r) => r.survey.id}
            defaultSort={{ key: "count", dir: "desc" }}
          />
        </Card>
      )}

      {tab === "responses" && (
        <Card padding="none">
          <CardHeader title="Recent responses" description="Newest first — read the detractor comments." />
          {responses.length === 0 ? (
            <CardBody>
              <EmptyState
                icon={MessageSquare}
                title="No responses yet"
                description="Activate a survey in the Catalogue tab to start collecting."
                compact
              />
            </CardBody>
          ) : (
            <Table
              flush
              rows={responses}
              columns={responseCols}
              rowKey={(r) => r.id}
              defaultSort={{ key: "date", dir: "desc" }}
            />
          )}
        </Card>
      )}
    </div>
  );
}
