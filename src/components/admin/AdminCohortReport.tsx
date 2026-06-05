"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAdminBase } from "./v2/useAdminBase";
import { withAdminBase } from "@/lib/admin-base";
import { RotateCcw, TrendingUp, Users } from "lucide-react";
import { Button, Card, CardBody, EmptyState, InfoButton, PageHero } from "./v2/ui";
import { MetricExplainer, PageExplainer } from "./Explainers";
import { KpiCard } from "./v2/charts";
import { formatPrice } from "@/lib/utils";
import { CohortSandbox } from "./CohortSandbox";


interface CohortRow {
  cohortMonth: string;
  cohortSize: number;
  newCustomerRevenueGrosze: number;
  retention: { monthOffset: number; retained: number; revenueGrosze: number }[];
}

interface CltvSummary {
  cohortMonth: string;
  cohortSize: number;
  cltv30Grosze: number;
  cltv60Grosze: number;
  cltv90Grosze: number;
  cltv180Grosze: number;
  cltv365Grosze: number;
}

interface CohortReport {
  generatedAt: string;
  cohortsByMonth: CohortRow[];
  cltv: CltvSummary[];
  totals: {
    customers: number;
    repeatCustomers: number;
    repeatRatePct: number;
    avgOrdersPerCustomer: number;
    medianGrossePerCustomer: number;
  };
}

// Single-hue (burgundy) sequential ramp per theme/color.md — never a rainbow/green
// ramp. Steps interpolate brand→surface via color-mix (resolves in CSS).
const HEAT_COLORS = [
  "color-mix(in oklab, var(--brand) 16%, var(--surface-1))",
  "color-mix(in oklab, var(--brand) 32%, var(--surface-1))",
  "color-mix(in oklab, var(--brand) 48%, var(--surface-1))",
  "color-mix(in oklab, var(--brand) 64%, var(--surface-1))",
  "color-mix(in oklab, var(--brand) 80%, var(--surface-1))",
  "color-mix(in oklab, var(--brand) 96%, var(--surface-1))",
];
function heatColor(pct: number): string {
  const idx = Math.min(HEAT_COLORS.length - 1, Math.floor(pct / 20));
  return HEAT_COLORS[idx];
}

/** KPI label with a per-card InfoButton (ⓘ) whose dialog follows the
 *  five-section MetricExplainer contract (CLAUDE.md Rule #12). */
function kpiInfo(text: string, body: ReactNode): ReactNode {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {text}
      <InfoButton title={text} label={`What is ${text}?`} size="sm">
        {body}
      </InfoButton>
    </span>
  );
}

export function AdminCohortReport() {
  return <AdminCohortReportDesktop />;
}

function AdminCohortReportDesktop() {
  const base = useAdminBase();
  const [data, setData] = useState<CohortReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [segmentCounts, setSegmentCounts] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [report, segs] = await Promise.all([
        fetch("/api/admin/reports/cohort").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/admin/customer-segments").then((r) => (r.ok ? r.json() : null)),
      ]);
      setData(report);
      setSegmentCounts(segs?.counts ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rebuild = async () => {
    setBusy(true);
    try {
      await fetch("/api/admin/customer-segments", { method: "POST" });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const horizonCols = useMemo(() => {
    if (!data) return [] as number[];
    const max = Math.max(0, ...data.cohortsByMonth.map((c) => c.retention.length));
    return Array.from({ length: Math.min(13, max) }, (_, i) => i);
  }, [data]);

  if (loading) {
    return (
      <div className="v2-page">
        <div className="v2-page-loading">Loading Cohort & CLTV…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="v2-page">
        <PageHero
          title={<>Cohort retention &amp; CLTV</>}
          subtitle="No paid orders yet — nothing to bucket."
        />
        <Card>
          <CardBody>
            <EmptyState
              icon={TrendingUp}
              title="No data"
              description="Once orders start landing, every customer is bucketed by their first-paid-order month and retention rolls in here."
            />
          </CardBody>
        </Card>
        <CohortSandbox />
      </div>
    );
  }

  return (
    <div className="v2-page">
      <PageHero
        title={<>Cohort retention &amp; CLTV</>}
        subtitle={
          <>
            Every customer is bucketed by their first-paid-order month.
            Retention shows what % of that bucket reordered N months later;
            CLTV columns are mean revenue per cohort customer through each
            horizon. Generated{" "}
            {new Date(data.generatedAt).toLocaleString("pl-PL")}.
          </>
        }
        actions={
          <Button
            variant="ghost"
            size="sm"
            loading={busy}
            onClick={rebuild}
            leadingIcon={<RotateCcw className="h-3.5 w-3.5" />}
            aria-label="Rebuild segments"
            title="Rebuild segments"
          />
        }
      />

      <section className="v2-kpi-grid">
        <KpiCard
          label={kpiInfo(
            "Paid customers",
            <MetricExplainer
              description="The number of distinct customers who have placed at least one paid order in the window."
              institutional={
                <p style={{ margin: 0 }}>
                  The denominator of every cohort metric and the base of the acquisition funnel.
                  Reviewers care less about the absolute count than its growth rate and the
                  new-vs-returning split — a count that grows only on paid spend, with flat repeat,
                  is renting traffic rather than building a base.
                </p>
              }
              plain={
                <p style={{ margin: 0 }}>
                  Simply how many different people have actually paid you. Everything else on this
                  page — repeat rate, CLTV, retention — is sliced out of this group.
                </p>
              }
              tips={
                <p style={{ margin: 0 }}>
                  Grow it without wrecking economics: referrals and word-of-mouth bring customers who
                  behave like your best ones. Capture the phone at checkout (zero-friction loyalty)
                  so a first-time buyer becomes a known, re-marketable customer.
                </p>
              }
              methodology={
                <p style={{ margin: 0 }}>
                  Distinct customers (by phone, per the loyalty capture at checkout) with ≥ 1 paid
                  order in the window, from the orders table.
                </p>
              }
            />,
          )}
          value={data.totals.customers}
          icon={Users}
          tone="info"
        />
        <KpiCard
          label={kpiInfo(
            "Repeat customers",
            <MetricExplainer
              description="How many customers have ordered more than once — and, as the hint, what share that is of all customers."
              institutional={
                <p style={{ margin: 0 }}>
                  Repeat rate is the most predictive input to CLTV and the first thing diligence
                  stress-tests. Below ~25% a casual/QSR book is effectively buying one-time traffic;
                  above ~35% the economics compound. The gap between a 30% and a 40% book is the
                  difference between renting customers and owning them.
                </p>
              }
              plain={
                <p style={{ margin: 0 }}>
                  Out of everyone who tried you, how many came back? The ones who do are where almost
                  all your profit lives — a repeat customer costs nothing to re-acquire.
                </p>
              }
              tips={
                <p style={{ margin: 0 }}>
                  The second order is the hard one. Fire a timed &ldquo;we saved your usual&rdquo; nudge
                  5–7 days out, make visit #2 easy, and keep speed and consistency high so the habit
                  forms. Win back lapsing customers before chasing brand-new ones.
                </p>
              }
              methodology={
                <p style={{ margin: 0 }}>
                  Customers with ≥ 2 paid orders. The hint is{" "}
                  <code>repeat customers ÷ total customers</code>; tone turns green at ≥ 25%.
                </p>
              }
            />,
          )}
          value={data.totals.repeatCustomers}
          hint={`${data.totals.repeatRatePct}% repeat rate`}
          tone={data.totals.repeatRatePct >= 25 ? "success" : "warning"}
        />
        <KpiCard
          label={kpiInfo(
            "Avg orders / customer",
            <MetricExplainer
              description="The average number of paid orders each customer has placed."
              institutional={
                <p style={{ margin: 0 }}>
                  Frequency is the volume half of CLTV and the cheapest growth there is — an existing
                  customer carries zero marginal CAC. Watch it because total orders can rise on ad
                  spend while orders/customer quietly falls: a leaky bucket dressed up as growth.
                </p>
              }
              plain={
                <p style={{ margin: 0 }}>
                  If this is 2.6, the typical customer orders between two and three times before they
                  drift away. Nudge that toward 3 and you&apos;ve added a whole order of profit per
                  customer, free of acquisition cost.
                </p>
              }
              tips={
                <p style={{ margin: 0 }}>
                  Frequency responds to occasions and reminders: a slow-day offer, a loyalty
                  punch-card, a saved-usual reorder button. Target the lapsing customers, not the
                  regulars who&apos;d come anyway.
                </p>
              }
              methodology={
                <p style={{ margin: 0 }}>
                  Total paid orders ÷ distinct customers in the window.
                </p>
              }
            />,
          )}
          value={data.totals.avgOrdersPerCustomer}
          format={(n) => n.toFixed(2)}
        />
        <KpiCard
          label={kpiInfo(
            "Median spend",
            <MetricExplainer
              description="The lifetime spend of the middle customer — half spend more, half spend less."
              institutional={
                <p style={{ margin: 0 }}>
                  Median, not mean, is the honest centre for spend: a handful of whales drag the
                  average up and flatter the picture. The gap between median and mean is itself a
                  signal — a wide gap means your economics lean on a few big spenders rather than a
                  broad, healthy base.
                </p>
              }
              plain={
                <p style={{ margin: 0 }}>
                  Line every customer up by how much they&apos;ve spent with you; this is the person
                  in the middle. It tells you what a <em>typical</em> customer is worth, not what the
                  one big-spender skews it to.
                </p>
              }
              tips={
                <p style={{ margin: 0 }}>
                  Lift the median by raising the floor: bigger baskets (combos, attach), more repeat
                  visits, and converting one-timers into twice-buyers — moving the middle matters more
                  than chasing another whale.
                </p>
              }
              methodology={
                <p style={{ margin: 0 }}>
                  Median of total paid spend (grosze) per customer across the window.
                </p>
              }
            />,
          )}
          value={data.totals.medianGrossePerCustomer}
          display={formatPrice(data.totals.medianGrossePerCustomer)}
        />
      </section>

      <PageExplainer
        hint="A cohort = everyone whose first order landed in the same month"
        description={
          <>
            This page groups every customer by the month they <strong>first</strong>{" "}
            ordered, then follows each group over time — so you can see whether
            customers stick around (retention) and how much they&apos;re worth
            (CLTV), and whether newer months are healthier than older ones.
          </>
        }
        institutional={
          <p style={{ margin: 0 }}>
            Cohort retention and CLTV are the unit-economics backbone every consumer
            investor underwrites: a book that retains is a compounding asset, one that
            doesn&apos;t is a leaky bucket no acquisition budget can fill. The QSR /
            fast-casual benchmark is a <strong>month-1 repeat of 25%+</strong> and a
            retention curve that <strong>flattens</strong> (rather than trending to
            zero) by month&nbsp;3–4 — a flat tail is the signature of a habit, and the
            gate for funding acquisition. Read recent cohorts against older ones:
            decay in the newest months is the earliest warning that the product or
            operation regressed, visible here long before the blended average moves.
          </p>
        }
        plain={
          <p style={{ margin: 0 }}>
            Think of each row as a class that started in a given month. The{" "}
            <strong>retention matrix</strong> reads left-to-right: of the people who
            first ordered in January, what % came back in month&nbsp;1, month&nbsp;2,
            and so on. A line that <strong>stays high</strong> = you built a habit; a
            line that <strong>nosedives</strong> = you&apos;re renting customers, not
            keeping them. The <strong>repeat rate</strong> up top is the blunt version
            of the same thing: <strong>25%+</strong> is a healthy sit-down-quality
            number for QSR. <strong>CLTV</strong> is what an average customer has spent
            by 30/60/90/180/365 days in — watch the 365-day column climb as a cohort
            matures.
          </p>
        }
        tips={
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Fix the month-1 drop first.</strong> The biggest retention loss is always between the 1st and 2nd order — a timely &ldquo;come back this week&rdquo; nudge moves it most.</li>
            <li><strong>Compare cohorts, not just the average.</strong> If recent months retain worse than older ones, something changed (menu, pricing, a bad delivery window) — find it.</li>
            <li><strong>Feed acquisition spend</strong> into <Link href={withAdminBase(base, "/admin/business-costs")} className="v2-link">Business costs → Marketing</Link> so these cohorts also get a CAC + payback on the LTV/CAC page.</li>
            <li><strong>Champion your champions.</strong> The segment mix below flags your most valuable repeat buyers — give them the loyalty perks that keep the curve flat.</li>
          </ul>
        }
        methodology={
          <p style={{ margin: 0 }}>
            Cohorts are keyed by each customer&apos;s <strong>first paid order</strong>{" "}
            (pending/cancelled orders are ignored). Retention for month N = cohort
            members who ordered in month N ÷ cohort size. CLTV = cumulative revenue
            per cohort customer through each day-horizon. All computed live from the
            orders table by <code>buildCohortReport</code> (the same engine behind{" "}
            <Link href={withAdminBase(base, "/admin/reports/ltv-cac")} className="v2-link">LTV / CAC</Link>).
            Young cohorts under-state the 365-day column simply because they
            haven&apos;t lived a full year yet.
          </p>
        }
      />

      {segmentCounts && Object.keys(segmentCounts).length > 0 && (
        <Card>
          <CardBody>
            <div className="v2-detail-head">
              <h2>Segment mix</h2>
              <span className="v2-detail-head-hint">Recomputed weekly</span>
            </div>
            <div className="v2-cohort-segments">
              {Object.entries(segmentCounts).map(([seg, n]) => (
                <div key={seg} className="v2-cohort-segment">
                  <span className="v2-cohort-segment-label">{seg}</span>
                  <span className="v2-cohort-segment-value tabular">
                    {n.toLocaleString("pl-PL")}
                  </span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <div className="v2-detail-head">
            <h2>Retention matrix</h2>
            <span className="v2-detail-head-hint">
              Rows = cohort month · cells = % of that cohort that reordered N months later
            </span>
          </div>
          <div className="v2-cohort-table-wrap">
            <table className="v2-cohort-table">
              <thead>
                <tr>
                  <th className="v2-cohort-th-cohort">Cohort</th>
                  <th className="v2-cohort-th-num">Size</th>
                  {horizonCols.map((m) => (
                    <th key={m} className="v2-cohort-th-month">
                      M{m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.cohortsByMonth
                  .slice(-18)
                  .reverse()
                  .map((c) => (
                    <tr key={c.cohortMonth}>
                      <td className="v2-cohort-td-cohort tabular">
                        {c.cohortMonth}
                      </td>
                      <td className="v2-cohort-td-num tabular">
                        {c.cohortSize}
                      </td>
                      {horizonCols.map((offset) => {
                        const r = c.retention[offset];
                        if (!r) return <td key={offset} className="v2-cohort-td-cell" />;
                        const pct = c.cohortSize > 0
                          ? Math.round((r.retained / c.cohortSize) * 100)
                          : 0;
                        return (
                          <td
                            key={offset}
                            className="v2-cohort-td-cell tabular"
                            style={{
                              background: pct > 0 ? heatColor(pct) : undefined,
                              color: pct > 30 ? "#fff" : undefined,
                            }}
                            title={`${r.retained}/${c.cohortSize} reordered · ${formatPrice(r.revenueGrosze)}`}
                          >
                            {pct > 0 ? `${pct}%` : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="v2-detail-head">
            <h2>Mean CLTV by cohort</h2>
            <span className="v2-detail-head-hint">
              Revenue per cohort customer at each horizon
            </span>
          </div>
          <div className="v2-cohort-table-wrap">
            <table className="v2-cohort-table">
              <thead>
                <tr>
                  <th className="v2-cohort-th-cohort">Cohort</th>
                  <th className="v2-cohort-th-num">Size</th>
                  <th className="v2-cohort-th-num">30d</th>
                  <th className="v2-cohort-th-num">60d</th>
                  <th className="v2-cohort-th-num">90d</th>
                  <th className="v2-cohort-th-num">180d</th>
                  <th className="v2-cohort-th-num">365d</th>
                </tr>
              </thead>
              <tbody>
                {data.cltv
                  .slice(-12)
                  .reverse()
                  .map((c) => (
                    <tr key={c.cohortMonth}>
                      <td className="v2-cohort-td-cohort tabular">
                        {c.cohortMonth}
                      </td>
                      <td className="v2-cohort-td-num tabular">{c.cohortSize}</td>
                      <td className="v2-cohort-td-num tabular">
                        {formatPrice(c.cltv30Grosze)}
                      </td>
                      <td className="v2-cohort-td-num tabular">
                        {formatPrice(c.cltv60Grosze)}
                      </td>
                      <td className="v2-cohort-td-num tabular">
                        {formatPrice(c.cltv90Grosze)}
                      </td>
                      <td className="v2-cohort-td-num tabular">
                        {formatPrice(c.cltv180Grosze)}
                      </td>
                      <td className="v2-cohort-td-num v2-cohort-td-headline tabular">
                        {formatPrice(c.cltv365Grosze)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
      <CohortSandbox />
    </div>
  );
}
