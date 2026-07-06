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
  SimulationAttachLever,
  SimulationFleetModel,
  SimulationPremises,
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
    grosze: Math.round(l.headcount * (l.hoursPerWeek ?? 0) * WEEKS_PER_MONTH * l.hourlyRateGrosze * laborVolumeFlex),
  }));
  const laborMonthly = laborByRole.reduce((sum, r) => sum + r.grosze, 0);
  const laborHoursPerMonth = s.labor.reduce((sum, l) => sum + l.headcount * (l.hoursPerWeek ?? 0) * WEEKS_PER_MONTH, 0);
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

/* ── premises ROI vs the markets ─────────────────────────────────────────────
 * "Is it viable to run this business, or would the capital do better in the
 * S&P 500 / Nasdaq-100 / a 5% bond?" — answered per occupancy scenario over a
 * multi-year horizon. Every number is real engine output: each mode (rent /
 * mortgage / cash-buy) re-runs the full P&L, so its net profit reflects that
 * mode's rent-vs-interest-vs-nothing occupancy structure. No mocked figures. */

/** One benchmark (index fund / bond) scored against one premises scenario. */
export interface PremisesInvestmentBenchmark {
  key: "sp500" | "nasdaq100" | "bond";
  label: string;
  /** Assumed annual return, as a percent (e.g. 10 = 10%/yr). */
  annualRatePct: number;
  /** The upfront capital compounded at this rate for the horizon — what you'd
   *  have if you skipped the restaurant and bought the index/bond instead. */
  terminalCapitalGrosze: number;
  /** terminalCapital − upfront capital (pure market gain). */
  gainGrosze: number;
  /** Business terminal wealth when its free cash flow is swept into THIS same
   *  instrument each month, minus the pure-market terminal — the złoty the
   *  business adds over just buying the index. Positive → running it wins. */
  edgeGrosze: number;
  businessWins: boolean;
}

/** A full 10-year (configurable) return picture for one occupancy mode. */
export interface PremisesInvestmentScenario {
  mode: "rent" | "mortgage" | "buy";
  label: string;
  /** Operating net profit > 0 — the business at least makes money to begin with. */
  viable: boolean;
  /** Cash committed on day one (deposit / down payment / full price + fit-out). */
  upfrontCapitalGrosze: number;
  /** Accrual net profit / month under this mode (after tax, D&A, interest). */
  monthlyNetProfitGrosze: number;
  /** Free cash flow / month: net profit + non-cash depreciation − mortgage
   *  principal (the true cash the unit throws off). */
  monthlyCashFlowGrosze: number;
  /** Σ free cash flow across the horizon (flat, un-reinvested). */
  totalCashFlowGrosze: number;
  /** Market value of the building at the end of the horizon (0 when renting). */
  terminalPropertyValueGrosze: number;
  /** Mortgage still outstanding at the end of the horizon (0 rent / cash-buy). */
  terminalLoanBalanceGrosze: number;
  /** Equity you walk away holding: property − loan (owned modes) or the
   *  refundable deposit (rent). */
  terminalAssetGrosze: number;
  /** Everything you end with: Σ cash flow + terminal asset. */
  terminalWealthGrosze: number;
  /** terminalWealth − upfront capital. */
  netGainGrosze: number;
  /** terminalWealth ÷ upfront capital (e.g. 2.4 = you 2.4×'d your money). */
  moneyMultiple: number;
  /** Annualised return (IRR of the [−capital, cashflows…, +terminal] stream),
   *  as a percent — the number to compare head-to-head with the benchmark rates.
   *  null when undefined (no capital, or the stream never turns positive). */
  annualizedReturnPct: number | null;
  benchmarks: PremisesInvestmentBenchmark[];
}

export interface PremisesInvestment {
  horizonYears: number;
  horizonMonths: number;
  /** Benchmark rates actually used, as percents. */
  benchmarkRates: { sp500: number; nasdaq100: number; bond: number };
  /** rent, mortgage, buy — in that order. */
  scenarios: PremisesInvestmentScenario[];
}

/** Remaining balance of an `n`-month annuity loan after `k` payments (grosze). */
function remainingLoanBalance(loan: number, monthlyRate: number, n: number, k: number): number {
  if (loan <= 0 || k >= n) return 0;
  if (monthlyRate <= 0) return Math.round(loan * (n - k) / n);
  const g = Math.pow(1 + monthlyRate, n);
  const gk = Math.pow(1 + monthlyRate, k);
  return Math.max(0, Math.round(loan * (g - gk) / (g - 1)));
}

/** IRR (annual, as a percent) of a monthly cash-flow stream `flows` where
 *  flows[0] is the day-one outlay (negative) and flows[m] is month m. Bisected
 *  on the annual rate; null when it never crosses zero in the search band. */
function irrAnnualOfStream(flows: number[]): number | null {
  const npvAt = (annual: number) => {
    const d = Math.pow(1 + annual, 1 / 12);
    let v = 0;
    for (let m = 0; m < flows.length; m++) v += flows[m] / Math.pow(d, m);
    return v;
  };
  let lo = -0.9, hi = 5;
  const nlo = npvAt(lo), nhi = npvAt(hi);
  if (nlo * nhi > 0) return nhi > 0 ? hi * 100 : null;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (npvAt(mid) > 0) lo = mid; else hi = mid; }
  return ((lo + hi) / 2) * 100;
}

/**
 * Score all three premises scenarios (rent / mortgage / cash-buy) over the
 * horizon and pit each against the S&P 500, the Nasdaq-100 and a bond.
 *
 * This runs a REAL month-by-month simulation of the whole horizon — not a flat
 * steady-state figure multiplied out. For each mode it re-applies premises,
 * folds the behaviour levers, then `projectMonths(H)` composes seasonality,
 * weather and compounding inflation every month: labour + fixed costs (incl.
 * rent, which therefore indexes up over the decade) grow at wage CPI, COGS at
 * ingredient CPI, and menu prices at `menuPriceInflationPct` — so a rising-rent
 * lease genuinely looks worse over 10 years while a fixed-nominal mortgage
 * payment is eroded by inflation. The property appreciates at
 * `propertyAppreciationPct` (owned modes only). Every figure is engine output.
 *
 * `base` must be the scenario as the engine sees it *before* `applyPremises`
 * (rent line still flat, no folded mortgage interest / building depreciation) —
 * the function re-applies premises per mode itself, and folds assumptions +
 * annual weather internally so each mode's headline net profit matches the
 * displayed P&L. Returns null when there's no premises decision attached.
 */
export function computePremisesInvestment(
  base: SimulationScenario,
): PremisesInvestment | null {
  const p = base.premises;
  if (!p) return null;
  const horizonYears = Math.max(1, Math.round(p.investHorizonYears ?? 10));
  const H = horizonYears * 12;
  const menuInflation = Math.max(0, p.menuPriceInflationPct ?? 0);
  const rates = {
    sp500: (p.sp500RatePct ?? 0.1) * 100,
    nasdaq100: (p.nasdaq100RatePct ?? 0.13) * 100,
    bond: (p.bondRatePct ?? 0.05) * 100,
  };
  const benchDefs: { key: PremisesInvestmentBenchmark["key"]; label: string; annualPct: number }[] = [
    { key: "sp500", label: "S&P 500", annualPct: rates.sp500 },
    { key: "nasdaq100", label: "Nasdaq-100", annualPct: rates.nasdaq100 },
    { key: "bond", label: "5% bond", annualPct: rates.bond },
  ];

  const modes: { mode: "rent" | "mortgage" | "buy"; label: string }[] = [
    { mode: "rent", label: "Rent" },
    { mode: "mortgage", label: "Mortgage" },
    { mode: "buy", label: "Buy (cash)" },
  ];

  const scenarios = modes.map(({ mode, label }): PremisesInvestmentScenario => {
    const varied = applyPremises({ ...base, premises: { ...p, mode } });
    const prem = computePremises({ ...p, mode });

    // Headline steady-state month (annual-average weather) — matches the P&L /
    // Investor-returns cards, used for the display "Net profit / mo" + viability.
    const headline = computeScenario(applyAnnualWeather(applyAssumptions(varied)));
    const netProfit = headline.netProfit;

    const capital = Math.max(0, prem.upfrontCashGrosze);
    // Steady-state cash view (for the readout): net profit + non-cash
    // depreciation add-back − mortgage principal (real cash out the P&L omits).
    const monthlyCashFlow = netProfit + headline.depreciation - prem.mortgagePrincipalMonthlyGrosze;

    // ── the actual 10-year simulation ──────────────────────────────────────
    // projectMonths applies weather per-month itself, so fold ONLY assumptions
    // (not annual weather — that would double-count). Menu prices inflate at
    // menuPriceInflationPct; labour/fixed at wage CPI, COGS at ingredient CPI.
    const projScn = applyAssumptions(varied);
    const rows = projectMonths(projScn, H, 0, 0, menuInflation);
    const deprFlat = projScn.depreciationMonthlyGrosze ?? 0;
    const principalFlat = prem.mortgagePrincipalMonthlyGrosze;
    // Per-month free cash flow: the projected (inflation-aware) net profit, with
    // the flat non-cash depreciation added back and the flat principal removed.
    const fcfByMonth = rows.map((r) => r.netProfit + deprFlat - principalFlat);
    const totalCashFlow = fcfByMonth.reduce((sum, v) => sum + v, 0);

    // Terminal asset — what you still hold at the end of the horizon.
    let propertyValue = 0, loanBalance = 0, terminalAsset = 0;
    if (mode === "rent") {
      // The refundable deposit comes back; the fit-out is sunk.
      terminalAsset = Math.round(Math.max(0, p.monthlyRentGrosze ?? 0) * Math.max(0, p.depositMonths ?? 0));
    } else {
      const price = Math.max(0, p.purchasePriceGrosze ?? 0);
      propertyValue = Math.round(price * Math.pow(1 + Math.max(0, p.propertyAppreciationPct ?? 0), horizonYears));
      const n = Math.max(1, Math.round((p.mortgageTermYears ?? 0) * 12));
      loanBalance = mode === "mortgage"
        ? remainingLoanBalance(prem.loanAmountGrosze, Math.max(0, p.mortgageRatePct ?? 0) / 12, n, H)
        : 0;
      terminalAsset = Math.max(0, propertyValue - loanBalance);
    }

    const terminalWealth = totalCashFlow + terminalAsset;
    const netGain = terminalWealth - capital;
    const moneyMultiple = capital > 0 ? terminalWealth / capital : 0;

    // Annualised return — IRR of the whole cash-flow stream (outlay, the real
    // per-month free cash flow, terminal asset landed in the final month).
    const flows = new Array(H + 1).fill(0);
    flows[0] = -capital;
    for (let m = 1; m <= H; m++) flows[m] = fcfByMonth[m - 1];
    flows[H] += terminalAsset;
    const annualizedReturnPct = capital > 0 ? irrAnnualOfStream(flows) : null;

    // Per-benchmark: compound the capital vs sweeping the business's (real,
    // per-month) cash flow into the same instrument, so the edge is like-for-like.
    const benchmarks = benchDefs.map(({ key, label: blabel, annualPct }): PremisesInvestmentBenchmark => {
      const r = annualPct / 100;
      const terminalCapital = Math.round(capital * Math.pow(1 + r, horizonYears));
      let swept = terminalAsset;
      for (let m = 1; m <= H; m++) swept += fcfByMonth[m - 1] * Math.pow(1 + r, (H - m) / 12);
      const edge = Math.round(swept - terminalCapital);
      return {
        key, label: blabel, annualRatePct: annualPct,
        terminalCapitalGrosze: terminalCapital,
        gainGrosze: terminalCapital - capital,
        edgeGrosze: edge,
        businessWins: edge >= 0,
      };
    });

    return {
      mode, label,
      viable: netProfit > 0,
      upfrontCapitalGrosze: capital,
      monthlyNetProfitGrosze: netProfit,
      monthlyCashFlowGrosze: monthlyCashFlow,
      totalCashFlowGrosze: totalCashFlow,
      terminalPropertyValueGrosze: propertyValue,
      terminalLoanBalanceGrosze: loanBalance,
      terminalAssetGrosze: terminalAsset,
      terminalWealthGrosze: terminalWealth,
      netGainGrosze: netGain,
      moneyMultiple,
      annualizedReturnPct,
      benchmarks,
    };
  });

  return { horizonYears, horizonMonths: H, benchmarkRates: rates, scenarios };
}

/**
 * Volume multiplier for a single month (0=Jan, 11=Dec). Rain applies
 * year-round; heatwaves fire only in Jun–Aug; the school-holiday lunch dip
 * fires only in Jul–Aug. Shared by the headline annual-average view and the
 * per-month projection so both read weather identically.
 */
export function monthVolumeMult(monthIndex: number, w: SimulationWeather | undefined): number {
  if (!w || w.enabled === false) return 1;
  // Nullish fallbacks so a partial/legacy weather object can't leak NaN into
  // the projection (shares default to 0 = no effect; multipliers to 1).
  const rainyShare = w.rainyShare ?? 0;
  let m = rainyShare * (w.rainyDayMultiplier ?? 1) + (1 - rainyShare);
  // Heatwaves are a summer phenomenon — Jun (5), Jul (6), Aug (7).
  if (monthIndex >= 5 && monthIndex <= 7) {
    const heatwaveShare = w.heatwaveShare ?? 0;
    m *= heatwaveShare * (w.heatwaveMultiplier ?? 1) + (1 - heatwaveShare);
  }
  // Polish school holidays — Jul (6) + Aug (7) only.
  if (monthIndex === 6 || monthIndex === 7) {
    m *= w.schoolHolidayLunchMultiplier ?? 1;
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
 * ramp in months [0..rampMonths) so a fresh restaurant doesn't hit 100% in month 1
 * (institutional reality is ~50-70-85-100% over the first ~4 months) — set to
 * 0 for the steady-state operational chart.
 */
export function projectMonths(
  s: SimulationScenario,
  monthsCount: number,
  startMonth = 0,
  rampMonths = 0,
  ticketInflationPct = 0,
): ProjectionRow[] {
  const seasonality = s.seasonality ?? DEFAULT_SEASONALITY;
  const w = s.weather;
  const wageMonthly = (1 + (s.wageInflationPct ?? 0)) ** (1 / 12) - 1;
  const cogsMonthly = (1 + (s.ingredientInflationPct ?? 0)) ** (1 / 12) - 1;
  // Menu-price inflation — 0 for the steady-state 12/24-month charts (revenue
  // frozen), positive for the long-horizon premises sim so prices track cost CPI
  // instead of margins collapsing over a decade.
  const ticketMonthly = (1 + ticketInflationPct) ** (1 / 12) - 1;
  const baseLaborMonthly = s.labor.reduce(
    (sum, l) => sum + l.headcount * (l.hoursPerWeek ?? 0) * WEEKS_PER_MONTH * l.hourlyRateGrosze,
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
    // restaurants where Jan/Feb/Dec behave nothing like each other.
    const override = seasonality.monthlyOverrides?.[monthIndex];
    const seasonMult = typeof override === "number" ? override : seasonality[season];
    const weatherMult = monthVolumeMult(monthIndex, w);
    const closedDays = w?.holidayClosedDaysPerMonth ?? 0;
    const daysOpen = Math.max(0, s.daysOpenPerMonth - closedDays);
    const rampFactor = rampMonths > 0 && i < rampMonths ? (i + 1) / rampMonths : 1;
    let monthDailyOrders = s.ordersPerDay * seasonMult * weatherMult * rampFactor;
    if (w && daysOpen > 0) {
      const baseDaily = s.ordersPerDay * rampFactor;
      // Nullish fallbacks (days → 0, multipliers → 1) keep a partial weather
      // object from leaking NaN into the per-month order count.
      const peakBonus = (w.holidayPeakDaysPerMonth ?? 0) * ((w.holidayPeakMultiplier ?? 1) - 1) * baseDaily;
      const eventBonus = (w.eventDaysPerMonth ?? 0) * ((w.eventDayMultiplier ?? 1) - 1) * baseDaily;
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
    const ticketMult = (1 + ticketMonthly) ** i;
    const revenue = Math.round(orders * s.avgTicketGrosze * ticketMult);
    // COGS tracks volume × unit food cost × ingredient CPI — off the PRE-inflation
    // ticket, so raising menu prices doesn't inflate ingredient cost (no
    // double-count). Identical to before when ticketInflationPct = 0.
    const cogs = Math.round(orders * s.avgTicketGrosze * s.cogsPct * cogsMult);
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

/* ── behaviour assumptions + weather folding ───────────────────────────────
 * Extracted verbatim from the v2 AdminSimulation so v3 folds the same levers
 * into the headline P&L. `applyAssumptions` rewrites avgTicket/cogsPct/payment
 * from the attach/combo/delivery/ingredient levers; `applyAnnualWeather`
 * rewrites ordersPerDay/daysOpen from the annual-average weather curve. Pure.
 */
function leverOff(lever: { enabled?: boolean } | undefined): boolean {
  return !!lever && lever.enabled === false;
}
function attachDelta(lever: SimulationAttachLever | undefined): { ticket: number; cogs: number } {
  if (!lever || lever.enabled === false) return { ticket: 0, cogs: 0 };
  return { ticket: lever.attachPct * lever.avgPriceGrosze, cogs: lever.attachPct * lever.avgPriceGrosze * lever.cogsPct };
}

/** Fold the behaviour levers (attach, combo, cheapest-pizza shift, delivery
 *  share, ingredient stress) into effective avgTicket + cogsPct + blended
 *  payment rate. Returns a new scenario; ordersPerDay/daysOpen are untouched
 *  (weather is separate). No-op when `s.assumptions` is unset. */
export function applyAssumptions(s: SimulationScenario): SimulationScenario {
  const a = s.assumptions;
  if (!a) return s;
  let extraTicket = 0;
  let extraCogs = 0;
  let extraProcessorPct = 0;
  for (const lever of [a.coffeeAttach, a.dessertAttach, a.antipastiAttach, a.aperitivoAttach, a.premiumToppingsAttach, a.pastaPrimoAttach]) {
    const d = attachDelta(lever);
    extraTicket += d.ticket;
    extraCogs += d.cogs;
  }
  if (a.comboConversion && !leverOff(a.comboConversion)) {
    const c = a.comboConversion;
    extraTicket += c.pct * (c.addonGrosze - c.discountGrosze);
    extraCogs += c.pct * c.addonGrosze * c.addonCogsPct;
  }
  if (a.cheapestPizzaShift && !leverOff(a.cheapestPizzaShift)) {
    extraTicket -= a.cheapestPizzaShift.pp * a.cheapestPizzaShift.ticketDeltaGrosze;
    extraCogs -= a.cheapestPizzaShift.pp * a.cheapestPizzaShift.cogsDeltaGrosze;
  }
  if (a.deliveryShare && !leverOff(a.deliveryShare)) {
    const d = a.deliveryShare;
    extraTicket += d.pct * d.avgFeeGrosze;
    extraCogs += d.pct * d.packagingCostGrosze;
    extraProcessorPct += d.pct * d.extraProcessorPct;
  }
  let ingredientMultiplier = 1;
  if (a.ingredients) {
    for (const lever of Object.values(a.ingredients)) {
      if (!lever || lever.enabled === false) continue;
      ingredientMultiplier += lever.cogsShare * lever.costDeltaPct;
    }
  }
  ingredientMultiplier = Math.max(0, ingredientMultiplier);

  const newTicket = Math.max(0, s.avgTicketGrosze + extraTicket);
  const baselineCogsValue = s.avgTicketGrosze * s.cogsPct * ingredientMultiplier;
  const totalCogsValue = Math.max(0, baselineCogsValue + extraCogs);
  const newCogsPct = newTicket > 0 ? Math.min(1, totalCogsValue / newTicket) : s.cogsPct;

  // Channel-blended payment rate (cash 0% + on-site card + Glovo/Wolt commission).
  const cashShare = s.cashSharePct ?? 0;
  const glovoShare = s.glovoSharePct ?? 0;
  const woltShare = s.woltSharePct ?? 0;
  const onSiteCardShare = Math.max(0, 1 - cashShare - glovoShare - woltShare);
  const onSiteCardRate = (s.paymentProcessorPct ?? 0) + extraProcessorPct;
  const blendedProcessorPct =
    onSiteCardShare * onSiteCardRate + glovoShare * (s.glovoFeePct ?? 0) + woltShare * (s.woltFeePct ?? 0);

  return { ...s, avgTicketGrosze: newTicket, cogsPct: newCogsPct, paymentProcessorPct: Math.max(0, Math.min(1, blendedProcessorPct)) };
}

/** Derived premises economics — the monthly + upfront numbers a Rent-vs-Buy
 *  decision produces. Interest is levelled across the mortgage term (total
 *  interest ÷ months) so a single steady-state monthly figure is honest for a
 *  simulator, rather than the front-loaded first-period interest. */
export interface PremisesComputed {
  mode: "rent" | "mortgage" | "buy";
  /** All premises cash leaving the account each month (rent + service, or
   *  mortgage payment + property tax + building upkeep, or — cash-buy — just
   *  property tax + upkeep). */
  monthlyOccupancyGrosze: number;
  /** Lease cost incl. service charge (0 when buying) — feeds the rent line. */
  rentMonthlyGrosze: number;
  /** Level mortgage payment, principal + interest (0 when renting). */
  mortgagePaymentGrosze: number;
  mortgageInterestMonthlyGrosze: number;
  mortgagePrincipalMonthlyGrosze: number;
  propertyTaxMonthlyGrosze: number;
  buildingMaintenanceMonthlyGrosze: number;
  buildingDepreciationMonthlyGrosze: number;
  /** Cash needed on day one: deposit / down payment + fit-out. */
  upfrontCashGrosze: number;
  loanAmountGrosze: number;
}

export function computePremises(p: SimulationPremises): PremisesComputed {
  const fitout = Math.max(0, p.fitoutGrosze ?? 0);
  if (p.mode === "mortgage" || p.mode === "buy") {
    const price = Math.max(0, p.purchasePriceGrosze ?? 0);
    // Cash-buy finances the whole price upfront: down payment = 100%, loan = 0.
    const cash = p.mode === "buy";
    const down = cash ? price : price * Math.max(0, Math.min(1, p.downPaymentPct ?? 0));
    const loan = cash ? 0 : Math.max(0, price - down);
    const n = Math.max(1, Math.round((p.mortgageTermYears ?? 0) * 12));
    const r = Math.max(0, p.mortgageRatePct ?? 0) / 12;
    // Standard annuity payment; r=0 degenerates to straight-line repayment.
    const payment = loan > 0 ? (r > 0 ? (loan * r) / (1 - Math.pow(1 + r, -n)) : loan / n) : 0;
    const interestMonthly = loan > 0 ? Math.round((payment * n - loan) / n) : 0;
    const principalMonthly = loan > 0 ? Math.round(loan / n) : 0;
    const propertyTaxMonthly = Math.round(Math.max(0, p.propertyTaxAnnualGrosze ?? 0) / 12);
    const buildingMaint = Math.max(0, p.buildingMaintenanceMonthlyGrosze ?? 0);
    const buildingDeprMonthly = Math.round((price * Math.max(0, p.buildingDepreciationPct ?? 0)) / 12);
    return {
      mode: p.mode,
      monthlyOccupancyGrosze: Math.round(payment) + propertyTaxMonthly + buildingMaint,
      rentMonthlyGrosze: 0,
      mortgagePaymentGrosze: Math.round(payment),
      mortgageInterestMonthlyGrosze: interestMonthly,
      mortgagePrincipalMonthlyGrosze: principalMonthly,
      propertyTaxMonthlyGrosze: propertyTaxMonthly,
      buildingMaintenanceMonthlyGrosze: buildingMaint,
      buildingDepreciationMonthlyGrosze: buildingDeprMonthly,
      upfrontCashGrosze: Math.round(down + fitout),
      loanAmountGrosze: Math.round(loan),
    };
  }
  const rent = Math.max(0, p.monthlyRentGrosze ?? 0);
  const service = Math.max(0, p.serviceChargeMonthlyGrosze ?? 0);
  const deposit = rent * Math.max(0, p.depositMonths ?? 0);
  return {
    mode: "rent",
    monthlyOccupancyGrosze: rent + service,
    rentMonthlyGrosze: rent + service,
    mortgagePaymentGrosze: 0,
    mortgageInterestMonthlyGrosze: 0,
    mortgagePrincipalMonthlyGrosze: 0,
    propertyTaxMonthlyGrosze: 0,
    buildingMaintenanceMonthlyGrosze: 0,
    buildingDepreciationMonthlyGrosze: 0,
    upfrontCashGrosze: Math.round(deposit + fitout),
    loanAmountGrosze: 0,
  };
}

/** Fold the premises decision into the scenario the P&L engine sees: the rent
 *  line, mortgage interest, building depreciation, property tax + upkeep and the
 *  upfront setup cost all become dish-derived from the Rent-vs-Buy inputs.
 *  Premises interest / building depreciation stack ON TOP of any operator-set
 *  non-premises values (other loans, fit-out depreciation). No-op when unset. */
export function applyPremises(s: SimulationScenario): SimulationScenario {
  const p = s.premises;
  if (!p) return s;
  const c = computePremises(p);
  const fixedCosts = { ...s.fixedCosts };
  if (p.mode === "rent") {
    fixedCosts.rent = c.rentMonthlyGrosze;
  } else {
    // mortgage or cash-buy: no rent line; the owner carries property tax + upkeep.
    fixedCosts.rent = 0;
    fixedCosts.tax = (fixedCosts.tax ?? 0) + c.propertyTaxMonthlyGrosze;
    fixedCosts.maintenance = (fixedCosts.maintenance ?? 0) + c.buildingMaintenanceMonthlyGrosze;
  }
  return {
    ...s,
    fixedCosts,
    interestMonthlyGrosze: (s.interestMonthlyGrosze ?? 0) + c.mortgageInterestMonthlyGrosze,
    depreciationMonthlyGrosze: (s.depreciationMonthlyGrosze ?? 0) + c.buildingDepreciationMonthlyGrosze,
    setupCostGrosze: c.upfrontCashGrosze,
  };
}

/** Annualised weather effects → ordersPerDay + daysOpen for the headline view
 *  (the projection applies weather per-month instead). No-op when weather is
 *  unset or its master toggle is off. */
export function applyAnnualWeather(s: SimulationScenario): SimulationScenario {
  const w = s.weather;
  if (!w || w.enabled === false) return s;
  const avgMult = averageAnnualVolumeMult(w);
  const daysOpen = Math.max(0, s.daysOpenPerMonth - w.holidayClosedDaysPerMonth);
  let ordersPerDay = s.ordersPerDay * avgMult;
  if (daysOpen > 0) {
    const baseDaily = s.ordersPerDay;
    const peakBonus = w.holidayPeakDaysPerMonth * (w.holidayPeakMultiplier - 1) * baseDaily;
    const eventBonus = w.eventDaysPerMonth * (w.eventDayMultiplier - 1) * baseDaily;
    ordersPerDay += (peakBonus + eventBonus) / daysOpen;
  }
  return { ...s, ordersPerDay, daysOpenPerMonth: daysOpen };
}

/* ── fleet / franchise economics ───────────────────────────────────────────
 * Multi-unit model: DMA cannibalisation, supply + commissary COGS savings,
 * royalty + marketing-fund, HQ overhead absorption, and a build-out learning
 * curve. Extracted verbatim from v2. Returns null for a single unit. */
export interface FleetEconomicsRow {
  unitIndex: number;
  revenue: number;
  cogs: number;
  labor: number;
  fixedExHq: number;
  royalty: number;
  marketingFund: number;
  ebitda: number;
  setupCost: number;
}
export interface FleetEconomics {
  unitCount: number;
  units: FleetEconomicsRow[];
  totalRevenue: number;
  totalEbitda: number;
  totalSetupCost: number;
  hqOverhead: number;
  supplyDiscountActive: boolean;
  commissaryActive: boolean;
  avgRevenuePerUnit: number;
  avgEbitdaPerUnit: number;
  hqOverheadAbsorption: number;
}

export function computeFleetEconomics(s: SimulationScenario, baseSetupCost: number): FleetEconomics | null {
  const f: SimulationFleetModel | undefined = s.fleet;
  if (!f || f.unitCount <= 1) return null;
  const units: FleetEconomicsRow[] = [];
  let effectiveCogsPct = s.cogsPct;
  const supplyDiscountActive = f.unitCount >= f.supplyDiscountAtUnits && f.supplyDiscountPct > 0;
  const commissaryActive = f.unitCount >= f.commissaryEnabledAtUnits && f.commissarySavingsPct > 0;
  if (supplyDiscountActive) effectiveCogsPct *= 1 - f.supplyDiscountPct;
  if (commissaryActive) effectiveCogsPct *= 1 - f.commissarySavingsPct;
  effectiveCogsPct = Math.max(0, effectiveCogsPct);

  const baseRevenue = s.ordersPerDay * s.avgTicketGrosze * s.daysOpenPerMonth;
  const baseLabor = s.labor.reduce((sum, l) => sum + l.headcount * (l.hoursPerWeek ?? 0) * WEEKS_PER_MONTH * l.hourlyRateGrosze, 0);
  const useMarketingAsCac = s.marketingAsCac !== false;
  const baseFixedExHq = Object.entries(s.fixedCosts).reduce((sum: number, [k, v]) => {
    if (useMarketingAsCac && k === "marketing") return sum;
    return sum + (v ?? 0);
  }, 0);

  for (let i = 0; i < f.unitCount; i++) {
    const cannibalRetained = (1 - f.dmaOverlapPct) ** i;
    const unitRevenue = baseRevenue * cannibalRetained;
    const cogs = unitRevenue * effectiveCogsPct;
    const labor = baseLabor;
    const royalty = unitRevenue * f.royaltyPct;
    const marketingFund = unitRevenue * f.marketingFundPct;
    const variableLeakage = unitRevenue * ((s.paymentProcessorPct ?? 0) + (s.wastePct ?? 0) + (s.refundPct ?? 0) + (s.loyaltyBurnPct ?? 0));
    const packaging = (s.packagingPerOrderGrosze ?? 0) * s.ordersPerDay * s.daysOpenPerMonth * cannibalRetained;
    const marketingCac = useMarketingAsCac ? (s.fixedCosts.marketing ?? 0) : 0;
    const ebitda = unitRevenue - cogs - labor - baseFixedExHq - royalty - marketingFund - variableLeakage - packaging - marketingCac;
    const learning = (1 - f.buildoutLearningPct) ** i;
    const learnedSetup = Math.max(baseSetupCost * f.buildoutFloorPct, baseSetupCost * learning);
    units.push({ unitIndex: i + 1, revenue: unitRevenue, cogs, labor, fixedExHq: baseFixedExHq, royalty, marketingFund, ebitda, setupCost: learnedSetup });
  }

  const totalRevenue = units.reduce((sum, u) => sum + u.revenue, 0);
  const totalEbitdaPreHq = units.reduce((sum, u) => sum + u.ebitda, 0);
  const totalSetupCost = units.reduce((sum, u) => sum + u.setupCost, 0);
  const hqOverhead = f.hqOverheadMonthlyGrosze;
  const totalEbitda = totalEbitdaPreHq - hqOverhead;
  return {
    unitCount: f.unitCount, units, totalRevenue, totalEbitda, totalSetupCost, hqOverhead,
    supplyDiscountActive, commissaryActive,
    avgRevenuePerUnit: f.unitCount > 0 ? totalRevenue / f.unitCount : 0,
    avgEbitdaPerUnit: f.unitCount > 0 ? totalEbitda / f.unitCount : 0,
    hqOverheadAbsorption: totalRevenue > 0 ? hqOverhead / totalRevenue : 0,
  };
}

/* ── per-channel CM1 ───────────────────────────────────────────────────────
 * Contribution margin per order broken down by cash / on-site card / Glovo /
 * Wolt — each channel pays a different fee, so the unblended view is what tells
 * the operator whether delivery is actually profitable. Takes the RAW scenario
 * (pre-applyAssumptions) so the on-site card rate isn't the blended one. */
export interface ChannelEconomicsRow {
  key: "cash" | "onSiteCard" | "glovo" | "wolt";
  label: string;
  sharePct: number;
  feePct: number;
  cm1PerOrderGrosze: number;
  cm1PctOfTicket: number;
  monthlyContributionGrosze: number;
}

export function computeChannelEconomics(s: SimulationScenario): ChannelEconomicsRow[] {
  const cashShare = s.cashSharePct ?? 0;
  const glovoShare = s.glovoSharePct ?? 0;
  const woltShare = s.woltSharePct ?? 0;
  const onSiteShare = Math.max(0, 1 - cashShare - glovoShare - woltShare);
  const variableExFee = s.cogsPct + (s.wastePct ?? 0) + (s.refundPct ?? 0) + (s.loyaltyBurnPct ?? 0);
  const ordersPerMonth = s.ordersPerDay * s.daysOpenPerMonth;
  const buildRow = (key: ChannelEconomicsRow["key"], label: string, share: number, feePct: number): ChannelEconomicsRow => {
    const cm1Pct = Math.max(0, 1 - variableExFee - feePct);
    const cm1PerOrder = s.avgTicketGrosze * cm1Pct;
    return { key, label, sharePct: share, feePct, cm1PerOrderGrosze: cm1PerOrder, cm1PctOfTicket: cm1Pct, monthlyContributionGrosze: cm1PerOrder * share * ordersPerMonth };
  };
  return [
    buildRow("cash", "Cash", cashShare, 0),
    buildRow("onSiteCard", "On-site card", onSiteShare, s.paymentProcessorPct ?? 0),
    buildRow("glovo", "Glovo", glovoShare, s.glovoFeePct ?? 0),
    buildRow("wolt", "Wolt", woltShare, s.woltFeePct ?? 0),
  ];
}
