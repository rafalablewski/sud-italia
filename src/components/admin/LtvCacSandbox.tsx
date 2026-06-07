"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { RotateCcw, TrendingUp, Wallet, Coins, Timer, AlertTriangle, FlaskConical } from "lucide-react";
import { Button, Card, CardBody, Input, Badge, InfoButton } from "@/ui";
import { MetricExplainer, PageExplainer } from "./Explainers";
import { KpiCard } from "./v2/charts";
import { formatPrice } from "@/lib/utils";

interface LtvCacReport {
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
  months: { cohortMonth: string }[];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const fmtRatio = (r: number | null) => (r === null ? "—" : `${r.toFixed(1)}×`);
const ratioTone = (r: number | null) =>
  r === null ? "neutral" : r >= 3 ? "success" : r >= 1 ? "warning" : "danger";

const FALLBACK_CAC_GROSZE = 2000;

/** Worked Sud Italia example — 62% blended margin, ~35 zł CAC, ~92 zł
 *  margin-LTV ⇒ 2.6× (below the 3× gate, so there's something to fix). */
const EXAMPLE_LTVCAC: LtvCacReport = {
  blendedMarginPct: 62,
  totals: {
    newCustomers: 1800,
    marketingSpendGrosze: 6_300_000,
    blendedCacGrosze: 3500,
    blendedLtvGrosze: 14839,
    blendedLtvMarginGrosze: 9200,
    ltvCacRatio: 2.6,
    paybackMonths: 5,
    hasMarketingData: true,
  },
  months: Array.from({ length: 6 }, (_, i) => ({ cohortMonth: `2025-${String(i + 6).padStart(2, "0")}` })),
};

/** KPI label with a per-card InfoButton (ⓘ) explaining that one metric. */
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

/**
 * LTV/CAC what-if sandbox — embedded at the bottom of the LTV/CAC report.
 * Self-gates on `ltvCacSimulationEnabled`, seeds from the live report and
 * falls back to a worked example when there's no acquisition data yet.
 */
export function LtvCacSandbox() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [report, setReport] = useState<LtvCacReport | null>(null);

  const [cacGrosze, setCacGrosze] = useState(0);
  const [cacTouched, setCacTouched] = useState(false);
  const [freqUpliftPct, setFreqUpliftPct] = useState(0);
  const [aovGrowthPct, setAovGrowthPct] = useState(0);
  const [marginDeltaPp, setMarginDeltaPp] = useState(0);
  const [newCustPerMonth, setNewCustPerMonth] = useState(0);
  const [custTouched, setCustTouched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => !cancelled && setEnabled(!!j?.ltvCacSimulationEnabled))
      .catch(() => !cancelled && setEnabled(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const loadReport = useCallback(async () => {
    const r = await fetch("/api/admin/reports/ltv-cac").then((res) => (res.ok ? res.json() : null));
    setReport(r);
  }, []);

  useEffect(() => {
    if (enabled) void loadReport();
  }, [enabled, loadReport]);

  const usingExample = !report || report.totals.newCustomers === 0;
  const data = usingExample ? EXAMPLE_LTVCAC : report;

  const base = useMemo(() => {
    const t = data.totals;
    const margin0 = data.blendedMarginPct;
    const ltv0 = t.blendedLtvMarginGrosze;
    const revenueLtv0 = margin0 > 0 ? (ltv0 / margin0) * 100 : ltv0;
    const cac0 = t.blendedCacGrosze;
    const months = Math.max(1, data.months.length);
    const defaultNewCust = Math.round(t.newCustomers / months);
    const ratio0 = cac0 && cac0 > 0 ? ltv0 / cac0 : null;
    return { margin0, ltv0, revenueLtv0, cac0, defaultNewCust, ratio0, hasMarketingData: t.hasMarketingData };
  }, [data]);

  useEffect(() => {
    if (!cacTouched) setCacGrosze(base.cac0 && base.cac0 > 0 ? base.cac0 : FALLBACK_CAC_GROSZE);
  }, [base, cacTouched]);
  useEffect(() => {
    if (!custTouched) setNewCustPerMonth(base.defaultNewCust);
  }, [base, custTouched]);

  const sim = useMemo(() => {
    const revenueLtv = base.revenueLtv0 * (1 + freqUpliftPct / 100) * (1 + aovGrowthPct / 100);
    const margin = clamp(base.margin0 + marginDeltaPp, 0, 100);
    const ltv = (revenueLtv * margin) / 100;
    const ratio = cacGrosze > 0 ? ltv / cacGrosze : null;
    const payback = ltv > 0 ? (12 * cacGrosze) / ltv : null;
    const profitPerCust = ltv - cacGrosze;
    const monthlyProfit = newCustPerMonth * profitPerCust;
    return { revenueLtv, margin, ltv, ratio, payback, profitPerCust, monthlyProfit };
  }, [base, freqUpliftPct, aovGrowthPct, marginDeltaPp, cacGrosze, newCustPerMonth]);

  const resetLevers = () => {
    setFreqUpliftPct(0);
    setAovGrowthPct(0);
    setMarginDeltaPp(0);
    setCacTouched(false);
    setCustTouched(false);
    setCacGrosze(base.cac0 && base.cac0 > 0 ? base.cac0 : FALLBACK_CAC_GROSZE);
    setNewCustPerMonth(base.defaultNewCust);
  };

  if (!enabled) return null;

  const paybackDisplay = sim.payback === null ? "—" : sim.payback >= 13 ? ">12 mo" : `${sim.payback.toFixed(1)} mo`;

  return (
    <div className="v2-stack-16" style={{ marginTop: 8 }}>
      <Card>
        <CardBody>
          <div className="v2-detail-head">
            <h2 style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <FlaskConical className="h-4 w-4" aria-hidden /> What-if sandbox
              {usingExample && <Badge tone="warning">Example data</Badge>}
            </h2>
            <Button variant="ghost" size="sm" leadingIcon={<RotateCcw className="h-3.5 w-3.5" />} onClick={resetLevers}>
              Reset levers
            </Button>
          </div>
          <p style={{ margin: "2px 0 0", fontSize: 13.5, lineHeight: 1.55, color: "var(--fg-muted)" }}>
            {usingExample
              ? "No acquisition data yet — these levers run on a worked example (62% margin, ~35 zł CAC, 2.6× ratio). Real orders + logged marketing spend seed it from your own numbers automatically."
              : "Seeded from your real LTV/CAC. Flex acquisition cost, retention, order value and margin to watch the ratio and payback move against the 3× gate."}
          </p>

          {!base.hasMarketingData && !usingExample && (
            <div className="v2-callout v2-callout-warning" style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 12 }}>
              <AlertTriangle className="h-4 w-4" style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <strong>No marketing spend logged.</strong> CAC is seeded at an assumed{" "}
                {formatPrice(FALLBACK_CAC_GROSZE)} — override it below, or log real spend under{" "}
                <Link href="/admin/business-costs" className="v2-link">Business costs → Marketing</Link>.
              </div>
            </div>
          )}

          <div className="v2-detail-grid" style={{ marginTop: 14 }}>
            <Input
              type="number"
              label="CAC (zł)"
              value={Math.round(cacGrosze / 100)}
              step={1}
              min={0}
              onChange={(e) => {
                setCacTouched(true);
                setCacGrosze(Math.max(0, (Number(e.target.value) || 0) * 100));
              }}
              description="What you pay to acquire one customer."
            />
            <Input
              type="number"
              label="Retention / frequency uplift (%)"
              value={freqUpliftPct}
              step={1}
              onChange={(e) => setFreqUpliftPct(Number(e.target.value) || 0)}
              description="More repeat orders ⇒ higher lifetime revenue."
            />
            <Input
              type="number"
              label="AOV growth (%)"
              value={aovGrowthPct}
              step={1}
              onChange={(e) => setAovGrowthPct(Number(e.target.value) || 0)}
              description="Bigger average order ⇒ higher lifetime revenue."
            />
            <Input
              type="number"
              label="Gross margin Δ (pp)"
              value={marginDeltaPp}
              step={1}
              min={-base.margin0}
              max={100 - base.margin0}
              onChange={(e) => setMarginDeltaPp(Number(e.target.value) || 0)}
              description={`Adds to the ${base.margin0.toFixed(1)}% blended margin — margin is what pays the kitchen.`}
            />
            <Input
              type="number"
              label="New customers / month"
              value={newCustPerMonth}
              step={1}
              min={0}
              onChange={(e) => {
                setCustTouched(true);
                setNewCustPerMonth(Math.max(0, Number(e.target.value) || 0));
              }}
              description="Scales total monthly profit (below), not the per-customer ratio."
            />
          </div>
        </CardBody>
      </Card>

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
                  under-investing in growth and leaving share on the table. Reported blended and by
                  cohort, because a healthy blend can mask a deteriorating recent cohort.
                </p>
              }
              plain={
                <p style={{ margin: 0 }}>
                  Spend 35&nbsp;zł to win a customer who leaves you ~92&nbsp;zł of margin and you&apos;re
                  at 2.6× — under the 3× bar, so each customer is a touch too expensive. Either make
                  them worth more or acquire them cheaper.
                </p>
              }
              tips={
                <p style={{ margin: 0 }}>
                  Lift the numerator before cutting the denominator: raising LTV (retention, AOV,
                  margin) compounds across every future customer, while shaving CAC has a hard floor.
                  If you must touch CAC, kill the worst-performing channel rather than trimming every
                  channel evenly.
                </p>
              }
              methodology={
                <p style={{ margin: 0 }}>
                  <code>LTV ÷ CAC</code>, using margin-adjusted 365-day LTV and blended CAC from the
                  marketing-cost ledger. Tone: green ≥ 3×, amber 1–3×, red &lt; 1×.
                </p>
              }
            />,
          )}
          value={sim.ratio ?? 0}
          display={fmtRatio(sim.ratio)}
          icon={TrendingUp}
          tone={ratioTone(sim.ratio)}
          hint={base.ratio0 === null ? "baseline —" : `baseline ${fmtRatio(base.ratio0)} · gate 3×`}
        />
        <KpiCard
          label={kpiInfo(
            "LTV (365d, margin)",
            <MetricExplainer
              description="The margin-adjusted lifetime value of a customer over their first 365 days."
              institutional={
                <p style={{ margin: 0 }}>
                  Underwriters use margin LTV, not revenue LTV, because only gross profit services
                  CAC, overhead and refunds — revenue LTV flatters thin-margin businesses. A
                  defensible LTV is built from observed cohort behaviour, not an assumed lifespan,
                  which is why this anchors to real 365-day cohort CLTV rather than a &ldquo;lifetime&rdquo; guess.
                </p>
              }
              plain={
                <p style={{ margin: 0 }}>
                  A customer might spend ~150&nbsp;zł of revenue with you in a year, but at a 62% gross
                  margin only ~92&nbsp;zł of that is profit you actually keep. That 92&nbsp;zł is what
                  you can spend to win them and still come out ahead.
                </p>
              }
              tips={
                <p style={{ margin: 0 }}>
                  Three levers feed it: come-back rate, basket size, and the margin on what they buy.
                  Steer the mix toward high-margin dishes (the stars/puzzles on the menu-engineering
                  sandbox), defend price, and lift repeat — each flows straight into this number.
                </p>
              }
              methodology={
                <p style={{ margin: 0 }}>
                  Blended margin-LTV from the cohort CLTV engine × blended order-line gross margin.
                  Under the levers, revenue-LTV is recovered as <code>LTV ÷ margin</code>, scaled by
                  retention and AOV, then re-margined.
                </p>
              }
            />,
          )}
          value={sim.ltv}
          display={formatPrice(Math.round(sim.ltv))}
          icon={Coins}
          tone={sim.ltv > base.ltv0 ? "success" : sim.ltv < base.ltv0 ? "danger" : "neutral"}
          hint={`baseline ${formatPrice(Math.round(base.ltv0))} · ${sim.margin.toFixed(1)}% margin`}
        />
        <KpiCard
          label={kpiInfo(
            "CAC",
            <MetricExplainer
              description="Customer acquisition cost — the marketing spend it takes to win one new customer."
              institutional={
                <p style={{ margin: 0 }}>
                  CAC is the denominator of the ratio and the lever with the hardest floor — there&apos;s
                  a market-clearing price for attention you can&apos;t undercut indefinitely. Reviewers
                  separate blended from paid CAC and watch it per channel over time, because a rising
                  CAC is the earliest sign a channel is saturating.
                </p>
              }
              plain={
                <p style={{ margin: 0 }}>
                  Spend 6,300&nbsp;zł in a month and 180 new customers show up → each cost ~35&nbsp;zł
                  to acquire. That&apos;s your CAC — the price tag on a new regular.
                </p>
              }
              tips={
                <p style={{ margin: 0 }}>
                  Lower it by improving what you already have before buying more: referrals (your
                  cheapest channel — a give-get beats paid every time), word-of-mouth from a genuinely
                  better product, and retargeting people who already know you. Cut the channel with
                  the worst CAC; don&apos;t dilute the whole budget.
                </p>
              }
              methodology={
                <p style={{ margin: 0 }}>
                  Marketing-category spend from the Business-costs ledger ÷ new customers that month.
                  Seeded from the real report (or an assumed value when no spend is logged) and
                  editable here.
                </p>
              }
            />,
          )}
          value={cacGrosze}
          display={formatPrice(Math.round(cacGrosze))}
          icon={Wallet}
          hint={base.cac0 && base.cac0 > 0 ? `baseline ${formatPrice(base.cac0)}` : "assumed (no spend logged)"}
        />
        <KpiCard
          label={kpiInfo(
            "CAC payback",
            <MetricExplainer
              description="How many months it takes to earn back a customer's acquisition cost from their margin."
              institutional={
                <p style={{ margin: 0 }}>
                  Payback is the cash-flow twin of the ratio: LTV:CAC says a customer is profitable
                  eventually; payback says how long your money is tied up getting there. Under ~12
                  months is the venture norm; under 3 means you can self-fund growth without a war
                  chest. It&apos;s the constraint that actually caps how fast you can scale.
                </p>
              }
              plain={
                <p style={{ margin: 0 }}>
                  Spend 35&nbsp;zł to win a customer who throws off ~8&nbsp;zł of margin a month and
                  you&apos;ve got your money back in about four months — after that they&apos;re pure
                  profit. Short payback = you reinvest fast.
                </p>
              }
              tips={
                <p style={{ margin: 0 }}>
                  Shorten it by pulling the second order forward (a fast post-first-order nudge),
                  raising early-life basket size, or lowering CAC. A long payback with a great ratio
                  is a financing problem, not a profitability one — but it still throttles growth.
                </p>
              }
              methodology={
                <p style={{ margin: 0 }}>
                  <code>12 × CAC ÷ LTV</code> (months). Tone: green ≤ 3, amber 3–12, red ≥ 13
                  (shown as &ldquo;&gt;12 mo&rdquo;).
                </p>
              }
            />,
          )}
          value={0}
          display={paybackDisplay}
          icon={Timer}
          tone={sim.payback === null ? "neutral" : sim.payback <= 3 ? "success" : sim.payback >= 13 ? "danger" : "warning"}
          hint="months to recoup CAC from margin"
        />
        <KpiCard
          label={kpiInfo(
            "Profit / customer",
            <MetricExplainer
              description="The lifetime profit a customer leaves after subtracting what you paid to acquire them."
              institutional={
                <p style={{ margin: 0 }}>
                  The absolute-złoty complement to the ratio — the same economics as cash per head
                  rather than a multiple. A 3× ratio on a 10&nbsp;zł customer and a 3× on a 200&nbsp;zł
                  customer are equally &ldquo;healthy&rdquo; but vastly different businesses; this keeps you
                  honest about the scale of the prize, not just its quality.
                </p>
              }
              plain={
                <p style={{ margin: 0 }}>
                  Worth ~92&nbsp;zł, cost ~35&nbsp;zł to get → you net ~57&nbsp;zł per customer over
                  the year. If this ever goes negative, you&apos;re paying more for customers than
                  they&apos;re worth — stop and fix it.
                </p>
              }
              tips={
                <p style={{ margin: 0 }}>
                  Every lever that lifts LTV or lowers CAC lifts this. The fastest absolute gains
                  usually come from the high-value end — protect and deepen your best customers (VIP
                  treatment, loyalty tiers) rather than chasing cheap, low-value traffic.
                </p>
              }
              methodology={
                <p style={{ margin: 0 }}>
                  <code>LTV − CAC</code>, in złoty. Negative means the ratio is below 1×.
                </p>
              }
            />,
          )}
          value={sim.profitPerCust}
          display={formatPrice(Math.round(sim.profitPerCust))}
          icon={Coins}
          tone={sim.profitPerCust > 0 ? "success" : "danger"}
          hint="LTV − CAC"
        />
        <KpiCard
          label={kpiInfo(
            "Monthly cohort profit",
            <MetricExplainer
              description="The total profit thrown off by a single month's worth of new customers, over their first year."
              institutional={
                <p style={{ margin: 0 }}>
                  Scales per-customer economics to the funnel — the number a CFO multiplies out to
                  size the return on a marketing budget. It deliberately blends quality
                  (profit/customer) and quantity (acquisition volume), so it&apos;s right for
                  &ldquo;what does this month of spend return?&rdquo; but wrong for judging unit economics
                  in isolation.
                </p>
              }
              plain={
                <p style={{ margin: 0 }}>
                  If each customer nets you ~57&nbsp;zł and you win 180 a month, that month&apos;s
                  intake is worth ~10,000&nbsp;zł of profit over the year. Double the intake (without
                  wrecking CAC) and you double that.
                </p>
              }
              tips={
                <p style={{ margin: 0 }}>
                  Grow it by winning more customers/month OR by raising profit/customer. When
                  LTV:CAC is comfortably ≥ 3×, scale volume; when it&apos;s tight, lifting
                  profit/customer is the safer multiplier — volume on thin economics just scales the
                  problem.
                </p>
              }
              methodology={
                <p style={{ margin: 0 }}>
                  <code>new customers/month × profit per customer (LTV − CAC)</code>.
                </p>
              }
            />,
          )}
          value={sim.monthlyProfit}
          display={formatPrice(Math.round(sim.monthlyProfit))}
          icon={TrendingUp}
          tone={sim.monthlyProfit > 0 ? "success" : "danger"}
          hint={`${newCustPerMonth.toLocaleString("pl-PL")} new × profit/customer`}
        />
      </section>

      <PageExplainer
        title="How this projects"
        hint="Real seed, transparent math"
        description={
          <>
            A what-if on the unit economics: move retention, order value, margin and
            spend to watch the <strong>LTV:CAC ratio</strong> and payback period
            respond — so you can pressure-test a growth plan before you fund it.
          </>
        }
        institutional={
          <p style={{ margin: 0 }}>
            The same gate the report enforces, made interactive: an underwriteable
            consumer book clears <strong>LTV:CAC ≥ 3×</strong> with CAC recovered
            inside <strong>3–6 months</strong>. Use this to find the <em>cheapest</em>{" "}
            path to that gate — because LTV is in the numerator, a point of retention
            or margin almost always moves the ratio more than an equivalent cut to CAC,
            and it compounds across every future cohort instead of being a one-off
            saving. Keep the levers tied to changes you can actually execute.
          </p>
        }
        plain={
          <p style={{ margin: 0 }}>
            You want each customer worth at least <strong>3×</strong> what you pay to win them.
            Lifting retention or order value raises <strong>LTV</strong>; spending smarter lowers{" "}
            <strong>CAC</strong>. The colour tells you where you stand: green ≥ 3×, amber 1–3×, red below 1×.
          </p>
        }
        tips={
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Ratio under 3×?</strong> Lifting LTV (retention, AOV, margin) compounds; cutting CAC alone rarely closes the gap.</li>
            <li><strong>Use the cohort sandbox first</strong> — the CLTV it projects is the LTV input here.</li>
          </ul>
        }
        methodology={
          <p style={{ margin: 0 }}>
            Revenue-LTV is recovered as LTV ÷ margin, scaled by the retention and AOV levers, then
            re-margined. Ratio = LTV ÷ CAC; payback = 12 × CAC ÷ LTV.
          </p>
        }
      />
    </div>
  );
}
