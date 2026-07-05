"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { CURRENCY_META, convertFromGrosze, convertToGrosze, formatPriceInCurrency, type Currency } from "@/lib/currency";
import { fetchPublicSettings } from "@/lib/public-settings";
import { applyAnnualWeather, applyAssumptions, applyPremises, computeChannelEconomics, computeFleetEconomics, computePremises, computeReturns, computeScenario, computeTornado, DEFAULT_SEASONALITY, MONTH_LABELS, projectTwelveMonths } from "@/lib/simulation-engine";
import type { BusinessCostPayrollRole, SimulationAssumptions, SimulationAttachLever, SimulationFleetModel, SimulationLaborLine, SimulationMenuScenarioOverride, SimulationPremises, SimulationScenario, SimulationSeasonality, SimulationWeather } from "@/data/types";
import { Badge, Button, Card, CardBody, CardHead, InfoButton, Kpi, SkeletonPage, SkeletonRows, Switch } from "./ui";

const PAYROLL_ROLES: BusinessCostPayrollRole[] = ["pizzaiolo", "chef", "sous-chef", "kitchen-porter", "waiter", "barista", "driver", "manager", "cleaner", "other"];
const ROLE_LABEL: Record<BusinessCostPayrollRole, string> = {
  pizzaiolo: "Pizzaiolo", chef: "Chef", "sous-chef": "Sous-chef", "kitchen-porter": "Kitchen porter", waiter: "Waiter",
  barista: "Barista", driver: "Driver", manager: "Manager", cleaner: "Cleaner", other: "Other",
};
// Full label map for every business-cost category (the detailed P&L itemises
// fixedCosts by key, including tax + maintenance which aren't editable in the
// Fixed-costs card but carry premises property costs).
const FIXED_COST_LABELS: Record<string, string> = {
  rent: "Rent", utilities: "Utilities", fuel: "Fuel", vehicle: "Vehicle",
  insurance: "Insurance", licenses: "Licenses", marketing: "Marketing",
  software: "Software", professional: "Professional", other: "Other",
  tax: "Property / other tax", maintenance: "Maintenance", payroll: "Payroll",
  ingredients: "Ingredients", equipment: "Equipment",
};

// Rent is not here — the Premises card owns the occupancy line (rent or
// mortgage) and folds it into fixedCosts.rent via applyPremises.
const FIXED_KEYS: { key: string; label: string }[] = [
  { key: "utilities", label: "Utilities" }, { key: "fuel", label: "Fuel" },
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

// Calculator display currency — the model stays canonical in PLN grosze; this
// context only reformats + reparses money at the operator's FX rate. The four
// currencies the Calculator offers (SGD lives in the customer switcher only).
const CALC_CURRENCIES: Currency[] = ["PLN", "USD", "EUR", "AED"];
const CalcCurrencyCtx = createContext<{ cur: Currency; money: (g: number) => string }>({ cur: "PLN", money: formatPrice });
const useCalcCurrency = () => useContext(CalcCurrencyCtx);

// generic field helpers — money shown/entered in the chosen display currency, percent in %
function Z({ label, grosze, onChange, w = 120, readOnly = false, hint }: { label: string; grosze: number; onChange: (g: number) => void; w?: number; readOnly?: boolean; hint?: string }) {
  const { cur } = useCalcCurrency();
  return <label className="av3-field" style={{ width: w }}>
    <span className="av3-field-label">{label}{hint ? <span style={{ color: "var(--av3-subtle)", fontWeight: 400 }}> · {hint}</span> : null}</span>
    <input className="av3-input" type="number" step="0.01" value={+convertFromGrosze(Math.round(grosze), cur).toFixed(2)} readOnly={readOnly} disabled={readOnly} onChange={readOnly ? undefined : (e) => onChange(convertToGrosze(Number(e.target.value) || 0, cur))} />
  </label>;
}
function P({ label, frac, onChange, w = 110, readOnly = false, hint }: { label: string; frac: number; onChange: (f: number) => void; w?: number; readOnly?: boolean; hint?: string }) {
  return <label className="av3-field" style={{ width: w }}>
    <span className="av3-field-label">{label}{hint ? <span style={{ color: "var(--av3-subtle)", fontWeight: 400 }}> · {hint}</span> : null}</span>
    <input className="av3-input" type="number" step="0.1" value={+(frac * 100).toFixed(2)} readOnly={readOnly} disabled={readOnly} title={readOnly ? "Derived from dish recipes — switch to the Custom scenario to edit" : undefined} onChange={readOnly ? undefined : (e) => onChange((Number(e.target.value) || 0) / 100)} />
  </label>;
}
function N({ label, value, onChange, w = 110, step = 1 }: { label: string; value: number; onChange: (n: number) => void; w?: number; step?: number }) {
  return <label className="av3-field" style={{ width: w }}><span className="av3-field-label">{label}</span><input className="av3-input" type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} /></label>;
}
function AttachRow({ label, lever, onToggle, onChange }: { label: string; lever?: SimulationAttachLever; onToggle: (on: boolean) => void; onChange: (patch: Partial<SimulationAttachLever>) => void }) {
  const on = !!lever && lever.enabled !== false;
  return (
    <div className="av3-leverrow">
      <Switch aria-label={label} checked={on} onChange={onToggle} />
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
// Neapolitan restaurant service day is a lunch + (bigger) dinner double-peak. Returns
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

// Auto-roster: staple each line's headcount into staggered per-person shifts
// that track the demand curve. Greedy — each next person takes the L-hour block
// that maximises Σ demand ÷ (already-scheduled staff + 1), so people pile onto
// the busy, under-covered hours (peak) and thin out over the quiet shoulders,
// instead of everyone sitting on the floor all day. Cost is unchanged (still
// headcount × hoursPerWeek); this only shapes *when* they're on.
function rosterToDemand(labor: SimulationLaborLine[], openHour: number, closeHour: number): SimulationLaborLine[] {
  const H = Math.max(1, closeHour - openHour);
  const weights = demandWeights(H);
  const L = Math.min(H, Math.max(4, Math.round(H * 0.6)));
  const out = labor.map((l) => {
    const N = Math.max(0, Math.round(l.headcount));
    if (N === 0) return { ...l, shifts: [] as { start: number; end: number }[] };
    if (L >= H) return { ...l, shifts: Array.from({ length: N }, () => ({ start: openHour, end: closeHour })) };
    const cov = new Array(H).fill(0);
    const shifts: { start: number; end: number }[] = [];
    for (let p = 0; p < N; p++) {
      let bestStart = openHour;
      let best = -Infinity;
      for (let st = openHour; st <= closeHour - L; st++) {
        let score = 0;
        for (let h = st; h < st + L; h++) score += weights[h - openHour] / (cov[h - openHour] + 1);
        if (score > best) { best = score; bestStart = st; }
      }
      for (let h = bestStart; h < bestStart + L; h++) cov[h - openHour]++;
      shifts.push({ start: bestStart, end: bestStart + L });
    }
    return { ...l, shifts };
  });
  // Skeleton coverage: never leave the floor empty while open. Any hour that
  // ended up with zero staff gets the nearest existing shift stretched to
  // swallow it (fewest added hours). Always satisfiable when ≥1 person exists.
  const allShifts = out.flatMap((l) => l.shifts ?? []);
  if (allShifts.length > 0) {
    const totalCov = () => {
      const c = new Array(H).fill(0);
      for (const sh of allShifts) for (let h = Math.max(openHour, sh.start); h < Math.min(closeHour, sh.end); h++) c[h - openHour]++;
      return c;
    };
    let cov = totalCov();
    for (let i = 0; i < H; i++) {
      if (cov[i] > 0) continue;
      const hour = openHour + i;
      let target: { start: number; end: number } | null = null;
      let bestDist = Infinity;
      let mode: "start" | "end" = "start";
      for (const sh of allShifts) {
        if (sh.start > hour && sh.start - hour < bestDist) { bestDist = sh.start - hour; target = sh; mode = "start"; }
        else if (sh.end <= hour && hour + 1 - sh.end < bestDist) { bestDist = hour + 1 - sh.end; target = sh; mode = "end"; }
      }
      if (target) { if (mode === "start") target.start = hour; else target.end = hour + 1; cov = totalCov(); }
    }
  }
  return out;
}

// Menu scenarios — named archetypes (mirrors the v2 MENU_SCENARIOS model).
// Applying one loads a full input set (volume / days / ticket / COGS + the six
// attach % values, preserving each lever's enabled state). Operator edits to a
// scenario persist as scenario.menuScenarioOverrides[id], overlaid on the baked
// preset, so the same saved overrides round-trip between v2 and v3.
interface MenuScenarioPreset {
  id: string; name: string; emoji: string; description: string;
  ordersPerDay: number; daysOpenPerMonth: number; avgTicketGrosze: number; cogsPct: number;
  attach: { coffee: number; dessert: number; antipasti: number; aperitivo: number; premiumToppings: number; pastaPrimo: number };
}
const MENU_SCENARIOS: MenuScenarioPreset[] = [
  { id: "takeaway", name: "Takeaway classic", emoji: "🍕", description: "Quick pizza orders, minimal sides. High volume, low ticket — grab + go.", ordersPerDay: 100, daysOpenPerMonth: 28, avgTicketGrosze: 4500, cogsPct: 0.30, attach: { coffee: 0.15, dessert: 0.05, antipasti: 0.03, aperitivo: 0, premiumToppings: 0.10, pastaPrimo: 0 } },
  { id: "balanced", name: "Balanced (default)", emoji: "🍝", description: "Pizza + pasta + drinks + dessert mix, dine-in led. The Warsaw 2026 restaurant baseline.", ordersPerDay: 110, daysOpenPerMonth: 30, avgTicketGrosze: 8500, cogsPct: 0.30, attach: { coffee: 0.25, dessert: 0.12, antipasti: 0.08, aperitivo: 0.10, premiumToppings: 0.15, pastaPrimo: 0.18 } },
  { id: "premium", name: "Premium / Specialty", emoji: "✨", description: "High-end pizzas + premium toppings + pasta primo. Lower volume, higher ticket.", ordersPerDay: 85, daysOpenPerMonth: 30, avgTicketGrosze: 11000, cogsPct: 0.32, attach: { coffee: 0.30, dessert: 0.25, antipasti: 0.18, aperitivo: 0.20, premiumToppings: 0.35, pastaPrimo: 0.30 } },
  { id: "family", name: "Family / Group", emoji: "👨‍👩‍👧", description: "Multi-pizza orders for groups. Big tickets, fewer orders — weekend / event.", ordersPerDay: 30, daysOpenPerMonth: 26, avgTicketGrosze: 15500, cogsPct: 0.28, attach: { coffee: 0.10, dessert: 0.25, antipasti: 0.20, aperitivo: 0.05, premiumToppings: 0.15, pastaPrimo: 0.15 } },
  { id: "aperitivo", name: "Aperitivo / Dinner", emoji: "🍷", description: "Drinks-led evening service. Best margin — requires alcohol licence.", ordersPerDay: 45, daysOpenPerMonth: 28, avgTicketGrosze: 8200, cogsPct: 0.26, attach: { coffee: 0.20, dessert: 0.20, antipasti: 0.25, aperitivo: 0.45, premiumToppings: 0.20, pastaPrimo: 0.20 } },
];
const CUSTOM_PRESET: MenuScenarioPreset = { id: "custom", name: "Custom", emoji: "✏️", description: "Build your own — apply, tweak any field, then Save to persist it here.", ordersPerDay: 90, daysOpenPerMonth: 30, avgTicketGrosze: 8000, cogsPct: 0.30, attach: { coffee: 0.20, dessert: 0.10, antipasti: 0.05, aperitivo: 0, premiumToppings: 0.10, pastaPrimo: 0.10 } };
const MENU_SCENARIOS_ALL = [...MENU_SCENARIOS, CUSTOM_PRESET];
// The five baked archetypes lock Food-cost-% + Waste-% to the dish-derived
// values; only the Custom scenario lets the operator hand-edit them.
const NAMED_PRESET_IDS = new Set(MENU_SCENARIOS.map((s) => s.id));
const MENU_SCENARIO_BY_ID = new Map(MENU_SCENARIOS_ALL.map((s) => [s.id, s]));
const ATTACH_OF: Record<keyof MenuScenarioPreset["attach"], AttachKey> = { coffee: "coffeeAttach", dessert: "dessertAttach", antipasti: "antipastiAttach", aperitivo: "aperitivoAttach", premiumToppings: "premiumToppingsAttach", pastaPrimo: "pastaPrimoAttach" };
// Overlay the operator's saved override (if any) on top of the baked preset.
function resolveScenarioPreset(id: string, overrides?: Record<string, SimulationMenuScenarioOverride>): MenuScenarioPreset {
  const base = MENU_SCENARIO_BY_ID.get(id) ?? CUSTOM_PRESET;
  const ovr = overrides?.[id];
  return ovr ? { ...base, ordersPerDay: ovr.ordersPerDay, daysOpenPerMonth: ovr.daysOpenPerMonth, avgTicketGrosze: ovr.avgTicketGrosze, cogsPct: ovr.cogsPct, attach: ovr.attach } : base;
}

// compact money for dense heatmap cells (grosze → "7.2k" / "320"), in display currency
function kMoney(g: number, cur: Currency): string {
  const z = convertFromGrosze(g, cur);
  return Math.abs(z) >= 1000 ? `${(z / 1000).toFixed(1)}k` : `${Math.round(z)}`;
}
interface HeatData { cells: number[][]; colHeaders: string[]; rowHeaders: string[]; centerRow: number; centerCol: number }
function Heatmap({ data }: { data: HeatData }) {
  const { cur, money } = useCalcCurrency();
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
              return <div key={ci} className={`av3-heat-cell ${center ? "is-center" : ""}`} style={{ background: bg }} title={money(v)}>{kMoney(v, cur)}</div>;
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export function CalculatorV3() {
  const [scn, setScn] = useState<SimulationScenario | null>(null);
  // Dish-derived food cost + waste (menu mix weighted, ex-waste split) — the
  // source of truth for the two levers in every scenario except Custom.
  const [dishCost, setDishCost] = useState<{ foodCostPct: number; wastePct: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pnlDetailed, setPnlDetailed] = useState(false);

  const load = useCallback(async () => {
    const [d, act] = await Promise.all([
      fetch("/api/admin/simulation").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/admin/simulation/actuals?days=90").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      // Hydrate the currency module's rate table from the operator's settings
      // (setExchangeRates side-effect) so non-PLN display uses real FX, not just
      // the build-time defaults. Best-effort — falls back to DEFAULT_RATES.
      fetchPublicSettings().catch(() => null),
    ]);
    const dc = act && typeof act.weightedCogsPct === "number" && act.weightedCogsPct > 0
      ? { foodCostPct: act.weightedFoodCostPct ?? act.weightedCogsPct, wastePct: act.weightedWastePct ?? 0 }
      : null;
    setDishCost(dc);
    // A named preset draws food cost + waste from dishes — sync the stored
    // scenario so what's saved matches what's shown and computed.
    const scenario = d && dc && NAMED_PRESET_IDS.has(d.menuScenario ?? "")
      ? { ...d, cogsPct: dc.foodCostPct, wastePct: dc.wastePct }
      : d;
    setScn(scenario); setLoading(false); setDirty(false);
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
  const patchPremises = (over: Partial<SimulationPremises>) => setScn((s) => { if (!s || !s.premises) return s; setDirty(true); return { ...s, premises: { ...s.premises, ...over } }; });
  // Opening hours own the service window; keep kitchenCapacity.openHoursPerDay in
  // sync so the capacity-utilisation math and the demand curve agree.
  const patchOpeningHours = (over: Partial<{ openHour: number; closeHour: number }>) => setScn((s) => {
    if (!s) return s; setDirty(true);
    const oh = { openHour: 11, closeHour: 22, ...(s.openingHours ?? {}), ...over };
    const openHoursPerDay = Math.max(1, oh.closeHour - oh.openHour);
    return { ...s, openingHours: oh, kitchenCapacity: s.kitchenCapacity ? { ...s.kitchenCapacity, openHoursPerDay } : s.kitchenCapacity };
  });
  // Roster actions — stagger everyone to the demand curve, revert to flat, or
  // break one line's headcount into hand-editable per-person shifts.
  const autoRoster = () => setScn((s) => { if (!s) return s; setDirty(true); const oh = s.openingHours ?? { openHour: 11, closeHour: 22 }; return { ...s, labor: rosterToDemand(s.labor, Math.floor(oh.openHour), Math.ceil(oh.closeHour)) }; });
  const clearRoster = () => setScn((s) => { if (!s) return s; setDirty(true); return { ...s, labor: s.labor.map((l) => ({ ...l, shifts: undefined })) }; });
  const individualiseLine = (i: number) => setScn((s) => { if (!s) return s; setDirty(true); const oh = s.openingHours ?? { openHour: 11, closeHour: 22 }; return { ...s, labor: s.labor.map((l, idx) => { if (idx !== i) return l; const start = Number.isFinite(l.startHour) ? (l.startHour as number) : Math.floor(oh.openHour); const end = Number.isFinite(l.endHour) ? (l.endHour as number) : Math.ceil(oh.closeHour); return { ...l, shifts: Array.from({ length: Math.max(0, Math.round(l.headcount)) }, () => ({ start, end })) }; }) }; });
  const patchLaborShift = (i: number, si: number, over: Partial<{ start: number; end: number }>) => setScn((s) => { if (!s) return s; setDirty(true); return { ...s, labor: s.labor.map((l, idx) => idx !== i ? l : { ...l, shifts: (l.shifts ?? []).map((sh, sj) => sj === si ? { ...sh, ...over } : sh) }) }; });

  // Display currency — the canonical model stays in PLN grosze; `money` reformats
  // every amount at the operator's FX rate, and the Z inputs reparse back to grosze.
  const cur: Currency = (scn?.displayCurrency ?? "PLN") as Currency;
  const money = useCallback((g: number) => formatPriceInCurrency(g, cur), [cur]);

  // A named preset locks Food-cost-% + Waste-% to the dish-derived values;
  // only Custom (or a scenario with no preset yet) lets the operator edit them.
  const foodWasteLocked = !!scn && NAMED_PRESET_IDS.has(scn.menuScenario ?? "");
  const effCogsPct = foodWasteLocked && dishCost ? dishCost.foodCostPct : (scn?.cogsPct ?? 0);
  const effWastePct = foodWasteLocked && dishCost ? dishCost.wastePct : (scn?.wastePct ?? 0);
  // Scenario as the engine should see it: when locked, override cogs/waste with
  // the dish-derived split so the whole P&L reflects the real menu, not a stale
  // stored guess. Everything downstream computes off this.
  const scnEff = useMemo<SimulationScenario | null>(() => {
    if (!scn) return null;
    const withDish = foodWasteLocked && dishCost ? { ...scn, cogsPct: dishCost.foodCostPct, wastePct: dishCost.wastePct } : scn;
    // Fold the rent-vs-buy decision into rent / mortgage interest / building
    // depreciation / property costs + setup cost so the whole P&L reflects it.
    return applyPremises(withDish);
  }, [scn, foodWasteLocked, dishCost]);
  // Derived premises economics for the readout in the Premises card.
  const prem = useMemo(() => (scn?.premises ? computePremises(scn.premises) : null), [scn?.premises]);

  // Fold the behaviour levers + annual weather into the headline scenario so
  // the P&L / tornado / returns reflect them (rule #8 — end-to-end). The
  // projection applies weather per-month itself, so it takes the
  // assumptions-folded (but not annual-weather) scenario.
  const folded = useMemo(() => (scnEff ? applyAnnualWeather(applyAssumptions(scnEff)) : null), [scnEff]);
  const c = useMemo(() => (folded ? computeScenario(folded) : null), [folded]);
  const tornado = useMemo(() => (folded ? computeTornado(folded) : []), [folded]);
  const maxSwing = Math.max(1, ...tornado.map((t) => t.totalSwing));
  // Investor returns are a *cash* view: in buy mode the mortgage principal is a
  // real monthly cash outflow that accrual net profit doesn't capture (it only
  // deducts interest), so net it out of the stream or a financed purchase looks
  // artificially strong. Rent mode / cash purchase → principal is 0, no change.
  const ret = useMemo(() => {
    if (!scnEff || !c) return null;
    const principal = scnEff.premises?.mode === "buy" && prem ? prem.mortgagePrincipalMonthlyGrosze : 0;
    return computeReturns(c.netProfit - principal, scnEff.setupCostGrosze ?? 0, 24);
  }, [scnEff, c, prem]);
  const projection = useMemo(() => (scnEff ? projectTwelveMonths(applyAssumptions(scnEff)) : []), [scnEff]);
  // Channel economics + fleet read the RAW scenario (pre-assumptions) so the
  // on-site card rate isn't the blended one (matches v2).
  const channels = useMemo(() => (scnEff ? computeChannelEconomics(scnEff) : []), [scnEff]);
  const fleet = useMemo(() => (scnEff ? computeFleetEconomics(scnEff, scnEff.setupCostGrosze ?? 0) : null), [scnEff]);

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
      rowHeaders: rowMults.map((m) => money(Math.round(folded.avgTicketGrosze * m))),
      centerCol: MULTS.indexOf(1), centerRow: rowMults.indexOf(1),
    };
  }, [folded, MULTS, money]);
  const foodTicketHeat = useMemo(() => {
    if (!folded) return null;
    // rows = COGS % (low→high so profit falls going down), cols = avg ticket
    const cogsRows = [-0.06, -0.04, -0.02, 0, 0.02, 0.04, 0.06];
    const cells = cogsRows.map((d) => MULTS.map((cm) =>
      computeScenario({ ...folded, cogsPct: Math.max(0, folded.cogsPct + d), avgTicketGrosze: Math.round(folded.avgTicketGrosze * cm) }).netProfit));
    return {
      cells,
      colHeaders: MULTS.map((m) => money(Math.round(folded.avgTicketGrosze * m))),
      rowHeaders: cogsRows.map((d) => `${((folded.cogsPct + d) * 100).toFixed(0)}%`),
      centerCol: MULTS.indexOf(1), centerRow: cogsRows.indexOf(0),
    };
  }, [folded, MULTS, money]);

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

  // apply a named scenario → load its full input set (attach % only; enabled
  // state preserved, matching v2) and mark it active
  const applyMenuScenario = (p: MenuScenarioPreset) => setScn((s) => {
    if (!s) return s; setDirty(true);
    const a: SimulationAssumptions = { ...(s.assumptions ?? {}) };
    (Object.keys(p.attach) as (keyof MenuScenarioPreset["attach"])[]).forEach((k) => {
      const ak = ATTACH_OF[k];
      a[ak] = { ...(s.assumptions?.[ak] ?? ATTACH_DEFAULTS[ak]), attachPct: p.attach[k] };
    });
    // Food cost + waste are dish-sourced, not baked into the preset — seed them
    // from the live dish mix (Custom then lets the operator diverge).
    const cogsPct = dishCost ? dishCost.foodCostPct : s.cogsPct;
    const wastePct = dishCost ? dishCost.wastePct : (s.wastePct ?? 0);
    return { ...s, menuScenario: p.id, ordersPerDay: p.ordersPerDay, daysOpenPerMonth: p.daysOpenPerMonth, avgTicketGrosze: p.avgTicketGrosze, cogsPct, wastePct, assumptions: a };
  });
  // capture the current live inputs into this scenario's override
  const saveScenarioOverride = (id: string) => setScn((s) => {
    if (!s) return s; setDirty(true);
    const att = s.assumptions ?? {};
    const override: SimulationMenuScenarioOverride = {
      ordersPerDay: s.ordersPerDay, daysOpenPerMonth: s.daysOpenPerMonth, avgTicketGrosze: s.avgTicketGrosze, cogsPct: s.cogsPct,
      attach: {
        coffee: att.coffeeAttach?.attachPct ?? 0, dessert: att.dessertAttach?.attachPct ?? 0, antipasti: att.antipastiAttach?.attachPct ?? 0,
        aperitivo: att.aperitivoAttach?.attachPct ?? 0, premiumToppings: att.premiumToppingsAttach?.attachPct ?? 0, pastaPrimo: att.pastaPrimoAttach?.attachPct ?? 0,
      },
    };
    return { ...s, menuScenario: id, menuScenarioOverrides: { ...(s.menuScenarioOverrides ?? {}), [id]: override } };
  });
  // drop a scenario's override (revert to the baked preset)
  const resetScenarioOverride = (id: string) => setScn((s) => {
    if (!s || !s.menuScenarioOverrides) return s; setDirty(true);
    const next = { ...s.menuScenarioOverrides }; delete next[id];
    return { ...s, menuScenarioOverrides: Object.keys(next).length ? next : undefined };
  });

  // ── oven curve & peak saturation (modelled from kitchenCapacity) ──────────
  const oven = useMemo(() => {
    if (!folded) return null;
    const cap = folded.kitchenCapacity;
    const hours = Math.max(1, Math.round(cap?.openHoursPerDay ?? 10));
    const perHourCap = cap?.pizzasPerHour ?? 0;
    const weights = demandWeights(hours);
    const hourly = weights.map((w) => folded.ordersPerDay * w);
    const peak = Math.max(...hourly);
    const startHour = Math.floor(folded.openingHours?.openHour ?? 11);
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

  // ── live shift-coverage grid: staff on the floor per hour vs demand ───────
  // Each labour line's shift window (start/end, default = whole service day)
  // places its headcount on the clock; per hour we sum staff by role, compare
  // the kitchen line to the demand-driven requirement, and flag peak hours + gaps.
  const coverage = useMemo(() => {
    if (!folded) return null;
    const oh = folded.openingHours ?? { openHour: 11, closeHour: 22 };
    const openHour = Math.max(0, Math.min(23, Math.floor(Number.isFinite(oh.openHour) ? oh.openHour : 11)));
    const closeHour = Math.max(openHour + 1, Math.min(30, Math.ceil(Number.isFinite(oh.closeHour) ? oh.closeHour : 22)));
    const nHours = closeHour - openHour;
    const weights = demandWeights(nHours);
    const perHourCap = folded.kitchenCapacity?.pizzasPerHour ?? 0;
    const prepMult = Math.max(0.5, folded.prepComplexityMultiplier ?? 1);
    const effCap = perHourCap / prepMult;
    const peakDemand = Math.max(1e-9, ...weights) * folded.ordersPerDay;
    // Per-person shifts (staggered roster) take precedence; otherwise the whole
    // headcount sits on the line's single window (or the full service day).
    const windowsOf = (l: SimulationLaborLine): { s: number; e: number; heads: number }[] =>
      l.shifts && l.shifts.length > 0
        ? l.shifts.map((sh) => ({ s: Math.max(openHour, Math.min(closeHour, sh.start)), e: Math.max(openHour, Math.min(closeHour, sh.end)), heads: 1 }))
        : [{
            s: Number.isFinite(l.startHour) ? Math.max(openHour, l.startHour as number) : openHour,
            e: Number.isFinite(l.endHour) ? Math.min(closeHour, l.endHour as number) : closeHour,
            heads: l.headcount,
          }];
    const roles = [...new Set(folded.labor.map((l) => l.role))];
    const hours = weights.map((w, i) => {
      const hour = openHour + i;
      const demand = folded.ordersPerDay * w;
      const perRole: Partial<Record<BusinessCostPayrollRole, number>> = {};
      let totalOn = 0;
      let kitchenOn = 0;
      for (const l of folded.labor) {
        for (const win of windowsOf(l)) {
          if (hour < win.s || hour >= win.e) continue;
          perRole[l.role] = (perRole[l.role] ?? 0) + win.heads;
          totalOn += win.heads;
          if (l.role === "pizzaiolo") kitchenOn += win.heads;
        }
      }
      const requiredKitchen = effCap > 0 ? Math.max(1, Math.ceil(demand / effCap)) : 1;
      const isPeak = demand >= 0.85 * peakDemand;
      const kitchenShort = kitchenOn < requiredKitchen;
      const covered = !kitchenShort && totalOn > 0;
      return { hour, demand, perRole, totalOn, kitchenOn, requiredKitchen, isPeak, kitchenShort, covered };
    });
    const maxDemand = Math.max(1e-9, ...hours.map((h) => h.demand));
    const maxStaff = Math.max(1, ...hours.map((h) => h.totalOn));
    const gaps = hours.filter((h) => !h.covered).map((h) => h.hour);
    const peakHours = hours.filter((h) => h.isPeak).map((h) => h.hour);
    const peakCovered = hours.filter((h) => h.isPeak).every((h) => h.covered);
    // Scheduled floor-hours/day = Σ (each window's heads × its length).
    const staffHoursPerDay = folded.labor.reduce((sum, l) => sum + windowsOf(l).reduce((a, win) => a + win.heads * Math.max(0, win.e - win.s), 0), 0);
    const rostered = folded.labor.some((l) => (l.shifts?.length ?? 0) > 0);
    return { openHour, closeHour, nHours, perHourCap: effCap, hours, roles, gaps, peakHours, peakCovered, maxDemand, maxStaff, staffHoursPerDay, rostered };
  }, [folded]);

  const save = async () => {
    if (!scn) return;
    setSaving(true);
    try { const r = await fetch("/api/admin/simulation", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(scn) }); if (r.ok) setDirty(false); } finally { setSaving(false); }
  };

  if (loading) return <SkeletonPage />;
  if (!scn || !scnEff || !c) return <div className="av3-card"><div className="av3-empty"><div className="av3-empty-title">No scenario</div><div className="av3-empty-text">The simulation scenario could not be loaded.</div></div></div>;

  // Detailed breakdowns — every child sums to its parent, all from real engine
  // output (per-role labour, per-category fixed costs, the three leakage lines,
  // and the depreciation/interest split incl. the premises components).
  const useMarketingAsCac = scnEff.marketingAsCac !== false;
  const fixedChildren = Object.entries(scnEff.fixedCosts)
    .filter(([k, v]) => (v ?? 0) !== 0 && !(useMarketingAsCac && k === "marketing"))
    .map(([k, v]) => ({ label: FIXED_COST_LABELS[k] ?? k, v: -(v as number) }));
  const isBuy = scn.premises?.mode === "buy";
  const depIntChildren = [
    { label: "Fit-out depreciation", v: -(scn.depreciationMonthlyGrosze ?? 0) },
    ...(isBuy && prem ? [{ label: "Building depreciation", v: -prem.buildingDepreciationMonthlyGrosze }] : []),
    ...(isBuy && prem ? [{ label: "Mortgage interest", v: -prem.mortgageInterestMonthlyGrosze }] : []),
    { label: "Other interest", v: -(scn.interestMonthlyGrosze ?? 0) },
  ].filter((r) => r.v !== 0);

  const pnl: { label: string; v: number; strong?: boolean; children?: { label: string; v: number }[] }[] = [
    { label: "Monthly revenue", v: c.monthlyRevenue, strong: true },
    { label: "Food cost (COGS)", v: -c.monthlyCogs },
    { label: "Labour", v: -c.laborMonthly, children: c.laborByRole.filter((r) => r.grosze !== 0).map((r) => ({ label: ROLE_LABEL[r.role], v: -r.grosze })) },
    { label: "Fixed costs", v: -c.fixedTotal, children: fixedChildren },
    { label: "Payment fees", v: -c.paymentFees },
    { label: "Waste + refunds + loyalty", v: -(c.wasteCost + c.refundLoss + c.loyaltyCost), children: [{ label: "Waste", v: -c.wasteCost }, { label: "Refunds / voids", v: -c.refundLoss }, { label: "Loyalty burn", v: -c.loyaltyCost }].filter((r) => r.v !== 0) },
    { label: "Packaging", v: -c.packagingCost },
    { label: "Marketing (CAC)", v: -c.marketingCac },
    { label: "EBITDA", v: c.ebitda, strong: true },
    { label: "Depreciation + interest", v: -(c.depreciation + c.interest), children: depIntChildren },
    { label: "CIT (tax)", v: -c.citAmount },
    { label: "Net profit / month", v: c.netProfit, strong: true },
  ];

  return (
    <CalcCurrencyCtx.Provider value={{ cur, money }}>
      <div className="av3-pagehead">
        <div>
          <h1>Calculator</h1>
          <div className="av3-pagehead-sub">P&amp;L simulator · live levers → real economics (shared engine)</div>
        </div>
        <div className="av3-pagehead-actions">
          <label className="av3-field" style={{ width: 108 }} title="Display currency — the model stays in PLN; amounts are converted at the operator's FX rate">
            <span className="av3-field-label">Currency</span>
            <select className="av3-select" value={cur} onChange={(e) => patch({ displayCurrency: e.target.value as Currency })}>
              {CALC_CURRENCIES.map((code) => <option key={code} value={code}>{code} · {CURRENCY_META[code].symbol}</option>)}
            </select>
          </label>
          <Button variant="ghost" size="sm" loading={seeding} onClick={seedFromActuals} title="Seed orders/day, ticket & COGS from the last 30 days of real orders">Seed from last 30 days</Button>
          <Button variant="ghost" size="sm" onClick={load}>Reset</Button>
          <Button variant="primary" size="sm" loading={saving} disabled={!dirty} onClick={save}>Save scenario</Button>
        </div>
      </div>

      {/* headline KPIs — each carries a five-section ⓘ explainer (Rule #12) */}
      <div className="av3-kpi-rail">
        <Kpi label="Net profit / mo" value={money(c.netProfit)} accentVar={c.netProfit >= 0 ? "--av3-c4" : "--av3-c1"} info={
          <InfoButton title="Net profit / month"
            description="The bottom line — what's left each month after every cost, including tax, is paid."
            institutional="The single number investors underwrite. For a single full-service Neapolitan restaurant a healthy steady-state net margin is 8–15% of revenue; below ~5% the unit is fragile to one bad month, above ~18% you're likely under-investing in labour or marketing. The institutional gate: net profit must clear the owner's opportunity cost of capital AND service any debt with headroom."
            plain="Say the restaurant does 280 000 zł of revenue this month. After food, labour, rent, fees, waste, D&A and CIT you keep ~40 000 zł — that's a ~14% net margin. That 40 000 zł is what actually funds your payback, a second site, or your own salary."
            tips="Pull the three biggest levers in order of leverage: lift avg ticket (attach a 9 zł espresso to 30% more orders), shave food cost 2–3pp via recipe/portion discipline, and right-size labour to volume (the labour-flex lever). Small ticket + COGS moves compound straight to the bottom line because fixed costs don't move."
            methodology="netProfit = revenue − COGS − labour − fixed − payment fees − waste − refunds − loyalty − packaging − marketing(CAC) − depreciation − interest − CIT. Computed by computeScenario() in src/lib/simulation-engine.ts from the live levers; CIT applies only to positive pre-tax profit." />
        } />
        <Kpi label="Net margin" value={`${(c.margin * 100).toFixed(1)}%`} accentVar="--av3-c4" info={
          <InfoButton title="Net margin"
            description="Net profit as a percentage of revenue — profit quality independent of scale."
            institutional="Margin is how you compare a 30-order day to a 300-order chain on equal footing. Full-service benchmark for an owner-operated restaurant is 8–15% net; franchised systems run thinner (5–10%) after royalty + fund. A margin that's high but on tiny revenue isn't a business yet; a thin margin on high revenue can still be a great cash engine."
            plain="Two restaurants each net 40 000 zł. Restaurant A did it on 280 000 zł (14%), Restaurant B on 500 000 zł (8%). Restaurant B is bigger but more fragile per złoty — a 5% cost shock erases more of its thinner margin."
            tips="Margin moves on mix, not just cost-cutting: shift volume toward high-CM items (the menu-engineering 'stars'), trim the 'dogs', and protect price (avoid blanket discounts — use targeted combos instead). Watch prime cost (below) — it's the fastest margin destroyer."
            methodology="margin = netProfit ÷ monthlyRevenue. Returns 0 when revenue is 0. Same computeScenario() pipeline as net profit." />
        } />
        <Kpi label="EBITDA / mo" value={money(c.ebitda)} accentVar="--av3-c2" info={
          <InfoButton title="EBITDA / month"
            description="Operating cash generation before financing and accounting choices — earnings before interest, tax, depreciation & amortisation."
            institutional="EBITDA is the multiple buyers pay on (a single restaurant might trade at 3–5× annual EBITDA; a proven multi-unit chain higher). It strips out how the restaurant was financed and how fast it's depreciated, so it compares operating quality across units. The gate for expansion: EBITDA must comfortably cover D&A + interest + a reinvestment buffer."
            plain="If the restaurant throws off ~54 000 zł of EBITDA a month but ~10 000 zł goes to fit-out depreciation and any loan interest, the operation is healthy even though the after-tax 'net' looks thinner — the business is generating real cash, it's just paying down its build-out."
            tips="EBITDA rises with the same operating levers as net profit (ticket, COGS, labour, fixed) but is blind to interest/D&A — so it's the cleanest scoreboard for operating decisions. To lift it, attack the controllable operating block, not the capital structure."
            methodology="ebitda = revenue − variable costs (COGS + fees + waste + refunds + loyalty + packaging + CAC) − labour − fixed. Excludes depreciation and interest by definition. computeScenario(), src/lib/simulation-engine.ts." />
        } />
        <Kpi label="Break-even / day" value={`${Math.ceil(c.breakEvenOrdersPerDay)}`} accentVar="--av3-c5" info={
          <InfoButton title="Break-even orders / day"
            description="The number of orders per operating day at which the restaurant makes exactly zero profit — every order above this is pure contribution."
            institutional="The most important survival number. Institutional view: your actual volume should sit at least 25–30% above break-even (a 'margin of safety') so a rainy week or a sick pizzaiolo doesn't tip you into a loss. If break-even is close to capacity, the model has no room to absorb shocks and shouldn't be financed."
            plain="If fixed + labour costs are ~114 000 zł/month and each order contributes ~52 zł after variable costs, you need ~2 200 orders/month ≈ 73/day just to keep the lights on. Order 74 onward is the first złoty of profit."
            tips="Lower break-even two ways: raise contribution per order (higher ticket or lower COGS — each złoty of CM1 drops the threshold), or cut fixed/labour drag (renegotiate rent, flex labour to demand). Converting a fixed cost to a variable one mechanically lowers the break-even line."
            methodology="breakEvenOrdersPerMonth = (labour + fixed) ÷ contributionPerOrder, where contributionPerOrder = avgTicket × (1 − COGS% − fees% − waste% − refund% − loyalty%). Per-day = ÷ daysOpenPerMonth. computeScenario()." />
        } />
        <Kpi label="Prime cost" value={`${(c.primeCostPct * 100).toFixed(0)}%`} accentVar="--av3-c3" info={
          <InfoButton title="Prime cost %"
            description="Food cost plus labour as a share of revenue — the two biggest controllable lines combined."
            institutional="The number every restaurant operator manages to. Industry rule of thumb: keep prime cost under 60% of revenue; 55% is excellent, above 65% the unit is structurally unprofitable no matter how busy. It's the headline because COGS and labour are where money actually leaks — rent and the rest are comparatively fixed and small."
            plain="On 280 000 zł revenue, if food is 84 000 zł (30%) and labour 83 000 zł (~30%), prime cost is 167 000 zł ≈ 60% — right at the rule-of-thumb ceiling. That leaves ~40% to cover rent, fees, marketing and profit. Let it drift past 65% and there's almost nothing left."
            tips="COGS side: tighten portioning, switch distributor offerings (the Recipes ingredient catalog), engineer the menu toward high-margin items. Labour side: schedule to the demand curve (use the hourly-throughput sandbox), cross-train so one fewer head covers a soft daypart. Track it weekly, not monthly."
            methodology="primeCostPct = (COGS + labour) ÷ revenue. COGS = revenue × cogsPct; labour from the per-role headcount × hours × rate, flexed by volume. computeScenario(), src/lib/simulation-engine.ts." />
        } />
        <Kpi label="Payback" value={c.paybackMonths != null ? `${c.paybackMonths.toFixed(1)} mo` : "—"} accentVar="--av3-c1" info={
          <InfoButton title="Payback period"
            description="How many months of steady net profit it takes to earn back the upfront setup cost."
            institutional="The headline risk metric for the build-out decision. Full-service restaurant investors look for payback inside 30–48 months; beyond ~60 months the capital is better deployed elsewhere unless there's a strategic reason. Shorter payback = lower exposure to the unknowns of a young location. Pair it with NPV/IRR (Investor Returns card) for the full picture."
            plain="If the restaurant cost 900 000 zł to build and fit out, and it nets 40 000 zł/month, you recover the cash in ~22 months — under two years before the project is truly 'in the black' on the original cheque."
            tips="Two ways to shorten it: spend less up front (lease vs buy equipment, phase the fit-out) or net more per month (every lever that lifts net profit shortens payback proportionally). A 10% net-profit improvement turns a 22-month payback into ~20 months."
            methodology="paybackMonths = setupCostGrosze ÷ monthlyNetProfit, shown only when setup cost > 0 and net profit > 0. The Investor Returns card adds the discounted view (NPV at 10/15/20% + bisected IRR). computeScenario() + computeReturns()." />
        } />
        <Kpi label="Margin of safety" value={`${(c.marginOfSafetyPct * 100).toFixed(0)}%`} accentVar={c.marginOfSafetyPct >= 0.25 ? "--av3-c4" : c.marginOfSafetyPct >= 0.1 ? "--av3-c5" : "--av3-c1"} info={
          <InfoButton title="Margin of safety"
            description="How far revenue can fall before the restaurant hits break-even — your cushion against a bad month."
            institutional="The risk buffer investors stress-test. Rule of thumb: a healthy unit runs 25–40% above break-even; below ~15% the model is fragile (one rainy fortnight tips it into a loss) and shouldn't be financed without a plan to widen it. Read it alongside break-even/day — a low margin of safety with break-even near capacity is the danger zone."
            plain="If you do 280 000 zł and break-even is ~184 000 zł, your margin of safety is (280 000 − 184 000) ÷ 280 000 ≈ 34% — revenue could drop a third before you stop making money. At 8% you're one slow week from red."
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
              <Z label="Avg ticket" grosze={scn.avgTicketGrosze} onChange={(g) => patch({ avgTicketGrosze: g })} />
              <N label="Days open / mo" value={scn.daysOpenPerMonth} onChange={(n) => patch({ daysOpenPerMonth: n })} />
              <P label="Wage infl. %/yr" frac={scn.wageInflationPct ?? 0} onChange={(f) => patch({ wageInflationPct: f })} w={120} />
              <P label="Ingred. infl. %/yr" frac={scn.ingredientInflationPct ?? 0} onChange={(f) => patch({ ingredientInflationPct: f })} w={132} />
            </div></CardBody>
          </Card>

          <Card>
            <CardHead title="Variable costs" description={foodWasteLocked ? "Food cost + waste are derived from dish recipes — switch to the Custom scenario to edit them. Payment · refund · loyalty · tax are per-revenue constants." : "Payment · refund · loyalty · tax are per-revenue constants. Food cost + waste are editable here on the Custom scenario; named presets lock them to the dish recipes."} />
            <CardBody><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <P label="Food cost %" frac={effCogsPct} onChange={(f) => patch({ cogsPct: f })} readOnly={foodWasteLocked} hint={foodWasteLocked ? "from dishes" : undefined} />
              <P label="Waste %" frac={effWastePct} onChange={(f) => patch({ wastePct: f })} readOnly={foodWasteLocked} hint={foodWasteLocked ? "from dishes" : undefined} />
              <P label="Payment %" frac={scn.paymentProcessorPct ?? 0} onChange={(f) => patch({ paymentProcessorPct: f })} />
              <P label="Refund %" frac={scn.refundPct ?? 0} onChange={(f) => patch({ refundPct: f })} />
              <P label="Loyalty %" frac={scn.loyaltyBurnPct ?? 0} onChange={(f) => patch({ loyaltyBurnPct: f })} />
              <Z label="Packaging/order" grosze={scn.packagingPerOrderGrosze ?? 0} onChange={(g) => patch({ packagingPerOrderGrosze: g })} />
              <P label="CIT (tax) %" frac={scn.citPct ?? 0} onChange={(f) => patch({ citPct: f })} />
            </div></CardBody>
          </Card>

          {/* menu scenarios — five named archetypes + Custom; apply loads a full input set, edits persist as overrides */}
          <Card>
            <CardHead title="Scenarios" description="Five menu archetypes + Custom — apply loads volume · days · ticket · attach in one click" actions={
              <InfoButton title="Scenarios"
                description="Pre-built menu archetypes (Takeaway, Balanced, Premium, Family, Aperitivo) plus a Custom slot. Applying one loads a whole input set; your edits save back onto the scenario."
                institutional="Menu shape is the highest-leverage strategic choice a food unit makes — it sets volume and ticket together. Named scenarios let you keep several coherent business cases on file (a high-volume takeaway vs a margin-rich aperitivo concept) and switch the entire model between them in one click, instead of hand-editing a dozen fields. The institutional use: underwrite each concept against the same fixed costs, capacity and dish-derived food cost to see which clears the return gate."
                plain="Tap 'Premium' and the model jumps to 85 orders/day at a 110 zł ticket with richer attach — the whole P&L, projection and heatmaps recompute. Food cost + waste stay pinned to your real dish recipes; only 'Custom' lets you hand-type them to explore a what-if. Tweak a few fields, hit Save current, and that becomes your saved case; Reset reverts it to the baked archetype."
                tips="Start from the closest archetype, fine-tune in the cards above, then Save current to keep it. Switch to Custom when you want to stress food cost or waste directly. Use Scenario comparison to band each concept and the heatmaps to test sensitivity."
                methodology="Applying writes ordersPerDay/days/ticket + the six attach % onto the scenario and sets menuScenario=id (attach enabled-state preserved). Food-cost-% + Waste-% are seeded from the dish mix (computeSimulationActuals → weightedFoodCostPct / weightedWastePct) and stay read-only on the five named presets — only Custom unlocks them. Save current captures live inputs into menuScenarioOverrides[id], overlaid by resolveScenarioPreset; Reset deletes that key. Round-trips via PUT /api/admin/simulation." />
            } />
            <CardBody>
              <div className="av3-cols-3" style={{ gap: 10 }}>
                {MENU_SCENARIOS_ALL.map((base) => {
                  const p = resolveScenarioPreset(base.id, scn.menuScenarioOverrides);
                  const active = scn.menuScenario === base.id;
                  const edited = !!scn.menuScenarioOverrides?.[base.id];
                  const custom = base.id === CUSTOM_PRESET.id;
                  return (
                    <div key={base.id} className="av3-scn-card" data-base={active} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ fontSize: 16 }}>{p.emoji}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{p.name}</span>
                        <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>{edited && <Badge tone="warn">edited</Badge>}{active && <Badge tone="brand">active</Badge>}</span>
                      </div>
                      <div className="av3-cell-muted" style={{ fontSize: 11, lineHeight: 1.35, minHeight: 30 }}>{p.description}</div>
                      <div className="mono" style={{ fontFamily: "var(--av3-mono)", fontSize: 11, color: "var(--av3-muted)" }}>{p.ordersPerDay}/day · {money(p.avgTicketGrosze)} · {custom ? "food cost editable" : "food cost from dishes"}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: "auto", paddingTop: 6, flexWrap: "wrap" }}>
                        <Button variant={active ? "primary" : "secondary"} size="sm" onClick={() => applyMenuScenario(p)}>Apply</Button>
                        <Button variant="ghost" size="sm" onClick={() => saveScenarioOverride(base.id)} title="Save current inputs into this scenario">Save current</Button>
                        {edited && <Button variant="ghost" size="sm" onClick={() => resetScenarioOverride(base.id)} title="Revert to the baked archetype">Reset</Button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Labour" actions={<Button variant="secondary" size="sm" onClick={addLabor}><Plus className="av3-btn-ico" /> Add role</Button>} />
            <CardBody style={{ paddingTop: 6 }}>
              {scn.labor.map((l, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "end", padding: "5px 0", flexWrap: "wrap" }}>
                  <label className="av3-field" style={{ width: 150 }}><span className="av3-field-label">Role</span><select className="av3-select" value={l.role} onChange={(e) => patchLabor(i, { role: e.target.value as BusinessCostPayrollRole })}>{PAYROLL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
                  <N label="Heads" value={l.headcount} onChange={(n) => patchLabor(i, { headcount: n })} w={64} />
                  <N label="Hrs/wk" value={l.hoursPerWeek} onChange={(n) => patchLabor(i, { hoursPerWeek: n })} w={72} />
                  <Z label="Rate/hr (brutto)" grosze={l.hourlyRateGrosze} onChange={(g) => patchLabor(i, { hourlyRateGrosze: g })} w={104} />
                  <N label="On @" value={l.startHour ?? (scn.openingHours?.openHour ?? 11)} onChange={(n) => patchLabor(i, { startHour: n })} w={60} />
                  <N label="Off @" value={l.endHour ?? (scn.openingHours?.closeHour ?? 22)} onChange={(n) => patchLabor(i, { endHour: n })} w={60} />
                  <button type="button" className="av3-iconbtn-sm" aria-label="Remove" onClick={() => rmLabor(i)}><X /></button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--av3-line)" }}>
                <P label="Labour flex %" frac={scn.laborVariablePct ?? 0} onChange={(f) => patch({ laborVariablePct: f })} w={110} />
                <N label="Anchor orders/day" value={scn.laborAnchorOrdersPerDay ?? scn.ordersPerDay} onChange={(n) => patch({ laborAnchorOrdersPerDay: n })} w={140} />
              </div>
            </CardBody>
          </Card>

          {/* live shift-coverage grid — sits next to Labour so you roster + check in one place */}
          {coverage && (
          <Card>
            <CardHead title="Shift plan & coverage" description="Set opening hours, roster each person's shift, and see live who's on vs demand — covered at peak or short" actions={
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Button variant="secondary" size="sm" onClick={autoRoster} title="Stagger everyone into per-person shifts that match the demand curve">Auto-roster</Button>
                {coverage.rostered && <Button variant="ghost" size="sm" onClick={clearRoster} title="Clear per-person shifts — back to flat all-day">Flat</Button>}
                <InfoButton title="Shift plan & coverage"
                description="A live, hour-by-hour roster: set the service window, schedule each person's shift (or Auto-roster to the demand curve), and the grid shows how many of each role are on the floor every hour, flagging peak hours and under-staffed gaps."
                institutional="Labour is the second-biggest controllable cost and the one operators bleed on through flat all-day staffing. The discipline is to match heads to the demand curve — thin at the lunch shoulder, doubled at the dinner peak — and the institutional gate is simple: the kitchen line must never be short at a peak hour (that's walked orders and blown tickets), and you shouldn't be paying a full brigade through a dead afternoon. A roster that's green at peak and lean off-peak is what holds labour % in the 22–28% band without wrecking service."
                plain="Say dinner peaks 19:00–21:00 at ~22 orders/hr against a ~16/hr line. The grid turns those hours red until you put a second pizzaiolo on from 18:00 — add the shift, the cells go green, and you can see you're not also paying that person through the empty 15:00 lull. Move the opening hour later and the whole curve + coverage recompute instantly."
                tips="Hit Auto-roster to stagger everyone onto the busy hours in one click, then hand-tune any person's start/end in the roster below. Watch the 'Line on/need' row — any red hour is a coverage gap; extend a shift or add heads until peak is green. Trim floor-hours where the demand bars are short to pull labour % down without touching peak service."
                methodology="Demand/hr = ordersPerDay × a documented double-peak curve over the opening window. Per hour, staff-on sums every scheduled shift (per-person `shifts`, else the line's headcount×window) whose [start,end) covers the hour; kitchen requirement = ⌈demand ÷ (pizzas-per-hour ÷ prep-complexity)⌉. Auto-roster greedily places each person's shift on the busiest under-covered block. An hour is 'covered' when pizzaioli-on ≥ requirement and someone's on; peak hours are ≥85% of peak demand. Modelling layer in CalculatorV3." />
              </div>
            } />
            <CardBody>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10, alignItems: "end" }}>
                <N label="Open @" value={scn.openingHours?.openHour ?? 11} onChange={(n) => patchOpeningHours({ openHour: n })} w={78} />
                <N label="Close @" value={scn.openingHours?.closeHour ?? 22} onChange={(n) => patchOpeningHours({ closeHour: n })} w={78} />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginLeft: 4 }}>
                  <Badge tone={coverage.gaps.length === 0 ? "ok" : "bad"}>{coverage.gaps.length === 0 ? "All hours covered" : `${coverage.gaps.length} short hr${coverage.gaps.length > 1 ? "s" : ""}: ${coverage.gaps.map((h) => `${h}:00`).join(", ")}`}</Badge>
                  <Badge tone={coverage.peakHours.length === 0 ? "neutral" : coverage.peakCovered ? "ok" : "bad"}>{coverage.peakHours.length ? `Peak ${coverage.peakHours[0]}:00–${coverage.peakHours[coverage.peakHours.length - 1] + 1}:00 ${coverage.peakCovered ? "covered" : "SHORT"}` : "No peak"}</Badge>
                  <Badge tone="neutral">{coverage.staffHoursPerDay} floor-hrs/day</Badge>
                </div>
              </div>
              <div className="av3-heat-wrap"><div style={{ display: "grid", gridTemplateColumns: `88px repeat(${coverage.nHours}, minmax(26px, 1fr))`, gap: 2 }}>
                {/* hour header — peak hours tinted */}
                <div />
                {coverage.hours.map((h) => <div key={h.hour} title={h.isPeak ? "peak hour" : undefined} style={{ textAlign: "center", fontSize: 10, fontFamily: "var(--av3-mono)", padding: "2px 0", borderRadius: 3, fontWeight: h.isPeak ? 700 : 400, color: h.isPeak ? "var(--av3-fg)" : "var(--av3-subtle)", background: h.isPeak ? "color-mix(in oklab, var(--av3-c5) 24%, transparent)" : "transparent" }}>{h.hour}</div>)}
                {/* demand/hr bars */}
                <div style={{ fontSize: 11, color: "var(--av3-muted)", display: "flex", alignItems: "center" }}>Demand/hr</div>
                {coverage.hours.map((h) => <div key={h.hour} title={`${h.hour}:00 · ${h.demand.toFixed(0)} orders/hr`} style={{ display: "flex", alignItems: "flex-end", height: 30, background: "var(--av3-s1)", borderRadius: 3 }}><div style={{ width: "100%", height: `${Math.round((h.demand / coverage.maxDemand) * 100)}%`, background: h.kitchenShort ? "var(--av3-bad)" : "var(--av3-c3)", opacity: 0.9, borderRadius: "3px 3px 0 0" }} /></div>)}
                {/* one row per role on the roster */}
                {coverage.roles.map((role) => (
                  <Fragment key={role}>
                    <div style={{ fontSize: 11, color: "var(--av3-muted)", display: "flex", alignItems: "center" }}>{ROLE_LABEL[role]}</div>
                    {coverage.hours.map((h) => { const cnt = h.perRole[role] ?? 0; const inten = cnt > 0 ? 22 + Math.round((cnt / coverage.maxStaff) * 58) : 0; return <div key={h.hour} style={{ textAlign: "center", fontSize: 11, fontFamily: "var(--av3-mono)", height: 22, lineHeight: "22px", borderRadius: 3, color: cnt > 0 ? "var(--av3-fg)" : "var(--av3-subtle)", background: cnt > 0 ? `color-mix(in oklab, var(--av3-c2) ${inten}%, var(--av3-s1))` : "var(--av3-s1)" }}>{cnt > 0 ? cnt : "·"}</div>; })}
                  </Fragment>
                ))}
                {/* total on the floor */}
                <div style={{ fontSize: 11, color: "var(--av3-muted)", display: "flex", alignItems: "center", fontWeight: 600 }}>Total on</div>
                {coverage.hours.map((h) => <div key={h.hour} style={{ textAlign: "center", fontSize: 11, fontFamily: "var(--av3-mono)", height: 22, lineHeight: "22px", fontWeight: 600 }}>{h.totalOn || "·"}</div>)}
                {/* kitchen line coverage: on / need */}
                <div style={{ fontSize: 11, color: "var(--av3-muted)", display: "flex", alignItems: "center" }}>Line on/need</div>
                {coverage.hours.map((h) => <div key={h.hour} title={`Pizzaioli on ${h.kitchenOn} · need ${h.requiredKitchen}${h.kitchenShort ? " · SHORT" : ""}`} style={{ textAlign: "center", fontSize: 10.5, fontFamily: "var(--av3-mono)", height: 22, lineHeight: "22px", borderRadius: 3, color: h.kitchenShort ? "#fff" : "var(--av3-fg)", background: h.kitchenShort ? "var(--av3-bad)" : "color-mix(in oklab, var(--av3-ok) 42%, var(--av3-s1))" }}>{h.kitchenOn}/{h.requiredKitchen}</div>)}
              </div></div>
              <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 10.5, color: "var(--av3-muted)", flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: "var(--av3-c5)", opacity: 0.5 }} /> peak hour</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: "color-mix(in oklab, var(--av3-ok) 42%, var(--av3-s1))" }} /> line covered</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: "var(--av3-bad)" }} /> line short</span>
              </div>

              {/* roster — individual per-person shifts (Auto-roster fills these; hand-tune here) */}
              <div style={{ marginTop: 12, borderTop: "1px solid var(--av3-line)", paddingTop: 10 }}>
                <div className="av3-subhead" style={{ marginTop: 0, marginBottom: 6 }}>Roster — individual shifts (24h)</div>
                {scn.labor.map((l, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "5px 0", borderBottom: "1px solid var(--av3-line)" }}>
                    <span style={{ width: 128, fontSize: 12, fontWeight: 500 }}>{ROLE_LABEL[l.role]} <span style={{ color: "var(--av3-subtle)", fontWeight: 400 }}>×{l.headcount}</span></span>
                    {l.shifts && l.shifts.length > 0 ? (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {l.shifts.map((sh, si) => (
                          <span key={si} style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "var(--av3-s1)", borderRadius: 6, padding: "2px 6px" }}>
                            <span style={{ fontSize: 10, color: "var(--av3-subtle)" }}>P{si + 1}</span>
                            <input className="av3-input" style={{ width: 42, padding: "2px 4px", textAlign: "center" }} type="number" value={sh.start} onChange={(e) => patchLaborShift(i, si, { start: Number(e.target.value) || 0 })} />
                            <span style={{ fontSize: 10, color: "var(--av3-muted)" }}>–</span>
                            <input className="av3-input" style={{ width: 42, padding: "2px 4px", textAlign: "center" }} type="number" value={sh.end} onChange={(e) => patchLaborShift(i, si, { end: Number(e.target.value) || 0 })} />
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: 11.5, color: "var(--av3-muted)", display: "inline-flex", alignItems: "center", gap: 8 }}>
                        all {l.headcount} on {(l.startHour ?? coverage.openHour)}:00–{(l.endHour ?? coverage.closeHour)}:00
                        <Button variant="ghost" size="sm" onClick={() => individualiseLine(i)}>Individualise</Button>
                      </span>
                    )}
                  </div>
                ))}
                <div style={{ fontSize: 10.5, color: "var(--av3-subtle)", marginTop: 8 }}>Each P# is one person&rsquo;s shift. <b>Auto-roster</b> staggers everyone to the demand curve; <b>Flat</b> reverts to all-day. Individual hours don&rsquo;t change pay — that&rsquo;s still headcount × hrs/wk × rate.</div>
              </div>
            </CardBody>
          </Card>
          )}

          <Card>
            <CardHead title="Fixed costs (monthly)" />
            <CardBody><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {FIXED_KEYS.map((f) => <Z key={f.key} label={f.label} grosze={(scn.fixedCosts as Record<string, number>)[f.key] ?? 0} onChange={(g) => patchFixed(f.key, g)} w={110} />)}
              <div className="av3-field" style={{ width: 150 }}><span className="av3-field-label">Marketing = CAC</span><Switch aria-label="Marketing = CAC" checked={!!scn.marketingAsCac} onChange={() => patch({ marketingAsCac: !scn.marketingAsCac })} /></div>
            </div></CardBody>
          </Card>

          {/* premises — the rent-vs-buy occupancy decision, folded into rent / mortgage / property costs + upfront cash */}
          {scn.premises && (
          <Card>
            <CardHead title="Premises" description="Rent or buy the unit — occupancy cost, mortgage, property costs, upfront cash + payback all follow from this" actions={
              <InfoButton title="Premises — rent vs buy"
                description="The single biggest capital decision behind the unit: lease the space or buy it (cash or mortgage). Everything downstream — the rent line, mortgage interest, building depreciation, property tax + upkeep, the upfront cheque and therefore payback and IRR — is derived from this one toggle."
                institutional="Occupancy is the third rail of restaurant P&Ls: institutional operators hold it under 8–10% of revenue. Renting keeps the upfront cheque small and the model asset-light (better cash-on-cash, faster payback) but the rent line is a permanent margin drag and exposes you to renewal hikes. Buying converts rent into a mortgage — the interest portion hits the P&L, the principal builds equity (a balance-sheet transfer, not an expense), and you carry property tax, structural upkeep and building depreciation — but you own an appreciating asset and fix your occupancy cost. The gate: only buy if the unit's EBITDA comfortably services the mortgage AND the tied-up down payment still clears your cost of capital versus deploying it into a second site."
                plain="Rent a prime unit at 22 000 zł/mo: 66 000 zł deposit + 834 000 zł fit-out = ~900 000 zł to open, and 22 000 zł leaves every month forever. Buy the same unit for 3.5 M zł with 30% down: ~1.05 M zł deposit + 834 000 zł fit-out = ~1.9 M zł upfront, then a ~20 000 zł/mo mortgage — of which only the interest (~15 000 zł early on) is a cost, the rest buys the building — plus property tax and a roof-and-façade upkeep line. Bigger cheque, but in year 20 you own a multi-million-złoty asset instead of a stack of rent receipts."
                tips="Renting: negotiate a rent-free fit-out period and a cap on annual indexation; a lower deposit frees working capital. Buying: a bigger down payment cuts the interest drag but slows payback — model both here and read the Investor returns card. Watch the occupancy ratio KPI; if buying pushes monthly occupancy far below a market rent, the equity build is effectively free margin."
                methodology="computePremises(): rent mode → occupancy = rent + service charge, upfront = rent×depositMonths + fit-out. Buy mode → level annuity payment M = L·r ÷ (1−(1+r)^−n) on loan L = price×(1−down%), interest levelled as (M·n−L)÷n, building depreciation = price×rate÷12, upfront = down payment + fit-out. applyPremises() folds these into fixedCosts.rent, interest, depreciation and setupCostGrosze so the whole engine sees them. src/lib/simulation-engine.ts." />
            } />
            <CardBody>
              <div className="av3-chiprow" role="tablist" style={{ marginBottom: 12 }}>
                {(["rent", "buy"] as const).map((m) => (
                  <button key={m} type="button" role="tab" aria-selected={scn.premises!.mode === m} className={`av3-chip ${scn.premises!.mode === m ? "is-active" : ""}`} onClick={() => patchPremises({ mode: m })}>{m === "rent" ? "Rent" : "Buy / mortgage"}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {scn.premises.mode === "rent" ? <>
                  <Z label="Rent / mo" grosze={scn.premises.monthlyRentGrosze} onChange={(g) => patchPremises({ monthlyRentGrosze: g })} w={120} />
                  <Z label="Service charge / mo" grosze={scn.premises.serviceChargeMonthlyGrosze} onChange={(g) => patchPremises({ serviceChargeMonthlyGrosze: g })} w={150} />
                  <N label="Deposit (months)" value={scn.premises.depositMonths} onChange={(n) => patchPremises({ depositMonths: n })} w={130} step={0.5} />
                  <Z label="Fit-out capex" grosze={scn.premises.fitoutGrosze} onChange={(g) => patchPremises({ fitoutGrosze: g })} w={130} />
                </> : <>
                  <Z label="Purchase price" grosze={scn.premises.purchasePriceGrosze} onChange={(g) => patchPremises({ purchasePriceGrosze: g })} w={140} />
                  <P label="Down payment %" frac={scn.premises.downPaymentPct} onChange={(f) => patchPremises({ downPaymentPct: f })} w={130} />
                  <P label="Mortgage rate %/yr" frac={scn.premises.mortgageRatePct} onChange={(f) => patchPremises({ mortgageRatePct: f })} w={150} />
                  <N label="Term (years)" value={scn.premises.mortgageTermYears} onChange={(n) => patchPremises({ mortgageTermYears: n })} w={110} />
                  <Z label="Property tax / yr" grosze={scn.premises.propertyTaxAnnualGrosze} onChange={(g) => patchPremises({ propertyTaxAnnualGrosze: g })} w={130} />
                  <Z label="Building upkeep / mo" grosze={scn.premises.buildingMaintenanceMonthlyGrosze} onChange={(g) => patchPremises({ buildingMaintenanceMonthlyGrosze: g })} w={150} />
                  <P label="Bldg deprec. %/yr" frac={scn.premises.buildingDepreciationPct} onChange={(f) => patchPremises({ buildingDepreciationPct: f })} w={140} />
                  <Z label="Fit-out capex" grosze={scn.premises.fitoutGrosze} onChange={(g) => patchPremises({ fitoutGrosze: g })} w={130} />
                </>}
              </div>
              {prem && (
                <div className="av3-od-grid" style={{ marginTop: 12 }}>
                  <div className="av3-od-field" title={scn.premises.mode === "buy" ? "Cash that leaves your account each month (mortgage P&I + property tax + upkeep). The P&L only expenses the interest portion — principal builds equity, so it's netted from the cash-flow returns but not from EBITDA." : "Rent + service charge — the full monthly occupancy cost, all of which hits the P&L."}><div className="k">Cash outlay / mo</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{money(prem.monthlyOccupancyGrosze)}</div></div>
                  {scn.premises.mode === "buy" && <>
                    <div className="av3-od-field"><div className="k">Mortgage P&amp;I / mo</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{money(prem.mortgagePaymentGrosze)}</div></div>
                    <div className="av3-od-field" title="Hits the P&L (the only mortgage cost that reduces net profit)."><div className="k">— interest / mo</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{money(prem.mortgageInterestMonthlyGrosze)}</div></div>
                    <div className="av3-od-field" title="Cash out, but builds equity — not a P&L cost. Netted from the cash-flow investor returns."><div className="k">— principal (equity) / mo</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{money(prem.mortgagePrincipalMonthlyGrosze)}</div></div>
                    <div className="av3-od-field"><div className="k">Building deprec. / mo</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{money(prem.buildingDepreciationMonthlyGrosze)}</div></div>
                    <div className="av3-od-field"><div className="k">Loan amount</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{money(prem.loanAmountGrosze)}</div></div>
                  </>}
                  <div className="av3-od-field"><div className="k">Upfront cash</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{money(prem.upfrontCashGrosze)}</div></div>
                </div>
              )}
            </CardBody>
          </Card>
          )}

          <Card>
            <CardHead title="Investment & capacity" description="Fit-out depreciation + non-mortgage interest (Premises adds building deprec. + mortgage interest on top); kitchen throughput ceiling" />
            <CardBody><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Z label="Fit-out deprec./mo" grosze={scn.depreciationMonthlyGrosze ?? 0} onChange={(g) => patch({ depreciationMonthlyGrosze: g })} w={140} />
              <Z label="Other interest/mo" grosze={scn.interestMonthlyGrosze ?? 0} onChange={(g) => patch({ interestMonthlyGrosze: g })} w={130} />
              {scn.kitchenCapacity && <>
                <N label="Pizzas/hr" value={scn.kitchenCapacity.pizzasPerHour} onChange={(n) => patch({ kitchenCapacity: { ...scn.kitchenCapacity!, pizzasPerHour: n } })} w={100} />
                <P label="Peak-hr share" frac={scn.kitchenCapacity.peakHourSharePct} onChange={(f) => patch({ kitchenCapacity: { ...scn.kitchenCapacity!, peakHourSharePct: f } })} w={110} />
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
                  <Switch aria-label="Combo conversion" checked={on} onChange={() => patchAssume({ comboConversion: { ...(cc ?? { pct: 0.20, addonGrosze: 2500, discountGrosze: 600, addonCogsPct: 0.25 }), enabled: !on } })} />
                  <span className="av3-lever-name">Combo conversion</span>
                  {on && cc && <><P label="%" frac={cc.pct} onChange={(f) => patchAssume({ comboConversion: { ...cc, pct: f } })} w={72} /><Z label="Add-on" grosze={cc.addonGrosze} onChange={(g) => patchAssume({ comboConversion: { ...cc, addonGrosze: g } })} w={84} /><Z label="Disc." grosze={cc.discountGrosze} onChange={(g) => patchAssume({ comboConversion: { ...cc, discountGrosze: g } })} w={84} /><P label="Add-on COGS %" frac={cc.addonCogsPct} onChange={(f) => patchAssume({ comboConversion: { ...cc, addonCogsPct: f } })} w={112} /></>}
                </div>
              ); })()}
              {(() => { const d = scn.assumptions?.deliveryShare; const on = !!d && d.enabled !== false; return (
                <div className="av3-leverrow">
                  <Switch aria-label="Delivery share" checked={on} onChange={() => patchAssume({ deliveryShare: { ...(d ?? { pct: 0.25, packagingCostGrosze: 250, extraProcessorPct: 0, avgFeeGrosze: 800 }), enabled: !on } })} />
                  <span className="av3-lever-name">Delivery share</span>
                  {on && d && <><P label="%" frac={d.pct} onChange={(f) => patchAssume({ deliveryShare: { ...d, pct: f } })} w={72} /><Z label="Packaging" grosze={d.packagingCostGrosze} onChange={(g) => patchAssume({ deliveryShare: { ...d, packagingCostGrosze: g } })} w={96} /><Z label="Fee" grosze={d.avgFeeGrosze} onChange={(g) => patchAssume({ deliveryShare: { ...d, avgFeeGrosze: g } })} w={84} /></>}
                </div>
              ); })()}
              {(() => { const cp = scn.assumptions?.cheapestPizzaShift; const on = !!cp && cp.enabled !== false; return (
                <div className="av3-leverrow">
                  <Switch aria-label="Cheapest-pizza shift" checked={on} onChange={() => patchAssume({ cheapestPizzaShift: { ...(cp ?? { pp: 10, ticketDeltaGrosze: 80, cogsDeltaGrosze: 30 }), enabled: !on } })} />
                  <span className="av3-lever-name">Cheapest-pizza shift</span>
                  {on && cp && <><N label="Shift pp" value={cp.pp} onChange={(n) => patchAssume({ cheapestPizzaShift: { ...cp, pp: n } })} w={84} /><Z label="Ticket Δ/pp" grosze={cp.ticketDeltaGrosze} onChange={(g) => patchAssume({ cheapestPizzaShift: { ...cp, ticketDeltaGrosze: g } })} w={106} /><Z label="COGS Δ/pp" grosze={cp.cogsDeltaGrosze} onChange={(g) => patchAssume({ cheapestPizzaShift: { ...cp, cogsDeltaGrosze: g } })} w={106} /></>}
                </div>
              ); })()}
            </CardBody>
          </Card>

          {/* ingredient cost stress — same lever-row look as Behaviour assumptions; each shifts COGS by share × delta */}
          <Card>
            <CardHead title="Ingredient cost stress" description="Flex a line's cost — COGS moves by its share × delta" />
            <CardBody style={{ paddingTop: 4 }}>
              {(Object.keys(INGREDIENT_LABELS) as IngKey[]).map((k) => { const lev = scn.assumptions?.ingredients?.[k]; const on = !!lev && lev.enabled !== false; const share = lev?.cogsShare ?? INGREDIENT_SHARES[k]; return (
                <div key={k} className="av3-leverrow">
                  <Switch aria-label={INGREDIENT_LABELS[k]} checked={on} onChange={() => patchAssume({ ingredients: { ...(scn.assumptions?.ingredients ?? {}), [k]: { cogsShare: share, costDeltaPct: lev?.costDeltaPct ?? 0, enabled: !on } } })} />
                  <span className="av3-lever-name">{INGREDIENT_LABELS[k]}<span style={{ color: "var(--av3-subtle)", fontWeight: 400 }}> · {Math.round(share * 100)}% COGS</span></span>
                  {on && lev && <P label="Cost Δ %" frac={lev.costDeltaPct ?? 0} onChange={(f) => patchAssume({ ingredients: { ...(scn.assumptions?.ingredients ?? {}), [k]: { ...lev, costDeltaPct: f } } })} w={96} />}
                </div>
              ); })}
            </CardBody>
          </Card>

          {/* seasonality + weather → fold into the headline ordersPerDay/daysOpen */}
          <Card>
            <CardHead title="Seasonality & weather" description="Quarterly multipliers + a calibrated weather/holiday model" />
            <CardBody>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                {SEASONS.map((s) => <P key={s.key} label={s.label} frac={(scn.seasonality ?? DEFAULT_SEASONALITY)[s.key] as number} onChange={(f) => patchSeason({ [s.key]: f } as Partial<SimulationSeasonality>)} w={96} />)}
              </div>
              <div className="av3-field-label" style={{ marginBottom: 6 }}>Per-month overrides (×, blank = use season)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(64px, 1fr))", gap: 6, marginBottom: 8 }}>
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
                    <Switch aria-label="Weather & holiday model" checked={on} onChange={() => patchWeather({ enabled: !on })} />
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
            <CardHead title="Monthly P&L" actions={
              <label className="av3-leverrow" style={{ gap: 7, padding: 0 }}>
                <Switch aria-label="Detailed P&L breakdown" checked={pnlDetailed} onChange={setPnlDetailed} />
                <span className="av3-lever-name" style={{ fontSize: 12 }}>Detailed</span>
              </label>
            } />
            <CardBody style={{ paddingTop: 6, paddingBottom: 6 }}>
              {pnl.map((r) => (
                <Fragment key={r.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--av3-line)", fontWeight: r.strong ? 700 : 400 }}>
                    <span style={{ fontSize: 12.5 }}>{r.label}</span>
                    <span className="mono" style={{ fontFamily: "var(--av3-mono)", fontSize: 12.5, color: r.v < 0 ? "var(--av3-bad)" : "var(--av3-fg)" }}>{r.v < 0 ? "−" : ""}{money(Math.abs(r.v))}</span>
                  </div>
                  {pnlDetailed && r.children && r.children.map((ch) => (
                    <div key={ch.label} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0 3px 16px", borderBottom: "1px solid var(--av3-line)" }}>
                      <span style={{ fontSize: 11.5, color: "var(--av3-muted)" }}>{ch.label}</span>
                      <span className="mono" style={{ fontFamily: "var(--av3-mono)", fontSize: 11.5, color: "var(--av3-subtle)" }}>{ch.v < 0 ? "−" : ""}{money(Math.abs(ch.v))}</span>
                    </div>
                  ))}
                </Fragment>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Unit economics" actions={
              <InfoButton title="Unit economics"
                description="The per-order and capacity vital signs — how much each order contributes and how hard the restaurant is working."
                institutional="This is where investors test whether a unit scales. True CM1/order (contribution after ALL variable costs incl. payment fees, waste, loyalty, packaging) must be solidly positive — it's the cash each incremental order generates. Healthy QSR true-CM% sits 55–70%; food cost ≤30% and labour ≤25% keep prime cost in range. Capacity used should run 60–85% at peak: below 50% the asset is under-worked, above 90% you're turning guests away and need a second unit, not more marketing."
                plain="At 85 zł avg ticket, if food + fees + waste + packaging eat ~33 zł, the order's true CM1 is ~52 zł (~63%). Do 110 orders a day and that's ~5 700 zł of daily contribution toward fixed costs and profit. If capacity used reads 92%, you're effectively sold out at peak — the next złoty of growth comes from a second site or a faster line, not discounts."
                tips="Lift true CM1 by raising ticket (attach) and trimming the variable block (distributor offerings, portioning, lower-fee channels). Pull food% and labour% down toward benchmark before chasing volume. If capacity used is low, fix demand (hours, marketing, slots); if it's pinned near 100%, invest in throughput (oven/prep) or a second unit."
                methodology="trueCm1PerOrder = avgTicket − (COGS + fees + waste + refunds + loyalty + packaging) per order; trueCM% = that ÷ avgTicket. foodCost% / labour% are those lines ÷ revenue. capacityUtilization = forecast orders ÷ (kitchen pizzas-per-hour × open hours). cash-on-cash = annual net profit ÷ setup cost. All from computeScenario(), src/lib/simulation-engine.ts." />
            } />
            <CardBody>
              <div className="av3-od-grid">
                <div className="av3-od-field"><div className="k">True CM1 / order</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{money(c.trueCm1PerOrderGrosze)}</div></div>
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
                    <td className="av3-num">{(ch.feePct * 100).toFixed(1)}%</td><td className="av3-num">{money(ch.cm1PerOrderGrosze)}</td>
                    <td className="av3-num"><Badge tone={ch.cm1PctOfTicket >= 0.6 ? "ok" : ch.cm1PctOfTicket >= 0.4 ? "warn" : "bad"}>{(ch.cm1PctOfTicket * 100).toFixed(0)}%</Badge></td>
                    <td className="av3-num">{money(Math.round(ch.monthlyContributionGrosze))}</td></tr>
                ))}</tbody>
              </table></div>
            </CardBody>
          </Card>

          {fleet && (
            <Card>
              <CardHead title="Fleet economics" description={`${fleet.unitCount} units · DMA cannibalisation, supply/commissary savings, royalty + HQ`} actions={<div style={{ display: "flex", gap: 6 }}>{fleet.supplyDiscountActive && <Badge tone="ok">supply −</Badge>}{fleet.commissaryActive && <Badge tone="ok">commissary</Badge>}</div>} />
              <CardBody>
                <div className="av3-od-grid" style={{ marginBottom: 12 }}>
                  <div className="av3-od-field"><div className="k">Fleet revenue / mo</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{money(Math.round(fleet.totalRevenue))}</div></div>
                  <div className="av3-od-field"><div className="k">Fleet EBITDA / mo</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)", color: fleet.totalEbitda >= 0 ? "var(--av3-ok)" : "var(--av3-bad)" }}>{money(Math.round(fleet.totalEbitda))}</div></div>
                  <div className="av3-od-field"><div className="k">Avg EBITDA / unit</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{money(Math.round(fleet.avgEbitdaPerUnit))}</div></div>
                  <div className="av3-od-field"><div className="k">HQ absorption</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{(fleet.hqOverheadAbsorption * 100).toFixed(1)}%</div></div>
                  <div className="av3-od-field"><div className="k">Total build-out</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{money(Math.round(fleet.totalSetupCost))}</div></div>
                  <div className="av3-od-field"><div className="k">HQ overhead / mo</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{money(fleet.hqOverhead)}</div></div>
                </div>
                <div className="av3-table-wrap"><table className="av3-table">
                  <thead><tr><th>Unit</th><th className="av3-th-num">Revenue</th><th className="av3-th-num">EBITDA</th><th className="av3-th-num">Royalty</th><th className="av3-th-num">Build-out</th></tr></thead>
                  <tbody>{fleet.units.map((u) => (
                    <tr key={u.unitIndex}><td>#{u.unitIndex}</td><td className="av3-num">{money(Math.round(u.revenue))}</td>
                      <td className="av3-num" style={{ color: u.ebitda >= 0 ? undefined : "var(--av3-bad)" }}>{money(Math.round(u.ebitda))}</td>
                      <td className="av3-num">{money(Math.round(u.royalty))}</td><td className="av3-num">{money(Math.round(u.setupCost))}</td></tr>
                  ))}</tbody>
                </table></div>
              </CardBody>
            </Card>
          )}

          {ret && (scnEff?.setupCostGrosze ?? 0) > 0 && (
            <Card>
              <CardHead title="Investor returns" description="24-month cash-flow horizon — buy mode nets mortgage principal (debt service), not just interest" />
              <CardBody>
                <div className="av3-od-grid" style={{ marginBottom: 12 }}>
                  <div className="av3-od-field"><div className="k">NPV @ 10%</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)", color: ret.npv.r10 >= 0 ? "var(--av3-ok)" : "var(--av3-bad)" }}>{money(ret.npv.r10)}</div></div>
                  <div className="av3-od-field"><div className="k">NPV @ 15%</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)", color: ret.npv.r15 >= 0 ? "var(--av3-ok)" : "var(--av3-bad)" }}>{money(ret.npv.r15)}</div></div>
                  <div className="av3-od-field"><div className="k">NPV @ 20%</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)", color: ret.npv.r20 >= 0 ? "var(--av3-ok)" : "var(--av3-bad)" }}>{money(ret.npv.r20)}</div></div>
                  <div className="av3-od-field"><div className="k">IRR (annual)</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{ret.irrAnnualPct != null ? `${ret.irrAnnualPct.toFixed(0)}%` : "—"}</div></div>
                  <div className="av3-od-field"><div className="k">Payback</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)" }}>{ret.paybackMonth != null ? `${ret.paybackMonth} mo` : "—"}</div></div>
                  <div className="av3-od-field"><div className="k">24-mo cash</div><div className="v mono" style={{ fontFamily: "var(--av3-mono)", color: ret.cumulative[23] >= 0 ? "var(--av3-ok)" : "var(--av3-bad)" }}>{money(ret.cumulative[23])}</div></div>
                </div>
                {/* cumulative cash recovery — bars cross from red (below 0) to green */}
                <div style={{ display: "flex", alignItems: "stretch", gap: 2, height: 48 }}>
                  {ret.cumulative.map((cv, i) => {
                    const peak = Math.max(1, ...ret.cumulative.map((x) => Math.abs(x)));
                    const h = (Math.abs(cv) / peak) * 100;
                    return <div key={i} title={`Mo ${i + 1}: ${money(cv)}`} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}><div style={{ height: `${h / 2}%`, alignSelf: cv >= 0 ? "flex-start" : "flex-end", width: "100%", background: cv >= 0 ? "var(--av3-ok)" : "var(--av3-bad)", borderRadius: 2 }} /></div>;
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
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}><span>{t.label}</span><span className="mono" style={{ fontFamily: "var(--av3-mono)", color: "var(--av3-muted)" }}>±{money(Math.round(t.totalSwing / 2))}</span></div>
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
                <span style={{ color: "var(--av3-muted)" }}>Yr revenue <b style={{ color: "var(--av3-fg)" }}>{money(annualRevenue)}</b></span>
                <span style={{ color: "var(--av3-muted)" }}>Yr net <b style={{ color: annualNet >= 0 ? "var(--av3-ok)" : "var(--av3-bad)" }}>{money(annualNet)}</b></span>
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
                    <div key={r.monthIndex} title={`${r.month} · revenue ${money(r.revenue)} · net ${money(r.netProfit)}`} style={{ flex: 1, position: "relative" }}>
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
              plain="Base nets ~40 000 zł/mo. Knock volume −20%, ticket −5% and add 3pp of food cost and you're at the Conservative column — if that's still green you can weather a soft quarter. The Optimistic column shows the upside if attach and footfall both land."
              tips="If Conservative dips negative, widen the margin of safety before scaling: lift contribution per order or cut fixed drag. Use the heatmaps below to find which single lever moves the band most."
              methodology="Each column re-runs computeScenario() on the folded scenario with ordersPerDay, avgTicket and cogsPct scaled — Conservative ×0.8 / ×0.95 / +3pp, Optimistic ×1.2 / ×1.08 / −2pp. src/lib/simulation-engine.ts." />
          } />
          <CardBody>
            <div className="av3-scn">
              {archetypes.map((a) => (
                <div key={a.name} className="av3-scn-card" data-base={a.base}>
                  <div className="av3-scn-name">{a.name}{a.base && <Badge tone="brand">live</Badge>}</div>
                  <div className="av3-scn-net" style={{ color: a.net >= 0 ? "var(--av3-ok)" : "var(--av3-bad)" }}>{money(a.net)}<span style={{ fontSize: 11, color: "var(--av3-subtle)", fontWeight: 400 }}> /mo</span></div>
                  <div className="av3-scn-line"><span>Net margin</span><span className="v">{(a.margin * 100).toFixed(1)}%</span></div>
                  <div className="av3-scn-line"><span>EBITDA</span><span className="v">{money(a.ebitda)}</span></div>
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

      {oven && (
          <Card>
            <CardHead title="Oven curve & peak saturation" actions={
              <InfoButton title="Oven curve & peak saturation"
                description="Hourly order demand across the service day versus the line's sustainable pizzas-per-hour ceiling."
                institutional="Daily-average capacity is a vanity number — the binding constraint is the peak hour. If demand spikes above the oven/pizzaiolo ceiling at dinner, orders queue, tickets blow out and guests walk, no matter how slack the average looks. Institutional read: peak utilisation should sit ≤90%; sustained red means you're leaving revenue on the table and need a second oven, a faster line, or demand-shifting (slots/pre-order)."
                plain="The restaurant might average 10 orders/hr but slam 22 in the 20:00 hour against a 16/hr line — those 6 extra orders queue ~22 min and about half walk. The bars above the dashed ceiling are the orders you physically can't make in time."
                tips="Three fixes: raise the ceiling (second oven, prep-ahead dough, an extra pair of hands at peak — see the shift plan), or flatten demand (timed slots, pre-order, a happy-hour to pull the lunch shoulder), or cap delivery during the dinner rush. Each red hour is direct lost contribution."
                methodology="Hourly orders = ordersPerDay × a documented double-peak demand shape over kitchenCapacity.openHoursPerDay; ceiling = kitchenCapacity.pizzasPerHour. Peak wait ≈ (peakExcess ÷ ceiling) × 60 min; lost/mo = Σ over-ceiling × 50% balk × daysOpen. Modelling layer in CalculatorV3 over the scenario inputs." />
            } />
            <CardBody>
              {(() => {
                const H = 120; const scale = Math.max(oven.peak, oven.perHourCap) * 1.1 || 1;
                const capPct = (oven.perHourCap / scale) * 100;
                return (
                  <>
                    <div className="av3-kpi-rail" style={{ marginBottom: 12 }}>
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
      )}

      {/* real-data sandboxes — independent of the hypothetical scenario above */}
      <SimSandboxes />

      <div style={{ fontSize: 11.5, color: "var(--av3-subtle)" }}>
        Engine: <code>src/lib/simulation-engine.ts</code> (shared, pure). The sandboxes below read <b>real orders</b>; the model above is hypothetical. Five-section ⓘ explainers (Rule #12) land next.
      </div>
    </CalcCurrencyCtx.Provider>
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
  const { money } = useCalcCurrency();
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
          <div className="av3-card" style={{ padding: 12 }}><SkeletonRows rows={6} /></div>
        ) : tab === "cohorts" ? (
          !cohort || cohort.totalCustomers === 0 ? <div className="av3-empty"><div className="av3-empty-text">No phone-identified orders in this window.</div></div> : (
            <>
              <div className="av3-kpi-rail">
                <Kpi label="Customers" value={cohort.totalCustomers.toLocaleString("pl-PL")} accentVar="--av3-c3" />
                <Kpi label="Repeat rate" value={`${(cohort.repeatRatePct * 100).toFixed(0)}%`} accentVar="--av3-c4" />
                <Kpi label="Orders / cust" value={cohort.avgOrdersPerCustomer.toFixed(2)} accentVar="--av3-c2" />
                <Kpi label="Revenue / cust" value={money(cohort.avgRevenuePerCustomerGrosze)} accentVar="--av3-c5" />
                <Kpi label="GP / cust (LTV)" value={money(cohort.avgGpPerCustomerGrosze)} accentVar="--av3-c4" />
                <Kpi label="New / mo" value={cohort.newCustomersPerMonth.toFixed(0)} accentVar="--av3-c1" />
              </div>
              <div className="av3-subhead">New vs returning revenue</div>
              {(() => { const n = cohort.newCustomerRevenueGrosze, r = cohort.returningCustomerRevenueGrosze, tot = Math.max(1, n + r); return (
                <>
                  <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden" }}>
                    <div title={`New ${money(n)}`} style={{ width: `${(n / tot) * 100}%`, background: "var(--av3-c3)" }} />
                    <div title={`Returning ${money(r)}`} style={{ width: `${(r / tot) * 100}%`, background: "var(--av3-c4)" }} />
                  </div>
                  <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 11, color: "var(--av3-muted)" }}>
                    <span><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--av3-c3)", marginRight: 5 }} />New {money(n)} ({Math.round((n / tot) * 100)}%)</span>
                    <span><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--av3-c4)", marginRight: 5 }} />Returning {money(r)} ({Math.round((r / tot) * 100)}%)</span>
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
                  <td className="av3-num">{money(d.avgTicketGrosze)}</td><td className="av3-num">{money(d.revenueGrosze)}</td>
                  <td className="av3-num">{money(d.gpGrosze)}</td><td className="av3-num"><Badge tone={d.gpRatePct >= 0.68 ? "ok" : d.gpRatePct >= 0.6 ? "warn" : "bad"}>{(d.gpRatePct * 100).toFixed(0)}%</Badge></td></tr>
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
                    <td className="av3-num">{m.unitsSold}</td><td className="av3-num">{money(m.gpPerUnit)}</td><td className="av3-num">{money(m.trueCm1PerUnit)}</td>
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
