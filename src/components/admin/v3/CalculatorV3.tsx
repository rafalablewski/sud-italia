"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { computeReturns, computeScenario, computeTornado } from "@/lib/simulation-engine";
import type { BusinessCostPayrollRole, SimulationLaborLine, SimulationScenario } from "@/data/types";
import { Badge, Button, Card, CardBody, CardHead, Kpi } from "./ui";

const PAYROLL_ROLES: BusinessCostPayrollRole[] = ["pizzaiolo", "chef", "sous-chef", "kitchen-porter", "waiter", "barista", "driver", "manager", "cleaner", "other"];
const ROLE_LABEL: Record<BusinessCostPayrollRole, string> = {
  pizzaiolo: "Pizzaiolo", chef: "Chef", "sous-chef": "Sous-chef", "kitchen-porter": "Kitchen porter", waiter: "Waiter",
  barista: "Barista", driver: "Driver", manager: "Manager", cleaner: "Cleaner", other: "Other",
};
const FIXED_KEYS: { key: string; label: string }[] = [
  { key: "rent", label: "Rent" }, { key: "utilities", label: "Utilities" }, { key: "fuel", label: "Fuel" },
  { key: "vehicle", label: "Vehicle" }, { key: "insurance", label: "Insurance" }, { key: "licenses", label: "Licenses" },
  { key: "marketing", label: "Marketing" }, { key: "software", label: "Software" }, { key: "professional", label: "Professional" }, { key: "other", label: "Other" },
];

// generic field helpers — money in zł, percent in %
function Z({ label, grosze, onChange, w = 120 }: { label: string; grosze: number; onChange: (g: number) => void; w?: number }) {
  return <label className="av3-field" style={{ width: w }}><span className="av3-field-label">{label}</span><input className="av3-input" type="number" step="0.01" value={Math.round(grosze) / 100} onChange={(e) => onChange(Math.round((Number(e.target.value) || 0) * 100))} /></label>;
}
function P({ label, frac, onChange, w = 110 }: { label: string; frac: number; onChange: (f: number) => void; w?: number }) {
  return <label className="av3-field" style={{ width: w }}><span className="av3-field-label">{label}</span><input className="av3-input" type="number" step="0.1" value={+(frac * 100).toFixed(2)} onChange={(e) => onChange((Number(e.target.value) || 0) / 100)} /></label>;
}
function N({ label, value, onChange, w = 110, step = 1 }: { label: string; value: number; onChange: (n: number) => void; w?: number; step?: number }) {
  return <label className="av3-field" style={{ width: w }}><span className="av3-field-label">{label}</span><input className="av3-input" type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} /></label>;
}

export function CalculatorV3() {
  const [scn, setScn] = useState<SimulationScenario | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    const d = await fetch("/api/admin/simulation").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setScn(d); setLoading(false); setDirty(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const patch = (over: Partial<SimulationScenario>) => { setScn((s) => (s ? { ...s, ...over } : s)); setDirty(true); };
  const patchFixed = (key: string, g: number) => setScn((s) => { if (!s) return s; setDirty(true); return { ...s, fixedCosts: { ...s.fixedCosts, [key]: g } }; });
  const patchLabor = (i: number, over: Partial<SimulationLaborLine>) => setScn((s) => { if (!s) return s; setDirty(true); return { ...s, labor: s.labor.map((l, idx) => (idx === i ? { ...l, ...over } : l)) }; });
  const addLabor = () => setScn((s) => { if (!s) return s; setDirty(true); return { ...s, labor: [...s.labor, { id: `labor-${Date.now()}`, role: "waiter" as BusinessCostPayrollRole, headcount: 1, hoursPerWeek: 40, hourlyRateGrosze: 3000 }] }; });
  const rmLabor = (i: number) => setScn((s) => { if (!s) return s; setDirty(true); return { ...s, labor: s.labor.filter((_, idx) => idx !== i) }; });

  const c = useMemo(() => (scn ? computeScenario(scn) : null), [scn]);
  const tornado = useMemo(() => (scn ? computeTornado(scn) : []), [scn]);
  const maxSwing = Math.max(1, ...tornado.map((t) => t.totalSwing));
  const ret = useMemo(() => (scn && c ? computeReturns(c.netProfit, scn.setupCostGrosze ?? 0, 24) : null), [scn, c]);

  const save = async () => {
    if (!scn) return;
    setSaving(true);
    try { const r = await fetch("/api/admin/simulation", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(scn) }); if (r.ok) setDirty(false); } finally { setSaving(false); }
  };

  if (loading) return <div className="av3-loading"><span className="av3-spin" aria-hidden /> Loading the model…</div>;
  if (!scn || !c) return <div className="av3-card"><div className="av3-empty"><div className="av3-empty-title">No scenario</div><div className="av3-empty-text">The simulation scenario could not be loaded.</div></div></div>;

  const pnl: { label: string; v: number; sign?: 1 | -1; strong?: boolean }[] = [
    { label: "Monthly revenue", v: c.monthlyRevenue, strong: true },
    { label: "Food cost (COGS)", v: -c.monthlyCogs },
    { label: "Labour", v: -c.laborMonthly },
    { label: "Fixed costs", v: -c.fixedTotal },
    { label: "Payment fees", v: -c.paymentFees },
    { label: "Waste + refunds + loyalty", v: -(c.wasteCost + c.refundLoss + c.loyaltyCost) },
    { label: "Packaging", v: -c.packagingCost },
    { label: "Marketing (CAC)", v: -c.marketingCac },
    { label: "EBITDA", v: c.ebitda, strong: true },
    { label: "Depreciation + interest", v: -(c.depreciation + c.interest) },
    { label: "CIT (tax)", v: -c.citAmount },
    { label: "Net profit / month", v: c.netProfit, strong: true },
  ];

  return (
    <>
      <div className="av3-pagehead">
        <div>
          <h1>Calculator</h1>
          <div className="av3-pagehead-sub">P&amp;L simulator · live levers → real economics (shared engine)</div>
        </div>
        <div className="av3-pagehead-actions">
          <Button variant="ghost" size="sm" onClick={load}>Reset</Button>
          <Button variant="primary" size="sm" loading={saving} disabled={!dirty} onClick={save}>Save scenario</Button>
        </div>
      </div>

      {/* headline KPIs */}
      <div className="av3-kpi-rail">
        <Kpi label="Net profit / mo" value={formatPrice(c.netProfit)} accentVar={c.netProfit >= 0 ? "--av3-c4" : "--av3-c1"} />
        <Kpi label="Net margin" value={`${(c.margin * 100).toFixed(1)}%`} accentVar="--av3-c4" />
        <Kpi label="EBITDA / mo" value={formatPrice(c.ebitda)} accentVar="--av3-c2" />
        <Kpi label="Break-even / day" value={`${Math.ceil(c.breakEvenOrdersPerDay)}`} accentVar="--av3-c5" />
        <Kpi label="Prime cost" value={`${(c.primeCostPct * 100).toFixed(0)}%`} accentVar="--av3-c3" />
        <Kpi label="Payback" value={c.paybackMonths != null ? `${c.paybackMonths.toFixed(1)} mo` : "—"} accentVar="--av3-c1" />
      </div>

      <div className="av3-grid-2-1">
        {/* INPUTS */}
        <div className="av3-col">
          <Card>
            <CardHead title="Volume & price" />
            <CardBody><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <N label="Orders / day" value={scn.ordersPerDay} onChange={(n) => patch({ ordersPerDay: n })} />
              <Z label="Avg ticket (zł)" grosze={scn.avgTicketGrosze} onChange={(g) => patch({ avgTicketGrosze: g })} />
              <N label="Days open / mo" value={scn.daysOpenPerMonth} onChange={(n) => patch({ daysOpenPerMonth: n })} />
            </div></CardBody>
          </Card>

          <Card>
            <CardHead title="Variable costs" />
            <CardBody><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <P label="Food cost %" frac={scn.cogsPct} onChange={(f) => patch({ cogsPct: f })} />
              <P label="Payment %" frac={scn.paymentProcessorPct ?? 0} onChange={(f) => patch({ paymentProcessorPct: f })} />
              <P label="Waste %" frac={scn.wastePct ?? 0} onChange={(f) => patch({ wastePct: f })} />
              <P label="Refund %" frac={scn.refundPct ?? 0} onChange={(f) => patch({ refundPct: f })} />
              <P label="Loyalty %" frac={scn.loyaltyBurnPct ?? 0} onChange={(f) => patch({ loyaltyBurnPct: f })} />
              <Z label="Packaging/order" grosze={scn.packagingPerOrderGrosze ?? 0} onChange={(g) => patch({ packagingPerOrderGrosze: g })} />
              <P label="CIT (tax) %" frac={scn.citPct ?? 0} onChange={(f) => patch({ citPct: f })} />
            </div></CardBody>
          </Card>

          <Card>
            <CardHead title="Labour" actions={<Button variant="secondary" size="sm" onClick={addLabor}><Plus className="av3-btn-ico" /> Add role</Button>} />
            <CardBody style={{ paddingTop: 6 }}>
              {scn.labor.map((l, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "end", padding: "5px 0", flexWrap: "wrap" }}>
                  <label className="av3-field" style={{ width: 150 }}><span className="av3-field-label">Role</span><select className="av3-select" value={l.role} onChange={(e) => patchLabor(i, { role: e.target.value as BusinessCostPayrollRole })}>{PAYROLL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
                  <N label="Heads" value={l.headcount} onChange={(n) => patchLabor(i, { headcount: n })} w={70} />
                  <N label="Hrs/wk" value={l.hoursPerWeek} onChange={(n) => patchLabor(i, { hoursPerWeek: n })} w={80} />
                  <Z label="Rate/hr" grosze={l.hourlyRateGrosze} onChange={(g) => patchLabor(i, { hourlyRateGrosze: g })} w={100} />
                  <button type="button" className="av3-iconbtn-sm" aria-label="Remove" onClick={() => rmLabor(i)}><X /></button>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Fixed costs (monthly)" />
            <CardBody><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {FIXED_KEYS.map((f) => <Z key={f.key} label={f.label} grosze={(scn.fixedCosts as Record<string, number>)[f.key] ?? 0} onChange={(g) => patchFixed(f.key, g)} w={110} />)}
            </div></CardBody>
          </Card>

          <Card>
            <CardHead title="Investment & capacity" />
            <CardBody><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Z label="Setup cost" grosze={scn.setupCostGrosze ?? 0} onChange={(g) => patch({ setupCostGrosze: g })} w={130} />
              <Z label="Deprec./mo" grosze={scn.depreciationMonthlyGrosze ?? 0} onChange={(g) => patch({ depreciationMonthlyGrosze: g })} w={120} />
              <Z label="Interest/mo" grosze={scn.interestMonthlyGrosze ?? 0} onChange={(g) => patch({ interestMonthlyGrosze: g })} w={120} />
              {scn.kitchenCapacity && <>
                <N label="Pizzas/hr" value={scn.kitchenCapacity.pizzasPerHour} onChange={(n) => patch({ kitchenCapacity: { ...scn.kitchenCapacity!, pizzasPerHour: n } })} w={100} />
                <P label="Peak-hr share" frac={scn.kitchenCapacity.peakHourSharePct} onChange={(f) => patch({ kitchenCapacity: { ...scn.kitchenCapacity!, peakHourSharePct: f } })} w={110} />
              </>}
            </div></CardBody>
          </Card>
        </div>

        {/* OUTPUTS */}
        <div className="av3-col">
          <Card>
            <CardHead title="Monthly P&L" />
            <CardBody style={{ paddingTop: 6, paddingBottom: 6 }}>
              {pnl.map((r) => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--av3-line)", fontWeight: r.strong ? 700 : 400 }}>
                  <span style={{ fontSize: 12.5 }}>{r.label}</span>
                  <span className="mono" style={{ fontFamily: "var(--av3-mono)", fontSize: 12.5, color: r.v < 0 ? "var(--av3-bad)" : r.strong ? "var(--av3-fg)" : "var(--av3-fg)" }}>{r.v < 0 ? "−" : ""}{formatPrice(Math.abs(r.v))}</span>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Unit economics" />
            <CardBody>
              <div className="av3-od-grid">
                <div className="av3-od-field"><div className="k">True CM1 / order</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{formatPrice(c.trueCm1PerOrderGrosze)}</div></div>
                <div className="av3-od-field"><div className="k">True CM %</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{(c.trueContributionMarginPct * 100).toFixed(0)}%</div></div>
                <div className="av3-od-field"><div className="k">Food cost %</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{(c.foodCostPct * 100).toFixed(0)}%</div></div>
                <div className="av3-od-field"><div className="k">Labour %</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{(c.laborPct * 100).toFixed(0)}%</div></div>
                <div className="av3-od-field"><div className="k">Capacity used</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{(c.capacityUtilization * 100).toFixed(0)}%</div></div>
                <div className="av3-od-field"><div className="k">Cash-on-cash</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{c.cashOnCashAnnual != null ? `${(c.cashOnCashAnnual * 100).toFixed(0)}%` : "—"}</div></div>
              </div>
            </CardBody>
          </Card>

          {ret && (scn.setupCostGrosze ?? 0) > 0 && (
            <Card>
              <CardHead title="Investor returns" description="24-month horizon on a steady net-profit stream" />
              <CardBody>
                <div className="av3-od-grid" style={{ marginBottom: 12 }}>
                  <div className="av3-od-field"><div className="k">NPV @ 10%</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)", color: ret.npv.r10 >= 0 ? "var(--av3-ok)" : "var(--av3-bad)" }}>{formatPrice(ret.npv.r10)}</div></div>
                  <div className="av3-od-field"><div className="k">NPV @ 15%</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)", color: ret.npv.r15 >= 0 ? "var(--av3-ok)" : "var(--av3-bad)" }}>{formatPrice(ret.npv.r15)}</div></div>
                  <div className="av3-od-field"><div className="k">NPV @ 20%</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)", color: ret.npv.r20 >= 0 ? "var(--av3-ok)" : "var(--av3-bad)" }}>{formatPrice(ret.npv.r20)}</div></div>
                  <div className="av3-od-field"><div className="k">IRR (annual)</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{ret.irrAnnualPct != null ? `${ret.irrAnnualPct.toFixed(0)}%` : "—"}</div></div>
                  <div className="av3-od-field"><div className="k">Payback</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{ret.paybackMonth != null ? `${ret.paybackMonth} mo` : "—"}</div></div>
                  <div className="av3-od-field"><div className="k">24-mo cash</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)", color: ret.cumulative[23] >= 0 ? "var(--av3-ok)" : "var(--av3-bad)" }}>{formatPrice(ret.cumulative[23])}</div></div>
                </div>
                {/* cumulative cash recovery — bars cross from red (below 0) to green */}
                <div style={{ display: "flex", alignItems: "stretch", gap: 2, height: 48 }}>
                  {ret.cumulative.map((cv, i) => {
                    const peak = Math.max(1, ...ret.cumulative.map((x) => Math.abs(x)));
                    const h = (Math.abs(cv) / peak) * 100;
                    return <div key={i} title={`Mo ${i + 1}: ${formatPrice(cv)}`} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}><div style={{ height: `${h / 2}%`, alignSelf: cv >= 0 ? "flex-start" : "flex-end", width: "100%", background: cv >= 0 ? "var(--av3-ok)" : "var(--av3-bad)", borderRadius: 2 }} /></div>;
                  })}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--av3-subtle)", marginTop: 4, fontFamily: "var(--av3-mono)" }}>cumulative cash · mo 1 → 24</div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHead title="Sensitivity" description="Net-profit swing if each lever moves (most fragile first)" />
            <CardBody style={{ paddingTop: 6, paddingBottom: 6 }}>
              {tornado.map((t) => (
                <div key={t.key} style={{ padding: "6px 0", borderBottom: "1px solid var(--av3-line)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}><span>{t.label}</span><span className="mono" style={{ fontFamily: "var(--av3-mono)", color: "var(--av3-muted)" }}>±{formatPrice(Math.round(t.totalSwing / 2))}</span></div>
                  <div style={{ display: "flex", height: 6, gap: 2 }}>
                    <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}><div style={{ width: `${(Math.abs(t.downGrosze) / maxSwing) * 100}%`, background: "var(--av3-bad)", borderRadius: "3px 0 0 3px" }} /></div>
                    <div style={{ flex: 1 }}><div style={{ width: `${(Math.abs(t.upGrosze) / maxSwing) * 100}%`, background: "var(--av3-ok)", borderRadius: "0 3px 3px 0" }} /></div>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: "var(--av3-subtle)" }}>
        Engine: <code>src/lib/simulation-engine.ts</code> (shared, pure). 12-month projection, NPV/IRR and the cohort / LTV-CAC / menu-engineering sandboxes land in the next Calculator parts.
      </div>
    </>
  );
}
