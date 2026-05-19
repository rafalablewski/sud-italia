"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Banknote,
  Brain,
  Calculator,
  CalendarRange,
  ChefHat,
  Clock,
  Database,
  Flame,
  FlaskConical,
  Gauge,
  Grid3X3,
  HandCoins,
  Lightbulb,
  LineChart as LineChartIcon,
  Percent,
  PiggyBank,
  Plus,
  RefreshCw,
  Save,
  Scale,
  Shield,
  Sliders,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Utensils,
  Wallet,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type {
  BusinessCostCategory,
  BusinessCostPayrollRole,
  SimulationActualsSnapshot,
  SimulationAssumptions,
  SimulationAttachLever,
  SimulationCohortSnapshot,
  SimulationDaypartLine,
  SimulationFleetModel,
  SimulationHourlyThroughputLine,
  SimulationKitchenCapacity,
  SimulationIngredientLever,
  SimulationLaborLine,
  SimulationMenuEngineeringLine,
  SimulationScenario,
  SimulationSeasonality,
  SimulationSssgSnapshot,
  SimulationWeather,
} from "@/data/types";
import { useToast } from "./v2/ui/Toast";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  InfoButton,
  Input,
  Select,
} from "./v2/ui";
import { Heatmap, KpiCard, LineChart, PieChart } from "./v2/charts";

const PAYROLL_ROLE_LABEL: Record<BusinessCostPayrollRole, string> = {
  pizzaiolo: "Pizzaiolo",
  chef: "Chef (pasta)",
  "sous-chef": "Sous-chef",
  "kitchen-porter": "Kitchen porter",
  waiter: "Waiter / front of house",
  barista: "Barista",
  driver: "Driver",
  manager: "Manager",
  cleaner: "Cleaner",
  other: "Other",
};

const FIXED_COST_FIELDS: { key: BusinessCostCategory; label: string }[] = [
  { key: "rent", label: "Rent & lease" },
  { key: "utilities", label: "Utilities" },
  { key: "fuel", label: "Fuel" },
  { key: "vehicle", label: "Vehicle" },
  { key: "insurance", label: "Insurance" },
  { key: "licenses", label: "Licenses & permits" },
  { key: "marketing", label: "Marketing" },
  { key: "software", label: "Software & SaaS" },
  { key: "professional", label: "Professional services" },
  { key: "tax", label: "Tax & fees" },
  { key: "maintenance", label: "Maintenance" },
  { key: "equipment", label: "Equipment" },
  { key: "other", label: "Other" },
];

const WEEKS_PER_MONTH = 4.345;

const DEFAULT_SEASONALITY: SimulationSeasonality = {
  winter: 0.7,
  spring: 1.0,
  summer: 1.3,
  autumn: 1.0,
};

const DEFAULT_ASSUMPTIONS: SimulationAssumptions = {
  coffeeAttach: { attachPct: 0.25, avgPriceGrosze: 900, cogsPct: 0.12 },
  dessertAttach: { attachPct: 0.12, avgPriceGrosze: 1600, cogsPct: 0.28 },
  antipastiAttach: { attachPct: 0.08, avgPriceGrosze: 2400, cogsPct: 0.32 },
  aperitivoAttach: { attachPct: 0.10, avgPriceGrosze: 2200, cogsPct: 0.22 },
  premiumToppingsAttach: { attachPct: 0.15, avgPriceGrosze: 700, cogsPct: 0.30 },
  pastaPrimoAttach: { attachPct: 0.18, avgPriceGrosze: 3200, cogsPct: 0.26 },
  comboConversion: { pct: 0.20, addonGrosze: 2500, discountGrosze: 600, addonCogsPct: 0.25 },
  cheapestPizzaShift: { pp: 0, ticketDeltaGrosze: 1000, cogsDeltaGrosze: 400 },
  deliveryShare: { pct: 0.25, packagingCostGrosze: 250, extraProcessorPct: 0, avgFeeGrosze: 800 },
  ingredients: {
    mozzarella: { enabled: true, cogsShare: 0.28, costDeltaPct: 0 },
    tomato: { enabled: true, cogsShare: 0.10, costDeltaPct: 0 },
    flour: { enabled: true, cogsShare: 0.06, costDeltaPct: 0 },
    doughWeight: { enabled: true, cogsShare: 0.06, costDeltaPct: 0 },
    oliveOil: { enabled: true, cogsShare: 0.05, costDeltaPct: 0 },
    curedMeats: { enabled: true, cogsShare: 0.07, costDeltaPct: 0 },
    buffaloMozz: { enabled: true, cogsShare: 0.03, costDeltaPct: 0 },
    eggs: { enabled: true, cogsShare: 0.02, costDeltaPct: 0 },
    ovenFuel: { enabled: true, cogsShare: 0.04, costDeltaPct: 0 },
    packaging: { enabled: true, cogsShare: 0.03, costDeltaPct: 0 },
  },
};

type IngredientKey =
  | "mozzarella"
  | "tomato"
  | "flour"
  | "doughWeight"
  | "oliveOil"
  | "curedMeats"
  | "buffaloMozz"
  | "eggs"
  | "ovenFuel"
  | "packaging";

/** Backfill ingredient defaults for scenarios saved before this feature existed.
 *  Without this an older saved scenario would render zero ingredient rows. */
function normalizeScenario(s: SimulationScenario): SimulationScenario {
  const existing = s.assumptions?.ingredients ?? {};
  const merged = { ...DEFAULT_ASSUMPTIONS.ingredients, ...existing };
  return {
    ...s,
    assumptions: {
      ...(s.assumptions ?? DEFAULT_ASSUMPTIONS),
      ingredients: merged,
    },
  };
}

const INGREDIENT_LEVERS: { key: IngredientKey; label: string; hint: string }[] = [
  { key: "mozzarella", label: "Mozzarella fior di latte", hint: "Biggest single line — every pizza uses 100–120 g." },
  { key: "tomato", label: "Tomato sauce", hint: "San Marzano DOP vs domestic — swap can shave 25%." },
  { key: "flour", label: "Tipo 00 flour", hint: "Caputo / Pivetti vs Polish double-zero." },
  { key: "doughWeight", label: "Dough weight per pizza", hint: "Recipe lever — going from 280 g to 250 g is −10.7%." },
  { key: "oliveOil", label: "Extra virgin olive oil", hint: "Italian EVOO — exposed to bad-harvest spikes." },
  { key: "curedMeats", label: "Cured meats", hint: "Prosciutto, 'nduja, salami — used on ~40% of pizzas." },
  { key: "buffaloMozz", label: "Buffalo mozzarella (premium)", hint: "Bufala / burrata swap on the premium menu." },
  { key: "eggs", label: "Eggs", hint: "Dough enrichment + carbonara + tiramisu." },
  { key: "ovenFuel", label: "Oven fuel (wood / gas)", hint: "Wood pellets, propane — winter heating premium." },
  { key: "packaging", label: "Packaging (boxes, napkins)", hint: "Pizza boxes + napkins + takeaway bags." },
];

/** Variable-vs-fixed labor split — share of total labor that flexes
 *  with seasonal volume (the rest stays at full headcount). 0.4 means
 *  a 30% volume swing translates into a 12% labor swing, which is the
 *  industry rule of thumb for restaurants. */
const LABOR_SEASONAL_FLEX = 0.4;

const DEFAULT_WEATHER: SimulationWeather = {
  rainyDayMultiplier: 0.75,
  rainyShare: 0.30,
  heatwaveMultiplier: 1.40,
  heatwaveShare: 0.10,
  holidayClosedDaysPerMonth: 1.0,
  holidayPeakDaysPerMonth: 1.0,
  holidayPeakMultiplier: 1.60,
  schoolHolidayLunchMultiplier: 0.85,
  eventDaysPerMonth: 1,
  eventDayMultiplier: 1.50,
};

const MONTH_TO_SEASON: ("winter" | "spring" | "summer" | "autumn")[] = [
  "winter", "winter", "spring", "spring", "spring", "summer",
  "summer", "summer", "autumn", "autumn", "autumn", "winter",
];

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DEFAULT_FLEET: SimulationFleetModel = {
  unitCount: 1,
  hqOverheadMonthlyGrosze: 0,
  supplyDiscountAtUnits: 5,
  supplyDiscountPct: 0.10,
  commissaryEnabledAtUnits: 4,
  commissarySavingsPct: 0.04,
  royaltyPct: 0.06,
  marketingFundPct: 0.02,
  dmaOverlapPct: 0.15,
  buildoutLearningPct: 0.05,
  buildoutFloorPct: 0.55,
};

interface ChannelEconomicsRow {
  key: "cash" | "onSiteCard" | "glovo" | "wolt";
  label: string;
  sharePct: number;
  feePct: number;
  /** CM1 = avgTicket × (1 − cogs − fee − waste − refund − loyalty), grosze. */
  cm1PerOrderGrosze: number;
  /** CM1 as % of avgTicket. */
  cm1PctOfTicket: number;
  /** Monthly contribution from this channel, grosze. */
  monthlyContributionGrosze: number;
}

interface Computed {
  monthlyRevenue: number;
  monthlyCogs: number;
  laborMonthly: number;
  fixedTotal: number;
  paymentFees: number;
  /** Refund / void / comp / theft leakage — revenue × refundPct. */
  refundLoss: number;
  /** Spoilage / waste — revenue × wastePct. Tied to volume, not a fixed line. */
  wasteCost: number;
  /** Loyalty point burn — revenue × loyaltyBurnPct. */
  loyaltyCost: number;
  /** CIT on pre-tax profit (0 if pre-tax is negative). */
  citAmount: number;
  /** Profit before corporate income tax. */
  preTaxProfit: number;
  /** Depreciation + amortisation (straight-line on setup cost). */
  depreciation: number;
  /** Interest expense (financing cost). */
  interest: number;
  /** EBITDA = revenue − all variable costs − labor − fixed (excl. D&A
   *  and interest). The institutional headline; conflated with
   *  "net profit" in the old model. */
  ebitda: number;
  /** EBIT = EBITDA − D&A. */
  ebit: number;
  /** EBITDAR = EBITDA + rent (rent-adjusted, the franchise-rollup standard). */
  ebitdar: number;
  /** Refund-adjusted net sales (top-line minus voids/comps/theft). */
  netSales: number;
  /** Occupancy ratio: rent / revenue. QSR target < 8%. */
  occupancyRatio: number;
  /** Annualised cash-on-cash return: 12 × netProfit / setupCost. The
   *  only multi-unit metric LPs care about. null when no setup cost. */
  cashOnCashAnnual: number | null;
  /** Honest labor KPI: per-PLN-of-revenue contribution profit, divided
   *  by labor hours. Target ≥ 150 zł/h for QSR. */
  contributionPerLaborHour: number;
  /** Promo-adjusted AOV: gross avgTicket minus implied loyalty discount. */
  promoAdjustedAvgTicket: number;
  /** Packaging cost — per-order × monthly orders. Hits every order
   *  (dine-in still uses napkins / plates wash, takeout = 100%). */
  packagingCost: number;
  /** Marketing fixed cost reclassified as CAC and amortised per order
   *  (only when marketingAsCac is true). When on, marketing is pulled
   *  out of fixed costs and into a variable acquisition line — the
   *  institutional CM1 treatment. */
  marketingCac: number;
  /** Per-order TRUE CM1: revenue − COGS − fees − waste − refund −
   *  loyalty − packaging − CAC. The honest unit economics number the
   *  audit demanded. */
  trueCm1PerOrderGrosze: number;
  totalCost: number;
  /** Net profit AFTER tax — the bottom line the operator should plan on. */
  netProfit: number;
  /** Theoretical max orders/day the kitchen can sustain (peak-hour limited). */
  capacityOrdersPerDay: number;
  /** Fraction of capacity the current ordersPerDay consumes (0–1+). */
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
  /** Upper-bound contribution margin (revenue × (1 − cogs − processor)) —
   *  legacy KPI; kept for back-compat. See trueContributionMarginPct for the
   *  honest version that nets out waste, refunds, and loyalty burn. */
  contributionMarginPct: number;
  /** Honest contribution margin: 1 − cogs − processor − refund − waste − loyalty.
   *  The per-PLN cash that actually drops to gross profit after every variable
   *  leakage. This is the KPI a CFO or PE analyst would read first. */
  trueContributionMarginPct: number;
  marginOfSafetyPct: number;
  revenuePerLaborHour: number;
  profitPerOrder: number;
  paybackMonths: number | null;
}

function computeScenario(s: SimulationScenario): Computed {
  const monthlyRevenue = s.ordersPerDay * s.avgTicketGrosze * s.daysOpenPerMonth;
  const monthlyCogs = Math.round(monthlyRevenue * s.cogsPct);
  // Labor volume flex — past the operational defect where labor was
  // entirely decoupled from ordersPerDay. The labor mix is sized for
  // `laborAnchorOrdersPerDay`; the variable share scales linearly with
  // the divergence. flex = 1 + variablePct × (current/anchor − 1).
  const laborAnchor = s.laborAnchorOrdersPerDay ?? s.ordersPerDay;
  const laborVariableShare = s.laborVariablePct ?? 0;
  const volumeRatio = laborAnchor > 0 ? s.ordersPerDay / laborAnchor : 1;
  const laborVolumeFlex = Math.max(
    0,
    1 + laborVariableShare * (volumeRatio - 1),
  );
  const laborByRole: { role: BusinessCostPayrollRole; grosze: number }[] = s.labor.map((l) => ({
    role: l.role,
    grosze: Math.round(
      l.headcount * l.hoursPerWeek * WEEKS_PER_MONTH * l.hourlyRateGrosze * laborVolumeFlex,
    ),
  }));
  const laborMonthly = laborByRole.reduce((sum, r) => sum + r.grosze, 0);
  const laborHoursPerMonth = s.labor.reduce(
    (sum, l) => sum + l.headcount * l.hoursPerWeek * WEEKS_PER_MONTH,
    0,
  );
  // Marketing reclassified as CAC: pulled out of fixed costs and into
  // a per-order acquisition line. This is the institutional CM1
  // treatment — marketing is a function of customer acquisition, not
  // a sunk monthly fee. Operator can toggle marketingAsCac to opt out.
  const marketingFixed = s.fixedCosts.marketing ?? 0;
  const useMarketingAsCac = s.marketingAsCac !== false;
  const marketingCac = useMarketingAsCac ? marketingFixed : 0;
  const fixedTotal = Object.entries(s.fixedCosts).reduce(
    (sum: number, [k, v]) => {
      if (useMarketingAsCac && k === "marketing") return sum;
      return sum + (v ?? 0);
    },
    0,
  );
  const paymentFees = Math.round(monthlyRevenue * (s.paymentProcessorPct ?? 0));
  // Operational leakage — all scale with revenue, not a fixed line.
  const wastePct = s.wastePct ?? 0;
  const refundPct = s.refundPct ?? 0;
  const loyaltyBurnPct = s.loyaltyBurnPct ?? 0;
  const citPct = s.citPct ?? 0;
  const monthlyOrdersForUnitEcon = s.ordersPerDay * s.daysOpenPerMonth;
  const wasteCost = Math.round(monthlyRevenue * wastePct);
  const refundLoss = Math.round(monthlyRevenue * refundPct);
  const loyaltyCost = Math.round(monthlyRevenue * loyaltyBurnPct);
  // Packaging hits every order — even dine-in (napkins, plates wash).
  // Audit §6: previously buried inside delivery-share only.
  const packagingPerOrder = s.packagingPerOrderGrosze ?? 0;
  const packagingCost = Math.round(packagingPerOrder * monthlyOrdersForUnitEcon);
  const depreciation = s.depreciationMonthlyGrosze ?? 0;
  const interest = s.interestMonthlyGrosze ?? 0;
  // EBITDA = revenue − all variable costs − labor − fixed (excl D&A/interest).
  // Then EBIT = EBITDA − D&A; pre-tax = EBIT − interest; net = pre-tax − CIT.
  const variableCostBlock =
    monthlyCogs + paymentFees + wasteCost + refundLoss + loyaltyCost + packagingCost + marketingCac;
  const ebitda = monthlyRevenue - variableCostBlock - laborMonthly - fixedTotal;
  const ebit = ebitda - depreciation;
  const preTaxProfit = ebit - interest;
  const totalCost =
    variableCostBlock + laborMonthly + fixedTotal + depreciation + interest;
  // CIT applies only on positive pre-tax profit. Polish small-CIT 9% / full 19%.
  const citAmount = preTaxProfit > 0 ? Math.round(preTaxProfit * citPct) : 0;
  const netProfit = preTaxProfit - citAmount;
  const margin = monthlyRevenue > 0 ? netProfit / monthlyRevenue : 0;
  const rentMonthly = s.fixedCosts.rent ?? 0;
  const ebitdar = ebitda + rentMonthly;
  const occupancyRatio = monthlyRevenue > 0 ? rentMonthly / monthlyRevenue : 0;
  const netSales = monthlyRevenue - refundLoss;
  // True CM1 per order: revenue − every variable leakage − packaging − CAC.
  // The audit's headline number — what an institutional underwriter sees.
  const marketingPerOrder =
    monthlyOrdersForUnitEcon > 0 ? marketingCac / monthlyOrdersForUnitEcon : 0;
  const trueCm1PerOrderGrosze =
    s.avgTicketGrosze *
      Math.max(
        0,
        1 - s.cogsPct - (s.paymentProcessorPct ?? 0) - wastePct - refundPct - loyaltyBurnPct,
      ) -
    packagingPerOrder -
    marketingPerOrder;
  const cashOnCashAnnual =
    s.setupCostGrosze && s.setupCostGrosze > 0 ? (netProfit * 12) / s.setupCostGrosze : null;
  const contributionPerOrderHonest =
    s.avgTicketGrosze * Math.max(0, 1 - s.cogsPct - (s.paymentProcessorPct ?? 0) - wastePct - refundPct - loyaltyBurnPct);
  const monthlyContribution = contributionPerOrderHonest * s.ordersPerDay * s.daysOpenPerMonth;
  const contributionPerLaborHour = laborHoursPerMonth > 0 ? monthlyContribution / laborHoursPerMonth : 0;
  const promoAdjustedAvgTicket = s.avgTicketGrosze * (1 - loyaltyBurnPct);
  // Break-even uses honest contribution (all variable leakage), and the
  // fixed block must cover the CIT shadow at the equilibrium point —
  // since CIT is 0 at break-even (preTax=0) we use pre-tax contribution.
  const contributionRatio = 1 - s.cogsPct - (s.paymentProcessorPct ?? 0);
  const trueContributionRatio =
    1 - s.cogsPct - (s.paymentProcessorPct ?? 0) - wastePct - refundPct - loyaltyBurnPct;
  const contributionPerOrder = s.avgTicketGrosze * Math.max(0, trueContributionRatio);
  const fixedAndLabor = laborMonthly + fixedTotal;
  const breakEvenOrdersPerMonth =
    contributionPerOrder > 0 ? fixedAndLabor / contributionPerOrder : 0;
  const breakEvenOrdersPerDay =
    s.daysOpenPerMonth > 0 ? breakEvenOrdersPerMonth / s.daysOpenPerMonth : 0;
  const breakEvenRevenue = breakEvenOrdersPerMonth * s.avgTicketGrosze;
  const foodCostPct = monthlyRevenue > 0 ? monthlyCogs / monthlyRevenue : 0;
  const laborPct = monthlyRevenue > 0 ? laborMonthly / monthlyRevenue : 0;
  const primeCostPct =
    monthlyRevenue > 0 ? (monthlyCogs + laborMonthly) / monthlyRevenue : 0;
  const contributionMarginPct = Math.max(0, contributionRatio);
  const trueContributionMarginPct = Math.max(0, trueContributionRatio);
  const marginOfSafetyPct =
    monthlyRevenue > 0 ? (monthlyRevenue - breakEvenRevenue) / monthlyRevenue : 0;
  const revenuePerLaborHour =
    laborHoursPerMonth > 0 ? monthlyRevenue / laborHoursPerMonth : 0;
  const monthlyOrders = s.ordersPerDay * s.daysOpenPerMonth;
  const profitPerOrder = monthlyOrders > 0 ? netProfit / monthlyOrders : 0;
  const paybackMonths =
    s.setupCostGrosze && s.setupCostGrosze > 0 && netProfit > 0
      ? s.setupCostGrosze / netProfit
      : null;
  // Kitchen capacity. Peak-hour load is the binding constraint: at peak
  // share `p` of a day's orders, peak-hour throughput = ordersPerDay × p.
  // That must be ≤ pizzasPerHour ⇒ ordersPerDay ≤ pizzasPerHour / p.
  // The same formula falls out whether you express it daily or per-hour,
  // because the peak hour is what saturates the oven and the pizzaiolo.
  // Prep-complexity multiplier (≥ 1) DERATES capacity for menus with
  // slow-prep items (pasta = ~1.4× pizza prep time). Audit §6.
  const cap = s.kitchenCapacity;
  const prepMult = Math.max(0.5, s.prepComplexityMultiplier ?? 1);
  const capacityOrdersPerDay =
    cap && cap.pizzasPerHour > 0 && cap.peakHourSharePct > 0
      ? cap.pizzasPerHour / cap.peakHourSharePct / prepMult
      : 0;
  const capacityUtilization =
    capacityOrdersPerDay > 0 ? s.ordersPerDay / capacityOrdersPerDay : 0;
  return {
    monthlyRevenue,
    monthlyCogs,
    laborMonthly,
    fixedTotal,
    paymentFees,
    refundLoss,
    wasteCost,
    loyaltyCost,
    citAmount,
    preTaxProfit,
    depreciation,
    interest,
    ebitda,
    ebit,
    ebitdar,
    netSales,
    occupancyRatio,
    cashOnCashAnnual,
    contributionPerLaborHour,
    promoAdjustedAvgTicket,
    packagingCost,
    marketingCac,
    trueCm1PerOrderGrosze,
    totalCost,
    netProfit,
    margin,
    breakEvenOrdersPerMonth,
    breakEvenRevenue,
    laborHoursPerMonth,
    foodCostPct,
    laborPct,
    primeCostPct,
    contributionMarginPct,
    trueContributionMarginPct,
    marginOfSafetyPct,
    revenuePerLaborHour,
    profitPerOrder,
    paybackMonths,
    breakEvenOrdersPerDay,
    laborByRole,
    capacityOrdersPerDay,
    capacityUtilization,
  };
}

/** Project the scenario across 12 months. Input is the assumptions-only
 *  scenario (no weather applied); weather is composed per-month inside
 *  so seasonal effects (heatwave only in summer, school dip only in
 *  Jul/Aug) land in the right months. Labor flexes with seasonal
 *  volume via LABOR_SEASONAL_FLEX. Fixed costs inflate at wage CPI
 *  (closer proxy than food CPI for rent/SaaS/accountant). */
function projectTwelveMonths(s: SimulationScenario, startMonth = 0) {
  return projectMonths(s, 12, startMonth, 0);
}

/** Generalised monthly projection. `monthsCount` is the horizon (12 for the
 *  steady-state chart, 24 for the investor payback view). `rampMonths`
 *  applies a linear volume ramp in months [0..rampMonths) so a fresh truck
 *  doesn't hit 100% volume in month 1 — institutional reality is 50-70-85-100%
 *  over the first ~4 months. Set to 0 for the operational chart. */
function projectMonths(
  s: SimulationScenario,
  monthsCount: number,
  startMonth = 0,
  rampMonths = 0,
) {
  const seasonality = s.seasonality ?? DEFAULT_SEASONALITY;
  const w = s.weather;
  const wageMonthly = (1 + (s.wageInflationPct ?? 0)) ** (1 / 12) - 1;
  const cogsMonthly = (1 + (s.ingredientInflationPct ?? 0)) ** (1 / 12) - 1;
  const baseLaborMonthly = s.labor.reduce(
    (sum, l) =>
      sum + l.headcount * l.hoursPerWeek * WEEKS_PER_MONTH * l.hourlyRateGrosze,
    0,
  );
  // Same marketing-as-CAC reclassification as in computeScenario so
  // the projection lines up with the headline view.
  const projUseCac = s.marketingAsCac !== false;
  const projMarketing = s.fixedCosts.marketing ?? 0;
  const baseFixed = Object.entries(s.fixedCosts).reduce(
    (sum: number, [k, v]) => {
      if (projUseCac && k === "marketing") return sum;
      return sum + (v ?? 0);
    },
    0,
  );
  const projPackagingPerOrder = s.packagingPerOrderGrosze ?? 0;
  const rows: {
    month: string;
    monthIndex: number;
    revenue: number;
    cogs: number;
    labor: number;
    fixed: number;
    payment: number;
    netProfit: number;
  }[] = [];
  for (let i = 0; i < monthsCount; i++) {
    const monthIndex = (startMonth + i) % 12;
    const season = MONTH_TO_SEASON[monthIndex];
    // Per-month override beats the quarterly multiplier when set —
    // matters for outdoor trucks where Jan/Feb/Dec behave nothing like
    // each other (cliff vs cliff vs Christmas-market boost).
    const override = seasonality.monthlyOverrides?.[monthIndex];
    const seasonMult = typeof override === "number" ? override : seasonality[season];
    const weatherMult = monthVolumeMult(monthIndex, w);
    const closedDays = w?.holidayClosedDaysPerMonth ?? 0;
    const daysOpen = Math.max(0, s.daysOpenPerMonth - closedDays);
    // Linear volume ramp for the opening months (Y1 reality — the truck
    // doesn't go from zero to 100% on day one; brand awareness, word of
    // mouth, and operational competence all need time).
    const rampFactor = rampMonths > 0 && i < rampMonths
      ? (i + 1) / rampMonths
      : 1;
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
    // Labor flex = base headline volume flex (driven by current ordersPerDay
    // vs anchor) × seasonal flex (driven by this month's seasonal volume).
    // Both use the same laborVariablePct so behaviour matches across the
    // headline view and the 12-month projection.
    const variablePct = s.laborVariablePct ?? LABOR_SEASONAL_FLEX;
    const anchor = s.laborAnchorOrdersPerDay ?? s.ordersPerDay;
    const volumeFlex =
      anchor > 0 ? Math.max(0, 1 + variablePct * (s.ordersPerDay / anchor - 1)) : 1;
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
    // Marketing CAC tracks volume (more orders = more acquisition spend
    // implied, but the FIXED budget doesn't change — so we keep it
    // constant whether marketingAsCac is on or off; on=variable bucket,
    // off=fixed bucket. Net effect on pre-tax is identical.
    const marketingCacRow = projUseCac ? projMarketing : 0;
    // D&A and interest stay flat — they don't compound with volume or
    // wage CPI; they're functions of capital structure decided up front.
    const depreciation = s.depreciationMonthlyGrosze ?? 0;
    const interest = s.interestMonthlyGrosze ?? 0;
    const preTax = revenue - cogs - labor - fixed - payment - waste - refund - loyalty - packaging - marketingCacRow - depreciation - interest;
    const cit = preTax > 0 ? Math.round(preTax * (s.citPct ?? 0)) : 0;
    const netProfit = preTax - cit;
    rows.push({
      month: MONTH_LABELS[monthIndex],
      monthIndex,
      revenue: Math.round(revenue / 100),
      cogs: Math.round(cogs / 100),
      labor: Math.round(labor / 100),
      fixed: Math.round(fixed / 100),
      payment: Math.round(payment / 100),
      netProfit: Math.round(netProfit / 100),
    });
  }
  return rows;
}

/** Per-attach prep seconds — institutional QSR norms for a Neapolitan
 *  truck. Operator-immutable for now; the model honours these to compute
 *  modelled ticket time and queue blow-out. */
const PREP_SECONDS_PER_ATTACH: Record<string, number> = {
  coffee: 30,
  dessert: 60,
  antipasti: 90,
  aperitivo: 30,
  premiumToppings: 15,
  pastaPrimo: 240,
};
const PIZZA_PREP_SECONDS = 90; // base pizza assembly + bake

interface ShiftPlanRow {
  daypart: "prep" | "lunch" | "dinner" | "late-night" | "close";
  label: string;
  hours: string;
  hoursPerDay: number;
  /** Share of daily orders this daypart handles (0 for prep / close). */
  orderShare: number;
  /** Modelled headcount on shift (uniform-spread baseline; operator
   *  reads this against reality and adjusts the per-role hours). */
  headcountOnShift: number;
  /** Daypart revenue, grosze. */
  revenuePerDay: number;
  /** Daypart labor cost, grosze, prorated from the labor mix. */
  laborPerDay: number;
  /** laborPerDay / revenuePerDay — coverage ratio. */
  laborCoverageRatio: number;
}

/** Maps the uniform labor mix onto the four daypart windows (prep /
 *  lunch / dinner / late-night / close) so the operator can see how
 *  thin the coverage gets at rush. Doesn't change the labor calc —
 *  this is the visibility layer the audit demanded. */
function computeShiftPlan(
  s: SimulationScenario,
  dayparts: SimulationDaypartLine[] | null,
): ShiftPlanRow[] {
  const totalLaborPerWeek = s.labor.reduce(
    (sum, l) => sum + l.headcount * l.hoursPerWeek * l.hourlyRateGrosze,
    0,
  );
  const totalLaborPerDay = totalLaborPerWeek / 7;
  const totalHeadcountAvg = s.labor.reduce((sum, l) => sum + l.headcount, 0);
  const dailyRev = s.ordersPerDay * s.avgTicketGrosze;
  // Daypart hours — institutional standard buckets.
  const meta: { key: ShiftPlanRow["daypart"]; label: string; hours: string; hoursPerDay: number; share: number; concentrationFactor: number }[] = [
    { key: "prep", label: "Prep", hours: "10:00 – 11:00", hoursPerDay: 1, share: 0, concentrationFactor: 0.4 },
    { key: "lunch", label: "Lunch", hours: "11:00 – 15:00", hoursPerDay: 4, share: 0.30, concentrationFactor: 1.4 },
    {
      key: "dinner",
      label: "Dinner",
      hours: "17:00 – 22:00",
      hoursPerDay: 5,
      share: 0.50,
      concentrationFactor: 1.6,
    },
    {
      key: "late-night",
      label: "Late-night",
      hours: "22:00 – 02:00",
      hoursPerDay: 2,
      share: 0.18,
      concentrationFactor: 0.7,
    },
    {
      key: "close",
      label: "Close",
      hours: "02:00 – 03:00",
      hoursPerDay: 1,
      share: 0,
      concentrationFactor: 0.3,
    },
  ];
  // If we have real daypart data, override share with observed.
  if (dayparts && dayparts.length > 0) {
    const totalObserved = dayparts.reduce((sum, d) => sum + d.ordersCount, 0);
    if (totalObserved > 0) {
      const obsByKey = new Map(dayparts.map((d) => [d.key, d.sharePct]));
      meta.find((m) => m.key === "lunch")!.share = obsByKey.get("lunch") ?? 0.30;
      meta.find((m) => m.key === "dinner")!.share = obsByKey.get("dinner") ?? 0.50;
      meta.find((m) => m.key === "late-night")!.share = obsByKey.get("late-night") ?? 0.18;
    }
  }
  const totalServiceHours = meta.reduce((sum, m) => sum + m.hoursPerDay, 0);
  return meta.map((m) => {
    const revenuePerDay = dailyRev * m.share;
    // Labor: hours-weighted slice of daily labor budget × concentration
    // factor (lunch + dinner pull more headcount; prep + close stay
    // light). Multiplied so the per-day total still sums to actual.
    const baseShare = m.hoursPerDay / totalServiceHours;
    const weightedShare = baseShare * m.concentrationFactor;
    const laborPerDay = totalLaborPerDay * weightedShare;
    const headcountOnShift = totalHeadcountAvg * m.concentrationFactor;
    return {
      daypart: m.key,
      label: m.label,
      hours: m.hours,
      hoursPerDay: m.hoursPerDay,
      orderShare: m.share,
      headcountOnShift,
      revenuePerDay,
      laborPerDay,
      laborCoverageRatio: revenuePerDay > 0 ? laborPerDay / revenuePerDay : 0,
    };
  });
}

interface PrepFlowResult {
  /** Average kitchen-seconds-per-order from the menu mix.
   *  pizza base + Σ attachPct × attachSeconds. */
  modeledTicketSeconds: number;
  /** Peak-hour orders = ordersPerDay × peakHourSharePct. */
  peakHourOrders: number;
  /** Realistic oven throughput per hour. */
  realisticOvenPerHour: number;
  /** Excess orders that queue per peak hour (0 if capacity covers). */
  queueExcessPerHour: number;
  /** Minutes a customer at the back of the queue waits. */
  estimatedWaitMinutes: number;
  /** Conversion drop applied: 5% per minute past 5 min of wait, capped
   *  at 60%. The audit's "5-minute wait at 1pm bleeds 30% conversion". */
  conversionDropPct: number;
  /** Monthly orders lost to peak-hour queue. */
  monthlyOrdersLost: number;
  /** Monthly contribution lost. */
  monthlyContributionLostGrosze: number;
}

function computePrepFlow(s: SimulationScenario): PrepFlowResult {
  const a = s.assumptions;
  let modeledTicketSeconds = PIZZA_PREP_SECONDS;
  if (a) {
    const levers: Array<[string, typeof a.coffeeAttach]> = [
      ["coffee", a.coffeeAttach],
      ["dessert", a.dessertAttach],
      ["antipasti", a.antipastiAttach],
      ["aperitivo", a.aperitivoAttach],
      ["premiumToppings", a.premiumToppingsAttach],
      ["pastaPrimo", a.pastaPrimoAttach],
    ];
    for (const [key, lever] of levers) {
      if (!lever || lever.enabled === false) continue;
      modeledTicketSeconds += lever.attachPct * (PREP_SECONDS_PER_ATTACH[key] ?? 0);
    }
  }
  // Oven curve realistic peak — same as OvenCurvePanel.
  const cap = s.kitchenCapacity;
  const realisticOvenPerHour =
    cap && cap.ovenCycleSeconds && cap.ovenPizzasPerCycle && cap.ovenEfficiencyPct
      ? (3600 / cap.ovenCycleSeconds) * cap.ovenPizzasPerCycle * cap.ovenEfficiencyPct
      : cap?.pizzasPerHour ?? 0;
  const peakHourSharePct = cap?.peakHourSharePct ?? 0.35;
  const peakHourOrders = s.ordersPerDay * peakHourSharePct;
  const queueExcessPerHour = Math.max(0, peakHourOrders - realisticOvenPerHour);
  // Wait time: if you're in the queue, you wait for the people ahead to
  // be served. Average wait ≈ (queueLength × prepSecondsPerOrder / 2) /
  // throughput. Use modeledTicketSeconds as the per-order prep time.
  const throughputPerSec = realisticOvenPerHour / 3600;
  const estimatedWaitMinutes =
    throughputPerSec > 0 && queueExcessPerHour > 0
      ? (queueExcessPerHour * modeledTicketSeconds) / 60 / 2
      : 0;
  // Audit: 5-min wait → 30% conversion drop. We linearize at 5%/min
  // past the 5-min mark, capped at 60%.
  const excessMin = Math.max(0, estimatedWaitMinutes - 5);
  const conversionDropPct = Math.min(0.6, excessMin * 0.05);
  const monthlyOrdersLost = Math.round(
    queueExcessPerHour > 0
      ? s.ordersPerDay * conversionDropPct * s.daysOpenPerMonth
      : 0,
  );
  const cm1PerOrder =
    s.avgTicketGrosze *
    Math.max(
      0,
      1 -
        s.cogsPct -
        (s.paymentProcessorPct ?? 0) -
        (s.wastePct ?? 0) -
        (s.refundPct ?? 0) -
        (s.loyaltyBurnPct ?? 0),
    );
  const monthlyContributionLostGrosze = Math.round(monthlyOrdersLost * cm1PerOrder);
  return {
    modeledTicketSeconds,
    peakHourOrders,
    realisticOvenPerHour,
    queueExcessPerHour,
    estimatedWaitMinutes,
    conversionDropPct,
    monthlyOrdersLost,
    monthlyContributionLostGrosze,
  };
}

interface FleetEconomicsRow {
  unitIndex: number;
  /** Revenue this unit captures after DMA cannibalisation from every
   *  prior unit in the cluster (the n-th truck inherits cumulative
   *  overlap drag). */
  revenue: number;
  cogs: number;
  labor: number;
  fixedExHq: number;
  royalty: number;
  marketingFund: number;
  ebitda: number;
  /** Setup cost on the build-out learning curve. */
  setupCost: number;
}

interface FleetEconomics {
  unitCount: number;
  units: FleetEconomicsRow[];
  totalRevenue: number;
  totalEbitda: number;
  totalSetupCost: number;
  /** Combined HQ overhead applied once to the whole fleet. */
  hqOverhead: number;
  /** Aggregated supply / commissary savings vs single-unit baseline. */
  supplyDiscountActive: boolean;
  commissaryActive: boolean;
  /** Per-unit averages — what each truck contributes after every fleet
   *  adjustment. */
  avgRevenuePerUnit: number;
  avgEbitdaPerUnit: number;
  /** HQ overhead as % of fleet revenue (drops with unit count). */
  hqOverheadAbsorption: number;
}

/** Multi-unit fleet model — applies HQ overhead absorption, supply
 *  discount, commissary savings, royalty + marketing fund, DMA
 *  cannibalisation, and the build-out learning curve over N units.
 *  Takes the RAW single-unit scenario as the baseline. */
function computeFleetEconomics(
  s: SimulationScenario,
  baseSetupCost: number,
): FleetEconomics | null {
  const f = s.fleet;
  if (!f || f.unitCount <= 1) return null;
  const units: FleetEconomicsRow[] = [];
  // Effective COGS rate with supply discount and commissary kicking in.
  let effectiveCogsPct = s.cogsPct;
  const supplyDiscountActive = f.unitCount >= f.supplyDiscountAtUnits && f.supplyDiscountPct > 0;
  const commissaryActive = f.unitCount >= f.commissaryEnabledAtUnits && f.commissarySavingsPct > 0;
  if (supplyDiscountActive) effectiveCogsPct *= 1 - f.supplyDiscountPct;
  if (commissaryActive) effectiveCogsPct *= 1 - f.commissarySavingsPct;
  effectiveCogsPct = Math.max(0, effectiveCogsPct);

  // Single-unit P&L (pre-fleet) — used as baseline for per-unit revenue/
  // labor/fixed before DMA + fleet-specific adjustments.
  const baseRevenue = s.ordersPerDay * s.avgTicketGrosze * s.daysOpenPerMonth;
  const baseLabor = s.labor.reduce(
    (sum, l) => sum + l.headcount * l.hoursPerWeek * WEEKS_PER_MONTH * l.hourlyRateGrosze,
    0,
  );
  // Fixed excluding HQ (which lives at fleet level) and excluding
  // marketing if it's been reclassified as CAC.
  const useMarketingAsCac = s.marketingAsCac !== false;
  const baseFixedExHq = Object.entries(s.fixedCosts).reduce(
    (sum: number, [k, v]) => {
      if (useMarketingAsCac && k === "marketing") return sum;
      return sum + (v ?? 0);
    },
    0,
  );

  for (let i = 0; i < f.unitCount; i++) {
    // DMA cannibalisation — each new unit loses `dmaOverlapPct` per
    // prior unit. Modeled multiplicatively so a 15% overlap × 4 prior
    // units = (1 − 0.15)^4 ≈ 52% retained. Reality is steeper at low
    // numbers and tapers, but a 0.85^n approximation captures the
    // direction well enough for an IC sketch.
    const cannibalRetained = (1 - f.dmaOverlapPct) ** i;
    const unitRevenue = baseRevenue * cannibalRetained;
    const cogs = unitRevenue * effectiveCogsPct;
    const labor = baseLabor;
    const royalty = unitRevenue * f.royaltyPct;
    const marketingFund = unitRevenue * f.marketingFundPct;
    const variableLeakage =
      unitRevenue *
      ((s.paymentProcessorPct ?? 0) +
        (s.wastePct ?? 0) +
        (s.refundPct ?? 0) +
        (s.loyaltyBurnPct ?? 0));
    const packaging = (s.packagingPerOrderGrosze ?? 0) * s.ordersPerDay * s.daysOpenPerMonth * cannibalRetained;
    const marketingCac = useMarketingAsCac ? (s.fixedCosts.marketing ?? 0) : 0;
    const ebitda =
      unitRevenue - cogs - labor - baseFixedExHq - royalty - marketingFund - variableLeakage - packaging - marketingCac;
    // Build-out learning curve: each new unit's setup = base × (1 − learning)^(i)
    // floored at buildoutFloorPct of original.
    const learning = (1 - f.buildoutLearningPct) ** i;
    const learnedSetup = Math.max(baseSetupCost * f.buildoutFloorPct, baseSetupCost * learning);
    units.push({
      unitIndex: i + 1,
      revenue: unitRevenue,
      cogs,
      labor,
      fixedExHq: baseFixedExHq,
      royalty,
      marketingFund,
      ebitda,
      setupCost: learnedSetup,
    });
  }

  const totalRevenue = units.reduce((sum, u) => sum + u.revenue, 0);
  const totalEbitdaPreHq = units.reduce((sum, u) => sum + u.ebitda, 0);
  const totalSetupCost = units.reduce((sum, u) => sum + u.setupCost, 0);
  const hqOverhead = f.hqOverheadMonthlyGrosze;
  const totalEbitda = totalEbitdaPreHq - hqOverhead;
  return {
    unitCount: f.unitCount,
    units,
    totalRevenue,
    totalEbitda,
    totalSetupCost,
    hqOverhead,
    supplyDiscountActive,
    commissaryActive,
    avgRevenuePerUnit: f.unitCount > 0 ? totalRevenue / f.unitCount : 0,
    avgEbitdaPerUnit: f.unitCount > 0 ? totalEbitda / f.unitCount : 0,
    hqOverheadAbsorption: totalRevenue > 0 ? hqOverhead / totalRevenue : 0,
  };
}

/** Per-channel CM1 — contribution margin per order broken down by cash /
 *  on-site card / Glovo / Wolt. Each channel pays a different fee, so the
 *  unblended view is what tells the operator whether delivery is actually
 *  profitable. Takes the RAW scenario (pre-applyAssumptions) so the
 *  on-site card rate isn't the blended one. */
function computeChannelEconomics(s: SimulationScenario): ChannelEconomicsRow[] {
  const cashShare = s.cashSharePct ?? 0;
  const glovoShare = s.glovoSharePct ?? 0;
  const woltShare = s.woltSharePct ?? 0;
  const onSiteShare = Math.max(0, 1 - cashShare - glovoShare - woltShare);
  const onSiteRate = s.paymentProcessorPct ?? 0;
  const glovoFee = s.glovoFeePct ?? 0;
  const woltFee = s.woltFeePct ?? 0;
  const variableExFee =
    s.cogsPct + (s.wastePct ?? 0) + (s.refundPct ?? 0) + (s.loyaltyBurnPct ?? 0);
  const ordersPerMonth = s.ordersPerDay * s.daysOpenPerMonth;
  const buildRow = (
    key: ChannelEconomicsRow["key"],
    label: string,
    share: number,
    feePct: number,
  ): ChannelEconomicsRow => {
    const cm1Pct = Math.max(0, 1 - variableExFee - feePct);
    const cm1PerOrder = s.avgTicketGrosze * cm1Pct;
    return {
      key,
      label,
      sharePct: share,
      feePct,
      cm1PerOrderGrosze: cm1PerOrder,
      cm1PctOfTicket: cm1Pct,
      monthlyContributionGrosze: cm1PerOrder * share * ordersPerMonth,
    };
  };
  return [
    buildRow("cash", "Cash", cashShare, 0),
    buildRow("onSiteCard", "On-site card", onSiteShare, onSiteRate),
    buildRow("glovo", "Glovo", glovoShare, glovoFee),
    buildRow("wolt", "Wolt", woltShare, woltFee),
  ];
}

/** Returns metrics for an investor pitch / IC: NPV at three discount rates,
 *  IRR, and the month at which cumulative cash flows recover the setup cost.
 *  Operates on a monthly netProfit series (in grosze) plus the initial
 *  setup outlay. NPV uses annual discount rates compounded monthly. */
interface InvestmentReturns {
  /** First month index (1-based) where cumulative net profit >= setup cost.
   *  null if never recovered within the horizon. */
  cumulativeCashBreakEvenMonth: number | null;
  /** NPV in grosze at the three benchmark discount rates. Positive ⇒
   *  the investment beats the discount rate; negative ⇒ destroys value. */
  npv10: number;
  npv15: number;
  npv20: number;
  /** IRR as an annualised fraction. null when the cash-flow series has no
   *  real-valued IRR (e.g. always negative, always positive, or the
   *  solver fails to converge). */
  irrAnnual: number | null;
  /** Total horizon used (months). */
  horizonMonths: number;
}

function npvAtRate(monthlyNets: number[], setupCost: number, annualRate: number): number {
  // Equivalent monthly rate compounded so (1+rMonthly)^12 = 1+annualRate.
  const r = (1 + annualRate) ** (1 / 12) - 1;
  let pv = -setupCost;
  for (let i = 0; i < monthlyNets.length; i++) {
    pv += monthlyNets[i] / (1 + r) ** (i + 1);
  }
  return pv;
}

/** IRR via Newton-Raphson on the monthly discount rate. Converts to an
 *  annualised rate for display. Bails out when slope is too flat (which
 *  happens for never-recover or always-recovered series). */
function irrAnnual(monthlyNets: number[], setupCost: number): number | null {
  const cashFlows = [-setupCost, ...monthlyNets];
  // Need at least one sign change for an IRR to exist.
  let hasPos = false, hasNeg = false;
  for (const v of cashFlows) {
    if (v > 0) hasPos = true;
    if (v < 0) hasNeg = true;
  }
  if (!hasPos || !hasNeg) return null;
  let r = 0.01; // start at 1%/month (~12.7%/yr)
  for (let iter = 0; iter < 100; iter++) {
    let f = 0, df = 0;
    for (let t = 0; t < cashFlows.length; t++) {
      const denom = (1 + r) ** t;
      f += cashFlows[t] / denom;
      if (t > 0) df += (-t * cashFlows[t]) / ((1 + r) ** (t + 1));
    }
    if (!Number.isFinite(f) || !Number.isFinite(df) || Math.abs(df) < 1e-12) return null;
    const step = f / df;
    r -= step;
    if (r <= -0.999) r = -0.99; // keep above the singularity
    if (Math.abs(step) < 1e-7) {
      return (1 + r) ** 12 - 1;
    }
  }
  return null;
}

function computeReturns(
  monthlyNetGrosze: number[],
  setupCostGrosze: number,
): InvestmentReturns {
  let cumulative = 0;
  let breakEvenMonth: number | null = null;
  for (let i = 0; i < monthlyNetGrosze.length; i++) {
    cumulative += monthlyNetGrosze[i];
    if (breakEvenMonth === null && cumulative >= setupCostGrosze) {
      breakEvenMonth = i + 1;
    }
  }
  return {
    cumulativeCashBreakEvenMonth: breakEvenMonth,
    npv10: npvAtRate(monthlyNetGrosze, setupCostGrosze, 0.10),
    npv15: npvAtRate(monthlyNetGrosze, setupCostGrosze, 0.15),
    npv20: npvAtRate(monthlyNetGrosze, setupCostGrosze, 0.20),
    irrAnnual: irrAnnual(monthlyNetGrosze, setupCostGrosze),
    horizonMonths: monthlyNetGrosze.length,
  };
}

/** Single tornado bar — variable name + downside / upside profit deltas. */
interface TornadoBar {
  key: string;
  label: string;
  unit: string;
  /** Net profit delta in grosze at the -10% scenario (typically negative
   *  for cost-up moves; sign matches a real loss). */
  downGrosze: number;
  /** Net profit delta in grosze at the +10% scenario. */
  upGrosze: number;
  /** Absolute total swing — used to sort the bars descending. */
  totalSwing: number;
}

/** One-at-a-time sensitivity for the tornado chart. Each variable is flexed
 *  ±10% (or ±10pp for percentage variables) around the current scenario, the
 *  net profit re-computed, and the deltas vs baseline returned. The chart
 *  is sorted by absolute swing so the most fragile inputs surface at the top. */
function computeTornado(s: SimulationScenario): TornadoBar[] {
  const baseline = computeScenario(s).netProfit;
  const flex = 0.10;
  const flexPP = 0.05;

  // Helper: produce a scenario clone with one numeric field shifted.
  const withField = (mut: (next: SimulationScenario) => void): SimulationScenario => {
    const clone: SimulationScenario = JSON.parse(JSON.stringify(s));
    mut(clone);
    return clone;
  };

  const bars: TornadoBar[] = [];
  const push = (
    key: string,
    label: string,
    unit: string,
    minusScen: SimulationScenario,
    plusScen: SimulationScenario,
  ) => {
    const minus = computeScenario(minusScen).netProfit;
    const plus = computeScenario(plusScen).netProfit;
    const down = minus - baseline;
    const up = plus - baseline;
    bars.push({
      key,
      label,
      unit,
      downGrosze: down,
      upGrosze: up,
      totalSwing: Math.abs(down) + Math.abs(up),
    });
  };

  push(
    "ordersPerDay",
    "Orders / day",
    "±10%",
    withField((c) => { c.ordersPerDay = Math.max(0, s.ordersPerDay * (1 - flex)); }),
    withField((c) => { c.ordersPerDay = s.ordersPerDay * (1 + flex); }),
  );
  push(
    "avgTicket",
    "Avg ticket",
    "±10%",
    withField((c) => { c.avgTicketGrosze = Math.max(0, s.avgTicketGrosze * (1 - flex)); }),
    withField((c) => { c.avgTicketGrosze = s.avgTicketGrosze * (1 + flex); }),
  );
  push(
    "cogsPct",
    "Food cost %",
    "±5pp",
    withField((c) => { c.cogsPct = Math.max(0, s.cogsPct - flexPP); }),
    withField((c) => { c.cogsPct = Math.min(1, s.cogsPct + flexPP); }),
  );
  push(
    "labor",
    "Labor cost",
    "±10%",
    withField((c) => {
      c.labor = s.labor.map((l) => ({ ...l, hourlyRateGrosze: l.hourlyRateGrosze * (1 - flex) }));
    }),
    withField((c) => {
      c.labor = s.labor.map((l) => ({ ...l, hourlyRateGrosze: l.hourlyRateGrosze * (1 + flex) }));
    }),
  );
  const fixedTotal = Object.values(s.fixedCosts).reduce((sum, v) => sum + (v ?? 0), 0);
  if (fixedTotal > 0) {
    push(
      "fixed",
      "Fixed costs",
      "±10%",
      withField((c) => {
        c.fixedCosts = Object.fromEntries(
          Object.entries(s.fixedCosts).map(([k, v]) => [k, Math.round((v ?? 0) * (1 - flex))]),
        ) as SimulationScenario["fixedCosts"];
      }),
      withField((c) => {
        c.fixedCosts = Object.fromEntries(
          Object.entries(s.fixedCosts).map(([k, v]) => [k, Math.round((v ?? 0) * (1 + flex))]),
        ) as SimulationScenario["fixedCosts"];
      }),
    );
  }
  if ((s.paymentProcessorPct ?? 0) > 0) {
    push(
      "processor",
      "Payment fee %",
      "±0.5pp",
      withField((c) => { c.paymentProcessorPct = Math.max(0, (s.paymentProcessorPct ?? 0) - 0.005); }),
      withField((c) => { c.paymentProcessorPct = Math.min(1, (s.paymentProcessorPct ?? 0) + 0.005); }),
    );
  }
  if ((s.wastePct ?? 0) > 0 || s.wastePct === undefined) {
    push(
      "waste",
      "Waste %",
      "±1pp",
      withField((c) => { c.wastePct = Math.max(0, (s.wastePct ?? 0.02) - 0.01); }),
      withField((c) => { c.wastePct = Math.min(1, (s.wastePct ?? 0.02) + 0.01); }),
    );
  }
  if ((s.refundPct ?? 0) > 0 || s.refundPct === undefined) {
    push(
      "refund",
      "Refund %",
      "±1pp",
      withField((c) => { c.refundPct = Math.max(0, (s.refundPct ?? 0.015) - 0.01); }),
      withField((c) => { c.refundPct = Math.min(1, (s.refundPct ?? 0.015) + 0.01); }),
    );
  }
  if ((s.citPct ?? 0) > 0) {
    push(
      "cit",
      "CIT rate",
      "9% ↔ 19%",
      withField((c) => { c.citPct = 0.09; }),
      withField((c) => { c.citPct = 0.19; }),
    );
  }
  if ((s.glovoFeePct ?? 0) > 0 && (s.glovoSharePct ?? 0) > 0) {
    push(
      "glovoFee",
      "Glovo commission",
      "±3pp",
      withField((c) => { c.glovoFeePct = Math.max(0, (s.glovoFeePct ?? 0) - 0.03); }),
      withField((c) => { c.glovoFeePct = Math.min(1, (s.glovoFeePct ?? 0) + 0.03); }),
    );
  }

  return bars.sort((a, b) => b.totalSwing - a.totalSwing);
}

/** Sample the net-profit surface for a 2D heatmap. Each axis spans
 *  ±range × steps points around the current value, the centre row/col
 *  IS the current scenario. */
function buildMatrix(
  s: SimulationScenario,
  xKind: "orders" | "cogs",
  yKind: "ticket",
  steps = 5,
  range = 0.3,
): {
  xLabels: string[];
  yLabels: string[];
  cells: { x: string; y: string; value: number }[];
  centerX: string;
  centerY: string;
} {
  const xValues: number[] = [];
  const yValues: number[] = [];
  for (let i = 0; i < steps; i++) {
    const t = -range + (i * 2 * range) / (steps - 1);
    xValues.push(t);
    yValues.push(t);
  }
  const xLabels: string[] = [];
  const yLabels: string[] = [];
  const cells: { x: string; y: string; value: number }[] = [];
  for (const xt of xValues) {
    if (xKind === "orders") {
      xLabels.push(`${Math.round(s.ordersPerDay * (1 + xt))} /d`);
    } else {
      // cogs axis — show absolute %
      xLabels.push(`${Math.round((s.cogsPct + xt) * 100)}%`);
    }
  }
  for (const yt of yValues) {
    yLabels.push(`${Math.round((s.avgTicketGrosze * (1 + yt)) / 100)} zł`);
  }
  for (let yi = 0; yi < yValues.length; yi++) {
    for (let xi = 0; xi < xValues.length; xi++) {
      const flex: SimulationScenario = {
        ...s,
        ordersPerDay:
          xKind === "orders"
            ? Math.max(0, Math.round(s.ordersPerDay * (1 + xValues[xi])))
            : s.ordersPerDay,
        cogsPct:
          xKind === "cogs"
            ? Math.max(0, Math.min(1, s.cogsPct + xValues[xi]))
            : s.cogsPct,
        avgTicketGrosze: Math.max(
          0,
          Math.round(s.avgTicketGrosze * (1 + yValues[yi])),
        ),
      };
      const c = computeScenario(flex);
      cells.push({ x: xLabels[xi], y: yLabels[yi], value: c.netProfit });
    }
  }
  const centerIdx = Math.floor(steps / 2);
  return {
    xLabels,
    yLabels,
    cells,
    centerX: xLabels[centerIdx],
    centerY: yLabels[centerIdx],
  };
}

// --- Menu scenario presets -----------------------------------------------
//
// Five archetypal menu shapes a Neapolitan pizza truck can run. Picking
// one loads the avg ticket + COGS + behavior levers in a single click;
// the operator can still tweak any number afterwards.

interface MenuScenarioPreset {
  id: string;
  name: string;
  emoji: string;
  description: string;
  ordersPerDay: number;
  daysOpenPerMonth: number;
  avgTicketGrosze: number;
  cogsPct: number;
  /** Override values for behavior levers when this preset is applied. */
  attach: {
    coffee: number;
    dessert: number;
    antipasti: number;
    aperitivo: number;
    premiumToppings: number;
    pastaPrimo: number;
  };
}

const MENU_SCENARIOS: MenuScenarioPreset[] = [
  {
    id: "takeaway",
    name: "Takeaway classic",
    emoji: "🍕",
    description: "Quick pizza orders, minimal sides. High volume, low ticket — grab + go truck.",
    ordersPerDay: 100,
    daysOpenPerMonth: 28,
    avgTicketGrosze: 4500,
    cogsPct: 0.30,
    attach: { coffee: 0.15, dessert: 0.05, antipasti: 0.03, aperitivo: 0, premiumToppings: 0.10, pastaPrimo: 0 },
  },
  {
    id: "balanced",
    name: "Balanced (default)",
    emoji: "🍝",
    description: "Pizza + pasta + drinks + dessert mix. The Warsaw 2026 baseline.",
    ordersPerDay: 70,
    daysOpenPerMonth: 28,
    avgTicketGrosze: 6500,
    cogsPct: 0.30,
    attach: { coffee: 0.25, dessert: 0.12, antipasti: 0.08, aperitivo: 0.10, premiumToppings: 0.15, pastaPrimo: 0.18 },
  },
  {
    id: "premium",
    name: "Premium / Specialty",
    emoji: "✨",
    description: "High-end pizzas + premium toppings + pasta primo. Lower volume, higher ticket, better margin.",
    ordersPerDay: 55,
    daysOpenPerMonth: 26,
    avgTicketGrosze: 8800,
    cogsPct: 0.32,
    attach: { coffee: 0.30, dessert: 0.25, antipasti: 0.18, aperitivo: 0.20, premiumToppings: 0.35, pastaPrimo: 0.30 },
  },
  {
    id: "family",
    name: "Family / Group",
    emoji: "👨‍👩‍👧",
    description: "Multi-pizza orders for groups. Big tickets, fewer orders — weekend / event focus.",
    ordersPerDay: 30,
    daysOpenPerMonth: 26,
    avgTicketGrosze: 15500,
    cogsPct: 0.28,
    attach: { coffee: 0.10, dessert: 0.25, antipasti: 0.20, aperitivo: 0.05, premiumToppings: 0.15, pastaPrimo: 0.15 },
  },
  {
    id: "aperitivo",
    name: "Aperitivo / Dinner",
    emoji: "🍷",
    description: "Drinks-led evening service. Best margin — requires alcohol licence.",
    ordersPerDay: 45,
    daysOpenPerMonth: 28,
    avgTicketGrosze: 8200,
    cogsPct: 0.26,
    attach: { coffee: 0.20, dessert: 0.20, antipasti: 0.25, aperitivo: 0.45, premiumToppings: 0.20, pastaPrimo: 0.20 },
  },
];

const MENU_SCENARIO_BY_ID = new Map(MENU_SCENARIOS.map((s) => [s.id, s]));

/** True when a lever has the `enabled` flag explicitly off. Unset = on. */
function leverOff(lever: { enabled?: boolean } | undefined): boolean {
  return !!lever && lever.enabled === false;
}

/** Per-order ticket + cost adjustment from a single attach lever. Returns
 *  zero when the lever is disabled, so the operator can toggle on/off
 *  without losing the configured values. */
function attachDelta(
  lever: SimulationAttachLever | undefined,
): { ticket: number; cogs: number } {
  if (!lever || lever.enabled === false) return { ticket: 0, cogs: 0 };
  const ticket = lever.attachPct * lever.avgPriceGrosze;
  const cogs = lever.attachPct * lever.avgPriceGrosze * lever.cogsPct;
  return { ticket, cogs };
}

/** Volume multiplier for a single month (0=Jan, 11=Dec). Rain applies
 *  year-round; heatwaves fire only in Jun–Aug; the school-holiday lunch
 *  dip fires only in Jul–Aug. Used by both the headline annual-average
 *  view and the per-month 12-month projection. */
function monthVolumeMult(monthIndex: number, w: SimulationWeather | undefined): number {
  if (!w) return 1;
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

/** Average volume multiplier across all 12 months — the right composite
 *  for the headline "single typical month" view. */
function averageAnnualVolumeMult(w: SimulationWeather | undefined): number {
  if (!w) return 1;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += monthVolumeMult(i, w);
  return sum / 12;
}

/** Fold the behavior levers (attach rates, combo, recession stress,
 *  delivery share) into the per-order ticket + COGS. Returns a new
 *  scenario with updated avgTicketGrosze + cogsPct + paymentProcessorPct
 *  but the same ordersPerDay + daysOpenPerMonth (weather is separate). */
function applyAssumptions(s: SimulationScenario): SimulationScenario {
  const a = s.assumptions;
  if (!a) return s;

  let extraTicket = 0;
  let extraCogs = 0;
  let extraProcessorPct = 0;

  for (const lever of [
    a.coffeeAttach,
    a.dessertAttach,
    a.antipastiAttach,
    a.aperitivoAttach,
    a.premiumToppingsAttach,
    a.pastaPrimoAttach,
  ]) {
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
    const dShare = a.deliveryShare;
    // Fee revenue lifts the average ticket.
    extraTicket += dShare.pct * dShare.avgFeeGrosze;
    // Packaging is a real per-order cost-of-goods.
    extraCogs += dShare.pct * dShare.packagingCostGrosze;
    // Extra processor fee is a payment cost, not a goods cost — fold into
    // the effective paymentProcessorPct so it lands under "Payment fees"
    // in the cost pie. Applied as deliveryShare × extraRate × revenue
    // (correct because delivery orders are deliveryShare of total volume,
    // and the fee is computed on the full order revenue inc. delivery fee).
    extraProcessorPct += dShare.pct * dShare.extraProcessorPct;
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

  // Channel-blended payment rate. `paymentProcessorPct` on input is the
  // on-site card rate (Stripe/terminal ~1-2%); the blended rate folds
  // in cash (0%) and marketplace commissions (Glovo/Wolt 22-30%) so the
  // downstream `revenue × paymentProcessorPct` line is honest. The
  // legacy delivery-share lever's extraProcessorPct still piles onto the
  // on-site rate (a card-fee surcharge on the truck's own delivery
  // orders, not a marketplace commission).
  const cashShare = s.cashSharePct ?? 0;
  const glovoShare = s.glovoSharePct ?? 0;
  const woltShare = s.woltSharePct ?? 0;
  const glovoFee = s.glovoFeePct ?? 0;
  const woltFee = s.woltFeePct ?? 0;
  const onSiteCardShare = Math.max(0, 1 - cashShare - glovoShare - woltShare);
  const onSiteCardRate = (s.paymentProcessorPct ?? 0) + extraProcessorPct;
  const blendedProcessorPct =
    cashShare * 0 +
    onSiteCardShare * onSiteCardRate +
    glovoShare * glovoFee +
    woltShare * woltFee;

  return {
    ...s,
    avgTicketGrosze: newTicket,
    cogsPct: newCogsPct,
    paymentProcessorPct: Math.max(0, Math.min(1, blendedProcessorPct)),
  };
}

/** Annualised weather effects → ordersPerDay + daysOpen. Used by the
 *  headline view; the projection applies weather per-month instead. */
function applyAnnualWeather(s: SimulationScenario): SimulationScenario {
  const w = s.weather;
  if (!w) return s;
  const avgMult = averageAnnualVolumeMult(w);
  const daysOpen = Math.max(0, s.daysOpenPerMonth - w.holidayClosedDaysPerMonth);
  let ordersPerDay = s.ordersPerDay * avgMult;
  if (daysOpen > 0) {
    const baseDaily = s.ordersPerDay;
    const peakBonus = w.holidayPeakDaysPerMonth * (w.holidayPeakMultiplier - 1) * baseDaily;
    const eventBonus = w.eventDaysPerMonth * (w.eventDayMultiplier - 1) * baseDaily;
    ordersPerDay += (peakBonus + eventBonus) / daysOpen;
  }
  return {
    ...s,
    ordersPerDay,
    daysOpenPerMonth: daysOpen,
  };
}


/** Three saved-scenario archetypes derived from the active one. */
function deriveArchetypes(s: SimulationScenario) {
  const conservative: SimulationScenario = {
    ...s,
    ordersPerDay: Math.max(0, Math.round(s.ordersPerDay * 0.85)),
    cogsPct: Math.min(1, s.cogsPct + 0.02),
  };
  const optimistic: SimulationScenario = {
    ...s,
    ordersPerDay: Math.round(s.ordersPerDay * 1.15),
    cogsPct: Math.max(0, s.cogsPct - 0.02),
  };
  return { conservative, realistic: s, optimistic };
}

// --- Amateur-friendly explanations ---------------------------------------
//
// Every concept on this page has an InfoButton that opens a Dialog with
// the matching entry below. Written for someone who's never run a P&L
// before — short, concrete, with the formula and a worked example.

const HELP = {
  // Inputs
  ordersPerDay: {
    title: "Orders per day",
    body: (
      <>
        <p>
          The average number of orders the truck completes on a normal day. A typical
          Neapolitan pizza truck does 50–100/day; busy summer evenings can push 120+.
        </p>
        <p>
          <strong>Why it matters:</strong> revenue = orders × ticket × days open. Doubling
          this number roughly doubles revenue but only adds variable food cost — labor
          and rent are mostly fixed, so the extra orders are very profitable.
        </p>
      </>
    ),
  },
  avgTicket: {
    title: "Average ticket",
    body: (
      <>
        <p>
          The total each customer pays per order, all-in (pizza + sides + drink + tip
          excluded). Polish pizzerias run 60–72 zł when the menu has drinks and desserts.
        </p>
        <p>
          <strong>How to think about it:</strong> raise this by selling combos and
          add-ons rather than cranking pizza prices — customers notice price hikes,
          they don&apos;t notice that they added an espresso.
        </p>
        <p className="v2-muted text-sm">
          When the Menu mix card has weights, this field becomes display-only — the
          number is computed from how often each menu item sells.
        </p>
      </>
    ),
  },
  daysOpen: {
    title: "Days open per month",
    body: (
      <>
        <p>
          How many days each month the truck takes orders. 28 is typical (one day off
          per week). Closing extra days lets staff rest but loses ~3.6% of monthly
          revenue per day.
        </p>
        <p>
          <strong>Trade-off:</strong> 7-day operation maximises revenue but burns out
          staff. 6 days/week (~26 days/mo) is a sustainable sweet spot.
        </p>
      </>
    ),
  },
  cogsPct: {
    title: "Ingredient cost ratio (COGS %)",
    body: (
      <>
        <p>
          COGS = Cost Of Goods Sold. The share of revenue that gets eaten by
          ingredients. <strong>Polish pizzeria benchmark is 25–35%</strong>; under 30%
          is healthy, over 35% means recipes need re-engineering.
        </p>
        <p>
          <strong>Formula:</strong> if a pizza sells for 30 zł and the dough +
          tomato + mozzarella cost 9 zł, that&apos;s 30% COGS.
        </p>
        <p>
          When the Menu mix card is active, this number is computed from each
          item&apos;s actual recipe cost ÷ price, weighted by how often it sells.
        </p>
      </>
    ),
  },
  laborMix: {
    title: "Labor mix",
    body: (
      <>
        <p>
          Each row is one role on the team. Monthly cost = headcount × weekly hours
          × 4.345 weeks × hourly rate.
        </p>
        <p>
          <strong>Why 1.22× brutto:</strong> in Poland, the employer pays ZUS
          (social insurance) and Labor Fund <em>on top</em> of the gross wage —
          about 22% extra. So if a pizzaiolo&apos;s gross wage is 35 zł/h, the
          truck&apos;s real cost is ~43 zł/h. We bake this into the default rates
          so &quot;rate × hours&quot; lands at the full employer cost.
        </p>
        <p>
          <strong>Target:</strong> total labor should be ≤ 30% of revenue. The
          KPI strip lower down flags red/amber/green.
        </p>
      </>
    ),
  },
  fixedCosts: {
    title: "Fixed monthly costs",
    body: (
      <>
        <p>
          What you pay every month <em>regardless of how many orders you do</em>:
          rent, insurance, accountant, software, ZUS for the owner, etc. Variable
          costs (ingredients) live in COGS instead.
        </p>
        <p>
          <strong>Why split them out:</strong> fixed costs set your break-even
          point. If they go up by 1 000 zł/mo, you need more orders to cover them
          before you make any profit.
        </p>
      </>
    ),
  },
  menuScenario: {
    title: "Menu scenario",
    body: (
      <>
        <p>
          Pick one of five archetypal menu shapes for a Neapolitan pizza
          truck. Each preset overwrites the four Revenue inputs (orders/day,
          avg ticket, days open, COGS) <em>and</em> the six attach-rate
          levers (coffee, dessert, antipasti, aperitivo, premium toppings,
          pasta primo) — one click loads a coherent business model.
        </p>
        <ul style={{ margin: "8px 0", paddingLeft: 20, listStyle: "disc" }}>
          <li><strong>Takeaway classic</strong> — 100 ord/d × 45 zł, low attach</li>
          <li><strong>Balanced</strong> — 70 ord/d × 65 zł, mixed attach</li>
          <li><strong>Premium</strong> — 55 ord/d × 88 zł, high attach</li>
          <li><strong>Family / Group</strong> — 30 ord/d × 155 zł, weekend / events</li>
          <li><strong>Aperitivo / Dinner</strong> — 45 ord/d × 82 zł, drinks-led (needs alcohol licence)</li>
        </ul>
        <p>
          After applying a preset you can still tweak any value — the preset
          is a starting point, not a lock-in.
        </p>
      </>
    ),
  },

  // Behavior assumptions
  assumptionsOverview: {
    title: "Behavior assumptions",
    body: (
      <>
        <p>
          Instead of typing one flat average ticket, you describe customer
          behavior with levers like &quot;25% of orders add a coffee&quot; or
          &quot;20% of mains convert to a combo&quot;. The simulator does the
          math on top of the base ticket.
        </p>
        <p>
          Every lever folds into the same effective ticket + COGS that the rest
          of the page uses. Drag one slider and the headline KPIs, P&amp;L, pie
          chart, heatmaps, projection and break-even all update live.
        </p>
        <p>
          <strong>Toggle on/off:</strong> each lever has a green &quot;On&quot;
          pill in the corner. Click it to flip the lever off — its values stay
          configured but it&apos;s excluded from the math. Use this to isolate
          the impact of a single hypothesis (&quot;what would my P&amp;L look
          like without the coffee attach?&quot;) or use the <em>All off</em>
          {" "}button in the card header to see the raw baseline ticket × volume
          without any behavioral lifts.
        </p>
        <p className="v2-muted text-sm">
          Defaults are tuned to a Neapolitan truck in Warsaw 2026. Tune them to
          match your real attach data once you have it.
        </p>
      </>
    ),
  },
  coffeeAttach: {
    title: "Coffee attach rate",
    body: (
      <>
        <p>
          Share of orders that add an espresso, cappuccino or similar.
          25% means one in four customers takes coffee.
        </p>
        <p>
          <strong>Why it&apos;s gold:</strong> coffee is ~88% margin (an espresso
          uses about 1 zł of beans + milk for a 9 zł sell price). Every +10 pp
          on attach lifts your average ticket by ~0.90 zł at almost no extra cost.
        </p>
        <p>
          <strong>How to grow it:</strong> staff prompt at order
          (&quot;espresso with that?&quot;), combo deals, post-meal dessert+coffee bundle.
        </p>
      </>
    ),
  },
  dessertAttach: {
    title: "Dessert attach rate",
    body: (
      <>
        <p>
          Share of orders that add tiramisu, cannoli or panna cotta. 10–15% is
          typical; can push to 25% with strong dessert merchandising.
        </p>
        <p>
          <strong>Why it matters:</strong> desserts are ~28% COGS — better than
          pizza&apos;s 30%. So more dessert attach lifts AOV <em>and</em>
          improves the blended margin %.
        </p>
      </>
    ),
  },
  antipastiAttach: {
    title: "Antipasti / starter attach",
    body: (
      <>
        <p>
          Share of dine-in tables that order a starter — bruschetta (~22 zł),
          burrata (~28 zł), olives, mortadella plate. 5–10% baseline, much
          higher in evening service.
        </p>
        <p>
          <strong>Trade-off:</strong> bigger ticket but adds prep load on the
          line — make sure the antipasti station can keep up before pushing
          this lever.
        </p>
      </>
    ),
  },
  aperitivoAttach: {
    title: "Aperitivo / wine attach",
    body: (
      <>
        <p>
          Share of evening orders that include an Aperol Spritz, glass of wine,
          beer or limoncello. Highest-margin attach we can model — drinks are
          ~22% COGS at 22 zł a glass.
        </p>
        <p>
          <strong>Requires an alcohol licence.</strong> Use this lever to model
          &quot;what would happen if we got licensed?&quot; before paying the
          ~5 000 zł/year fee.
        </p>
      </>
    ),
  },
  premiumToppingsAttach: {
    title: "Premium toppings attach",
    body: (
      <>
        <p>
          Share of pizzas that add buffalo mozzarella (+6 zł), &apos;nduja
          (+7 zł), truffle oil (+9 zł) etc. Charge ~3 zł of marginal food
          cost, capture the rest as margin.
        </p>
        <p>
          <strong>Where the money is:</strong> ~50% incremental margin — among
          the cheapest ways to lift AOV.
        </p>
      </>
    ),
  },
  pastaPrimoAttach: {
    title: "Pasta primo attach",
    body: (
      <>
        <p>
          Share of dine-in tables that order a pasta course alongside the pizza
          (Italian-style: primo = pasta first, then pizza as secondo). Average
          32 zł, ~26% COGS.
        </p>
        <p>
          <strong>Big AOV bump.</strong> Best lever where seating allows — most
          relevant for indoor locations, less so for a takeaway truck.
        </p>
      </>
    ),
  },
  comboConversion: {
    title: "Combo conversion",
    body: (
      <>
        <p>
          What % of mains convert to a Combo (pizza + drink + dessert at a
          bundle discount of, say, 6 zł off vs à-la-carte).
        </p>
        <p>
          <strong>Why combos win:</strong> the combo pulls a second/third item
          that <em>wouldn&apos;t have attached on its own</em>. Even with the
          discount, the total order is bigger and the kitchen amortises one
          ticket across more units.
        </p>
        <p>
          <strong>Math:</strong> for each converted order, ticket goes up by
          (addon price − discount); food cost goes up by (addon × addon COGS%).
        </p>
      </>
    ),
  },
  cheapestPizzaShift: {
    title: "Cheapest-pizza shift (recession stress)",
    body: (
      <>
        <p>
          A <em>downside</em> stress lever. Customers under price pressure shift
          toward Margherita and Marinara (the cheapest pies). Set how many
          percentage points of share move, and the simulator drops AOV and COGS
          proportionally.
        </p>
        <p>
          <strong>Use it to ask:</strong> &quot;If economy gets bad enough that
          20% more orders are Margherita, do we still break even?&quot;
        </p>
        <p>
          <strong>Default is 0 pp</strong> — turn it on only when you want to
          model a stress scenario.
        </p>
      </>
    ),
  },
  deliveryShare: {
    title: "Delivery channel share",
    body: (
      <>
        <p>
          What % of orders go through delivery (vs takeaway / dine-in). Delivery
          changes the order economics in four places:
        </p>
        <ul style={{ margin: "8px 0", paddingLeft: 20, listStyle: "disc" }}>
          <li><strong>+ Packaging cost</strong> (boxes, bag, napkins) — ~2.50 zł/order</li>
          <li><strong>+ Extra processor fee</strong> if you use a different processor for delivery</li>
          <li><strong>+ Fee revenue</strong> if you charge a delivery fee (~8 zł)</li>
          <li><strong>Different cohort</strong> — delivery customers usually have lower attach</li>
        </ul>
        <p>
          Tune this to model channel-mix shifts: more delivery = more volume
          but worse per-order margin.
        </p>
      </>
    ),
  },

  // Weather + calendar
  ingredientLevers: {
    title: "Ingredient cost stress tests",
    body: (
      <>
        <p>
          Ten recipe + supplier &quot;what ifs&quot; that flex the base-pizza
          COGS. Each lever has two numbers:
        </p>
        <ul style={{ margin: "8px 0", paddingLeft: 20, listStyle: "disc" }}>
          <li>
            <strong>Share of COGS</strong> — what fraction of base-pizza
            food cost this ingredient represents. Calibrate to your actual
            recipe (mozz is ~28%, tomato ~10%, flour ~6%, etc).
          </li>
          <li>
            <strong>Cost change</strong> — the &quot;what if&quot; itself.
            +20% = supplier raised price 20% or recipe uses 20% more. −10% =
            cheaper supplier or trimmed portion.
          </li>
        </ul>
        <p>
          Impact = share × delta, applied to base-pizza COGS only. So a 25%
          cheese line getting 10% more expensive lifts total COGS by 2.5 pp.
          Attach items (coffee, dessert, etc) keep their own COGS.
        </p>
        <p className="v2-muted text-sm">
          Toggle a single lever off to compare with vs without, or use the
          {" "}<em>All off</em> button up top to clear every stress test.
        </p>
      </>
    ),
  },
  weatherOverview: {
    title: "Weather & calendar",
    body: (
      <>
        <p>
          Real-world volume isn&apos;t flat. Rainy days kill outdoor truck
          service; heatwaves drive patio crowds; Easter Sunday is closed; NYE
          is a peak. This block lets you model all of that.
        </p>
        <p>
          The levers compose into a single &quot;effective orders per day&quot;
          and &quot;effective days open&quot; — which then feed the whole P&amp;L
          downstream. Live preview at the bottom of the card shows you the
          composite impact.
        </p>
      </>
    ),
  },
  rainyDay: {
    title: "Rainy-day elasticity",
    body: (
      <>
        <p>
          Two knobs work together:
        </p>
        <ul style={{ margin: "8px 0", paddingLeft: 20, listStyle: "disc" }}>
          <li>
            <strong>Multiplier</strong> — how much rain hurts volume. 0.75 = rainy
            days run 25% below normal.
          </li>
          <li>
            <strong>Rainy share</strong> — what % of days are rainy in a typical
            month. Warsaw averages ~30%.
          </li>
        </ul>
        <p>
          <strong>Combined:</strong> 0.30 × 0.75 + 0.70 × 1.00 = 0.925, so the
          average month runs at 92.5% of theoretical volume just from rain.
        </p>
      </>
    ),
  },
  heatwave: {
    title: "Heatwave bonus",
    body: (
      <>
        <p>
          Hot patio evenings (25 °C+) drive +40% volume — people want to be
          outside, eat lighter, drink more. Set the multiplier and the share of
          evenings hot enough to fire it (~10% in Warsaw, way higher in summer
          months).
        </p>
        <p>
          <strong>Combine with seasonal multipliers</strong> — the simulator
          already has a quarterly summer bonus, this stacks on top for the hot
          evening micro-effect.
        </p>
      </>
    ),
  },
  holidayClosed: {
    title: "Holiday closed days / month",
    body: (
      <>
        <p>
          Days each month you&apos;re forced closed by the calendar — Easter
          Sunday, 15 August, 25 December, Boże Ciało (Corpus Christi),
          1 November. About 12 closed days a year ÷ 12 ≈ 1 per month average.
        </p>
        <p>
          <strong>Effect:</strong> reduces effective days open. If you&apos;re
          normally 28 days/mo and lose 1 day, you lose ~3.6% of monthly revenue.
        </p>
      </>
    ),
  },
  holidayPeak: {
    title: "Peak days",
    body: (
      <>
        <p>
          Calendar days that run hot: NYE, Valentine&apos;s, Mother&apos;s Day,
          Father&apos;s Day, Halloween, Black Friday. Set how many you have per
          month and a peak multiplier (default 1.60 = +60%).
        </p>
        <p>
          <strong>Why it matters:</strong> 5 peak days at 1.6× can add a whole
          extra normal day&apos;s revenue to the month. Worth investing in
          extra staffing on those nights.
        </p>
      </>
    ),
  },
  schoolHoliday: {
    title: "School-holiday lunch dip",
    body: (
      <>
        <p>
          July and August: schools closed, offices half-empty, lunch covers
          drop. Default multiplier 0.85 means 15% lunch-volume haircut, but
          only for those two months — the simulator averages 2/12 of the year
          for the headline.
        </p>
        <p>
          <strong>Counter-balance:</strong> tourists and outdoor festival
          evenings often more than make up for the lunch drop — make sure the
          summer seasonal multiplier (in Assumptions) reflects both effects.
        </p>
      </>
    ),
  },
  eventDays: {
    title: "Event days",
    body: (
      <>
        <p>
          Days when the truck pitch hosts a street fair, food-truck rally,
          Nocny Market, concert, sports event etc. You set how many per month
          and the multiplier (default 1.50 = +50%).
        </p>
        <p>
          <strong>How to use:</strong> if you&apos;ve booked the truck for a
          known festival weekend, bump event days to 2 and the multiplier to
          2.0× to see if it&apos;s worth the operational hassle.
        </p>
      </>
    ),
  },

  // Outputs
  pnlBreakdown: {
    title: "P&L breakdown",
    body: (
      <>
        <p>
          The classic top-down profit statement, one line per cost bucket:
        </p>
        <ol style={{ margin: "8px 0", paddingLeft: 20 }}>
          <li><strong>Revenue</strong> — orders × ticket × days</li>
          <li><strong>− Ingredients (COGS)</strong> — food cost</li>
          <li><strong>= Gross profit</strong> — what&apos;s left after food</li>
          <li><strong>− Labor</strong> — everyone on the team, drilled down by role</li>
          <li><strong>− Fixed costs</strong> — rent, software, accountant, etc</li>
          <li><strong>= Net profit / (loss)</strong> — the bottom line</li>
        </ol>
        <p>
          The sentence below the table says how far above or below break-even
          you&apos;re running — &quot;5.2 above&quot; means you&apos;re doing 5.2
          more orders/day than the minimum needed to not lose money.
        </p>
      </>
    ),
  },
  costShare: {
    title: "Cost share pie",
    body: (
      <>
        <p>
          Where each złoty goes. A healthy Neapolitan truck looks roughly:
        </p>
        <ul style={{ margin: "8px 0", paddingLeft: 20, listStyle: "disc" }}>
          <li>~30% ingredients</li>
          <li>~28% labor</li>
          <li>~8% fixed costs</li>
          <li>~2% card fees</li>
          <li>~30% net profit</li>
        </ul>
        <p>
          If labor or COGS slice gets above ~32%, drill into the source
          (recipe costs? schedule bloat?) before raising prices.
        </p>
      </>
    ),
  },
  operationsKpis: {
    title: "Operations KPIs",
    body: (
      <>
        <p>The eight numbers professional restaurateurs watch every week:</p>
        <ul style={{ margin: "8px 0", paddingLeft: 20, listStyle: "disc" }}>
          <li>
            <strong>Food cost % of revenue</strong> — ingredient discipline.
            Target ≤ 30%. Over 32% means recipes are leaking margin or prices
            are too soft.
          </li>
          <li>
            <strong>Labor % of revenue</strong> — target ≤ 30%. Over 35%? You&apos;re
            overstaffed or under-pricing.
          </li>
          <li>
            <strong>Prime cost %</strong> — COGS + labor as % of revenue. The
            single most-watched number in the industry; ≤ 60–65% is healthy.
          </li>
          <li>
            <strong>Contribution margin</strong> — share of each PLN of revenue
            left after ALL variable costs (COGS, payment fees, waste, refunds,
            loyalty burn) to cover fixed costs and profit. This is the honest
            cash-drop ratio per order. Below 50% and there&apos;s no room for
            rent shocks; below 40% the unit is structurally unprofitable.
          </li>
          <li>
            <strong>Margin of safety</strong> — how far revenue can fall before
            you hit break-even. Below 10% and one bad week wipes you out;
            above 25% is comfortable.
          </li>
          <li>
            <strong>Revenue per labor hour</strong> — how productive each
            staff-hour is. 90–140 zł/h is normal for Polish pizza service.
          </li>
          <li>
            <strong>Net profit per order</strong> — what&apos;s left after every
            cost. If this is &lt; 5 zł you have no buffer for refunds or waste.
          </li>
          <li>
            <strong>Setup payback</strong> — how many months of profit it takes
            to recoup the truck buildout cost. Investors look for &lt; 24 months.
          </li>
        </ul>
      </>
    ),
  },
  archetypes: {
    title: "Conservative / Realistic / Optimistic",
    body: (
      <>
        <p>
          Three side-by-side runs built automatically from your current inputs:
        </p>
        <ul style={{ margin: "8px 0", paddingLeft: 20, listStyle: "disc" }}>
          <li>
            <strong>Conservative</strong> — −15% orders + 2 percentage points
            worse COGS. &quot;What if everything goes a bit wrong?&quot;
          </li>
          <li>
            <strong>Realistic</strong> — your current scenario as entered.
          </li>
          <li>
            <strong>Optimistic</strong> — +15% orders + 2 pp better COGS.
            &quot;What if we execute well?&quot;
          </li>
        </ul>
        <p>
          <strong>Use it like this:</strong> if Conservative is still
          profitable, your business plan is sound. If Optimistic isn&apos;t
          much better than Realistic, you&apos;re bumping a structural ceiling
          — fix the model, not the marketing.
        </p>
      </>
    ),
  },
  heatmapOrders: {
    title: "Orders × Ticket heatmap",
    body: (
      <>
        <p>
          A 5×5 grid showing the net profit you&apos;d make at every
          combination of orders/day (X axis, ±30%) and average ticket (Y axis,
          ±30%). The centre cell is your current scenario.
        </p>
        <p>
          <strong>How to read it:</strong> green cells are profitable, red are
          losses. Move from the centre outward to ask
          &quot;if I could grow orders 20% <em>or</em> raise ticket 10%, which
          delivers more profit?&quot;.
        </p>
      </>
    ),
  },
  heatmapCogs: {
    title: "Food cost % × Ticket heatmap",
    body: (
      <>
        <p>
          The menu-engineering view. X axis = food cost ratio (±8 pp around
          current); Y axis = average ticket (±30%).
        </p>
        <p>
          <strong>Use it to answer:</strong> &quot;cut food cost 2 pp or raise
          ticket 5 zł — which wins?&quot; Comparing two cells diagonally
          across the centre tells you the trade-off immediately.
        </p>
      </>
    ),
  },
  assumptionsCard: {
    title: "Financial assumptions",
    body: (
      <>
        <p>
          The drivers behind the 12-month projection and payback calc:
        </p>
        <ul style={{ margin: "8px 0", paddingLeft: 20, listStyle: "disc" }}>
          <li>
            <strong>Wage inflation</strong> — annual % labor goes up. Poland
            2026 ~7% (min-wage hike + sector pressure).
          </li>
          <li>
            <strong>Ingredient inflation</strong> — annual % food costs grow.
            ~4% food CPI.
          </li>
          <li>
            <strong>Card processor fee</strong> — Stripe blended ~1.9% of revenue.
          </li>
          <li>
            <strong>Setup cost</strong> — total cost to launch the truck
            (vehicle + buildout + permits + working capital). Drives payback.
          </li>
          <li>
            <strong>Seasonal multipliers</strong> — winter/spring/summer/autumn
            volume swings. Pizza trucks peak in summer (1.3×) and dip hard in
            winter (0.7×).
          </li>
        </ul>
      </>
    ),
  },
  projection: {
    title: "12-month projection",
    body: (
      <>
        <p>
          The current scenario rolled forward 12 months. Each month applies the
          relevant seasonal multiplier and compounds wage + ingredient inflation
          to that point.
        </p>
        <p>
          <strong>Watch for:</strong> the gap between Revenue and Net profit
          widening — that&apos;s inflation eating margin. If the gap closes by
          month 12, you need to plan price increases now.
        </p>
        <p>
          The four KPIs below (12-mo revenue / costs / net profit / best vs
          worst month) summarise the whole year.
        </p>
      </>
    ),
  },
  breakEven: {
    title: "Break-even at multiple horizons",
    body: (
      <>
        <p>
          The minimum throughput needed to cover labor + fixed costs (variable
          food cost scales with volume so it cancels out). At break-even, net
          profit = 0 — anything above is profit, anything below is loss.
        </p>
        <p>
          Same number expressed at four scales — per hour, per day, per month,
          and the equivalent monthly revenue — so you can match it to whatever
          metric you watch during service.
        </p>
        <p>
          <strong>Worked example:</strong> if break-even = 45 orders/day and
          you&apos;re running 60, every order beyond 45 contributes
          (ticket × (1 − COGS% − card fee %)) zł of pure profit.
        </p>
      </>
    ),
  },
  sensitivity: {
    title: "±20% volume sensitivity",
    body: (
      <>
        <p>
          Five &quot;what if&quot; runs that flex orders/day by −20%, −10%, 0,
          +10%, +20%. Shows how net profit and margin respond.
        </p>
        <p>
          <strong>Why it matters:</strong> profit is a thin slice of revenue, so
          a small revenue swing causes a big profit swing. If a −10% volume
          drop tips you into the red, you&apos;re running on too thin a margin
          — raise prices, cut a fixed cost, or grow attach rates before
          opening day 1.
        </p>
      </>
    ),
  },
} as const;

export function AdminSimulation() {
  const toast = useToast();
  const [scenario, setScenario] = useState<SimulationScenario | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actuals, setActuals] = useState<SimulationActualsSnapshot | null>(null);
  const [menuEng, setMenuEng] = useState<SimulationMenuEngineeringLine[] | null>(null);
  const [cohorts, setCohorts] = useState<SimulationCohortSnapshot | null>(null);
  const [dayparts, setDayparts] = useState<SimulationDaypartLine[] | null>(null);
  const [hourly, setHourly] = useState<SimulationHourlyThroughputLine[] | null>(null);
  const [sssg, setSssg] = useState<SimulationSssgSnapshot | null>(null);
  const [seedConfirmOpen, setSeedConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const dirtyRef = useRef(false);

  const fetchScenario = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/simulation");
      if (res.ok) {
        const data = (await res.json()) as SimulationScenario;
        setScenario(normalizeScenario(data));
        dirtyRef.current = false;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScenario();
  }, [fetchScenario]);

  // Fetch real-order actuals once on mount. Cheap (in-memory aggregation
  // of orders); we refetch only when the operator clicks the refresh
  // chip in the actuals strip.
  const fetchActuals = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/simulation/actuals?days=90");
      if (res.ok) {
        const data = (await res.json()) as SimulationActualsSnapshot;
        setActuals(data);
      }
    } catch {
      // Non-fatal — the simulator works without actuals; we just lose the
      // ground-truth badge and the "Use actuals" button.
    }
  }, []);
  useEffect(() => {
    fetchActuals();
  }, [fetchActuals]);

  const fetchMenuEng = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/simulation/menu-engineering?days=90");
      if (res.ok) {
        const data = (await res.json()) as { items: SimulationMenuEngineeringLine[] };
        setMenuEng(data.items ?? []);
      }
    } catch {
      // Non-fatal — the matrix is informational only.
    }
  }, []);
  useEffect(() => {
    fetchMenuEng();
  }, [fetchMenuEng]);

  const fetchCohorts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/simulation/cohorts?days=180");
      if (res.ok) {
        const data = (await res.json()) as SimulationCohortSnapshot;
        setCohorts(data);
      }
    } catch {
      // Non-fatal — the cohort panel is informational only.
    }
  }, []);
  useEffect(() => {
    fetchCohorts();
  }, [fetchCohorts]);

  const fetchDayparts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/simulation/dayparts?days=90");
      if (res.ok) {
        const data = (await res.json()) as { dayparts: SimulationDaypartLine[] };
        setDayparts(data.dayparts ?? []);
      }
    } catch {
      // Non-fatal.
    }
  }, []);
  useEffect(() => {
    fetchDayparts();
  }, [fetchDayparts]);

  const cap = scenario?.kitchenCapacity?.pizzasPerHour ?? 0;
  const fetchHourly = useCallback(async () => {
    try {
      const url = `/api/admin/simulation/hourly?days=30${cap > 0 ? `&pizzasPerHour=${cap}` : ""}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as { hourly: SimulationHourlyThroughputLine[] };
        setHourly(data.hourly ?? []);
      }
    } catch {
      // Non-fatal.
    }
  }, [cap]);
  useEffect(() => {
    fetchHourly();
  }, [fetchHourly]);

  const fetchSssg = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/simulation/sssg?days=30");
      if (res.ok) {
        const data = (await res.json()) as SimulationSssgSnapshot;
        setSssg(data);
      }
    } catch {
      // Non-fatal.
    }
  }, []);
  useEffect(() => {
    fetchSssg();
  }, [fetchSssg]);

  const persist = useCallback(
    async (next: SimulationScenario, opts?: { quiet?: boolean }) => {
      setSaving(true);
      try {
        const res = await fetch("/api/admin/simulation", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        if (res.ok) {
          dirtyRef.current = false;
          if (!opts?.quiet) toast.success("Scenario saved");
        } else if (!opts?.quiet) {
          toast.error("Could not save scenario");
        }
      } finally {
        setSaving(false);
      }
    },
    [toast],
  );

  // Pure state update — never triggers side effects from inside the
  // setState updater (React forbids it). The autosave effect below
  // listens for `scenario` changes and debounces a save 1 s after the
  // last edit.
  const update = useCallback(
    (mut: (prev: SimulationScenario) => SimulationScenario) => {
      setScenario((prev) => (prev ? mut(prev) : prev));
      dirtyRef.current = true;
    },
    [],
  );

  // Debounced auto-save. Fires 1 s after `scenario` settles; the
  // initial load also marks dirty=false (in fetchScenario) so the
  // first idle tick doesn't re-save what we just fetched.
  useEffect(() => {
    if (!scenario || !dirtyRef.current) return;
    const handle = setTimeout(() => {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        persist(scenario, { quiet: true });
      }
    }, 1000);
    return () => clearTimeout(handle);
  }, [scenario, persist]);

  // Detect when the headline KPI row has actually pinned under the
  // topbar, so we can swap to a compact card layout while stuck.
  const kpiSectionRef = useRef<HTMLElement>(null);
  const [kpiStuck, setKpiStuck] = useState(false);
  useEffect(() => {
    if (loading) return;
    const onScroll = () => {
      const el = kpiSectionRef.current;
      if (!el) return;
      const topbar = document.querySelector(".v2-topbar, .v2-m-topbar") as HTMLElement | null;
      const offset = (topbar?.offsetHeight ?? 55) + 1;
      const next = el.getBoundingClientRect().top <= offset;
      setKpiStuck((prev) => (prev === next ? prev : next));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [loading]);

  // Two derived scenarios:
  //   leverScenario     = assumptions applied, weather NOT applied. Fed
  //                       to the projection so per-month weather lands
  //                       in the right months.
  //   effectiveScenario = leverScenario + annualised weather. Feeds the
  //                       headline KPIs, P&L, pie, heatmaps, archetypes
  //                       and ±20% sensitivity row.
  const leverScenario = useMemo<SimulationScenario | null>(() => {
    if (!scenario) return null;
    return applyAssumptions(scenario);
  }, [scenario]);
  const effectiveScenario = useMemo<SimulationScenario | null>(() => {
    if (!leverScenario) return null;
    return applyAnnualWeather(leverScenario);
  }, [leverScenario]);
  const computed = useMemo(
    () => (effectiveScenario ? computeScenario(effectiveScenario) : null),
    [effectiveScenario],
  );

  if (loading || !scenario || !computed) {
    return <div className="v2-page-loading">Loading simulation…</div>;
  }

  const seedFromHistory = async () => {
    setSeedConfirmOpen(false);
    const res = await fetch("/api/admin/simulation?seed=1");
    if (!res.ok) {
      toast.error("Could not seed from history");
      return;
    }
    const seeded = normalizeScenario((await res.json()) as SimulationScenario);
    setScenario(seeded);
    await persist(seeded);
    toast.success("Seeded from the last 30 days");
  };

  const resetToDefaults = async () => {
    setResetConfirmOpen(false);
    // Mirrors defaultSimulationScenario() in src/lib/store.ts — Warsaw
    // 2026 brutto × 1.22 narzut, food-truck pitch fees, 30% COGS.
    const defaults: SimulationScenario = {
      ordersPerDay: 70,
      avgTicketGrosze: 6500,
      daysOpenPerMonth: 28,
      cogsPct: 0.3,
      labor: [
        { id: "pizzaiolo", role: "pizzaiolo", headcount: 1, hoursPerWeek: 60, hourlyRateGrosze: 4300 },
        { id: "chef", role: "chef", headcount: 1, hoursPerWeek: 60, hourlyRateGrosze: 3700 },
        { id: "waiter", role: "waiter", headcount: 1, hoursPerWeek: 60, hourlyRateGrosze: 4000 },
        { id: "barista", role: "barista", headcount: 1, hoursPerWeek: 48, hourlyRateGrosze: 3900 },
        { id: "manager", role: "manager", headcount: 1, hoursPerWeek: 40, hourlyRateGrosze: 5500 },
      ],
      fixedCosts: {
        rent: 250_000,
        utilities: 120_000,
        fuel: 80_000,
        vehicle: 70_000,
        insurance: 60_000,
        licenses: 25_000,
        marketing: 150_000,
        software: 25_000,
        professional: 40_000,
        tax: 180_000,
        maintenance: 40_000,
        other: 30_000,
      },
      wageInflationPct: 0.07,
      ingredientInflationPct: 0.04,
      paymentProcessorPct: 0.019,
      setupCostGrosze: 25_000_000,
      seasonality: { winter: 0.7, spring: 1.0, summer: 1.3, autumn: 1.0 },
      menuScenario: "balanced",
      assumptions: DEFAULT_ASSUMPTIONS,
      weather: DEFAULT_WEATHER,
      updatedAt: new Date().toISOString(),
    };
    setScenario(defaults);
    await persist(defaults);
    toast.success("Reset to defaults");
  };

  const addLaborRow = () => {
    update((s) => ({
      ...s,
      labor: [
        ...s.labor,
        {
          id: `line-${crypto.randomUUID()}`,
          role: "other",
          headcount: 1,
          hoursPerWeek: 40,
          hourlyRateGrosze: 2500,
        },
      ],
    }));
  };

  const removeLaborRow = (id: string) => {
    update((s) => ({ ...s, labor: s.labor.filter((l) => l.id !== id) }));
  };

  const updateLabor = (id: string, patch: Partial<SimulationLaborLine>) => {
    update((s) => ({
      ...s,
      labor: s.labor.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  };

  const applyMenuScenario = (preset: MenuScenarioPreset) => {
    update((s) => ({
      ...s,
      menuScenario: preset.id,
      ordersPerDay: preset.ordersPerDay,
      daysOpenPerMonth: preset.daysOpenPerMonth,
      avgTicketGrosze: preset.avgTicketGrosze,
      cogsPct: preset.cogsPct,
      assumptions: {
        ...(s.assumptions ?? DEFAULT_ASSUMPTIONS),
        coffeeAttach: {
          ...(s.assumptions?.coffeeAttach ?? DEFAULT_ASSUMPTIONS.coffeeAttach!),
          enabled: true,
          attachPct: preset.attach.coffee,
        },
        dessertAttach: {
          ...(s.assumptions?.dessertAttach ?? DEFAULT_ASSUMPTIONS.dessertAttach!),
          enabled: true,
          attachPct: preset.attach.dessert,
        },
        antipastiAttach: {
          ...(s.assumptions?.antipastiAttach ?? DEFAULT_ASSUMPTIONS.antipastiAttach!),
          enabled: true,
          attachPct: preset.attach.antipasti,
        },
        aperitivoAttach: {
          ...(s.assumptions?.aperitivoAttach ?? DEFAULT_ASSUMPTIONS.aperitivoAttach!),
          enabled: true,
          attachPct: preset.attach.aperitivo,
        },
        premiumToppingsAttach: {
          ...(s.assumptions?.premiumToppingsAttach ?? DEFAULT_ASSUMPTIONS.premiumToppingsAttach!),
          enabled: true,
          attachPct: preset.attach.premiumToppings,
        },
        pastaPrimoAttach: {
          ...(s.assumptions?.pastaPrimoAttach ?? DEFAULT_ASSUMPTIONS.pastaPrimoAttach!),
          enabled: true,
          attachPct: preset.attach.pastaPrimo,
        },
      },
    }));
    toast.success(
      `${preset.name} loaded`,
      `${preset.ordersPerDay} ord/day · ${formatPrice(preset.avgTicketGrosze)} ticket · ${Math.round(preset.cogsPct * 100)}% COGS`,
    );
  };

  const updateFixed = (key: BusinessCostCategory, plnStr: string) => {
    const pln = parseFloat(plnStr || "0");
    const grosze = Number.isFinite(pln) ? Math.max(0, Math.round(pln * 100)) : 0;
    update((s) => ({ ...s, fixedCosts: { ...s.fixedCosts, [key]: grosze } }));
  };

  const sensitivities = [-0.2, -0.1, 0, 0.1, 0.2].map((delta) => {
    const flexed: SimulationScenario = {
      ...effectiveScenario!,
      ordersPerDay: Math.max(0, Math.round(effectiveScenario!.ordersPerDay * (1 + delta))),
    };
    return { delta, computed: computeScenario(flexed) };
  });

  const pieData = [
    { name: "Ingredients (COGS)", value: computed.monthlyCogs / 100 },
    { name: "Labor", value: computed.laborMonthly / 100 },
    { name: "Fixed costs", value: computed.fixedTotal / 100 },
    ...(computed.paymentFees > 0
      ? [{ name: "Payment fees", value: computed.paymentFees / 100 }]
      : []),
    ...(computed.wasteCost > 0
      ? [{ name: "Waste & spoilage", value: computed.wasteCost / 100 }]
      : []),
    ...(computed.refundLoss > 0
      ? [{ name: "Refunds & comps", value: computed.refundLoss / 100 }]
      : []),
    ...(computed.loyaltyCost > 0
      ? [{ name: "Loyalty burn", value: computed.loyaltyCost / 100 }]
      : []),
    ...(computed.citAmount > 0
      ? [{ name: "Corporate income tax", value: computed.citAmount / 100 }]
      : []),
    ...(computed.netProfit > 0
      ? [{ name: "Net profit (after tax)", value: computed.netProfit / 100 }]
      : []),
  ];

  const profitTone = computed.netProfit >= 0 ? "success" : "danger";

  // Matrices, archetypes and 12-month projection — all recompute every
  // render because the underlying math is cheap (≤ 100 cells × ~15 ns).
  const ordersTicketMatrix = buildMatrix(effectiveScenario!, "orders", "ticket", 5, 0.3);
  const cogsTicketMatrix = buildMatrix(effectiveScenario!, "cogs", "ticket", 5, 0.08);
  // 24-month investor-view projection with a 4-month opening ramp.
  // Used for NPV / IRR / cumulative-cash break-even — not the steady-
  // state 12-month operational chart.
  const investorProjection = projectMonths(leverScenario!, 24, 0, 4);
  const monthlyNetGrosze = investorProjection.map((r) => r.netProfit * 100);
  const investorReturns = computeReturns(
    monthlyNetGrosze,
    scenario.setupCostGrosze ?? 0,
  );
  const tornado = computeTornado(effectiveScenario!);
  // Channel economics uses the RAW scenario so the on-site card rate is the
  // operator's input, not the blended one applyAssumptions produced.
  const channels = computeChannelEconomics(scenario);
  const attachEfficiency = computeAttachmentEfficiency(effectiveScenario!);
  const fleetEcon = computeFleetEconomics(scenario, scenario.setupCostGrosze ?? 0);
  const prepFlow = computePrepFlow(scenario);
  const shiftPlan = computeShiftPlan(scenario, dayparts);
  const archetypes = deriveArchetypes(effectiveScenario!);
  const archetypeRows = [
    { key: "conservative", label: "Conservative", scenario: archetypes.conservative, hint: "−15% orders · +2pp COGS" },
    { key: "realistic", label: "Realistic (current)", scenario: archetypes.realistic, hint: "as entered" },
    { key: "optimistic", label: "Optimistic", scenario: archetypes.optimistic, hint: "+15% orders · −2pp COGS" },
  ];
  const projection = projectTwelveMonths(leverScenario!);
  const projectionTotals = projection.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      cogs: acc.cogs + r.cogs,
      labor: acc.labor + r.labor,
      fixed: acc.fixed + r.fixed,
      payment: acc.payment + r.payment,
      netProfit: acc.netProfit + r.netProfit,
    }),
    { revenue: 0, cogs: 0, labor: 0, fixed: 0, payment: 0, netProfit: 0 },
  );
  const seasonality = scenario.seasonality ?? DEFAULT_SEASONALITY;

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="v2-page-title">Simulation</h1>
            <Badge tone="warning" variant="soft" dot>
              Sandbox — not the real ledger
            </Badge>
          </div>
          <p className="v2-page-subtitle">
            Sandbox monthly P&amp;L. Enter realistic orders, ticket size, labor mix and fixed costs;
            see revenue, cost-by-category, net profit, margin and break-even update live. Edits
            never write to the business-costs ledger. Defaults reflect a Neapolitan pizza truck in
            Warsaw 2026 with a 12:00–22:00 service window plus prep + close-down (~11 h/day),
            hourly rates already include the ~22% ZUS pracodawcy narzut, food-truck pitch fees,
            and 30% blended COGS.
          </p>
        </div>
        <div className="v2-page-actions">
          <Button
            variant="ghost"
            leadingIcon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => setResetConfirmOpen(true)}
          >
            Reset defaults
          </Button>
          <Button
            variant="secondary"
            leadingIcon={<Database className="h-3.5 w-3.5" />}
            onClick={() => setSeedConfirmOpen(true)}
          >
            Seed from last 30 days
          </Button>
          <Button
            variant="primary"
            leadingIcon={<Save className="h-3.5 w-3.5" />}
            onClick={() => persist(scenario)}
            loading={saving}
          >
            Save scenario
          </Button>
        </div>
      </header>

      <section
        ref={kpiSectionRef}
        className={`v2-kpi-grid v2-kpi-grid-sticky${kpiStuck ? " is-stuck" : ""}`}
      >
        <KpiCard
          label="Monthly revenue"
          value={computed.monthlyRevenue / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Wallet}
          tone="brand"
          hint={`${scenario.ordersPerDay} orders/day × ${scenario.daysOpenPerMonth} days`}
        />
        <KpiCard
          label="Total cost"
          value={computed.totalCost / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Banknote}
          tone="warning"
          hint={`COGS + labor + fixed`}
        />
        <KpiCard
          label="Net profit"
          value={computed.netProfit / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={computed.netProfit >= 0 ? TrendingUp : TrendingDown}
          tone={profitTone}
          hint={`${(computed.margin * 100).toFixed(1)}% margin`}
        />
        <KpiCard
          label="Break-even"
          value={computed.breakEvenOrdersPerDay}
          format={(n) => `${n.toFixed(1)} orders/day`}
          icon={Calculator}
          tone="info"
          hint={`@ ${formatPrice(scenario.avgTicketGrosze)} ticket`}
        />
      </section>

      {actuals && actuals.ordersCount > 0 && (
        <ActualsStrip
          actuals={actuals}
          scenario={scenario}
          onApply={() => {
            update((s) => ({
              ...s,
              ordersPerDay: Math.max(1, Math.round(actuals.ordersPerDay)),
              avgTicketGrosze: Math.max(0, Math.round(actuals.avgTicketGrosze)),
              cogsPct: actuals.weightedCogsPct > 0
                ? Math.max(0, Math.min(1, actuals.weightedCogsPct))
                : s.cogsPct,
              refundPct: actuals.refundPct > 0 ? actuals.refundPct : s.refundPct,
              assumptions: s.assumptions?.deliveryShare && actuals.deliverySharePct > 0
                ? {
                    ...s.assumptions,
                    deliveryShare: {
                      ...s.assumptions.deliveryShare,
                      pct: Math.max(0, Math.min(1, actuals.deliverySharePct)),
                    },
                  }
                : s.assumptions,
            }));
            toast.success("Scenario aligned to last-90-day actuals");
          }}
          onRefresh={fetchActuals}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4">
        <Card>
          <CardHeader
            title="Revenue inputs"
            description="Volume and ticket assumptions."
            actions={<InfoButton title="Revenue inputs" label="About revenue inputs"><p>The four numbers that drive the top of your P&amp;L. Each has its own info button next to the input — click those for a deeper dive into orders/day, ticket size, days open and COGS.</p></InfoButton>}
          />
          <CardBody>
            <div className="v2-stack-12">
              <Input
                label={
                  <span className="flex items-center gap-2">
                    <LabelWithInfo text="Orders per day" help={HELP.ordersPerDay} />
                    {sourceTagFor(actuals?.ordersPerDay, scenario.ordersPerDay, actuals)}
                  </span>
                }
                type="number"
                min="0"
                value={String(scenario.ordersPerDay)}
                onChange={(e) =>
                  update((s) => ({ ...s, ordersPerDay: Math.max(0, (parseInt(e.target.value, 10) || 0)) }))
                }
              />
              <Input
                label={
                  <span className="flex items-center gap-2">
                    <LabelWithInfo text="Average ticket" help={HELP.avgTicket} />
                    {sourceTagFor(actuals?.avgTicketGrosze, scenario.avgTicketGrosze, actuals)}
                  </span>
                }
                type="number"
                step="0.01"
                min="0"
                value={(scenario.avgTicketGrosze / 100).toFixed(2)}
                onChange={(e) =>
                  update((s) => ({
                    ...s,
                    avgTicketGrosze: Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100)),
                  }))
                }
                trailingAdornment={<span className="v2-muted">zł</span>}
              />
              <Input
                label={
                  <span className="flex items-center gap-2">
                    <LabelWithInfo text="Days open per month" help={HELP.daysOpen} />
                    <SourceTag kind="assumption" hint="No real-data source — operator-typed." />
                  </span>
                }
                type="number"
                min="0"
                max="31"
                value={String(scenario.daysOpenPerMonth)}
                onChange={(e) =>
                  update((s) => ({
                    ...s,
                    daysOpenPerMonth: Math.max(0, Math.min(31, (parseInt(e.target.value, 10) || 0))),
                  }))
                }
              />
              <Input
                label={
                  <span className="flex items-center gap-2">
                    <LabelWithInfo text="Ingredient cost ratio" help={HELP.cogsPct} />
                    {sourceTagFor(
                      actuals && actuals.weightedCogsPct > 0 ? actuals.weightedCogsPct : undefined,
                      scenario.cogsPct,
                      actuals,
                    )}
                  </span>
                }
                type="number"
                step="1"
                min="0"
                max="100"
                value={String(Math.round(scenario.cogsPct * 100))}
                onChange={(e) =>
                  update((s) => ({
                    ...s,
                    cogsPct: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)),
                  }))
                }
                trailingAdornment={<span className="v2-muted">%</span>}
                description="Share of revenue eaten by food cost. 28–32% is typical for pizza + pasta + coffee."
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                Labor mix
                {scenario.labor.some((l) => l.id.startsWith("seed-")) ? (
                  <SourceTag
                    kind="ledger"
                    hint="At least one row was seeded from the BusinessCost payroll ledger."
                  />
                ) : (
                  <SourceTag
                    kind="assumption"
                    hint="No payroll lines in the ledger — using defaults. Seed from ledger via the 'Seed from history' button."
                  />
                )}
              </span>
            }
            description="Per-role headcount × weekly hours × hourly rate. Default rates are Warsaw 2026 brutto × 1.22 (full employer cost incl. ZUS narzut). Divide by 1.22 if you'd rather think in pure brutto."
            actions={
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <InfoButton title={HELP.laborMix.title} label="About labor mix">{HELP.laborMix.body}</InfoButton>
              <Button size="sm" variant="ghost" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={addLaborRow}>
                Add row
              </Button>
              </span>
            }
          />
          <CardBody>
            <div className="v2-stack-12">
              {scenario.labor.map((line) => {
                const monthly = Math.round(
                  line.headcount * line.hoursPerWeek * WEEKS_PER_MONTH * line.hourlyRateGrosze,
                );
                return (
                  <div key={line.id} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-12 md:col-span-4">
                      <Select
                        label="Role"
                        value={line.role}
                        onChange={(e) =>
                          updateLabor(line.id, { role: e.target.value as BusinessCostPayrollRole })
                        }
                        options={(Object.keys(PAYROLL_ROLE_LABEL) as BusinessCostPayrollRole[]).map(
                          (k) => ({ value: k, label: PAYROLL_ROLE_LABEL[k] }),
                        )}
                      />
                    </div>
                    <div className="col-span-3 md:col-span-2">
                      <Input
                        label="Count"
                        type="number"
                        min="0"
                        value={String(line.headcount)}
                        onChange={(e) =>
                          updateLabor(line.id, {
                            headcount: Math.max(0, (parseInt(e.target.value, 10) || 0)),
                          })
                        }
                      />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <Input
                        label="h / wk"
                        type="number"
                        min="0"
                        value={String(line.hoursPerWeek)}
                        onChange={(e) =>
                          updateLabor(line.id, {
                            hoursPerWeek: Math.max(0, (parseInt(e.target.value, 10) || 0)),
                          })
                        }
                      />
                    </div>
                    <div className="col-span-4 md:col-span-3">
                      <Input
                        label="zł / h"
                        type="number"
                        step="0.5"
                        min="0"
                        value={(line.hourlyRateGrosze / 100).toFixed(2)}
                        onChange={(e) =>
                          updateLabor(line.id, {
                            hourlyRateGrosze: Math.max(
                              0,
                              Math.round((parseFloat(e.target.value) || 0) * 100),
                            ),
                          })
                        }
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeLaborRow(line.id)}
                        aria-label={`Remove ${PAYROLL_ROLE_LABEL[line.role]} row`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="col-span-12 text-xs v2-muted -mt-1">
                      Monthly cost on this line: <strong>{formatPrice(monthly)}</strong>
                    </div>
                  </div>
                );
              })}
              {scenario.labor.length === 0 && (
                <div className="v2-muted text-sm">
                  No labor rows. Add at least one to capture payroll.
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Fixed monthly costs"
            description="What you pay every month regardless of orders."
            actions={<InfoButton title={HELP.fixedCosts.title} label="About fixed costs">{HELP.fixedCosts.body}</InfoButton>}
          />
          <CardBody>
            <div className="grid grid-cols-2 gap-2">
              {FIXED_COST_FIELDS.map((f) => (
                <Input
                  key={f.key}
                  label={f.label}
                  type="number"
                  step="0.01"
                  min="0"
                  value={((scenario.fixedCosts[f.key] ?? 0) / 100).toFixed(2)}
                  onChange={(e) => updateFixed(f.key, e.target.value)}
                  trailingAdornment={<span className="v2-muted">zł</span>}
                />
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <MenuScenarioPicker
        activeId={scenario.menuScenario}
        onPick={applyMenuScenario}
      />

      <BehaviorAssumptionsCard
        assumptions={scenario.assumptions ?? DEFAULT_ASSUMPTIONS}
        baseTicketGrosze={scenario.avgTicketGrosze}
        baseCogsPct={scenario.cogsPct}
        onChange={(next) => update((s) => ({ ...s, assumptions: next }))}
      />

      <WeatherCalendarCard
        weather={scenario.weather ?? DEFAULT_WEATHER}
        baseOrdersPerDay={scenario.ordersPerDay}
        baseDaysOpen={scenario.daysOpenPerMonth}
        onChange={(next) => update((s) => ({ ...s, weather: next }))}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
        <Card>
          <CardHeader
            title="Profit & loss breakdown"
            description="Top-down monthly P&L using the inputs above."
            actions={
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <InfoButton title={HELP.pnlBreakdown.title} label="About the P&L breakdown">{HELP.pnlBreakdown.body}</InfoButton>
                <FlaskConical className="h-4 w-4 v2-muted" />
              </span>
            }
          />
          <CardBody>
            <ul className="v2-mov-list">
              <PnlRow label="Revenue" amount={computed.monthlyRevenue} tone="brand" bold />
              <PnlRow label={`Ingredients (${Math.round(scenario.cogsPct * 100)}%)`} amount={-computed.monthlyCogs} tone="warning" indent />
              <PnlRow label="Gross profit" amount={computed.monthlyRevenue - computed.monthlyCogs} tone="info" bold />
              <PnlRow label="Labor" amount={-computed.laborMonthly} tone="warning" indent />
              {computed.laborByRole
                .filter((r) => r.grosze > 0)
                .sort((a, b) => b.grosze - a.grosze)
                .map((r) => (
                  <PnlRow
                    key={r.role}
                    label={PAYROLL_ROLE_LABEL[r.role]}
                    amount={-r.grosze}
                    tone="neutral"
                    indent
                    indent2
                    small
                  />
                ))}
              <PnlRow label="Fixed costs" amount={-computed.fixedTotal} tone="warning" indent />
              {FIXED_COST_FIELDS.filter((f) => (scenario.fixedCosts[f.key] ?? 0) > 0).map((f) => (
                <PnlRow
                  key={f.key}
                  label={f.label}
                  amount={-(scenario.fixedCosts[f.key] ?? 0)}
                  tone="neutral"
                  indent
                  indent2
                  small
                />
              ))}
              {computed.paymentFees > 0 && (
                <PnlRow label="Payment fees" amount={-computed.paymentFees} tone="warning" indent />
              )}
              {computed.packagingCost > 0 && (
                <PnlRow label="Packaging" amount={-computed.packagingCost} tone="warning" indent />
              )}
              {computed.wasteCost > 0 && (
                <PnlRow label="Waste & spoilage" amount={-computed.wasteCost} tone="warning" indent />
              )}
              {computed.refundLoss > 0 && (
                <PnlRow label="Refunds & comps" amount={-computed.refundLoss} tone="warning" indent />
              )}
              {computed.loyaltyCost > 0 && (
                <PnlRow label="Loyalty burn" amount={-computed.loyaltyCost} tone="warning" indent />
              )}
              {computed.marketingCac > 0 && (
                <PnlRow label="Marketing (CAC)" amount={-computed.marketingCac} tone="warning" indent />
              )}
              <PnlRow
                label="EBITDA"
                amount={computed.ebitda}
                tone={computed.ebitda >= 0 ? "info" : "danger"}
                bold
                hint={`${monthlyRevenuePctOrDash(computed.ebitda, computed.monthlyRevenue)} margin`}
              />
              {computed.depreciation > 0 && (
                <PnlRow label="Depreciation & amortisation" amount={-computed.depreciation} tone="warning" indent />
              )}
              {computed.depreciation > 0 && (
                <PnlRow label="EBIT" amount={computed.ebit} tone={computed.ebit >= 0 ? "info" : "danger"} bold />
              )}
              {computed.interest > 0 && (
                <PnlRow label="Interest" amount={-computed.interest} tone="warning" indent />
              )}
              <PnlRow
                label="Pre-tax profit / (loss)"
                amount={computed.preTaxProfit}
                tone={computed.preTaxProfit >= 0 ? "info" : "danger"}
                bold
              />
              {computed.citAmount > 0 && (
                <PnlRow
                  label={`Corporate income tax (${Math.round((scenario.citPct ?? 0) * 100)}%)`}
                  amount={-computed.citAmount}
                  tone="warning"
                  indent
                />
              )}
              <PnlRow
                label="Net profit / (loss) after tax"
                amount={computed.netProfit}
                tone={profitTone}
                bold
                hint={`${(computed.margin * 100).toFixed(1)}% margin`}
              />
            </ul>
            <div className="v2-muted text-sm mt-3">
              Break-even: <strong>{computed.breakEvenOrdersPerDay.toFixed(1)} orders/day</strong> at
              the current ticket — currently running{" "}
              <strong>
                {scenario.ordersPerDay >= computed.breakEvenOrdersPerDay
                  ? `${(scenario.ordersPerDay - computed.breakEvenOrdersPerDay).toFixed(1)} above`
                  : `${(computed.breakEvenOrdersPerDay - scenario.ordersPerDay).toFixed(1)} below`}{" "}
              </strong>
              break-even.
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Cost share"
            description="Where each złoty goes."
            actions={
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <InfoButton title={HELP.costShare.title} label="About the cost-share pie">{HELP.costShare.body}</InfoButton>
                <ChefHat className="h-4 w-4 v2-muted" />
              </span>
            }
          />
          <CardBody>
            <PieChart
              data={pieData}
              height={280}
              format={(n, name) => `${name}: ${Math.round(n).toLocaleString("pl-PL")} zł`}
            />
          </CardBody>
        </Card>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
        <h2 className="v2-section-h" style={{ margin: 0 }}>Operations KPIs</h2>
        <InfoButton title={HELP.operationsKpis.title} label="About operations KPIs">{HELP.operationsKpis.body}</InfoButton>
      </div>
      <section className="v2-kpi-grid">
        <KpiCard
          label="Food cost % revenue"
          value={computed.foodCostPct * 100}
          format={(n) => `${n.toFixed(1)}%`}
          icon={Utensils}
          tone={computed.foodCostPct > 0.32 ? "danger" : computed.foodCostPct > 0.28 ? "warning" : "success"}
          hint="Industry target ≤ 30%"
        />
        <KpiCard
          label="Labor cost % revenue"
          value={computed.laborPct * 100}
          format={(n) => `${n.toFixed(1)}%`}
          icon={ChefHat}
          tone={computed.laborPct > 0.32 ? "danger" : computed.laborPct > 0.28 ? "warning" : "success"}
          hint="Restaurant target ≤ 30%"
        />
        <KpiCard
          label="Prime cost % revenue"
          value={computed.primeCostPct * 100}
          format={(n) => `${n.toFixed(1)}%`}
          icon={Scale}
          tone={computed.primeCostPct > 0.65 ? "danger" : computed.primeCostPct > 0.6 ? "warning" : "success"}
          hint="COGS + labor — keep ≤ 60–65%"
        />
        <KpiCard
          label="Contribution margin"
          value={computed.trueContributionMarginPct * 100}
          format={(n) => `${n.toFixed(1)}%`}
          icon={Percent}
          tone={computed.trueContributionMarginPct < 0.50 ? "danger" : computed.trueContributionMarginPct < 0.60 ? "warning" : "success"}
          hint={`After COGS, fees, waste, refunds, loyalty (was ${(computed.contributionMarginPct * 100).toFixed(1)}% upper-bound)`}
        />
        <KpiCard
          label="Margin of safety"
          value={computed.marginOfSafetyPct * 100}
          format={(n) => `${n.toFixed(1)}%`}
          icon={Shield}
          tone={computed.marginOfSafetyPct < 0.1 ? "danger" : computed.marginOfSafetyPct < 0.25 ? "warning" : "success"}
          hint="Demand drop you can absorb"
        />
        <KpiCard
          label="Revenue / labor hour"
          value={computed.revenuePerLaborHour / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Gauge}
          tone="info"
          hint={`${Math.round(computed.laborHoursPerMonth).toLocaleString("pl-PL")} labor h/mo`}
        />
        <KpiCard
          label="Setup payback"
          value={computed.paybackMonths ?? 0}
          display={
            computed.paybackMonths === null
              ? "—"
              : computed.paybackMonths > 120
                ? "10y+"
                : `${computed.paybackMonths.toFixed(1)} mo`
          }
          icon={PiggyBank}
          tone={
            computed.paybackMonths === null
              ? "neutral"
              : computed.paybackMonths > 36
                ? "danger"
                : computed.paybackMonths > 18
                  ? "warning"
                  : "success"
          }
          hint={`Setup ${formatPrice(scenario.setupCostGrosze ?? 0)}`}
        />
        {computed.capacityOrdersPerDay > 0 && (
          <KpiCard
            label="Kitchen capacity"
            value={computed.capacityUtilization * 100}
            format={(n) => `${n.toFixed(0)}%`}
            icon={Flame}
            tone={
              computed.capacityUtilization > 1
                ? "danger"
                : computed.capacityUtilization > 0.85
                  ? "warning"
                  : computed.capacityUtilization > 0.6
                    ? "info"
                    : "success"
            }
            hint={`Peak ceiling ${Math.round(computed.capacityOrdersPerDay)} ord/day · running ${Math.round(scenario.ordersPerDay)}`}
          />
        )}
        {hourly && hourly.some((h) => h.totalOrders > 0) && (() => {
          const peak = Math.max(...hourly.map((h) => h.avgOrdersPerHour));
          const peakHour = hourly.findIndex((h) => h.avgOrdersPerHour === peak);
          const cap = scenario.kitchenCapacity?.pizzasPerHour ?? 0;
          return (
            <KpiCard
              label="Peak orders / hour"
              value={peak}
              format={(n) => n.toFixed(1)}
              icon={TrendingUp}
              tone={
                cap > 0 && peak > cap
                  ? "danger"
                  : cap > 0 && peak > cap * 0.85
                    ? "warning"
                    : "info"
              }
              hint={`${peakHour.toString().padStart(2, "0")}:00${cap > 0 ? ` · cap ${cap}/h` : ""}`}
            />
          );
        })()}
        {actuals?.medianTicketTimeSeconds !== null && actuals?.medianTicketTimeSeconds !== undefined && (
          <KpiCard
            label="Median ticket time"
            value={actuals.medianTicketTimeSeconds / 60}
            format={(n) => `${n.toFixed(1)} min`}
            icon={Clock}
            tone={
              actuals.medianTicketTimeSeconds <= 600
                ? "success"
                : actuals.medianTicketTimeSeconds <= 900
                  ? "info"
                  : actuals.medianTicketTimeSeconds <= 1800
                    ? "warning"
                    : "danger"
            }
            hint="From createdAt → estimatedReadyAt"
          />
        )}
      </section>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
        <h2 className="v2-section-h" style={{ margin: 0 }}>Institutional financial KPIs</h2>
        <InfoButton title="Institutional KPIs" label="About the institutional KPI strip">
          <p>
            The metrics an investment committee reads first.
          </p>
          <ul>
            <li><strong>EBITDA</strong> = revenue − all variable costs − labor − fixed (excluding D&amp;A and interest). The headline cash-generation number that institutional underwriters quote.</li>
            <li><strong>EBITDAR</strong> = EBITDA + rent. Rent-adjusted so chains with different real-estate strategies are comparable; the franchise-rollup standard.</li>
            <li><strong>Cash-on-cash</strong> = annualised net profit ÷ setup cost. The only multi-unit return metric LPs care about. ≥ 30% = success, ≥ 15% = acceptable, &lt; 0 = capital destruction.</li>
            <li><strong>Occupancy ratio</strong> = rent ÷ revenue. QSR target &lt; 8%, &gt; 12% = real-estate overspend.</li>
            <li><strong>Net sales</strong> = revenue − refunds. The honest top-line after voids / comps.</li>
            <li><strong>Contribution / labor hour</strong> = monthly contribution ÷ labor hours. The labor KPI that actually drives staffing decisions. QSR target ≥ 150 zł/hr.</li>
            <li><strong>Promo-adjusted AOV</strong> = avg ticket × (1 − loyalty burn). The honest ticket after the loyalty engine&apos;s effective discount.</li>
            <li><strong>True CM1 / order</strong> = revenue − every variable leakage. The audit&apos;s headline per-order number; full breakdown in the panel below.</li>
          </ul>
        </InfoButton>
        <span className="v2-muted text-xs">EBITDA / EBITDAR / cash-on-cash / occupancy — IC-grade headline metrics</span>
      </div>
      <section className="v2-kpi-grid">
        <KpiCard
          label="EBITDA"
          value={computed.ebitda / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Wallet}
          tone={computed.ebitda >= 0 ? "success" : "danger"}
          hint={`${monthlyRevenuePctOrDash(computed.ebitda, computed.monthlyRevenue)} EBITDA margin`}
        />
        <KpiCard
          label="EBITDAR"
          value={computed.ebitdar / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Wallet}
          tone={computed.ebitdar >= 0 ? "success" : "danger"}
          hint="EBITDA + rent — the franchise-rollup standard"
        />
        <KpiCard
          label="Cash-on-cash"
          value={(computed.cashOnCashAnnual ?? 0) * 100}
          format={(n) => `${n.toFixed(1)}%`}
          display={
            computed.cashOnCashAnnual === null
              ? "—"
              : `${(computed.cashOnCashAnnual * 100).toFixed(1)}%`
          }
          icon={TrendingUp}
          tone={
            computed.cashOnCashAnnual === null
              ? "neutral"
              : computed.cashOnCashAnnual >= 0.30
                ? "success"
                : computed.cashOnCashAnnual >= 0.15
                  ? "info"
                  : computed.cashOnCashAnnual >= 0
                    ? "warning"
                    : "danger"
          }
          hint="Annualised: 12 × net / setup"
        />
        <KpiCard
          label="Occupancy ratio"
          value={computed.occupancyRatio * 100}
          format={(n) => `${n.toFixed(1)}%`}
          icon={Calculator}
          tone={
            computed.occupancyRatio === 0
              ? "neutral"
              : computed.occupancyRatio < 0.08
                ? "success"
                : computed.occupancyRatio < 0.12
                  ? "warning"
                  : "danger"
          }
          hint="Rent / revenue · QSR target < 8%"
        />
        <KpiCard
          label="Net sales"
          value={computed.netSales / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Banknote}
          tone="info"
          hint="Revenue net of refunds / comps / voids"
        />
        <KpiCard
          label="Contribution / labor hr"
          value={computed.contributionPerLaborHour / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={ChefHat}
          tone={
            computed.contributionPerLaborHour >= 15000
              ? "success"
              : computed.contributionPerLaborHour >= 10000
                ? "info"
                : computed.contributionPerLaborHour >= 5000
                  ? "warning"
                  : "danger"
          }
          hint="QSR target ≥ 150 zł/h — the labor KPI that matters"
        />
        <KpiCard
          label="Promo-adjusted AOV"
          value={computed.promoAdjustedAvgTicket / 100}
          format={(n) => `${n.toFixed(2)} zł`}
          icon={HandCoins}
          tone="info"
          hint={`Gross ${(scenario.avgTicketGrosze / 100).toFixed(2)} − loyalty drag`}
        />
        <KpiCard
          label="True CM1 / order"
          value={computed.trueCm1PerOrderGrosze / 100}
          format={(n) => `${n.toFixed(2)} zł`}
          icon={HandCoins}
          tone={
            computed.trueCm1PerOrderGrosze >= 1500
              ? "success"
              : computed.trueCm1PerOrderGrosze >= 800
                ? "info"
                : computed.trueCm1PerOrderGrosze >= 0
                  ? "warning"
                  : "danger"
          }
          hint="Revenue − COGS − fees − waste − refund − loyalty − packaging − CAC"
        />
      </section>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
        <h2 className="v2-section-h" style={{ margin: 0 }}>Investor returns</h2>
        <InfoButton title="Investor returns" label="About the investor-return metrics">
          <p>
            The 24-month investment-grade view. Replaces the 1970s
            <code> setupCost ÷ monthlyProfit</code> payback rule of thumb (which the
            audit called "grade-school arithmetic") with a properly discounted,
            ramped, risk-adjusted return profile.
          </p>
          <ul>
            <li><strong>Cash break-even</strong> — first month where cumulative net profit clears the setup cost. With a 4-month opening ramp (50/75/100% volume) so Y1 isn&apos;t booked as steady-state. Institutional success: ≤ 24 mo.</li>
            <li><strong>NPV @ 10/15/20%</strong> — net present value at three discount rates (cost of capital). Positive = beats the rate; negative = destroys value at that hurdle. 20% is the PE-style hurdle.</li>
            <li><strong>IRR (24 mo)</strong> — annualised internal rate of return solved via Newton-Raphson on the monthly cash-flow series. ≥ 30% = strong, ≥ 15% = acceptable, &lt; 0 = capital destruction.</li>
          </ul>
        </InfoButton>
        <span className="v2-muted text-xs">
          24-month projection with a 4-month opening ramp · setup{" "}
          {formatPrice(scenario.setupCostGrosze ?? 0)}
        </span>
      </div>
      <section className="v2-kpi-grid">
        <KpiCard
          label="Cash break-even"
          value={investorReturns.cumulativeCashBreakEvenMonth ?? 0}
          display={
            investorReturns.cumulativeCashBreakEvenMonth === null
              ? `> ${investorReturns.horizonMonths} mo`
              : `${investorReturns.cumulativeCashBreakEvenMonth} mo`
          }
          icon={PiggyBank}
          tone={
            investorReturns.cumulativeCashBreakEvenMonth === null
              ? "danger"
              : investorReturns.cumulativeCashBreakEvenMonth > 24
                ? "warning"
                : investorReturns.cumulativeCashBreakEvenMonth > 18
                  ? "info"
                  : "success"
          }
          hint="First month cumulative profit clears setup cost"
        />
        <KpiCard
          label="NPV @ 10%"
          value={investorReturns.npv10 / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Wallet}
          tone={investorReturns.npv10 > 0 ? "success" : "danger"}
          hint="Discount rate: 10% / yr"
        />
        <KpiCard
          label="NPV @ 15%"
          value={investorReturns.npv15 / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Wallet}
          tone={investorReturns.npv15 > 0 ? "success" : "warning"}
          hint="Discount rate: 15% / yr"
        />
        <KpiCard
          label="NPV @ 20%"
          value={investorReturns.npv20 / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Wallet}
          tone={investorReturns.npv20 > 0 ? "success" : "danger"}
          hint="Hurdle rate for PE-style capital"
        />
        <KpiCard
          label="IRR (24 mo)"
          value={(investorReturns.irrAnnual ?? 0) * 100}
          format={(n) => `${n.toFixed(1)}%`}
          display={
            investorReturns.irrAnnual === null
              ? "—"
              : `${(investorReturns.irrAnnual * 100).toFixed(1)}%`
          }
          icon={TrendingUp}
          tone={
            investorReturns.irrAnnual === null
              ? "neutral"
              : investorReturns.irrAnnual >= 0.30
                ? "success"
                : investorReturns.irrAnnual >= 0.15
                  ? "info"
                  : investorReturns.irrAnnual >= 0
                    ? "warning"
                    : "danger"
          }
          hint="Annualised internal rate of return"
        />
      </section>

      <ModuleDivider
        index={1}
        title="Top-line growth"
        subtitle="Comp sales and the year-on-year story IC reads first"
      />

      {sssg && (sssg.currentOrders > 0 || sssg.priorOrders > 0) && <SssgStrip sssg={sssg} />}

      <ModuleDivider
        index={2}
        title="Scale story (multi-unit / franchise)"
        subtitle="HQ absorption, supply consolidation, royalty, DMA cannibalisation, build-out learning"
      />

      <FleetPanel
        scenario={scenario}
        fleet={fleetEcon}
        onUpdate={(mut) =>
          update((s) => ({
            ...s,
            fleet: { ...(s.fleet ?? DEFAULT_FLEET), ...mut },
          }))
        }
      />

      <ModuleDivider
        index={3}
        title="Unit economics & channel mix"
        subtitle="What each order actually contributes after every variable leakage"
      />

      <UnitEconomicsPanel scenario={scenario} computed={computed} />

      <ChannelEconomicsPanel rows={channels} />

      {attachEfficiency.length > 0 && <AttachmentEfficiencyPanel rows={attachEfficiency} />}

      <ModuleDivider
        index={4}
        title="Customer economics"
        subtitle="Cohort retention, LTV, CAC, new-vs-returning mix"
      />

      {cohorts && cohorts.totalCustomers > 0 && (
        <CohortPanel cohorts={cohorts} marketingMonthlyGrosze={scenario.fixedCosts.marketing ?? 0} />
      )}

      <ModuleDivider
        index={5}
        title="Operational throughput"
        subtitle="Daypart mix, hourly volume, oven physics, prep flow, queue conversion, shift coverage"
      />

      {dayparts && dayparts.some((d) => d.ordersCount > 0) && (
        <DaypartPanel dayparts={dayparts} />
      )}

      {hourly && hourly.some((h) => h.totalOrders > 0) && (
        <HourlyThroughputPanel hourly={hourly} pizzasPerHourCap={cap} />
      )}

      <OvenCurvePanel
        scenario={scenario}
        hourly={hourly}
        onUpdate={(mut) =>
          update((s) => ({
            ...s,
            kitchenCapacity: {
              pizzasPerHour: s.kitchenCapacity?.pizzasPerHour ?? 70,
              openHoursPerDay: s.kitchenCapacity?.openHoursPerDay ?? 10,
              peakHourSharePct: s.kitchenCapacity?.peakHourSharePct ?? 0.35,
              ...s.kitchenCapacity,
              ...mut,
            },
          }))
        }
      />

      <PrepFlowPanel result={prepFlow} actualsTicketSec={actuals?.medianTicketTimeSeconds ?? null} />

      <ShiftPlanPanel rows={shiftPlan} />

      <ModuleDivider
        index={6}
        title="Menu strategy"
        subtitle="Kasavana-Smith quadrants, margin traps, prep-heavy false-high-revenue items"
      />

      {menuEng && menuEng.length > 0 && <MenuEngineeringPanel rows={menuEng} />}

      {menuEng && menuEng.length > 0 && <MarginTrapsCallout rows={menuEng} />}

      <ModuleDivider
        index={7}
        title="Sensitivity & scenario analysis"
        subtitle="Tornado, conservative / realistic / optimistic, heatmaps, ±20% volume flex"
      />

      <TornadoPanel bars={tornado} />


      <Card>
        <CardHeader
          title="Scenario comparison"
          description="Conservative / Realistic / Optimistic — built from the current inputs by flexing volume ±15% and food cost ±2 pp."
          actions={
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <InfoButton title={HELP.archetypes.title} label="About scenario comparison">{HELP.archetypes.body}</InfoButton>
              <Sparkles className="h-4 w-4 v2-muted" />
            </span>
          }
        />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {archetypeRows.map(({ key, label, scenario: arch, hint }) => {
              const c = computeScenario(arch);
              const tone = c.netProfit >= 0 ? "success" : "danger";
              return (
                <Card key={key} bare>
                  <CardHeader title={label} description={hint} />
                  <CardBody>
                    <div className="v2-stack-12">
                      <div>
                        <div className="v2-muted text-xs">Net profit</div>
                        <div className={`v2-kpi-value tabular v2-kpi-tone-${tone}`}>
                          {c.netProfit < 0 ? "−" : ""}
                          {Math.abs(Math.round(c.netProfit / 100)).toLocaleString("pl-PL")} zł
                        </div>
                        <div className="v2-muted text-xs">{(c.margin * 100).toFixed(1)}% margin</div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <Stat label="Revenue" value={`${Math.round(c.monthlyRevenue / 100).toLocaleString("pl-PL")} zł`} />
                        <Stat label="Total cost" value={`${Math.round(c.totalCost / 100).toLocaleString("pl-PL")} zł`} />
                        <Stat label="Orders/mo" value={`${Math.round(arch.ordersPerDay * arch.daysOpenPerMonth).toLocaleString("pl-PL")}`} />
                        <Stat label="Break-even" value={`${c.breakEvenOrdersPerDay.toFixed(1)} /day`} />
                        <Stat label="COGS" value={`${Math.round(arch.cogsPct * 100)}%`} />
                        <Stat label="Prime cost" value={`${(c.primeCostPct * 100).toFixed(1)}%`} />
                      </div>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
        <Card>
          <CardHeader
            title="Net profit matrix — orders × ticket"
            description={`Volume on X, ticket on Y, ±30% around the current point. Centre cell (${ordersTicketMatrix.centerX}, ${ordersTicketMatrix.centerY}) is your current scenario.`}
            actions={
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <InfoButton title={HELP.heatmapOrders.title} label="About the orders × ticket heatmap">{HELP.heatmapOrders.body}</InfoButton>
                <Grid3X3 className="h-4 w-4 v2-muted" />
              </span>
            }
          />
          <CardBody>
            <Heatmap
              cells={ordersTicketMatrix.cells}
              xLabels={ordersTicketMatrix.xLabels}
              yLabels={ordersTicketMatrix.yLabels}
              rowHeight={36}
              diverging
              format={(n) =>
                `${n < 0 ? "−" : ""}${Math.abs(Math.round(n / 100)).toLocaleString("pl-PL")} zł`
              }
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Net profit matrix — food cost × ticket"
            description={`Menu engineering: trade off ingredient ratio against ticket. Centre cell (${cogsTicketMatrix.centerX}, ${cogsTicketMatrix.centerY}) is your current scenario.`}
            actions={
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <InfoButton title={HELP.heatmapCogs.title} label="About the food cost × ticket heatmap">{HELP.heatmapCogs.body}</InfoButton>
                <Grid3X3 className="h-4 w-4 v2-muted" />
              </span>
            }
          />
          <CardBody>
            <Heatmap
              cells={cogsTicketMatrix.cells}
              xLabels={cogsTicketMatrix.xLabels}
              yLabels={cogsTicketMatrix.yLabels}
              rowHeight={36}
              diverging
              format={(n) =>
                `${n < 0 ? "−" : ""}${Math.abs(Math.round(n / 100)).toLocaleString("pl-PL")} zł`
              }
            />
          </CardBody>
        </Card>
      </div>

      <ModuleDivider
        index={8}
        title="Forward-looking projection"
        subtitle="12-month operational forecast, financial assumptions, break-even at the current operating point"
      />

      <Card>
        <CardHeader
          title="Assumptions"
          description="Drivers behind the 12-month projection, payback, and the matrices above. Persist with the scenario."
          actions={
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <InfoButton title={HELP.assumptionsCard.title} label="About financial assumptions">{HELP.assumptionsCard.body}</InfoButton>
              <Sliders className="h-4 w-4 v2-muted" />
            </span>
          }
        />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <Input
              label="Wage inflation (annual)"
              type="number"
              step="0.5"
              min="0"
              max="100"
              value={((scenario.wageInflationPct ?? 0) * 100).toFixed(1)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  wageInflationPct: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)),
                }))
              }
              trailingAdornment={<span className="v2-muted">%</span>}
              description="Applied monthly to labor in the projection."
            />
            <Input
              label="Ingredient + fixed inflation (annual)"
              type="number"
              step="0.5"
              min="0"
              max="100"
              value={((scenario.ingredientInflationPct ?? 0) * 100).toFixed(1)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  ingredientInflationPct: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)),
                }))
              }
              trailingAdornment={<span className="v2-muted">%</span>}
              description="Applied monthly to COGS + fixed costs."
            />
            <Input
              label="On-site card fee"
              type="number"
              step="0.1"
              min="0"
              max="10"
              value={((scenario.paymentProcessorPct ?? 0) * 100).toFixed(2)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  paymentProcessorPct: Math.max(0, Math.min(0.1, (parseFloat(e.target.value) || 0) / 100)),
                }))
              }
              trailingAdornment={<span className="v2-muted">%</span>}
              description="Stripe / terminal blended rate. Applied only to the on-site card share of revenue."
            />
            <Input
              label="Cash share"
              type="number"
              step="1"
              min="0"
              max="100"
              value={((scenario.cashSharePct ?? 0) * 100).toFixed(0)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  cashSharePct: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)),
                }))
              }
              trailingAdornment={<span className="v2-muted">%</span>}
              description="Share paid in cash (0% processor fee). Polish food-truck norm 15-25%."
            />
            <Input
              label="Glovo share"
              type="number"
              step="1"
              min="0"
              max="100"
              value={((scenario.glovoSharePct ?? 0) * 100).toFixed(0)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  glovoSharePct: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)),
                }))
              }
              trailingAdornment={<span className="v2-muted">%</span>}
              description="Share routed through Glovo. Marketplace commission replaces the on-site card fee on this share."
            />
            <Input
              label="Glovo commission"
              type="number"
              step="0.5"
              min="0"
              max="50"
              value={((scenario.glovoFeePct ?? 0) * 100).toFixed(1)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  glovoFeePct: Math.max(0, Math.min(0.5, (parseFloat(e.target.value) || 0) / 100)),
                }))
              }
              trailingAdornment={<span className="v2-muted">%</span>}
              description="Glovo's take rate. Typical 25-30%; negotiable past volume thresholds."
            />
            <Input
              label="Wolt share"
              type="number"
              step="1"
              min="0"
              max="100"
              value={((scenario.woltSharePct ?? 0) * 100).toFixed(0)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  woltSharePct: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)),
                }))
              }
              trailingAdornment={<span className="v2-muted">%</span>}
              description="Share routed through Wolt."
            />
            <Input
              label="Wolt commission"
              type="number"
              step="0.5"
              min="0"
              max="50"
              value={((scenario.woltFeePct ?? 0) * 100).toFixed(1)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  woltFeePct: Math.max(0, Math.min(0.5, (parseFloat(e.target.value) || 0) / 100)),
                }))
              }
              trailingAdornment={<span className="v2-muted">%</span>}
              description="Wolt's take rate. Typical 22-30%."
            />
            <Input
              label="Setup cost"
              type="number"
              step="1000"
              min="0"
              value={((scenario.setupCostGrosze ?? 0) / 100).toFixed(0)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  setupCostGrosze: Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100)),
                }))
              }
              trailingAdornment={<span className="v2-muted">zł</span>}
              description="Truck buildout + permits + working capital. Drives payback months."
            />
            <Input
              label="Depreciation & amortisation"
              type="number"
              step="100"
              min="0"
              value={((scenario.depreciationMonthlyGrosze ?? 0) / 100).toFixed(0)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  depreciationMonthlyGrosze: Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100)),
                }))
              }
              trailingAdornment={<span className="v2-muted">zł/mo</span>}
              description="Straight-line amortisation of setup cost over economic life. 5y truck = setup/60."
            />
            <Input
              label="Interest expense"
              type="number"
              step="100"
              min="0"
              value={((scenario.interestMonthlyGrosze ?? 0) / 100).toFixed(0)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  interestMonthlyGrosze: Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100)),
                }))
              }
              trailingAdornment={<span className="v2-muted">zł/mo</span>}
              description="Monthly financing cost. Leave at 0 for cash-purchased trucks."
            />
            <Input
              label="Packaging per order"
              type="number"
              step="0.10"
              min="0"
              value={((scenario.packagingPerOrderGrosze ?? 0) / 100).toFixed(2)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  packagingPerOrderGrosze: Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100)),
                }))
              }
              trailingAdornment={<span className="v2-muted">zł</span>}
              description="Hits every order — napkins, plates wash, takeaway boxes. Delivery-share packaging is additional."
            />
            <div className="flex items-center gap-2" style={{ padding: "8px 0" }}>
              <input
                id="sim-mkt-as-cac"
                type="checkbox"
                checked={scenario.marketingAsCac !== false}
                onChange={(e) =>
                  update((s) => ({ ...s, marketingAsCac: e.target.checked }))
                }
              />
              <label htmlFor="sim-mkt-as-cac" className="text-sm">
                Treat marketing as CAC (per-order amortised)
              </label>
              <InfoButton title="Marketing as CAC" label="About marketing-as-CAC">
                <p>
                  Institutional CM1 treats marketing as a customer-acquisition
                  cost — variable, per-order — rather than a sunk monthly fee.
                  When ON, the marketing fixed-cost line is pulled out of fixed
                  costs and shown as a separate "Marketing CAC" row in the P&amp;L,
                  netting out the True CM1 per order. Total pre-tax profit is
                  identical either way; the difference is honest unit economics.
                </p>
              </InfoButton>
            </div>
            <Input
              label="Waste & spoilage"
              type="number"
              step="0.1"
              min="0"
              max="10"
              value={((scenario.wastePct ?? 0) * 100).toFixed(1)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  wastePct: Math.max(0, Math.min(0.1, (parseFloat(e.target.value) || 0) / 100)),
                }))
              }
              trailingAdornment={<span className="v2-muted">%</span>}
              description="Spoilage + over-portioning as % of revenue. QSR norm 1-3%."
            />
            <Input
              label="Refunds / comps / theft"
              type="number"
              step="0.1"
              min="0"
              max="10"
              value={((scenario.refundPct ?? 0) * 100).toFixed(1)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  refundPct: Math.max(0, Math.min(0.1, (parseFloat(e.target.value) || 0) / 100)),
                }))
              }
              trailingAdornment={<span className="v2-muted">%</span>}
              description="Voids, refunds, staff meals. QSR norm 1-2%."
            />
            <Input
              label="Loyalty point burn"
              type="number"
              step="0.1"
              min="0"
              max="10"
              value={((scenario.loyaltyBurnPct ?? 0) * 100).toFixed(1)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  loyaltyBurnPct: Math.max(0, Math.min(0.1, (parseFloat(e.target.value) || 0) / 100)),
                }))
              }
              trailingAdornment={<span className="v2-muted">%</span>}
              description="Points redeemed × effective value. 1 pt/PLN × 50% redeem × 5% = ~1.2%."
            />
            <Input
              label="Corporate income tax"
              type="number"
              step="1"
              min="0"
              max="30"
              value={((scenario.citPct ?? 0) * 100).toFixed(0)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  citPct: Math.max(0, Math.min(0.3, (parseFloat(e.target.value) || 0) / 100)),
                }))
              }
              trailingAdornment={<span className="v2-muted">%</span>}
              description="9% Polish small-CIT (≤2 M EUR turnover) or 19% standard."
            />
            <Input
              label="Winter volume multiplier"
              type="number"
              step="0.05"
              min="0"
              max="3"
              value={seasonality.winter.toFixed(2)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  seasonality: {
                    ...(s.seasonality ?? DEFAULT_SEASONALITY),
                    winter: Math.max(0, Math.min(3, (parseFloat(e.target.value) || 0))),
                  },
                }))
              }
              description="Dec / Jan / Feb. Default 0.50 — Polish outdoor truck winter is brutal."
            />
            <Input
              label="Kitchen — pizzas/hour"
              type="number"
              step="5"
              min="0"
              max="300"
              value={(scenario.kitchenCapacity?.pizzasPerHour ?? 0).toFixed(0)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  kitchenCapacity: {
                    pizzasPerHour: Math.max(0, Math.min(300, parseFloat(e.target.value) || 0)),
                    openHoursPerDay: s.kitchenCapacity?.openHoursPerDay ?? 10,
                    peakHourSharePct: s.kitchenCapacity?.peakHourSharePct ?? 0.35,
                  },
                }))
              }
              description="Sustained output of one pizzaiolo + one Ferrara oven. 60-80 realistic; 90+ needs a second line."
            />
            <Input
              label="Kitchen — service hours/day"
              type="number"
              step="0.5"
              min="0"
              max="24"
              value={(scenario.kitchenCapacity?.openHoursPerDay ?? 0).toFixed(1)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  kitchenCapacity: {
                    pizzasPerHour: s.kitchenCapacity?.pizzasPerHour ?? 70,
                    openHoursPerDay: Math.max(0, Math.min(24, parseFloat(e.target.value) || 0)),
                    peakHourSharePct: s.kitchenCapacity?.peakHourSharePct ?? 0.35,
                  },
                }))
              }
              description="Hours the line is producing — excludes prep + close-down."
            />
            <Input
              label="Labor flex with volume"
              type="number"
              step="5"
              min="0"
              max="100"
              value={((scenario.laborVariablePct ?? 0) * 100).toFixed(0)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  laborVariablePct: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)),
                }))
              }
              trailingAdornment={<span className="v2-muted">%</span>}
              description="Share of labor that scales with order volume. 0% = fully fixed crew, 100% = fully variable. 40% is QSR norm."
            />
            <Input
              label="Labor anchor (orders/day)"
              type="number"
              step="5"
              min="1"
              max="500"
              value={(scenario.laborAnchorOrdersPerDay ?? scenario.ordersPerDay).toFixed(0)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  laborAnchorOrdersPerDay: Math.max(1, Math.round(parseFloat(e.target.value) || 1)),
                }))
              }
              description="The orders/day the current labor mix is sized for. Push volume past it and variable labor pulls in proportionally."
            />
            <Input
              label="Kitchen — peak-hour share"
              type="number"
              step="1"
              min="0"
              max="100"
              value={((scenario.kitchenCapacity?.peakHourSharePct ?? 0) * 100).toFixed(0)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  kitchenCapacity: {
                    pizzasPerHour: s.kitchenCapacity?.pizzasPerHour ?? 70,
                    openHoursPerDay: s.kitchenCapacity?.openHoursPerDay ?? 10,
                    peakHourSharePct: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)),
                  },
                }))
              }
              trailingAdornment={<span className="v2-muted">%</span>}
              description="Share of daily orders in the peak hour — this is the binding constraint, not the average."
            />
            <Input
              label="Prep-complexity multiplier"
              type="number"
              step="0.05"
              min="0.5"
              max="3"
              value={(scenario.prepComplexityMultiplier ?? 1).toFixed(2)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  prepComplexityMultiplier: Math.max(0.5, Math.min(3, parseFloat(e.target.value) || 1)),
                }))
              }
              description="Derates kitchen capacity for slow-prep menus. 1.0 = pizza-only · 1.4-1.6 = pasta-heavy. See Margin traps for prep-heavy items."
            />
            <Input
              label="Summer volume multiplier"
              type="number"
              step="0.05"
              min="0"
              max="3"
              value={seasonality.summer.toFixed(2)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  seasonality: {
                    ...(s.seasonality ?? DEFAULT_SEASONALITY),
                    summer: Math.max(0, Math.min(3, (parseFloat(e.target.value) || 0))),
                  },
                }))
              }
              description="Jun / Jul / Aug. Default 1.30 — peak truck season."
            />
            <Input
              label="Spring volume multiplier"
              type="number"
              step="0.05"
              min="0"
              max="3"
              value={seasonality.spring.toFixed(2)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  seasonality: {
                    ...(s.seasonality ?? DEFAULT_SEASONALITY),
                    spring: Math.max(0, Math.min(3, (parseFloat(e.target.value) || 0))),
                  },
                }))
              }
              description="Mar / Apr / May. Default 1.00."
            />
            <Input
              label="Autumn volume multiplier"
              type="number"
              step="0.05"
              min="0"
              max="3"
              value={seasonality.autumn.toFixed(2)}
              onChange={(e) =>
                update((s) => ({
                  ...s,
                  seasonality: {
                    ...(s.seasonality ?? DEFAULT_SEASONALITY),
                    autumn: Math.max(0, Math.min(3, (parseFloat(e.target.value) || 0))),
                  },
                }))
              }
              description="Sep / Oct / Nov. Default 0.95."
            />
          </div>
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="v2-section-h text-sm">Per-month overrides</span>
              <span className="v2-muted text-xs">
                Override the quarterly multiplier for individual months. Blank = use quarter.
              </span>
            </div>
            <div className="grid grid-cols-6 md:grid-cols-12 gap-1">
              {MONTH_LABELS.map((label, idx) => {
                const ovr = seasonality.monthlyOverrides?.[idx];
                return (
                  <div key={label} className="flex flex-col items-center">
                    <span className="v2-muted text-xs">{label}</span>
                    <input
                      className="v2-input tabular"
                      style={{ width: "100%", padding: "4px 6px", fontSize: 13, textAlign: "center" }}
                      type="number"
                      step="0.05"
                      min="0"
                      max="3"
                      placeholder={seasonality[MONTH_TO_SEASON[idx]].toFixed(2)}
                      value={typeof ovr === "number" ? ovr.toFixed(2) : ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        const num = v === "" ? undefined : Math.max(0, Math.min(3, parseFloat(v) || 0));
                        update((s) => {
                          const arr = Array.from(
                            { length: 12 },
                            (_, i) => s.seasonality?.monthlyOverrides?.[i],
                          );
                          arr[idx] = num;
                          return {
                            ...s,
                            seasonality: {
                              ...(s.seasonality ?? DEFAULT_SEASONALITY),
                              monthlyOverrides: arr.every((x) => x === undefined) ? undefined : arr,
                            },
                          };
                        });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="12-month projection"
          description="Steady-state P&L rolled forward — applies the seasonal multipliers above to volume, and compounds wage + ingredient inflation month over month."
          actions={
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <InfoButton title={HELP.projection.title} label="About the 12-month projection">{HELP.projection.body}</InfoButton>
              <LineChartIcon className="h-4 w-4 v2-muted" />
            </span>
          }
        />
        <CardBody>
          <LineChart
            data={projection}
            xKey="month"
            series={[
              { key: "revenue", label: "Revenue" },
              { key: "labor", label: "Labor" },
              { key: "cogs", label: "COGS" },
              { key: "fixed", label: "Fixed" },
              { key: "netProfit", label: "Net profit" },
            ]}
            height={320}
            yFormat={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
            tooltipValue={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          />
          <div className="v2-kpi-grid mt-3">
            <KpiCard
              label="12-mo revenue"
              value={projectionTotals.revenue}
              format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
              icon={CalendarRange}
              tone="brand"
            />
            <KpiCard
              label="12-mo costs"
              value={
                projectionTotals.cogs +
                projectionTotals.labor +
                projectionTotals.fixed +
                projectionTotals.payment
              }
              format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
              icon={Banknote}
              tone="warning"
            />
            <KpiCard
              label="12-mo net profit"
              value={projectionTotals.netProfit}
              format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
              icon={projectionTotals.netProfit >= 0 ? TrendingUp : TrendingDown}
              tone={projectionTotals.netProfit >= 0 ? "success" : "danger"}
              hint={`${
                projectionTotals.revenue > 0
                  ? ((projectionTotals.netProfit / projectionTotals.revenue) * 100).toFixed(1)
                  : "0"
              }% blended margin`}
            />
            <KpiCard
              label="Best / worst month"
              value={0}
              display={
                <span className="tabular">
                  {Math.round(
                    Math.max(...projection.map((r) => r.netProfit)),
                  ).toLocaleString("pl-PL")}{" "}
                  /{" "}
                  {Math.round(
                    Math.min(...projection.map((r) => r.netProfit)),
                  ).toLocaleString("pl-PL")}{" "}
                  zł
                </span>
              }
              icon={Clock}
              tone="info"
              hint="Net profit swing across the year"
            />
          </div>
        </CardBody>
      </Card>

      <BreakEvenChart computed={computed} currentOrdersPerDay={scenario.ordersPerDay} />


      <Card>
        <CardHeader
          title="Sensitivity — net profit at −20% … +20% volume"
          description="What happens to the bottom line if orders/day moves around the current point."
          actions={<InfoButton title={HELP.sensitivity.title} label="About sensitivity analysis">{HELP.sensitivity.body}</InfoButton>}
        />
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {sensitivities.map(({ delta, computed: c }) => (
              <KpiCard
                key={delta}
                label={`${delta === 0 ? "Base" : `${delta > 0 ? "+" : ""}${Math.round(delta * 100)}%`} volume`}
                value={c.netProfit / 100}
                format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
                tone={c.netProfit >= 0 ? "success" : "danger"}
                hint={`${(c.margin * 100).toFixed(1)}% margin`}
              />
            ))}
          </div>
        </CardBody>
      </Card>

      <ModuleDivider
        index={9}
        title="AI commentary"
        subtitle="Claude-generated 4-6 specific enhancements grounded in the current scenario numbers"
      />

      <AiEnhancementsCard scenario={effectiveScenario!} computed={computed} />

      <ConfirmDialog
        open={seedConfirmOpen}
        onClose={() => setSeedConfirmOpen(false)}
        onConfirm={seedFromHistory}
        title="Seed from the last 30 days?"
        description="Populates the simulator with payroll and fixed costs derived from your active business-costs ledger. The ledger is read-only here — none of your real cost data changes."
        confirmLabel="Seed scenario"
      />
      <ConfirmDialog
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        onConfirm={resetToDefaults}
        title="Reset to Warsaw 2026 defaults?"
        description="Resets every input back to the built-in Warsaw 2026 pizza-truck defaults: 70 orders/day, 65 zł blended ticket, 12-22 service window, brutto × 1.22 employer rates and food-truck pitch fees. Your current scenario is overwritten."
        confirmLabel="Reset"
        destructive
      />
    </div>
  );
}

interface MenuScenarioPickerProps {
  activeId: string | undefined;
  onPick: (preset: MenuScenarioPreset) => void;
}

function MenuScenarioPicker({ activeId, onPick }: MenuScenarioPickerProps) {
  const active = activeId ? MENU_SCENARIO_BY_ID.get(activeId) : undefined;
  return (
    <Card>
      <CardHeader
        title="Menu scenario"
        description={
          active
            ? `Loaded preset: ${active.emoji} ${active.name}. Pick a different one to reload baseline values, or tweak the inputs above to customise.`
            : "Pick one of five archetypal menu shapes to load avg ticket, COGS and behavior levers in a single click. You can still tweak any value afterwards."
        }
        actions={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <InfoButton title={HELP.menuScenario.title} label="About menu scenarios">{HELP.menuScenario.body}</InfoButton>
            <Utensils className="h-4 w-4 v2-muted" />
          </span>
        }
      />
      <CardBody>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {MENU_SCENARIOS.map((preset) => {
            const isActive = preset.id === activeId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onPick(preset)}
                aria-pressed={isActive}
                style={{
                  textAlign: "left",
                  padding: 14,
                  borderRadius: 12,
                  border: `1.5px solid ${isActive ? "var(--brand)" : "var(--border)"}`,
                  background: isActive ? "var(--brand-soft, var(--surface-2))" : "var(--surface-2)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  fontFamily: "inherit",
                  color: "inherit",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 28, lineHeight: 1 }} aria-hidden>
                    {preset.emoji}
                  </span>
                  {isActive && (
                    <Badge tone="brand" variant="soft" dot>
                      Active
                    </Badge>
                  )}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{preset.name}</div>
                <div className="v2-muted" style={{ fontSize: 12, lineHeight: 1.4, minHeight: 50 }}>
                  {preset.description}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "4px 12px",
                    fontSize: 12,
                    paddingTop: 6,
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <span>
                    <span className="v2-muted">Orders/day</span>{" "}
                    <strong className="tabular">{preset.ordersPerDay}</strong>
                  </span>
                  <span>
                    <span className="v2-muted">Ticket</span>{" "}
                    <strong className="tabular">{formatPrice(preset.avgTicketGrosze)}</strong>
                  </span>
                  <span>
                    <span className="v2-muted">Days/mo</span>{" "}
                    <strong className="tabular">{preset.daysOpenPerMonth}</strong>
                  </span>
                  <span>
                    <span className="v2-muted">COGS</span>{" "}
                    <strong className="tabular">{Math.round(preset.cogsPct * 100)}%</strong>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}

function LabelWithInfo({
  text,
  help,
}: {
  text: string;
  help: { title: string; body: ReactNode };
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span>{text}</span>
      <InfoButton title={help.title} label={`About ${help.title.toLowerCase()}`} size="sm">
        {help.body}
      </InfoButton>
    </span>
  );
}

/** Clickable on/off pill for behavior assumption levers. Toggling off
 *  preserves the lever's values but excludes it from the math, so the
 *  operator can compare with vs without instantly. */
function LeverSwitch({
  enabled,
  onChange,
  ariaLabel,
}: {
  enabled: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      onClick={() => onChange(!enabled)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        border: `1.5px solid ${enabled ? "var(--success, #10b981)" : "var(--border)"}`,
        background: enabled ? "var(--success-soft, rgba(16, 185, 129, 0.12))" : "var(--surface-2)",
        color: enabled ? "var(--success, #10b981)" : "var(--fg-muted)",
        cursor: "pointer",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.04,
        textTransform: "uppercase",
        fontFamily: "inherit",
        lineHeight: 1,
        transition: "border-color 0.15s, background 0.15s, color 0.15s",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: enabled ? "var(--success, #10b981)" : "var(--fg-subtle)",
        }}
      />
      {enabled ? "On" : "Off"}
    </button>
  );
}

/** Section divider that splits the long Simulation page into named
 *  modules — gives the page institutional rhythm and lets the operator
 *  jump mentally between modules ("scale story", "operational health",
 *  "menu strategy"). Visual: small leading number badge + uppercase
 *  module label + short subtitle, separated by a hairline rule.
 *  Uses CSS vars so it adapts to light / dark theme automatically. */
function ModuleDivider({
  index,
  title,
  subtitle,
}: {
  index: number;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="v2-module-divider">
      <span className="v2-module-badge">{String(index).padStart(2, "0")}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="v2-module-title">{title}</div>
        {subtitle && <div className="v2-module-subtitle">{subtitle}</div>}
      </div>
    </div>
  );
}

/** Menu-role badge surfaced from the menu definition — hero / profit-
 *  driver / anchor. The audit pointed out the simulator ignored these
 *  tags entirely; this surfaces them in the engineering matrix so an
 *  anchor in the puzzle quadrant (premium decoy by design) doesn't get
 *  reflexively flagged for deletion. */
function MenuRoleBadge({ role }: { role: "hero" | "profit-driver" | "anchor" }) {
  const palette: Record<"hero" | "profit-driver" | "anchor", { bg: string; fg: string; label: string }> = {
    hero: { bg: "rgba(245,158,11,0.12)", fg: "rgb(217,119,6)", label: "hero" },
    "profit-driver": { bg: "rgba(34,197,94,0.12)", fg: "rgb(22,163,74)", label: "driver" },
    anchor: { bg: "rgba(168,85,247,0.12)", fg: "rgb(126,34,206)", label: "anchor" },
  };
  const c = palette[role];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 6px",
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 0.3,
        textTransform: "uppercase",
      }}
    >
      {c.label}
    </span>
  );
}

/** Small chip that tells the operator (and any investor reading over their
 *  shoulder) whether a number is grounded in real data or hand-typed. The
 *  three states cover the entire input surface of the simulator:
 *    actuals    → matches /api/admin/orders within tolerance
 *    ledger     → came from the BusinessCost ledger via seed
 *    assumption → operator-typed, no real-data backing */
function SourceTag({
  kind,
  hint,
}: {
  kind: "actuals" | "ledger" | "assumption";
  hint?: string;
}) {
  const palette: Record<typeof kind, { bg: string; fg: string; label: string }> = {
    actuals: { bg: "rgba(34,197,94,0.12)", fg: "rgb(22,163,74)", label: "actuals" },
    ledger: { bg: "rgba(59,130,246,0.12)", fg: "rgb(37,99,235)", label: "ledger" },
    assumption: { bg: "rgba(245,158,11,0.12)", fg: "rgb(217,119,6)", label: "assumption" },
  };
  const c = palette[kind];
  return (
    <span
      title={hint}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "1px 6px",
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.2,
        textTransform: "uppercase",
      }}
    >
      {c.label}
    </span>
  );
}

/** Shift plan — distributes the uniform labor mix across prep / lunch /
 *  dinner / late-night / close so the operator sees where the line gets
 *  thin. Doesn't change the labor calculation (still rate × hours);
 *  this is the visibility layer the audit demanded ("staffing-by-
 *  daypart is operationally incoherent in a flat headcount × hours
 *  model"). Daypart shares pull from real orders when available;
 *  fall back to institutional QSR norms otherwise. */
function ShiftPlanPanel({ rows }: { rows: ShiftPlanRow[] }) {
  return (
    <Card>
      <CardHeader
        title="Shift plan — labor by daypart"
        description="The uniform labor mix in the inputs card is operationally a fiction — real shifts concentrate 2-4 people on lunch + dinner rush, then taper to 1-2 for prep + close. This view distributes total labor across dayparts using observed order share + standard concentration factors so the operator can read where coverage is thin."
        actions={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <InfoButton title="Shift plan" label="About the shift plan view">
              <p>
                The labor-mix card sums headcount × hours × rate uniformly across the day.
                Real schedules look nothing like that: lunch and dinner pull 2-4 people on
                the line, prep + close run with 1-2.
              </p>
              <p>
                This panel <strong>doesn&apos;t change</strong> the labor calculation — it
                redistributes the same total across the dayparts using:
              </p>
              <ul>
                <li><strong>Observed order share</strong> per daypart from real orders (or institutional QSR norms when no data yet).</li>
                <li><strong>Concentration factors</strong>: lunch 1.4×, dinner 1.6×, late-night 0.7×, prep 0.4×, close 0.3× — so the total labor cost still sums correctly, but the relative weight follows real staffing intent.</li>
              </ul>
              <p>
                <strong>Coverage ratio</strong> = labor / revenue per daypart. Green &lt; 20% (rush is profitable), amber 28-35% (tight margin), red &gt; 35% (over-staffed for the volume). Prep + close are revenue-zero so coverage is undefined — but the headcount column tells you you&apos;re still paying somebody to be there.
              </p>
            </InfoButton>
            <ChefHat className="h-4 w-4 v2-muted" />
          </span>
        }
      />
      <CardBody>
        <table style={{ width: "100%", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
              <th style={{ padding: "6px 4px" }}>Daypart</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>Order share</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>Headcount</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>Revenue / day</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>Labor / day</th>
              <th style={{ padding: "6px 4px", textAlign: "right" }}>Coverage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const danger = r.laborCoverageRatio > 0.35;
              const warn = r.laborCoverageRatio > 0.28 && !danger;
              const good = r.laborCoverageRatio > 0 && r.laborCoverageRatio < 0.20;
              return (
                <tr key={r.daypart} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                  <td style={{ padding: "6px 4px" }}>
                    <div style={{ fontWeight: 500 }}>{r.label}</div>
                    <div className="v2-muted text-xs">{r.hours}</div>
                  </td>
                  <td className="tabular" style={{ padding: "6px 4px", textAlign: "right" }}>
                    {r.orderShare > 0 ? `${(r.orderShare * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="tabular" style={{ padding: "6px 4px", textAlign: "right" }}>
                    {r.headcountOnShift.toFixed(1)}
                  </td>
                  <td className="tabular" style={{ padding: "6px 4px", textAlign: "right" }}>
                    {r.revenuePerDay > 0
                      ? `${Math.round(r.revenuePerDay / 100).toLocaleString("pl-PL")} zł`
                      : "—"}
                  </td>
                  <td className="tabular" style={{ padding: "6px 4px", textAlign: "right" }}>
                    {Math.round(r.laborPerDay / 100).toLocaleString("pl-PL")} zł
                  </td>
                  <td
                    className="tabular"
                    style={{
                      padding: "6px 4px",
                      textAlign: "right",
                      color: danger
                        ? "rgb(220,38,38)"
                        : warn
                          ? "rgb(217,119,6)"
                          : good
                            ? "rgb(22,163,74)"
                            : undefined,
                      fontWeight: 500,
                    }}
                  >
                    {r.revenuePerDay > 0 ? `${(r.laborCoverageRatio * 100).toFixed(0)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="v2-muted text-xs mt-2">
          Coverage = labor cost ÷ revenue for that daypart. Green &lt; 20% (rush profitable) · amber 28-35% (tight) · red &gt; 35% (over-staffed for the volume). Prep + close are revenue-zero so coverage is undefined; the headcount column shows you're still paying somebody to be there.
        </div>
      </CardBody>
    </Card>
  );
}

/** Prep flow & queue model — answers two of the audit's operational
 *  questions in one card: "Where's the prep flow?" (pasta primo adds
 *  240s to ticket time the model previously didn't price) and "Where's
 *  the queue model?" (a 5-min wait at 1pm bleeds 30% conversion).
 *  Computes modelled ticket time from menu mix, peak-hour queue from
 *  oven curve, and the contribution loss from converted-away orders. */
function PrepFlowPanel({
  result,
  actualsTicketSec,
}: {
  result: PrepFlowResult;
  actualsTicketSec: number | null;
}) {
  const modeledMin = result.modeledTicketSeconds / 60;
  const observedMin = actualsTicketSec === null ? null : actualsTicketSec / 60;
  const queueBlowingOut = result.queueExcessPerHour > 0;
  return (
    <Card>
      <CardHeader
        title="Prep flow & queue model"
        description="Modelled ticket time = pizza base + Σ attach × per-attach seconds (pasta 240s, antipasti 90s, coffee 30s). Peak-hour queue forms when ordersPerDay × peakShare exceeds the realistic oven peak. Each minute of wait past 5 minutes bleeds 5% conversion (capped at 60%)."
        actions={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <InfoButton title="Prep flow & queue" label="About prep flow and the queue model">
              <p>
                Two operator-eye questions in one panel.
              </p>
              <p>
                <strong>Prep flow.</strong> Pizza takes 90s. Every attach lever adds its
                own kitchen-seconds-per-attached-unit on top: pasta primo 240s (separate
                station, water at boil, sauté pan per order), antipasti 90s (plate-up,
                burrata mise-en-place), dessert 60s, coffee 30s, premium toppings 15s,
                aperitivo 30s. Modelled time = pizza + Σ attach × seconds. Compare to
                observed median ticket time from real orders.
              </p>
              <p>
                <strong>Queue model.</strong> Peak-hour orders = orders/day × peak share.
                When that exceeds the realistic oven /hour, a queue forms. Wait minutes ≈
                <code>(excess × prepSec) / 60 / 2</code> (average back-of-queue customer).
                Each minute past 5 min bleeds 5% conversion, capped at 60%. Monthly
                orders lost × CM1 = contribution left on the table.
              </p>
              <p>Three remediations: open a unit (fleet panel), add a second oven /
              pizzaiolo (kitchen capacity), or push orders off-peak (dayparting).</p>
            </InfoButton>
            <Clock className="h-4 w-4 v2-muted" />
          </span>
        }
      />
      <CardBody>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="Modelled ticket time"
            value={modeledMin}
            format={(n) => `${n.toFixed(1)} min`}
            icon={Clock}
            tone={modeledMin <= 4 ? "success" : modeledMin <= 8 ? "info" : modeledMin <= 12 ? "warning" : "danger"}
            hint="Pizza + weighted attach prep"
          />
          <KpiCard
            label="Observed ticket time"
            value={observedMin ?? 0}
            display={observedMin === null ? "—" : `${observedMin.toFixed(1)} min`}
            tone={
              observedMin === null
                ? "neutral"
                : observedMin <= modeledMin * 1.2
                  ? "success"
                  : observedMin <= modeledMin * 1.5
                    ? "warning"
                    : "danger"
            }
            hint={
              observedMin === null
                ? "No order timestamps yet"
                : `vs ${modeledMin.toFixed(1)} min modelled`
            }
          />
          <KpiCard
            label="Peak-hour queue"
            value={result.queueExcessPerHour}
            format={(n) => `${n.toFixed(1)} /hr`}
            display={
              queueBlowingOut
                ? `+${result.queueExcessPerHour.toFixed(1)} /hr`
                : "Clear"
            }
            tone={queueBlowingOut ? "danger" : "success"}
            hint={`${result.peakHourOrders.toFixed(1)} orders vs ${result.realisticOvenPerHour.toFixed(1)} /hr capacity`}
          />
          <KpiCard
            label="Wait time"
            value={result.estimatedWaitMinutes}
            format={(n) => `${n.toFixed(1)} min`}
            tone={
              result.estimatedWaitMinutes < 3
                ? "success"
                : result.estimatedWaitMinutes < 5
                  ? "info"
                  : result.estimatedWaitMinutes < 8
                    ? "warning"
                    : "danger"
            }
            hint="Modelled for back-of-queue customer at peak"
          />
        </div>
        {queueBlowingOut && (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 8,
              background: "rgba(239,68,68,0.06)",
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 600, color: "rgb(220,38,38)" }}>
              Estimated peak-hour conversion drop: {(result.conversionDropPct * 100).toFixed(0)}%
            </div>
            <div className="v2-muted text-xs mt-1">
              ~{result.monthlyOrdersLost.toLocaleString("pl-PL")} orders/month walked away from a queue too long to wait through
              — that&apos;s ~
              {Math.round(result.monthlyContributionLostGrosze / 100).toLocaleString("pl-PL")} zł of CM1 left on the
              table. Open another unit, add a second oven, or push more orders into off-peak via dayparting / pre-orders.
            </div>
          </div>
        )}
        {!queueBlowingOut && (
          <div className="v2-muted text-xs mt-3">
            Peak hour fits under the oven ceiling. No queue conversion loss to model. If volume grows past
            {" "}{result.realisticOvenPerHour.toFixed(0)} /hr, this panel goes red.
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** Oven curve — the "where is the line saturated?" panel. Models
 *  Neapolitan oven physics (pizzas per cycle × cycle seconds), surfaces
 *  theoretical vs realistic peak, and overlays the 80%-saturation
 *  threshold against the actual peak hour from real orders. */
function OvenCurvePanel({
  scenario,
  hourly,
  onUpdate,
}: {
  scenario: SimulationScenario;
  hourly: SimulationHourlyThroughputLine[] | null;
  onUpdate: (mut: Partial<SimulationKitchenCapacity>) => void;
}) {
  const cap = scenario.kitchenCapacity;
  if (!cap) return null;
  const cycleSec = cap.ovenCycleSeconds ?? 90;
  const perCycle = cap.ovenPizzasPerCycle ?? 8;
  const efficiency = cap.ovenEfficiencyPct ?? 0.22;
  const theoreticalPerHour = cycleSec > 0 ? (3600 / cycleSec) * perCycle : 0;
  const realisticPerHour = theoreticalPerHour * efficiency;
  const observedPeakPerHour = hourly && hourly.length > 0
    ? Math.max(...hourly.map((h) => h.avgOrdersPerHour))
    : 0;
  const peakSaturation =
    realisticPerHour > 0 ? observedPeakPerHour / realisticPerHour : 0;
  return (
    <Card>
      <CardHeader
        title="Oven curve & peak saturation"
        description="Neapolitan oven physics: pizzas per bake × cycle seconds gives theoretical capacity; realistic peak applies an efficiency factor accounting for pulls, sweeps, dough rebuilds, customer-facing time. The number on the right is what real orders are actually doing at peak."
        actions={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <InfoButton title="Oven curve" label="About the oven curve">
              <p>
                <strong>Theoretical peak = pizzas-per-cycle × (3600 / cycle-seconds)</strong>.
                A Stefano Ferrara at 8 pizzas × 90s = 320/hr in a vacuum.
              </p>
              <p>
                <strong>Realistic peak = theoretical × efficiency</strong>.
                Real Neapolitan trucks sustain 20-35% of theoretical because pulls, sweeps,
                dough rebuilds, customer-facing time, plate-up, and drinks all eat oven-
                adjacent time. 22% is the default.
              </p>
              <p>
                <strong>Observed peak hour</strong> comes from real orders — max
                avg-orders-per-hour over the last 30 days. When observed crosses 85%
                of realistic, you&apos;ve hit the institutional &quot;open another unit&quot;
                threshold. The fleet panel above models the economics of that decision.
              </p>
            </InfoButton>
            <Flame className="h-4 w-4 v2-muted" />
          </span>
        }
      />
      <CardBody>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <Input
            label="Pizzas per bake cycle"
            type="number"
            min="1"
            max="20"
            step="1"
            value={String(perCycle)}
            onChange={(e) =>
              onUpdate({ ovenPizzasPerCycle: Math.max(1, parseInt(e.target.value, 10) || 1) })
            }
            description="Stefano Ferrara 6-9; multi-deck 16+"
          />
          <Input
            label="Cycle time"
            type="number"
            min="30"
            max="600"
            step="5"
            value={String(cycleSec)}
            onChange={(e) =>
              onUpdate({ ovenCycleSeconds: Math.max(30, parseInt(e.target.value, 10) || 90) })
            }
            trailingAdornment={<span className="v2-muted">sec</span>}
            description="Neapolitan dough ~90s"
          />
          <Input
            label="Realistic efficiency"
            type="number"
            min="5"
            max="100"
            step="1"
            value={(efficiency * 100).toFixed(0)}
            onChange={(e) =>
              onUpdate({ ovenEfficiencyPct: Math.max(0.05, Math.min(1, (parseFloat(e.target.value) || 25) / 100)) })
            }
            trailingAdornment={<span className="v2-muted">%</span>}
            description="20-35% on a real truck"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="Theoretical peak"
            value={theoreticalPerHour}
            format={(n) => `${Math.round(n)} /hr`}
            tone="info"
            hint={`${perCycle} pizzas × ${(3600 / cycleSec).toFixed(0)} cycles/hr`}
          />
          <KpiCard
            label="Realistic peak"
            value={realisticPerHour}
            format={(n) => `${Math.round(n)} /hr`}
            tone="info"
            hint={`Theoretical × ${(efficiency * 100).toFixed(0)}% efficiency`}
          />
          <KpiCard
            label="Observed peak hour"
            value={observedPeakPerHour}
            format={(n) => n.toFixed(1)}
            display={observedPeakPerHour === 0 ? "—" : observedPeakPerHour.toFixed(1) + " /hr"}
            tone={
              observedPeakPerHour === 0
                ? "neutral"
                : peakSaturation > 1
                  ? "danger"
                  : peakSaturation > 0.85
                    ? "warning"
                    : peakSaturation > 0.6
                      ? "info"
                      : "success"
            }
            hint={observedPeakPerHour === 0 ? "No order data" : `${(peakSaturation * 100).toFixed(0)}% of realistic`}
          />
          <KpiCard
            label="Saturation status"
            value={peakSaturation * 100}
            format={(n) => `${n.toFixed(0)}%`}
            display={
              observedPeakPerHour === 0
                ? "—"
                : peakSaturation > 1
                  ? "Blown out"
                  : peakSaturation > 0.85
                    ? "At ceiling"
                    : peakSaturation > 0.6
                      ? "Heading there"
                      : "Headroom"
            }
            tone={
              observedPeakPerHour === 0
                ? "neutral"
                : peakSaturation > 1
                  ? "danger"
                  : peakSaturation > 0.85
                    ? "warning"
                    : "success"
            }
            hint="Threshold: 85% = next-truck signal"
          />
        </div>
        <div className="v2-muted text-xs mt-3">
          When observed peak crosses 85% of realistic — that&apos;s the institutional &quot;open another unit&quot; signal. A second oven or pizzaiolo lifts the ceiling proportionally; the fleet panel above models the economics of that decision.
        </div>
      </CardBody>
    </Card>
  );
}

/** Hourly throughput — bar chart of avg orders per hour over the last 30
 *  days, optionally overlaid with the kitchen-capacity ceiling. Surfaces
 *  the peak-hour blow-out the daily-aggregated view hides. */
function HourlyThroughputPanel({
  hourly,
  pizzasPerHourCap,
}: {
  hourly: SimulationHourlyThroughputLine[];
  pizzasPerHourCap: number;
}) {
  const peak = Math.max(...hourly.map((h) => h.avgOrdersPerHour), pizzasPerHourCap);
  if (peak === 0) return null;
  const yMax = Math.max(peak, pizzasPerHourCap) * 1.1;
  return (
    <Card>
      <CardHeader
        title="Hourly throughput vs capacity"
        description={`Average orders per hour over the last 30 days${pizzasPerHourCap > 0 ? `, with the kitchen-capacity ceiling (${pizzasPerHourCap.toFixed(0)} pizzas/hour) overlaid` : ""}.`}
        actions={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <InfoButton title="Hourly throughput" label="About hourly throughput">
              <p>
                24 bars — one per hour of day — showing average orders per hour
                aggregated from the last 30 days of real orders. The dashed line is the
                kitchen-capacity ceiling from the scenario inputs.
              </p>
              <p>Bar colour:</p>
              <ul>
                <li><strong>Red</strong> — hour exceeds capacity. Customers walked.</li>
                <li><strong>Amber</strong> — within 15% of the ceiling. One bad-luck Saturday and you blow out.</li>
                <li><strong>Blue</strong> — comfortable headroom.</li>
              </ul>
              <p>
                This is the operational pair to the oven curve panel below: if the
                observed peak bar lines up with realistic oven capacity, you&apos;re at
                the &quot;open another unit&quot; signal. If the peak is far below capacity,
                you have headroom to push more volume into the existing window
                (marketing, hours extension, second daypart).
              </p>
            </InfoButton>
            <SourceTag kind="actuals" hint="Computed from real order timestamps." />
          </span>
        }
      />
      <CardBody>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 180, position: "relative" }}>
          {pizzasPerHourCap > 0 && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: `${(pizzasPerHourCap / yMax) * 100}%`,
                borderTop: "2px dashed rgba(239,68,68,0.6)",
                pointerEvents: "none",
              }}
              title={`Kitchen capacity ${pizzasPerHourCap}/hr`}
            />
          )}
          {hourly.map((h) => {
            const heightPct = yMax > 0 ? (h.avgOrdersPerHour / yMax) * 100 : 0;
            const over = pizzasPerHourCap > 0 && h.avgOrdersPerHour > pizzasPerHourCap;
            const near = pizzasPerHourCap > 0 && h.avgOrdersPerHour > pizzasPerHourCap * 0.85;
            const bg = over
              ? "rgba(239,68,68,0.7)"
              : near
                ? "rgba(245,158,11,0.7)"
                : h.avgOrdersPerHour > 0
                  ? "rgba(59,130,246,0.7)"
                  : "rgba(0,0,0,0.05)";
            return (
              <div
                key={h.hour}
                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}
                title={`${h.hour.toString().padStart(2, "0")}:00 — avg ${h.avgOrdersPerHour.toFixed(1)} orders/hr${pizzasPerHourCap > 0 ? ` (${(h.capacityUtilization * 100).toFixed(0)}% of cap)` : ""}`}
              >
                <div
                  style={{
                    width: "100%",
                    height: `${heightPct}%`,
                    background: bg,
                    borderRadius: "3px 3px 0 0",
                    minHeight: h.avgOrdersPerHour > 0 ? 2 : 0,
                  }}
                />
                <div
                  className="v2-muted"
                  style={{ fontSize: 9, fontVariantNumeric: "tabular-nums" }}
                >
                  {h.hour % 3 === 0 ? h.hour.toString().padStart(2, "0") : ""}
                </div>
              </div>
            );
          })}
        </div>
        {pizzasPerHourCap > 0 && (
          <div className="v2-muted text-xs mt-2">
            Red bars exceed kitchen capacity · amber within 15% · dashed line = ceiling.
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** Daypart breakdown — lunch / dinner / late-night / off-peak rows pulled
 *  from real orders' createdAt hour. Surfaces the per-daypart economics
 *  the operator can't see in the daily-aggregated view. */
function DaypartPanel({ dayparts }: { dayparts: SimulationDaypartLine[] }) {
  return (
    <Card>
      <CardHeader
        title="Daypart breakdown"
        description="Per-daypart volume, AOV, and gross-profit rate. Late-night skews to higher-GM slices; dinner to full plates."
        actions={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <InfoButton title="Daypart breakdown" label="About the daypart view">
              <p>
                The daily average hides menu-mix shifts. Late-night skews to slices at
                76% GM. Dinner skews to full plates at 58-65%. Lunch is the panini-AOV
                sweet spot. The 4-bucket split lets the operator see <em>which daypart
                is actually carrying the margin</em>.
              </p>
              <p>Buckets:</p>
              <ul>
                <li><strong>Lunch</strong> 11:00 – 15:00</li>
                <li><strong>Dinner</strong> 17:00 – 22:00</li>
                <li><strong>Late-night</strong> 22:00 – 04:00</li>
                <li><strong>Off-peak</strong> — every other hour</li>
              </ul>
              <p>
                GP rate column is colour-coded: green ≥ 70%, amber 55-70%, red &lt; 55%.
                If lunch is red and dinner green, you have a lunch-menu problem; if
                late-night is the only green column, your slice strategy is doing more
                work than your dinner plates.
              </p>
            </InfoButton>
            <SourceTag kind="actuals" hint="Computed from real order timestamps." />
          </span>
        }
      />
      <CardBody>
        <table style={{ width: "100%", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
              <th style={{ padding: "8px 4px" }}>Daypart</th>
              <th style={{ padding: "8px 4px", textAlign: "right" }}>Orders</th>
              <th style={{ padding: "8px 4px", textAlign: "right" }}>Share</th>
              <th style={{ padding: "8px 4px", textAlign: "right" }}>Avg ticket</th>
              <th style={{ padding: "8px 4px", textAlign: "right" }}>Revenue</th>
              <th style={{ padding: "8px 4px", textAlign: "right" }}>GP rate</th>
            </tr>
          </thead>
          <tbody>
            {dayparts.map((d) => (
              <tr key={d.key} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                <td style={{ padding: "8px 4px" }}>
                  <div style={{ fontWeight: 500 }}>{d.label}</div>
                  <div className="v2-muted text-xs">{d.hours}</div>
                </td>
                <td className="tabular" style={{ padding: "8px 4px", textAlign: "right" }}>
                  {d.ordersCount}
                </td>
                <td className="tabular" style={{ padding: "8px 4px", textAlign: "right" }}>
                  {(d.sharePct * 100).toFixed(0)}%
                </td>
                <td className="tabular" style={{ padding: "8px 4px", textAlign: "right" }}>
                  {d.ordersCount > 0 ? `${(d.avgTicketGrosze / 100).toFixed(2)} zł` : "—"}
                </td>
                <td className="tabular" style={{ padding: "8px 4px", textAlign: "right" }}>
                  {d.revenueGrosze > 0
                    ? `${Math.round(d.revenueGrosze / 100).toLocaleString("pl-PL")} zł`
                    : "—"}
                </td>
                <td
                  className="tabular"
                  style={{
                    padding: "8px 4px",
                    textAlign: "right",
                    color:
                      d.gpRatePct >= 0.70
                        ? "rgb(22,163,74)"
                        : d.gpRatePct >= 0.55
                          ? "rgb(217,119,6)"
                          : d.ordersCount > 0
                            ? "rgb(220,38,38)"
                            : undefined,
                    fontWeight: 500,
                  }}
                >
                  {d.ordersCount > 0 ? `${(d.gpRatePct * 100).toFixed(1)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}

/** Single break-even chart replacing the 4 horizon cards. Horizontal bar
 *  shows the 0 → break-even → current → ceiling progression with the key
 *  numbers inline. Vertical "current" marker tells the operator where they
 *  stand at a glance — the original 4-card grid was clutter for one idea. */
function BreakEvenChart({
  computed,
  currentOrdersPerDay,
}: {
  computed: Computed;
  currentOrdersPerDay: number;
}) {
  const breakeven = computed.breakEvenOrdersPerDay;
  const aboveBreakeven = currentOrdersPerDay - breakeven;
  const ceiling = computed.capacityOrdersPerDay > 0
    ? computed.capacityOrdersPerDay
    : Math.max(currentOrdersPerDay, breakeven) * 1.5;
  const scaleMax = Math.max(ceiling, currentOrdersPerDay, breakeven) * 1.05;
  const safe = (v: number) => scaleMax > 0 ? Math.min(100, (v / scaleMax) * 100) : 0;
  return (
    <Card>
      <CardHeader
        title="Break-even"
        description="The minimum throughput needed to cover labor + fixed at the current ticket and CM."
        actions={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <InfoButton title={HELP.breakEven.title} label="About break-even">{HELP.breakEven.body}</InfoButton>
            <Calculator className="h-4 w-4 v2-muted" />
          </span>
        }
      />
      <CardBody>
        <div className="flex flex-wrap gap-6 mb-3">
          <Stat label="Break-even orders / day" value={breakeven.toFixed(1)} />
          <Stat label="Break-even orders / month" value={Math.ceil(computed.breakEvenOrdersPerMonth).toLocaleString("pl-PL")} />
          <Stat label="Break-even revenue / month" value={`${Math.round(computed.breakEvenRevenue / 100).toLocaleString("pl-PL")} zł`} />
          <Stat
            label="Margin of safety"
            value={`${(computed.marginOfSafetyPct * 100).toFixed(1)}%`}
          />
          <Stat
            label="Current vs break-even"
            value={
              aboveBreakeven >= 0
                ? `+${aboveBreakeven.toFixed(1)} above`
                : `${aboveBreakeven.toFixed(1)} below`
            }
          />
        </div>
        <div style={{ position: "relative", height: 40, marginTop: 8 }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 14,
              height: 12,
              background: "linear-gradient(to right, rgba(239,68,68,0.20), rgba(245,158,11,0.20), rgba(34,197,94,0.20))",
              borderRadius: 999,
            }}
          />
          {/* Break-even marker */}
          <div
            style={{
              position: "absolute",
              left: `${safe(breakeven)}%`,
              top: 4,
              bottom: 4,
              width: 2,
              background: "rgba(239,68,68,0.8)",
              transform: "translateX(-50%)",
            }}
            title={`Break-even ${breakeven.toFixed(1)} / day`}
          />
          {/* Capacity ceiling marker (when set) */}
          {computed.capacityOrdersPerDay > 0 && (
            <div
              style={{
                position: "absolute",
                left: `${safe(computed.capacityOrdersPerDay)}%`,
                top: 4,
                bottom: 4,
                width: 2,
                background: "rgba(0,0,0,0.4)",
                transform: "translateX(-50%)",
              }}
              title={`Kitchen capacity ${computed.capacityOrdersPerDay.toFixed(0)} / day`}
            />
          )}
          {/* Current marker (filled dot) */}
          <div
            style={{
              position: "absolute",
              left: `${safe(currentOrdersPerDay)}%`,
              top: 8,
              width: 24,
              height: 24,
              background: aboveBreakeven >= 0 ? "rgb(22,163,74)" : "rgb(220,38,38)",
              borderRadius: "50%",
              transform: "translateX(-50%)",
              border: "3px solid white",
              boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
            }}
            title={`Current ${currentOrdersPerDay.toFixed(0)} / day`}
          />
        </div>
        <div className="flex justify-between v2-muted text-xs mt-1">
          <span>0</span>
          <span>break-even {breakeven.toFixed(0)}</span>
          {computed.capacityOrdersPerDay > 0 && <span>capacity {computed.capacityOrdersPerDay.toFixed(0)}</span>}
          <span>{Math.round(scaleMax)}</span>
        </div>
      </CardBody>
    </Card>
  );
}

interface AttachLeverEfficiency {
  key: string;
  label: string;
  attachPct: number;
  avgPriceGrosze: number;
  cogsPct: number;
  /** Per-attached-order incremental contribution after own COGS only —
   *  what each attached unit actually adds to gross margin. */
  incrementalCmPerUnitGrosze: number;
  /** Monthly profit lift = attachPct × incrementalCm × ordersPerMonth. */
  monthlyLiftGrosze: number;
}

/** Per-lever attachment efficiency — answers "is the espresso push actually
 *  earning its slot?" by computing the incremental contribution per attached
 *  item (avgPrice × (1 − itemCogsPct)) and the total monthly lift. */
function computeAttachmentEfficiency(s: SimulationScenario): AttachLeverEfficiency[] {
  const a = s.assumptions;
  if (!a) return [];
  const ordersPerMonth = s.ordersPerDay * s.daysOpenPerMonth;
  const rows: AttachLeverEfficiency[] = [];
  const levers: Array<[string, string, typeof a.coffeeAttach]> = [
    ["coffee", "Coffee attach", a.coffeeAttach],
    ["dessert", "Dessert attach", a.dessertAttach],
    ["antipasti", "Antipasti attach", a.antipastiAttach],
    ["aperitivo", "Aperitivo attach", a.aperitivoAttach],
    ["premiumToppings", "Premium toppings", a.premiumToppingsAttach],
    ["pastaPrimo", "Pasta primo", a.pastaPrimoAttach],
  ];
  for (const [key, label, lever] of levers) {
    if (!lever || lever.enabled === false || lever.attachPct === 0) continue;
    const incrementalCm = lever.avgPriceGrosze * (1 - lever.cogsPct);
    rows.push({
      key,
      label,
      attachPct: lever.attachPct,
      avgPriceGrosze: lever.avgPriceGrosze,
      cogsPct: lever.cogsPct,
      incrementalCmPerUnitGrosze: incrementalCm,
      monthlyLiftGrosze: lever.attachPct * incrementalCm * ordersPerMonth,
    });
  }
  return rows.sort((a, b) => b.monthlyLiftGrosze - a.monthlyLiftGrosze);
}

/** Attachment efficiency panel — shows each enabled attach lever ranked by
 *  monthly profit lift, with per-unit incremental margin. The operator can
 *  see at a glance which levers earn their menu real-estate vs which are
 *  drag (high attach but low margin per attached item). */
function AttachmentEfficiencyPanel({ rows }: { rows: AttachLeverEfficiency[] }) {
  if (rows.length === 0) return null;
  const totalLift = rows.reduce((sum, r) => sum + r.monthlyLiftGrosze, 0);
  return (
    <Card>
      <CardHeader
        title="Attachment efficiency"
        description="Per-attach-lever incremental contribution and monthly profit lift. Ranks the levers by absolute money — not just attach rate."
        actions={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <InfoButton title="Attachment efficiency" label="About attachment efficiency">
              <p>
                Attach rate is half the story. A 30% espresso attach at 88% margin earns
                more than a 50% pasta attach at 26% margin — the lever you push depends on
                the <em>money</em>, not the percentage.
              </p>
              <p>
                <strong>Incremental margin / unit = avgPrice × (1 − itemCOGS%)</strong>.
                The food cost of the attached item only; the rest of variable leakage
                (waste, refund, loyalty, fees) is already netted in the main P&amp;L.
              </p>
              <p>
                <strong>Monthly lift = attachPct × incremental margin × orders/month.</strong>
                Sorted descending so the lever with the biggest absolute money is at the
                top of the table — that&apos;s where to push.
              </p>
              <p>
                Espresso is almost always the #1 puzzle in a Neapolitan menu: low friction,
                85-88% margin, near-zero kitchen time. A 25→45pp espresso push adds
                ~3,900 zł/mo of pure CM at default volumes with no capex.
              </p>
            </InfoButton>
            <HandCoins className="h-4 w-4 v2-muted" />
          </span>
        }
      />
      <CardBody>
        <table style={{ width: "100%", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
              <th style={{ padding: "8px 4px" }}>Lever</th>
              <th style={{ padding: "8px 4px", textAlign: "right" }}>Attach</th>
              <th style={{ padding: "8px 4px", textAlign: "right" }}>Price</th>
              <th style={{ padding: "8px 4px", textAlign: "right" }}>Item COGS</th>
              <th style={{ padding: "8px 4px", textAlign: "right" }}>Inc. margin</th>
              <th style={{ padding: "8px 4px", textAlign: "right" }}>Monthly lift</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                <td style={{ padding: "8px 4px", fontWeight: 500 }}>{r.label}</td>
                <td className="tabular" style={{ padding: "8px 4px", textAlign: "right" }}>
                  {(r.attachPct * 100).toFixed(0)}%
                </td>
                <td className="tabular" style={{ padding: "8px 4px", textAlign: "right" }}>
                  {(r.avgPriceGrosze / 100).toFixed(2)} zł
                </td>
                <td className="tabular" style={{ padding: "8px 4px", textAlign: "right" }}>
                  {(r.cogsPct * 100).toFixed(0)}%
                </td>
                <td
                  className="tabular"
                  style={{
                    padding: "8px 4px",
                    textAlign: "right",
                    color: r.incrementalCmPerUnitGrosze >= 500 ? "rgb(22,163,74)" : "inherit",
                    fontWeight: 500,
                  }}
                >
                  {(r.incrementalCmPerUnitGrosze / 100).toFixed(2)} zł
                </td>
                <td
                  className="tabular"
                  style={{ padding: "8px 4px", textAlign: "right", fontWeight: 500 }}
                >
                  {Math.round(r.monthlyLiftGrosze / 100).toLocaleString("pl-PL")} zł
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: "2px solid rgba(0,0,0,0.12)" }}>
              <td style={{ padding: "8px 4px", fontWeight: 700 }}>Total lift</td>
              <td colSpan={4}></td>
              <td
                className="tabular"
                style={{ padding: "8px 4px", textAlign: "right", fontWeight: 700 }}
              >
                {Math.round(totalLift / 100).toLocaleString("pl-PL")} zł / mo
              </td>
            </tr>
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}

/** One row of the unit-economics breakdown table. Hoisted out of
 *  UnitEconomicsPanel so React doesn't recreate the component on
 *  every render (react-hooks/static-components). Each row carries a
 *  horizontal bar sized to abs(grosze) / scaleMax — costs lean left
 *  in their tone colour, totals lean right in green. % of revenue
 *  column gives a second visual cue. */
function UnitEconRow({
  label,
  grosze,
  bold,
  isTotal,
  tone,
  note,
  revenuePerOrder,
  scaleMax,
}: {
  label: string;
  grosze: number;
  bold?: boolean;
  isTotal?: boolean;
  tone?: "neutral" | "warning" | "success" | "danger" | "brand";
  note?: string;
  revenuePerOrder: number;
  scaleMax: number;
}) {
  const tonePalette: Record<NonNullable<typeof tone>, { fg: string; bar: string }> = {
    neutral: { fg: "inherit", bar: "rgba(0,0,0,0.15)" },
    warning: { fg: "rgb(217,119,6)", bar: "rgba(245,158,11,0.45)" },
    success: { fg: "rgb(22,163,74)", bar: "rgba(34,197,94,0.45)" },
    danger: { fg: "rgb(220,38,38)", bar: "rgba(239,68,68,0.45)" },
    brand: { fg: "rgb(37,99,235)", bar: "rgba(59,130,246,0.45)" },
  };
  const c = tone ? tonePalette[tone] : tonePalette.neutral;
  const pctOfRevenue = revenuePerOrder > 0 ? Math.abs(grosze) / revenuePerOrder : 0;
  const barPct = scaleMax > 0 ? (Math.abs(grosze) / scaleMax) * 100 : 0;
  const isCost = grosze < 0;
  return (
    <tr
      style={{
        borderTop: isTotal ? "2px solid rgba(0,0,0,0.12)" : "1px solid rgba(0,0,0,0.04)",
        background: isTotal ? "rgba(0,0,0,0.02)" : undefined,
      }}
    >
      <td
        style={{
          padding: "10px 8px",
          fontWeight: bold ? 700 : 400,
          color: c.fg,
          width: "32%",
        }}
      >
        {label}
      </td>
      <td style={{ padding: "10px 4px", width: "30%", position: "relative" }}>
        <div
          style={{
            position: "relative",
            height: 6,
            background: "rgba(0,0,0,0.04)",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: isCost ? "auto" : 0,
              right: isCost ? 0 : "auto",
              top: 0,
              bottom: 0,
              width: `${Math.min(100, barPct)}%`,
              background: c.bar,
              borderRadius: 999,
            }}
          />
        </div>
      </td>
      <td
        className="tabular"
        style={{
          padding: "10px 8px",
          textAlign: "right",
          fontWeight: bold ? 700 : 500,
          color: c.fg,
          width: "16%",
          fontSize: bold ? 15 : 13,
        }}
      >
        {grosze >= 0 ? "+" : ""}
        {(grosze / 100).toFixed(2)} zł
      </td>
      <td
        className="tabular"
        style={{
          padding: "10px 4px",
          textAlign: "right",
          color: "rgba(0,0,0,0.55)",
          width: "8%",
          fontSize: 12,
        }}
      >
        {pctOfRevenue > 0 ? `${(pctOfRevenue * 100).toFixed(1)}%` : "—"}
      </td>
      <td
        className="v2-muted text-xs"
        style={{ padding: "10px 8px", maxWidth: 360, fontStyle: "italic" }}
      >
        {note ?? ""}
      </td>
    </tr>
  );
}

/** Unit economics breakdown — the audit's exact table. Per-order build-up
 *  showing every variable leakage explicitly, so the operator sees what
 *  the true contribution per order is — not the upper-bound CM1 that
 *  ignores packaging, refunds, loyalty, and marketing CAC. Dynamic:
 *  zero-value rows are hidden, bars scale to revenue, headline CM1 / CM2
 *  pull out as KPI tiles above the table. */
function UnitEconomicsPanel({
  scenario,
  computed,
}: {
  scenario: SimulationScenario;
  computed: Computed;
}) {
  const orders = scenario.ordersPerDay * scenario.daysOpenPerMonth;
  if (orders <= 0) return null;
  const revenuePerOrder = scenario.avgTicketGrosze;
  const cogsPerOrder = revenuePerOrder * scenario.cogsPct;
  const packagingPerOrder = scenario.packagingPerOrderGrosze ?? 0;
  const wastePerOrder = revenuePerOrder * (scenario.wastePct ?? 0);
  const refundPerOrder = revenuePerOrder * (scenario.refundPct ?? 0);
  const loyaltyPerOrder = revenuePerOrder * (scenario.loyaltyBurnPct ?? 0);
  const paymentPerOrder = revenuePerOrder * (scenario.paymentProcessorPct ?? 0);
  const marketingPerOrder = orders > 0 ? computed.marketingCac / orders : 0;
  const cm1PerOrder = computed.trueCm1PerOrderGrosze;
  const laborPerOrder = computed.laborMonthly / orders;
  const fixedPerOrder = (computed.fixedTotal + computed.depreciation + computed.interest) / orders;
  const cm2PerOrder = cm1PerOrder - laborPerOrder - fixedPerOrder;
  // Bars scale to revenue so the relative magnitudes are honest.
  const scaleMax = revenuePerOrder;
  const cm1Pct = revenuePerOrder > 0 ? cm1PerOrder / revenuePerOrder : 0;
  const cm2Pct = revenuePerOrder > 0 ? cm2PerOrder / revenuePerOrder : 0;
  // Pre-CM1 cost lines — hide any that are zero so the table stays tight.
  const variableLines: Array<{ key: string; label: string; grosze: number; note: string; tone: "warning" }> = [
    { key: "cogs", label: "Less: COGS (food)", grosze: -cogsPerOrder, tone: "warning", note: `${(scenario.cogsPct * 100).toFixed(1)}% — flat or recipe-weighted via actuals` },
    { key: "packaging", label: "Less: Packaging", grosze: -packagingPerOrder, tone: "warning", note: "Napkins / plates wash / boxes — every order" },
    { key: "waste", label: "Less: Waste & spoilage", grosze: -wastePerOrder, tone: "warning", note: `${((scenario.wastePct ?? 0) * 100).toFixed(1)}% of revenue` },
    { key: "refund", label: "Less: Refund / comp / theft", grosze: -refundPerOrder, tone: "warning", note: `${((scenario.refundPct ?? 0) * 100).toFixed(1)}% of revenue` },
    { key: "loyalty", label: "Less: Loyalty burn", grosze: -loyaltyPerOrder, tone: "warning", note: `${((scenario.loyaltyBurnPct ?? 0) * 100).toFixed(1)}% — points redeemed` },
    { key: "payment", label: "Less: Payment fees (blended)", grosze: -paymentPerOrder, tone: "warning", note: `${((scenario.paymentProcessorPct ?? 0) * 100).toFixed(2)}% — cash + card + marketplaces blended` },
    { key: "cac", label: "Less: Marketing CAC (amortised)", grosze: -marketingPerOrder, tone: "warning", note: computed.marketingCac > 0 ? `${Math.round(computed.marketingCac / 100).toLocaleString("pl-PL")} zł/mo ÷ ${Math.round(orders).toLocaleString("pl-PL")} orders` : "Marketing left in fixed costs" },
  ];
  const fixedLines: Array<{ key: string; label: string; grosze: number; note: string; tone: "warning" }> = [
    { key: "labor", label: "Less: Labor amortised", grosze: -laborPerOrder, tone: "warning", note: `${Math.round(computed.laborMonthly / 100).toLocaleString("pl-PL")} zł/mo ÷ ${Math.round(orders).toLocaleString("pl-PL")} orders` },
    { key: "fixed", label: "Less: Fixed amortised (+ D&A + interest)", grosze: -fixedPerOrder, tone: "warning", note: `${Math.round((computed.fixedTotal + computed.depreciation + computed.interest) / 100).toLocaleString("pl-PL")} zł/mo ÷ orders` },
  ];
  const isNonzero = (g: number) => Math.abs(g) >= 1;
  const cm1Tone: "success" | "warning" | "danger" =
    cm1PerOrder >= revenuePerOrder * 0.40
      ? "success"
      : cm1PerOrder >= revenuePerOrder * 0.20
        ? "warning"
        : "danger";
  const cm2Tone: "success" | "warning" | "danger" =
    cm2PerOrder >= revenuePerOrder * 0.10
      ? "success"
      : cm2PerOrder >= 0
        ? "warning"
        : "danger";
  return (
    <Card>
      <CardHeader
        title="Unit economics breakdown"
        description="The honest per-order build-up — every variable leakage between Revenue and True CM1 is broken out explicitly. Bars scale to revenue so relative magnitudes are visible at a glance. Zero-value lines auto-hide. CM1 and CM2 headline above the table; row-level % column shows each line's share of the ticket."
        actions={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <InfoButton title="Unit economics" label="About unit economics">
              <p>
                <strong>True CM1</strong> = revenue per order, minus every <em>variable</em>
                leakage (food cost, packaging, waste, refunds, loyalty burn, payment fees,
                marketing CAC). This is what an institutional underwriter computes from
                line-item P&amp;L.
              </p>
              <p>
                <strong>True CM2</strong> = CM1 minus the per-order share of <em>labor</em>
                and <em>fixed costs</em> (including D&amp;A and interest). Positive CM2 means
                each order, on average, makes a small contribution to net profit after taxes.
              </p>
              <p>
                Why bars + %: a 1 zł payment fee and a 20 zł COGS line are not comparable
                visually without scaling. The bar lengths reflect absolute zł impact; the %
                column reflects share of ticket.
              </p>
            </InfoButton>
            <Calculator className="h-4 w-4 v2-muted" />
          </span>
        }
      />
      <CardBody>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KpiCard
            label="Revenue / order"
            value={revenuePerOrder / 100}
            format={(n) => `${n.toFixed(2)} zł`}
            icon={HandCoins}
            tone="info"
            hint="Gross ticket size"
          />
          <KpiCard
            label="True CM1 / order"
            value={cm1PerOrder / 100}
            format={(n) => `${n.toFixed(2)} zł`}
            icon={Wallet}
            tone={cm1Tone}
            hint={`${(cm1Pct * 100).toFixed(1)}% of revenue`}
          />
          <KpiCard
            label="True CM2 / order"
            value={cm2PerOrder / 100}
            format={(n) => `${n.toFixed(2)} zł`}
            icon={PiggyBank}
            tone={cm2Tone}
            hint={`${(cm2Pct * 100).toFixed(1)}% of revenue · post-labor & fixed`}
          />
          <KpiCard
            label="Monthly orders"
            value={orders}
            format={(n) => Math.round(n).toLocaleString("pl-PL")}
            icon={Gauge}
            tone="neutral"
            hint={`${scenario.ordersPerDay}/day × ${scenario.daysOpenPerMonth} days`}
          />
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "rgba(0,0,0,0.55)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>
                <th style={{ padding: "0 8px 8px" }}>Line</th>
                <th style={{ padding: "0 4px 8px" }}>Magnitude</th>
                <th style={{ padding: "0 8px 8px", textAlign: "right" }}>zł / order</th>
                <th style={{ padding: "0 4px 8px", textAlign: "right" }}>% rev</th>
                <th style={{ padding: "0 8px 8px" }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              <UnitEconRow
                label="Revenue / order"
                grosze={revenuePerOrder}
                bold
                tone="brand"
                revenuePerOrder={revenuePerOrder}
                scaleMax={scaleMax}
                note="Gross ticket — the start of the build-up"
              />
              {variableLines
                .filter((l) => isNonzero(l.grosze))
                .map((l) => (
                  <UnitEconRow
                    key={l.key}
                    label={l.label}
                    grosze={l.grosze}
                    tone={l.tone}
                    note={l.note}
                    revenuePerOrder={revenuePerOrder}
                    scaleMax={scaleMax}
                  />
                ))}
              <UnitEconRow
                label="= True CM1 / order"
                grosze={cm1PerOrder}
                bold
                isTotal
                tone={cm1Tone}
                note="What actually drops to gross profit per order"
                revenuePerOrder={revenuePerOrder}
                scaleMax={scaleMax}
              />
              {fixedLines
                .filter((l) => isNonzero(l.grosze))
                .map((l) => (
                  <UnitEconRow
                    key={l.key}
                    label={l.label}
                    grosze={l.grosze}
                    tone={l.tone}
                    note={l.note}
                    revenuePerOrder={revenuePerOrder}
                    scaleMax={scaleMax}
                  />
                ))}
              <UnitEconRow
                label="= True CM2 / order"
                grosze={cm2PerOrder}
                bold
                isTotal
                tone={cm2Tone}
                note="Pre-tax contribution after everything except CIT"
                revenuePerOrder={revenuePerOrder}
                scaleMax={scaleMax}
              />
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

/** Per-channel CM1 — the "is delivery actually profitable?" answer. Shows
 *  every channel's fee, contribution margin per order, and monthly
 *  contribution side-by-side. Glovo / Wolt rows go red the moment the
 *  commission eats more than the food cost — the moment marketplace
 *  orders become value-destructive. */
function ChannelEconomicsPanel({ rows }: { rows: ChannelEconomicsRow[] }) {
  const active = rows.filter((r) => r.sharePct > 0);
  if (active.length === 0) return null;
  return (
    <Card>
      <CardHeader
        title="Per-channel CM1"
        description="Contribution margin per order by channel. Cash, on-site card, Glovo and Wolt pay wildly different fees — the blended P&L hides which channels actually carry the business."
        actions={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <InfoButton title="Per-channel CM1" label="About per-channel CM1">
              <p>
                The blended P&amp;L lumps every channel together. This panel does the
                opposite — splits revenue across the four channels and shows what each
                actually contributes after its own fee.
              </p>
              <p>
                <strong>CM1 = ticket × (1 − food cost − fee − waste − refund − loyalty).</strong>
                The variable leakage rates (waste, refund, loyalty) are the same across
                channels — they reflect operation reality, not channel selection. The fee
                column is where channels diverge: cash 0%, on-site card 1-2%, Glovo 27%,
                Wolt 28%.
              </p>
              <p>
                <strong>Red &lt; 20%</strong> means each order is value-destructive — the
                channel is eating the profit it&apos;s supposed to generate. <strong>Amber
                20-40%</strong> is acceptable but tight. <strong>Green ≥ 40%</strong> is
                where the channel actually carries the business. Glovo / Wolt rows
                typically land in red the moment commission + food cost exceeds 80% of
                ticket — see the margin-traps callout below.
              </p>
              <p className="v2-muted text-xs">
                Operator note: cash share + on-site share + Glovo share + Wolt share
                should sum to 1. Adjust shares in the assumptions card.
              </p>
            </InfoButton>
            <Calculator className="h-4 w-4 v2-muted" />
          </span>
        }
      />
      <CardBody>
        <table style={{ width: "100%", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
              <th style={{ padding: "8px 4px" }}>Channel</th>
              <th style={{ padding: "8px 4px", textAlign: "right" }}>Share</th>
              <th style={{ padding: "8px 4px", textAlign: "right" }}>Fee</th>
              <th style={{ padding: "8px 4px", textAlign: "right" }}>CM1 / order</th>
              <th style={{ padding: "8px 4px", textAlign: "right" }}>CM1 %</th>
              <th style={{ padding: "8px 4px", textAlign: "right" }}>Monthly</th>
            </tr>
          </thead>
          <tbody>
            {active.map((r) => {
              const dangerCm = r.cm1PctOfTicket < 0.20;
              const warnCm = r.cm1PctOfTicket < 0.40;
              return (
                <tr key={r.key} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                  <td style={{ padding: "8px 4px", fontWeight: 500 }}>{r.label}</td>
                  <td className="tabular" style={{ padding: "8px 4px", textAlign: "right" }}>
                    {(r.sharePct * 100).toFixed(0)}%
                  </td>
                  <td className="tabular" style={{ padding: "8px 4px", textAlign: "right" }}>
                    {(r.feePct * 100).toFixed(1)}%
                  </td>
                  <td className="tabular" style={{ padding: "8px 4px", textAlign: "right" }}>
                    {(r.cm1PerOrderGrosze / 100).toFixed(2)} zł
                  </td>
                  <td
                    className="tabular"
                    style={{
                      padding: "8px 4px",
                      textAlign: "right",
                      color: dangerCm ? "rgb(220,38,38)" : warnCm ? "rgb(217,119,6)" : "rgb(22,163,74)",
                      fontWeight: 500,
                    }}
                  >
                    {(r.cm1PctOfTicket * 100).toFixed(1)}%
                  </td>
                  <td className="tabular" style={{ padding: "8px 4px", textAlign: "right" }}>
                    {Math.round(r.monthlyContributionGrosze / 100).toLocaleString("pl-PL")} zł
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="v2-muted text-xs mt-2">
          CM1 = ticket × (1 − food cost − fee − waste − refund − loyalty).
          Red &lt; 20% (value-destructive) · amber &lt; 40% · green ≥ 40%.
        </div>
      </CardBody>
    </Card>
  );
}

/** Multi-unit fleet model — the franchise / scale conversation. Lets the
 *  operator dial in unit count + HQ overhead + royalty/marketing fund +
 *  supply / commissary triggers + DMA cannibalisation and see the
 *  aggregate fleet P&L. The model the audit said was missing entirely. */
function FleetPanel({
  scenario,
  fleet,
  onUpdate,
}: {
  scenario: SimulationScenario;
  fleet: FleetEconomics | null;
  onUpdate: (mut: Partial<SimulationFleetModel>) => void;
}) {
  const f = scenario.fleet ?? DEFAULT_FLEET;
  const numericPct = (v: number, decimals = 1) => `${(v * 100).toFixed(decimals)}%`;
  return (
    <Card>
      <CardHeader
        title="Fleet model (multi-unit)"
        description="Set unitCount > 1 to activate the scale story — HQ overhead absorption, supply discount, commissary, royalty + marketing fund, DMA cannibalisation, and the build-out learning curve. Computes per-unit averages and fleet totals so the franchise conversation has a defensible model behind it."
        actions={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <InfoButton title="Fleet model" label="About the fleet model">
              <p>
                <strong>Per-unit P&amp;L × N</strong>, then the scale mechanics layer on:
              </p>
              <ul>
                <li><strong>HQ overhead absorption</strong> — regional manager / ops / finance shared across N units; its share of revenue should drop below 5% past 10 units.</li>
                <li><strong>Supply discount</strong> — wholesale mozzarella, flour, EVOO suppliers stop quoting list at 4-5 units; −8 to −12% on COGS is the realistic band.</li>
                <li><strong>Commissary</strong> — centralised dough + sauce production becomes cost-positive once you have 4+ units to feed; nets ~3-6 pp of COGS once the central facility&apos;s run-rate cost is subtracted.</li>
                <li><strong>Royalty + marketing fund</strong> — institutional franchise norm 5-6% + 2-3% of unit revenue. Both deducted from unit-level EBITDA.</li>
                <li><strong>DMA cannibalisation</strong> — each new unit in the same trade area takes this share from prior trucks; modeled as <code>(1 − pct)^(n−1)</code> retained.</li>
                <li><strong>Build-out learning curve</strong> — each new unit costs <code>(1 − learning)^(n−1)</code> × the original setup, floored at the minimum.</li>
              </ul>
              <p>The per-unit table below shows what each truck contributes after all of the above; the strip above shows fleet totals.</p>
            </InfoButton>
            <Grid3X3 className="h-4 w-4 v2-muted" />
            <span className="v2-muted text-xs">{f.unitCount} unit{f.unitCount === 1 ? "" : "s"}</span>
          </span>
        }
      />
      <CardBody>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <Input
            label="Unit count"
            type="number"
            min="1"
            max="200"
            step="1"
            value={String(f.unitCount)}
            onChange={(e) =>
              onUpdate({ unitCount: Math.max(1, Math.min(200, parseInt(e.target.value, 10) || 1)) })
            }
            description="≥ 2 activates fleet panel"
          />
          <Input
            label="HQ overhead"
            type="number"
            min="0"
            step="500"
            value={(f.hqOverheadMonthlyGrosze / 100).toFixed(0)}
            onChange={(e) =>
              onUpdate({
                hqOverheadMonthlyGrosze: Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100)),
              })
            }
            trailingAdornment={<span className="v2-muted">zł/mo</span>}
            description="Regional manager, ops, finance"
          />
          <Input
            label="Royalty %"
            type="number"
            min="0"
            max="20"
            step="0.5"
            value={(f.royaltyPct * 100).toFixed(1)}
            onChange={(e) =>
              onUpdate({ royaltyPct: Math.max(0, Math.min(0.2, (parseFloat(e.target.value) || 0) / 100)) })
            }
            trailingAdornment={<span className="v2-muted">%</span>}
            description="Franchise norm 5-6%"
          />
          <Input
            label="Marketing fund %"
            type="number"
            min="0"
            max="10"
            step="0.5"
            value={(f.marketingFundPct * 100).toFixed(1)}
            onChange={(e) =>
              onUpdate({ marketingFundPct: Math.max(0, Math.min(0.1, (parseFloat(e.target.value) || 0) / 100)) })
            }
            trailingAdornment={<span className="v2-muted">%</span>}
            description="Norm 2-3%"
          />
          <Input
            label="Supply discount at"
            type="number"
            min="1"
            max="200"
            step="1"
            value={String(f.supplyDiscountAtUnits)}
            onChange={(e) =>
              onUpdate({ supplyDiscountAtUnits: Math.max(1, parseInt(e.target.value, 10) || 1) })
            }
            description="Units before COGS discount kicks in"
          />
          <Input
            label="Supply discount"
            type="number"
            min="0"
            max="40"
            step="1"
            value={(f.supplyDiscountPct * 100).toFixed(0)}
            onChange={(e) =>
              onUpdate({ supplyDiscountPct: Math.max(0, Math.min(0.4, (parseFloat(e.target.value) || 0) / 100)) })
            }
            trailingAdornment={<span className="v2-muted">%</span>}
            description="-8 to -12% typical"
          />
          <Input
            label="Commissary at"
            type="number"
            min="1"
            max="200"
            step="1"
            value={String(f.commissaryEnabledAtUnits)}
            onChange={(e) =>
              onUpdate({ commissaryEnabledAtUnits: Math.max(1, parseInt(e.target.value, 10) || 1) })
            }
            description="Units before central dough/sauce"
          />
          <Input
            label="Commissary saving"
            type="number"
            min="0"
            max="20"
            step="0.5"
            value={(f.commissarySavingsPct * 100).toFixed(1)}
            onChange={(e) =>
              onUpdate({ commissarySavingsPct: Math.max(0, Math.min(0.2, (parseFloat(e.target.value) || 0) / 100)) })
            }
            trailingAdornment={<span className="v2-muted">%</span>}
            description="Net of commissary run-rate cost"
          />
          <Input
            label="DMA cannibalisation"
            type="number"
            min="0"
            max="50"
            step="1"
            value={(f.dmaOverlapPct * 100).toFixed(0)}
            onChange={(e) =>
              onUpdate({ dmaOverlapPct: Math.max(0, Math.min(0.5, (parseFloat(e.target.value) || 0) / 100)) })
            }
            trailingAdornment={<span className="v2-muted">%</span>}
            description="Revenue loss per overlapping prior unit"
          />
          <Input
            label="Build-out learning"
            type="number"
            min="0"
            max="20"
            step="1"
            value={(f.buildoutLearningPct * 100).toFixed(0)}
            onChange={(e) =>
              onUpdate({ buildoutLearningPct: Math.max(0, Math.min(0.2, (parseFloat(e.target.value) || 0) / 100)) })
            }
            trailingAdornment={<span className="v2-muted">%</span>}
            description="Setup cost decline per added unit"
          />
          <Input
            label="Build-out floor"
            type="number"
            min="20"
            max="100"
            step="5"
            value={(f.buildoutFloorPct * 100).toFixed(0)}
            onChange={(e) =>
              onUpdate({ buildoutFloorPct: Math.max(0.2, Math.min(1, (parseFloat(e.target.value) || 0) / 100)) })
            }
            trailingAdornment={<span className="v2-muted">%</span>}
            description="Minimum cost as % of unit 1"
          />
        </div>
        {fleet && fleet.unitCount > 1 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <KpiCard
                label="Fleet revenue / mo"
                value={fleet.totalRevenue / 100}
                format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
                tone="info"
                hint={`${fleet.unitCount} units · avg ${Math.round(fleet.avgRevenuePerUnit / 100).toLocaleString("pl-PL")} zł / unit`}
              />
              <KpiCard
                label="Fleet EBITDA / mo"
                value={fleet.totalEbitda / 100}
                format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
                tone={fleet.totalEbitda >= 0 ? "success" : "danger"}
                hint={`After ${Math.round(fleet.hqOverhead / 100).toLocaleString("pl-PL")} zł HQ overhead`}
              />
              <KpiCard
                label="EBITDA / unit"
                value={fleet.avgEbitdaPerUnit / 100}
                format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
                tone={fleet.avgEbitdaPerUnit >= 0 ? "success" : "danger"}
                hint="Average over the fleet"
              />
              <KpiCard
                label="HQ overhead absorption"
                value={fleet.hqOverheadAbsorption * 100}
                format={(n) => `${n.toFixed(1)}%`}
                tone={fleet.hqOverheadAbsorption < 0.05 ? "success" : fleet.hqOverheadAbsorption < 0.10 ? "info" : "warning"}
                hint="HQ / fleet revenue"
              />
              <KpiCard
                label="Fleet build-out"
                value={fleet.totalSetupCost / 100}
                format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
                tone="neutral"
                hint={`Last unit ${Math.round(fleet.units[fleet.units.length - 1].setupCost / 100).toLocaleString("pl-PL")} zł`}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {fleet.supplyDiscountActive && (
                <span className="v2-pill" style={{ background: "rgba(34,197,94,0.10)", color: "rgb(22,163,74)" }}>
                  Supply discount −{numericPct(f.supplyDiscountPct, 0)} active
                </span>
              )}
              {fleet.commissaryActive && (
                <span className="v2-pill" style={{ background: "rgba(34,197,94,0.10)", color: "rgb(22,163,74)" }}>
                  Commissary saving −{numericPct(f.commissarySavingsPct, 1)} active
                </span>
              )}
              {f.royaltyPct > 0 && (
                <span className="v2-pill" style={{ background: "rgba(59,130,246,0.10)", color: "rgb(37,99,235)" }}>
                  Royalty {numericPct(f.royaltyPct, 1)}
                </span>
              )}
              {f.marketingFundPct > 0 && (
                <span className="v2-pill" style={{ background: "rgba(59,130,246,0.10)", color: "rgb(37,99,235)" }}>
                  Marketing fund {numericPct(f.marketingFundPct, 1)}
                </span>
              )}
              {f.dmaOverlapPct > 0 && (
                <span className="v2-pill" style={{ background: "rgba(239,68,68,0.10)", color: "rgb(220,38,38)" }}>
                  DMA drag {numericPct(f.dmaOverlapPct, 0)} / unit
                </span>
              )}
            </div>
            <table className="mt-4" style={{ width: "100%", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                  <th style={{ padding: "6px 4px" }}>Unit</th>
                  <th style={{ padding: "6px 4px", textAlign: "right" }}>Revenue</th>
                  <th style={{ padding: "6px 4px", textAlign: "right" }}>COGS</th>
                  <th style={{ padding: "6px 4px", textAlign: "right" }}>Labor</th>
                  <th style={{ padding: "6px 4px", textAlign: "right" }}>Royalty</th>
                  <th style={{ padding: "6px 4px", textAlign: "right" }}>Mkt fund</th>
                  <th style={{ padding: "6px 4px", textAlign: "right" }}>EBITDA</th>
                  <th style={{ padding: "6px 4px", textAlign: "right" }}>Setup</th>
                </tr>
              </thead>
              <tbody>
                {fleet.units.map((u) => (
                  <tr key={u.unitIndex} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                    <td style={{ padding: "6px 4px", fontWeight: 500 }}>#{u.unitIndex}</td>
                    <td className="tabular" style={{ padding: "6px 4px", textAlign: "right" }}>
                      {Math.round(u.revenue / 100).toLocaleString("pl-PL")} zł
                    </td>
                    <td className="tabular" style={{ padding: "6px 4px", textAlign: "right" }}>
                      {Math.round(u.cogs / 100).toLocaleString("pl-PL")} zł
                    </td>
                    <td className="tabular" style={{ padding: "6px 4px", textAlign: "right" }}>
                      {Math.round(u.labor / 100).toLocaleString("pl-PL")} zł
                    </td>
                    <td className="tabular" style={{ padding: "6px 4px", textAlign: "right" }}>
                      {Math.round(u.royalty / 100).toLocaleString("pl-PL")} zł
                    </td>
                    <td className="tabular" style={{ padding: "6px 4px", textAlign: "right" }}>
                      {Math.round(u.marketingFund / 100).toLocaleString("pl-PL")} zł
                    </td>
                    <td
                      className="tabular"
                      style={{ padding: "6px 4px", textAlign: "right", color: u.ebitda >= 0 ? "rgb(22,163,74)" : "rgb(220,38,38)", fontWeight: 500 }}
                    >
                      {Math.round(u.ebitda / 100).toLocaleString("pl-PL")} zł
                    </td>
                    <td className="tabular" style={{ padding: "6px 4px", textAlign: "right" }}>
                      {Math.round(u.setupCost / 100).toLocaleString("pl-PL")} zł
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {(!fleet || fleet.unitCount <= 1) && (
          <div className="v2-muted text-sm mt-2">
            Set Unit count ≥ 2 to model the fleet. Defaults reflect Polish QSR rollup norms (6% royalty, 2% marketing fund, −10% supply at 5 units, commissary at 4 units, 15% DMA cannibalisation, 5% build-out learning per unit to a 55% floor).
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** Same-store sales growth — comp-sales the way every restaurant chain in
 *  the world reports it. Decomposes revenue growth into volume / ticket /
 *  customer-acquisition so the operator sees what drove the move. */
function SssgStrip({ sssg }: { sssg: SimulationSssgSnapshot }) {
  const fmtPct = (v: number) =>
    `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
  const toneFor = (v: number): "success" | "warning" | "danger" | "info" =>
    v >= 0.05 ? "success" : v >= 0 ? "info" : v >= -0.05 ? "warning" : "danger";
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
        <h2 className="v2-section-h" style={{ margin: 0 }}>
          Same-store sales growth
        </h2>
        <InfoButton title="SSSG" label="About same-store sales growth">
          <p>
            <strong>SSSG (comp sales)</strong> is the most-watched chain metric in
            restaurants. Compares the trailing window&apos;s revenue to the prior trailing
            window of the same length — so seasonality cancels and you see the underlying
            growth signal.
          </p>
          <p>
            Decomposed into four moves so the operator sees <em>what drove the change</em>:
          </p>
          <ul>
            <li><strong>Revenue growth</strong> — the headline.</li>
            <li><strong>Order growth</strong> — volume-led growth.</li>
            <li><strong>Ticket growth</strong> — price / mix-led growth.</li>
            <li><strong>Customer growth</strong> — acquisition-led growth.</li>
          </ul>
          <p>
            Revenue up + orders flat + ticket up = you raised prices and customers
            absorbed it. Revenue up + ticket flat + orders up = volume genuinely
            grew. Revenue up + customers flat + ticket up = same people spending more
            (loyalty / attach lifting). Different stories, different next moves.
          </p>
        </InfoButton>
        <span className="v2-muted text-xs">
          Last {sssg.windowDays}d vs prior {sssg.windowDays}d
        </span>
        <SourceTag kind="actuals" hint="From real orders." />
      </div>
      <section className="v2-kpi-grid">
        <KpiCard
          label="Revenue growth"
          value={sssg.revenueGrowthPct * 100}
          format={(n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`}
          display={fmtPct(sssg.revenueGrowthPct)}
          icon={TrendingUp}
          tone={toneFor(sssg.revenueGrowthPct)}
          hint={`${Math.round(sssg.currentRevenueGrosze / 100).toLocaleString("pl-PL")} zł vs ${Math.round(sssg.priorRevenueGrosze / 100).toLocaleString("pl-PL")} zł`}
        />
        <KpiCard
          label="Order growth"
          value={sssg.orderGrowthPct * 100}
          format={(n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`}
          display={fmtPct(sssg.orderGrowthPct)}
          icon={Gauge}
          tone={toneFor(sssg.orderGrowthPct)}
          hint={`${sssg.currentOrders} vs ${sssg.priorOrders}`}
        />
        <KpiCard
          label="Ticket growth"
          value={sssg.ticketGrowthPct * 100}
          format={(n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`}
          display={fmtPct(sssg.ticketGrowthPct)}
          icon={HandCoins}
          tone={toneFor(sssg.ticketGrowthPct)}
          hint="Avg ticket move"
        />
        <KpiCard
          label="Customer growth"
          value={sssg.customerGrowthPct * 100}
          format={(n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`}
          display={fmtPct(sssg.customerGrowthPct)}
          icon={Sparkles}
          tone={toneFor(sssg.customerGrowthPct)}
          hint={`${sssg.currentCustomers} vs ${sssg.priorCustomers} distinct`}
        />
      </section>
    </>
  );
}

/** Cohort retention panel: surfaces the customer-economics layer the
 *  institutional review flagged as the single most important gap. LTV /
 *  CAC / payback computed from real orders + the operator's marketing
 *  fixed cost; no LTV-of-fame-projection nonsense, just the math IC asks
 *  for in the first 15 minutes of any restaurant deck. */
function CohortPanel({
  cohorts,
  marketingMonthlyGrosze,
}: {
  cohorts: SimulationCohortSnapshot;
  marketingMonthlyGrosze: number;
}) {
  // CAC = marketing fixed cost / new customers per month. When marketing
  // is zero or acquisition velocity is zero the metric is meaningless.
  const cacGrosze =
    marketingMonthlyGrosze > 0 && cohorts.newCustomersPerMonth > 0
      ? marketingMonthlyGrosze / cohorts.newCustomersPerMonth
      : 0;
  // Monthly GP contribution per customer = avg GP / observed months.
  const monthsObserved = cohorts.windowDays / 30.4375;
  const monthlyGpPerCustomer =
    monthsObserved > 0 ? cohorts.avgGpPerCustomerGrosze / monthsObserved : 0;
  const ltvCacRatio =
    cacGrosze > 0 ? cohorts.avgGpPerCustomerGrosze / cacGrosze : 0;
  const paybackMonths =
    cacGrosze > 0 && monthlyGpPerCustomer > 0 ? cacGrosze / monthlyGpPerCustomer : null;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
        <h2 className="v2-section-h" style={{ margin: 0 }}>Customer economics</h2>
        <InfoButton title="Customer economics" label="About LTV / CAC">
          <p>
            The customer-level questions IC reads in the first 15 minutes of any
            restaurant deck. Computed from real orders grouped by phone (the loyalty
            engine captures phone at checkout).
          </p>
          <ul>
            <li><strong>Repeat rate</strong> — % of customers with ≥ 2 orders in the window. Healthy: 30%+. Below 15%, your funnel is a one-night stand.</li>
            <li><strong>Orders / customer</strong> — mean lifetime orders observed in the window.</li>
            <li><strong>GP / customer</strong> — gross profit per customer, item-level (modifiers included).</li>
            <li><strong>CAC (implied)</strong> = marketing fixed cost ÷ new customers / month. Real institutional CAC; uses the operator&apos;s marketing budget as the numerator.</li>
            <li><strong>LTV / CAC</strong> — institutional gate is ≥ 3×. Below 1.5× you&apos;re losing money on every new customer at the current marketing spend.</li>
            <li><strong>Customer payback</strong> — months for cumulative GP per customer to cover CAC. ≤ 6 mo = strong, ≤ 12 mo = acceptable.</li>
            <li><strong>New vs returning revenue mix</strong> — % from net-new customers vs prior-window customers. Returning &gt; new = sustainable repeat business. New &gt; returning = leaky bucket.</li>
          </ul>
        </InfoButton>
        <SourceTag kind="actuals" hint={`Last ${cohorts.windowDays} days, grouped by phone`} />
      </div>
      <section className="v2-kpi-grid">
        <KpiCard
          label="Repeat rate"
          value={cohorts.repeatRatePct * 100}
          format={(n) => `${n.toFixed(1)}%`}
          icon={Sparkles}
          tone={
            cohorts.repeatRatePct >= 0.30
              ? "success"
              : cohorts.repeatRatePct >= 0.15
                ? "info"
                : "warning"
          }
          hint={`${cohorts.repeatCustomers} / ${cohorts.totalCustomers} customers ordered ≥2×`}
        />
        <KpiCard
          label="Orders / customer"
          value={cohorts.avgOrdersPerCustomer}
          format={(n) => n.toFixed(2)}
          icon={HandCoins}
          tone="info"
          hint="Mean over the window"
        />
        <KpiCard
          label="GP / customer"
          value={cohorts.avgGpPerCustomerGrosze / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Wallet}
          tone={cohorts.avgGpPerCustomerGrosze > 5000 ? "success" : "info"}
          hint={`Avg revenue ${Math.round(cohorts.avgRevenuePerCustomerGrosze / 100).toLocaleString("pl-PL")} zł`}
        />
        <KpiCard
          label="CAC (implied)"
          value={cacGrosze / 100}
          display={
            cacGrosze === 0
              ? "—"
              : `${Math.round(cacGrosze / 100).toLocaleString("pl-PL")} zł`
          }
          icon={Banknote}
          tone={cacGrosze === 0 ? "neutral" : "warning"}
          hint={`Marketing ${Math.round(marketingMonthlyGrosze / 100).toLocaleString("pl-PL")} zł/mo ÷ ${cohorts.newCustomersPerMonth.toFixed(0)} new/mo`}
        />
        <KpiCard
          label="LTV / CAC"
          value={ltvCacRatio}
          display={ltvCacRatio === 0 ? "—" : `${ltvCacRatio.toFixed(1)}×`}
          icon={TrendingUp}
          tone={
            ltvCacRatio === 0
              ? "neutral"
              : ltvCacRatio >= 3
                ? "success"
                : ltvCacRatio >= 1.5
                  ? "warning"
                  : "danger"
          }
          hint="Institutional gate: ≥3×"
        />
        <KpiCard
          label="Customer payback"
          value={paybackMonths ?? 0}
          display={
            paybackMonths === null
              ? "—"
              : paybackMonths > 24
                ? `${paybackMonths.toFixed(0)} mo`
                : `${paybackMonths.toFixed(1)} mo`
          }
          icon={PiggyBank}
          tone={
            paybackMonths === null
              ? "neutral"
              : paybackMonths > 12
                ? "danger"
                : paybackMonths > 6
                  ? "warning"
                  : "success"
          }
          hint="CAC ÷ monthly GP per customer"
        />
        {(cohorts.newCustomerRevenueGrosze + cohorts.returningCustomerRevenueGrosze) > 0 && (
          <>
            <KpiCard
              label="New customer revenue"
              value={
                ((cohorts.newCustomerRevenueGrosze) /
                  Math.max(1, cohorts.newCustomerRevenueGrosze + cohorts.returningCustomerRevenueGrosze)) *
                100
              }
              format={(n) => `${n.toFixed(0)}%`}
              icon={Plus}
              tone="info"
              hint={`${Math.round(cohorts.newCustomerRevenueGrosze / 100).toLocaleString("pl-PL")} zł from net-new customers`}
            />
            <KpiCard
              label="Returning revenue"
              value={
                ((cohorts.returningCustomerRevenueGrosze) /
                  Math.max(1, cohorts.newCustomerRevenueGrosze + cohorts.returningCustomerRevenueGrosze)) *
                100
              }
              format={(n) => `${n.toFixed(0)}%`}
              icon={RefreshCw}
              tone={
                cohorts.returningCustomerRevenueGrosze >
                cohorts.newCustomerRevenueGrosze
                  ? "success"
                  : "warning"
              }
              hint={`${Math.round(cohorts.returningCustomerRevenueGrosze / 100).toLocaleString("pl-PL")} zł from prior-window customers`}
            />
          </>
        )}
      </section>
    </>
  );
}

/** Tornado chart: every key driver flexed ±10% (or ±a sensible pp swing for
 *  percentage drivers), bars sorted by absolute net-profit swing. The most
 *  fragile variable surfaces at the top — the IC-grade "where would I look
 *  first?" answer the institutional review flagged as missing. */
function TornadoPanel({ bars }: { bars: TornadoBar[] }) {
  if (bars.length === 0) return null;
  const maxSwing = Math.max(...bars.map((b) => Math.max(Math.abs(b.downGrosze), Math.abs(b.upGrosze))));
  if (maxSwing === 0) return null;
  const formatZl = (g: number) => {
    const zl = g / 100;
    const sign = zl >= 0 ? "+" : "−";
    return `${sign}${Math.abs(Math.round(zl)).toLocaleString("pl-PL")} zł`;
  };
  return (
    <Card>
      <CardHeader
        title="Sensitivity tornado"
        description="Net-profit swing when each variable is flexed independently around the current scenario. The most fragile inputs are at the top — that's where to apply attention first."
        actions={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <InfoButton title="Sensitivity tornado" label="About the tornado chart">
              <p>
                One-at-a-time sensitivity: each key driver is flexed independently
                around the current scenario, net profit recomputed, the deltas plotted as
                horizontal bars. Bars are sorted by absolute swing — the variable at the
                top is the most fragile input.
              </p>
              <p>
                Flex ranges are calibrated per variable type:
              </p>
              <ul>
                <li>Volume / labor cost / fixed cost: ±10%</li>
                <li>Food cost %: ±5 pp</li>
                <li>Payment fee %: ±0.5 pp</li>
                <li>Waste / refund %: ±1 pp</li>
                <li>CIT rate: 9% ↔ 19% (Polish small-CIT vs full)</li>
                <li>Glovo commission: ±3 pp</li>
              </ul>
              <p>
                Red bar to the left = downside loss (when the variable moves against you).
                Green bar to the right = upside gain. The central axis is the current
                scenario&apos;s net profit. Where the bars are widest, that&apos;s where
                small input changes move the bottom line most — that&apos;s where the
                operator&apos;s attention belongs.
              </p>
            </InfoButton>
            <FlaskConical className="h-4 w-4 v2-muted" />
          </span>
        }
      />
      <CardBody>
        <div className="v2-stack-12">
          {bars.map((b) => {
            const downWidth = Math.abs(b.downGrosze) / maxSwing * 50;
            const upWidth = Math.abs(b.upGrosze) / maxSwing * 50;
            return (
              <div key={b.key} className="flex items-center gap-3">
                <div style={{ width: 160, fontSize: 13 }}>
                  <div style={{ fontWeight: 500 }}>{b.label}</div>
                  <div className="v2-muted text-xs">{b.unit}</div>
                </div>
                <div className="tabular text-xs v2-muted" style={{ width: 80, textAlign: "right" }}>
                  {formatZl(b.downGrosze)}
                </div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", position: "relative", height: 18 }}>
                  <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: "rgba(0,0,0,0.1)" }} />
                  <div
                    style={{
                      position: "absolute",
                      right: "50%",
                      height: 14,
                      width: `${downWidth}%`,
                      background: b.downGrosze < 0 ? "rgba(239,68,68,0.8)" : "rgba(34,197,94,0.8)",
                      borderRadius: "3px 0 0 3px",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      height: 14,
                      width: `${upWidth}%`,
                      background: b.upGrosze >= 0 ? "rgba(34,197,94,0.8)" : "rgba(239,68,68,0.8)",
                      borderRadius: "0 3px 3px 0",
                    }}
                  />
                  <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, background: "rgba(0,0,0,0.25)" }} />
                </div>
                <div className="tabular text-xs v2-muted" style={{ width: 80 }}>
                  {formatZl(b.upGrosze)}
                </div>
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}

/** Margin traps callout — items the menu-engineering matrix would put in
 *  good quadrants on GP alone but where TrueCM1 (after channel fees,
 *  waste, refund, loyalty) tells a different story. Surfaces the audit's
 *  exact warning list: delivery-only marketplace casualties, spoilage-
 *  risk items, prep-heavy false-high-revenue items. */
function MarginTrapsCallout({ rows }: { rows: SimulationMenuEngineeringLine[] }) {
  const traps = rows.filter((r) => r.marginTrap || r.spoilageRisk || (r.deliveryOnly && r.trueCm1PerUnit < 500));
  const prepHeavy = rows.filter((r) => r.prepHeavy);
  if (traps.length === 0 && prepHeavy.length === 0) return null;
  return (
    <Card>
      <CardHeader
        title="Margin traps & false high-revenue items"
        description="Items where the gross-margin look-through breaks down. Delivery-only items lose 22-30% to marketplace commission. Spoilage-risk items can swing into loss on a single discarded portion. Prep-heavy items eat throughput the labor model doesn't price."
        actions={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <InfoButton title="Margin traps" label="About margin traps">
              <p>
                Gross margin is a deceiver. A 70% GM item that&apos;s only sold via Glovo
                lands near-zero CM once the 27% marketplace fee is netted. The menu-
                engineering matrix wouldn&apos;t flag it because its GP per unit looks
                fine — this panel does.
              </p>
              <p>Three trap heuristics:</p>
              <ul>
                <li><strong>Margin trap</strong> — GM ≥ 50% but TrueCM1 (after channel fees + waste + refund + loyalty, with delivery-only items at a 27% commission proxy) falls below half the per-item GP. Classic look-good-die-quiet items.</li>
                <li><strong>Spoilage risk</strong> — name match on known short-shelf-life ingredients (burrata, truffle, tartufata, frozen tiramisù). A single discarded portion can swing the per-day P&amp;L on these.</li>
                <li><strong>Prep-heavy</strong> — prep time ≥ 1.5× median. Kitchen throughput cost is real but unpriced — pasta + tagliatelle need a separate station the labor model doesn&apos;t budget.</li>
              </ul>
              <p>
                Recommended action: reprice up, swap to a faster recipe, lock to dine-in
                only (skips the marketplace fee), or delete from the menu.
              </p>
            </InfoButton>
            <AlertTriangle className="h-4 w-4 v2-muted" />
          </span>
        }
      />
      <CardBody>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {traps.length > 0 && (
            <div style={{ background: "rgba(239,68,68,0.06)", borderRadius: 10, padding: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Margin traps</div>
              <div className="v2-muted text-xs mb-2" style={{ fontStyle: "italic" }}>
                High GM, low TrueCM1 after fees / spoilage / marketplace commission.
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {traps.slice(0, 10).map((r) => {
                  const reasons: string[] = [];
                  if (r.deliveryOnly) reasons.push("delivery-only");
                  if (r.spoilageRisk) reasons.push("spoilage risk");
                  if (r.marginTrap) reasons.push("fees eat margin");
                  const gmPct = r.unitsSold > 0 ? ((r.revenue - r.cost) / r.revenue) * 100 : 0;
                  return (
                    <li
                      key={r.menuItemId}
                      style={{
                        padding: "6px 0",
                        borderTop: "1px solid rgba(0,0,0,0.06)",
                      }}
                    >
                      <div className="flex justify-between items-baseline">
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</span>
                        <span className="v2-muted text-xs tabular">
                          GM {gmPct.toFixed(0)}% · CM1 {(r.trueCm1PerUnit / 100).toFixed(2)} zł
                        </span>
                      </div>
                      <div className="v2-muted text-xs" style={{ fontStyle: "italic" }}>
                        {reasons.join(" · ")}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {prepHeavy.length > 0 && (
            <div style={{ background: "rgba(245,158,11,0.06)", borderRadius: 10, padding: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Prep-heavy items</div>
              <div className="v2-muted text-xs mb-2" style={{ fontStyle: "italic" }}>
                {`Prep time ≥ 1.5× median. Kitchen throughput cost is real but unpriced — pasta + tagliatelle need a separate station that the labor model doesn't budget.`}
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {prepHeavy.slice(0, 10).map((r) => (
                  <li
                    key={r.menuItemId}
                    className="flex justify-between items-baseline"
                    style={{
                      padding: "6px 0",
                      borderTop: "1px solid rgba(0,0,0,0.06)",
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</span>
                    <span className="v2-muted text-xs tabular">
                      {r.prepTimeMinutes} min · {r.unitsSold}× sold
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

/** Kasavana-Smith menu engineering matrix (stars / plowhorses / puzzles /
 *  dogs) rendered as a 2×2 grid. Quadrants split at the median velocity
 *  and median per-unit GP across the menu — the standard QSR cut. */
function MenuEngineeringPanel({
  rows,
}: {
  rows: SimulationMenuEngineeringLine[];
}) {
  const byQuadrant: Record<SimulationMenuEngineeringLine["quadrant"], SimulationMenuEngineeringLine[]> = {
    star: [],
    plowhorse: [],
    puzzle: [],
    dog: [],
  };
  for (const r of rows) byQuadrant[r.quadrant].push(r);
  for (const k of Object.keys(byQuadrant) as Array<keyof typeof byQuadrant>) {
    byQuadrant[k].sort((a, b) => b.revenue - a.revenue);
  }
  const quadConfig: Record<
    SimulationMenuEngineeringLine["quadrant"],
    { label: string; sub: string; tone: string; verdict: string }
  > = {
    star: {
      label: "Stars",
      sub: "High volume · high margin",
      tone: "rgba(34,197,94,0.10)",
      verdict: "Protect. Promote. Anchor the menu.",
    },
    puzzle: {
      label: "Puzzles",
      sub: "Low volume · high margin",
      tone: "rgba(59,130,246,0.10)",
      verdict: "Push attach / upsell — these need marketing.",
    },
    plowhorse: {
      label: "Plowhorses",
      sub: "High volume · low margin",
      tone: "rgba(245,158,11,0.10)",
      verdict: "Reprice up or re-engineer the recipe.",
    },
    dog: {
      label: "Dogs",
      sub: "Low volume · low margin",
      tone: "rgba(239,68,68,0.10)",
      verdict: "Delete unless strategic — they cost menu real-estate.",
    },
  };
  return (
    <Card>
      <CardHeader
        title="Menu engineering"
        description="Per-item gross profit × velocity over the last 90 days, grouped by the Kasavana-Smith quadrants. Quadrant cuts: median GP/unit and median units sold."
        actions={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <InfoButton title="Menu engineering" label="About the Kasavana-Smith matrix">
              <p>
                The standard QSR menu-engineering tool. Every item that sold ≥ 1 unit in
                the window is plotted on two axes: velocity (units sold) and per-unit
                gross profit. Splits at the median of each:
              </p>
              <ul>
                <li><strong>Stars</strong> — high volume × high margin. Protect them. Promote them. Anchor the menu.</li>
                <li><strong>Puzzles</strong> — low volume × high margin. Push attach / upsell — they need marketing more than re-engineering.</li>
                <li><strong>Plowhorses</strong> — high volume × low margin. Reprice up or re-engineer the recipe; you&apos;re selling lots of low-CM units.</li>
                <li><strong>Dogs</strong> — low volume × low margin. Delete unless strategic; they cost menu real-estate.</li>
              </ul>
              <p>
                Per-item operator tags from the menu definition show as coloured badges:
                <span style={{ background: "rgba(245,158,11,0.15)", color: "rgb(217,119,6)", padding: "0 4px", borderRadius: 4, fontSize: 10, fontWeight: 700, marginLeft: 4 }}>HERO</span>
                {" "}lead SKU,
                <span style={{ background: "rgba(34,197,94,0.15)", color: "rgb(22,163,74)", padding: "0 4px", borderRadius: 4, fontSize: 10, fontWeight: 700, marginLeft: 4 }}>DRIVER</span>
                {" "}high-margin lever,
                <span style={{ background: "rgba(168,85,247,0.15)", color: "rgb(126,34,206)", padding: "0 4px", borderRadius: 4, fontSize: 10, fontWeight: 700, marginLeft: 4 }}>ANCHOR</span>
                {" "}premium decoy. An anchor sitting in the puzzle quadrant is there <em>by design</em> — don&apos;t reflexively delete.
              </p>
            </InfoButton>
            <SourceTag kind="actuals" hint="Computed from real order line items." />
          </span>
        }
      />
      <CardBody>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(["star", "puzzle", "plowhorse", "dog"] as const).map((q) => {
            const cfg = quadConfig[q];
            const items = byQuadrant[q];
            return (
              <div
                key={q}
                style={{
                  background: cfg.tone,
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <div className="flex items-baseline justify-between mb-1">
                  <div>
                    <div style={{ fontWeight: 600 }}>{cfg.label}</div>
                    <div className="v2-muted text-xs">{cfg.sub}</div>
                  </div>
                  <div className="v2-muted text-xs">{items.length} items</div>
                </div>
                <div className="v2-muted text-xs mb-2" style={{ fontStyle: "italic" }}>
                  {cfg.verdict}
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {items.slice(0, 6).map((r) => (
                    <li
                      key={r.menuItemId}
                      className="flex items-baseline justify-between"
                      style={{ padding: "4px 0", borderTop: "1px solid rgba(0,0,0,0.06)" }}
                    >
                      <span style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {r.name}
                        {r.menuRole && <MenuRoleBadge role={r.menuRole} />}
                      </span>
                      <span className="v2-muted text-xs tabular">
                        {r.unitsSold}× · {(r.gpPerUnit / 100).toFixed(2)} zł GP
                      </span>
                    </li>
                  ))}
                  {items.length > 6 && (
                    <li className="v2-muted text-xs mt-1">
                      + {items.length - 6} more
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}

/** Helper: pick the right SourceTag for a numeric input by comparing the
 *  operator value to the matching actual. Within 5% ⇒ actuals; otherwise
 *  assumption. When no actuals are available the input is always assumption. */
function sourceTagFor(
  actualValue: number | undefined,
  operatorValue: number,
  actuals: SimulationActualsSnapshot | null | undefined,
) {
  if (!actuals || actualValue === undefined || actualValue === 0) {
    return <SourceTag kind="assumption" hint="Operator-typed — no real-data backing." />;
  }
  const variance = Math.abs((operatorValue - actualValue) / actualValue);
  if (variance <= 0.05) {
    return (
      <SourceTag
        kind="actuals"
        hint={`Within 5% of last-${actuals.windowDays}d actuals.`}
      />
    );
  }
  return (
    <SourceTag
      kind="assumption"
      hint={`Drifted ${(variance * 100).toFixed(0)}% from last-${actuals.windowDays}d actuals.`}
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="v2-muted text-xs">{label}</div>
      <div className="tabular">{value}</div>
    </div>
  );
}

function monthlyRevenuePctOrDash(num: number, revenue: number): string {
  if (revenue <= 0) return "—";
  return `${((num / revenue) * 100).toFixed(1)}%`;
}

/** Compact strip showing what real orders actually look like over the last 90
 *  days vs what the operator has typed into the scenario. Without this, the
 *  whole simulator is fiction — see institutional-review §R1. */
function ActualsStrip({
  actuals,
  scenario,
  onApply,
  onRefresh,
}: {
  actuals: SimulationActualsSnapshot;
  scenario: SimulationScenario;
  onApply: () => void;
  onRefresh: () => void;
}) {
  const variance = (actual: number, planned: number) =>
    planned > 0 ? (actual - planned) / planned : 0;
  const ordersVar = variance(actuals.ordersPerDay, scenario.ordersPerDay);
  const ticketVar = variance(actuals.avgTicketGrosze, scenario.avgTicketGrosze);
  const cogsVar =
    actuals.weightedCogsPct > 0
      ? variance(actuals.weightedCogsPct, scenario.cogsPct)
      : 0;
  const stale =
    Math.abs(ordersVar) > 0.15 ||
    Math.abs(ticketVar) > 0.15 ||
    Math.abs(cogsVar) > 0.15;
  const tone = stale ? "warning" : "info";
  const variancePct = (v: number) =>
    `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;
  const generatedAt = new Date(actuals.generatedAt);
  return (
    <Card>
      <CardBody>
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={tone}>
              <Database className="h-3 w-3" />{" "}
              <span>Real actuals · last {actuals.windowDays}d</span>
            </Badge>
            <InfoButton title="Real actuals" label="About the real-actuals strip" size="sm">
              <p>
                Pulls the operator&apos;s real order history from
                <code> /api/admin/orders</code> over a 90-day rolling window and computes:
                orders/day, avg ticket, menu-mix-weighted COGS, delivery share, refund
                (cancellation) rate, median ticket time.
              </p>
              <p>
                Variance vs the operator&apos;s typed scenario inputs is shown next to
                each metric. If any variance crosses 15%, the strip flips from info-blue
                to amber-warning and the &quot;Apply actuals&quot; button is the one-click
                way to align the scenario to reality.
              </p>
              <p>
                Source-of-truth note: this is the only strip on the page whose numbers come
                100% from the production database — every other panel reads operator-typed
                scenario inputs (with the &quot;actuals&quot; badges marking inputs that
                match real-order observations within 5%).
              </p>
            </InfoButton>
            <Stat
              label="Orders / day"
              value={`${actuals.ordersPerDay.toFixed(1)} (${variancePct(ordersVar)})`}
            />
            <Stat
              label="Avg ticket"
              value={`${(actuals.avgTicketGrosze / 100).toFixed(2)} zł (${variancePct(ticketVar)})`}
            />
            {actuals.weightedCogsPct > 0 && (
              <Stat
                label="Weighted COGS"
                value={`${(actuals.weightedCogsPct * 100).toFixed(1)}% (${variancePct(cogsVar)})`}
              />
            )}
            <Stat label="Delivery %" value={`${(actuals.deliverySharePct * 100).toFixed(0)}%`} />
            <Stat label="Cancel %" value={`${(actuals.refundPct * 100).toFixed(1)}%`} />
            <Stat
              label="Sample"
              value={`${actuals.ordersCount} orders / ${actuals.daysWithOrders} days`}
            />
          </div>
          <div className="flex items-center gap-2">
            {stale && (
              <span className="v2-muted text-xs">
                Scenario drifted &gt; 15% from reality
              </span>
            )}
            <button
              type="button"
              className="v2-btn v2-btn-secondary"
              onClick={onRefresh}
              title={`Generated ${generatedAt.toLocaleString("pl-PL")}`}
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
            <button type="button" className="v2-btn v2-btn-primary" onClick={onApply}>
              Apply actuals
            </button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function PnlRow({
  label,
  amount,
  tone,
  bold,
  small,
  indent,
  indent2,
  hint,
}: {
  label: string;
  amount: number;
  tone: "brand" | "info" | "warning" | "success" | "danger" | "neutral";
  bold?: boolean;
  small?: boolean;
  indent?: boolean;
  indent2?: boolean;
  hint?: string;
}) {
  const pad = indent2 ? "pl-8" : indent ? "pl-4" : "";
  const weight = bold ? "font-semibold" : "";
  const size = small ? "text-xs" : "";
  return (
    <li className={`v2-mov-row ${pad}`}>
      <span className={`v2-mov-icon v2-mov-tone-${tone}`}>
        <Wallet className="h-3 w-3" />
      </span>
      <div className="v2-mov-text">
        <div className={`v2-mov-title ${weight} ${size}`}>
          <span>{label}</span>
          {hint && <span className="v2-muted">{hint}</span>}
        </div>
      </div>
      <span className={`v2-mov-time tabular ${weight} ${size}`}>
        {amount < 0 ? `−${formatPrice(-amount)}` : formatPrice(amount)}
      </span>
    </li>
  );
}

// --- Behavior assumption levers card -------------------------------------

interface AttachRowProps {
  label: string;
  hint: string;
  lever: SimulationAttachLever;
  baseTicketGrosze: number;
  onChange: (next: SimulationAttachLever) => void;
  help?: { title: string; body: ReactNode };
}

function AttachLeverRow({ label, hint, lever, baseTicketGrosze, onChange, help }: AttachRowProps) {
  const enabled = lever.enabled !== false;
  // Per-order projected ticket lift = attachPct × price; margin = (1 − cogsPct) × ticket lift.
  const ticketLift = lever.attachPct * lever.avgPriceGrosze;
  const cogsLift = ticketLift * lever.cogsPct;
  const marginLift = ticketLift - cogsLift;
  const pctOfBase = baseTicketGrosze > 0 ? (ticketLift / baseTicketGrosze) * 100 : 0;
  return (
    <div className="grid grid-cols-12 gap-2 items-end" style={{ opacity: enabled ? 1 : 0.55 }}>
      <div className="col-span-12 md:col-span-4">
        <div className="text-sm font-medium" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <LeverSwitch
            enabled={enabled}
            onChange={(next) => onChange({ ...lever, enabled: next })}
            ariaLabel={`Toggle ${label}`}
          />
          <span>{label}</span>
          {help && (
            <InfoButton title={help.title} label={`About ${help.title.toLowerCase()}`} size="sm">
              {help.body}
            </InfoButton>
          )}
        </div>
        <div className="v2-muted text-xs">{hint}</div>
      </div>
      <div className="col-span-4 md:col-span-2">
        <Input
          label="Attach %"
          type="number"
          step="1"
          min="0"
          max="100"
          value={String(Math.round(lever.attachPct * 100))}
          onChange={(e) =>
            onChange({
              ...lever,
              attachPct: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)),
            })
          }
          trailingAdornment={<span className="v2-muted">%</span>}
        />
      </div>
      <div className="col-span-4 md:col-span-2">
        <Input
          label="Avg price"
          type="number"
          step="0.5"
          min="0"
          value={(lever.avgPriceGrosze / 100).toFixed(2)}
          onChange={(e) =>
            onChange({
              ...lever,
              avgPriceGrosze: Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100)),
            })
          }
          trailingAdornment={<span className="v2-muted">zł</span>}
        />
      </div>
      <div className="col-span-4 md:col-span-2">
        <Input
          label="COGS %"
          type="number"
          step="1"
          min="0"
          max="100"
          value={String(Math.round(lever.cogsPct * 100))}
          onChange={(e) =>
            onChange({
              ...lever,
              cogsPct: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)),
            })
          }
          trailingAdornment={<span className="v2-muted">%</span>}
        />
      </div>
      <div className="col-span-12 md:col-span-2 text-xs v2-muted text-right">
        {enabled ? (
          <>
            +{formatPrice(Math.round(ticketLift))} AOV
            <br />
            +{formatPrice(Math.round(marginLift))} margin
            <br />
            <span className="opacity-70">{pctOfBase.toFixed(1)}% of ticket</span>
          </>
        ) : (
          <span className="opacity-70">Excluded from math</span>
        )}
      </div>
    </div>
  );
}

interface IngredientRowProps {
  label: string;
  hint: string;
  lever: SimulationIngredientLever;
  baseCogsValueGrosze: number;
  onChange: (next: SimulationIngredientLever) => void;
}

function IngredientLeverRow({ label, hint, lever, baseCogsValueGrosze, onChange }: IngredientRowProps) {
  const enabled = lever.enabled !== false;
  const cogsImpactPp = lever.cogsShare * lever.costDeltaPct * 100;
  const cogsImpactGrosze = Math.round(baseCogsValueGrosze * lever.cogsShare * lever.costDeltaPct);
  const sign = cogsImpactPp > 0 ? "+" : cogsImpactPp < 0 ? "−" : "±";
  return (
    <div className="grid grid-cols-12 gap-2 items-end" style={{ opacity: enabled ? 1 : 0.55 }}>
      <div className="col-span-12 md:col-span-4">
        <div className="text-sm font-medium" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <LeverSwitch
            enabled={enabled}
            onChange={(next) => onChange({ ...lever, enabled: next })}
            ariaLabel={`Toggle ${label}`}
          />
          <span>{label}</span>
        </div>
        <div className="v2-muted text-xs">{hint}</div>
      </div>
      <div className="col-span-6 md:col-span-3">
        <Input
          label="Share of COGS"
          type="number"
          step="0.5"
          min="0"
          max="100"
          value={(lever.cogsShare * 100).toFixed(1)}
          onChange={(e) =>
            onChange({
              ...lever,
              cogsShare: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)),
            })
          }
          trailingAdornment={<span className="v2-muted">%</span>}
        />
      </div>
      <div className="col-span-6 md:col-span-3">
        <Input
          label="Cost change"
          type="number"
          step="1"
          min="-100"
          max="500"
          value={(lever.costDeltaPct * 100).toFixed(0)}
          onChange={(e) =>
            onChange({
              ...lever,
              costDeltaPct: Math.max(-1, Math.min(5, (parseFloat(e.target.value) || 0) / 100)),
            })
          }
          trailingAdornment={<span className="v2-muted">%</span>}
        />
      </div>
      <div className="col-span-12 md:col-span-2 text-xs v2-muted text-right">
        {enabled ? (
          <>
            <span style={{ color: cogsImpactPp > 0 ? "var(--danger)" : cogsImpactPp < 0 ? "var(--success)" : undefined }}>
              {sign}{Math.abs(cogsImpactPp).toFixed(2)}% COGS
            </span>
            <br />
            <span className="opacity-70">
              {sign}{formatPrice(Math.abs(cogsImpactGrosze))} / order
            </span>
          </>
        ) : (
          <span className="opacity-70">Excluded from math</span>
        )}
      </div>
    </div>
  );
}

interface BehaviorCardProps {
  assumptions: SimulationAssumptions;
  baseTicketGrosze: number;
  baseCogsPct: number;
  onChange: (next: SimulationAssumptions) => void;
}

function BehaviorAssumptionsCard({ assumptions, baseTicketGrosze, baseCogsPct, onChange }: BehaviorCardProps) {
  const a = assumptions;
  const baseCogsValueGrosze = baseTicketGrosze * baseCogsPct;
  const set = <K extends keyof SimulationAssumptions>(key: K, value: SimulationAssumptions[K]) =>
    onChange({ ...a, [key]: value });

  const setIngredient = (key: IngredientKey, value: SimulationIngredientLever) => {
    onChange({ ...a, ingredients: { ...(a.ingredients ?? {}), [key]: value } });
  };

  const setAllEnabled = (enabled: boolean) => {
    const flippedIngredients: NonNullable<SimulationAssumptions["ingredients"]> = {};
    if (a.ingredients) {
      for (const [k, v] of Object.entries(a.ingredients)) {
        if (v) flippedIngredients[k as IngredientKey] = { ...v, enabled };
      }
    }
    onChange({
      ...a,
      coffeeAttach: a.coffeeAttach ? { ...a.coffeeAttach, enabled } : a.coffeeAttach,
      dessertAttach: a.dessertAttach ? { ...a.dessertAttach, enabled } : a.dessertAttach,
      antipastiAttach: a.antipastiAttach ? { ...a.antipastiAttach, enabled } : a.antipastiAttach,
      aperitivoAttach: a.aperitivoAttach ? { ...a.aperitivoAttach, enabled } : a.aperitivoAttach,
      premiumToppingsAttach: a.premiumToppingsAttach ? { ...a.premiumToppingsAttach, enabled } : a.premiumToppingsAttach,
      pastaPrimoAttach: a.pastaPrimoAttach ? { ...a.pastaPrimoAttach, enabled } : a.pastaPrimoAttach,
      comboConversion: a.comboConversion ? { ...a.comboConversion, enabled } : a.comboConversion,
      cheapestPizzaShift: a.cheapestPizzaShift ? { ...a.cheapestPizzaShift, enabled } : a.cheapestPizzaShift,
      deliveryShare: a.deliveryShare ? { ...a.deliveryShare, enabled } : a.deliveryShare,
      ingredients: a.ingredients ? flippedIngredients : a.ingredients,
    });
  };

  return (
    <Card>
      <CardHeader
        title="Behavior assumptions"
        description="Tune attach rates, combos and channel mix — every lever folds into effective ticket + COGS, then flows into every KPI, heatmap and projection below. Toggle a lever off to see the P&L without it."
        actions={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <Button size="sm" variant="ghost" onClick={() => setAllEnabled(true)}>
              All on
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAllEnabled(false)}>
              All off
            </Button>
            <InfoButton title={HELP.assumptionsOverview.title} label="About behavior assumptions">{HELP.assumptionsOverview.body}</InfoButton>
            <Sparkles className="h-4 w-4 v2-muted" />
          </span>
        }
      />
      <CardBody>
        <div className="v2-stack-12">
          {a.coffeeAttach && (
            <AttachLeverRow
              label="Coffee attach"
              hint="Espresso / cappuccino on the side."
              lever={a.coffeeAttach}
              baseTicketGrosze={baseTicketGrosze}
              onChange={(v) => set("coffeeAttach", v)}
              help={HELP.coffeeAttach}
            />
          )}
          {a.dessertAttach && (
            <AttachLeverRow
              label="Dessert attach"
              hint="Tiramisu / cannoli / panna cotta."
              lever={a.dessertAttach}
              baseTicketGrosze={baseTicketGrosze}
              onChange={(v) => set("dessertAttach", v)}
              help={HELP.dessertAttach}
            />
          )}
          {a.antipastiAttach && (
            <AttachLeverRow
              label="Antipasti / starter attach"
              hint="Bruschetta, burrata, olives."
              lever={a.antipastiAttach}
              baseTicketGrosze={baseTicketGrosze}
              onChange={(v) => set("antipastiAttach", v)}
              help={HELP.antipastiAttach}
            />
          )}
          {a.aperitivoAttach && (
            <AttachLeverRow
              label="Aperitivo / wine attach"
              hint="Aperol, wine glass — needs alcohol licence."
              lever={a.aperitivoAttach}
              baseTicketGrosze={baseTicketGrosze}
              onChange={(v) => set("aperitivoAttach", v)}
              help={HELP.aperitivoAttach}
            />
          )}
          {a.premiumToppingsAttach && (
            <AttachLeverRow
              label="Premium toppings attach"
              hint="Buffalo mozzarella, 'nduja, truffle oil."
              lever={a.premiumToppingsAttach}
              baseTicketGrosze={baseTicketGrosze}
              onChange={(v) => set("premiumToppingsAttach", v)}
              help={HELP.premiumToppingsAttach}
            />
          )}
          {a.pastaPrimoAttach && (
            <AttachLeverRow
              label="Pasta primo attach"
              hint="Pasta course alongside the pizza."
              lever={a.pastaPrimoAttach}
              baseTicketGrosze={baseTicketGrosze}
              onChange={(v) => set("pastaPrimoAttach", v)}
              help={HELP.pastaPrimoAttach}
            />
          )}

          <div className="border-t border-[var(--border)] pt-3" />

          {a.comboConversion && (
            <div className="grid grid-cols-12 gap-2 items-end" style={{ opacity: a.comboConversion.enabled === false ? 0.55 : 1 }}>
              <div className="col-span-12 md:col-span-4">
                <div className="text-sm font-medium" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <LeverSwitch
                    enabled={a.comboConversion.enabled !== false}
                    onChange={(next) => set("comboConversion", { ...a.comboConversion!, enabled: next })}
                    ariaLabel="Toggle combo conversion"
                  />
                  <span>Combo conversion</span>
                  <InfoButton title={HELP.comboConversion.title} label="About combo conversion" size="sm">{HELP.comboConversion.body}</InfoButton>
                </div>
                <div className="v2-muted text-xs">
                  X% of mains sell as a Combo (drink + dessert at a bundle discount).
                </div>
              </div>
              <div className="col-span-4 md:col-span-2">
                <Input
                  label="Convert %"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={String(Math.round(a.comboConversion.pct * 100))}
                  onChange={(e) =>
                    set("comboConversion", {
                      ...a.comboConversion!,
                      pct: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)),
                    })
                  }
                  trailingAdornment={<span className="v2-muted">%</span>}
                />
              </div>
              <div className="col-span-4 md:col-span-2">
                <Input
                  label="Addon price"
                  type="number"
                  step="0.5"
                  min="0"
                  value={(a.comboConversion.addonGrosze / 100).toFixed(2)}
                  onChange={(e) =>
                    set("comboConversion", {
                      ...a.comboConversion!,
                      addonGrosze: Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100)),
                    })
                  }
                  trailingAdornment={<span className="v2-muted">zł</span>}
                />
              </div>
              <div className="col-span-4 md:col-span-2">
                <Input
                  label="Discount"
                  type="number"
                  step="0.5"
                  min="0"
                  value={(a.comboConversion.discountGrosze / 100).toFixed(2)}
                  onChange={(e) =>
                    set("comboConversion", {
                      ...a.comboConversion!,
                      discountGrosze: Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100)),
                    })
                  }
                  trailingAdornment={<span className="v2-muted">zł</span>}
                />
              </div>
              <div className="col-span-12 md:col-span-2">
                <Input
                  label="Addon COGS"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={String(Math.round(a.comboConversion.addonCogsPct * 100))}
                  onChange={(e) =>
                    set("comboConversion", {
                      ...a.comboConversion!,
                      addonCogsPct: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)),
                    })
                  }
                  trailingAdornment={<span className="v2-muted">%</span>}
                />
              </div>
            </div>
          )}

          {a.cheapestPizzaShift && (
            <div className="grid grid-cols-12 gap-2 items-end" style={{ opacity: a.cheapestPizzaShift.enabled === false ? 0.55 : 1 }}>
              <div className="col-span-12 md:col-span-4">
                <div className="text-sm font-medium" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <LeverSwitch
                    enabled={a.cheapestPizzaShift.enabled !== false}
                    onChange={(next) => set("cheapestPizzaShift", { ...a.cheapestPizzaShift!, enabled: next })}
                    ariaLabel="Toggle cheapest-pizza shift"
                  />
                  <span>Cheapest-pizza shift (recession stress)</span>
                  <InfoButton title={HELP.cheapestPizzaShift.title} label="About cheapest-pizza shift" size="sm">{HELP.cheapestPizzaShift.body}</InfoButton>
                </div>
                <div className="v2-muted text-xs">
                  More Margherita / Marinara — lower AOV, lower COGS. Push pp up to stress-test.
                </div>
              </div>
              <div className="col-span-4 md:col-span-2">
                <Input
                  label="Shift pp"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={String(Math.round(a.cheapestPizzaShift.pp * 100))}
                  onChange={(e) =>
                    set("cheapestPizzaShift", {
                      ...a.cheapestPizzaShift!,
                      pp: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)),
                    })
                  }
                  trailingAdornment={<span className="v2-muted">pp</span>}
                />
              </div>
              <div className="col-span-4 md:col-span-3">
                <Input
                  label="Δ ticket / pp"
                  type="number"
                  step="0.1"
                  min="0"
                  value={(a.cheapestPizzaShift.ticketDeltaGrosze / 100).toFixed(2)}
                  onChange={(e) =>
                    set("cheapestPizzaShift", {
                      ...a.cheapestPizzaShift!,
                      ticketDeltaGrosze: Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100)),
                    })
                  }
                  trailingAdornment={<span className="v2-muted">zł</span>}
                />
              </div>
              <div className="col-span-4 md:col-span-3">
                <Input
                  label="Δ COGS / pp"
                  type="number"
                  step="0.1"
                  min="0"
                  value={(a.cheapestPizzaShift.cogsDeltaGrosze / 100).toFixed(2)}
                  onChange={(e) =>
                    set("cheapestPizzaShift", {
                      ...a.cheapestPizzaShift!,
                      cogsDeltaGrosze: Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100)),
                    })
                  }
                  trailingAdornment={<span className="v2-muted">zł</span>}
                />
              </div>
            </div>
          )}

          {a.deliveryShare && (
            <div className="grid grid-cols-12 gap-2 items-end" style={{ opacity: a.deliveryShare.enabled === false ? 0.55 : 1 }}>
              <div className="col-span-12 md:col-span-4">
                <div className="text-sm font-medium" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <LeverSwitch
                    enabled={a.deliveryShare.enabled !== false}
                    onChange={(next) => set("deliveryShare", { ...a.deliveryShare!, enabled: next })}
                    ariaLabel="Toggle delivery channel share"
                  />
                  <span>Delivery channel share</span>
                  <InfoButton title={HELP.deliveryShare.title} label="About delivery share" size="sm">{HELP.deliveryShare.body}</InfoButton>
                </div>
                <div className="v2-muted text-xs">
                  Share of orders that go through delivery — extra packaging + processor, plus
                  delivery fee revenue.
                </div>
              </div>
              <div className="col-span-3 md:col-span-2">
                <Input
                  label="Share %"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={String(Math.round(a.deliveryShare.pct * 100))}
                  onChange={(e) =>
                    set("deliveryShare", {
                      ...a.deliveryShare!,
                      pct: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)),
                    })
                  }
                  trailingAdornment={<span className="v2-muted">%</span>}
                />
              </div>
              <div className="col-span-3 md:col-span-2">
                <Input
                  label="Packaging"
                  type="number"
                  step="0.1"
                  min="0"
                  value={(a.deliveryShare.packagingCostGrosze / 100).toFixed(2)}
                  onChange={(e) =>
                    set("deliveryShare", {
                      ...a.deliveryShare!,
                      packagingCostGrosze: Math.max(
                        0,
                        Math.round((parseFloat(e.target.value) || 0) * 100),
                      ),
                    })
                  }
                  trailingAdornment={<span className="v2-muted">zł</span>}
                />
              </div>
              <div className="col-span-3 md:col-span-2">
                <Input
                  label="+ Processor"
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={(a.deliveryShare.extraProcessorPct * 100).toFixed(2)}
                  onChange={(e) =>
                    set("deliveryShare", {
                      ...a.deliveryShare!,
                      extraProcessorPct: Math.max(
                        0,
                        Math.min(0.1, (parseFloat(e.target.value) || 0) / 100),
                      ),
                    })
                  }
                  trailingAdornment={<span className="v2-muted">%</span>}
                />
              </div>
              <div className="col-span-3 md:col-span-2">
                <Input
                  label="Fee revenue"
                  type="number"
                  step="0.5"
                  min="0"
                  value={(a.deliveryShare.avgFeeGrosze / 100).toFixed(2)}
                  onChange={(e) =>
                    set("deliveryShare", {
                      ...a.deliveryShare!,
                      avgFeeGrosze: Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100)),
                    })
                  }
                  trailingAdornment={<span className="v2-muted">zł</span>}
                />
              </div>
            </div>
          )}

          {a.ingredients && (
            <>
              <div className="border-t border-[var(--border)] pt-3" />
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <h3 className="v2-section-h" style={{ margin: 0, fontSize: "var(--text-md)" }}>
                  Ingredient cost stress tests
                </h3>
                <InfoButton
                  title={HELP.ingredientLevers.title}
                  label="About ingredient cost stress tests"
                  size="sm"
                >
                  {HELP.ingredientLevers.body}
                </InfoButton>
              </div>
              <div className="v2-muted text-xs" style={{ marginTop: -4 }}>
                Recipe + supplier &quot;what ifs&quot;. Each lever&apos;s impact = share of COGS × cost
                change, applied to the base-pizza COGS only (attach items unaffected).
              </div>
              {INGREDIENT_LEVERS.map(({ key, label, hint }) => {
                const lever = a.ingredients?.[key];
                if (!lever) return null;
                return (
                  <IngredientLeverRow
                    key={key}
                    label={label}
                    hint={hint}
                    lever={lever}
                    baseCogsValueGrosze={baseCogsValueGrosze}
                    onChange={(v) => setIngredient(key, v)}
                  />
                );
              })}
            </>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

// --- Weather & calendar card ---------------------------------------------

interface WeatherCardProps {
  weather: SimulationWeather;
  baseOrdersPerDay: number;
  baseDaysOpen: number;
  onChange: (next: SimulationWeather) => void;
}

function WeatherCalendarCard({ weather, baseOrdersPerDay, baseDaysOpen, onChange }: WeatherCardProps) {
  const w = weather;
  const patch = (next: Partial<SimulationWeather>) => onChange({ ...w, ...next });

  // Live preview of the composite volume multiplier (matches applyAssumptionsAndWeather).
  const rainAdj = w.rainyShare * w.rainyDayMultiplier + (1 - w.rainyShare);
  const hotAdj = w.heatwaveShare * w.heatwaveMultiplier + (1 - w.heatwaveShare);
  const schoolAdj = (2 / 12) * w.schoolHolidayLunchMultiplier + 10 / 12;
  const compositeVolume = rainAdj * hotAdj * schoolAdj;
  const peakBonus = w.holidayPeakDaysPerMonth * (w.holidayPeakMultiplier - 1) * baseOrdersPerDay;
  const eventBonus = w.eventDaysPerMonth * (w.eventDayMultiplier - 1) * baseOrdersPerDay;
  const effectiveDaysOpen = Math.max(0, baseDaysOpen - w.holidayClosedDaysPerMonth);
  const effectiveOrdersPerDay =
    effectiveDaysOpen > 0
      ? baseOrdersPerDay * compositeVolume + (peakBonus + eventBonus) / effectiveDaysOpen
      : baseOrdersPerDay * compositeVolume;

  return (
    <Card>
      <CardHeader
        title="Weather & calendar"
        description="Rain, heat, Polish holidays, school-holiday lunch dip and event days. Modifies effective volume + days open — propagates into every chart below."
        actions={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <InfoButton title={HELP.weatherOverview.title} label="About weather & calendar">{HELP.weatherOverview.body}</InfoButton>
            <CalendarRange className="h-4 w-4 v2-muted" />
          </span>
        }
      />
      <CardBody>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <Input
            label={<LabelWithInfo text="Rainy-day multiplier" help={HELP.rainyDay} />}
            type="number"
            step="0.05"
            min="0"
            max="3"
            value={w.rainyDayMultiplier.toFixed(2)}
            onChange={(e) =>
              patch({ rainyDayMultiplier: Math.max(0, Math.min(3, (parseFloat(e.target.value) || 0))) })
            }
            description="Default 0.75 — 25% volume drop on rainy days."
          />
          <Input
            label="Rainy-day share"
            type="number"
            step="1"
            min="0"
            max="100"
            value={String(Math.round(w.rainyShare * 100))}
            onChange={(e) =>
              patch({ rainyShare: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)) })
            }
            trailingAdornment={<span className="v2-muted">%</span>}
            description="Share of days that are rainy (Warsaw avg ~30%)."
          />
          <Input
            label={<LabelWithInfo text="Heatwave multiplier" help={HELP.heatwave} />}
            type="number"
            step="0.05"
            min="0"
            max="3"
            value={w.heatwaveMultiplier.toFixed(2)}
            onChange={(e) =>
              patch({ heatwaveMultiplier: Math.max(0, Math.min(3, (parseFloat(e.target.value) || 0))) })
            }
            description="Default 1.40 — patio evenings drive +40%."
          />
          <Input
            label="Heatwave evening share"
            type="number"
            step="1"
            min="0"
            max="100"
            value={String(Math.round(w.heatwaveShare * 100))}
            onChange={(e) =>
              patch({ heatwaveShare: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)) })
            }
            trailingAdornment={<span className="v2-muted">%</span>}
            description="Share of evenings hot enough to fire the bonus."
          />
          <Input
            label={<LabelWithInfo text="Holiday closed days / month" help={HELP.holidayClosed} />}
            type="number"
            step="0.5"
            min="0"
            max="31"
            value={w.holidayClosedDaysPerMonth.toFixed(1)}
            onChange={(e) =>
              patch({
                holidayClosedDaysPerMonth: Math.max(
                  0,
                  Math.min(31, (parseFloat(e.target.value) || 0)),
                ),
              })
            }
            description="Easter Sunday, NYE, 25 Dec, 15 Aug, Boże Ciało (~12/yr ÷ 12)."
          />
          <Input
            label={<LabelWithInfo text="Peak days / month" help={HELP.holidayPeak} />}
            type="number"
            step="0.5"
            min="0"
            max="31"
            value={w.holidayPeakDaysPerMonth.toFixed(1)}
            onChange={(e) =>
              patch({
                holidayPeakDaysPerMonth: Math.max(
                  0,
                  Math.min(31, (parseFloat(e.target.value) || 0)),
                ),
              })
            }
            description="NYE, Valentine's, Mother's Day."
          />
          <Input
            label="Peak day multiplier"
            type="number"
            step="0.1"
            min="0"
            max="5"
            value={w.holidayPeakMultiplier.toFixed(2)}
            onChange={(e) =>
              patch({ holidayPeakMultiplier: Math.max(0, Math.min(5, (parseFloat(e.target.value) || 0))) })
            }
            description="Default 1.60 — peak days run hot."
          />
          <Input
            label={<LabelWithInfo text="School-holiday lunch dip" help={HELP.schoolHoliday} />}
            type="number"
            step="0.05"
            min="0"
            max="2"
            value={w.schoolHolidayLunchMultiplier.toFixed(2)}
            onChange={(e) =>
              patch({
                schoolHolidayLunchMultiplier: Math.max(
                  0,
                  Math.min(2, (parseFloat(e.target.value) || 0)),
                ),
              })
            }
            description="July + August offices empty (default 0.85)."
          />
          <Input
            label={<LabelWithInfo text="Event days / month" help={HELP.eventDays} />}
            type="number"
            step="0.5"
            min="0"
            max="31"
            value={w.eventDaysPerMonth.toFixed(1)}
            onChange={(e) =>
              patch({
                eventDaysPerMonth: Math.max(0, Math.min(31, (parseFloat(e.target.value) || 0))),
              })
            }
            description="Street fairs, food-truck rallies, Nocny Market."
          />
          <Input
            label="Event day multiplier"
            type="number"
            step="0.1"
            min="0"
            max="5"
            value={w.eventDayMultiplier.toFixed(2)}
            onChange={(e) =>
              patch({ eventDayMultiplier: Math.max(0, Math.min(5, (parseFloat(e.target.value) || 0))) })
            }
            description="Default 1.50 — busy event evenings."
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-3 border-t border-[var(--border)]">
          <Stat label="Effective orders / day" value={`${effectiveOrdersPerDay.toFixed(1)}`} />
          <Stat label="Effective days open" value={`${effectiveDaysOpen.toFixed(1)} / mo`} />
          <Stat
            label="Composite volume"
            value={`${((compositeVolume - 1) * 100 >= 0 ? "+" : "")}${((compositeVolume - 1) * 100).toFixed(1)}%`}
          />
          <Stat
            label="Bonus orders / month"
            value={`+${Math.round(peakBonus + eventBonus).toLocaleString("pl-PL")}`}
          />
        </div>
      </CardBody>
    </Card>
  );
}

// --- AI enhancements card ------------------------------------------------

interface AiSuggestion {
  category: "revenue" | "cost" | "risk" | "operations";
  severity: "high" | "medium" | "low";
  title: string;
  problem: string;
  recommendation: string;
  estimatedImpactGrosze?: number;
}

const CATEGORY_LABEL: Record<AiSuggestion["category"], string> = {
  revenue: "Revenue",
  cost: "Cost",
  risk: "Risk",
  operations: "Operations",
};

const CATEGORY_TONE: Record<AiSuggestion["category"], "success" | "warning" | "danger" | "info"> = {
  revenue: "success",
  cost: "warning",
  risk: "danger",
  operations: "info",
};

const SEVERITY_TONE: Record<AiSuggestion["severity"], "danger" | "warning" | "neutral"> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

interface AiEnhancementsCardProps {
  scenario: SimulationScenario;
  computed: Computed;
}

function AiEnhancementsCard({ scenario, computed }: AiEnhancementsCardProps) {
  const [suggestions, setSuggestions] = useState<AiSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfig, setNeedsConfig] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNeedsConfig(false);
    try {
      const res = await fetch("/api/admin/simulation/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario,
          computed: {
            monthlyRevenue: computed.monthlyRevenue,
            monthlyCogs: computed.monthlyCogs,
            laborMonthly: computed.laborMonthly,
            fixedTotal: computed.fixedTotal,
            paymentFees: computed.paymentFees,
            packagingCost: computed.packagingCost,
            marketingCac: computed.marketingCac,
            wasteCost: computed.wasteCost,
            refundLoss: computed.refundLoss,
            loyaltyCost: computed.loyaltyCost,
            depreciation: computed.depreciation,
            interest: computed.interest,
            ebitda: computed.ebitda,
            ebitdar: computed.ebitdar,
            cashOnCashAnnual: computed.cashOnCashAnnual,
            occupancyRatio: computed.occupancyRatio,
            contributionPerLaborHour: computed.contributionPerLaborHour,
            trueCm1PerOrderGrosze: computed.trueCm1PerOrderGrosze,
            capacityUtilization: computed.capacityUtilization,
            totalCost: computed.totalCost,
            netProfit: computed.netProfit,
            margin: computed.margin,
            breakEvenOrdersPerDay: computed.breakEvenOrdersPerDay,
            breakEvenOrdersPerMonth: computed.breakEvenOrdersPerMonth,
            laborPct: computed.laborPct,
            primeCostPct: computed.primeCostPct,
            revenuePerLaborHour: computed.revenuePerLaborHour,
            profitPerOrder: computed.profitPerOrder,
            paybackMonths: computed.paybackMonths,
            laborByRole: computed.laborByRole,
          },
        }),
      });
      if (res.status === 503) {
        setNeedsConfig(true);
        setSuggestions(null);
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? `Request failed (${res.status})`);
        return;
      }
      const data = (await res.json()) as {
        suggestions: AiSuggestion[];
        generatedAt: string;
      };
      setSuggestions(data.suggestions);
      setGeneratedAt(data.generatedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the AI endpoint");
    } finally {
      setLoading(false);
    }
  }, [scenario, computed]);

  return (
    <Card>
      <CardHeader
        title="AI-generated enhancements"
        description="Claude reviews the scenario above and proposes specific changes to net profit, cost or risk — grounded in the actual numbers."
        actions={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            {generatedAt && (
              <span className="v2-muted text-xs">
                Generated {new Date(generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <Button
              size="sm"
              variant={suggestions ? "ghost" : "primary"}
              leadingIcon={loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
              onClick={generate}
              disabled={loading}
            >
              {loading ? "Analysing…" : suggestions ? "Regenerate" : "Generate suggestions"}
            </Button>
          </span>
        }
      />
      <CardBody>
        {needsConfig && (
          <div
            style={{
              padding: 14,
              borderRadius: 10,
              background: "var(--warning-soft, rgba(245, 158, 11, 0.1))",
              border: "1px solid var(--warning, #f59e0b)",
              color: "var(--warning, #f59e0b)",
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              fontSize: 13,
            }}
          >
            <AlertTriangle className="h-4 w-4" aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>AI not configured.</strong> Set <code>ANTHROPIC_API_KEY</code> in your
              environment to enable Claude-powered suggestions. The simulator works fine
              without it — every chart and KPI on this page is computed locally.
            </div>
          </div>
        )}
        {error && !needsConfig && (
          <div
            style={{
              padding: 14,
              borderRadius: 10,
              background: "var(--danger-soft, rgba(239, 68, 68, 0.1))",
              border: "1px solid var(--danger, #ef4444)",
              color: "var(--danger, #ef4444)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
        {!suggestions && !loading && !needsConfig && !error && (
          <div
            style={{
              padding: 28,
              textAlign: "center",
              color: "var(--fg-muted)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Lightbulb className="h-8 w-8" aria-hidden />
            <div style={{ fontSize: 14 }}>
              Click <strong>Generate suggestions</strong> to get 4–6 actionable enhancements
              based on the current scenario.
            </div>
          </div>
        )}
        {loading && (
          <div className="v2-stack-12">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  height: 88,
                  borderRadius: 10,
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  opacity: 0.6 - i * 0.1,
                }}
              />
            ))}
          </div>
        )}
        {suggestions && suggestions.length === 0 && !loading && (
          <div className="v2-muted text-sm" style={{ textAlign: "center", padding: 20 }}>
            No suggestions returned — the scenario may already be well-tuned. Try
            adjusting an input and regenerating.
          </div>
        )}
        {suggestions && suggestions.length > 0 && (
          <ul style={{ display: "flex", flexDirection: "column", gap: 10, padding: 0, margin: 0, listStyle: "none" }}>
            {suggestions.map((s, i) => (
              <li
                key={i}
                style={{
                  padding: 14,
                  borderRadius: 10,
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderLeft: `4px solid var(--${SEVERITY_TONE[s.severity] === "danger" ? "danger" : SEVERITY_TONE[s.severity] === "warning" ? "warning" : "border"}, ${SEVERITY_TONE[s.severity] === "danger" ? "#ef4444" : SEVERITY_TONE[s.severity] === "warning" ? "#f59e0b" : "#94a3b8"})`,
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                  <Badge tone={CATEGORY_TONE[s.category]} variant="soft" dot>
                    {CATEGORY_LABEL[s.category]}
                  </Badge>
                  <Badge tone={SEVERITY_TONE[s.severity]} variant="outline">
                    {s.severity}
                  </Badge>
                  <strong style={{ fontSize: 14 }}>{s.title}</strong>
                  {typeof s.estimatedImpactGrosze === "number" && s.estimatedImpactGrosze !== 0 && (
                    <span
                      className="tabular"
                      style={{
                        marginLeft: "auto",
                        fontSize: 13,
                        fontWeight: 600,
                        color:
                          s.estimatedImpactGrosze > 0
                            ? "var(--success, #10b981)"
                            : "var(--danger, #ef4444)",
                      }}
                    >
                      {s.estimatedImpactGrosze > 0 ? "+" : "−"}
                      {formatPrice(Math.abs(s.estimatedImpactGrosze))} / mo
                    </span>
                  )}
                </div>
                <div className="v2-muted" style={{ fontSize: 13, marginBottom: 6, lineHeight: 1.5 }}>
                  <strong style={{ color: "var(--fg)" }}>What&apos;s happening:</strong> {s.problem}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                  <strong>Recommendation:</strong> {s.recommendation}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
