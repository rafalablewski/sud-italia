"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RotateCcw, TrendingUp, Wallet, Coins, Timer, AlertTriangle, FlaskConical } from "lucide-react";
import { Button, Card, CardBody, Input, Badge } from "./v2/ui";
import { PlainTalk, Methodology, Tips } from "./Explainers";
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
          label="LTV : CAC"
          value={sim.ratio ?? 0}
          display={fmtRatio(sim.ratio)}
          icon={TrendingUp}
          tone={ratioTone(sim.ratio)}
          hint={base.ratio0 === null ? "baseline —" : `baseline ${fmtRatio(base.ratio0)} · gate 3×`}
        />
        <KpiCard
          label="LTV (365d, margin)"
          value={sim.ltv}
          display={formatPrice(Math.round(sim.ltv))}
          icon={Coins}
          tone={sim.ltv > base.ltv0 ? "success" : sim.ltv < base.ltv0 ? "danger" : "neutral"}
          hint={`baseline ${formatPrice(Math.round(base.ltv0))} · ${sim.margin.toFixed(1)}% margin`}
        />
        <KpiCard
          label="CAC"
          value={cacGrosze}
          display={formatPrice(Math.round(cacGrosze))}
          icon={Wallet}
          hint={base.cac0 && base.cac0 > 0 ? `baseline ${formatPrice(base.cac0)}` : "assumed (no spend logged)"}
        />
        <KpiCard
          label="CAC payback"
          value={0}
          display={paybackDisplay}
          icon={Timer}
          tone={sim.payback === null ? "neutral" : sim.payback <= 3 ? "success" : sim.payback >= 13 ? "danger" : "warning"}
          hint="months to recoup CAC from margin"
        />
        <KpiCard
          label="Profit / customer"
          value={sim.profitPerCust}
          display={formatPrice(Math.round(sim.profitPerCust))}
          icon={Coins}
          tone={sim.profitPerCust > 0 ? "success" : "danger"}
          hint="LTV − CAC"
        />
        <KpiCard
          label="Monthly cohort profit"
          value={sim.monthlyProfit}
          display={formatPrice(Math.round(sim.monthlyProfit))}
          icon={TrendingUp}
          tone={sim.monthlyProfit > 0 ? "success" : "danger"}
          hint={`${newCustPerMonth.toLocaleString("pl-PL")} new × profit/customer`}
        />
      </section>

      <Card>
        <CardBody>
          <div className="v2-detail-head">
            <h2>How this projects</h2>
            <span className="v2-detail-head-hint">Real seed, transparent math</span>
          </div>
          <PlainTalk>
            <p style={{ margin: 0 }}>
              You want each customer worth at least <strong>3×</strong> what you pay to win them.
              Lifting retention or order value raises <strong>LTV</strong>; spending smarter lowers{" "}
              <strong>CAC</strong>. The colour tells you where you stand: green ≥ 3×, amber 1–3×, red below 1×.
            </p>
          </PlainTalk>
          <Methodology>
            <p style={{ margin: 0 }}>
              Revenue-LTV is recovered as LTV ÷ margin, scaled by the retention and AOV levers, then
              re-margined. Ratio = LTV ÷ CAC; payback = 12 × CAC ÷ LTV.
            </p>
          </Methodology>
          <Tips>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li><strong>Ratio under 3×?</strong> Lifting LTV (retention, AOV, margin) compounds; cutting CAC alone rarely closes the gap.</li>
              <li><strong>Use the cohort sandbox first</strong> — the CLTV it projects is the LTV input here.</li>
            </ul>
          </Tips>
        </CardBody>
      </Card>
    </div>
  );
}
