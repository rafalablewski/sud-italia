"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { applyAnnualWeather, applyAssumptions, computeChannelEconomics, computeFleetEconomics, computeReturns, computeScenario, computeTornado, DEFAULT_SEASONALITY, MONTH_LABELS, projectTwelveMonths } from "@/lib/simulation-engine";
import type { BusinessCostPayrollRole, SimulationAssumptions, SimulationAttachLever, SimulationFleetModel, SimulationLaborLine, SimulationScenario, SimulationSeasonality, SimulationWeather } from "@/data/types";
import { Badge, Button, Card, CardBody, CardHead, InfoButton, Kpi } from "./ui";

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

type AttachKey = "coffeeAttach" | "dessertAttach" | "antipastiAttach" | "aperitivoAttach" | "premiumToppingsAttach" | "pastaPrimoAttach";
const ATTACH_DEFAULTS: Record<AttachKey, SimulationAttachLever> = {
  coffeeAttach: { enabled: true, attachPct: 0.25, avgPriceGrosze: 900, cogsPct: 0.12 },
  dessertAttach: { enabled: true, attachPct: 0.12, avgPriceGrosze: 1600, cogsPct: 0.28 },
  antipastiAttach: { enabled: true, attachPct: 0.08, avgPriceGrosze: 2400, cogsPct: 0.32 },
  aperitivoAttach: { enabled: true, attachPct: 0.10, avgPriceGrosze: 2200, cogsPct: 0.22 },
  premiumToppingsAttach: { enabled: true, attachPct: 0.15, avgPriceGrosze: 700, cogsPct: 0.30 },
  pastaPrimoAttach: { enabled: true, attachPct: 0.18, avgPriceGrosze: 3200, cogsPct: 0.26 },
};
const ATTACH_LABELS: Record<AttachKey, string> = { coffeeAttach: "Coffee", dessertAttach: "Dessert", antipastiAttach: "Antipasti", aperitivoAttach: "Aperitivo", premiumToppingsAttach: "Premium toppings", pastaPrimoAttach: "Pasta primo" };
type IngKey = "mozzarella" | "tomato" | "flour" | "doughWeight" | "oliveOil" | "curedMeats" | "buffaloMozz" | "eggs" | "ovenFuel" | "packaging";
const INGREDIENT_SHARES: Record<IngKey, number> = { mozzarella: 0.28, tomato: 0.10, flour: 0.06, doughWeight: 0.06, oliveOil: 0.05, curedMeats: 0.07, buffaloMozz: 0.03, eggs: 0.02, ovenFuel: 0.04, packaging: 0.03 };
const INGREDIENT_LABELS: Record<IngKey, string> = { mozzarella: "Mozzarella", tomato: "Tomato", flour: "Flour", doughWeight: "Dough weight", oliveOil: "Olive oil", curedMeats: "Cured meats", buffaloMozz: "Buffalo mozz", eggs: "Eggs", ovenFuel: "Oven fuel", packaging: "Packaging" };
const SEASONS: { key: keyof SimulationSeasonality; label: string }[] = [{ key: "winter", label: "Winter" }, { key: "spring", label: "Spring" }, { key: "summer", label: "Summer" }, { key: "autumn", label: "Autumn" }];
const DEFAULT_WEATHER: SimulationWeather = { enabled: true, rainyDayMultiplier: 0.75, rainyShare: 0.30, heatwaveMultiplier: 1.40, heatwaveShare: 0.10, holidayClosedDaysPerMonth: 1, holidayPeakDaysPerMonth: 1, holidayPeakMultiplier: 1.60, schoolHolidayLunchMultiplier: 0.85, eventDaysPerMonth: 1, eventDayMultiplier: 1.50 };
const DEFAULT_FLEET: SimulationFleetModel = { unitCount: 1, hqOverheadMonthlyGrosze: 0, supplyDiscountAtUnits: 5, supplyDiscountPct: 0.10, commissaryEnabledAtUnits: 4, commissarySavingsPct: 0.04, royaltyPct: 0.06, marketingFundPct: 0.02, dmaOverlapPct: 0.15, buildoutLearningPct: 0.05, buildoutFloorPct: 0.55 };

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
function AttachRow({ label, lever, onToggle, onChange }: { label: string; lever?: SimulationAttachLever; onToggle: (on: boolean) => void; onChange: (patch: Partial<SimulationAttachLever>) => void }) {
  const on = !!lever && lever.enabled !== false;
  return (
    <div className="av3-leverrow">
      <button type="button" className="av3-toggle" data-on={on} onClick={() => onToggle(!on)}>{on ? "On" : "Off"}</button>
      <span className="av3-lever-name">{label}</span>
      {on && lever && <>
        <P label="Attach %" frac={lever.attachPct} onChange={(f) => onChange({ attachPct: f })} w={84} />
        <Z label="Price" grosze={lever.avgPriceGrosze} onChange={(g) => onChange({ avgPriceGrosze: g })} w={80} />
        <P label="COGS %" frac={lever.cogsPct} onChange={(f) => onChange({ cogsPct: f })} w={80} />
      </>}
    </div>
  );
}

// Modeling assumption (declared, like DEFAULT_SEASONALITY in the engine): a
// Neapolitan-truck service day is a lunch + (bigger) dinner double-peak. Returns
// per-hour weights summing to 1 across `n` service hours.
function demandWeights(n: number): number[] {
  if (n <= 1) return [1];
  const w: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    const lunch = Math.exp(-Math.pow((x - 0.28) / 0.12, 2));
    const dinner = Math.exp(-Math.pow((x - 0.8) / 0.14, 2));
    w.push(0.22 + lunch + 1.3 * dinner);
  }
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((v) => v / sum);
}

// Menu strategy presets — set the attach-lever mix only (idempotent); the engine
// folds them into ticket/COGS via applyAssumptions, so net effect is real.
type PresetKey = "balanced" | "premium" | "value";
const MENU_PRESETS: Record<PresetKey, Partial<Record<AttachKey, SimulationAttachLever>>> = {
  balanced: ATTACH_DEFAULTS,
  premium: {
    coffeeAttach: { enabled: true, attachPct: 0.35, avgPriceGrosze: 1100, cogsPct: 0.12 },
    dessertAttach: { enabled: true, attachPct: 0.22, avgPriceGrosze: 2200, cogsPct: 0.30 },
    antipastiAttach: { enabled: true, attachPct: 0.18, avgPriceGrosze: 3200, cogsPct: 0.34 },
    aperitivoAttach: { enabled: true, attachPct: 0.20, avgPriceGrosze: 2800, cogsPct: 0.22 },
    premiumToppingsAttach: { enabled: true, attachPct: 0.30, avgPriceGrosze: 1100, cogsPct: 0.32 },
    pastaPrimoAttach: { enabled: true, attachPct: 0.24, avgPriceGrosze: 3800, cogsPct: 0.27 },
  },
  value: {
    coffeeAttach: { enabled: true, attachPct: 0.30, avgPriceGrosze: 700, cogsPct: 0.14 },
    dessertAttach: { enabled: true, attachPct: 0.08, avgPriceGrosze: 1200, cogsPct: 0.26 },
    antipastiAttach: { enabled: false, attachPct: 0.04, avgPriceGrosze: 1800, cogsPct: 0.32 },
    aperitivoAttach: { enabled: false, attachPct: 0.05, avgPriceGrosze: 1600, cogsPct: 0.22 },
    premiumToppingsAttach: { enabled: true, attachPct: 0.08, avgPriceGrosze: 500, cogsPct: 0.28 },
    pastaPrimoAttach: { enabled: true, attachPct: 0.12, avgPriceGrosze: 2400, cogsPct: 0.25 },
  },
};
const PRESET_LABEL: Record<PresetKey, string> = { balanced: "Balanced", premium: "Premium", value: "Value" };

// compact zł for dense heatmap cells (grosze → "7.2k" / "320")
function kZl(g: number): string {
  const z = g / 100;
  return Math.abs(z) >= 1000 ? `${(z / 1000).toFixed(1)}k` : `${Math.round(z)}`;
}
interface HeatData { cells: number[][]; colHeaders: string[]; rowHeaders: string[]; centerRow: number; centerCol: number }
function Heatmap({ data }: { data: HeatData }) {
  const maxAbs = Math.max(1, ...data.cells.flat().map((v) => Math.abs(v)));
  const ncol = data.colHeaders.length;
  return (
    <div className="av3-heat-wrap">
      <div className="av3-heat" style={{ gridTemplateColumns: `66px repeat(${ncol}, 1fr)` }}>
        <div className="av3-heat-corner" />
        {data.colHeaders.map((h, i) => <div key={i} className="av3-heat-h">{h}</div>)}
        {data.cells.map((row, ri) => (
          <Fragment key={ri}>
            <div className="av3-heat-rh">{data.rowHeaders[ri]}</div>
            {row.map((v, ci) => {
              const pct = Math.round((Math.abs(v) / maxAbs) * 56) + 8;
              const bg = `color-mix(in oklab, var(${v >= 0 ? "--av3-ok" : "--av3-bad"}) ${pct}%, var(--av3-s1))`;
              const center = ri === data.centerRow && ci === data.centerCol;
              return <div key={ci} className={`av3-heat-cell ${center ? "is-center" : ""}`} style={{ background: bg }} title={formatPrice(v)}>{kZl(v)}</div>;
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
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
  const patchAssume = (over: Partial<SimulationAssumptions>) => setScn((s) => { if (!s) return s; setDirty(true); return { ...s, assumptions: { ...(s.assumptions ?? {}), ...over } }; });
  const patchWeather = (over: Partial<SimulationWeather>) => setScn((s) => { if (!s) return s; setDirty(true); return { ...s, weather: { ...DEFAULT_WEATHER, ...(s.weather ?? {}), ...over } }; });
  const patchSeason = (over: Partial<SimulationSeasonality>) => setScn((s) => { if (!s) return s; setDirty(true); return { ...s, seasonality: { ...DEFAULT_SEASONALITY, ...(s.seasonality ?? {}), ...over } }; });
  const patchFleet = (over: Partial<SimulationFleetModel>) => setScn((s) => { if (!s) return s; setDirty(true); return { ...s, fleet: { ...DEFAULT_FLEET, ...(s.fleet ?? {}), ...over } }; });

  // Fold the behaviour levers + annual weather into the headline scenario so
  // the P&L / tornado / returns reflect them (rule #8 — end-to-end). The
  // projection applies weather per-month itself, so it takes the
  // assumptions-folded (but not annual-weather) scenario.
  const folded = useMemo(() => (scn ? applyAnnualWeather(applyAssumptions(scn)) : null), [scn]);
  const c = useMemo(() => (folded ? computeScenario(folded) : null), [folded]);
  const tornado = useMemo(() => (folded ? computeTornado(folded) : []), [folded]);
  const maxSwing = Math.max(1, ...tornado.map((t) => t.totalSwing));
  const ret = useMemo(() => (scn && c ? computeReturns(c.netProfit, scn.setupCostGrosze ?? 0, 24) : null), [scn, c]);
  const projection = useMemo(() => (scn ? projectTwelveMonths(applyAssumptions(scn)) : []), [scn]);
  // Channel economics + fleet read the RAW scenario (pre-assumptions) so the
  // on-site card rate isn't the blended one (matches v2).
  const channels = useMemo(() => (scn ? computeChannelEconomics(scn) : []), [scn]);
  const fleet = useMemo(() => (scn ? computeFleetEconomics(scn, scn.setupCostGrosze ?? 0) : null), [scn]);

  // ── what-if heatmaps: recompute net profit over a grid (real engine) ──────
  const MULTS = useMemo(() => [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3], []);
  const ordersTicketHeat = useMemo(() => {
    if (!folded) return null;
    // rows = avg ticket (high→low so profit rises up the grid), cols = orders/day
    const rowMults = [...MULTS].reverse();
    const cells = rowMults.map((rm) => MULTS.map((cm) =>
      computeScenario({ ...folded, ordersPerDay: folded.ordersPerDay * cm, avgTicketGrosze: Math.round(folded.avgTicketGrosze * rm) }).netProfit));
    return {
      cells,
      colHeaders: MULTS.map((m) => (folded.ordersPerDay * m).toFixed(0)),
      rowHeaders: rowMults.map((m) => formatPrice(Math.round(folded.avgTicketGrosze * m))),
      centerCol: MULTS.indexOf(1), centerRow: rowMults.indexOf(1),
    };
  }, [folded, MULTS]);
  const foodTicketHeat = useMemo(() => {
    if (!folded) return null;
    // rows = COGS % (low→high so profit falls going down), cols = avg ticket
    const cogsRows = [-0.06, -0.04, -0.02, 0, 0.02, 0.04, 0.06];
    const cells = cogsRows.map((d) => MULTS.map((cm) =>
      computeScenario({ ...folded, cogsPct: Math.max(0, folded.cogsPct + d), avgTicketGrosze: Math.round(folded.avgTicketGrosze * cm) }).netProfit));
    return {
      cells,
      colHeaders: MULTS.map((m) => formatPrice(Math.round(folded.avgTicketGrosze * m))),
      rowHeaders: cogsRows.map((d) => `${((folded.cogsPct + d) * 100).toFixed(0)}%`),
      centerCol: MULTS.indexOf(1), centerRow: cogsRows.indexOf(0),
    };
  }, [folded, MULTS]);

  // ── scenario archetypes: conservative / base / optimistic (real engine) ───
  const archetypes = useMemo(() => {
    if (!folded) return [];
    const defs: { name: string; o: number; t: number; cogs: number; base?: boolean }[] = [
      { name: "Conservative", o: 0.8, t: 0.95, cogs: 0.03 },
      { name: "Base", o: 1, t: 1, cogs: 0, base: true },
      { name: "Optimistic", o: 1.2, t: 1.08, cogs: -0.02 },
    ];
    return defs.map((d) => {
      const r = computeScenario({ ...folded, ordersPerDay: folded.ordersPerDay * d.o, avgTicketGrosze: Math.round(folded.avgTicketGrosze * d.t), cogsPct: Math.max(0, folded.cogsPct + d.cogs) });
      return { name: d.name, base: !!d.base, net: r.netProfit, margin: r.margin, ebitda: r.ebitda, payback: r.paybackMonths, breakEven: r.breakEvenOrdersPerDay };
    });
  }, [folded]);

  // ── seed inputs from the last 30 days of real orders ──────────────────────
  const [seeding, setSeeding] = useState(false);
  const seedFromActuals = async () => {
    setSeeding(true);
    try {
      const to = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
      const a = await fetch(`/api/admin/analytics?from=${from}&to=${to}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (a && scn) {
        const days = scn.daysOpenPerMonth || 26;
        const ordersPerDay = a.totalOrders > 0 ? +(a.totalOrders / 30 * (30 / days) ).toFixed(1) : scn.ordersPerDay;
        const avgTicketGrosze = a.avgOrderValue > 0 ? Math.round(a.avgOrderValue) : scn.avgTicketGrosze;
        const cogsPct = typeof a.profitMargin === "number" ? Math.min(0.6, Math.max(0.1, 1 - a.profitMargin / 100)) : scn.cogsPct;
        patch({ ordersPerDay: Math.max(1, Math.round(ordersPerDay)), avgTicketGrosze, cogsPct });
      }
    } finally { setSeeding(false); }
  };

  const applyMenuPreset = (k: PresetKey) => patchAssume(MENU_PRESETS[k] as Partial<SimulationAssumptions>);

  // ── oven curve & peak saturation (modelled from kitchenCapacity) ──────────
  const oven = useMemo(() => {
    if (!folded) return null;
    const cap = folded.kitchenCapacity;
    const hours = Math.max(1, Math.round(cap?.openHoursPerDay ?? 10));
    const perHourCap = cap?.pizzasPerHour ?? 0;
    const weights = demandWeights(hours);
    const hourly = weights.map((w) => folded.ordersPerDay * w);
    const peak = Math.max(...hourly);
    const startHour = 11;
    const excessPerDay = hourly.reduce((s, h) => s + Math.max(0, h - perHourCap), 0);
    const balkShare = 0.5; // half of orders that can't be served at peak walk
    const lostPerMonth = Math.round(excessPerDay * balkShare * folded.daysOpenPerMonth);
    const peakExcess = Math.max(0, peak - perHourCap);
    const waitMin = perHourCap > 0 ? Math.round((peakExcess / perHourCap) * 60) : 0;
    return {
      hours, perHourCap, startHour,
      bars: hourly.map((h, i) => ({ hour: startHour + i, orders: h, over: Math.max(0, h - perHourCap) })),
      peak, peakUtil: perHourCap > 0 ? peak / perHourCap : 0, waitMin, lostPerMonth,
    };
  }, [folded]);

  // ── shift plan by daypart (modelled from the same demand curve) ───────────
  const shiftPlan = useMemo(() => {
    if (!oven || !folded) return null;
    const dayparts = [
      { key: "Lunch", lo: 0, hi: 0.45 },
      { key: "Afternoon", lo: 0.45, hi: 0.62 },
      { key: "Dinner", lo: 0.62, hi: 1.01 },
    ];
    const n = oven.bars.length;
    const scheduledPizzaioli = folded.labor.filter((l) => l.role === "pizzaiolo").reduce((s, l) => s + l.headcount, 0);
    const rows = dayparts.map((d) => {
      const slice = oven.bars.filter((_, i) => { const x = i / (n - 1 || 1); return x >= d.lo && x < d.hi; });
      const orders = slice.reduce((s, b) => s + b.orders, 0);
      const hrs = slice.length || 1;
      const ordersPerHour = orders / hrs;
      const heads = Math.max(1, Math.ceil(ordersPerHour / (oven.perHourCap || 1)));
      const range = slice.length ? `${slice[0].hour}:00–${slice[slice.length - 1].hour + 1}:00` : "—";
      return { key: d.key, range, orders: Math.round(orders), ordersPerHour, heads };
    });
    return { rows, scheduledPizzaioli };
  }, [oven, folded]);

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
          <Button variant="ghost" size="sm" loading={seeding} onClick={seedFromActuals} title="Seed orders/day, ticket & COGS from the last 30 days of real orders">Seed from last 30 days</Button>
          <Button variant="ghost" size="sm" onClick={load}>Reset</Button>
          <Button variant="primary" size="sm" loading={saving} disabled={!dirty} onClick={save}>Save scenario</Button>
        </div>
      </div>

      {/* headline KPIs — each carries a five-section ⓘ explainer (Rule #12) */}
      <div className="av3-kpi-rail">
        <Kpi label="Net profit / mo" value={formatPrice(c.netProfit)} accentVar={c.netProfit >= 0 ? "--av3-c4" : "--av3-c1"} info={
          <InfoButton title="Net profit / month"
            description="The bottom line — what's left each month after every cost, including tax, is paid."
            institutional="The single number investors underwrite. For a single Neapolitan truck a healthy steady-state net margin is 10–18% of revenue; below ~6% the unit is fragile to one bad month, above ~20% you're likely under-investing in labour or marketing. The institutional gate: net profit must clear the owner's opportunity cost of capital AND service any debt with headroom."
            plain="Say the truck does 48 000 zł of revenue this month. After food, labour, rent, fees, waste, D&A and CIT you keep 7 200 zł — that's a 15% net margin. That 7 200 zł is what actually funds your payback, a second truck, or your own salary."
            tips="Pull the three biggest levers in order of leverage: lift avg ticket (attach a 9 zł espresso to 30% more orders), shave food cost 2–3pp via recipe/portion discipline, and right-size labour to volume (the labour-flex lever). Small ticket + COGS moves compound straight to the bottom line because fixed costs don't move."
            methodology="netProfit = revenue − COGS − labour − fixed − payment fees − waste − refunds − loyalty − packaging − marketing(CAC) − depreciation − interest − CIT. Computed by computeScenario() in src/lib/simulation-engine.ts from the live levers; CIT applies only to positive pre-tax profit." />
        } />
        <Kpi label="Net margin" value={`${(c.margin * 100).toFixed(1)}%`} accentVar="--av3-c4" info={
          <InfoButton title="Net margin"
            description="Net profit as a percentage of revenue — profit quality independent of scale."
            institutional="Margin is how you compare a 30-order day to a 300-order chain on equal footing. QSR/street-food benchmark for an owner-operated unit is 10–18% net; franchised systems run thinner (6–12%) after royalty + fund. A margin that's high but on tiny revenue isn't a business yet; a thin margin on high revenue can still be a great cash engine."
            plain="Two trucks each net 7 200 zł. Truck A did it on 48 000 zł (15%), Truck B on 90 000 zł (8%). Truck B is bigger but more fragile per złoty — a 5% cost shock erases more of its thinner margin."
            tips="Margin moves on mix, not just cost-cutting: shift volume toward high-CM items (the menu-engineering 'stars'), trim the 'dogs', and protect price (avoid blanket discounts — use targeted combos instead). Watch prime cost (below) — it's the fastest margin destroyer."
            methodology="margin = netProfit ÷ monthlyRevenue. Returns 0 when revenue is 0. Same computeScenario() pipeline as net profit." />
        } />
        <Kpi label="EBITDA / mo" value={formatPrice(c.ebitda)} accentVar="--av3-c2" info={
          <InfoButton title="EBITDA / month"
            description="Operating cash generation before financing and accounting choices — earnings before interest, tax, depreciation & amortisation."
            institutional="EBITDA is the multiple buyers pay on (a single truck might trade at 3–5× annual EBITDA; a proven multi-unit chain higher). It strips out how the truck was financed and how fast it's depreciated, so it compares operating quality across units. The gate for expansion: EBITDA must comfortably cover D&A + interest + a reinvestment buffer."
            plain="If the truck throws off 9 500 zł of EBITDA a month but 2 300 zł goes to loan interest and equipment depreciation, the operation is healthy even though the after-tax 'net' looks thinner — the business is generating real cash, it's just paying down its build-out."
            tips="EBITDA rises with the same operating levers as net profit (ticket, COGS, labour, fixed) but is blind to interest/D&A — so it's the cleanest scoreboard for operating decisions. To lift it, attack the controllable operating block, not the capital structure."
            methodology="ebitda = revenue − variable costs (COGS + fees + waste + refunds + loyalty + packaging + CAC) − labour − fixed. Excludes depreciation and interest by definition. computeScenario(), src/lib/simulation-engine.ts." />
        } />
        <Kpi label="Break-even / day" value={`${Math.ceil(c.breakEvenOrdersPerDay)}`} accentVar="--av3-c5" info={
          <InfoButton title="Break-even orders / day"
            description="The number of orders per operating day at which the truck makes exactly zero profit — every order above this is pure contribution."
            institutional="The most important survival number. Institutional view: your actual volume should sit at least 25–30% above break-even (a 'margin of safety') so a rainy week or a sick pizzaiolo doesn't tip you into a loss. If break-even is close to capacity, the model has no room to absorb shocks and shouldn't be financed."
            plain="If fixed + labour costs are 36 000 zł/month and each order contributes 18 zł after variable costs, you need ~2 000 orders/month ≈ 77/day just to keep the lights on. Order 78 onward is the first złoty of profit."
            tips="Lower break-even two ways: raise contribution per order (higher ticket or lower COGS — each złoty of CM1 drops the threshold), or cut fixed/labour drag (renegotiate rent, flex labour to demand). Converting a fixed cost to a variable one mechanically lowers the break-even line."
            methodology="breakEvenOrdersPerMonth = (labour + fixed) ÷ contributionPerOrder, where contributionPerOrder = avgTicket × (1 − COGS% − fees% − waste% − refund% − loyalty%). Per-day = ÷ daysOpenPerMonth. computeScenario()." />
        } />
        <Kpi label="Prime cost" value={`${(c.primeCostPct * 100).toFixed(0)}%`} accentVar="--av3-c3" info={
          <InfoButton title="Prime cost %"
            description="Food cost plus labour as a share of revenue — the two biggest controllable lines combined."
            institutional="The number every restaurant operator manages to. Industry rule of thumb: keep prime cost under 60% of revenue; 55% is excellent, above 65% the unit is structurally unprofitable no matter how busy. It's the headline because COGS and labour are where money actually leaks — rent and the rest are comparatively fixed and small."
            plain="On 48 000 zł revenue, if food is 14 400 zł (30%) and labour 12 000 zł (25%), prime cost is 26 400 zł = 55%. That leaves 45% to cover rent, fees, marketing and profit — comfortable. Let it drift to 65% and there's almost nothing left."
            tips="COGS side: tighten portioning, switch distributor offerings (the Recipes ingredient catalog), engineer the menu toward high-margin items. Labour side: schedule to the demand curve (use the hourly-throughput sandbox), cross-train so one fewer head covers a soft daypart. Track it weekly, not monthly."
            methodology="primeCostPct = (COGS + labour) ÷ revenue. COGS = revenue × cogsPct; labour from the per-role headcount × hours × rate, flexed by volume. computeScenario(), src/lib/simulation-engine.ts." />
        } />
        <Kpi label="Payback" value={c.paybackMonths != null ? `${c.paybackMonths.toFixed(1)} mo` : "—"} accentVar="--av3-c1" info={
          <InfoButton title="Payback period"
            description="How many months of steady net profit it takes to earn back the upfront setup cost."
            institutional="The headline risk metric for the build-out decision. Street-food / single-truck investors look for payback inside 18–30 months; beyond ~36 months the capital is better deployed elsewhere unless there's a strategic reason. Shorter payback = lower exposure to the unknowns of a young location. Pair it with NPV/IRR (Investor Returns card) for the full picture."
            plain="If the truck cost 240 000 zł to build and fit out, and it nets 10 000 zł/month, you recover the cash in 24 months — two years before the project is truly 'in the black' on the original cheque."
            tips="Two ways to shorten it: spend less up front (lease vs buy equipment, phase the fit-out) or net more per month (every lever that lifts net profit shortens payback proportionally). A 10% net-profit improvement turns a 24-month payback into ~21.8 months."
            methodology="paybackMonths = setupCostGrosze ÷ monthlyNetProfit, shown only when setup cost > 0 and net profit > 0. The Investor Returns card adds the discounted view (NPV at 10/15/20% + bisected IRR). computeScenario() + computeReturns()." />
        } />
        <Kpi label="Margin of safety" value={`${(c.marginOfSafetyPct * 100).toFixed(0)}%`} accentVar={c.marginOfSafetyPct >= 0.25 ? "--av3-c4" : c.marginOfSafetyPct >= 0.1 ? "--av3-c5" : "--av3-c1"} info={
          <InfoButton title="Margin of safety"
            description="How far revenue can fall before the truck hits break-even — your cushion against a bad month."
            institutional="The risk buffer investors stress-test. Rule of thumb: a healthy unit runs 25–40% above break-even; below ~15% the model is fragile (one rainy fortnight tips it into a loss) and shouldn't be financed without a plan to widen it. Read it alongside break-even/day — a low margin of safety with break-even near capacity is the danger zone."
            plain="If you do 48 000 zł and break-even is 36 000 zł, your margin of safety is (48 000 − 36 000) ÷ 48 000 = 25% — revenue could drop a quarter before you stop making money. At 8% you're one slow week from red."
            tips="Widen it the same way you lower break-even: lift contribution per order (ticket, COGS) or trim fixed/labour drag. Converting a fixed cost to a variable one mechanically raises the cushion. Use the orders × ticket heatmap below to see how much room each lever buys."
            methodology="marginOfSafetyPct = (monthlyRevenue − breakEvenRevenue) ÷ monthlyRevenue, where breakEvenRevenue = breakEvenOrdersPerMonth × avgTicket. computeScenario(), src/lib/simulation-engine.ts." />
        } />
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
              <P label="Wage infl. %/yr" frac={scn.wageInflationPct ?? 0} onChange={(f) => patch({ wageInflationPct: f })} w={120} />
              <P label="Ingred. infl. %/yr" frac={scn.ingredientInflationPct ?? 0} onChange={(f) => patch({ ingredientInflationPct: f })} w={132} />
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
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--av3-line)" }}>
                <P label="Labour flex %" frac={scn.laborVariablePct ?? 0} onChange={(f) => patch({ laborVariablePct: f })} w={110} />
                <N label="Anchor orders/day" value={scn.laborAnchorOrdersPerDay ?? scn.ordersPerDay} onChange={(n) => patch({ laborAnchorOrdersPerDay: n })} w={140} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Fixed costs (monthly)" />
            <CardBody><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {FIXED_KEYS.map((f) => <Z key={f.key} label={f.label} grosze={(scn.fixedCosts as Record<string, number>)[f.key] ?? 0} onChange={(g) => patchFixed(f.key, g)} w={110} />)}
              <div className="av3-field" style={{ width: 150 }}><span className="av3-field-label">Marketing = CAC</span><button type="button" className="av3-toggle" data-on={!!scn.marketingAsCac} onClick={() => patch({ marketingAsCac: !scn.marketingAsCac })}>{scn.marketingAsCac ? "Yes" : "No"}</button></div>
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
                <N label="Open hrs/day" value={scn.kitchenCapacity.openHoursPerDay} onChange={(n) => patch({ kitchenCapacity: { ...scn.kitchenCapacity!, openHoursPerDay: n } })} w={104} step={0.5} />
                <N label="Oven / cycle" value={scn.kitchenCapacity.ovenPizzasPerCycle ?? 0} onChange={(n) => patch({ kitchenCapacity: { ...scn.kitchenCapacity!, ovenPizzasPerCycle: n } })} w={96} />
                <N label="Cycle (s)" value={scn.kitchenCapacity.ovenCycleSeconds ?? 0} onChange={(n) => patch({ kitchenCapacity: { ...scn.kitchenCapacity!, ovenCycleSeconds: n } })} w={92} />
                <P label="Oven eff. %" frac={scn.kitchenCapacity.ovenEfficiencyPct ?? 0} onChange={(f) => patch({ kitchenCapacity: { ...scn.kitchenCapacity!, ovenEfficiencyPct: f } })} w={100} />
              </>}
              <N label="Prep complexity ×" value={scn.prepComplexityMultiplier ?? 1} onChange={(n) => patch({ prepComplexityMultiplier: n })} w={130} step={0.05} />
            </div></CardBody>
          </Card>

          {/* behaviour assumptions — attach / combo / delivery levers fold into ticket + COGS */}
          <Card>
            <CardHead title="Behaviour assumptions" description="Attach, combo & delivery levers fold into effective ticket + COGS" />
            <CardBody style={{ paddingTop: 4 }}>
              {(Object.keys(ATTACH_LABELS) as AttachKey[]).map((k) => (
                <AttachRow key={k} label={ATTACH_LABELS[k]} lever={scn.assumptions?.[k]} onToggle={(on) => patchAssume({ [k]: { ...(scn.assumptions?.[k] ?? ATTACH_DEFAULTS[k]), enabled: on } } as Partial<SimulationAssumptions>)} onChange={(patchL) => patchAssume({ [k]: { ...(scn.assumptions?.[k] ?? ATTACH_DEFAULTS[k]), ...patchL } } as Partial<SimulationAssumptions>)} />
              ))}
              {(() => { const cc = scn.assumptions?.comboConversion; const on = !!cc && cc.enabled !== false; return (
                <div className="av3-leverrow">
                  <button type="button" className="av3-toggle" data-on={on} onClick={() => patchAssume({ comboConversion: { ...(cc ?? { pct: 0.20, addonGrosze: 2500, discountGrosze: 600, addonCogsPct: 0.25 }), enabled: !on } })}>{on ? "On" : "Off"}</button>
                  <span className="av3-lever-name">Combo conversion</span>
                  {on && cc && <><P label="%" frac={cc.pct} onChange={(f) => patchAssume({ comboConversion: { ...cc, pct: f } })} w={72} /><Z label="Add-on" grosze={cc.addonGrosze} onChange={(g) => patchAssume({ comboConversion: { ...cc, addonGrosze: g } })} w={84} /><Z label="Disc." grosze={cc.discountGrosze} onChange={(g) => patchAssume({ comboConversion: { ...cc, discountGrosze: g } })} w={84} /><P label="Add-on COGS %" frac={cc.addonCogsPct} onChange={(f) => patchAssume({ comboConversion: { ...cc, addonCogsPct: f } })} w={112} /></>}
                </div>
              ); })()}
              {(() => { const d = scn.assumptions?.deliveryShare; const on = !!d && d.enabled !== false; return (
                <div className="av3-leverrow">
                  <button type="button" className="av3-toggle" data-on={on} onClick={() => patchAssume({ deliveryShare: { ...(d ?? { pct: 0.25, packagingCostGrosze: 250, extraProcessorPct: 0, avgFeeGrosze: 800 }), enabled: !on } })}>{on ? "On" : "Off"}</button>
                  <span className="av3-lever-name">Delivery share</span>
                  {on && d && <><P label="%" frac={d.pct} onChange={(f) => patchAssume({ deliveryShare: { ...d, pct: f } })} w={72} /><Z label="Packaging" grosze={d.packagingCostGrosze} onChange={(g) => patchAssume({ deliveryShare: { ...d, packagingCostGrosze: g } })} w={96} /><Z label="Fee" grosze={d.avgFeeGrosze} onChange={(g) => patchAssume({ deliveryShare: { ...d, avgFeeGrosze: g } })} w={84} /></>}
                </div>
              ); })()}
              {(() => { const cp = scn.assumptions?.cheapestPizzaShift; const on = !!cp && cp.enabled !== false; return (
                <div className="av3-leverrow">
                  <button type="button" className="av3-toggle" data-on={on} onClick={() => patchAssume({ cheapestPizzaShift: { ...(cp ?? { pp: 10, ticketDeltaGrosze: 80, cogsDeltaGrosze: 30 }), enabled: !on } })}>{on ? "On" : "Off"}</button>
                  <span className="av3-lever-name">Cheapest-pizza shift</span>
                  {on && cp && <><N label="Shift pp" value={cp.pp} onChange={(n) => patchAssume({ cheapestPizzaShift: { ...cp, pp: n } })} w={84} /><Z label="Ticket Δ/pp" grosze={cp.ticketDeltaGrosze} onChange={(g) => patchAssume({ cheapestPizzaShift: { ...cp, ticketDeltaGrosze: g } })} w={106} /><Z label="COGS Δ/pp" grosze={cp.cogsDeltaGrosze} onChange={(g) => patchAssume({ cheapestPizzaShift: { ...cp, cogsDeltaGrosze: g } })} w={106} /></>}
                </div>
              ); })()}
            </CardBody>
          </Card>

          {/* ingredient cost stress — each lever shifts COGS by share × delta */}
          <Card>
            <CardHead title="Ingredient cost stress" description="Flex a line's cost — COGS moves by its share × delta" />
            <CardBody><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(Object.keys(INGREDIENT_LABELS) as IngKey[]).map((k) => { const lev = scn.assumptions?.ingredients?.[k]; const on = !!lev && lev.enabled !== false; return (
                <div key={k} style={{ display: "flex", flexDirection: "column", gap: 3, width: 116, border: "1px solid var(--av3-line)", borderRadius: 7, padding: 7 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ fontSize: 11 }}>{INGREDIENT_LABELS[k]}</span><button type="button" className="av3-toggle" data-on={on} style={{ height: 18, padding: "0 7px", fontSize: 10 }} onClick={() => patchAssume({ ingredients: { ...(scn.assumptions?.ingredients ?? {}), [k]: { cogsShare: lev?.cogsShare ?? INGREDIENT_SHARES[k], costDeltaPct: lev?.costDeltaPct ?? 0, enabled: !on } } })}>{on ? "On" : "Off"}</button></div>
                  {on && lev && <input className="av3-input" type="number" step="1" value={Math.round((lev.costDeltaPct ?? 0) * 100)} onChange={(e) => patchAssume({ ingredients: { ...(scn.assumptions?.ingredients ?? {}), [k]: { ...lev, costDeltaPct: (Number(e.target.value) || 0) / 100 } } })} title="cost delta %" />}
                </div>
              ); })}
            </div></CardBody>
          </Card>

          {/* seasonality + weather → fold into the headline ordersPerDay/daysOpen */}
          <Card>
            <CardHead title="Seasonality & weather" description="Quarterly multipliers + a calibrated weather/holiday model" />
            <CardBody>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                {SEASONS.map((s) => <P key={s.key} label={s.label} frac={(scn.seasonality ?? DEFAULT_SEASONALITY)[s.key] as number} onChange={(f) => patchSeason({ [s.key]: f } as Partial<SimulationSeasonality>)} w={96} />)}
              </div>
              <div className="av3-field-label" style={{ marginBottom: 6 }}>Per-month overrides (×, blank = use season)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, marginBottom: 8 }}>
                {MONTH_LABELS.map((m, i) => { const ov = scn.seasonality?.monthlyOverrides?.[i]; return (
                  <label key={m} className="av3-field"><span className="av3-field-label">{m}</span>
                    <input className="av3-input" type="number" step="0.01" value={ov ?? ""} placeholder="—"
                      onChange={(e) => { const arr = [...(scn.seasonality?.monthlyOverrides ?? Array(12).fill(undefined))]; arr[i] = e.target.value === "" ? undefined : Number(e.target.value); patchSeason({ monthlyOverrides: arr }); }} />
                  </label>
                ); })}
              </div>
              {(() => { const w = scn.weather; const on = !!w && w.enabled !== false; return (
                <>
                  <div className="av3-leverrow">
                    <button type="button" className="av3-toggle" data-on={on} onClick={() => patchWeather({ enabled: !on })}>{on ? "On" : "Off"}</button>
                    <span className="av3-lever-name">Weather & holiday model</span>
                  </div>
                  {on && w && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                    <P label="Rainy share" frac={w.rainyShare} onChange={(f) => patchWeather({ rainyShare: f })} w={92} />
                    <P label="Rainy mult" frac={w.rainyDayMultiplier} onChange={(f) => patchWeather({ rainyDayMultiplier: f })} w={92} />
                    <P label="Heat share" frac={w.heatwaveShare} onChange={(f) => patchWeather({ heatwaveShare: f })} w={92} />
                    <P label="Heat mult" frac={w.heatwaveMultiplier} onChange={(f) => patchWeather({ heatwaveMultiplier: f })} w={92} />
                    <N label="Closed days/mo" value={w.holidayClosedDaysPerMonth} onChange={(n) => patchWeather({ holidayClosedDaysPerMonth: n })} w={110} step={0.5} />
                    <N label="Peak days/mo" value={w.holidayPeakDaysPerMonth} onChange={(n) => patchWeather({ holidayPeakDaysPerMonth: n })} w={104} step={0.5} />
                    <P label="Peak mult" frac={w.holidayPeakMultiplier} onChange={(f) => patchWeather({ holidayPeakMultiplier: f })} w={92} />
                    <N label="Event days/mo" value={w.eventDaysPerMonth} onChange={(n) => patchWeather({ eventDaysPerMonth: n })} w={108} step={0.5} />
                    <P label="Event mult" frac={w.eventDayMultiplier} onChange={(f) => patchWeather({ eventDayMultiplier: f })} w={92} />
                    <P label="School-hol lunch" frac={w.schoolHolidayLunchMultiplier} onChange={(f) => patchWeather({ schoolHolidayLunchMultiplier: f })} w={116} />
                  </div>}
                </>
              ); })()}
            </CardBody>
          </Card>
          {/* channel mix + fleet/franchise model */}
          <Card>
            <CardHead title="Channel mix & fleet" description="Per-channel fee mix + multi-unit franchise economics" />
            <CardBody>
              <div className="av3-subhead" style={{ marginTop: 0 }}>Channel mix (on-site card = remainder)</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <P label="Cash %" frac={scn.cashSharePct ?? 0} onChange={(f) => patch({ cashSharePct: f })} w={86} />
                <P label="Glovo %" frac={scn.glovoSharePct ?? 0} onChange={(f) => patch({ glovoSharePct: f })} w={86} />
                <P label="Glovo fee %" frac={scn.glovoFeePct ?? 0} onChange={(f) => patch({ glovoFeePct: f })} w={96} />
                <P label="Wolt %" frac={scn.woltSharePct ?? 0} onChange={(f) => patch({ woltSharePct: f })} w={86} />
                <P label="Wolt fee %" frac={scn.woltFeePct ?? 0} onChange={(f) => patch({ woltFeePct: f })} w={96} />
              </div>
              <div className="av3-subhead">Fleet / franchise</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <N label="Units" value={scn.fleet?.unitCount ?? 1} onChange={(n) => patchFleet({ unitCount: Math.max(1, Math.round(n)) })} w={80} />
                {(scn.fleet?.unitCount ?? 1) > 1 && scn.fleet && <>
                  <Z label="HQ overhead/mo" grosze={scn.fleet.hqOverheadMonthlyGrosze} onChange={(g) => patchFleet({ hqOverheadMonthlyGrosze: g })} w={120} />
                  <P label="Royalty %" frac={scn.fleet.royaltyPct} onChange={(f) => patchFleet({ royaltyPct: f })} w={92} />
                  <P label="Mkt fund %" frac={scn.fleet.marketingFundPct} onChange={(f) => patchFleet({ marketingFundPct: f })} w={96} />
                  <P label="DMA overlap %" frac={scn.fleet.dmaOverlapPct} onChange={(f) => patchFleet({ dmaOverlapPct: f })} w={108} />
                  <N label="Supply disc. @units" value={scn.fleet.supplyDiscountAtUnits} onChange={(n) => patchFleet({ supplyDiscountAtUnits: Math.round(n) })} w={130} />
                  <P label="Supply disc. %" frac={scn.fleet.supplyDiscountPct} onChange={(f) => patchFleet({ supplyDiscountPct: f })} w={110} />
                  <N label="Commissary @units" value={scn.fleet.commissaryEnabledAtUnits} onChange={(n) => patchFleet({ commissaryEnabledAtUnits: Math.round(n) })} w={130} />
                  <P label="Commissary save %" frac={scn.fleet.commissarySavingsPct} onChange={(f) => patchFleet({ commissarySavingsPct: f })} w={128} />
                  <P label="Build-out learning %" frac={scn.fleet.buildoutLearningPct} onChange={(f) => patchFleet({ buildoutLearningPct: f })} w={136} />
                  <P label="Build-out floor %" frac={scn.fleet.buildoutFloorPct} onChange={(f) => patchFleet({ buildoutFloorPct: f })} w={120} />
                </>}
              </div>
            </CardBody>
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
            <CardHead title="Unit economics" actions={
              <InfoButton title="Unit economics"
                description="The per-order and capacity vital signs — how much each order contributes and how hard the truck is working."
                institutional="This is where investors test whether a unit scales. True CM1/order (contribution after ALL variable costs incl. payment fees, waste, loyalty, packaging) must be solidly positive — it's the cash each incremental order generates. Healthy QSR true-CM% sits 55–70%; food cost ≤30% and labour ≤25% keep prime cost in range. Capacity used should run 60–85% at peak: below 50% the asset is under-worked, above 90% you're turning guests away and need a second unit, not more marketing."
                plain="At 38 zł avg ticket, if food + fees + waste + packaging eat 13 zł, the order's true CM1 is ~25 zł (66%). Do 80 orders a day and that's ~2 000 zł of daily contribution toward fixed costs and profit. If capacity used reads 92%, you're effectively sold out at peak — the next złoty of growth comes from a second truck or a faster line, not discounts."
                tips="Lift true CM1 by raising ticket (attach) and trimming the variable block (distributor offerings, portioning, lower-fee channels). Pull food% and labour% down toward benchmark before chasing volume. If capacity used is low, fix demand (hours, marketing, slots); if it's pinned near 100%, invest in throughput (oven/prep) or a second unit."
                methodology="trueCm1PerOrder = avgTicket − (COGS + fees + waste + refunds + loyalty + packaging) per order; trueCM% = that ÷ avgTicket. foodCost% / labour% are those lines ÷ revenue. capacityUtilization = forecast orders ÷ (kitchen pizzas-per-hour × open hours). cash-on-cash = annual net profit ÷ setup cost. All from computeScenario(), src/lib/simulation-engine.ts." />
            } />
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

          <Card>
            <CardHead title="Channel economics" description="Per-channel CM1 — unblended, so you can see if delivery actually pays" />
            <CardBody style={{ paddingTop: 6, paddingBottom: 6 }}>
              <div className="av3-table-wrap"><table className="av3-table">
                <thead><tr><th>Channel</th><th className="av3-th-num">Share</th><th className="av3-th-num">Fee</th><th className="av3-th-num">CM1 / order</th><th className="av3-th-num">CM1 %</th><th className="av3-th-num">Monthly contrib.</th></tr></thead>
                <tbody>{channels.map((ch) => (
                  <tr key={ch.key}><td style={{ fontWeight: 600 }}>{ch.label}</td><td className="av3-num">{(ch.sharePct * 100).toFixed(0)}%</td>
                    <td className="av3-num">{(ch.feePct * 100).toFixed(1)}%</td><td className="av3-num">{formatPrice(ch.cm1PerOrderGrosze)}</td>
                    <td className="av3-num"><Badge tone={ch.cm1PctOfTicket >= 0.6 ? "ok" : ch.cm1PctOfTicket >= 0.4 ? "warn" : "bad"}>{(ch.cm1PctOfTicket * 100).toFixed(0)}%</Badge></td>
                    <td className="av3-num">{formatPrice(Math.round(ch.monthlyContributionGrosze))}</td></tr>
                ))}</tbody>
              </table></div>
            </CardBody>
          </Card>

          {fleet && (
            <Card>
              <CardHead title="Fleet economics" description={`${fleet.unitCount} units · DMA cannibalisation, supply/commissary savings, royalty + HQ`} actions={<div style={{ display: "flex", gap: 6 }}>{fleet.supplyDiscountActive && <Badge tone="ok">supply −</Badge>}{fleet.commissaryActive && <Badge tone="ok">commissary</Badge>}</div>} />
              <CardBody>
                <div className="av3-od-grid" style={{ marginBottom: 12 }}>
                  <div className="av3-od-field"><div className="k">Fleet revenue / mo</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{formatPrice(Math.round(fleet.totalRevenue))}</div></div>
                  <div className="av3-od-field"><div className="k">Fleet EBITDA / mo</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)", color: fleet.totalEbitda >= 0 ? "var(--av3-ok)" : "var(--av3-bad)" }}>{formatPrice(Math.round(fleet.totalEbitda))}</div></div>
                  <div className="av3-od-field"><div className="k">Avg EBITDA / unit</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{formatPrice(Math.round(fleet.avgEbitdaPerUnit))}</div></div>
                  <div className="av3-od-field"><div className="k">HQ absorption</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{(fleet.hqOverheadAbsorption * 100).toFixed(1)}%</div></div>
                  <div className="av3-od-field"><div className="k">Total build-out</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{formatPrice(Math.round(fleet.totalSetupCost))}</div></div>
                  <div className="av3-od-field"><div className="k">HQ overhead / mo</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{formatPrice(fleet.hqOverhead)}</div></div>
                </div>
                <div className="av3-table-wrap"><table className="av3-table">
                  <thead><tr><th>Unit</th><th className="av3-th-num">Revenue</th><th className="av3-th-num">EBITDA</th><th className="av3-th-num">Royalty</th><th className="av3-th-num">Build-out</th></tr></thead>
                  <tbody>{fleet.units.map((u) => (
                    <tr key={u.unitIndex}><td>#{u.unitIndex}</td><td className="av3-num">{formatPrice(Math.round(u.revenue))}</td>
                      <td className="av3-num" style={{ color: u.ebitda >= 0 ? undefined : "var(--av3-bad)" }}>{formatPrice(Math.round(u.ebitda))}</td>
                      <td className="av3-num">{formatPrice(Math.round(u.royalty))}</td><td className="av3-num">{formatPrice(Math.round(u.setupCost))}</td></tr>
                  ))}</tbody>
                </table></div>
              </CardBody>
            </Card>
          )}

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

      {/* 12-month projection — seasonality + weather + inflation composed per month */}
      {projection.length > 0 && (() => {
        const H = 160;
        const maxPos = Math.max(1, ...projection.map((r) => Math.max(r.revenue, r.netProfit)));
        const minNeg = Math.min(0, ...projection.map((r) => r.netProfit));
        const range = maxPos - minNeg;
        const zeroTopPct = (maxPos / range) * 100; // zero baseline, measured from the top
        const zeroBottomPct = 100 - zeroTopPct;
        const annualRevenue = projection.reduce((sum, r) => sum + r.revenue, 0);
        const annualNet = projection.reduce((sum, r) => sum + r.netProfit, 0);
        return (
          <Card>
            <CardHead
              title="12-month projection"
              description="Seasonality × weather × wage/ingredient inflation composed per month — revenue vs net profit"
              actions={<div style={{ display: "flex", gap: 14, fontSize: 11.5, fontFamily: "var(--av3-mono)" }}>
                <span style={{ color: "var(--av3-muted)" }}>Yr revenue <b style={{ color: "var(--av3-fg)" }}>{formatPrice(annualRevenue)}</b></span>
                <span style={{ color: "var(--av3-muted)" }}>Yr net <b style={{ color: annualNet >= 0 ? "var(--av3-ok)" : "var(--av3-bad)" }}>{formatPrice(annualNet)}</b></span>
              </div>}
            />
            <CardBody>
              <div style={{ position: "relative", height: H, display: "flex", alignItems: "stretch", gap: 5 }}>
                {/* zero baseline */}
                <div style={{ position: "absolute", left: 0, right: 0, top: `${zeroTopPct}%`, borderTop: "1px solid var(--av3-line-strong)", pointerEvents: "none" }} />
                {projection.map((r) => {
                  const revH = (r.revenue / range) * H;
                  const npH = (Math.abs(r.netProfit) / range) * H;
                  const npUp = r.netProfit >= 0;
                  return (
                    <div key={r.monthIndex} title={`${r.month} · revenue ${formatPrice(r.revenue)} · net ${formatPrice(r.netProfit)}`} style={{ flex: 1, position: "relative" }}>
                      <div style={{ position: "absolute", bottom: `${zeroBottomPct}%`, left: "8%", width: "40%", height: revH, background: "var(--av3-c3)", opacity: 0.5, borderRadius: "2px 2px 0 0" }} />
                      <div style={{ position: "absolute", [npUp ? "bottom" : "top"]: `${npUp ? zeroBottomPct : zeroTopPct}%`, left: "52%", width: "40%", height: npH, background: npUp ? "var(--av3-ok)" : "var(--av3-bad)", borderRadius: npUp ? "2px 2px 0 0" : "0 0 2px 2px" }} />
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
                {projection.map((r) => <div key={r.monthIndex} style={{ flex: 1, textAlign: "center", fontSize: 10, color: "var(--av3-subtle)", fontFamily: "var(--av3-mono)" }}>{r.month}</div>)}
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 11, color: "var(--av3-muted)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: "var(--av3-c3)", opacity: 0.5 }} /> Revenue</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: "var(--av3-ok)" }} /> Net profit</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: "var(--av3-bad)" }} /> Net loss</span>
              </div>
            </CardBody>
          </Card>
        );
      })()}

      {/* scenario comparison — conservative / base / optimistic (real engine) */}
      {archetypes.length > 0 && (
        <Card>
          <CardHead title="Scenario comparison" description="Conservative · base · optimistic — same model, scaled volume / ticket / COGS" actions={
            <InfoButton title="Scenario comparison"
              description="The live scenario re-run under a pessimistic and an optimistic set of assumptions, side by side."
              institutional="Investors never underwrite a single point estimate — they want the band. The institutional test: the business must survive the conservative case (net profit ≥ 0, payback still rational) and the optimistic case must not be the only path to viability. A model that only works in the optimistic column is a red flag."
              plain="Base nets 7 200 zł/mo. Knock volume −20%, ticket −5% and add 3pp of food cost and you're at the Conservative column — if that's still green you can weather a soft quarter. The Optimistic column shows the upside if attach and footfall both land."
              tips="If Conservative dips negative, widen the margin of safety before scaling: lift contribution per order or cut fixed drag. Use the heatmaps below to find which single lever moves the band most."
              methodology="Each column re-runs computeScenario() on the folded scenario with ordersPerDay, avgTicket and cogsPct scaled — Conservative ×0.8 / ×0.95 / +3pp, Optimistic ×1.2 / ×1.08 / −2pp. src/lib/simulation-engine.ts." />
          } />
          <CardBody>
            <div className="av3-scn">
              {archetypes.map((a) => (
                <div key={a.name} className="av3-scn-card" data-base={a.base}>
                  <div className="av3-scn-name">{a.name}{a.base && <Badge tone="brand">live</Badge>}</div>
                  <div className="av3-scn-net" style={{ color: a.net >= 0 ? "var(--av3-ok)" : "var(--av3-bad)" }}>{formatPrice(a.net)}<span style={{ fontSize: 11, color: "var(--av3-subtle)", fontWeight: 400 }}> /mo</span></div>
                  <div className="av3-scn-line"><span>Net margin</span><span className="v">{(a.margin * 100).toFixed(1)}%</span></div>
                  <div className="av3-scn-line"><span>EBITDA</span><span className="v">{formatPrice(a.ebitda)}</span></div>
                  <div className="av3-scn-line"><span>Break-even / day</span><span className="v">{Math.ceil(a.breakEven)}</span></div>
                  <div className="av3-scn-line"><span>Payback</span><span className="v">{a.payback != null ? `${a.payback.toFixed(1)} mo` : "—"}</span></div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--av3-subtle)", marginTop: 8 }}>Conservative: −20% orders · −5% ticket · +3pp COGS. Optimistic: +20% orders · +8% ticket · −2pp COGS.</div>
          </CardBody>
        </Card>
      )}

      {/* what-if heatmaps — net profit recomputed across a 7×7 grid */}
      {ordersTicketHeat && foodTicketHeat && (
        <div className="av3-grid-2">
          <Card>
            <CardHead title="Net profit — orders/day × ticket" actions={
              <InfoButton title="Net profit heatmap — orders/day × ticket"
                description="Net profit per month at every combination of daily order volume and average ticket, ±30% around today."
                institutional="A two-variable sensitivity map — far richer than the one-at-a-time tornado. It shows the profit 'cliff' (where green turns red) so you can see whether you're comfortably inside the safe zone or one bad assumption from a loss. The diagonal matters: volume and ticket are partly substitutes, and the map shows the trade-off rate."
                plain="The centre cell (outlined) is today. Slide right and orders rise; slide up and ticket rises — watch the colour deepen green. If the cells just left/below you are already red, you're sitting on the edge and should widen the cushion."
                tips="Find the cheapest path to a target profit: sometimes +1 zł on ticket (one row up) beats chasing 20% more orders (three columns right). Pair with the attach levers — they're the realistic way to move ticket."
                methodology="Each cell = computeScenario({ …folded, ordersPerDay×colMult, avgTicket×rowMult }).netProfit over mults 0.7–1.3. Colour intensity scales to the grid's max |net profit|. src/lib/simulation-engine.ts." />
            } />
            <CardBody><div className="av3-heat-axis" style={{ marginBottom: 6 }}>↑ avg ticket · → orders/day · cell = net profit / mo</div><Heatmap data={ordersTicketHeat} /></CardBody>
          </Card>
          <Card>
            <CardHead title="Net profit — food cost × ticket" actions={
              <InfoButton title="Net profit heatmap — food cost × ticket"
                description="Net profit per month across a band of food-cost % (rows) and average ticket (columns)."
                institutional="COGS and price are the two fastest margin levers, and this map shows how they fight each other. The institutional read: a unit whose viability needs sub-28% food cost is exposed to commodity swings; one that stays green even at +6pp COGS is resilient. It quantifies exactly how much ticket must rise to absorb an ingredient shock."
                plain="Going down a row adds ~2pp of food cost (a dairy price spike); going right adds ticket. If a cheese rally pushes you down two rows into amber, the map tells you how many złoty of ticket (columns right) claw the profit back."
                tips="Defend the COGS axis with the Recipes ingredient catalog (switch distributor offerings, tighten portions) before resorting to price rises that dent volume. Premium-topping attach lifts ticket without a blanket price increase."
                methodology="Each cell = computeScenario({ …folded, cogsPct + Δ, avgTicket×colMult }).netProfit over COGS Δ −6…+6pp and ticket mults 0.7–1.3. Colour scales to the grid's max |net profit|. src/lib/simulation-engine.ts." />
            } />
            <CardBody><div className="av3-heat-axis" style={{ marginBottom: 6 }}>↓ food cost % · → avg ticket · cell = net profit / mo</div><Heatmap data={foodTicketHeat} /></CardBody>
          </Card>
        </div>
      )}

      {/* menu strategy presets — one-click attach-lever mixes (real, via engine) */}
      <Card>
        <CardHead title="Menu strategy presets" description="Load a coherent attach-lever mix — folds into ticket & COGS through the engine" actions={
          <InfoButton title="Menu strategy presets"
            description="One-click menu archetypes that set the whole attach-lever mix (coffee, dessert, antipasti, aperitivo, premium toppings, pasta) at once."
            institutional="Menu strategy is the highest-leverage lever on a food unit's economics — it moves both ticket and COGS simultaneously. Presets let you compare strategic postures (premium vs value) without hand-tuning six levers, then read the impact straight off the P&L, scenario band and heatmaps. The institutional question each answers: does this menu posture clear the margin gate at our realistic volume?"
            plain="Tap 'Premium' and the model assumes more guests add a 22 zł dessert and a 28 zł aperitivo — ticket and gross profit rise, but so does food cost. 'Value' leans on cheap coffee attach and drops the pricey add-ons — lower ticket, leaner COGS, built for footfall. Watch the headline KPIs and Scenario card recompute instantly."
            tips="Start from the preset closest to your concept, then fine-tune the individual attach levers in 'Behaviour assumptions'. Pair with the orders × ticket heatmap to see whether the posture needs volume or price to clear target profit."
            methodology="Each preset writes the six attach levers into scenario.assumptions; applyAssumptions() then folds them into effective avg ticket and COGS before computeScenario(). Idempotent — re-tapping restores the same mix. src/lib/simulation-engine.ts." />
        } />
        <CardBody>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(Object.keys(MENU_PRESETS) as PresetKey[]).map((k) => (
              <Button key={k} variant="secondary" size="sm" onClick={() => applyMenuPreset(k)}>{PRESET_LABEL[k]}</Button>
            ))}
            <span style={{ fontSize: 11.5, color: "var(--av3-subtle)", alignSelf: "center" }}>Premium = richer add-ons (higher ticket + COGS) · Value = cheap-attach, lean COGS · Balanced = defaults.</span>
          </div>
        </CardBody>
      </Card>

      {oven && shiftPlan && (
        <div className="av3-grid-2">
          {/* oven curve & peak saturation */}
          <Card>
            <CardHead title="Oven curve & peak saturation" actions={
              <InfoButton title="Oven curve & peak saturation"
                description="Hourly order demand across the service day versus the line's sustainable pizzas-per-hour ceiling."
                institutional="Daily-average capacity is a vanity number — the binding constraint is the peak hour. If demand spikes above the oven/pizzaiolo ceiling at dinner, orders queue, tickets blow out and guests walk, no matter how slack the average looks. Institutional read: peak utilisation should sit ≤90%; sustained red means you're leaving revenue on the table and need a second oven, a faster line, or demand-shifting (slots/pre-order)."
                plain="The truck might average 8 orders/hr but slam 22 in the 19:00 hour against a 16/hr line — those 6 extra orders queue ~22 min and about half walk. The bars above the dashed ceiling are the orders you physically can't make in time."
                tips="Three fixes: raise the ceiling (second oven, prep-ahead dough, an extra pair of hands at peak — see the shift plan), or flatten demand (timed slots, pre-order, a happy-hour to pull the lunch shoulder), or cap delivery during the dinner rush. Each red hour is direct lost contribution."
                methodology="Hourly orders = ordersPerDay × a documented double-peak demand shape over kitchenCapacity.openHoursPerDay; ceiling = kitchenCapacity.pizzasPerHour. Peak wait ≈ (peakExcess ÷ ceiling) × 60 min; lost/mo = Σ over-ceiling × 50% balk × daysOpen. Modelling layer in CalculatorV3 over the scenario inputs." />
            } />
            <CardBody>
              {(() => {
                const H = 120; const scale = Math.max(oven.peak, oven.perHourCap) * 1.1 || 1;
                const capPct = (oven.perHourCap / scale) * 100;
                return (
                  <>
                    <div className="av3-kpi-rail" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 12 }}>
                      <Kpi label="Peak / hr" value={`${oven.peak.toFixed(0)}`} accentVar={oven.peakUtil > 1 ? "--av3-c1" : "--av3-c4"} />
                      <Kpi label="Line / hr" value={`${oven.perHourCap.toFixed(0)}`} accentVar="--av3-c3" />
                      <Kpi label="Peak util" value={`${(oven.peakUtil * 100).toFixed(0)}%`} accentVar={oven.peakUtil > 1 ? "--av3-c1" : oven.peakUtil > 0.9 ? "--av3-c5" : "--av3-c4"} />
                    </div>
                    <div style={{ position: "relative", height: H, display: "flex", alignItems: "flex-end", gap: 4 }}>
                      <div style={{ position: "absolute", left: 0, right: 0, bottom: `${capPct}%`, borderTop: "1px dashed var(--av3-line-strong)", pointerEvents: "none" }} />
                      {oven.bars.map((b) => {
                        const okH = (Math.min(b.orders, oven.perHourCap) / scale) * H;
                        const overH = (b.over / scale) * H;
                        return (
                          <div key={b.hour} title={`${b.hour}:00 · ${b.orders.toFixed(0)} orders${b.over > 0 ? ` · ${b.over.toFixed(0)} over` : ""}`} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                            {overH > 0 && <div style={{ height: overH, background: "var(--av3-bad)", borderRadius: "2px 2px 0 0" }} />}
                            <div style={{ height: okH, background: "var(--av3-c3)", opacity: 0.85, borderRadius: overH > 0 ? 0 : "2px 2px 0 0" }} />
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                      {oven.bars.map((b) => <div key={b.hour} style={{ flex: 1, textAlign: "center", fontSize: 9.5, color: "var(--av3-subtle)", fontFamily: "var(--av3-mono)" }}>{b.hour}</div>)}
                    </div>
                    <div style={{ fontSize: 11.5, color: oven.lostPerMonth > 0 ? "var(--av3-warn)" : "var(--av3-muted)", marginTop: 8 }}>
                      {oven.lostPerMonth > 0 ? `~${oven.waitMin} min peak wait · ~${oven.lostPerMonth.toLocaleString("pl-PL")} orders/mo lost to the queue` : "Line keeps up with peak demand — no queue loss."} <span style={{ color: "var(--av3-subtle)" }}>· dashed line = {oven.perHourCap.toFixed(0)}/hr ceiling</span>
                    </div>
                  </>
                );
              })()}
            </CardBody>
          </Card>

          {/* shift plan by daypart */}
          <Card>
            <CardHead title="Shift plan — labour by daypart" actions={
              <InfoButton title="Shift plan — labour by daypart"
                description="Forecast orders per daypart and the line headcount needed to serve them within the oven ceiling."
                institutional="Labour is the second-biggest controllable cost, and flat all-day staffing is where it leaks. Matching heads to the demand curve — light at the lunch shoulder, doubled at the dinner peak — is how good operators hold labour % in range without blowing service. The gate: scheduled peak heads must cover the dinner daypart's orders/hr, or the oven curve goes red."
                plain="Dinner does 22 orders/hr against a 16/hr line, so you need 2 pizzaioli on at 18:00–21:00; lunch at 9/hr needs only 1. Staffing 2 all day burns wage on the dead afternoon; staffing 1 all day loses the dinner rush."
                tips="Schedule to the 'rec. heads' column: add the second pair of hands only for the dinner block, cross-train so a waiter can plate at peak, and start prep before the lunch ramp. If recommended > scheduled at dinner, that's your queue loss in the oven curve."
                methodology="Orders/daypart = Σ of the modelled hourly demand within the daypart window; rec. heads = ⌈(orders/hr) ÷ kitchenCapacity.pizzasPerHour⌉ (min 1). Scheduled pizzaioli = Σ headcount of pizzaiolo labour lines. Modelling layer over the scenario." />
            } />
            <CardBody>
              <div className="av3-reciperow-head" style={{ gridTemplateColumns: "1.2fr 1.2fr 70px 64px" }}><span>Daypart</span><span>Hours</span><span style={{ textAlign: "right" }}>Orders</span><span style={{ textAlign: "right" }}>Heads</span></div>
              {shiftPlan.rows.map((r) => (
                <div key={r.key} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr 70px 64px", gap: 8, alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--av3-line)" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500 }}>{r.key}</span>
                  <span className="av3-cell-muted" style={{ fontFamily: "var(--av3-mono)", fontSize: 11.5 }}>{r.range}</span>
                  <span style={{ textAlign: "right", fontFamily: "var(--av3-mono)", fontSize: 12 }}>{r.orders}<span className="av3-cell-muted" style={{ fontSize: 10 }}> · {r.ordersPerHour.toFixed(0)}/h</span></span>
                  <span style={{ textAlign: "right" }}><Badge tone={r.heads > shiftPlan.scheduledPizzaioli ? "bad" : "ok"}>{r.heads}</Badge></span>
                </div>
              ))}
              <div style={{ fontSize: 11.5, color: "var(--av3-muted)", marginTop: 8 }}>
                Scheduled pizzaioli: <b style={{ color: "var(--av3-fg)" }}>{shiftPlan.scheduledPizzaioli}</b>
                {shiftPlan.rows.some((r) => r.heads > shiftPlan.scheduledPizzaioli) ? <span style={{ color: "var(--av3-warn)" }}> · peak daypart needs more heads than scheduled</span> : <span style={{ color: "var(--av3-ok)" }}> · covers every daypart</span>}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* real-data sandboxes — independent of the hypothetical scenario above */}
      <SimSandboxes />

      <div style={{ fontSize: 11.5, color: "var(--av3-subtle)" }}>
        Engine: <code>src/lib/simulation-engine.ts</code> (shared, pure). The sandboxes below read <b>real orders</b>; the model above is hypothetical. Five-section ⓘ explainers (Rule #12) land next.
      </div>
    </>
  );
}

/* ── real-data sandboxes (cohorts / dayparts / hourly / menu engineering) ── */
type SandTab = "cohorts" | "dayparts" | "hourly" | "menu-eng";
interface Cohort { windowDays: number; totalCustomers: number; repeatCustomers: number; repeatRatePct: number; avgOrdersPerCustomer: number; avgRevenuePerCustomerGrosze: number; avgGpPerCustomerGrosze: number; newCustomersPerMonth: number; newCustomerRevenueGrosze: number; returningCustomerRevenueGrosze: number }
interface Daypart { key: string; label: string; hours: string; ordersCount: number; sharePct: number; avgTicketGrosze: number; revenueGrosze: number; gpGrosze: number; gpRatePct: number }
interface Hourly { hour: number; totalOrders: number; avgOrdersPerHour: number; capacityUtilization: number }
interface MenuEng { menuItemId: string; name: string; category: string; unitsSold: number; gpPerUnit: number; quadrant: "star" | "plowhorse" | "puzzle" | "dog"; menuRole?: string; marginTrap: boolean; prepHeavy: boolean; trueCm1PerUnit: number }

const QUADRANT_TONE: Record<string, "ok" | "warn" | "info" | "bad"> = { star: "ok", plowhorse: "warn", puzzle: "info", dog: "bad" };

function SimSandboxes() {
  const [tab, setTab] = useState<SandTab>("cohorts");
  const [days, setDays] = useState(90);
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [dayparts, setDayparts] = useState<Daypart[]>([]);
  const [hourly, setHourly] = useState<Hourly[]>([]);
  const [menuEng, setMenuEng] = useState<MenuEng[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      const url =
        tab === "cohorts" ? `/api/admin/simulation/cohorts?days=${days}`
        : tab === "dayparts" ? `/api/admin/simulation/dayparts?days=${days}`
        : tab === "hourly" ? `/api/admin/simulation/hourly?days=${days}`
        : `/api/admin/simulation/menu-engineering?days=${days}`;
      const d = await fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (cancelled) return;
      if (tab === "cohorts") setCohort(d);
      else if (tab === "dayparts") setDayparts(d?.dayparts ?? []);
      else if (tab === "hourly") setHourly(d?.hourly ?? []);
      else setMenuEng(d?.items ?? []);
      setLoading(false);
    };
    run();
    return () => { cancelled = true; };
  }, [tab, days]);

  const quadCounts = useMemo(() => {
    const c: Record<string, number> = { star: 0, plowhorse: 0, puzzle: 0, dog: 0 };
    for (const m of menuEng) c[m.quadrant] = (c[m.quadrant] ?? 0) + 1;
    return c;
  }, [menuEng]);
  const hourMax = Math.max(1, ...hourly.map((h) => h.avgOrdersPerHour));

  return (
    <Card>
      <CardHead title="Sandboxes — real orders" description="Cohort/LTV · dayparts · hourly throughput · menu engineering, computed from real order history" actions={
        <div className="av3-chiprow" role="tablist">
          {[30, 90, 180].map((d) => <button key={d} type="button" role="tab" aria-selected={days === d} className={`av3-chip ${days === d ? "is-active" : ""}`} onClick={() => setDays(d)}>{d}d</button>)}
        </div>
      } />
      <CardBody>
        <div className="av3-filterchips" style={{ marginBottom: 12 }}>
          {([["cohorts", "Cohort / LTV-CAC"], ["dayparts", "Dayparts"], ["hourly", "Hourly throughput"], ["menu-eng", "Menu engineering"]] as [SandTab, string][]).map(([k, label]) => (
            <button key={k} type="button" className={`av3-fchip ${tab === k ? "is-active" : ""}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>

        {loading ? (
          <div className="av3-loading"><span className="av3-spin" aria-hidden /> Crunching real orders…</div>
        ) : tab === "cohorts" ? (
          !cohort || cohort.totalCustomers === 0 ? <div className="av3-empty"><div className="av3-empty-text">No phone-identified orders in this window.</div></div> : (
            <>
              <div className="av3-kpi-rail">
                <Kpi label="Customers" value={cohort.totalCustomers.toLocaleString("pl-PL")} accentVar="--av3-c3" />
                <Kpi label="Repeat rate" value={`${(cohort.repeatRatePct * 100).toFixed(0)}%`} accentVar="--av3-c4" />
                <Kpi label="Orders / cust" value={cohort.avgOrdersPerCustomer.toFixed(2)} accentVar="--av3-c2" />
                <Kpi label="Revenue / cust" value={formatPrice(cohort.avgRevenuePerCustomerGrosze)} accentVar="--av3-c5" />
                <Kpi label="GP / cust (LTV)" value={formatPrice(cohort.avgGpPerCustomerGrosze)} accentVar="--av3-c4" />
                <Kpi label="New / mo" value={cohort.newCustomersPerMonth.toFixed(0)} accentVar="--av3-c1" />
              </div>
              <div className="av3-subhead">New vs returning revenue</div>
              {(() => { const n = cohort.newCustomerRevenueGrosze, r = cohort.returningCustomerRevenueGrosze, tot = Math.max(1, n + r); return (
                <>
                  <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden" }}>
                    <div title={`New ${formatPrice(n)}`} style={{ width: `${(n / tot) * 100}%`, background: "var(--av3-c3)" }} />
                    <div title={`Returning ${formatPrice(r)}`} style={{ width: `${(r / tot) * 100}%`, background: "var(--av3-c4)" }} />
                  </div>
                  <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 11, color: "var(--av3-muted)" }}>
                    <span><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--av3-c3)", marginRight: 5 }} />New {formatPrice(n)} ({Math.round((n / tot) * 100)}%)</span>
                    <span><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--av3-c4)", marginRight: 5 }} />Returning {formatPrice(r)} ({Math.round((r / tot) * 100)}%)</span>
                  </div>
                </>
              ); })()}
            </>
          )
        ) : tab === "dayparts" ? (
          dayparts.length === 0 ? <div className="av3-empty"><div className="av3-empty-text">No orders in this window.</div></div> : (
            <div className="av3-table-wrap"><table className="av3-table">
              <thead><tr><th>Daypart</th><th>Hours</th><th className="av3-th-num">Orders</th><th className="av3-th-num">Share</th><th className="av3-th-num">Avg ticket</th><th className="av3-th-num">Revenue</th><th className="av3-th-num">GP</th><th className="av3-th-num">GP rate</th></tr></thead>
              <tbody>{dayparts.map((d) => (
                <tr key={d.key}><td style={{ fontWeight: 600 }}>{d.label}</td><td className="av3-cell-muted">{d.hours}</td>
                  <td className="av3-num">{d.ordersCount}</td><td className="av3-num">{(d.sharePct * 100).toFixed(0)}%</td>
                  <td className="av3-num">{formatPrice(d.avgTicketGrosze)}</td><td className="av3-num">{formatPrice(d.revenueGrosze)}</td>
                  <td className="av3-num">{formatPrice(d.gpGrosze)}</td><td className="av3-num"><Badge tone={d.gpRatePct >= 0.68 ? "ok" : d.gpRatePct >= 0.6 ? "warn" : "bad"}>{(d.gpRatePct * 100).toFixed(0)}%</Badge></td></tr>
              ))}</tbody>
            </table></div>
          )
        ) : tab === "hourly" ? (
          hourly.length === 0 ? <div className="av3-empty"><div className="av3-empty-text">No orders in this window.</div></div> : (
            <>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 120 }}>
                {hourly.map((h) => { const over = h.capacityUtilization > 1; const near = h.capacityUtilization >= 0.85; return (
                  <div key={h.hour} title={`${String(h.hour).padStart(2, "0")}:00 · ${h.avgOrdersPerHour.toFixed(1)}/hr${h.capacityUtilization > 0 ? ` · ${(h.capacityUtilization * 100).toFixed(0)}% cap` : ""}`} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                    <div style={{ height: `${(h.avgOrdersPerHour / hourMax) * 100}%`, background: over ? "var(--av3-bad)" : near ? "var(--av3-warn)" : "var(--av3-c3)", borderRadius: "2px 2px 0 0" }} />
                  </div>
                ); })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: "var(--av3-subtle)", fontFamily: "var(--av3-mono)" }}><span>00h</span><span>peak {hourMax.toFixed(1)}/hr</span><span>23h</span></div>
              <div style={{ fontSize: 10.5, color: "var(--av3-muted)", marginTop: 6 }}>Amber ≥85% capacity · red over capacity (set kitchen pizzas/hr in the model to see the ceiling).</div>
            </>
          )
        ) : (
          menuEng.length === 0 ? <div className="av3-empty"><div className="av3-empty-text">No items sold in this window.</div></div> : (
            <>
              <div className="av3-kpi-rail" style={{ marginBottom: 12 }}>
                <Kpi label="Stars" value={`${quadCounts.star}`} accentVar="--av3-c4" />
                <Kpi label="Plowhorses" value={`${quadCounts.plowhorse}`} accentVar="--av3-c5" />
                <Kpi label="Puzzles" value={`${quadCounts.puzzle}`} accentVar="--av3-c3" />
                <Kpi label="Dogs" value={`${quadCounts.dog}`} accentVar="--av3-c1" />
              </div>
              <div className="av3-table-wrap"><table className="av3-table">
                <thead><tr><th>Item</th><th>Quadrant</th><th className="av3-th-num">Units</th><th className="av3-th-num">GP/unit</th><th className="av3-th-num">True CM1</th><th>Flags</th></tr></thead>
                <tbody>{[...menuEng].sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 30).map((m) => (
                  <tr key={m.menuItemId}><td style={{ fontWeight: 600 }}>{m.name}<span className="av3-cell-muted" style={{ fontSize: 11, marginLeft: 6 }}>{m.category}</span></td>
                    <td><Badge tone={QUADRANT_TONE[m.quadrant]}>{m.quadrant}</Badge></td>
                    <td className="av3-num">{m.unitsSold}</td><td className="av3-num">{formatPrice(m.gpPerUnit)}</td><td className="av3-num">{formatPrice(m.trueCm1PerUnit)}</td>
                    <td>{m.marginTrap && <Badge tone="bad">margin trap</Badge>}{m.prepHeavy && <Badge tone="warn">prep-heavy</Badge>}{m.menuRole && <Badge tone="neutral">{m.menuRole}</Badge>}</td></tr>
                ))}</tbody>
              </table></div>
            </>
          )
        )}
      </CardBody>
    </Card>
  );
}
