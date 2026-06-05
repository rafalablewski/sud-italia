/**
 * Calculator / P&L simulation engine — the pure compute core.
 *
 * Extracted from the v2 `AdminSimulation.tsx` so the admin v3 Calculator can
 * run the EXACT same real math without importing from the v2 component (which
 * stays deletable). Pure + client-safe: no React, no async, no I/O. The scenario
 * itself is persisted via GET/PUT /api/admin/simulation. (CLAUDE.md rule #1 —
 * the Calculator computes real numbers, never mocked.)
 *
 * This module is the canonical engine; the v2 component still carries an inline
 * copy that is removed when v2 is deleted at parity.
 */
import type {
  BusinessCostPayrollRole,
  SimulationScenario,
  SimulationSeasonality,
  SimulationWeather,
} from "@/data/types";

export const WEEKS_PER_MONTH = 4.345;

type Season = "winter" | "spring" | "summer" | "autumn";

/** Fallback seasonality when a scenario hasn't set its own quarterly curve. */
export const DEFAULT_SEASONALITY: SimulationSeasonality = {
  winter: 0.7,
  spring: 1.0,
  summer: 1.3,
  autumn: 1.0,
};

/** Variable-vs-fixed labor split — share of total labor that flexes with
 *  seasonal volume (the rest stays at full headcount). 0.4 means a 30% volume
 *  swing translates into a 12% labor swing, the restaurant rule of thumb. */
export const LABOR_SEASONAL_FLEX = 0.4;

export const MONTH_TO_SEASON: Season[] = [
  "winter", "winter", "spring", "spring", "spring", "summer",
  "summer", "summer", "autumn", "autumn", "autumn", "winter",
];

export const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export interface Computed {
  monthlyRevenue: number;
  monthlyCogs: number;
  laborMonthly: number;
  fixedTotal: number;
  paymentFees: number;
  /** Refund / void / comp / theft leakage — revenue × refundPct. */
  refundLoss: number;
  /** Spoilage / waste — revenue × wastePct. */
  wasteCost: number;
  /** Loyalty point burn — revenue × loyaltyBurnPct. */
  loyaltyCost: number;
  /** CIT on pre-tax profit (0 if pre-tax is negative). */
  citAmount: number;
  preTaxProfit: number;
  depreciation: number;
  interest: number;
  /** EBITDA = revenue − variable costs − labor − fixed (excl. D&A + interest). */
  ebitda: number;
  ebit: number;
  /** EBITDAR = EBITDA + rent. */
  ebitdar: number;
  netSales: number;
  occupancyRatio: number;
  cashOnCashAnnual: number | null;
  contributionPerLaborHour: number;
  promoAdjustedAvgTicket: number;
  packagingCost: number;
  marketingCac: number;
  trueCm1PerOrderGrosze: number;
  totalCost: number;
  /** Net profit AFTER tax — the bottom line. */
  netProfit: number;
  capacityOrdersPerDay: number;
  capacityUtilization: number;
  margin: number;
  breakEvenOrdersPerDay: number;
  breakEvenOrdersPerMonth: number;
  breakEvenRevenue: number;
  laborByRole: { role: BusinessCostPayrollRole; grosze: number }[];
  laborHoursPerMonth: number;
  foodCostPct: number;
  laborPct: number;
  primeCostPct: number;
  contributionMarginPct: number;
  trueContributionMarginPct: number;
  marginOfSafetyPct: number;
  revenuePerLaborHour: number;
  profitPerOrder: number;
  paybackMonths: number | null;
}

export function computeScenario(s: SimulationScenario): Computed {
  const monthlyRevenue = s.ordersPerDay * s.avgTicketGrosze * s.daysOpenPerMonth;
  const monthlyCogs = Math.round(monthlyRevenue * s.cogsPct);
  const laborAnchor = s.laborAnchorOrdersPerDay ?? s.ordersPerDay;
  const laborVariableShare = s.laborVariablePct ?? 0;
  const volumeRatio = laborAnchor > 0 ? s.ordersPerDay / laborAnchor : 1;
  const laborVolumeFlex = Math.max(0, 1 + laborVariableShare * (volumeRatio - 1));
  const laborByRole: { role: BusinessCostPayrollRole; grosze: number }[] = s.labor.map((l) => ({
    role: l.role,
    grosze: Math.round(l.headcount * l.hoursPerWeek * WEEKS_PER_MONTH * l.hourlyRateGrosze * laborVolumeFlex),
  }));
  const laborMonthly = laborByRole.reduce((sum, r) => sum + r.grosze, 0);
  const laborHoursPerMonth = s.labor.reduce((sum, l) => sum + l.headcount * l.hoursPerWeek * WEEKS_PER_MONTH, 0);
  const marketingFixed = s.fixedCosts.marketing ?? 0;
  const useMarketingAsCac = s.marketingAsCac !== false;
  const marketingCac = useMarketingAsCac ? marketingFixed : 0;
  const fixedTotal = Object.entries(s.fixedCosts).reduce((sum: number, [k, v]) => {
    if (useMarketingAsCac && k === "marketing") return sum;
    return sum + (v ?? 0);
  }, 0);
  const paymentFees = Math.round(monthlyRevenue * (s.paymentProcessorPct ?? 0));
  const wastePct = s.wastePct ?? 0;
  const refundPct = s.refundPct ?? 0;
  const loyaltyBurnPct = s.loyaltyBurnPct ?? 0;
  const citPct = s.citPct ?? 0;
  const monthlyOrdersForUnitEcon = s.ordersPerDay * s.daysOpenPerMonth;
  const wasteCost = Math.round(monthlyRevenue * wastePct);
  const refundLoss = Math.round(monthlyRevenue * refundPct);
  const loyaltyCost = Math.round(monthlyRevenue * loyaltyBurnPct);
  const packagingPerOrder = s.packagingPerOrderGrosze ?? 0;
  const packagingCost = Math.round(packagingPerOrder * monthlyOrdersForUnitEcon);
  const depreciation = s.depreciationMonthlyGrosze ?? 0;
  const interest = s.interestMonthlyGrosze ?? 0;
  const variableCostBlock = monthlyCogs + paymentFees + wasteCost + refundLoss + loyaltyCost + packagingCost + marketingCac;
  const ebitda = monthlyRevenue - variableCostBlock - laborMonthly - fixedTotal;
  const ebit = ebitda - depreciation;
  const preTaxProfit = ebit - interest;
  const totalCost = variableCostBlock + laborMonthly + fixedTotal + depreciation + interest;
  const citAmount = preTaxProfit > 0 ? Math.round(preTaxProfit * citPct) : 0;
  const netProfit = preTaxProfit - citAmount;
  const margin = monthlyRevenue > 0 ? netProfit / monthlyRevenue : 0;
  const rentMonthly = s.fixedCosts.rent ?? 0;
  const ebitdar = ebitda + rentMonthly;
  const occupancyRatio = monthlyRevenue > 0 ? rentMonthly / monthlyRevenue : 0;
  const netSales = monthlyRevenue - refundLoss;
  const marketingPerOrder = monthlyOrdersForUnitEcon > 0 ? marketingCac / monthlyOrdersForUnitEcon : 0;
  const trueCm1PerOrderGrosze =
    s.avgTicketGrosze * Math.max(0, 1 - s.cogsPct - (s.paymentProcessorPct ?? 0) - wastePct - refundPct - loyaltyBurnPct) -
    packagingPerOrder - marketingPerOrder;
  const cashOnCashAnnual = s.setupCostGrosze && s.setupCostGrosze > 0 ? (netProfit * 12) / s.setupCostGrosze : null;
  const contributionPerOrderHonest =
    s.avgTicketGrosze * Math.max(0, 1 - s.cogsPct - (s.paymentProcessorPct ?? 0) - wastePct - refundPct - loyaltyBurnPct);
  const monthlyContribution = contributionPerOrderHonest * s.ordersPerDay * s.daysOpenPerMonth;
  const contributionPerLaborHour = laborHoursPerMonth > 0 ? monthlyContribution / laborHoursPerMonth : 0;
  const promoAdjustedAvgTicket = s.avgTicketGrosze * (1 - loyaltyBurnPct);
  const contributionRatio = 1 - s.cogsPct - (s.paymentProcessorPct ?? 0);
  const trueContributionRatio = 1 - s.cogsPct - (s.paymentProcessorPct ?? 0) - wastePct - refundPct - loyaltyBurnPct;
  const contributionPerOrder = s.avgTicketGrosze * Math.max(0, trueContributionRatio);
  const fixedAndLabor = laborMonthly + fixedTotal;
  const breakEvenOrdersPerMonth = contributionPerOrder > 0 ? fixedAndLabor / contributionPerOrder : 0;
  const breakEvenOrdersPerDay = s.daysOpenPerMonth > 0 ? breakEvenOrdersPerMonth / s.daysOpenPerMonth : 0;
  const breakEvenRevenue = breakEvenOrdersPerMonth * s.avgTicketGrosze;
  const foodCostPct = monthlyRevenue > 0 ? monthlyCogs / monthlyRevenue : 0;
  const laborPct = monthlyRevenue > 0 ? laborMonthly / monthlyRevenue : 0;
  const primeCostPct = monthlyRevenue > 0 ? (monthlyCogs + laborMonthly) / monthlyRevenue : 0;
  const contributionMarginPct = Math.max(0, contributionRatio);
  const trueContributionMarginPct = Math.max(0, trueContributionRatio);
  const marginOfSafetyPct = monthlyRevenue > 0 ? (monthlyRevenue - breakEvenRevenue) / monthlyRevenue : 0;
  const revenuePerLaborHour = laborHoursPerMonth > 0 ? monthlyRevenue / laborHoursPerMonth : 0;
  const monthlyOrders = s.ordersPerDay * s.daysOpenPerMonth;
  const profitPerOrder = monthlyOrders > 0 ? netProfit / monthlyOrders : 0;
  const paybackMonths = s.setupCostGrosze && s.setupCostGrosze > 0 && netProfit > 0 ? s.setupCostGrosze / netProfit : null;
  const cap = s.kitchenCapacity;
  const prepMult = Math.max(0.5, s.prepComplexityMultiplier ?? 1);
  const capacityOrdersPerDay = cap && cap.pizzasPerHour > 0 && cap.peakHourSharePct > 0 ? cap.pizzasPerHour / cap.peakHourSharePct / prepMult : 0;
  const capacityUtilization = capacityOrdersPerDay > 0 ? s.ordersPerDay / capacityOrdersPerDay : 0;
  return {
    monthlyRevenue, monthlyCogs, laborMonthly, fixedTotal, paymentFees, refundLoss, wasteCost, loyaltyCost, citAmount,
    preTaxProfit, depreciation, interest, ebitda, ebit, ebitdar, netSales, occupancyRatio, cashOnCashAnnual,
    contributionPerLaborHour, promoAdjustedAvgTicket, packagingCost, marketingCac, trueCm1PerOrderGrosze, totalCost,
    netProfit, margin, breakEvenOrdersPerMonth, breakEvenRevenue, laborHoursPerMonth, foodCostPct, laborPct, primeCostPct,
    contributionMarginPct, trueContributionMarginPct, marginOfSafetyPct, revenuePerLaborHour, profitPerOrder, paybackMonths,
    breakEvenOrdersPerDay, laborByRole, capacityOrdersPerDay, capacityUtilization,
  };
}

export interface TornadoBar { key: string; label: string; downGrosze: number; upGrosze: number; totalSwing: number }

/**
 * One-at-a-time sensitivity for the tornado chart. Each lever is flexed
 * independently and the scenario re-computed via `computeScenario`; bars are the
 * net-profit deltas vs baseline, sorted by total swing (most fragile first).
 */
export function computeTornado(s: SimulationScenario): TornadoBar[] {
  const base = computeScenario(s).netProfit;
  const clone = (over: Partial<SimulationScenario>): SimulationScenario => ({ ...s, ...over });
  const mult = (key: keyof SimulationScenario, f: number): SimulationScenario =>
    clone({ [key]: (s[key] as number) * f } as Partial<SimulationScenario>);
  const addPp = (key: keyof SimulationScenario, pp: number): SimulationScenario =>
    clone({ [key]: ((s[key] as number) ?? 0) + pp } as Partial<SimulationScenario>);

  const bars: TornadoBar[] = [];
  const swing = (key: string, label: string, down: SimulationScenario, up: SimulationScenario) => {
    const downGrosze = base - computeScenario(down).netProfit;
    const upGrosze = computeScenario(up).netProfit - base;
    bars.push({ key, label, downGrosze, upGrosze, totalSwing: Math.abs(downGrosze) + Math.abs(upGrosze) });
  };

  swing("ordersPerDay", "Orders / day ±10%", mult("ordersPerDay", 0.9), mult("ordersPerDay", 1.1));
  swing("avgTicket", "Avg ticket ±10%", mult("avgTicketGrosze", 0.9), mult("avgTicketGrosze", 1.1));
  swing("cogsPct", "Food cost ±5pp", addPp("cogsPct", 0.05), addPp("cogsPct", -0.05));
  swing("payment", "Payment fee ±10%", mult("paymentProcessorPct", 1.1), mult("paymentProcessorPct", 0.9));
  swing("waste", "Waste ±1pp", addPp("wastePct", 0.01), addPp("wastePct", -0.01));
  swing("refund", "Refunds ±1pp", addPp("refundPct", 0.01), addPp("refundPct", -0.01));
  swing("loyalty", "Loyalty burn ±1pp", addPp("loyaltyBurnPct", 0.01), addPp("loyaltyBurnPct", -0.01));
  swing("cit", "CIT 9% ↔ 19%", clone({ citPct: 0.19 }), clone({ citPct: 0.09 }));

  return bars.sort((a, b) => b.totalSwing - a.totalSwing);
}

export interface Returns {
  /** NPV (grosze) of `horizonMonths` of steady net profit minus setup, by annual discount rate. */
  npv: { r10: number; r15: number; r20: number };
  /** Annualised IRR as a percent, or null when undefined (no setup / negative cash flow). */
  irrAnnualPct: number | null;
  /** Month the cumulative cash flow first recovers the setup cost, or null. */
  paybackMonth: number | null;
  /** Cumulative cash flow (grosze) per month, m = 1..horizonMonths (starts at −setup). */
  cumulative: number[];
}

/**
 * Investor returns from a steady monthly net-profit stream against the upfront
 * setup cost. NPV uses a monthly-compounded discount; IRR is bisected on the
 * annual rate; payback is the month cumulative cash turns positive. Real math
 * over `computeScenario`'s net profit (no mocked numbers).
 */
export function computeReturns(monthlyNetProfitGrosze: number, setupGrosze: number, horizonMonths = 36): Returns {
  const npvAt = (annual: number) => {
    const d = Math.pow(1 + annual, 1 / 12);
    let v = -setupGrosze;
    for (let m = 1; m <= horizonMonths; m++) v += monthlyNetProfitGrosze / Math.pow(d, m);
    return Math.round(v);
  };
  const npv = { r10: npvAt(0.1), r15: npvAt(0.15), r20: npvAt(0.2) };

  let irrAnnualPct: number | null = null;
  if (setupGrosze > 0 && monthlyNetProfitGrosze > 0) {
    let lo = -0.9, hi = 5;
    if (npvAt(lo) * npvAt(hi) <= 0) {
      for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (npvAt(mid) > 0) lo = mid; else hi = mid; }
      irrAnnualPct = ((lo + hi) / 2) * 100;
    } else if (npvAt(hi) > 0) {
      irrAnnualPct = hi * 100; // returns exceed the search ceiling
    }
  }

  const paybackMonth = setupGrosze > 0 && monthlyNetProfitGrosze > 0 ? Math.ceil(setupGrosze / monthlyNetProfitGrosze) : null;
  const cumulative: number[] = [];
  let cum = -setupGrosze;
  for (let m = 1; m <= horizonMonths; m++) { cum += monthlyNetProfitGrosze; cumulative.push(cum); }
  return { npv, irrAnnualPct, paybackMonth, cumulative };
}

/**
 * Volume multiplier for a single month (0=Jan, 11=Dec). Rain applies
 * year-round; heatwaves fire only in Jun–Aug; the school-holiday lunch dip
 * fires only in Jul–Aug. Shared by the headline annual-average view and the
 * per-month projection so both read weather identically.
 */
export function monthVolumeMult(monthIndex: number, w: SimulationWeather | undefined): number {
  if (!w || w.enabled === false) return 1;
  let m = w.rainyShare * w.rainyDayMultiplier + (1 - w.rainyShare);
  // Heatwaves are a summer phenomenon — Jun (5), Jul (6), Aug (7).
  if (monthIndex >= 5 && monthIndex <= 7) {
    m *= w.heatwaveShare * w.heatwaveMultiplier + (1 - w.heatwaveShare);
  }
  // Polish school holidays — Jul (6) + Aug (7) only.
  if (monthIndex === 6 || monthIndex === 7) {
    m *= w.schoolHolidayLunchMultiplier;
  }
  return m;
}

/** Average volume multiplier across all 12 months — the composite for the
 *  headline "single typical month" view. */
export function averageAnnualVolumeMult(w: SimulationWeather | undefined): number {
  if (!w || w.enabled === false) return 1;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += monthVolumeMult(i, w);
  return sum / 12;
}

/** One row of the monthly projection — all money fields in grosze (canonical
 *  engine unit, formatted with `formatPrice` at the edge). */
export interface ProjectionRow {
  month: string;
  monthIndex: number;
  revenue: number;
  cogs: number;
  labor: number;
  fixed: number;
  payment: number;
  netProfit: number;
}

/**
 * Generalised monthly projection. `monthsCount` is the horizon (12 for the
 * steady-state chart, 24 for the investor payback view). Weather is composed
 * per-month so seasonal effects (heatwave only in summer, school dip only in
 * Jul/Aug) land in the right months; labor flexes with seasonal volume via
 * `LABOR_SEASONAL_FLEX`; wages + fixed costs inflate at wage CPI and COGS at
 * ingredient CPI, compounded monthly. `rampMonths` applies a linear volume
 * ramp in months [0..rampMonths) so a fresh truck doesn't hit 100% in month 1
 * (institutional reality is ~50-70-85-100% over the first ~4 months) — set to
 * 0 for the steady-state operational chart.
 */
export function projectMonths(
  s: SimulationScenario,
  monthsCount: number,
  startMonth = 0,
  rampMonths = 0,
): ProjectionRow[] {
  const seasonality = s.seasonality ?? DEFAULT_SEASONALITY;
  const w = s.weather;
  const wageMonthly = (1 + (s.wageInflationPct ?? 0)) ** (1 / 12) - 1;
  const cogsMonthly = (1 + (s.ingredientInflationPct ?? 0)) ** (1 / 12) - 1;
  const baseLaborMonthly = s.labor.reduce(
    (sum, l) => sum + l.headcount * l.hoursPerWeek * WEEKS_PER_MONTH * l.hourlyRateGrosze,
    0,
  );
  // Same marketing-as-CAC reclassification as computeScenario so the
  // projection lines up with the headline view.
  const projUseCac = s.marketingAsCac !== false;
  const projMarketing = s.fixedCosts.marketing ?? 0;
  const baseFixed = Object.entries(s.fixedCosts).reduce((sum: number, [k, v]) => {
    if (projUseCac && k === "marketing") return sum;
    return sum + (v ?? 0);
  }, 0);
  const projPackagingPerOrder = s.packagingPerOrderGrosze ?? 0;
  const rows: ProjectionRow[] = [];
  for (let i = 0; i < monthsCount; i++) {
    const monthIndex = (startMonth + i) % 12;
    const season = MONTH_TO_SEASON[monthIndex];
    // Per-month override beats the quarterly multiplier when set — matters for
    // outdoor trucks where Jan/Feb/Dec behave nothing like each other.
    const override = seasonality.monthlyOverrides?.[monthIndex];
    const seasonMult = typeof override === "number" ? override : seasonality[season];
    const weatherMult = monthVolumeMult(monthIndex, w);
    const closedDays = w?.holidayClosedDaysPerMonth ?? 0;
    const daysOpen = Math.max(0, s.daysOpenPerMonth - closedDays);
    const rampFactor = rampMonths > 0 && i < rampMonths ? (i + 1) / rampMonths : 1;
    let monthDailyOrders = s.ordersPerDay * seasonMult * weatherMult * rampFactor;
    if (w && daysOpen > 0) {
      const baseDaily = s.ordersPerDay * rampFactor;
      const peakBonus = w.holidayPeakDaysPerMonth * (w.holidayPeakMultiplier - 1) * baseDaily;
      const eventBonus = w.eventDaysPerMonth * (w.eventDayMultiplier - 1) * baseDaily;
      monthDailyOrders += (peakBonus + eventBonus) / daysOpen;
    }
    const orders = monthDailyOrders * daysOpen;
    const wageMult = (1 + wageMonthly) ** i;
    const cogsMult = (1 + cogsMonthly) ** i;
    // Labor flex = headline volume flex (ordersPerDay vs anchor) × seasonal
    // flex (this month's seasonal volume), both on the same laborVariablePct.
    const variablePct = s.laborVariablePct ?? LABOR_SEASONAL_FLEX;
    const anchor = s.laborAnchorOrdersPerDay ?? s.ordersPerDay;
    const volumeFlex = anchor > 0 ? Math.max(0, 1 + variablePct * (s.ordersPerDay / anchor - 1)) : 1;
    const seasonalFlex = 1 + variablePct * (seasonMult * rampFactor - 1);
    const laborFlex = volumeFlex * Math.max(0, seasonalFlex);
    const revenue = Math.round(orders * s.avgTicketGrosze);
    const cogs = Math.round(revenue * s.cogsPct * cogsMult);
    const labor = Math.round(baseLaborMonthly * wageMult * laborFlex);
    const fixed = Math.round(baseFixed * wageMult);
    const payment = Math.round(revenue * (s.paymentProcessorPct ?? 0));
    const waste = Math.round(revenue * (s.wastePct ?? 0));
    const refund = Math.round(revenue * (s.refundPct ?? 0));
    const loyalty = Math.round(revenue * (s.loyaltyBurnPct ?? 0));
    const packaging = Math.round(orders * projPackagingPerOrder);
    // Marketing CAC tracks the FIXED budget whether on (variable bucket) or
    // off (fixed bucket) — net effect on pre-tax is identical.
    const marketingCacRow = projUseCac ? projMarketing : 0;
    // D&A and interest stay flat — set by capital structure, not volume/CPI.
    const depreciation = s.depreciationMonthlyGrosze ?? 0;
    const interest = s.interestMonthlyGrosze ?? 0;
    const preTax = revenue - cogs - labor - fixed - payment - waste - refund - loyalty - packaging - marketingCacRow - depreciation - interest;
    const cit = preTax > 0 ? Math.round(preTax * (s.citPct ?? 0)) : 0;
    const netProfit = preTax - cit;
    rows.push({ month: MONTH_LABELS[monthIndex], monthIndex, revenue, cogs, labor, fixed, payment, netProfit });
  }
  return rows;
}

/** Project the scenario across 12 steady-state months (no opening ramp). */
export function projectTwelveMonths(s: SimulationScenario, startMonth = 0): ProjectionRow[] {
  return projectMonths(s, 12, startMonth, 0);
}
