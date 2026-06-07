"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAdminBase } from "@/shared/useAdminBase";
import { withAdminBase } from "@/lib/admin-base";
import { Coins, TrendingUp, Wallet, Timer, AlertTriangle, ExternalLink } from "lucide-react";
import { MetricExplainer, PageExplainer } from "./Explainers";
import { Button, Card, CardBody, EmptyState, InfoButton, PageHero } from "@/ui";
import { KpiCard } from "./v2/charts";
import { LineChart } from "./v2/charts";
import { formatPrice } from "@/lib/utils";
import { LtvCacSandbox } from "./LtvCacSandbox";

interface LtvCacMonthRow {
  cohortMonth: string;
  newCustomers: number;
  marketingSpendGrosze: number;
  cacGrosze: number | null;
  ltv365Grosze: number;
  ltv365MarginGrosze: number;
  ltvCacRatio: number | null;
  paybackMonths: number | null;
}

interface LtvCacReport {
  generatedAt: string;
  blendedMarginPct: number;
  totals: {
    newCustomers: number;
    marketingSpendGrosze: number;
    blendedCacGrosze: number | null;
    blendedLtvGrosze: number;
    blendedLtvMarginGrosze: number;
    ltvCacRatio: number | null;
    paybackMonths: number | null;
    hasMarketingData: boolean;
  };
  months: LtvCacMonthRow[];
}

interface CohortRow {
  cohortMonth: string;
  cohortSize: number;
  retention: { monthOffset: number; retained: number; revenueGrosze: number }[];
}
interface CohortReport {
  cohortsByMonth: CohortRow[];
}

function fmtRatio(r: number | null): string {
  return r === null ? "—" : `${r.toFixed(1)}×`;
}
function fmtPayback(m: number | null): string {
  if (m === null) return "—";
  if (m >= 13) return ">12 mo";
  return `${m} mo`;
}

/** Size-weighted blended retention by month-offset: Σ retained / Σ cohortSize
 *  over cohorts that have actually reached that offset. The investor "show me
 *  a cohort retention curve" answer — one line, real data. */
function blendedRetentionCurve(
  cohorts: CohortRow[],
): { offset: string; retention: number }[] {
  const maxLen = Math.max(0, ...cohorts.map((c) => c.retention.length));
  const out: { offset: string; retention: number }[] = [];
  for (let i = 0; i < Math.min(13, maxLen); i++) {
    let retained = 0;
    let size = 0;
    for (const c of cohorts) {
      const r = c.retention[i];
      if (!r) continue; // cohort hasn't reached this offset yet
      retained += r.retained;
      size += c.cohortSize;
    }
    if (size === 0) continue;
    out.push({ offset: `M${i}`, retention: Math.round((retained / size) * 1000) / 10 });
  }
  return out;
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

export function AdminLtvCac() {
  const base = useAdminBase();
  const [data, setData] = useState<LtvCacReport | null>(null);
  const [cohort, setCohort] = useState<CohortReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ltv, coh] = await Promise.all([
        fetch("/api/admin/reports/ltv-cac").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/admin/reports/cohort").then((r) => (r.ok ? r.json() : null)),
      ]);
      setData(ltv);
      setCohort(coh);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const curve = useMemo(
    () => (cohort ? blendedRetentionCurve(cohort.cohortsByMonth) : []),
    [cohort],
  );

  if (loading) {
    return (
      <div className="v2-page">
        <div className="v2-page-loading">Loading LTV / CAC…</div>
      </div>
    );
  }

  if (!data || data.totals.newCustomers === 0) {
    return (
      <div className="v2-page">
        <PageHero
          title="LTV / CAC"
          subtitle="No paid customers yet — nothing to value."
        />
        <Card>
          <CardBody>
            <EmptyState
              icon={TrendingUp}
              title="No data"
              description="Once paid orders land, lifetime value, acquisition cost, and the LTV:CAC ratio compute here from real orders + your marketing-cost ledger."
            />
          </CardBody>
        </Card>
        <LtvCacSandbox />
      </div>
    );
  }

  const t = data.totals;

  return (
    <div className="v2-page">
      <PageHero
        title="LTV / CAC"
        subtitle={
          <>
            Lifetime value from paid-order cohorts, acquisition cost from your{" "}
            <Link href={withAdminBase(base, "/admin/business-costs")} className="v2-link">marketing-cost ledger</Link>.
            LTV is margin-adjusted at the blended {data.blendedMarginPct}% gross margin
            derived from order line items. Generated{" "}
            {new Date(data.generatedAt).toLocaleString("pl-PL")}.
          </>
        }
        actions={
          <Link href={withAdminBase(base, "/admin/reports/cohort")}>
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={<ExternalLink className="h-3.5 w-3.5" />}
              aria-label="Cohort & CLTV"
              title="Cohort & CLTV"
            />
          </Link>
        }
      />

      {!t.hasMarketingData && (
        <Card>
          <CardBody>
            <div className="v2-callout v2-callout-warning" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <AlertTriangle className="h-4 w-4" style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <strong>No marketing spend logged.</strong> LTV is computed, but
                CAC, the LTV:CAC ratio, and payback need acquisition spend. Add
                your ad / promo spend under{" "}
                <Link href={withAdminBase(base, "/admin/business-costs")} className="v2-link">Business costs → Marketing</Link>{" "}
                and it flows in here automatically.
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <section className="v2-kpi-grid">
        <KpiCard
          label={kpiInfo(
            "LTV : CAC",
            <MetricExplainer
              description="How many złoty of lifetime gross profit you earn for each złoty spent acquiring a customer."
              institutional={
                <p style={{ margin: 0 }}>
                  The defining unit-economics ratio in consumer investing. 3× is the institutional
                  floor — below it growth destroys value; at 3–5× you scale; far above 5× you&apos;re
                  under-investing in growth. Read it blended <em>and</em> by cohort, because a healthy
                  blend can mask a deteriorating recent cohort.
                </p>
              }
              plain={
                <p style={{ margin: 0 }}>
                  Spend 35&nbsp;zł to win a customer worth ~92&nbsp;zł of margin and you&apos;re at
                  2.6× — under the bar, so each customer is a touch too expensive. Make them worth
                  more or acquire them cheaper.
                </p>
              }
              tips={
                <p style={{ margin: 0 }}>
                  Lift the numerator before cutting the denominator: raising LTV (retention, AOV,
                  margin) compounds across every future customer; shaving CAC has a hard floor. Model
                  the moves on the what-if sandbox below.
                </p>
              }
              methodology={
                <p style={{ margin: 0 }}>
                  <code>LTV ÷ CAC</code>, using margin-adjusted 365-day LTV and blended CAC from the
                  marketing-cost ledger. Tone: green ≥ 3×, amber 1–3×, red &lt; 1×; &ldquo;—&rdquo;
                  until marketing spend is logged.
                </p>
              }
            />,
          )}
          value={t.ltvCacRatio ?? 0}
          display={fmtRatio(t.ltvCacRatio)}
          icon={TrendingUp}
          tone={t.ltvCacRatio === null ? "neutral" : t.ltvCacRatio >= 3 ? "success" : t.ltvCacRatio >= 1 ? "warning" : "danger"}
          hint={t.ltvCacRatio === null ? "log marketing spend" : t.ltvCacRatio >= 3 ? "healthy (≥ 3×)" : "below 3× benchmark"}
        />
        <KpiCard
          label={kpiInfo(
            "Blended CAC",
            <MetricExplainer
              description="Customer acquisition cost across all channels — the marketing spend it takes to win one new customer."
              institutional={
                <p style={{ margin: 0 }}>
                  CAC is the denominator of the ratio and the lever with the hardest floor — there&apos;s
                  a market-clearing price for attention you can&apos;t undercut forever. &ldquo;Blended&rdquo;
                  mixes every channel; track it per channel and over time, because a rising CAC is the
                  earliest sign a channel is saturating.
                </p>
              }
              plain={
                <p style={{ margin: 0 }}>
                  Spend 6,300&nbsp;zł in a month and 180 new customers show up → each cost ~35&nbsp;zł
                  to acquire. That&apos;s the price tag on a new regular.
                </p>
              }
              tips={
                <p style={{ margin: 0 }}>
                  Lower it by leaning on what you already have: referrals (your cheapest channel — a
                  give-get beats paid every time), word-of-mouth, and retargeting people who already
                  know you. Cut the worst-CAC channel; don&apos;t dilute the whole budget.
                </p>
              }
              methodology={
                <p style={{ margin: 0 }}>
                  Marketing-category spend from the <Link href={withAdminBase(base, "/admin/business-costs")} className="v2-link">Business-costs ledger</Link>{" "}
                  ÷ new customers in the window. Shows &ldquo;—&rdquo; (never a fabricated 0) until spend is logged.
                </p>
              }
            />,
          )}
          value={t.blendedCacGrosze ?? 0}
          display={t.blendedCacGrosze === null ? "—" : formatPrice(t.blendedCacGrosze)}
          icon={Wallet}
          hint={`${t.newCustomers} new customers · ${formatPrice(t.marketingSpendGrosze)} spend`}
        />
        <KpiCard
          label={kpiInfo(
            "Blended LTV",
            <MetricExplainer
              description="The margin-adjusted lifetime value of an average customer over their first 365 days."
              institutional={
                <p style={{ margin: 0 }}>
                  Underwriters use margin LTV, not revenue LTV, because only gross profit services
                  CAC and overhead — revenue LTV flatters thin-margin businesses. Anchoring to
                  observed 365-day cohort behaviour (not an assumed lifespan) is what makes it
                  defensible in diligence.
                </p>
              }
              plain={
                <p style={{ margin: 0 }}>
                  A customer might spend ~150&nbsp;zł of revenue with you in a year, but at a 62%
                  margin only ~92&nbsp;zł is profit you keep. That 92&nbsp;zł is what you can spend to
                  win them and still come out ahead.
                </p>
              }
              tips={
                <p style={{ margin: 0 }}>
                  Three levers feed it: come-back rate, basket size, and the margin on what they buy.
                  Steer the mix toward high-margin dishes (see Menu engineering), defend price, and
                  lift repeat — each flows straight in.
                </p>
              }
              methodology={
                <p style={{ margin: 0 }}>
                  Cohort 365-day revenue per customer × the blended order-line gross margin
                  ({data.blendedMarginPct}% here, computed from real line-item price − cost).
                </p>
              }
            />,
          )}
          value={t.blendedLtvMarginGrosze}
          display={formatPrice(t.blendedLtvMarginGrosze)}
          icon={Coins}
          hint={`${formatPrice(t.blendedLtvGrosze)} revenue · ${data.blendedMarginPct}% margin`}
        />
        <KpiCard
          label={kpiInfo(
            "CAC payback",
            <MetricExplainer
              description="How many months it takes to earn a customer's acquisition cost back from their margin."
              institutional={
                <p style={{ margin: 0 }}>
                  Payback is the cash-flow twin of the ratio: LTV:CAC says a customer is profitable
                  eventually; payback says how long your cash is tied up getting there. Under ~12
                  months is the venture norm; under 3 means you can self-fund growth. It&apos;s the
                  constraint that actually caps how fast you can scale.
                </p>
              }
              plain={
                <p style={{ margin: 0 }}>
                  Spend 35&nbsp;zł on a customer who throws off ~8&nbsp;zł of margin a month and
                  you&apos;re square in about four months — after that they&apos;re pure profit.
                </p>
              }
              tips={
                <p style={{ margin: 0 }}>
                  Shorten it by pulling the second order forward (a fast post-first-order nudge),
                  lifting early-life basket size, or lowering CAC. A long payback with a great ratio
                  is a financing problem — but it still throttles growth.
                </p>
              }
              methodology={
                <p style={{ margin: 0 }}>
                  <code>12 × CAC ÷ LTV</code> (months). Tone: green ≤ 3, amber 3–12, red ≥ 13 (shown
                  as &ldquo;&gt;12 mo&rdquo;).
                </p>
              }
            />,
          )}
          value={0}
          display={fmtPayback(t.paybackMonths)}
          icon={Timer}
          tone={t.paybackMonths === null ? "neutral" : t.paybackMonths <= 3 ? "success" : t.paybackMonths >= 13 ? "danger" : "warning"}
          hint="months to recoup CAC from margin"
        />
      </section>

      <PageExplainer
        hint="LTV is what a customer is worth; CAC is what you paid to get them"
        description={
          <>
            Everything on this page is two numbers, sliced different ways: the
            profit an average customer leaves you over a year (<strong>LTV</strong>),
            and what you spent in marketing to win them (<strong>CAC</strong>). You
            want LTV to be at least <strong>3× CAC</strong>, and you want to earn the
            CAC back fast.
          </>
        }
        institutional={
          <p style={{ margin: 0 }}>
            LTV:CAC is the single ratio that decides whether a consumer business can
            buy growth profitably. The investor convention is <strong>≥ 3×</strong> on
            a gross-margin LTV (below ~1× you destroy cash on every customer; far above
            3× usually means you&apos;re <em>under</em>-investing in acquisition).
            Payback matters as much as the ratio — a 3× book with an 18-month payback
            still starves cash flow, so the gate is typically <strong>CAC recovered
            inside 3–6 months</strong>. Watch the per-cohort ratio, not just the
            blended one: a channel saturates at the margin first.
          </p>
        }
        plain={
          <p style={{ margin: 0 }}>
            Say you spend <strong>4,000&nbsp;zł</strong> on ads in a month and{" "}
            <strong>200 new customers</strong> show up — that&apos;s <strong>20&nbsp;zł</strong>{" "}
            to buy each one (your CAC). If, over their first year, the average new
            customer leaves you <strong>60&nbsp;zł of gross profit</strong> (their
            margin-adjusted LTV), then <strong>60 ÷ 20 = 3.0×</strong>. You turned
            1&nbsp;zł of marketing into 3&nbsp;zł of profit.{" "}
            <strong>Green ≥ 3× </strong>(scale it), amber 1–3× (thin), <strong>red
            &lt; 1×</strong> (you&apos;re paying more than they&apos;re worth — stop and fix).
            <br />
            <strong>Payback</strong> is the cash-flow twin: 20&nbsp;zł CAC earned back
            from ~25&nbsp;zł of first-month margin ≈ <strong>1-month payback</strong>.
            Short payback = you can reinvest fast without a war chest.
          </p>
        }
        tips={
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Ratio under 3×?</strong> Lift repeat orders before cutting ads — raising LTV compounds; shrinking CAC doesn&apos;t.</li>
            <li><strong>Payback over 3 months?</strong> Get the <em>second</em> order sooner (a &ldquo;come back this week&rdquo; nudge right after order #1).</li>
            <li><strong>CAC creeping up month over month?</strong> You&apos;re saturating a channel — the cohort table shows it before the blended number does.</li>
            <li><strong>Always log marketing spend</strong> in Business costs → Marketing, dated to the month it ran, so CAC lands on the right cohort.</li>
          </ul>
        }
        methodology={
          <p style={{ margin: 0 }}>
            LTV = each cohort&apos;s <strong>365-day revenue per customer</strong> ×
            your <strong>blended gross margin</strong> (computed from real order
            line-item price − cost — margin, not revenue, because revenue
            doesn&apos;t pay the kitchen). CAC = <strong>marketing-category spend</strong>{" "}
            from <Link href={withAdminBase(base, "/admin/business-costs")} className="v2-link">Business costs</Link> ÷ new customers
            that month. When no spend is logged, CAC shows <strong>&ldquo;—&rdquo;</strong>{" "}
            rather than a fabricated 0.
          </p>
        }
      />

      <Card>
        <CardBody>
          <div className="v2-detail-head">
            <h2>Blended cohort retention curve</h2>
            <span className="v2-detail-head-hint">
              % of customers still ordering N months after their first order
            </span>
          </div>
          {curve.length > 1 ? (
            <LineChart
              data={curve}
              xKey="offset"
              series={[{ key: "retention", label: "Retention", color: "var(--success)" }]}
              height={220}
              yFormat={(n) => `${n}%`}
              tooltipValue={(n) => `${n}%`}
            />
          ) : (
            <p className="v2-muted">Not enough cohort history to plot a curve yet.</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="v2-detail-head">
            <h2>Acquisition economics by cohort</h2>
            <span className="v2-detail-head-hint">
              CAC = that month&apos;s marketing spend ÷ new customers · LTV = 365-day margin CLTV
            </span>
          </div>
          <div className="v2-cohort-table-wrap">
            <table className="v2-cohort-table">
              <thead>
                <tr>
                  <th className="v2-cohort-th-cohort">Cohort</th>
                  <th className="v2-cohort-th-num">New</th>
                  <th className="v2-cohort-th-num">Spend</th>
                  <th className="v2-cohort-th-num">CAC</th>
                  <th className="v2-cohort-th-num">LTV (365d, margin)</th>
                  <th className="v2-cohort-th-num">LTV : CAC</th>
                  <th className="v2-cohort-th-num">Payback</th>
                </tr>
              </thead>
              <tbody>
                {data.months
                  .slice(-18)
                  .reverse()
                  .map((m) => (
                    <tr key={m.cohortMonth}>
                      <td className="v2-cohort-td-cohort tabular">{m.cohortMonth}</td>
                      <td className="v2-cohort-td-num tabular">{m.newCustomers}</td>
                      <td className="v2-cohort-td-num tabular">
                        {m.marketingSpendGrosze > 0 ? formatPrice(m.marketingSpendGrosze) : "—"}
                      </td>
                      <td className="v2-cohort-td-num tabular">
                        {m.cacGrosze === null ? "—" : formatPrice(m.cacGrosze)}
                      </td>
                      <td className="v2-cohort-td-num tabular">
                        {formatPrice(m.ltv365MarginGrosze)}
                      </td>
                      <td className="v2-cohort-td-num v2-cohort-td-headline tabular">
                        {fmtRatio(m.ltvCacRatio)}
                      </td>
                      <td className="v2-cohort-td-num tabular">{fmtPayback(m.paybackMonths)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
      <LtvCacSandbox />
    </div>
  );
}
