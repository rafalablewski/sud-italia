"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RotateCcw, TrendingUp, Users, Repeat, Coins } from "lucide-react";
import { Button, Card, CardBody, EmptyState, Input } from "./v2/ui";
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

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Size-weighted blended retention by month-offset — one curve from every
 *  cohort that has reached that offset. */
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

export function AdminCohortSimulator() {
  const [data, setData] = useState<CohortReport | null>(null);
  const [loading, setLoading] = useState(true);

  // Levers (operator-set). Defaults = no change, so the simulated column
  // starts identical to the real baseline and only diverges as you drag.
  const [repeatUpliftPp, setRepeatUpliftPp] = useState(0);
  const [aovGrowthPct, setAovGrowthPct] = useState(0);
  const [newCustPerMonth, setNewCustPerMonth] = useState(0);
  const [custTouched, setCustTouched] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const report = await fetch("/api/admin/reports/cohort").then((r) => (r.ok ? r.json() : null));
      setData(report);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Real baseline derived from the cohort report.
  const base = useMemo(() => {
    if (!data || data.totals.customers === 0) return null;
    const t = data.totals;
    const totalSize = data.cltv.reduce((s, c) => s + c.cohortSize, 0);
    const meanCltv365 =
      totalSize > 0
        ? data.cltv.reduce((s, c) => s + c.cltv365Grosze * c.cohortSize, 0) / totalSize
        : 0;
    const O0 = t.avgOrdersPerCustomer; // orders per customer
    const aov0 = O0 > 0 ? meanCltv365 / O0 : 0; // value per order (365d margin-free CLTV ÷ orders)
    const R0 = t.repeatRatePct; // % repeat customers
    // Extra orders contributed by each repeat customer, holding everything
    // else fixed — lets the repeat-rate lever move orders/customer honestly.
    const extraPerRepeater = R0 > 0 ? Math.max(0, (O0 - 1) / (R0 / 100)) : 0;
    const months = data.cohortsByMonth.length;
    const defaultNewCust = months > 0 ? Math.round(t.customers / months) : t.customers;
    return { meanCltv365, O0, aov0, R0, extraPerRepeater, defaultNewCust };
  }, [data]);

  // Seed the acquisition input from data once it lands (operator can override).
  useEffect(() => {
    if (base && !custTouched) setNewCustPerMonth(base.defaultNewCust);
  }, [base, custTouched]);

  const sim = useMemo(() => {
    if (!base) return null;
    const R = clamp(base.R0 + repeatUpliftPp, 0, 100);
    const O = Math.max(0, 1 + (R / 100) * base.extraPerRepeater);
    const aov = base.aov0 * (1 + aovGrowthPct / 100);
    const cltv = O * aov;
    const annual = newCustPerMonth * 12 * cltv;
    const baseAnnual = newCustPerMonth * 12 * base.meanCltv365;
    return { R, O, aov, cltv, annual, baseAnnual };
  }, [base, repeatUpliftPp, aovGrowthPct, newCustPerMonth]);

  const curves = useMemo(() => {
    if (!data || !base) return [];
    const baseline = blendedRetentionCurve(data.cohortsByMonth);
    const scale = base.R0 > 0 && sim ? sim.R / base.R0 : 1;
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
    if (base) setNewCustPerMonth(base.defaultNewCust);
  };

  if (loading) {
    return (
      <div className="v2-page">
        <div className="v2-page-loading">Loading cohort simulator…</div>
      </div>
    );
  }

  if (!base || !sim) {
    return (
      <div className="v2-page">
        <header className="v2-page-header">
          <div className="v2-page-title-row">
            <h1 className="v2-page-title">Cohort &amp; CLTV simulator</h1>
            <p className="v2-page-subtitle">No paid customers yet — nothing to project.</p>
          </div>
        </header>
        <Card>
          <CardBody>
            <EmptyState
              icon={Users}
              title="No data to seed"
              description="Once paid orders land, this seeds the real cohort retention curve, repeat rate and CLTV, then lets you project them forward under what-if levers."
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  const cltvDelta = sim.cltv - base.meanCltv365;
  const cltvDeltaPct = base.meanCltv365 > 0 ? (cltvDelta / base.meanCltv365) * 100 : 0;
  const annualDelta = sim.annual - sim.baseAnnual;

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">Cohort &amp; CLTV simulator</h1>
          <p className="v2-page-subtitle">
            Seeded from the real{" "}
            <Link href="/admin/reports/cohort" className="v2-link">cohort report</Link>{" "}
            ({data?.totals.customers.toLocaleString("pl-PL")} customers). Drag the levers to
            project lifetime value forward — nothing here writes to orders, CRM or reports.
          </p>
        </div>
        <div className="v2-page-actions">
          <Button variant="ghost" size="sm" leadingIcon={<RotateCcw className="h-3.5 w-3.5" />} onClick={resetLevers}>
            Reset levers
          </Button>
        </div>
      </header>

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

      <Card>
        <CardBody>
          <div className="v2-detail-head">
            <h2>What-if levers</h2>
            <span className="v2-detail-head-hint">Each starts at &ldquo;no change&rdquo; — the projection equals the real baseline until you move one</span>
          </div>
          <div className="v2-detail-grid" style={{ marginTop: 12 }}>
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
              Your real customers each order <strong>{base.O0.toFixed(2)}</strong> times and are
              worth <strong>{formatPrice(Math.round(base.meanCltv365))}</strong> over their first
              year. Win more <em>repeat</em> business or lift the average order, and that lifetime
              value grows. The annual cohort value then just multiplies it by how many new
              customers you bring in each month.
            </p>
          </PlainTalk>
          <Methodology>
            <p style={{ margin: 0 }}>
              Baseline orders/customer (<strong>{base.O0.toFixed(2)}</strong>), repeat rate
              (<strong>{base.R0.toFixed(1)}%</strong>) and 365-day CLTV
              (<strong>{formatPrice(Math.round(base.meanCltv365))}</strong>, cohort-size-weighted)
              come straight from the cohort engine. The repeat lever holds the
              &ldquo;extra orders per repeater&rdquo; constant and re-derives orders/customer; AOV
              growth scales the per-order value; CLTV = orders/customer × value/order. The
              retention curve is scaled by the repeat-rate ratio, capped at 100%.
            </p>
          </Methodology>
          <Tips>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li><strong>Repeat beats acquisition.</strong> A few points of repeat-rate uplift compounds across every future cohort — paid acquisition doesn&apos;t.</li>
              <li><strong>Pair this with LTV/CAC.</strong> A higher CLTV here is exactly what lifts the LTV:CAC ratio on the acquisition simulator.</li>
              <li><strong>Sanity-check the curve.</strong> If the simulated retention line bends unrealistically, your repeat-rate uplift is too aggressive for the cohort history.</li>
            </ul>
          </Tips>
        </CardBody>
      </Card>
    </div>
  );
}
