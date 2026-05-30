"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCcw, TrendingUp, Users, Repeat, Coins, FlaskConical } from "lucide-react";
import { Button, Card, CardBody, Input, Badge } from "./v2/ui";
import { PlainTalk, Methodology, Tips } from "./Explainers";
import { KpiCard, LineChart } from "./v2/charts";
import { formatPrice } from "@/lib/utils";

interface CohortRow {
  cohortMonth: string;
  cohortSize: number;
  retention: { monthOffset: number; retained: number; revenueGrosze: number }[];
}
interface CltvSummary {
  cohortMonth: string;
  cohortSize: number;
  cltv365Grosze: number;
}
interface CohortReport {
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

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Realistic Sud Italia example seed — a Neapolitan pizza truck doing
 *  ~300 new customers/month, 34% repeat, ~185 zł CLTV. Used when there are
 *  no paid orders yet so the sandbox is never empty. */
const EXAMPLE_RETENTION = [1.0, 0.42, 0.31, 0.26, 0.22, 0.2, 0.18, 0.17, 0.16, 0.15, 0.14, 0.13];
const EXAMPLE_MONTHS = ["2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11"];
const EXAMPLE_COHORT: CohortReport = {
  cohortsByMonth: EXAMPLE_MONTHS.map((cohortMonth) => ({
    cohortMonth,
    cohortSize: 300,
    retention: EXAMPLE_RETENTION.map((pct, monthOffset) => ({
      monthOffset,
      retained: Math.round(300 * pct),
      revenueGrosze: Math.round(300 * pct * 7100),
    })),
  })),
  cltv: EXAMPLE_MONTHS.map((cohortMonth) => ({ cohortMonth, cohortSize: 300, cltv365Grosze: 18500 })),
  totals: {
    customers: 1800,
    repeatCustomers: 612,
    repeatRatePct: 34,
    avgOrdersPerCustomer: 2.6,
    medianGrossePerCustomer: 14200,
  },
};

function blendedRetentionCurve(cohorts: CohortRow[]): { offset: string; retained: number }[] {
  const maxLen = Math.max(0, ...cohorts.map((c) => c.retention.length));
  const out: { offset: string; retained: number }[] = [];
  for (let i = 0; i < Math.min(13, maxLen); i++) {
    let retained = 0;
    let size = 0;
    for (const c of cohorts) {
      const r = c.retention[i];
      if (!r) continue;
      retained += r.retained;
      size += c.cohortSize;
    }
    if (size === 0) continue;
    out.push({ offset: `M${i}`, retained: Math.round((retained / size) * 1000) / 10 });
  }
  return out;
}

/**
 * Cohort & CLTV what-if sandbox — embedded at the bottom of the Cohort
 * report. Self-gates on the `cohortSimulationEnabled` setting (renders
 * nothing when off) and seeds from the live cohort report, falling back to
 * a worked Sud Italia example when there are no paid orders yet. Read-only
 * on live data.
 */
export function CohortSandbox() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [report, setReport] = useState<CohortReport | null>(null);

  const [repeatUpliftPp, setRepeatUpliftPp] = useState(0);
  const [aovGrowthPct, setAovGrowthPct] = useState(0);
  const [newCustPerMonth, setNewCustPerMonth] = useState(0);
  const [custTouched, setCustTouched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        setEnabled(!!j?.cohortSimulationEnabled);
      })
      .catch(() => !cancelled && setEnabled(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const loadReport = useCallback(async () => {
    const r = await fetch("/api/admin/reports/cohort").then((res) => (res.ok ? res.json() : null));
    setReport(r);
  }, []);

  useEffect(() => {
    if (enabled) void loadReport();
  }, [enabled, loadReport]);

  // Live data when we have paid customers, otherwise the worked example.
  const usingExample = !report || report.totals.customers === 0;
  const data = usingExample ? EXAMPLE_COHORT : report;

  const base = useMemo(() => {
    const t = data.totals;
    const totalSize = data.cltv.reduce((s, c) => s + c.cohortSize, 0);
    const meanCltv365 =
      totalSize > 0 ? data.cltv.reduce((s, c) => s + c.cltv365Grosze * c.cohortSize, 0) / totalSize : 0;
    const O0 = t.avgOrdersPerCustomer;
    const aov0 = O0 > 0 ? meanCltv365 / O0 : 0;
    const R0 = t.repeatRatePct;
    const extraPerRepeater = R0 > 0 ? Math.max(0, (O0 - 1) / (R0 / 100)) : 0;
    const months = data.cohortsByMonth.length;
    const defaultNewCust = months > 0 ? Math.round(t.customers / months) : t.customers;
    return { meanCltv365, O0, aov0, R0, extraPerRepeater, defaultNewCust, customers: t.customers };
  }, [data]);

  useEffect(() => {
    if (!custTouched) setNewCustPerMonth(base.defaultNewCust);
  }, [base, custTouched]);

  const sim = useMemo(() => {
    const R = clamp(base.R0 + repeatUpliftPp, 0, 100);
    const O = Math.max(0, 1 + (R / 100) * base.extraPerRepeater);
    const aov = base.aov0 * (1 + aovGrowthPct / 100);
    const cltv = O * aov;
    const annual = newCustPerMonth * 12 * cltv;
    const baseAnnual = newCustPerMonth * 12 * base.meanCltv365;
    return { R, O, aov, cltv, annual, baseAnnual };
  }, [base, repeatUpliftPp, aovGrowthPct, newCustPerMonth]);

  const curves = useMemo(() => {
    const baseline = blendedRetentionCurve(data.cohortsByMonth);
    const scale = base.R0 > 0 ? sim.R / base.R0 : 1;
    return baseline.map((p) => ({
      offset: p.offset,
      baseline: p.retained,
      simulated: Math.round(Math.min(100, p.retained * scale) * 10) / 10,
    }));
  }, [data, base, sim]);

  const resetLevers = () => {
    setRepeatUpliftPp(0);
    setAovGrowthPct(0);
    setCustTouched(false);
    setNewCustPerMonth(base.defaultNewCust);
  };

  if (!enabled) return null;

  const cltvDelta = sim.cltv - base.meanCltv365;
  const cltvDeltaPct = base.meanCltv365 > 0 ? (cltvDelta / base.meanCltv365) * 100 : 0;
  const annualDelta = sim.annual - sim.baseAnnual;

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
              ? "No paid orders yet — these levers run on a worked Sud Italia example (300 new customers/mo, 34% repeat, ~185 zł CLTV). Once real orders land it seeds from your own cohort numbers automatically."
              : `Seeded from your real cohort (${base.customers.toLocaleString("pl-PL")} customers). Drag the levers to project lifetime value forward — nothing here writes to orders, CRM or reports.`}
          </p>

          <div className="v2-detail-grid" style={{ marginTop: 14 }}>
            <Input
              type="number"
              label="Repeat-rate uplift (pp)"
              value={repeatUpliftPp}
              step={1}
              min={-base.R0}
              max={100 - base.R0}
              onChange={(e) => setRepeatUpliftPp(Number(e.target.value) || 0)}
              description={`Adds to the ${base.R0.toFixed(1)}% baseline. More repeat customers ⇒ more orders/customer.`}
            />
            <Input
              type="number"
              label="AOV growth (%)"
              value={aovGrowthPct}
              step={1}
              onChange={(e) => setAovGrowthPct(Number(e.target.value) || 0)}
              description={`Lifts the ${formatPrice(Math.round(base.aov0))} average value per order.`}
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
              description="Acquisition assumption — scales the annual cohort value, not per-customer CLTV."
            />
          </div>
        </CardBody>
      </Card>

      <section className="v2-kpi-grid">
        <KpiCard
          label="Projected CLTV (365d)"
          value={sim.cltv}
          display={formatPrice(Math.round(sim.cltv))}
          icon={Coins}
          tone={cltvDelta > 0 ? "success" : cltvDelta < 0 ? "danger" : "neutral"}
          hint={`baseline ${formatPrice(Math.round(base.meanCltv365))} · ${cltvDelta >= 0 ? "+" : ""}${cltvDeltaPct.toFixed(1)}%`}
        />
        <KpiCard
          label="Repeat rate"
          value={sim.R}
          display={`${sim.R.toFixed(1)}%`}
          icon={Repeat}
          tone={sim.R > base.R0 ? "success" : sim.R < base.R0 ? "danger" : "neutral"}
          hint={`baseline ${base.R0.toFixed(1)}%`}
        />
        <KpiCard
          label="Orders / customer"
          value={sim.O}
          display={sim.O.toFixed(2)}
          icon={TrendingUp}
          tone={sim.O > base.O0 ? "success" : sim.O < base.O0 ? "danger" : "neutral"}
          hint={`baseline ${base.O0.toFixed(2)}`}
        />
        <KpiCard
          label="Annual cohort value"
          value={sim.annual}
          display={formatPrice(Math.round(sim.annual))}
          icon={Users}
          tone={annualDelta > 0 ? "success" : annualDelta < 0 ? "danger" : "neutral"}
          hint={`${newCustPerMonth.toLocaleString("pl-PL")} new/mo · ${annualDelta >= 0 ? "+" : ""}${formatPrice(Math.round(annualDelta))} vs baseline`}
        />
      </section>

      {curves.length > 1 && (
        <Card>
          <CardBody>
            <div className="v2-detail-head">
              <h2>Retention curve — baseline vs simulated</h2>
              <span className="v2-detail-head-hint">% still ordering N months after their first order</span>
            </div>
            <LineChart
              data={curves}
              xKey="offset"
              series={[
                { key: "baseline", label: "Baseline", color: "#7a7a85" },
                { key: "simulated", label: "Simulated", color: "#28a06d" },
              ]}
              height={240}
              yFormat={(n) => `${n}%`}
              tooltipValue={(n) => `${n}%`}
            />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <div className="v2-detail-head">
            <h2>How this projects</h2>
            <span className="v2-detail-head-hint">Real seed, transparent math</span>
          </div>
          <PlainTalk>
            <p style={{ margin: 0 }}>
              Your customers each order <strong>{base.O0.toFixed(2)}</strong> times and are worth{" "}
              <strong>{formatPrice(Math.round(base.meanCltv365))}</strong> over their first year. Win
              more <em>repeat</em> business or lift the average order, and that lifetime value grows.
              Annual cohort value just multiplies it by how many new customers you bring in monthly.
            </p>
          </PlainTalk>
          <Methodology>
            <p style={{ margin: 0 }}>
              CLTV = orders/customer × value/order. The repeat lever holds &ldquo;extra orders per
              repeater&rdquo; constant (<strong>{base.extraPerRepeater.toFixed(1)}</strong> here) and
              re-derives orders/customer; AOV growth scales value/order. The retention curve is scaled
              by the repeat-rate ratio, capped at 100%.
            </p>
          </Methodology>
          <Tips>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li><strong>Repeat beats acquisition.</strong> A few points of repeat-rate uplift compounds across every future cohort.</li>
              <li><strong>Feeds the LTV/CAC ratio.</strong> A higher CLTV here is exactly what lifts the ratio on the LTV/CAC sandbox.</li>
            </ul>
          </Tips>
        </CardBody>
      </Card>
    </div>
  );
}
