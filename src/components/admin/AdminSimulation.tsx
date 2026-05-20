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
  Pencil,
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
import { krakowMenu } from "@/data/menus/krakow";
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
  SimulationMenuScenarioOverride,
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
  Dialog,
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
  // Every lever ships disabled by default — see store.ts
  // defaultSimulationAssumptions() for the canonical baseline.
  coffeeAttach: { enabled: false, attachPct: 0.25, avgPriceGrosze: 900, cogsPct: 0.12 },
  dessertAttach: { enabled: false, attachPct: 0.12, avgPriceGrosze: 1600, cogsPct: 0.28 },
  antipastiAttach: { enabled: false, attachPct: 0.08, avgPriceGrosze: 2400, cogsPct: 0.32 },
  aperitivoAttach: { enabled: false, attachPct: 0.10, avgPriceGrosze: 2200, cogsPct: 0.22 },
  premiumToppingsAttach: { enabled: false, attachPct: 0.15, avgPriceGrosze: 700, cogsPct: 0.30 },
  pastaPrimoAttach: { enabled: false, attachPct: 0.18, avgPriceGrosze: 3200, cogsPct: 0.26 },
  comboConversion: { enabled: false, pct: 0.20, addonGrosze: 2500, discountGrosze: 600, addonCogsPct: 0.25 },
  cheapestPizzaShift: { enabled: false, pp: 0, ticketDeltaGrosze: 1000, cogsDeltaGrosze: 400 },
  deliveryShare: { enabled: false, pct: 0.25, packagingCostGrosze: 250, extraProcessorPct: 0, avgFeeGrosze: 800 },
  ingredients: {
    mozzarella: { enabled: false, cogsShare: 0.28, costDeltaPct: 0 },
    tomato: { enabled: false, cogsShare: 0.10, costDeltaPct: 0 },
    flour: { enabled: false, cogsShare: 0.06, costDeltaPct: 0 },
    doughWeight: { enabled: false, cogsShare: 0.06, costDeltaPct: 0 },
    oliveOil: { enabled: false, cogsShare: 0.05, costDeltaPct: 0 },
    curedMeats: { enabled: false, cogsShare: 0.07, costDeltaPct: 0 },
    buffaloMozz: { enabled: false, cogsShare: 0.03, costDeltaPct: 0 },
    eggs: { enabled: false, cogsShare: 0.02, costDeltaPct: 0 },
    ovenFuel: { enabled: false, cogsShare: 0.04, costDeltaPct: 0 },
    packaging: { enabled: false, cogsShare: 0.03, costDeltaPct: 0 },
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
  // Ships disabled — matches the "off by default, operator opts in
  // explicitly" contract used for every Behaviour Assumption lever.
  // Calibrated values stay populated so the card springs to life with
  // sensible numbers the moment it's toggled on.
  enabled: false,
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
  daypart: "prep" | "lunch" | "off-peak" | "dinner" | "cleandown";
  label: string;
  hours: string;
  hoursPerDay: number;
  /** Share of daily orders this daypart handles (0 for prep / cleandown). */
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

/** Maps the uniform labor mix onto the truck's actual service windows
 *  (prep 11-12, lunch 12-15, off-peak 15-17, dinner 17-22, cleandown
 *  22-23) so the operator can see how thin the coverage gets at rush.
 *  Doesn't change the labor calc — this is the visibility layer the
 *  audit demanded. */
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
  // Truck service window is 12:00 – 22:00. Prep is the hour before;
  // cleandown is the hour after. Lunch + dinner are the two rushes
  // with a quiet mid-afternoon between them.
  const meta: { key: ShiftPlanRow["daypart"]; label: string; hours: string; hoursPerDay: number; share: number; concentrationFactor: number }[] = [
    { key: "prep", label: "Prep", hours: "11:00 – 12:00", hoursPerDay: 1, share: 0, concentrationFactor: 0.4 },
    { key: "lunch", label: "Lunch", hours: "12:00 – 15:00", hoursPerDay: 3, share: 0.35, concentrationFactor: 1.4 },
    { key: "off-peak", label: "Mid-afternoon", hours: "15:00 – 17:00", hoursPerDay: 2, share: 0.10, concentrationFactor: 0.7 },
    { key: "dinner", label: "Dinner", hours: "17:00 – 22:00", hoursPerDay: 5, share: 0.55, concentrationFactor: 1.6 },
    { key: "cleandown", label: "Cleandown", hours: "22:00 – 23:00", hoursPerDay: 1, share: 0, concentrationFactor: 0.3 },
  ];
  // If we have real daypart data, override share with observed.
  if (dayparts && dayparts.length > 0) {
    const totalObserved = dayparts.reduce((sum, d) => sum + d.ordersCount, 0);
    if (totalObserved > 0) {
      const obsByKey = new Map(dayparts.map((d) => [d.key, d.sharePct]));
      const lunchRow = meta.find((m) => m.key === "lunch");
      const dinnerRow = meta.find((m) => m.key === "dinner");
      const offPeakRow = meta.find((m) => m.key === "off-peak");
      if (lunchRow) lunchRow.share = obsByKey.get("lunch") ?? lunchRow.share;
      if (dinnerRow) dinnerRow.share = obsByKey.get("dinner") ?? dinnerRow.share;
      // Real off-peak observation lives in the "off-peak" bucket on
      // the daypart panel (15-17 falls outside the lunch / dinner /
      // late-night windows used there).
      if (offPeakRow) offPeakRow.share = obsByKey.get("off-peak") ?? offPeakRow.share;
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

/** Empty starter for the operator-defined "Custom" preset — the slot
 *  where they build a scenario from scratch without overwriting any of
 *  the baked-in archetypes. Visible on the picker as the 6th card. */
const CUSTOM_PRESET: MenuScenarioPreset = {
  id: "custom",
  name: "Custom",
  emoji: "✏️",
  description: "Build your own scenario from scratch — all fields editable, persists across reloads via Save.",
  ordersPerDay: 60,
  daysOpenPerMonth: 28,
  avgTicketGrosze: 6000,
  cogsPct: 0.30,
  attach: { coffee: 0.20, dessert: 0.10, antipasti: 0.05, aperitivo: 0, premiumToppings: 0.10, pastaPrimo: 0.10 },
};

const MENU_SCENARIOS_WITH_CUSTOM: MenuScenarioPreset[] = [...MENU_SCENARIOS, CUSTOM_PRESET];

const MENU_SCENARIO_BY_ID = new Map(MENU_SCENARIOS_WITH_CUSTOM.map((s) => [s.id, s]));

/** Resolve the effective preset values for a given id by overlaying the
 *  operator's saved overrides (if any) on top of the baked-in preset.
 *  When the operator clicks Save on a card, their edits land in
 *  scenario.menuScenarioOverrides[id]; Reset deletes that key. */
function resolveScenarioPreset(
  id: string,
  overrides: Record<string, SimulationMenuScenarioOverride> | undefined,
): MenuScenarioPreset {
  const base = MENU_SCENARIO_BY_ID.get(id) ?? CUSTOM_PRESET;
  const ovr = overrides?.[id];
  if (!ovr) return base;
  return {
    ...base,
    ordersPerDay: ovr.ordersPerDay,
    daysOpenPerMonth: ovr.daysOpenPerMonth,
    avgTicketGrosze: ovr.avgTicketGrosze,
    cogsPct: ovr.cogsPct,
    attach: { ...base.attach, ...ovr.attach },
  };
}

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

/** Average volume multiplier across all 12 months — the right composite
 *  for the headline "single typical month" view. */
function averageAnnualVolumeMult(w: SimulationWeather | undefined): number {
  if (!w || w.enabled === false) return 1;
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
  // Master toggle off — pass the scenario through unchanged. headline P&L
  // then runs on raw operator-typed ordersPerDay × daysOpenPerMonth.
  if (w.enabled === false) return s;
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
// the matching entry below. Each entry pairs an institutional/CFA-level
// explanation with a "plain terms" callout showing real-life examples and
// how the lever moves the actual zł numbers.

function PlainTalk({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: "10px 12px",
        background: "rgba(234, 88, 12, 0.06)",
        borderLeft: "3px solid rgb(234, 88, 12)",
        borderRadius: 6,
        fontSize: 13.5,
        lineHeight: 1.55,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          color: "rgb(194, 65, 12)",
          marginBottom: 6,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Sparkles style={{ width: 12, height: 12 }} aria-hidden /> In plain terms
      </div>
      {children}
    </div>
  );
}

function Tips({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        marginTop: 10,
        padding: "10px 12px",
        background: "rgba(22, 163, 74, 0.07)",
        borderLeft: "3px solid rgb(22, 163, 74)",
        borderRadius: 6,
        fontSize: 13.5,
        lineHeight: 1.55,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          color: "rgb(21, 128, 61)",
          marginBottom: 6,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Lightbulb style={{ width: 12, height: 12 }} aria-hidden /> Tips — how to push this lever
      </div>
      {children}
    </div>
  );
}

function Methodology({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        marginTop: 10,
        padding: "10px 12px",
        background: "rgba(59, 130, 246, 0.06)",
        borderLeft: "3px solid rgb(59, 130, 246)",
        borderRadius: 6,
        fontSize: 13,
        lineHeight: 1.55,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          color: "rgb(30, 64, 175)",
          marginBottom: 6,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Calculator style={{ width: 12, height: 12 }} aria-hidden /> Methodology — how this is determined
      </div>
      {children}
    </div>
  );
}

/** Slate/navy callout for the deeper CFA-3 / institutional analysis tier.
 *  Sits between the 1-2 sentence brief description and the storytelling
 *  PlainTalk callout. Carries the rigorous "why it matters, how to think
 *  about it" content — benchmarks, formulas, structural commentary. */
function InstitutionalAnalysis({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        marginTop: 10,
        padding: "10px 12px",
        background: "rgba(71, 85, 105, 0.06)",
        borderLeft: "3px solid rgb(71, 85, 105)",
        borderRadius: 6,
        fontSize: 13.5,
        lineHeight: 1.55,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          color: "rgb(30, 41, 59)",
          marginBottom: 6,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Scale style={{ width: 12, height: 12 }} aria-hidden /> Institutional analysis
      </div>
      {children}
    </div>
  );
}

// --- Dynamic attach-lever help -------------------------------------------
//
// Each attach lever's InfoButton popup keeps the storytelling voice of the
// original "In plain terms" copy ("Coffee is the easiest extra złoty in
// the business — beans cost ~1 zł, you sell the cup for 9 zł…") but weaves
// the live values from `lever.avgPriceGrosze`, `lever.cogsPct`,
// `lever.attachPct` and the scenario's `ordersPerDay × daysOpenPerMonth`
// directly into the narrative. The story stays narrative no matter what
// the operator types — extreme-value notes appear separately when the
// price or attach% falls outside a realistic range, and the story has a
// distinct negative-margin variant when sell < cost.

type AttachLeverKind =
  | "coffee"
  | "dessert"
  | "antipasti"
  | "aperitivo"
  | "premiumToppings"
  | "pastaPrimo";

interface NarrativeValues {
  sellZl: number;
  cogsZl: number;
  /** Gross margin per unit = sell − COGS. Used for the "~7.92 zł margin"
   *  flavor line in the narrative — easy to reason about visually. */
  marginZl: number;
  /** Pre-CIT margin per unit after variable leakage (payment fees, waste,
   *  refunds, loyalty burn). What hits EBITDA. */
  preCitMarginZl: number;
  /** Net margin per unit after variable leakage AND CIT. What actually
   *  lands on the bottom line of the P&L. Drives the monthly figures so
   *  they match the actual net-profit delta. */
  netMarginZl: number;
  /** Sum of variable-leakage rates applied on incremental revenue. */
  leakagePct: number;
  /** CIT rate (0.09 small-CIT or 0.19 standard PL). */
  citPct: number;
  currentPct: number;
  targetPct: number;
  deltaPp: number;
  ordersPerDay: number;
  daysOpenPerMonth: number;
  extraUnitsPerDay: number;
  monthlyMarginZl: number;
  currentMonthlyMarginZl: number;
}

interface AttachHelpProfile {
  title: string;
  /** 1-2 sentence brief — what the lever IS at a glance. Renders as
   *  plain prose at the top of the popup. */
  briefDescription: ReactNode;
  /** Deeper CFA-3 / institutional commentary — why the lever matters,
   *  margin economics, trade-offs, benchmarks. Renders inside the
   *  slate-tinted InstitutionalAnalysis callout. */
  institutionalAnalysis: ReactNode;
  /** Storytelling body of the IN PLAIN TERMS callout. Live values are
   *  woven into the narrative voice, not formatted as a math recap.
   *  Each story handles three branches internally: normal,
   *  already-at-cap (deltaPp ≤ 0), and negative-margin (sell < cost). */
  story: (v: NarrativeValues) => ReactNode;
  // Realistic market range for the SELL price in zł. Outside this range,
  // an extreme-value note explains why the simulation becomes unrealistic.
  priceFloor: number;
  priceCeiling: number;
  lowNote: (price: number) => ReactNode;
  highNote: (price: number) => ReactNode;
  // Realistic ceiling for attach % — above this, the simulation is in
  // fantasy territory (no one converts 90% of customers to dessert).
  attachCeiling: number;
  attachCeilingNote: (pct: number) => ReactNode;
  tips: ReactNode;
  /** Per-lever methodology context. Rendered inside the Methodology block
   *  beneath shared formulas, so the operator can see WHY the realistic
   *  ceiling and price-range thresholds are set where they are, what
   *  drives the COGS for this category, and what the simulation does NOT
   *  account for. */
  methodology: {
    ceilingRationale: ReactNode;
    priceRationale: ReactNode;
    cogsRationale: ReactNode;
    notModelled: ReactNode;
  };
}

// Storytelling number formatters — keep the narrative readable.
//   fmtZl(9)     → "9"        (drops trailing zeros for round numbers)
//   fmtZl(9.50)  → "9.50"
//   fmtZl(0.24)  → "0.24"
//   fmtZlRounded(2916)   → "2 900"   (rounded to nearest 100)
//   fmtZlRounded(13250)  → "13 000"  (rounded to nearest 1000 for big numbers)
function fmtZl(zl: number): string {
  if (Math.abs(zl - Math.round(zl)) < 0.005) return String(Math.round(zl));
  return zl.toFixed(2);
}

function fmtZlRounded(zl: number): string {
  const abs = Math.abs(zl);
  let rounded: number;
  if (abs >= 10000) rounded = Math.round(zl / 1000) * 1000;
  else if (abs >= 1000) rounded = Math.round(zl / 100) * 100;
  else if (abs >= 100) rounded = Math.round(zl / 10) * 10;
  else rounded = Math.round(zl);
  return rounded.toLocaleString("pl-PL");
}

function fmtUnits(n: number): string {
  if (n <= 0) return "0";
  if (n < 1) return n.toFixed(1);
  return String(Math.round(n));
}

const ATTACH_HELP: Record<AttachLeverKind, AttachHelpProfile> = {
  coffee: {
    title: "Coffee attach rate",
    briefDescription: (
      <p>
        Share of orders that add an espresso, cappuccino or similar.
        25% means one in four customers takes coffee.
      </p>
    ),
    institutionalAnalysis: (
      <p style={{ margin: 0 }}>
        <strong>Why it&apos;s gold:</strong> coffee is ~88% gross margin (an
        espresso uses about 1 zł of beans + milk for a 9 zł sell price).
        Every +10 pp on attach lifts your average ticket by ~0.90 zł at
        almost no extra COGS — only the variable-leakage stack (payment
        fees, waste, refunds, loyalty burn) and CIT pare it back. Among
        all attach levers this is the highest contribution-per-złoty-of-
        revenue because the marginal kitchen / labour cost is near zero
        (espresso is parallel-station work, not on the pizza line).
      </p>
    ),
    story: (v) => {
      if (v.marginZl <= 0) {
        return (
          <p style={{ margin: 0 }}>
            Coffee is usually the easiest extra złoty in the business — but right now
            your sell price ({fmtZl(v.sellZl)} zł) doesn&apos;t cover the
            {" "}{fmtZl(v.cogsZl)} zł of beans + milk you&apos;re using, so every cup{" "}
            <strong>loses</strong> ~{fmtZl(-v.marginZl)} zł. Pushing attach here just
            multiplies the loss. Fix the price or the COGS first — then attach
            becomes the lever it&apos;s meant to be.
          </p>
        );
      }
      if (v.deltaPp <= 0) {
        return (
          <p style={{ margin: 0 }}>
            You&apos;re already at <strong>{Math.round(v.currentPct * 100)}%</strong>{" "}
            coffee attach — basically everyone walks out with a cup. That&apos;s
            ~{Math.round(v.ordersPerDay * v.currentPct)} coffees a day at
            {" "}~{fmtZl(v.marginZl)} zł margin each, about{" "}
            <strong>~{fmtZlRounded(v.currentMonthlyMarginZl)} zł/month</strong> of
            nearly-pure profit already baked in. Holding this is the win — pushing
            further means changing the product, not the pitch.
          </p>
        );
      }
      return (
        <p style={{ margin: 0 }}>
          Coffee is the easiest extra złoty in the business — beans cost
          {" "}~{fmtZl(v.cogsZl)} zł, you sell the cup for {fmtZl(v.sellZl)} zł.
          At your current <strong>{Math.round(v.currentPct * 100)}%</strong> attach
          that&apos;s ~{fmtUnits(v.ordersPerDay * v.currentPct)} coffees a day ×
          {" "}~{fmtZl(v.marginZl)} zł margin ={" "}
          <strong>~{fmtZlRounded(v.currentMonthlyMarginZl)} zł/month</strong>{" "}
          already baked in. Push to{" "}
          <strong>{Math.round(v.targetPct * 100)}%</strong> on{" "}
          {Math.round(v.ordersPerDay)} orders/day and you&apos;d add
          {" "}~{fmtUnits(v.extraUnitsPerDay)} more coffees daily —{" "}
          <strong>+~{fmtZlRounded(v.monthlyMarginZl)} zł/month</strong> of
          nearly-pure profit on top. No new SKU, no extra labor — just one more
          sentence at the till (&quot;espresso with that?&quot;).
        </p>
      );
    },
    priceFloor: 3,
    priceCeiling: 14,
    lowNote: (price) => (
      <>
        <strong>Heads up:</strong> at {price.toFixed(2)} zł a cup you&apos;re barely
        covering beans (~1 zł) + milk (~0.50 zł) + cup &amp; lid (~0.40 zł) + the
        barista&apos;s 30 seconds. Below ~3 zł the lever stops being &quot;easy
        money&quot; — it&apos;s a loss-leader at best.
      </>
    ),
    highNote: (price) => (
      <>
        <strong>Reality check:</strong> {price.toFixed(2)} zł for an espresso is well
        above the Polish market (Costa, Starbucks, Green Caffè Nero cap at ~13–14 zł
        for specialty drinks; standalone espresso usually sits at 8–12 zł).
        The simulation will over-state your monthly upside — real attach will
        collapse at this price point.
      </>
    ),
    attachCeiling: 0.55,
    attachCeilingNote: (pct) => (
      <>
        <strong>Reality check:</strong> {(pct * 100).toFixed(0)}% attach is above
        what even Italian dinner spots achieve (best-in-class ~40–50%). Numbers
        below are theoretical — don&apos;t plan staffing on this attach rate.
      </>
    ),
    tips: (
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li>
          <strong>Scripted prompt at the till:</strong> &quot;espresso with that?&quot;
          adds 5–10 pp to attach in week one. Train, role-play, monitor.
        </li>
        <li>
          <strong>One-tap dessert + coffee bundle</strong> on the POS — combos sell
          twice as fast as à-la-carte upsells because there&apos;s no second decision.
        </li>
        <li>
          <strong>Auto-suggest in the cart</strong> for online &amp; delivery orders
          (already wired via <code>getCartSuggestions()</code> in
          <code>src/lib/upsell.ts</code>) — make sure coffee fires for pizza/pasta carts.
        </li>
        <li>
          <strong>Sensory cues:</strong> visible espresso machine at the counter, the
          smell of fresh grind, a chalk &quot;espresso 9 zł&quot; sign. Decision happens
          before the customer even orders.
        </li>
        <li>
          <strong>Pair with loyalty:</strong> &quot;3 coffees = free panna cotta&quot;
          punch card. The marginal cup costs you 1 zł; the panna cotta costs you ~4 zł
          — you net 3× ~8 zł margin for a 4 zł giveaway.
        </li>
      </ul>
    ),
    methodology: {
      ceilingRationale: (
        <>
          Polish casual-dining benchmark. Italian-style dinner spots can push
          60–65% in evening service, but for a pizza truck / pizzeria with
          mixed lunch + dinner + takeaway, 50–55% is the upper bound where
          roughly every other customer takes a coffee. Above 55% the
          simulation is modelling fantasy demand.
        </>
      ),
      priceRationale: (
        <>
          Standalone espresso prices in PL: Costa / Starbucks 10–14 zł for
          specialty drinks, Green Caffè Nero 8–12 zł, Italian-style cafés
          7–11 zł. Below 3 zł doesn&apos;t cover ~1 zł beans + 0.40 zł cup &amp;
          lid + 0.50 zł milk + barista&apos;s 30 seconds — the lever flips
          negative.
        </>
      ),
      cogsRationale: (
        <>
          Espresso COGS at 9 zł sell: ~1 zł beans + 0.40 zł cup &amp; lid ≈
          1.40 zł / 9 zł = ~15%. Cappuccino / latte adds ~0.50 zł of milk →
          ~20%. The 12% default is the espresso-heavy blend; raise it
          toward 18–22% if your mix skews milk-based.
        </>
      ),
      notModelled: (
        <>
          Barista time and queue impact at peak. A coffee-heavy rush can slow
          pizza service if you don&apos;t have a dedicated machine. The
          simulation also doesn&apos;t deduct espresso-machine depreciation
          (~150 zł/month for a prosumer setup) — fold that into fixed costs
          if you&apos;re comparing &quot;coffee on vs. off&quot;.
        </>
      ),
    },
  },
  dessert: {
    title: "Dessert attach rate",
    briefDescription: (
      <p>
        Share of orders that add tiramisu, cannoli or panna cotta.
        10–15% is typical; aggressive merchandising can push to 25%.
      </p>
    ),
    institutionalAnalysis: (
      <p style={{ margin: 0 }}>
        <strong>Why it matters:</strong> desserts run ~28% COGS — better
        than pizza&apos;s 30% — so more dessert attach lifts AOV{" "}
        <em>and</em> improves the blended gross-margin %. Two-axis benefit:
        AOV up, COGS% down. Best when paired with a coffee attach push
        (dessert + espresso bundle eliminates the second decision cycle
        and stacks two high-margin items on one ticket). Casual-Italian
        benchmark sits at 12-18% steady-state; dinner-led concepts can
        sustain 25-30%.
      </p>
    ),
    story: (v) => {
      if (v.marginZl <= 0) {
        return (
          <p style={{ margin: 0 }}>
            Dessert is normally pure cream on top — but at {fmtZl(v.sellZl)} zł a
            portion with this COGS%, every tiramisu that leaves the kitchen is
            actually <strong>losing</strong> you ~{fmtZl(-v.marginZl)} zł. Raise the
            price or shrink the portion before pushing attach.
          </p>
        );
      }
      if (v.deltaPp <= 0) {
        return (
          <p style={{ margin: 0 }}>
            At <strong>{Math.round(v.currentPct * 100)}%</strong> dessert attach almost
            every table is finishing with tiramisu —
            {" "}~{Math.round(v.ordersPerDay * v.currentPct)} desserts a day at
            {" "}~{fmtZl(v.marginZl)} zł margin each, about{" "}
            <strong>~{fmtZlRounded(v.currentMonthlyMarginZl)} zł/month</strong> of
            cream already booked. Pushing further needs a new dessert SKU, not a
            better prompt.
          </p>
        );
      }
      return (
        <p style={{ margin: 0 }}>
          Tiramisu travels well, photographs better than the pizza, and earns better
          margin than the main dish. At {fmtZl(v.sellZl)} zł a portion that&apos;s
          {" "}~{fmtZl(v.marginZl)} zł of margin per dessert. Your current{" "}
          <strong>{Math.round(v.currentPct * 100)}%</strong> attach is
          {" "}~{fmtUnits(v.ordersPerDay * v.currentPct)} desserts a day ={" "}
          <strong>~{fmtZlRounded(v.currentMonthlyMarginZl)} zł/month</strong>{" "}
          already booked. Lift to{" "}
          <strong>{Math.round(v.targetPct * 100)}%</strong> on{" "}
          {Math.round(v.ordersPerDay)} orders/day and you&apos;d add
          {" "}~{fmtUnits(v.extraUnitsPerDay)} more desserts daily —{" "}
          <strong>+~{fmtZlRounded(v.monthlyMarginZl)} zł/month</strong>, pure
          cream on top of revenue you&apos;d already booked.
        </p>
      );
    },
    priceFloor: 6,
    priceCeiling: 30,
    lowNote: (price) => (
      <>
        <strong>Heads up:</strong> at {price.toFixed(2)} zł you&apos;re below cost
        for any decent tiramisu portion (mascarpone alone runs ~4 zł). Either the
        portion is too small to actually merchandise, or your COGS% is understated.
      </>
    ),
    highNote: (price) => (
      <>
        <strong>Reality check:</strong> {price.toFixed(2)} zł for one dessert is at
        fine-dining levels. Casual-Italian benchmark is 14–22 zł; above ~25 zł
        attach rate drops sharply because customers split or skip.
      </>
    ),
    attachCeiling: 0.4,
    attachCeilingNote: (pct) => (
      <>
        <strong>Reality check:</strong> {(pct * 100).toFixed(0)}% dessert attach
        exceeds even strong dinner-only restaurants. Best-in-class with active
        merchandising tops out around 25–30%.
      </>
    ),
    tips: (
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li>
          <strong>Time the prompt:</strong> server suggests dessert when clearing
          mains, not at first order. Hits ~3× the conversion of menu-only.
        </li>
        <li>
          <strong>Photo merchandising:</strong> a single hero shot of the tiramisu on
          the menu/order screen lifts attach more than adding three new SKUs.
        </li>
        <li>
          <strong>Small-portion option</strong> (mini cannoli, half tiramisu) at
          8–10 zł captures the &quot;too full but tempted&quot; crowd.
        </li>
        <li>
          <strong>Dessert + espresso combo</strong> bundles two attach levers into
          one yes — the highest-margin pairing in the entire menu.
        </li>
        <li>
          <strong>Showcase at the counter:</strong> a chilled dessert display you
          walk past on the way out converts impulse takeaway orders too.
        </li>
      </ul>
    ),
    methodology: {
      ceilingRationale: (
        <>
          Casual-Italian benchmark. Dinner-focused restaurants in Warsaw /
          Kraków hit 35–40% on full table service; lunch and takeaway
          typically sit at 10–15%. Above 40% is dessert-bar or fine-dining
          territory — not realistic for a pizzeria mix.
        </>
      ),
      priceRationale: (
        <>
          Polish casual-Italian range: tiramisu 14–20 zł, cannoli 12–16 zł,
          panna cotta 14–18 zł, affogato 12–16 zł. Above 30 zł moves to
          fine-dining where attach drops sharply; below 6 zł means the
          portion isn&apos;t a real dessert (probably a free amuse-bouche).
        </>
      ),
      cogsRationale: (
        <>
          Tiramisu at 16 zł sell: ~4 zł mascarpone + 1 zł ladyfingers + 0.50 zł
          coffee &amp; cocoa = ~5.50 zł / 16 zł = ~34%. Cannoli and panna
          cotta land at 22–28%. The 28% default sits in the middle of the
          range — adjust toward 32% for cream-heavy menus.
        </>
      ),
      notModelled: (
        <>
          Travel / takeaway damage to delicate desserts (tiramisu survives,
          panna cotta doesn&apos;t). If delivery share is &gt;30% in the channel
          mix, dial attach down or restrict the dessert menu to
          travel-friendly items in the recipe data.
        </>
      ),
    },
  },
  antipasti: {
    title: "Antipasti / starter attach",
    briefDescription: (
      <p>
        Share of dine-in tables that order a starter — bruschetta
        (~22 zł), burrata (~28 zł), olives, mortadella plate. 5–10%
        baseline, much higher in evening service.
      </p>
    ),
    institutionalAnalysis: (
      <p style={{ margin: 0 }}>
        <strong>Trade-off — ticket lift vs station load.</strong> Antipasti
        carry ~32% COGS (higher than coffee but lower than pasta primo)
        and order timing matters: served while pizza bakes, the starter
        doesn&apos;t cannibalise the main attach. But the antipasti station
        must absorb the marginal prep load — if it slows pizza out, the
        complaint cost exceeds the starter margin. Lever is dine-in only;
        for takeaway-heavy concepts the lever effectively doesn&apos;t apply.
      </p>
    ),
    story: (v) => {
      if (v.marginZl <= 0) {
        return (
          <p style={{ margin: 0 }}>
            A starter is normally a margin booster while customers wait — but at
            {" "}{fmtZl(v.sellZl)} zł with this COGS%, every plate <strong>loses</strong>
            {" "}~{fmtZl(-v.marginZl)} zł. Fix the recipe or the price first; then
            the attach lever earns its keep.
          </p>
        );
      }
      if (v.deltaPp <= 0) {
        return (
          <p style={{ margin: 0 }}>
            <strong>{Math.round(v.currentPct * 100)}%</strong> of tables already
            taking a starter is evening-restaurant territory — that&apos;s
            {" "}~{Math.round(v.ordersPerDay * v.currentPct)} starters a day at
            {" "}~{fmtZl(v.marginZl)} zł margin, around{" "}
            <strong>~{fmtZlRounded(v.currentMonthlyMarginZl)} zł/month</strong>
            {" "}already booked. The next pp comes from the prep station, not from
            the script — make sure the line can hold up.
          </p>
        );
      }
      return (
        <p style={{ margin: 0 }}>
          A burrata starter at {fmtZl(v.sellZl)} zł can earn ~{fmtZl(v.marginZl)} zł
          of margin while customers wait for the pizza anyway. At your current{" "}
          <strong>{Math.round(v.currentPct * 100)}%</strong> attach that&apos;s
          {" "}~{fmtUnits(v.ordersPerDay * v.currentPct)} starters a day ={" "}
          <strong>~{fmtZlRounded(v.currentMonthlyMarginZl)} zł/month</strong>{" "}
          already on the line. Push to{" "}
          <strong>{Math.round(v.targetPct * 100)}%</strong> on{" "}
          {Math.round(v.ordersPerDay)} orders/day and you&apos;d add
          {" "}~{fmtUnits(v.extraUnitsPerDay)} more daily —{" "}
          <strong>+~{fmtZlRounded(v.monthlyMarginZl)} zł/month</strong>. Watch the
          prep station though — if it slows the pizza out, you&apos;ve traded a
          starter for a complaint.
        </p>
      );
    },
    priceFloor: 10,
    priceCeiling: 60,
    lowNote: (price) => (
      <>
        <strong>Heads up:</strong> at {price.toFixed(2)} zł the starter is a snack,
        not an antipasto. Below ~10 zł the COGS% assumption usually breaks (good
        burrata, prosciutto and bread aren&apos;t cheap).
      </>
    ),
    highNote: (price) => (
      <>
        <strong>Reality check:</strong> {price.toFixed(2)} zł is platter / shared-board
        territory, not a typical first-course. Re-think this lever as a
        &quot;shared antipasti board&quot; SKU and lower the attach assumption
        accordingly (one board per table of 4, not per customer).
      </>
    ),
    attachCeiling: 0.35,
    attachCeilingNote: (pct) => (
      <>
        <strong>Reality check:</strong> {(pct * 100).toFixed(0)}% starter attach is
        only realistic in evening service with full table-service. Lunch &amp;
        takeaway will be far lower; blend the two before trusting this number.
      </>
    ),
    tips: (
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li>
          <strong>Bring free bread + olives</strong> to seated tables — primes the
          appetite, and the server&apos;s &quot;something to start while the oven
          fires up?&quot; lands much better.
        </li>
        <li>
          <strong>Station capacity first:</strong> a starter order that delays the
          pizza is a net negative. Pre-plate burrata + bruschetta during the rush.
        </li>
        <li>
          <strong>Wait-time framing:</strong> &quot;our pizzas take 8 minutes — a
          burrata is 60 seconds&quot; converts the dead-time objection.
        </li>
        <li>
          <strong>Table-share boards:</strong> 38–48 zł shared antipasti per table
          beats per-person starters on both attach and ticket.
        </li>
      </ul>
    ),
    methodology: {
      ceilingRationale: (
        <>
          Evening dine-in only. Best-in-class Italian dinner spots in
          Warsaw / Kraków with full table service hit 30–35% on the
          evening; mixed-service averages 8–15%. For a pizza truck or
          takeaway-heavy location, model attach ≤5% — the lever barely
          applies.
        </>
      ),
      priceRationale: (
        <>
          Polish casual-Italian benchmarks: bruschetta 18–26 zł, burrata
          24–32 zł, mortadella plate 28–38 zł, olive plate 14–18 zł. Above
          60 zł the item is a shared antipasti board, not a per-cover
          starter — recompute attach as &quot;per table&quot; instead.
        </>
      ),
      cogsRationale: (
        <>
          Burrata at 28 zł sell: ~9 zł cheese + 1.50 zł bread &amp; oil = ~10.50
          zł / 28 zł = ~38%. Bruschetta lands at 18–22% (cheap bread base);
          prosciutto plates 35–42%. The 32% default is the burrata-heavy
          blend.
        </>
      ),
      notModelled: (
        <>
          Antipasti-station capacity. A heavy starter rush during prime
          time can delay pizza output — the simulation doesn&apos;t deduct
          for that. Test attach increases against your kitchen throughput
          KPI before pushing in production.
        </>
      ),
    },
  },
  aperitivo: {
    title: "Aperitivo / wine attach",
    briefDescription: (
      <p>
        Share of evening orders that include an Aperol Spritz, glass of
        wine, beer or limoncello. The highest-margin attach we can model.
      </p>
    ),
    institutionalAnalysis: (
      <p style={{ margin: 0 }}>
        <strong>Highest-margin lever, lowest barrier to AOV lift.</strong>{" "}
        Drinks run ~22% COGS at 22 zł a glass — a 78% gross margin
        structure that pre-leakage is only beaten by espresso. Requires an
        alcohol licence (~5,000 zł/year), which adds a fixed-cost line but
        is recovered in ~6-8 weeks of attach revenue at typical PL casual-
        Italian dinner volumes. Use this lever to model the &quot;what
        would happen if we got licensed?&quot; question before signing.
        Evenings-only effect; lunch attach is near zero.
      </p>
    ),
    story: (v) => {
      if (v.marginZl <= 0) {
        return (
          <p style={{ margin: 0 }}>
            Drinks are normally the highest-margin attach in the building — but at
            {" "}{fmtZl(v.sellZl)} zł a glass with this COGS%, you&apos;re{" "}
            <strong>losing</strong> ~{fmtZl(-v.marginZl)} zł per pour. Re-check the
            recipe and the by-the-glass cost before pushing this lever.
          </p>
        );
      }
      if (v.deltaPp <= 0) {
        return (
          <p style={{ margin: 0 }}>
            <strong>{Math.round(v.currentPct * 100)}%</strong> drink attach across all
            orders is bar territory —
            {" "}~{Math.round(v.ordersPerDay * v.currentPct)} pours a day at
            {" "}~{fmtZl(v.marginZl)} zł margin ={" "}
            <strong>~{fmtZlRounded(v.currentMonthlyMarginZl)} zł/month</strong> already
            covering the lights and then some. The next pp comes from a real cocktail
            program, not from scripted prompts.
          </p>
        );
      }
      return (
        <p style={{ margin: 0 }}>
          An Aperol Spritz costs you ~{fmtZl(v.cogsZl)} zł to make and sells for
          {" "}{fmtZl(v.sellZl)} zł — that&apos;s{" "}
          <strong>{fmtZl(v.marginZl)} zł of margin per glass</strong>. Your current{" "}
          <strong>{Math.round(v.currentPct * 100)}%</strong> attach is
          {" "}~{fmtUnits(v.ordersPerDay * v.currentPct)} pours a day ={" "}
          <strong>~{fmtZlRounded(v.currentMonthlyMarginZl)} zł/month</strong>{" "}
          already covering the lights. Lift to{" "}
          <strong>{Math.round(v.targetPct * 100)}%</strong> on{" "}
          {Math.round(v.ordersPerDay)} orders/day and you&apos;d add
          {" "}~{fmtUnits(v.extraUnitsPerDay)} more drinks daily —{" "}
          <strong>+~{fmtZlRounded(v.monthlyMarginZl)} zł/month</strong> on top.
          Drinks are how Italian dinner spots keep the lights on.
        </p>
      );
    },
    priceFloor: 8,
    priceCeiling: 35,
    lowNote: (price) => (
      <>
        <strong>Heads up:</strong> at {price.toFixed(2)} zł you&apos;re below Aperol
        Spritz / house-wine market floor in Poland (16–22 zł). Either the COGS%
        assumption is wrong, or you&apos;re selling beer-not-cocktails — model
        them separately.
      </>
    ),
    highNote: (price) => (
      <>
        <strong>Reality check:</strong> {price.toFixed(2)} zł is fine-dining
        cocktail / premium-wine territory. Casual-Italian benchmark for one glass
        is 18–26 zł — above this attach rate halves at minimum.
      </>
    ),
    attachCeiling: 0.5,
    attachCeilingNote: (pct) => (
      <>
        <strong>Reality check:</strong> {(pct * 100).toFixed(0)}% drink attach across
        ALL orders is bar territory. Even the best Italian dinner spots only hit
        50%+ on evening-only orders. Apply this lever to evenings only when
        planning.
      </>
    ),
    tips: (
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li>
          <strong>Aperitivo hour (5–7 PM):</strong> drink + small antipasto for
          24 zł lures the 6 PM crowd before they commit to another spot.
        </li>
        <li>
          <strong>Drink-with-food default:</strong> &quot;wine pairing for this
          pizza?&quot; built into the POS recommendation engine.
        </li>
        <li>
          <strong>House-wine pour:</strong> 14 zł by the glass, ~3 zł COGS, no
          decision fatigue from a long list — fastest path to attach lift.
        </li>
        <li>
          <strong>Licence math:</strong> at +10 pp attach × 80 orders/day × 17 zł
          margin × 28 days = ~3,800 zł/month — covers the ~5,000 zł/year licence
          in the first 6 weeks.
        </li>
      </ul>
    ),
    methodology: {
      ceilingRationale: (
        <>
          Evening-only attach (5–11 PM). Dinner-led Italian / aperitivo bars
          in PL hit 40–50% on evening orders; mixed-service all-day spots
          average 10–20%. Above 50% across ALL orders is bar territory —
          requires a real cocktail program, not just bottles on a shelf.
        </>
      ),
      priceRationale: (
        <>
          Polish casual-Italian glass-pour range: Aperol Spritz 18–26 zł,
          house wine 14–22 zł, Italian beer 12–18 zł, limoncello shot
          12–16 zł. Below 8 zł you&apos;re modelling cheap beer only — split
          this lever in two. Above 35 zł is cocktail-bar / fine-dining.
        </>
      ),
      cogsRationale: (
        <>
          Aperol Spritz at 22 zł sell: ~3 zł Aperol + ~2 zł prosecco + ~0.50
          zł soda + ice + garnish ≈ 5.50 zł / 22 zł = ~25%. House wine
          25–30%, Italian beer 30–35%. The 22% default sits at the
          spritz-led-with-some-wine blend.
        </>
      ),
      notModelled: (
        <>
          The ~5,000 zł/year alcohol licence fee itself — fold it into the
          fixed-costs card if you&apos;re comparing &quot;licensed vs
          unlicensed.&quot; Also doesn&apos;t model glass-pour wastage (open
          bottles spoil after 2–3 days), which adds 3–5 pp of effective
          COGS for a wine-heavy program.
        </>
      ),
    },
  },
  premiumToppings: {
    title: "Premium toppings attach",
    briefDescription: (
      <p>
        Share of pizzas that add buffalo mozzarella (+6 zł), &apos;nduja
        (+7 zł), truffle oil (+9 zł), etc. ~3 zł marginal food cost,
        the rest is margin.
      </p>
    ),
    institutionalAnalysis: (
      <p style={{ margin: 0 }}>
        <strong>~50% incremental gross margin — cheapest AOV lever.</strong>{" "}
        No kitchen-time penalty (the topping goes on the same pizza,
        same oven cycle, same labour minute), no incremental packaging,
        no second checkout decision. The only ceiling is menu cognitive
        load — past ~4-5 premium options the operator gets diminishing
        returns because customers default to plain. Pair with menu
        engineering (place the highest-margin premium combo second-from-
        top per Kasavana / Smith to anchor decisions).
      </p>
    ),
    story: (v) => {
      if (v.marginZl <= 0) {
        return (
          <p style={{ margin: 0 }}>
            Premium toppings are normally ~50% incremental margin — but at
            {" "}{fmtZl(v.sellZl)} zł per add-on with this COGS%, you&apos;re actually
            {" "}<strong>losing</strong> ~{fmtZl(-v.marginZl)} zł each time someone
            says yes. Re-price the upgrade or rework the recipe before pushing
            attach.
          </p>
        );
      }
      if (v.deltaPp <= 0) {
        return (
          <p style={{ margin: 0 }}>
            <strong>{Math.round(v.currentPct * 100)}%</strong> of pizzas already going
            out with a premium topping is aggressive merchandising —
            {" "}~{Math.round(v.ordersPerDay * v.currentPct)} upgraded pizzas a day at
            {" "}~{fmtZl(v.marginZl)} zł margin ={" "}
            <strong>~{fmtZlRounded(v.currentMonthlyMarginZl)} zł/month</strong> already
            in the books. Pushing higher needs a new flagship topping, not more
            prompts.
          </p>
        );
      }
      return (
        <p style={{ margin: 0 }}>
          A drizzle of truffle oil costs ~{fmtZl(v.cogsZl)} zł but customers pay
          {" "}{fmtZl(v.sellZl)} zł for it — ~{fmtZl(v.marginZl)} zł of margin per
          pizza. At your current{" "}
          <strong>{Math.round(v.currentPct * 100)}%</strong> attach that&apos;s
          {" "}~{fmtUnits(v.ordersPerDay * v.currentPct)} upgraded pizzas a day ={" "}
          <strong>~{fmtZlRounded(v.currentMonthlyMarginZl)} zł/month</strong>{" "}
          already in the till. If attach climbs to{" "}
          <strong>{Math.round(v.targetPct * 100)}%</strong> on{" "}
          {Math.round(v.ordersPerDay)} orders/day, that&apos;s
          {" "}~{fmtUnits(v.extraUnitsPerDay)} more premium pizzas daily —{" "}
          <strong>+~{fmtZlRounded(v.monthlyMarginZl)} zł/month</strong> on top.
          Same dough, same oven — just better ingredients on top, easier to
          merchandise than raising base prices.
        </p>
      );
    },
    priceFloor: 2,
    priceCeiling: 18,
    lowNote: (price) => (
      <>
        <strong>Heads up:</strong> at {price.toFixed(2)} zł per upgrade the topping
        margin barely justifies the menu real-estate. Bundle several upgrades
        into one premium SKU instead.
      </>
    ),
    highNote: (price) => (
      <>
        <strong>Reality check:</strong> {price.toFixed(2)} zł for ONE topping
        upgrade is steep. Truffle is the only ingredient that sustains 9–12 zł in
        the Polish market — above that attach drops to single digits.
      </>
    ),
    attachCeiling: 0.45,
    attachCeilingNote: (pct) => (
      <>
        <strong>Reality check:</strong> {(pct * 100).toFixed(0)}% of pizzas getting
        a premium topping is achievable only with aggressive merchandising
        (chef&apos;s recommendation, photo callout, default-add). Plan for
        15–25%, treat 30%+ as upside.
      </>
    ),
    tips: (
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li>
          <strong>One signature upgrade:</strong> a single &quot;chef&apos;s pick&quot;
          topping merchandised at the top of every pizza converts 2× a long
          menu of choices.
        </li>
        <li>
          <strong>Photo merchandising:</strong> show the bubble of buffalo mozzarella
          or the truffle shaving — visual upgrades sell themselves.
        </li>
        <li>
          <strong>Default-toggle on premium pizzas:</strong> &apos;nduja pre-checked
          on the Diavola, customer opts OUT instead of opting IN. Lift is 3–5×.
        </li>
        <li>
          <strong>Seasonal rotation:</strong> truffle in autumn, fresh basil in
          summer — limited-time framing beats permanent menu items on attach.
        </li>
      </ul>
    ),
    methodology: {
      ceilingRationale: (
        <>
          Best-in-class with aggressive merchandising (default-add,
          photo callout, chef&apos;s-pick framing). Polish casual-Italian
          average sits at 15–25%; above 45% only with auto-add programs
          that opt the customer in rather than out.
        </>
      ),
      priceRationale: (
        <>
          Polish casual-Italian add-on range: buffalo mozzarella +6–8 zł,
          &apos;nduja +5–7 zł, truffle oil +8–12 zł, prosciutto crudo
          +7–9 zł, anchovies +3–5 zł. Below 2 zł isn&apos;t worth menu
          real-estate; above 18 zł is luxury-only territory (real truffle).
        </>
      ),
      cogsRationale: (
        <>
          Truffle oil drizzle at 7 zł sell: ~2 zł oil = ~30%. Buffalo
          mozzarella +7 zł sell: ~2.50 zł cheese / 7 zł = ~36%. Premium
          toppings run 25–35% COGS because the ingredient cost is
          concentrated — real buffalo, real truffle, cured meats.
        </>
      ),
      notModelled: (
        <>
          Menu cognitive load. Every additional premium topping competes
          with the previous ones for customer attention — past 4–5
          choices, attach drops because customers default to plain. The
          simulation treats all premium toppings as one undifferentiated
          attach.
        </>
      ),
    },
  },
  pastaPrimo: {
    title: "Pasta primo attach",
    briefDescription: (
      <p>
        Share of dine-in tables that order a pasta course alongside the
        pizza (Italian-style: primo = pasta first, then pizza as secondo).
        Avg 32 zł, ~26% COGS.
      </p>
    ),
    institutionalAnalysis: (
      <p style={{ margin: 0 }}>
        <strong>Biggest single-lever AOV bump — but only where seating
        allows.</strong> A 32 zł incremental ticket through a separate
        course adds materially more than coffee or dessert in absolute
        zł, but it requires a pasta station (separate pan + burner +
        cook minute per order) so the marginal labour cost is non-zero.
        Best for indoor dinner-led concepts; for a takeaway truck without
        seating, model attach &lt; 5% — the lever effectively doesn&apos;t
        apply. Compounds with antipasti and aperitivo for a full
        trattoria-style ticket structure.
      </p>
    ),
    story: (v) => {
      if (v.marginZl <= 0) {
        return (
          <p style={{ margin: 0 }}>
            A primo course is supposed to be a free ticket bump from the same table
            — but at {fmtZl(v.sellZl)} zł with this COGS%, each pasta{" "}
            <strong>loses</strong> ~{fmtZl(-v.marginZl)} zł. Re-look at portion size
            and price before pushing attach.
          </p>
        );
      }
      if (v.deltaPp <= 0) {
        return (
          <p style={{ margin: 0 }}>
            <strong>{Math.round(v.currentPct * 100)}%</strong> of dine-in tables
            ordering a pasta course is full-Italian-restaurant territory —
            {" "}~{Math.round(v.ordersPerDay * v.currentPct)} pastas a day at
            {" "}~{fmtZl(v.marginZl)} zł margin ={" "}
            <strong>~{fmtZlRounded(v.currentMonthlyMarginZl)} zł/month</strong> already
            in the books. The next pp comes from seating + pasta-station throughput,
            not from a better suggestion.
          </p>
        );
      }
      return (
        <p style={{ margin: 0 }}>
          A primo pasta course is a second item from the same table — same staff,
          same plate-pickup trip. At {fmtZl(v.sellZl)} zł a plate that&apos;s
          {" "}~{fmtZl(v.marginZl)} zł of margin per pasta. Your current{" "}
          <strong>{Math.round(v.currentPct * 100)}%</strong> attach is
          {" "}~{fmtUnits(v.ordersPerDay * v.currentPct)} pastas a day ={" "}
          <strong>~{fmtZlRounded(v.currentMonthlyMarginZl)} zł/month</strong>{" "}
          already booked. Push to{" "}
          <strong>{Math.round(v.targetPct * 100)}%</strong> on{" "}
          {Math.round(v.ordersPerDay)} dine-in orders/day =
          {" "}~{fmtUnits(v.extraUnitsPerDay)} more pastas/day,{" "}
          <strong>+~{fmtZlRounded(v.monthlyMarginZl)} zł/month</strong>. Only
          works where customers actually sit — but if you have seating, it&apos;s
          the single biggest dine-in lever you have.
        </p>
      );
    },
    priceFloor: 15,
    priceCeiling: 60,
    lowNote: (price) => (
      <>
        <strong>Heads up:</strong> at {price.toFixed(2)} zł you&apos;re below the
        minimum viable pasta plate price in Poland (carbonara starts around 24 zł
        for a portion that&apos;s actually a primo). COGS will eat the margin.
      </>
    ),
    highNote: (price) => (
      <>
        <strong>Reality check:</strong> {price.toFixed(2)} zł for a pasta course is
        upscale-Italian territory. Casual benchmark is 28–38 zł — above ~45 zł
        attach drops because customers default to just ordering pizza.
      </>
    ),
    attachCeiling: 0.35,
    attachCeilingNote: (pct) => (
      <>
        <strong>Reality check:</strong> {(pct * 100).toFixed(0)}% of dine-in tables
        ordering a full pasta course is restaurant-only territory. For a truck or
        takeaway-heavy location, model this lever at &lt;5% or disable it.
      </>
    ),
    tips: (
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li>
          <strong>Half-portion primo:</strong> 16–18 zł lets the table share one
          pasta &quot;to start&quot; before the pizza arrives — converts the
          &quot;not that hungry&quot; objection.
        </li>
        <li>
          <strong>Daily pasta special:</strong> one rotating dish (chalkboard, not
          menu) beats the static list — Italians do this for a reason.
        </li>
        <li>
          <strong>Share-plate framing:</strong> &quot;our pastas are designed to
          share — one between two before the pizza?&quot; lifts attach without
          stretching the kitchen.
        </li>
        <li>
          <strong>Kitchen capacity first:</strong> pasta needs a separate pan +
          burner per order. Don&apos;t push this lever past your pasta-station
          throughput or you&apos;ll blow up pizza times.
        </li>
      </ul>
    ),
    methodology: {
      ceilingRationale: (
        <>
          Full-Italian-restaurant pattern. Italian dinner-only spots
          (Trastevere-style) in Poland hit 30–35% pasta attach with
          dedicated pasta stations; casual pizzerias with a token pasta
          menu sit at 5–15%. For a takeaway truck without seating, model
          attach ≤2% — the lever effectively doesn&apos;t apply.
        </>
      ),
      priceRationale: (
        <>
          Polish casual-Italian range: carbonara / cacio e pepe 28–38 zł,
          ragù / amatriciana 32–42 zł, daily specials 38–48 zł, filled
          pastas (ravioli, tortellini) 36–46 zł. Below 15 zł is a snack
          portion, not a primo; above 60 zł is fine-dining.
        </>
      ),
      cogsRationale: (
        <>
          Carbonara at 32 zł sell: ~2 zł pasta + ~6 zł guanciale + ~2.50 zł
          pecorino + 0.50 zł eggs = ~11 zł / 32 zł = ~34%. Cacio e pepe
          runs 18–22%; filled pastas 28–35%. The 26% default sits at a
          ragù-led blend; raise toward 30% for cured-meat-heavy menus.
        </>
      ),
      notModelled: (
        <>
          Pasta-station throughput. Every order needs its own pan +
          burner — at &gt;6 orders / hour a single induction station
          chokes. The simulation also doesn&apos;t account for the
          extra prep labor (dough vs. sauce reduction is a different
          skill), so heavy attach can require a second hire.
        </>
      ),
    },
  },
};

interface AttachLeverHelpProps {
  kind: AttachLeverKind;
  lever: SimulationAttachLever;
  /** EFFECTIVE annualised volume (typed × applyAnnualWeather: rainy days,
   *  heatwave evenings, holiday closures, peak/event multipliers). What
   *  the actual P&L runs on. */
  ordersPerDay: number;
  daysOpenPerMonth: number;
  /** Raw operator-typed values for the same fields. Shown next to the
   *  effective values in the Methodology block so the operator sees the
   *  weather adjustment factor explicitly, not as silent magic. */
  typedOrdersPerDay: number;
  typedDaysOpenPerMonth: number;
  /** Variable-leakage rates from the scenario — applied to incremental
   *  attach revenue to compute the EFFECTIVE net margin (matches actual
   *  P&L delta), not just the gross sell − COGS. */
  paymentProcessorPct: number;
  wastePct: number;
  refundPct: number;
  loyaltyBurnPct: number;
  citPct: number;
}

function AttachLeverHelp({
  kind,
  lever,
  ordersPerDay,
  daysOpenPerMonth,
  typedOrdersPerDay,
  typedDaysOpenPerMonth,
  paymentProcessorPct,
  wastePct,
  refundPct,
  loyaltyBurnPct,
  citPct,
}: AttachLeverHelpProps) {
  const profile = ATTACH_HELP[kind];
  const sellZl = lever.avgPriceGrosze / 100;
  const cogsZl = sellZl * lever.cogsPct;
  const marginZl = sellZl - cogsZl;
  // Effective net margin per attached unit — what actually lands on the
  // bottom line after the P&L applies the same variable-leakage rates to
  // incremental attach revenue that it applies to all other revenue, then
  // small/full CIT. Matches the actual delta in monthly net profit when
  // the lever's attach % moves.
  const leakagePct = paymentProcessorPct + wastePct + refundPct + loyaltyBurnPct;
  const effectiveRatio = Math.max(0, 1 - lever.cogsPct - leakagePct);
  const preCitMarginZl = sellZl * effectiveRatio;
  const netMarginZl = preCitMarginZl * (1 - citPct);

  const currentPct = Math.max(0, Math.min(1, lever.attachPct));
  // Target is always the lever's realistic attach ceiling, so the +bump
  // represents the TOTAL upside left in this lever from where you are now
  // — not a fixed pp step. That way each different currentPct gives a
  // different bump number: from 0% coffee attach you've got ~55 pp of
  // headroom (huge bump); from 50% you've only got ~5 pp left (small
  // bump); at-or-above the ceiling the at-cap story fires instead.
  const targetPct = currentPct < profile.attachCeiling ? profile.attachCeiling : currentPct;
  const deltaPp = Math.max(0, targetPct - currentPct);

  const extraUnitsPerDay = ordersPerDay * deltaPp;
  // Monthly figures use the EFFECTIVE NET margin per unit (after variable
  // leakage + CIT) so the headroom matches the actual P&L delta — not the
  // headline gross margin which would over-state by ~15-25%. Negative
  // values flow through unclamped: when sell < cost the projected impact
  // is genuinely negative and the operator should see the loss.
  const monthlyMarginZl = extraUnitsPerDay * netMarginZl * daysOpenPerMonth;
  const currentMonthlyMarginZl = ordersPerDay * currentPct * netMarginZl * daysOpenPerMonth;

  const values: NarrativeValues = {
    sellZl,
    cogsZl,
    marginZl,
    netMarginZl,
    preCitMarginZl,
    leakagePct,
    citPct,
    currentPct,
    targetPct,
    deltaPp,
    ordersPerDay,
    daysOpenPerMonth,
    extraUnitsPerDay,
    monthlyMarginZl,
    currentMonthlyMarginZl,
  };

  const showLowNote = sellZl > 0 && sellZl < profile.priceFloor;
  const showHighNote = sellZl > profile.priceCeiling;
  const showAttachNote = currentPct > profile.attachCeiling;
  const noteStyle = {
    margin: "8px 0 0",
    padding: "6px 8px",
    background: "rgba(234, 88, 12, 0.12)",
    borderRadius: 4,
    color: "rgb(154, 52, 18)",
  } as const;

  return (
    <>
      {profile.briefDescription}
      <InstitutionalAnalysis>{profile.institutionalAnalysis}</InstitutionalAnalysis>
      <PlainTalk>
        {profile.story(values)}
        {showLowNote && <p style={noteStyle}>{profile.lowNote(sellZl)}</p>}
        {showHighNote && <p style={noteStyle}>{profile.highNote(sellZl)}</p>}
        {showAttachNote && (
          <p style={noteStyle}>{profile.attachCeilingNote(currentPct)}</p>
        )}
      </PlainTalk>
      <Tips>{profile.tips}</Tips>
      <Methodology>
        <p style={{ margin: "0 0 6px" }}>
          <strong>Inputs (live):</strong> the three fields on this row — attach %,
          avg price, COGS % — plus orders/day and open days/month from the
          scenario card above. All five flow into the formulas in real-time as
          you edit them; nothing is hardcoded.
        </p>
        <p style={{ margin: "0 0 6px" }}>
          <strong>Formulas (with your current values plugged in):</strong>
        </p>
        <ul style={{ margin: "0 0 6px", paddingLeft: 18 }}>
          <li>
            gross margin per unit = sell − (sell × COGS%) = {fmtZl(sellZl)} − (
            {fmtZl(sellZl)} × {(lever.cogsPct * 100).toFixed(0)}%) ={" "}
            <strong>{fmtZl(marginZl)} zł</strong>
          </li>
          <li>
            <strong>net margin per unit</strong> = sell × (1 − COGS% −
            payment-fee − waste − refunds − loyalty) × (1 − CIT) ={" "}
            {fmtZl(sellZl)} × (1 −{" "}
            {(lever.cogsPct * 100).toFixed(0)}% −{" "}
            {(leakagePct * 100).toFixed(1)}%) × (1 −{" "}
            {(citPct * 100).toFixed(0)}%) ={" "}
            <strong>{fmtZl(netMarginZl)} zł</strong>{" "}
            <span className="v2-muted">
              (matches actual P&amp;L delta)
            </span>
          </li>
          <li>
            baked-in monthly = currentPct × orders/day × net margin × open days
            = {(currentPct * 100).toFixed(0)}% × {Math.round(ordersPerDay)} ×{" "}
            {fmtZl(netMarginZl)} × {Math.round(daysOpenPerMonth)} ={" "}
            <strong>~{fmtZlRounded(currentMonthlyMarginZl)} zł</strong>
          </li>
          <li>
            headroom monthly = (ceiling − currentPct) × orders/day × net margin
            × open days = ({Math.round(profile.attachCeiling * 100)}% −{" "}
            {(currentPct * 100).toFixed(0)}%) × {Math.round(ordersPerDay)} ×{" "}
            {fmtZl(netMarginZl)} × {Math.round(daysOpenPerMonth)} ={" "}
            <strong>~{fmtZlRounded(monthlyMarginZl)} zł</strong>
          </li>
        </ul>
        <p style={{ margin: "0 0 4px", fontSize: 12.5, opacity: 0.85 }}>
          <strong>Variable leakage on incremental revenue ({(leakagePct * 100).toFixed(1)}%):</strong>{" "}
          payment processor {(paymentProcessorPct * 100).toFixed(1)}% (blended
          on-site card + cash 0% + Glovo/Wolt commission) + waste{" "}
          {(wastePct * 100).toFixed(1)}% + refunds {(refundPct * 100).toFixed(1)}%
          + loyalty burn {(loyaltyBurnPct * 100).toFixed(1)}%. Then CIT{" "}
          {(citPct * 100).toFixed(0)}% on the pre-tax incremental margin. Fixed
          costs (labor, rent) are unchanged by the lever and don&apos;t enter
          the marginal calculation.
        </p>
        <p style={{ margin: "0 0 4px", fontSize: 12.5, opacity: 0.85 }}>
          <strong>Volume:</strong> formulas use the EFFECTIVE annualised volume
          (your typed values × weather/holiday adjustments) so monthly numbers
          reconcile to the actual P&amp;L line. You typed{" "}
          <strong>{Math.round(typedOrdersPerDay)} orders/day × {Math.round(typedDaysOpenPerMonth)} days</strong>
          {" "}= {Math.round(typedOrdersPerDay * typedDaysOpenPerMonth).toLocaleString("pl-PL")} orders/month;
          {" "}after rainy days, heatwave bonuses, holiday closures and peak/event
          multipliers the effective volume is{" "}
          <strong>{Math.round(ordersPerDay)} orders/day × {Math.round(daysOpenPerMonth)} days</strong>
          {" "}= {Math.round(ordersPerDay * daysOpenPerMonth).toLocaleString("pl-PL")} orders/month
          {typedOrdersPerDay > 0 && Math.abs(ordersPerDay * daysOpenPerMonth - typedOrdersPerDay * typedDaysOpenPerMonth) > 0.5 && (
            <>
              {" "}({((ordersPerDay * daysOpenPerMonth) / (typedOrdersPerDay * typedDaysOpenPerMonth)).toFixed(2)}× the
              typed total). Change the Weather card to flex this.
            </>
          )}.
        </p>
        <p style={{ margin: "0 0 4px" }}>
          <strong>
            Realistic attach ceiling ({Math.round(profile.attachCeiling * 100)}%):
          </strong>{" "}
          {profile.methodology.ceilingRationale}
        </p>
        <p style={{ margin: "0 0 4px" }}>
          <strong>
            Realistic sell-price range ({profile.priceFloor}–{profile.priceCeiling} zł):
          </strong>{" "}
          {profile.methodology.priceRationale}
        </p>
        <p style={{ margin: "0 0 4px" }}>
          <strong>COGS context:</strong> {profile.methodology.cogsRationale}
        </p>
        <p style={{ margin: 0 }}>
          <strong>Not modelled:</strong> {profile.methodology.notModelled}
        </p>
      </Methodology>
    </>
  );
}

const HELP = {
  // Inputs
  ordersPerDay: {
    title: "Orders per day",
    body: (
      <>
        <p>
          Average orders the truck completes on a normal day. A typical
          Neapolitan pizza truck does 50–100/day; summer evenings can
          push 120+.
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: 0 }}>
            <strong>Why it matters:</strong> revenue = orders × ticket ×
            days open. Doubling this number roughly doubles revenue but
            only adds variable food cost — labor and rent are mostly
            fixed, so the extra orders are very profitable. The most
            operational-leverage of all top-line inputs: capacity is
            constrained by oven throughput × service hours, but until
            you saturate that ceiling, every additional order/day drops
            ~70-80% of its revenue to the bottom line.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            The more pizzas you sell each day, the more money you keep. Growing from
            <strong> 60 → 80 orders/day</strong> at 65 zł each is an extra
            <strong> 1,300 zł/day in revenue</strong>. Because rent, electricity and most
            of the team are the same whether you do 60 or 80, nearly the whole extra
            ~900 zł/day drops to profit — about <strong>~25,000 zł more profit per
            month</strong> from selling 20 more pizzas a day.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Daypart smarter, not longer:</strong> 80% of orders cluster in
              ~4 hours. Map your hourly heatmap and staff peaks heavily, off-peak
              minimally — same revenue, lower labor%.
            </li>
            <li>
              <strong>Local marketing:</strong> Instagram geo-targeted posts within
              2 km of the truck convert ~3× a wide-net ad. Cost per new order
              typically 8–15 zł.
            </li>
            <li>
              <strong>Speed up checkout:</strong> every 30 s shaved off ticket time
              lets you take one more order in the peak hour — that&apos;s ~4 extra
              orders/day if you trim consistently.
            </li>
            <li>
              <strong>Pre-order &amp; slot booking:</strong> push customers to
              reserve a 15-min pickup window. Smooths the queue, lets the kitchen
              batch better, recovers 10–20% of lost-to-queue orders.
            </li>
            <li>
              <strong>Loyalty drives frequency:</strong> a working punch card
              (4 pizzas → free) lifts return rate by 15–25% on the existing base —
              cheaper than acquiring new customers.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> this field is the operator&apos;s typed
            forecast for daily order volume. When live order data exists, the
            Actuals strip above pre-fills this from a rolling 90-day window
            (<code>/api/admin/simulation/actuals</code>) so the scenario
            stays anchored in reality.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Where it flows:</strong> orders/day × avg ticket × days
            open = monthly revenue (top of P&amp;L). Orders/day × hourly
            distribution (peak share + service hours) sets the kitchen-saturation
            KPI. Every attach lever uses orders/day to compute extra units.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Realistic range:</strong> 30–120 orders/day for a single
            Neapolitan truck. Below 30 you&apos;re structurally unprofitable on
            Warsaw/Kraków rents; above 120 you need a second oven or you&apos;ll
            blow ticket times past 25 min.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> Polish food-truck association benchmarks
            2024, GUS gastronomic-sector reports, and the truck&apos;s own
            6-month actuals when present.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> day-of-week variance (Saturday is
            ~2× a Tuesday). The Weather card handles seasonal volume; the
            Heatmap card handles intraday — but neither replaces operator
            judgement on event-day spikes.
          </p>
        </Methodology>
      </>
    ),
  },
  avgTicket: {
    title: "Average ticket",
    body: (
      <>
        <p>
          Total each customer pays per order, all-in (pizza + sides +
          drinks, tip excluded). Polish pizzerias run 60–72 zł when the
          menu has drinks and desserts.
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: "0 0 6px" }}>
            <strong>How to think about it:</strong> raise this by selling
            combos and add-ons rather than cranking pizza prices —
            customers notice price hikes, they don&apos;t notice that
            they added an espresso. Attach-driven AOV growth is the
            highest-NPV path: zero acquisition cost, near-zero kitchen
            time penalty (for coffee/dessert), and the marginal item
            inherits the same fixed-cost coverage as the base pizza.
          </p>
          <p className="v2-muted text-sm" style={{ margin: 0 }}>
            When the Menu mix card has weights, this field becomes
            display-only — the number is computed from each item&apos;s
            recipe price × menu mix.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Every extra złoty on the average bill is a złoty you earn without serving a
            single extra person. Convince every customer to spend just <strong>5 zł
            more</strong> (one espresso + a small tiramisu) on 80 orders/day and you&apos;ve
            added <strong>~11,000 zł/month</strong> — same kitchen, same staff, same
            hours.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Bundle, don&apos;t hike:</strong> a 65 zł combo (pizza + drink
              + dessert) beats raising pizza prices by 5 zł — same revenue lift,
              no customer complaints.
            </li>
            <li>
              <strong>Menu engineering:</strong> place the highest-margin pizza
              second-from-top on the menu (the &quot;decoy effect&quot; anchor).
              Lifts attach to that item by 15–25%.
            </li>
            <li>
              <strong>Default upsells in the POS:</strong> one-tap &quot;add
              espresso (9 zł)&quot; on the checkout screen lifts ticket more
              cheaply than any menu change.
            </li>
            <li>
              <strong>Premium toppings, not premium pies:</strong> let the
              customer build up — a +9 zł truffle upgrade feels cheaper than a
              60 zł pizza, even if the resulting ticket is the same.
            </li>
            <li>
              <strong>Watch the &quot;cheapest pizza&quot; share:</strong> if
              &gt;25% of orders pick the cheapest item, your menu pricing is too
              wide — compress the range and the ticket lifts on its own.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> typed by the operator as a blended average,
            OR computed live from the Menu mix card (Σ qty × price ÷ Σ qty
            across the current menu weights). When menu mix is on, this field
            becomes display-only and shows the menu-derived value.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Where it flows:</strong> avg ticket × orders/day × days
            open = monthly revenue. Also drives contribution margin (ticket −
            ticket × COGS%) and revenue-per-labor-hour. Combo deals, attach
            levers and discount engines all stack on top of this base.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Realistic range:</strong> 45–85 zł for a Polish pizzeria.
            Pizza-only menus 45–55 zł; with drinks 60–68 zł; full dinner
            (pasta + drinks + dessert) 70–85 zł. Above 90 zł is upscale
            Italian, not casual.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> Polish hospitality association 2024,
            Glovo/Wolt published GMV-per-order data, plus the truck&apos;s
            actuals when available.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> party-size variance (a 4-person
            order isn&apos;t 4 × the individual ticket). The model assumes
            one order = one customer; if your basket is multi-person heavy,
            scale ticket up accordingly.
          </p>
        </Methodology>
      </>
    ),
  },
  daysOpen: {
    title: "Days open per month",
    body: (
      <>
        <p>
          How many days each month the truck takes orders. 28 is typical
          (one day off per week). Each closed day loses ~3.6% of monthly
          revenue but holds fixed costs flat.
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: 0 }}>
            <strong>Trade-off: revenue vs sustainability.</strong> 7-day
            operation maximises top-line but burns out staff (and
            triggers Kodeks Pracy rest-period overtime premiums); 6
            days/week (~26 days/mo) is the sustainable sweet spot.
            Critical input for fixed-cost amortisation: rent + accountant
            + insurance are monthly, so per-day burden = fixed ÷ days
            open. Cutting days open without cutting fixed inflates the
            break-even daily volume.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Each closed day is a day with zero revenue but rent still due. Going from
            <strong> 28 → 26 days/month</strong> (closing two extra days for staff rest)
            on a 200,000 zł/month truck costs ~14,000 zł in revenue — about
            <strong> ~8,000 zł of lost profit</strong>. Often worth it if it stops your
            best pizzaiolo from quitting; burnout costs more than two slow days.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Close the worst day, not Sunday:</strong> Sunday usually
              over-indexes for pizza demand. Pick the lowest-volume day from
              your heatmap (often Monday/Tuesday) — same staff rest, less lost
              revenue.
            </li>
            <li>
              <strong>Reduced hours, not closed days:</strong> 18:00–22:00 only
              on a slow day keeps the lights on for the dinner peak while
              saving ~6 hours of labor.
            </li>
            <li>
              <strong>Roll staff days off:</strong> stagger across the team
              instead of closing — one cook off Monday, another Tuesday — so
              the truck stays open at lower headcount.
            </li>
            <li>
              <strong>Use closed days for prep:</strong> dough batches,
              tomato-sauce reductions, cleaning. Pre-prep saves ~15% prep
              labor on open days.
            </li>
            <li>
              <strong>Plan around fixed costs:</strong> rent is monthly, not
              daily — closing a day saves you ~1.5–2 hours of labor + 50 zł of
              utilities, nothing on rent. Calculate before deciding.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> operator-typed integer (1–31). Defaults to
            28 (6-day work week with 1 rest day average).
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Where it flows:</strong> multiplies into monthly revenue,
            monthly variable costs and the daily fixed-cost amortisation
            (rent ÷ days-open inflates per-day burden if you close more).
            Also gates the heatmap aggregation and the throughput KPIs.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Realistic range:</strong> 22–30 days. Under 22 means
            you&apos;re effectively part-time (struggles to cover rent); 30
            means 7-day operation which is sustainable for ~3 months before
            burnout. 26–28 is the typical sweet spot.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> Polish labour code (mandatory rest
            periods), Italian-style trattoria operating patterns,
            owner-operator surveys.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> public holidays (the Holiday
            Calendar card handles those separately as event-day deltas
            rather than closures). Also doesn&apos;t model day-of-week
            revenue mix — closing Saturday is much costlier than closing
            Monday, but the field treats every day as equal weight.
          </p>
        </Methodology>
      </>
    ),
  },
  cogsPct: {
    title: "Ingredient cost ratio (COGS %)",
    body: (
      <>
        <p>
          COGS = Cost Of Goods Sold. The share of revenue eaten by
          ingredients. Polish pizzeria benchmark: 25–35%.
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Formula:</strong> recipe cost ÷ price, weighted by
            menu mix. Under 30% is healthy; 30-32% is the operating norm;
            over 35% indicates recipe leakage (over-portioning, supplier
            drift, or under-priced menu). Each 1pp of COGS reduction
            flows directly to gross margin (then through the variable-
            leakage stack and CIT to net). On a 200k zł/mo truck, 1pp
            COGS ≈ 2,000 zł/mo pre-tax — the single highest-leverage
            line on the P&amp;L because it scales with revenue.
          </p>
          <p style={{ margin: 0 }}>
            When the Menu mix card has weights, this field is
            display-only — driven by Σ (item cost × qty) ÷ Σ (item price
            × qty).
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            For every 100 zł a customer pays, ~30 zł is the ingredients you burned.
            Shave just <strong>2 percentage points</strong> (better mozzarella supplier,
            tighter end-of-shift waste) and you keep an extra 2 zł per 100 zł sold. On a
            200,000 zł/month truck that&apos;s <strong>~4,000 zł more profit</strong> —
            same pizza, smarter buying.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Negotiate with the cheese supplier first:</strong>
              mozzarella + fior di latte is 35–45% of pizza COGS. A 5%
              discount there beats squeezing 5% out of basil.
            </li>
            <li>
              <strong>Track end-of-shift waste daily:</strong> if &gt;3% of
              dough goes in the bin, your hourly forecast is off. Tighten the
              hourly dough-batch plan.
            </li>
            <li>
              <strong>Recipe-cost every menu item monthly:</strong> ingredient
              prices drift (especially flour, oil, tomatoes). Re-cost in the
              Recipes admin page every 30 days; bump prices on the worst
              drifters.
            </li>
            <li>
              <strong>Standardise portion weights:</strong> the difference
              between a generous and stingy cook is 2–4 pp of COGS. Train +
              weigh + spot-check.
            </li>
            <li>
              <strong>Bulk-buy long-shelf items:</strong> flour, tomato passata,
              oil — order quarterly with a freight-saving partner. Saves 8–12%
              on those line items.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> typed as a blended %, OR computed from the
            Menu mix card as Σ (qty × recipe cost) ÷ Σ (qty × price), weighted
            by menu mix. When live actuals exist, the Actuals strip pulls the
            menu-mix-weighted figure from the last 90 days of orders.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Where it flows:</strong> monthly variable food cost =
            revenue × COGS%. Inverts into gross margin (1 − COGS%) on the
            P&amp;L. Feeds the contribution-margin and prime-cost KPIs.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Realistic range:</strong> 22–35%. Under 25% is rare in
            Poland for casual-Italian (means cheap ingredients or super-tight
            ops); 28–32% is healthy; over 35% means recipes need
            re-engineering (better suppliers, smaller portions, or higher
            prices).
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> Polish restaurant association
            benchmarks, OECD food-cost data, Italian-pizzeria
            owner-operator reports. Margins tighten in inflationary periods
            (2022–2024 flour spike pushed industry avg from 28% → 33%).
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> waste %, employee-meal cost,
            comps and refunds — all of these are separate fields lower in
            the page. Don&apos;t double-count by stuffing them into COGS%.
          </p>
        </Methodology>
      </>
    ),
  },
  laborMix: {
    title: "Labor mix",
    body: (
      <>
        <p>
          Each row is one role on the team. Monthly cost = headcount ×
          weekly hours × 4.345 weeks × hourly rate.
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Why 1.22× brutto:</strong> in Poland the employer
            pays ZUS (social insurance) + Labor Fund <em>on top</em> of
            the gross wage — about 22% extra. A pizzaiolo&apos;s 35 zł/h
            brutto wage actually costs the truck ~43 zł/h. The default
            rates already bake this in.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Target: total labor ≤ 30% of revenue.</strong> The
            KPI strip flags red/amber/green. Above 33% indicates either
            over-staffing for current volume or under-pricing — diagnose
            which before cutting heads. Schedule flexibility (part-time
            mix vs salaried core) governs how fast labor responds to a
            volume dip; the laborFlex lever models this elasticity.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Every hour someone is on the clock costs you money — even if no customer
            walks in. If you&apos;ve got 2 staff during the dead 14:00–16:00 slot when
            1 could handle it, you&apos;re paying <strong>~50 zł for nothing</strong>.
            Cutting 4 wasted hours a week saves <strong>~800 zł/month</strong>, straight
            to the bottom line.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Build the schedule from the hourly heatmap:</strong> staff
              up only when the demand curve says you need it. Don&apos;t default
              to 2 cooks if 1 + a runner handles 80% of the day.
            </li>
            <li>
              <strong>Cross-train, don&apos;t hire:</strong> a pizzaiolo who can
              also run the till saves a half-shift of cashier labor without
              losing throughput.
            </li>
            <li>
              <strong>Use short shifts for peaks:</strong> a 17:00–21:00
              part-timer at the dinner rush is half the cost of a full-day
              hire and matches when you actually need help.
            </li>
            <li>
              <strong>Tip-pool with capped service charge:</strong> ZUS-friendly
              way to lift effective pay without raising brutto — staff
              retention without inflating your labor % on paper.
            </li>
            <li>
              <strong>Watch labor % weekly:</strong> if it&apos;s &gt;33% for two
              weeks running, either revenue dropped or you over-staffed —
              re-cut the schedule before it becomes structural.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> per-role table with headcount, weekly
            hours and hourly rate. Owner-typed; can be auto-seeded from the
            Staff admin page (which holds real contracts) if the truck has
            data there.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Formula:</strong> monthly cost per row = headcount ×
            weekly hours × 4.345 weeks × hourly rate (brutto inclusive of
            ~22% ZUS / Labour Fund). Sum across roles = total labor; total
            labor ÷ revenue = labor %.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Why ×1.22 brutto:</strong> Polish employers pay ZUS
            (~19.5%) + Labour Fund (~2.5%) on top of gross wages, so the
            real cost is ~22% above the brutto rate. The default hourly
            rates already bake this in — &quot;rate × hours&quot; lands at
            full employer cost.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Realistic range:</strong> total labor 25–32% of revenue
            for casual-Italian in Poland. Under 25% is rare (suggests
            under-staffing or off-the-books pay); over 33% means revenue
            problem OR over-staffing — fix one or the other.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> Polish hospitality association labor
            benchmarks, ZUS rates 2024, JOPI gastronomic-employer surveys.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> overtime premiums (50% / 100%
            uplifts), holiday pay, sick-leave coverage, recruiting costs.
            Add a 5–8% buffer on total labor to absorb these in real ops.
          </p>
        </Methodology>
      </>
    ),
  },
  fixedCosts: {
    title: "Fixed monthly costs",
    body: (
      <>
        <p>
          Monthly bills you pay <em>regardless of how many orders you do</em>
          — rent, insurance, accountant, software, owner ZUS. Variable
          food costs live in COGS instead.
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: 0 }}>
            <strong>Why split them out:</strong> fixed costs set your
            break-even point. Each 1,000 zł/mo of fixed adds ~1.5
            orders/day to break-even (at typical contribution margin),
            and a higher break-even compresses the margin-of-safety
            ratio — the buffer between actual and break-even revenue.
            Rent is the dominant fixed line for casual-Italian in PL
            (occupancy ratio target ≤ 8% of revenue); above 12% the
            real-estate decision is costing more than the location
            premium can justify.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Fixed costs are the bills that arrive whether you sell 5 pizzas or 5,000.
            If your rent jumps from <strong>8,000 → 10,000 zł/month</strong>, you need
            to sell ~67 more pizzas every month (at ~30 zł of margin each) just to stay
            even. That&apos;s why moving to a cheaper pitch — even one with 10% less
            foot traffic — can be a winning trade.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Renegotiate rent annually:</strong> landlords expect
              year-end reviews. A 5% rent reduction or rent-free month is
              worth ~5,000–10,000 zł/year for a typical pitch. Always ask.
            </li>
            <li>
              <strong>Audit subscriptions quarterly:</strong> POS software,
              accountant, design tools, music licensing — small line items
              accumulate. Cancel anything used &lt;2× / month.
            </li>
            <li>
              <strong>Shop insurance every 2 years:</strong> commercial
              policies drift up if you stay with the same broker.
              10–20% savings on re-quote is common.
            </li>
            <li>
              <strong>Self-do bookkeeping with software:</strong> Wfirma,
              iFirma, inFakt around 60–100 zł/month vs ~600–1,000 zł/month
              for an accountant. Use the accountant only for year-end.
            </li>
            <li>
              <strong>Electricity tariff matters:</strong> dynamic-pricing
              tariffs cut cost ~15–25% for evening-peak businesses. Worth
              the switch if you have a smart meter.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> per-line table of monthly bills (rent,
            insurance, utilities, accountant, software, owner ZUS, etc.).
            Operator-typed; can be auto-seeded from Business Costs admin if
            the truck logs them there.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Where it flows:</strong> sum = monthly fixed cost. Plugs
            straight into the P&amp;L as a constant; sets break-even via
            fixed ÷ contribution-margin. Higher fixed = more orders needed
            before profit starts.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Realistic range:</strong> 12–25k zł/month for a
            Warsaw/Kraków pizza truck. Premium pitches (Hala Koszyki,
            Hala Gwardii) push 30k+ but compensate with footfall.
            Suburban pitches sit at 8–14k.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> Warsaw/Kraków commercial-real-estate
            reports 2024 (Cushman Wakefield, JLL), ZUS owner rates,
            insurance-broker quotes for gastronomic units.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> equipment depreciation
            (separate card), interest expense (separate card), one-off
            repairs. The model assumes steady-state fixed costs; add a
            5–8% buffer for unexpected repairs.
          </p>
        </Methodology>
      </>
    ),
  },
  menuScenario: {
    title: "Menu scenario",
    body: (
      <>
        <p>
          Pick one of five archetypal menu shapes for a Neapolitan pizza
          truck. Each preset seeds the four Revenue inputs + the six
          attach-rate lever values — a coherent business model in one
          click.
        </p>
        <InstitutionalAnalysis>
          <ul style={{ margin: "0 0 6px", paddingLeft: 18 }}>
            <li><strong>Takeaway classic</strong> — 100 ord/d × 45 zł, low attach</li>
            <li><strong>Balanced</strong> — 70 ord/d × 65 zł, mixed attach</li>
            <li><strong>Premium</strong> — 55 ord/d × 88 zł, high attach</li>
            <li><strong>Family / Group</strong> — 30 ord/d × 155 zł, weekend / events</li>
            <li><strong>Aperitivo / Dinner</strong> — 45 ord/d × 82 zł, drinks-led (needs alcohol licence)</li>
          </ul>
          <p style={{ margin: 0 }}>
            Each is a different business model with different unit
            economics — volume-led (Takeaway) vs ticket-led (Aperitivo).
            Same truck, same kitchen, can earn 60-110k zł/month
            depending on which preset the team + pricing + roster is
            built around. Presets are starting points, not lock-ins —
            tweak any field afterward without resetting the preset, and
            the lever enabled state is preserved across loads.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Each preset is a different business model in disguise.
            <strong> Takeaway Classic</strong> sells lots of cheap pizzas to lunch
            crowds; <strong>Aperitivo Dinner</strong> sells fewer, bigger tickets with
            wine in the evening. The same truck can earn
            <strong> 60,000 vs 110,000 zł/month</strong> depending which menu shape
            you build the team and pricing around.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Pick the preset closest to YOUR pitch reality:</strong>
              office-park lunch? Takeaway Classic. Tourist street? Premium.
              Residential evenings? Aperitivo Dinner. Wrong preset = wrong
              staffing &amp; supplier orders.
            </li>
            <li>
              <strong>Use presets to A/B-test direction:</strong> load
              Balanced, then Premium — see how your P&amp;L changes if you
              pivot toward higher tickets &amp; lower volume.
            </li>
            <li>
              <strong>Combine with menu-mix overrides:</strong> a preset
              loads averages — refine on the Menu mix card afterwards with
              your actual top-10 items.
            </li>
            <li>
              <strong>Aperitivo needs the licence:</strong> don&apos;t pick
              it unless you actually have (or plan) the ~5,000 zł/year
              alcohol permit. Otherwise model with Aperitivo OFF.
            </li>
            <li>
              <strong>Family/Group is high-variance:</strong> 30 orders/day
              × 155 zł means few big tickets. One bad weekend wipes the
              week — only use if you have event bookings or weekend
              destination traffic.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> a dropdown of 5 archetypes. Picking one
            overwrites the four Revenue inputs (orders/day, avg ticket, days,
            COGS%) AND the six attach-rate levers in one go.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Where it flows:</strong> the preset is a starting point,
            not a lock-in. After applying, every downstream KPI, P&amp;L row
            and heatmap recomputes from the new inputs. Tweaking individual
            fields afterward refines but doesn&apos;t auto-revert to the
            preset.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Preset profiles (Warsaw 2026 calibration):</strong>
          </p>
          <ul style={{ margin: "0 0 4px", paddingLeft: 18 }}>
            <li>Takeaway Classic — 100 ord/d × 45 zł × 28%, low attach</li>
            <li>Balanced — 70 ord/d × 65 zł × 30%, mixed attach</li>
            <li>Premium — 55 ord/d × 88 zł × 32%, high attach</li>
            <li>Family/Group — 30 ord/d × 155 zł × 30%, weekend-led</li>
            <li>Aperitivo Dinner — 45 ord/d × 82 zł × 28%, drinks-led</li>
          </ul>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> Warsaw/Kraków pizza-truck operator
            interviews 2024, Polish gastronomic-sector benchmarks, Italian
            quick-service vs full-service split data.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> hybrid models (a truck that does
            Takeaway at lunch + Aperitivo at dinner is a real archetype
            but isn&apos;t a single preset). Run the simulation twice with
            different presets and weight the results manually.
          </p>
        </Methodology>
      </>
    ),
  },

  // Behavior assumptions
  assumptionsOverview: {
    title: "Behavior assumptions",
    body: (
      <>
        <p>
          Instead of typing one flat average ticket, you describe
          customer behavior with levers like &quot;25% of orders add a
          coffee&quot; or &quot;20% of mains convert to a combo&quot;.
          The simulator does the math on top of the base ticket.
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Mechanics.</strong> Every lever folds into the same
            effective ticket + COGS that the rest of the page uses via
            <code> applyAssumptions()</code>. Drag one slider and the
            headline KPIs, P&amp;L, cost pie, heatmaps, projection,
            break-even and Attachment Efficiency panel all re-derive
            simultaneously.
          </p>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Toggle on/off:</strong> each lever has a green
            &quot;On&quot; pill in its corner. Off excludes the lever
            from the math while preserving its configured values — use
            this to isolate a single hypothesis (e.g. &quot;what would
            my P&amp;L look like without coffee?&quot;) or click{" "}
            <em>All off</em> in the card header to see the raw baseline
            ticket × volume without any behavioural lifts.
          </p>
          <p className="v2-muted text-sm" style={{ margin: 0 }}>
            Defaults are tuned to a Neapolitan truck in Warsaw 2026 and
            every lever ships disabled — operator opts in explicitly.
            Match assumptions to real POS attach data within ±5 pp or
            the forecast is fiction.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Instead of guessing one &quot;average&quot; bill, you describe how
            customers actually behave: <em>&quot;one in four buys coffee&quot;</em>,
            <em>&quot;one in ten buys dessert&quot;</em>. Move any slider 5 percentage
            points and watch the bottom line shift by <strong>hundreds of zł per
            month</strong> — you&apos;ll see immediately which lever is worth your
            staff&apos;s attention next week.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Calibrate one lever at a time:</strong> tune the default
              attach % on coffee to your actual rate before touching the
              others. Wrong baselines compound across all 6 levers.
            </li>
            <li>
              <strong>Use &quot;All off&quot; to find your base ticket:</strong>
              the card header has a toggle to disable every lever. The
              resulting AOV is your raw pizza-only ticket — useful for
              comparing levers against a clean baseline.
            </li>
            <li>
              <strong>Rank levers by &quot;baked-in + headroom&quot;:</strong>
              click each one&apos;s (i) — the IN PLAIN TERMS shows current
              monthly + remaining upside. Push the lever with the biggest
              headroom first.
            </li>
            <li>
              <strong>Match attach to channel mix:</strong> delivery
              customers attach less than dine-in. If your channel split
              shifts toward delivery, scale all attach assumptions down 20-30%.
            </li>
            <li>
              <strong>Verify with weekly POS data:</strong> the Actuals
              card pulls real attach from the last 90 days. Match
              assumptions to actuals within ±5 pp or your forecast is
              fiction.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> 6 attach levers (coffee, dessert,
            antipasti, aperitivo, premium toppings, pasta primo) + combo
            conversion + cheapest-pizza shift + delivery share + ingredient
            levers. Each has its own (i) with full per-lever methodology.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>How it folds in:</strong> each lever computes a
            per-order ticket lift and COGS lift via{" "}
            <code>attachDelta()</code>. All deltas sum into{" "}
            <code>extraTicket</code> and <code>extraCogs</code>, which
            replace the typed avg ticket and COGS% downstream. Every
            KPI, P&amp;L row, heatmap and projection re-renders from the
            adjusted base.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Toggling:</strong> the green &quot;On&quot; pill on each
            lever excludes it from the math without losing the typed
            values. Use this to isolate a single hypothesis or build a
            &quot;before vs after&quot; comparison.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> Polish casual-Italian benchmark data,
            Italian gastronomic surveys, restaurant-economics literature
            (Norman, Walker), POS attach-rate studies from Glovo/Wolt.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> attach correlations (customers
            who buy coffee are more likely to buy dessert too). The model
            treats each lever independently — in reality, lifting one
            often lifts the others 1–3 pp as a side-effect.
          </p>
        </Methodology>
      </>
    ),
  },
  // NOTE: coffee/dessert/antipasti/aperitivo/premiumToppings/pastaPrimo
  // attach-lever help lives in ATTACH_HELP — that variant renders a live
  // body computed from the lever's current price/COGS/attach values so the
  // "In plain terms" numbers and extreme-value notes stay in sync.
  comboConversion: {
    title: "Combo conversion",
    body: (
      <>
        <p>
          % of mains that convert to a Combo (pizza + drink + dessert
          at a bundle discount, e.g. 6 zł off vs à-la-carte).
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Why combos win:</strong> the combo pulls a second /
            third item that <em>wouldn&apos;t have attached on its own</em>.
            Even after the discount, the total order is bigger and the
            kitchen amortises one ticket across more units — the
            classic McDonald&apos;s Extra-Value-Meal economics.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Math:</strong> per converted order, ticket = addon
            price − discount; COGS = addon price × addon COGS%. The
            cannibalisation question (would the customer have bought
            the items à-la-carte anyway?) caps the real incremental
            lift at ~75-85% of the modelled number for casual-Italian.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            A combo is a &quot;yes ladder&quot; — say yes once and you&apos;ve bought
            pizza + drink + dessert without re-deciding each item. If
            <strong> 30% of customers</strong> take the 65 zł combo instead of just a
            45 zł pizza, that&apos;s 20 zł × ~24 orders/day =
            <strong> ~14,000 zł/month</strong> extra revenue, almost all margin
            because the second and third items wouldn&apos;t have attached on their own.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Position combos as the default choice:</strong> menu
              top-left with a hero photo. Don&apos;t let customers find them —
              push them. Conversion lifts 2-3× when prominent.
            </li>
            <li>
              <strong>The 6 zł discount is the lure, not the goal:</strong>
              you&apos;re trading a 6 zł discount for an ~18 zł extra ticket.
              Don&apos;t bigger the discount to drive conversion — bigger the
              perceived value (better dessert, branded glass).
            </li>
            <li>
              <strong>Lunch combo + dinner combo:</strong> daypart-specific
              bundles convert better than a single all-day combo. Lunch = pizza
              + drink (faster); dinner = pizza + dessert + coffee (slower,
              higher ticket).
            </li>
            <li>
              <strong>Tap-to-add on the POS:</strong> when the cashier opens a
              pizza item, the POS should pop &quot;Make it a combo? +20 zł.&quot;
              One tap. Built-in &gt; cashier discretion.
            </li>
            <li>
              <strong>Track combo % weekly:</strong> if it drops below 15%
              your placement is wrong or your value isn&apos;t obvious. If it&apos;s
              above 40% you might be cannibalising à-la-carte attach (people
              who&apos;d have bought ALL the items at full price).
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> conversion % (share of main orders that
            take the combo), addon price (the cost of the bundled
            drink+dessert as displayed), discount (how much the combo undercuts
            à-la-carte) and addon COGS%.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Formula:</strong> for each converted order:
            <br />
            ticket lift = (addon price − discount)
            <br />
            COGS lift = addon price × addon COGS%
            <br />
            Per-order margin lift = ticket lift − COGS lift. Multiplied by
            (conversion% × orders/day × days) for monthly impact.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Why combos earn even at a discount:</strong> the addon
            items wouldn&apos;t have attached à-la-carte. So the 6 zł
            discount is real, but the alternative is selling 0 extras, not
            selling them at full price. Math beats intuition here.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Realistic range:</strong> 15–35% conversion is healthy
            for a Polish casual-Italian. Above 40% suggests you&apos;re
            cannibalising à-la-carte; below 10% suggests the combo is
            invisible or over-priced.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> QSR International combo-attach
            benchmarks, Polish casual-dining studies, McDonald&apos;s
            Extra-Value-Meal economics (published case studies).
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> the cannibalisation rate
            (some combo buyers would have bought all items at full
            price anyway). The model treats every combo conversion as
            net-new attach — in reality 15–25% would have attached
            anyway. Discount your monthly lift by that share for a
            conservative estimate.
          </p>
        </Methodology>
      </>
    ),
  },
  cheapestPizzaShift: {
    title: "Cheapest-pizza shift (recession stress)",
    body: (
      <>
        <p>
          A <em>downside</em> stress lever. Customers under price
          pressure shift toward Margherita and Marinara (the cheapest
          pies); the simulator drops AOV and COGS proportionally to the
          pp share that moves.
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: 0 }}>
            <strong>Use it to ask:</strong> &quot;If the economy gets
            bad enough that 20% more orders are Margherita, do we still
            break even?&quot; Polish 2022-2023 inflation shifted ~15 pp
            toward cheaper SKUs across casual dining. Default is 0 pp —
            turn on only to model a stress scenario. The model treats
            the shift as pure ticket loss; in practice some downshift
            customers up-attach on coffee (the &quot;treat&quot;
            behavior), partially offsetting the AOV drop.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            When wallets tighten, customers downgrade to the cheapest pie on the menu.
            If <strong>20% trade down</strong> from a 55 zł pizza to a 38 zł Margherita
            on 80 orders/day, that&apos;s 17 zł × 16 customers/day =
            <strong> ~270 zł/day, ~8,000 zł/month evaporated</strong>. Counter it with
            a 42 zł &quot;value champion&quot; you actually profit on, so the downshift
            lands somewhere safe instead of on your cheapest item.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Design a profitable &quot;value champion&quot;:</strong>
              one 42–45 zł pizza with strong margin (high-margin toppings
              + smaller portion). Position it as &quot;our daily special&quot;
              so the downshift lands there instead of on a Margherita.
            </li>
            <li>
              <strong>Smaller portions, not lower prices:</strong> launch a
              30 cm &quot;personal&quot; version at 60% of the full price.
              Captures budget customers without devaluing the menu.
            </li>
            <li>
              <strong>Combo the cheapest pizza:</strong> Margherita + drink
              for 48 zł lifts the ticket back up and keeps the cost-conscious
              customer happy. They feel they got a deal; you got the drink margin.
            </li>
            <li>
              <strong>Watch leading indicators:</strong> when search trends
              for &quot;cheap pizza Warsaw&quot; rise, you have ~6 weeks
              before the shift hits your menu. Pre-launch the value champion
              before you need it.
            </li>
            <li>
              <strong>Don&apos;t panic-discount:</strong> a 10% discount on
              all pizzas during a downturn cuts revenue by ~10% but only
              shifts demand 3-5%. Targeted value items beat blanket
              discounts every time.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> shift in percentage points of orders
            moving toward the cheapest pies, ticket delta (per-order
            revenue drop), COGS delta (per-order food-cost change). Default
            0 pp — only turn on when modelling a downside scenario.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Formula:</strong> effective AOV reduction = shift × ticket
            delta. Effective COGS reduction = shift × COGS delta. Both
            applied proportionally to all orders.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Realistic stress:</strong> 10–20 pp shift in a mild
            recession; 25–35 pp in a severe one. Polish 2022–2023 inflation
            shifted ~15 pp toward cheaper SKUs across casual-dining. Use
            this lever to ask &quot;what&apos;s our worst case?&quot;.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> GUS consumer-confidence index,
            Polish gastronomic sector inflation reports 2022–2024,
            EU-wide downshift studies in QSR.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> the cross-price elasticity
            between menu items (some customers downshift on price but
            up-attach on coffee — &quot;treat&quot; behaviour). The
            simulation treats the price-shift as pure ticket loss
            without compensating attach changes.
          </p>
        </Methodology>
      </>
    ),
  },
  deliveryShare: {
    title: "Delivery channel share",
    body: (
      <>
        <p>
          % of orders that go through delivery (vs takeaway / dine-in).
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: "0 0 6px" }}>
            Delivery flips the order economics in four places:
          </p>
          <ul style={{ margin: "0 0 6px", paddingLeft: 18 }}>
            <li><strong>+ Packaging cost</strong> (box, bag, napkins) — ~2.50 zł/order</li>
            <li><strong>+ Extra processor fee</strong> if a separate PSP handles delivery</li>
            <li><strong>+ Delivery-fee revenue</strong> (if you charge one, ~8 zł)</li>
            <li><strong>Different attach cohort</strong> — delivery customers attach 30-50% less</li>
          </ul>
          <p style={{ margin: 0 }}>
            More delivery = more volume but worse per-order margin. The
            simulator treats the channel mix as substitution (delivery
            replaces dine-in 1:1); in reality 30-50% of platform orders
            are incremental demand (customers who wouldn&apos;t have
            walked in). Validate with the per-channel contribution
            panel before re-allocating marketing spend.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Every Glovo order looks the same on screen but earns ~30% less profit — the
            platform takes ~28% commission and you pay for the box. Shift
            <strong> 10% of orders</strong> from delivery back to walk-up (loyalty
            perks, in-store discount) and on 2,400 orders/month that&apos;s 240 orders
            × ~12 zł extra margin each = <strong>~2,900 zł/month</strong> straight to
            the bottom line — same pizzas, smarter channel mix.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Run direct delivery (your own driver):</strong> 5–8 zł
              delivery fee at full margin beats 28% Glovo commission. Works
              for ~3 km radius if you have an e-bike + driver.
            </li>
            <li>
              <strong>Don&apos;t list cheap pizzas on Glovo/Wolt:</strong>
              the platform commission eats half the margin on a Margherita.
              List only mains 50+ zł where the margin survives.
            </li>
            <li>
              <strong>In-app loyalty pulls them off platforms:</strong>
              &quot;5% off when you order through our app&quot; — your app
              costs 0% commission. The discount is cheaper than the platform fee.
            </li>
            <li>
              <strong>Optimise packaging cost:</strong> 2.50 zł per order ×
              2,400 orders = 6,000 zł/month. Negotiate bulk on boxes or
              switch to a cheaper kraft alternative.
            </li>
            <li>
              <strong>Track per-channel attach:</strong> delivery customers
              attach 30-50% less on coffee + dessert. Push delivery-specific
              attach via &quot;add a dessert for 9 zł&quot; toggles on the
              cart screen.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> share of orders via delivery (%),
            packaging cost per order (zł), processor fee % for delivery
            (different from in-store if you use a separate one), avg
            marketplace commission % (~28% blended for Glovo+Wolt).
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Formula:</strong> per-delivery-order: ticket × (1 −
            commission%) − packaging cost. Versus in-store: ticket × (1 −
            in-store processor fee). Difference × delivery share × orders/day
            × days = monthly delivery profit drag.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Realistic range:</strong> 15–45% delivery share for a
            Polish pizzeria with platform presence. Pure-takeaway trucks
            often 0–10%; mall food-courts can hit 50%+. Match your real
            channel mix or you&apos;ll mis-forecast margin.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> Glovo and Wolt commission schedules
            (PL 2024), KPMG delivery-economics reports, Polish casual-Italian
            channel-mix surveys.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> platform-driven demand
            (delivery might be 30% of revenue but 60% incremental — without
            Glovo those orders might not exist at all). Test by toggling
            the lever off and comparing total order volume against your
            actuals.
          </p>
        </Methodology>
      </>
    ),
  },

  // Weather + calendar
  ingredientLevers: {
    title: "Ingredient cost stress tests",
    body: (
      <>
        <p>
          Ten recipe + supplier &quot;what ifs&quot; that flex the
          base-pizza COGS. Each lever has a share-of-COGS weight and
          a cost-change delta.
        </p>
        <InstitutionalAnalysis>
          <ul style={{ margin: "0 0 6px", paddingLeft: 18 }}>
            <li>
              <strong>Share of COGS</strong> — fraction of base-pizza
              food cost this ingredient represents. Calibrate to your
              actual recipe (mozz ~28%, tomato ~10%, flour ~6%, etc).
            </li>
            <li>
              <strong>Cost change</strong> — +20% = supplier raised
              prices 20% or recipe uses 20% more. −10% = cheaper
              supplier or trimmed portion.
            </li>
          </ul>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Impact = share × delta</strong>, applied to base-
            pizza COGS only. A 25% cheese line at +10% lifts total
            base-pizza COGS by 2.5 pp. Attach items (coffee, dessert
            etc) keep their own COGS — the stress is recipe-localised,
            not menu-wide.
          </p>
          <p className="v2-muted text-sm" style={{ margin: 0 }}>
            Toggle individual levers to isolate an ingredient&apos;s
            elasticity; use <em>All off</em> in the card header to
            clear every stress test.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Cheese is the single biggest line in your food cost — usually
            <strong> ~28% of all ingredients</strong>. If your mozzarella supplier raises
            prices 10%, it doesn&apos;t sound like much, but it lifts your total food
            cost by ~2.8 percentage points. On a 200,000 zł/month truck that&apos;s
            <strong> ~5,600 zł of profit gone</strong> unless you switch suppliers or
            trim portions. Use these levers to plan for that before it happens.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Hedge the cheese line:</strong> annual contracts with
              two suppliers (50/50 split) buffer you against single-supplier
              shocks. Costs ~1% on average price; saves 8–12% in a spike year.
            </li>
            <li>
              <strong>Test cheaper alternatives blind:</strong> fior di latte
              vs buffalo, generic mozzarella vs branded — most customers
              can&apos;t tell. A blind taste test of 20 friends costs you
              ~100 zł of pizza and might save you 5,000 zł/year on cheese.
            </li>
            <li>
              <strong>Pre-buy in the dip:</strong> tomato prices peak summer,
              dip November–February. Buy 6 months of passata in Dec at the
              low — locks in cost, saves freezer space if you portion right.
            </li>
            <li>
              <strong>Recipe-redesign before price hikes hit:</strong> if a
              stress lever shows +10% cheese ruins your P&amp;L, develop a
              lighter-cheese recipe NOW (50 g less per pie) and have it
              ready to launch as &quot;our new lighter Margherita&quot;.
            </li>
            <li>
              <strong>Use the stress test for supplier negotiation:</strong>
              show the supplier the +10% scenario and what it costs you.
              Hard data wins discounts that vibes can&apos;t.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> per-ingredient pair of (share of base-pizza
            COGS, cost-change %). 10 levers cover: cheese, tomato, flour, oil,
            yeast, dough additives, premium toppings, paper goods, packaging,
            misc. Each is independently toggleable.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Formula:</strong> per-lever COGS impact = lever.share × lever.delta.
            Applied to base-pizza COGS only — attach items (coffee, drinks,
            etc.) keep their own COGS unaffected. All enabled levers sum.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Default shares (calibrate to your recipes):</strong>
          </p>
          <ul style={{ margin: "0 0 4px", paddingLeft: 18 }}>
            <li>Cheese 28%, tomato 10%, flour 6%, oil 3%</li>
            <li>Yeast 1%, dough additives 2%, premium toppings 15%</li>
            <li>Paper goods 4%, packaging 6%, misc 25%</li>
          </ul>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> Italian pizzeria recipe-cost data,
            Polish supplier price-index history 2020–2024, Eurostat
            food-price indices for stress-test ranges.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> substitution elasticity (if cheese
            spikes, you don&apos;t just pay more — you might switch type or
            cut portion). The model assumes recipe stays fixed at the new
            price. Use the lever to ask &quot;what if I do nothing?&quot;,
            then plan a counter-move.
          </p>
        </Methodology>
      </>
    ),
  },
  weatherOverview: {
    title: "Weather & calendar",
    body: (
      <>
        <p>
          Real-world volume isn&apos;t flat. Rainy days kill outdoor
          truck service; heatwaves drive patio crowds; Easter is closed;
          NYE is a peak. This block models all of it.
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: 0 }}>
            The levers compose into a single &quot;effective orders per
            day&quot; × &quot;effective days open&quot; pair that feeds
            the whole P&amp;L downstream. Annualised composite typically
            comes out to ~0.92× typed volume for Warsaw seasonality
            (rainy 30% × 0.75 + sunny 70% × 1.0, minus 1 holiday
            closure/mo, plus modest peak/event bonuses). The live
            preview at the card&apos;s bottom shows the composite
            impact. Master toggle in the header switches the whole
            adjustment on/off — useful for &quot;what does the P&amp;L
            look like ignoring seasonality?&quot; comparisons.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Weather isn&apos;t a feel-good factor — it directly changes your day. A
            rainy Tuesday in October can do <strong>35 orders</strong> when a sunny one
            does <strong>65</strong>. Over a month that&apos;s ~12,000 zł of revenue
            the calendar dictates, not your effort. Plan for it (rain awnings, delivery
            push, indoor seating) and you can claw most of it back.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Build a rainy-day playbook:</strong> auto-trigger Glovo
              promo + Instagram &quot;stay dry, we deliver&quot; story when
              forecast shows rain. Recovers 8–15% of lost walk-up.
            </li>
            <li>
              <strong>Hot-day prep checklist:</strong> chill extra spritz
              ingredients, stage outdoor furniture, schedule the extra staff
              member when forecast hits 25°C+. Don&apos;t miss the upside.
            </li>
            <li>
              <strong>Track weather vs orders weekly:</strong> overlay your
              POS daily orders with weather data — calibrate your multipliers
              every quarter from real data, not defaults.
            </li>
            <li>
              <strong>Pre-plan the holidays 90 days out:</strong> NYE menu,
              Valentine&apos;s booking system, Easter closure communications.
              Last-minute scrambles cost upside.
            </li>
            <li>
              <strong>Don&apos;t over-correct on bad weeks:</strong> one rainy
              week isn&apos;t a trend. Calibrate against monthly weather
              averages, not isolated events.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> 7 sub-levers — rainy-day multiplier &amp;
            share, heatwave bonus &amp; share, holiday closures, peak days &amp;
            multiplier, school-holiday lunch dip, event days. Each has its
            own (i) with full per-lever methodology.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>How it composes:</strong> the levers blend into an
            &quot;effective orders/day × effective days/month&quot; pair via
            a weighted average:
            <br />
            effective = base × (share×multiplier + (1−share)×1.0) for each
            lever, then composed across all levers.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Default calibration:</strong> Warsaw 2024 IMGW
            meteorological averages — ~30% rainy days, ~10% heatwave evenings
            in summer, ~12 fixed holiday closures/year (Easter, Christmas,
            Boże Ciało, 15 Aug, 1 Nov, 11 Nov, 1 May, 3 May).
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> IMGW (Polish meteorological service)
            climate averages, GUS holiday-calendar data, owner-operator
            surveys on weather-revenue correlation.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> weather extremes (snow days,
            heatwaves &gt;35°C that hurt rather than help). The model
            assumes mild Polish weather distribution; for
            mountain/coastal locations, override the defaults.
          </p>
        </Methodology>
      </>
    ),
  },
  rainyDay: {
    title: "Rainy-day elasticity",
    body: (
      <>
        <p>
          Two knobs: rainy-day multiplier (how much rain hurts volume,
          default 0.75 = −25%) and rainy share (% of days in a typical
          month with meaningful rain, Warsaw ~30%).
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: 0 }}>
            <strong>Combined effective multiplier</strong> = rainyShare
            × rainyMultiplier + (1 − rainyShare) × 1.0. So 0.30 × 0.75
            + 0.70 × 1.00 = 0.925 — the average month runs at 92.5%
            of theoretical volume just from rain. Multiplier 0.55-0.85
            depending on shelter (exposed truck dips deepest; covered
            indoor pitch barely 0.85). Rainy share 25-35% in PL
            (highest April-July and October-December per IMGW
            10-year averages).
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            When it pours, walk-up customers vanish — a <strong>0.55 multiplier</strong>
            means you do 45% less business on rainy days. On Warsaw&apos;s ~30% rainy
            days, that&apos;s a ~14% haircut on the whole month&apos;s revenue. Add a
            rain awning, push a &quot;rainy-day delivery&quot; promo and you might lift
            the multiplier to <strong>0.75</strong> — recovering
            <strong> ~9,000 zł/month</strong>.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Awning + heat lamps:</strong> a 4 m retractable awning
              + 2 patio heaters cost ~3,000 zł one-time. Pays back in
              ~2 months of recovered rainy-day revenue.
            </li>
            <li>
              <strong>Weather-triggered ad spend:</strong> set up automation
              that boosts Instagram Story budget when rain forecast hits
              80%+. Capture delivery demand the day it shifts.
            </li>
            <li>
              <strong>Indoor pickup zone:</strong> a dry covered area where
              walk-up customers can wait. Cuts the &quot;I&apos;m getting
              soaked, I&apos;ll skip it&quot; abandonment.
            </li>
            <li>
              <strong>Rainy-day combo:</strong> &quot;wet outside? warm
              pizza + hot espresso for 49 zł&quot; — promo only fires when
              weather API says &gt;5mm/h. Targeted offers convert better
              than blanket discounts.
            </li>
            <li>
              <strong>Verify with your POS data:</strong> the default 0.75
              multiplier is a starting point. Overlay 90 days of rainy vs
              dry day POS volume to calibrate to your specific pitch.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> rainy-day multiplier (volume on rainy
            vs dry days), rainy share (% of days in a typical month with
            meaningful rain). Two separate sliders.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Formula:</strong> effective multiplier = rainyShare ×
            rainyMultiplier + (1 − rainyShare) × 1.0. Applied to base
            orders/day. So 30% rainy × 0.75 + 70% × 1.0 = 0.925 → average
            month runs at 92.5% of theoretical volume just from rain.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Realistic range:</strong> multiplier 0.55–0.85 depending
            on shelter — exposed truck pitch dips deeper (0.55); covered
            indoor pitch barely 0.85. Rainy share 25–35% in PL (highest
            April-July and October-December).
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> IMGW Warsaw climate averages 2014-2024,
            owner-operator weather-correlation surveys.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> drizzle vs downpour distinction
            (a light shower might lift delivery 20%; a thunderstorm kills
            both walk-up AND delivery). The model treats &quot;rainy&quot;
            as a single category — calibrate the multiplier to your
            blended rain experience.
          </p>
        </Methodology>
      </>
    ),
  },
  heatwave: {
    title: "Heatwave bonus",
    body: (
      <>
        <p>
          Hot patio evenings (25 °C+) drive +40% volume — people stay out
          longer, eat lighter, drink more. Tune the multiplier and the
          share of evenings hot enough to fire it (~10% Warsaw annual,
          ~30% Jun-Aug).
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: 0 }}>
            <strong>Stacks on top of the quarterly summer multiplier</strong>
            — the heatwave bonus models the hot-evening micro-effect,
            while the summer seasonality covers the broad Jun-Aug
            uplift. Multiplier 1.20-1.60 depending on outdoor seating
            capacity: truck with no patio ~1.10 (delivery uptick only);
            8-seat patio 1.30; 20+ seat patio 1.50+. Climate-change
            creep: PL heatwave share has crept up 2-4 pp/decade per
            IMGW data — future-proof by building outdoor capacity now.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            When it hits 28°C+, people stay out longer, order spritzes, and bring
            friends. A normal Tuesday doing <strong>50 orders becomes 70</strong>.
            Across summer that&apos;s ~2,000 extra orders ≈
            <strong> ~140,000 zł of revenue</strong> — easily worth buying more patio
            chairs, chilling extra wine and rostering one more staff member for hot
            evenings.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Pre-stock for the heatwave:</strong> Aperol, prosecco,
              spritz glasses, ice — check inventory weekly Jun-Aug. Running
              out of Aperol at 30°C is leaving 1,000+ zł on the patio.
            </li>
            <li>
              <strong>Outdoor seating multiplier:</strong> add cheap café
              tables when forecast shows 25°C+. Each extra 4-seater fills
              twice per evening = 8 covers × 75 zł ≈ 600 zł / table /
              evening.
            </li>
            <li>
              <strong>Cold-drink prep:</strong> chill the prosecco bottles
              in advance — warm spritz is a complaint. Buy a dedicated
              under-counter fridge if you don&apos;t have one.
            </li>
            <li>
              <strong>Heatwave staffing:</strong> add a runner +1 server
              for hot evenings. Faster service = more covers; slow service
              in heat = walkouts.
            </li>
            <li>
              <strong>Promote cooler dishes:</strong> push lighter pizzas
              (Margherita, prosciutto + arugula) over heavy meat ones in
              heat. Quicker to make, more appealing to hot customers.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> heatwave multiplier (volume on 25°C+
            evenings), heatwave share (% of evenings hot enough to trigger).
            Two separate sliders.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Formula:</strong> effective multiplier = heatwaveShare ×
            heatwaveMultiplier + (1 − heatwaveShare) × 1.0. Applied to base
            orders/day during the relevant season — stacks ON TOP of the
            quarterly summer seasonality multiplier (separate field).
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Realistic range:</strong> multiplier 1.20–1.60 depending
            on outdoor seating capacity. Truck with no patio: 1.10
            (delivery uptick only); 8-seat patio: 1.30; 20+ seat patio: 1.50+.
            Share 8–15% across the year (mostly Jun-Aug evenings).
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> IMGW Warsaw 2014-2024 max-temperature
            distribution, hospitality-sector weather-revenue correlation
            studies.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> extreme heat (35°C+ hurts
            instead of helping — cooks struggle, customers stay indoors with
            AC). The model assumes a moderate heatwave (25-32°C). For PL
            this is fine; for southern Europe, override the multiplier
            curve.
          </p>
        </Methodology>
      </>
    ),
  },
  holidayClosed: {
    title: "Holiday closed days / month",
    body: (
      <>
        <p>
          Days each month you&apos;re forced closed by the calendar —
          Easter Sunday, 15 August, 25 December, Boże Ciało (Corpus
          Christi), 1 November. About 12 closed days/yr ÷ 12 ≈ 1/month.
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: 0 }}>
            <strong>Effect:</strong> reduces effective days open. At 28
            typical days, losing 1 day = ~3.6% of monthly revenue. The
            net hit is higher than the gross share suggests because
            fixed costs (rent, accountant) don&apos;t scale down with
            the closure — per-open-day fixed burden grows. Some PL
            gastronomic units DO trade on standard holidays (no legal
            prohibition for restaurants); the question is whether the
            premium volume justifies the staff overtime and supplier
            availability.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Every closed day is a hole in the month — 28 normal days vs 27 means
            <strong> 3.6% of monthly revenue gone</strong>. Losing 2 closed days (Easter
            + 15 August) on a 200,000 zł truck costs ~14,000 zł. If you can&apos;t open
            (staff legally off, suppliers closed), plan a tourist-area pop-up the day
            before to capture some of that demand early.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Push the day-before promo:</strong> &quot;closed tomorrow
              for Easter — stock up tonight&quot;. Lifts the previous evening
              by 15-25% as customers pre-buy.
            </li>
            <li>
              <strong>Check if you legally CAN open:</strong> some PL holidays
              (Easter Sunday, 1 May, 11 Nov) have trading restrictions for
              certain business types. Confirm with your accountant — if
              you can open, your competition probably won&apos;t.
            </li>
            <li>
              <strong>Holiday-special menu the day before:</strong> Christmas
              Eve carp-free pizza? Easter brunch combo? Frame it as a
              destination so people come on the DAY BEFORE the closure.
            </li>
            <li>
              <strong>Reduce closures by rotating staff:</strong> if you
              MUST close because of staff legal rest, see if a rotating
              schedule keeps the truck open across all 12 closures with
              the same team headcount.
            </li>
            <li>
              <strong>Use the closure for big-prep:</strong> deep-clean,
              equipment service, dough trial-batches. Otherwise lost
              revenue is also lost prep time.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> number of forced-closure days per month
            (slider). Default 1 (~12/year ÷ 12).
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Formula:</strong> effective days/month = base days
            × ((daysOpen − holidayClosed) ÷ daysOpen). E.g. 28 base − 1
            holiday = 27 effective → 96.4% of monthly volume.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Polish fixed-closure calendar:</strong>
          </p>
          <ul style={{ margin: "0 0 4px", paddingLeft: 18 }}>
            <li>1 Jan (New Year), 6 Jan (Epiphany)</li>
            <li>Easter Sunday + Monday (movable)</li>
            <li>1 May, 3 May (Constitution Day)</li>
            <li>Boże Ciało / Corpus Christi (movable, 60 days after Easter)</li>
            <li>15 Aug (Assumption), 1 Nov (All Saints), 11 Nov (Independence)</li>
            <li>25 Dec, 26 Dec (Christmas)</li>
          </ul>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> Polish labour code (Kodeks Pracy)
            holiday calendar, GUS official non-working-days list.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> distinction between &quot;closed
            by law&quot; vs &quot;closed by choice&quot; (some pizzerias
            DO open on Easter or 15 Aug). If you plan to operate on
            standard holidays, set this to 0 and let revenue flow.
          </p>
        </Methodology>
      </>
    ),
  },
  holidayPeak: {
    title: "Peak days",
    body: (
      <>
        <p>
          Calendar days that run hot: NYE, Valentine&apos;s, Mother&apos;s
          Day, Father&apos;s Day, Halloween, Black Friday. Configure
          count per month + a peak multiplier (default 1.60 = +60%).
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: 0 }}>
            <strong>Asymmetric upside, asymmetric staffing risk.</strong>{" "}
            5 peak days/yr at 1.6× ≈ one extra normal day&apos;s revenue
            per year added to the average. Worth investing in extra
            staffing on those nights: under-staffing the peak costs more
            (blown service to 30+ couples on Valentine&apos;s) than the
            extra labor ever does. Capacity ceiling caveat: if your
            kitchen saturation maxes at 1.4× normal, the modelled 1.6×
            multiplier over-states upside — cross-check against the
            kitchen saturation KPI before staffing.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Valentine&apos;s Day on a Friday can do <strong>2–3× a normal Friday</strong>
            — couples book early, share a bottle, dessert is non-negotiable. Five peak
            days at 1.6× across the year are worth an extra full week of revenue.
            Don&apos;t be cute about staffing them: over-staff and the upside is huge,
            under-staff and you blow the line and lose 30+ angry customers in one night.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Book reservations 14 days out:</strong> Valentine&apos;s,
              Mother&apos;s Day, NYE — open a booking link two weeks ahead.
              Eliminates the no-show + walk-in chaos.
            </li>
            <li>
              <strong>Pre-fix special menus:</strong> a 4-course Valentine&apos;s
              tasting at 89 zł/person beats à-la-carte chaos — faster
              kitchen throughput, higher ticket, easier to plan supplies.
            </li>
            <li>
              <strong>Over-staff peak days deliberately:</strong> +1 cook, +1
              server, +1 runner. Under-staff costs more than the labor
              overrun ever does.
            </li>
            <li>
              <strong>Pre-prep more dough:</strong> a peak day can run 2×
              your dough. Pre-portion + cold-prove the day before — saves
              35-45 min of fresh-dough waiting.
            </li>
            <li>
              <strong>Plan the peak calendar 90 days out:</strong> mark
              Valentine&apos;s, Mother&apos;s/Father&apos;s Day, Halloween,
              Black Friday, NYE in admin. Each gets a unique menu + staffing
              + comms plan.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> number of peak days per month (default
            ~0.4, i.e. ~5/year ÷ 12), peak multiplier (default 1.60 = +60%
            volume).
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Formula:</strong> peak contribution =
            (peakDaysPerMonth × peakMultiplier + (daysOpen − peakDays) × 1.0)
            ÷ daysOpen. Multiplies through base orders/day for the month.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Common Polish peak days:</strong> 14 Feb
            (Valentine&apos;s), 26 May (Mother&apos;s), 23 Jun
            (Father&apos;s), 31 Oct (Halloween), Black Friday weekend,
            31 Dec (NYE), bank-holiday-eve Fridays.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Realistic range:</strong> multiplier 1.30–2.50
            depending on event. Valentine&apos;s on a Friday: 2.0-2.5×.
            NYE: 1.5-2× (early dinner only). Random Halloween Tuesday:
            1.20-1.40×.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> POS data from Italian-style PL
            chains (Da Grasso, Pizza Hut PL), holiday-dining surveys,
            owner-operator peak-day reports.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> capacity constraints on peak
            days (a 2× peak day might be limited by kitchen throughput,
            not demand). The model assumes you can serve the multiplier;
            if your oven caps at 60 pizzas/hr, the peak gets clipped.
          </p>
        </Methodology>
      </>
    ),
  },
  schoolHoliday: {
    title: "School-holiday lunch dip",
    body: (
      <>
        <p>
          Jul-Aug: schools closed, offices half-empty, lunch covers drop.
          Default multiplier 0.85 = 15% lunch haircut for those two months
          (the simulator averages 2/12 of the year for the headline).
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: 0 }}>
            <strong>Counter-balance:</strong> tourists and outdoor
            festival evenings often more than offset the lunch drop —
            make sure the summer seasonal multiplier reflects both
            effects so you don&apos;t double-count. Pitch-type modifies
            the multiplier: office-heavy pitch (Mokotów / Wola) 0.70
            (deep dip); tourist-heavy (Old Town / Kazimierz) 0.95+
            (might invert); residential 0.85 (medium).
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            When schools close in July–August, the office lunch crowd vanishes — your
            12:00–14:00 covers can drop <strong>30%</strong> even though evenings stay
            strong. Don&apos;t fight it with discounts; cut lunch staffing by one head
            instead, save <strong>~2,500 zł/month in labor</strong>, and pour the
            energy into evening service when the tourists arrive.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Cut lunch headcount Jul-Aug:</strong> remove one
              staff per lunch shift. Saves ~2,500 zł/month without
              hurting service if covers really did drop 30%.
            </li>
            <li>
              <strong>Pivot to tourist crowds:</strong> bilingual menu,
              Instagram-friendly Margherita with basil leaf, English-speaking
              staff. Tourist evenings often EXCEED office lunch revenue.
            </li>
            <li>
              <strong>Catering / corporate-event push:</strong> offices still
              run summer team-building. Build a catering offer (10 pizzas
              delivered for 580 zł). Captures the displaced lunch crowd
              in batch.
            </li>
            <li>
              <strong>Shorter summer lunch hours:</strong> 12:00-13:30 instead
              of 12:00-15:00. Same revenue, half the labor.
            </li>
            <li>
              <strong>Plan a summer menu refresh:</strong> lighter items
              (insalata, prosciutto with melon), aperitivo-led evenings.
              Use the dip as an excuse to seasonally rotate.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> single multiplier (default 0.85 = 15%
            lunch volume haircut). Applies only to Jul-Aug; the simulator
            averages across the 2/12 months of the year for the headline
            monthly figure.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Formula:</strong> effective summer monthly = base
            × (multiplier × 2/12 + 1.0 × 10/12). So a 0.85 multiplier
            = ~97.5% of theoretical annual volume just from the
            lunch-dip effect.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Realistic range:</strong> 0.70-0.95. Office-heavy
            pitch (Mokotów, Wola): 0.70 (deep dip). Tourist-heavy
            (Old Town, Kazimierz): 0.95+ (might even invert if
            tourist evenings dominate). Residential: 0.85 (medium).
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> Polish gastronomic-sector
            seasonality data, Warsaw office-vacancy reports, owner-operator
            summer-revenue surveys.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> the offsetting summer
            tourist evening bump (which the quarterly summer multiplier
            handles separately). Don&apos;t double-count — if you&apos;ve
            already set summer ×1.15 in the seasonality card, the school
            holiday dip should net to a smaller effect.
          </p>
        </Methodology>
      </>
    ),
  },
  eventDays: {
    title: "Event days",
    body: (
      <>
        <p>
          Days when the pitch hosts a street fair, food-truck rally,
          Nocny Market, concert, sports event. Configure count per month
          + multiplier (default 1.50 = +50%).
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: 0 }}>
            <strong>Booked upside vs operational drag.</strong> Unlike
            peak days (which arrive on the calendar), event days are
            elective — you choose which festivals to vendor. Small
            street fair 1.3-1.5×; food-truck rally 1.6-2.0×; major
            festival 2.0-3.0×; concert / sports with captive audience
            2.5-4.0×. Subtract vendor fees (3-10k zł/event), permits,
            and event-day overtime before celebrating — some festivals
            net less than a normal Saturday once the fee + transport +
            spoilage risk is in.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            A food-truck rally weekend can do <strong>1.5–3× a normal day</strong> with
            the same staff and the same pizzas. Two event days per month at 2.0× nets
            you <strong>~25,000 zł of extra revenue</strong>. Pay attention to where
            the events are — chasing them is a real strategy, not a side hustle, and
            some trucks earn 30% of their annual revenue from 20 weekends.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Book event slots 6 months out:</strong> the best
              festivals (Nocny Market, Mazury Hip Hop, OFF Festival) book
              vendors way ahead. Don&apos;t wait for last-minute slots —
              they go to the lowest-quality trucks.
            </li>
            <li>
              <strong>Calculate per-event ROI:</strong> some festivals
              charge 3-8k zł vendor fee. Run the numbers: at 2× multiplier
              and 200k base monthly, you need ~7,000 zł of net upside for
              a 5k fee to pay back.
            </li>
            <li>
              <strong>Event-specific menu:</strong> simpler, faster pizzas
              (3-4 SKUs max). 8-min ticket times at events vs 12 at the
              truck. Customers tolerate less wait outdoors.
            </li>
            <li>
              <strong>Cash + card both:</strong> events still see lots of
              cash. Have backup payment options — a broken card terminal
              at 2× volume is a disaster.
            </li>
            <li>
              <strong>Plan crew rotation:</strong> 12-hour event days
              destroy a single team. Two shifts (day + evening crew) with
              an overlap helps maintain quality through the rush.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> number of event days per month
            (typically 1-4), event multiplier (default 1.50 = +50%
            volume). Configure higher (2.0-3.0×) if you have specific
            festival bookings.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Formula:</strong> identical structure to peak-days
            lever: effective = (eventDays × eventMultiplier + (daysOpen
            − eventDays) × 1.0) ÷ daysOpen. Multiplies through orders/day.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Realistic events for a PL pizza truck:</strong>
            food-truck rallies (Nocny Market — Warsaw), street fairs (Open
            Mokotów), Christmas markets (Dec), summer concerts at parks,
            festival bookings (OFF, Krakow Live, Selector).
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> Polish food-truck association event
            calendars, vendor-revenue surveys at major festivals,
            owner-operator interviews on event chasing strategy.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> event vendor fees (booth rental,
            permits, electricity hookup). Subtract these from the event
            revenue before celebrating — a 5k zł vendor fee plus 2k zł of
            event-specific costs needs ~7k zł of net margin to break even.
          </p>
        </Methodology>
      </>
    ),
  },

  // Outputs
  pnlBreakdown: {
    title: "P&L breakdown",
    body: (
      <>
        <p>
          The classic top-down profit statement: revenue down through
          ingredients, labor and fixed to net profit.
        </p>
        <InstitutionalAnalysis>
          <ol style={{ margin: "0 0 6px", paddingLeft: 18 }}>
            <li><strong>Revenue</strong> — orders × ticket × days × weather/event multipliers</li>
            <li><strong>− Ingredients (COGS)</strong> — food cost net of attach + ingredient stresses</li>
            <li><strong>= Gross profit</strong></li>
            <li><strong>− Labor</strong> — drilled down by role, 1.22× brutto ZUS gross-up</li>
            <li><strong>− Fixed costs</strong> — rent, software, accountant, owner ZUS</li>
            <li><strong>− Variable leakage</strong> — payment fees, waste, refunds, loyalty burn</li>
            <li><strong>= Pre-tax profit → CIT → Net profit / (loss)</strong></li>
          </ol>
          <p style={{ margin: 0 }}>
            The sentence below the table reports the margin-of-safety
            in orders/day — &quot;5.2 above&quot; = 5.2 more orders/day
            than the minimum to break even. Below 10% MoS, one bad
            week wipes you; 20%+ is comfortable. Each P&amp;L line
            should be benchmarked vs PHG/NRA targets; the
            operationsKpis strip flags red/amber/green automatically.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Think of the P&amp;L as a stack of glasses: revenue pours in at the top,
            each cost is a glass that catches some, and net profit is what reaches the
            bottom one. If the top glass holds <strong>200,000 zł</strong> and the
            bottom one holds <strong>20,000 zł</strong>, then every złoty of waste,
            theft or schedule bloat steals from that last 10%. Watch what spills along
            the way — that&apos;s where the money lives.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Review monthly, not weekly:</strong> a single week is
              too noisy to act on. Compare month-over-month — variances of
              &gt;3 pp on any line need investigation.
            </li>
            <li>
              <strong>Watch prime cost (COGS + labor):</strong> together
              should be ≤60% of revenue. Above 65% you&apos;re losing money
              even at full capacity. The two together is more telling than
              either alone.
            </li>
            <li>
              <strong>Net margin target:</strong> 8-12% for casual-Italian
              in Poland. Below 5% you&apos;re running a charity; above 15%
              you&apos;re probably underpaying staff or accounting for
              owner labor wrong.
            </li>
            <li>
              <strong>Compare to break-even regularly:</strong> the
              &quot;5.2 above&quot; sentence below the table shows your
              safety margin. Below 2 orders/day above is too thin.
            </li>
            <li>
              <strong>Run the P&amp;L sensitivity:</strong> what happens at
              −15% revenue? At +20% rent? Use the Sensitivity card — it
              shows which inputs the bottom line is most fragile to.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> everything from the Scenario, Behaviour
            and Weather cards flows here. The P&amp;L is a read-only
            aggregation — change any input above and watch every line move.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Formulas (top-down):</strong>
          </p>
          <ul style={{ margin: "0 0 4px", paddingLeft: 18 }}>
            <li>Revenue = orders × ticket × days × weather/event multipliers</li>
            <li>COGS = revenue × effective COGS% (incl. attach &amp; ingredient stresses)</li>
            <li>Gross profit = revenue − COGS</li>
            <li>Labor = Σ(headcount × hours × 4.345 × rate × 1.22)</li>
            <li>Net profit = gross profit − labor − fixed costs − misc</li>
            <li>Break-even orders/day = fixed ÷ (ticket × (1 − COGS%) × days)</li>
          </ul>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> standard restaurant accounting
            (Schmidgall, &quot;Hospitality Industry Managerial Accounting&quot;),
            Polish UoR (Ustawa o Rachunkowości) gastronomic reporting
            standards.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> CIT (corporate income tax) and
            VAT timing — handled by the separate CIT-rate field. Also no
            depreciation by default (use the Depreciation field if you
            have CAPEX to amortise).
          </p>
        </Methodology>
      </>
    ),
  },
  costShare: {
    title: "Cost share pie",
    body: (
      <>
        <p>
          Where each złoty goes. The fastest weekly diagnostic in the
          business.
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: "0 0 6px" }}>
            Healthy Polish casual-Italian truck composition:
          </p>
          <ul style={{ margin: "0 0 6px", paddingLeft: 18 }}>
            <li>~30% ingredients (COGS)</li>
            <li>~28% labor (incl. 22% ZUS gross-up)</li>
            <li>~8% fixed costs (rent, accountant, software)</li>
            <li>~2% card fees + 4-5% variable leakage</li>
            <li>~28% net profit (pre-CIT)</li>
          </ul>
          <p style={{ margin: 0 }}>
            Any slice bloating past ~32% is the first place to drill.
            COGS → recipe costs or portion drift. Labor → schedule bloat
            or under-pricing. Fixed → rent escalator or unbounded
            software subscriptions. Don&apos;t raise prices to fix a
            cost problem — diagnose the slice first.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            If any slice of the pie balloons past <strong>32%</strong>, you have your
            culprit. <strong>Labor too big?</strong> You&apos;re overstaffed for the
            volume. <strong>Food too big?</strong> Recipes leak or portions are sloppy.
            The pie is the fastest &quot;where did the money go?&quot; diagnostic in the
            business — glance at it weekly and you&apos;ll catch problems before they
            cost a month of profit.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Screenshot the pie weekly:</strong> save it Monday
              morning. Compare week-over-week. Visible drift on any slice
              is your early-warning signal.
            </li>
            <li>
              <strong>If COGS bloats:</strong> first check the Recipes admin
              for price drift. Then weigh actual portions. Then audit
              waste.
            </li>
            <li>
              <strong>If labor bloats:</strong> overlay the hourly heatmap
              with your schedule. Cut the over-staffed hour — almost
              always 14:00-16:00 or after 21:00.
            </li>
            <li>
              <strong>If fixed costs bloat:</strong> something one-off
              (insurance renewal, software upgrade) or something is
              compounding (rent escalator, new ZUS rate). Audit line by
              line.
            </li>
            <li>
              <strong>Net profit slice &lt; 8%?</strong> Don&apos;t panic-cut
              — diagnose which slice expanded. Pricing problems and cost
              problems have different fixes.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> the same monthly P&amp;L lines feed
            this. Each slice = (line item ÷ revenue) × 100%. The chart
            renders top-5 categories plus a &quot;misc&quot; rollup.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Healthy Polish casual-Italian shares:</strong>
          </p>
          <ul style={{ margin: "0 0 4px", paddingLeft: 18 }}>
            <li>Ingredients (COGS) ~28-32%</li>
            <li>Labor ~25-30%</li>
            <li>Fixed costs ~6-10%</li>
            <li>Card fees + packaging ~3-5%</li>
            <li>Net profit ~25-32%</li>
          </ul>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> NRA (National Restaurant Association)
            benchmarks, Polish PHG hospitality reports, owner-operator
            P&amp;L composites.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> CIT (separate field), founder
            opportunity cost (the unpaid hours of the owner). If you do
            30 hours/week unpaid, mentally subtract ~5,000 zł/month from
            net to value your time honestly.
          </p>
        </Methodology>
      </>
    ),
  },
  operationsKpis: {
    title: "Operations KPIs",
    body: (
      <>
        <p>
          The eight numbers professional restaurateurs watch every week
          — the institutional ops dashboard.
        </p>
        <InstitutionalAnalysis>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Food cost % revenue</strong> — ingredient discipline.
              Target ≤ 30%; &gt; 32% = recipe leakage or under-pricing.
            </li>
            <li>
              <strong>Labor % revenue</strong> — target ≤ 30%; &gt; 35% =
              over-staffed or under-priced.
            </li>
            <li>
              <strong>Prime cost %</strong> — COGS + labor. The single
              most-watched number in the industry. ≤ 60-65% healthy.
            </li>
            <li>
              <strong>Contribution margin</strong> — revenue after ALL
              variable costs (COGS, fees, waste, refunds, loyalty).
              &lt; 40% = structurally unprofitable; ≥ 50% healthy.
            </li>
            <li>
              <strong>Margin of safety</strong> — revenue cushion above
              break-even. &lt; 10% one bad week wipes you; ≥ 25% comfortable.
            </li>
            <li>
              <strong>Revenue per labor hour</strong> — staff productivity.
              90-140 zł/h PL casual-Italian norm.
            </li>
            <li>
              <strong>Net profit per order</strong> — bottom-line buffer
              per ticket. &lt; 5 zł = no margin for refunds or waste.
            </li>
            <li>
              <strong>Setup payback</strong> — months of profit to recoup
              buildout. Investor-grade: &lt; 24 months.
            </li>
          </ul>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            These eight numbers are what a pro restaurateur stares at on Monday
            mornings. <strong>Prime cost</strong> is the one to know: food + labor as %
            of revenue. Under 60% you breathe; at 65% you&apos;re working for the staff;
            at 70% you close. Each <strong>1 percentage point</strong> you cut at
            typical volumes is <strong>~2,000 zł more profit/month</strong> — same
            sales, same menu, just tighter ops.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Set thresholds for alerts:</strong> red flag when
              prime cost &gt; 65%, food &gt; 32%, labor &gt; 32%. Build
              alert automations on the Reports admin so you find out
              within 24h, not at month-end.
            </li>
            <li>
              <strong>Weekly KPI review:</strong> 30 min every Monday with
              the head chef + manager. Five-minute version of each KPI,
              plus &quot;what we&apos;ll do this week&quot;. Catches
              drift before it&apos;s structural.
            </li>
            <li>
              <strong>Revenue per labor hour is the productivity dial:</strong>
              below 90 zł/h, you&apos;re either overstaffed or under-pricing.
              Drill into shift schedules first.
            </li>
            <li>
              <strong>Setup-payback &lt; 24 months is investor-grade:</strong>
              if you&apos;re raising money, this is the single number
              investors will judge you on. Get it under 18 months for
              competitive deals.
            </li>
            <li>
              <strong>Compare to industry KPIs publicly:</strong> NRA, BCG
              and PHG publish quarterly benchmarks. If you&apos;re top
              quartile on prime cost, talk to suppliers and franchisees —
              you&apos;re doing something replicable.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> all KPIs derive from the P&amp;L lines
            + scenario inputs. The KPI strip is read-only and updates live
            as you tune anything above.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Formulas:</strong>
          </p>
          <ul style={{ margin: "0 0 4px", paddingLeft: 18 }}>
            <li>Food cost % = COGS ÷ revenue</li>
            <li>Labor % = total labor ÷ revenue</li>
            <li>Prime cost % = (COGS + labor) ÷ revenue</li>
            <li>Contribution margin = (revenue − all variable costs) ÷ revenue</li>
            <li>Margin of safety = (revenue − break-even revenue) ÷ revenue</li>
            <li>Revenue/labor hr = revenue ÷ total labor hours</li>
            <li>Net profit/order = net profit ÷ monthly orders</li>
            <li>Setup payback = setup cost ÷ monthly profit (months)</li>
          </ul>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Industry targets (Polish casual-Italian):</strong> food
            ≤30%, labor ≤30%, prime ≤60%, contribution ≥50%, MoS ≥20%,
            rev/labor 90-140 zł/h, payback &lt;24 mo.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> NRA Restaurant Industry Operations
            Report, BCG hospitality benchmarks, PHG Polish gastronomic
            association annual surveys.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> seasonal variance — KPIs at
            average annual volumes can hide that winter prime cost is
            68% and summer is 55%. Check the Heatmap card to spot
            seasonality issues.
          </p>
        </Methodology>
      </>
    ),
  },
  archetypes: {
    title: "Conservative / Realistic / Optimistic",
    body: (
      <>
        <p>
          Three side-by-side P&amp;L runs built automatically from your
          current inputs ± a deterministic stress factor.
        </p>
        <InstitutionalAnalysis>
          <ul style={{ margin: "0 0 6px", paddingLeft: 18 }}>
            <li>
              <strong>Conservative</strong> — −15% orders + 2pp worse
              COGS. &quot;What if everything goes a bit wrong?&quot;
            </li>
            <li>
              <strong>Realistic</strong> — current scenario as entered.
            </li>
            <li>
              <strong>Optimistic</strong> — +15% orders + 2pp better
              COGS. &quot;What if we execute well?&quot;
            </li>
          </ul>
          <p style={{ margin: 0 }}>
            <strong>Decision frame:</strong> Conservative-still-profitable
            is the institutional gate for raising capital — investors
            won&apos;t back a plan that only works in best case.
            Optimistic-not-much-better-than-Realistic signals a
            structural ceiling (small oven, limited seating, capped
            attach headroom) — fix the model, not the marketing.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Three runs side by side: <em>&quot;a bit worse&quot;</em>, <em>&quot;as
            expected&quot;</em>, <em>&quot;a bit better&quot;</em>. If your
            <strong> Conservative</strong> case still makes money, your plan is robust
            and you can sleep. If <strong>Optimistic</strong> isn&apos;t much better
            than Realistic, you&apos;re hitting a ceiling (small oven, limited seating)
            — growth requires capex, not more elbow grease.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Conservative must be profitable:</strong> if the
              −15% scenario shows a loss, your plan is fragile. Either
              reduce fixed costs or raise prices BEFORE launching.
            </li>
            <li>
              <strong>Optimistic vs Realistic spread:</strong> if
              Optimistic is &lt;30% better than Realistic, you have a
              capacity ceiling. Investigate: oven capacity, seating,
              labor structure.
            </li>
            <li>
              <strong>Show investors the Conservative case:</strong>
              never present only Optimistic. The Conservative-still-profitable
              proof is what makes deals close.
            </li>
            <li>
              <strong>Use it for hiring decisions:</strong> if Conservative
              covers a new hire&apos;s 6-month cost, the hire is safe. If
              it doesn&apos;t, wait until Realistic improves.
            </li>
            <li>
              <strong>Re-run quarterly:</strong> assumptions drift.
              What was Optimistic last quarter might be Realistic now;
              what was Realistic might be Conservative. Refresh.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> the current scenario as Realistic; two
            programmatic variants (Conservative = base − 15% orders + 2pp
            COGS; Optimistic = base + 15% orders − 2pp COGS).
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Formula:</strong> identical P&amp;L stack applied
            independently to each variant&apos;s adjusted inputs. Shows
            three full P&amp;Ls side-by-side.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Why ±15%:</strong> empirically, a year-1 forecast for
            a new pizzeria misses by ±15-25%. ±15% captures &quot;normal
            execution variance&quot;; severe stress (recession, location
            failure) needs the separate Cheapest-Pizza Shift lever.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> startup forecasting literature
            (Saras Sarasvathy on effectuation, Steve Blank on
            customer-development), restaurant-industry post-mortem
            reviews on forecast accuracy.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> simultaneous swings (Conservative
            on revenue AND a rent shock AND a key staff departure). For
            true worst-case planning, manually compose scenarios using
            the Stress card.
          </p>
        </Methodology>
      </>
    ),
  },
  heatmapOrders: {
    title: "Orders × Ticket heatmap",
    body: (
      <>
        <p>
          5×5 grid of net profit at every combination of orders/day
          (X axis, ±30%) and avg ticket (Y axis, ±30%). Centre cell =
          current scenario.
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: 0 }}>
            <strong>How to read:</strong> green = profitable, red =
            loss. Move from centre outward to answer &quot;volume vs
            price — which lever has higher NPV?&quot;. Counter-intuitively
            for most casual-Italian operations, ticket-led growth
            dominates volume-led growth on a per-pp basis: +5% ticket
            adds revenue with zero additional COGS or labor scaling,
            while +5% volume scales variable food and packaging and
            often pushes labor into a new staffing tier. The diagonal
            cells are unrealistic (raising ticket usually loses
            volume) — use the Sensitivity card for linked effects.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Each square is &quot;what would I earn if I sold this many pizzas at this
            price?&quot;. Fastest read: pick the centre cell (today), then look which
            direction goes greenest. Sometimes it&apos;s <strong>selling more</strong>
            (extending hours, marketing); often it&apos;s <strong>charging more</strong>
            (a 2 zł price bump usually beats chasing 20% more volume).
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Read the diagonals:</strong> the upper-right corner
              (more orders AND higher ticket) is the dream — but rarely
              achievable simultaneously. Pick one axis to push.
            </li>
            <li>
              <strong>Ticket usually wins over volume:</strong> a 5 zł
              ticket bump on the same orders adds revenue with zero
              additional COGS or labor. Pushing volume adds labor and
              wear-and-tear.
            </li>
            <li>
              <strong>Test before you commit:</strong> if the heatmap says
              +10% ticket is huge, A/B-test a 5 zł price bump on one menu
              category for 2 weeks. Watch attach %, not just revenue.
            </li>
            <li>
              <strong>Red cells are warnings, not predictions:</strong>
              they show &quot;here&apos;s what would happen IF&quot;.
              They&apos;re directional, not forecasts.
            </li>
            <li>
              <strong>Use diagonally for marketing math:</strong> if you
              push volume +15% AND tickets bump −2 zł (because new
              customers convert at lower attach), the heatmap shows you
              if the net is positive.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> 5×5 grid with current orders/day and
            avg ticket at the centre. Each cell is a ±15% or ±30% delta
            in either axis.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Formula:</strong> per cell, recompute the full P&amp;L
            with the grid&apos;s orders/day and ticket substituted, all
            other inputs held constant. Cell value = net profit (zł/month).
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Color scale:</strong> green = above centre, red =
            below. Intensity scales with delta-from-centre, not absolute
            zł — designed to surface the steepest local gradients.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> standard restaurant menu-engineering
            (Kasavana &amp; Smith), revenue management analytics (cited
            in hospitality-school curricula).
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> the demand curve (raising
            ticket usually loses orders). Each cell is independent — in
            reality, +10% ticket might cost you 5% volume. Use the
            Sensitivity card if you want to model linked effects.
          </p>
        </Methodology>
      </>
    ),
  },
  heatmapCogs: {
    title: "Food cost % × Ticket heatmap",
    body: (
      <>
        <p>
          The menu-engineering view. X axis = food cost ratio (±8 pp);
          Y axis = avg ticket (±30%).
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: 0 }}>
            <strong>Use it to answer:</strong> &quot;cut food cost 2 pp
            or raise ticket 5 zł — which wins?&quot; Diagonal comparison
            across centre quantifies the trade-off. Cost cuts compound
            year-over-year (a permanent 2 pp COGS reduction is worth
            the same every future month), while price hikes work once
            and then require another cycle. Use Kasavana &amp; Smith
            menu-engineering: place high-CM items second-from-top to
            anchor decisions before reaching for the COGS lever.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Should you negotiate cheaper mozzarella or just raise the Margherita by 3
            zł? This grid answers in seconds. Pick the two cells you&apos;re choosing
            between — the colour difference is the profit difference, usually
            <strong> a couple of thousand zł/month</strong> per swap. The lazy answer
            (raise prices) often wins; the hard answer (renegotiate cheese) compounds
            for years.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Cost cuts compound, prices don&apos;t:</strong> a 2pp
              COGS cut today saves the same amount every year forward.
              A 5 zł price hike works once, then customers adjust.
            </li>
            <li>
              <strong>Use it before menu re-pricing:</strong> what looks
              like a tiny 2 zł bump might add 4-6k zł/month — the heatmap
              quantifies the upside before you commit.
            </li>
            <li>
              <strong>Combine with the Recipes admin:</strong> the heatmap
              says &quot;cut 2 pp COGS = +4k zł/month&quot;. The Recipes
              admin shows which ingredient is the soft target. Pair them.
            </li>
            <li>
              <strong>Watch the diagonal:</strong> cutting COGS AND
              raising ticket together compounds — but it&apos;s also the
              hardest combo to execute (customers notice both moves).
            </li>
            <li>
              <strong>Beware the worst-cell:</strong> bottom-left (high
              COGS, low ticket) is what an inflation spike + downturn
              looks like. Stress-test against it; if you survive there,
              you&apos;re fine.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> 5×5 grid with current COGS% and avg
            ticket at the centre. X axis = COGS% ±8 pp; Y axis = ticket
            ±30%.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Formula:</strong> per cell, recompute net profit with
            the grid&apos;s COGS% + ticket substituted, all other inputs
            held constant.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Why ±8 pp on COGS:</strong> empirical range of
            achievable supplier/recipe optimisation. Beyond ±8 pp,
            you&apos;re typically reformulating the menu, not optimising.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> menu-engineering literature
            (Kasavana &amp; Smith), restaurant cost-optimisation case
            studies.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> ingredient substitution
            elasticity (cutting COGS by switching to cheaper cheese
            might cost you 3% of customers). Each cell is independent;
            real cost cuts have customer-perception consequences.
          </p>
        </Methodology>
      </>
    ),
  },
  assumptionsCard: {
    title: "Financial assumptions",
    body: (
      <>
        <p>
          The drivers behind the 12-month projection and payback calc.
        </p>
        <InstitutionalAnalysis>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Wage inflation</strong> — annual % labor cost
              growth. PL 2026 ~7% (min-wage hike + sector pressure).
            </li>
            <li>
              <strong>Ingredient inflation</strong> — ~4% food CPI
              (GUS); applies to COGS + fixed CPI-indexed lines.
            </li>
            <li>
              <strong>Card processor fee</strong> — Stripe blended
              ~1.9% of card revenue; lower with negotiated tiers.
            </li>
            <li>
              <strong>Setup cost</strong> — vehicle + buildout +
              permits + working capital. Drives setup payback + CoC.
            </li>
            <li>
              <strong>Seasonal multipliers</strong> — winter / spring
              / summer / autumn volume swings. PL pizza trucks peak in
              summer (~1.3×) and dip hard in winter (~0.7×) for outdoor
              pitches.
            </li>
          </ul>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Inflation isn&apos;t a rumour — Poland is running ~7% wage hikes and ~4%
            food cost hikes every year. If you don&apos;t raise menu prices by ~5% every
            January, your margin shrinks by <strong>~2 percentage points/year</strong>.
            On a 200,000 zł/month truck that&apos;s <strong>~48,000 zł of profit gone in
            12 months</strong> — the projection chart below shows that drift live.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Plan an annual price review:</strong> January 15th
              every year. Match menu prices to last-year inflation. Customers
              accept small annual bumps; they revolt against big catch-up
              hikes.
            </li>
            <li>
              <strong>Index your prices to suppliers:</strong> if a key
              ingredient is up 10%, raise the relevant menu items 5-8%
              within 30 days. Don&apos;t absorb the full shock.
            </li>
            <li>
              <strong>Watch the min-wage announcement:</strong> Polish
              min-wage is published Sep for next year. Re-run the
              simulation with new labor rates before approving budgets.
            </li>
            <li>
              <strong>Lock seasonal staffing 90 days out:</strong>
              summer hires negotiated in March cost 10-15% less than
              June panic-hires.
            </li>
            <li>
              <strong>Set up an inflation-tracker dashboard:</strong>
              monthly GUS food-CPI overlay on your COGS%. Variance &gt; 1
              pp triggers a recipe-cost review.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> wage inflation %, ingredient inflation
            %, processor fee %, setup cost, 4 seasonal multipliers
            (winter/spring/summer/autumn).
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Formula (per month m, m=0..11):</strong>
            <br />
            labor_m = base_labor × (1 + wageInflation)^(m/12)
            <br />
            cogs_m = base_revenue × cogsPct × (1 + foodInflation)^(m/12) × seasonalMultiplier(m)
            <br />
            revenue_m = base_revenue × seasonalMultiplier(m)
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Polish 2026 calibration:</strong> wage 7% (min-wage
            jump + sector pressure), food 4% (GUS CPI), processor 1.9%
            (Stripe blended), seasonal {"["}winter 0.85, spring 1.05,
            summer 1.15, autumn 0.95{"]"}.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> GUS inflation reports, Polish
            min-wage announcements, Stripe published rates, Italian-style
            gastronomic seasonality studies.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> shock events (war-driven flour
            spike, sudden VAT change). Use it for steady-state planning;
            for shocks, manually adjust ingredient lever +20% and stress
            test.
          </p>
        </Methodology>
      </>
    ),
  },
  projection: {
    title: "12-month projection",
    body: (
      <>
        <p>
          Current scenario rolled forward 12 months — each month applies
          the seasonal multiplier and compounds wage + ingredient
          inflation to that point.
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: 0 }}>
            <strong>Watch for:</strong> the gap between Revenue and Net
            profit widening = inflation eating margin. If the gap closes
            by month 12, plan price increases now. The four KPIs (12-mo
            revenue / costs / net profit / best vs worst month) summarise
            the year. Use the best-vs-worst spread to size working
            capital — your reserve should cover the gap between peak
            cash month and trough cash month.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Twelve months in one chart. Watch the gap between the revenue line and the
            profit line — <strong>if it widens, inflation is eating you alive</strong>.
            If the gap narrows by December, you&apos;re running out of margin and need
            to raise prices or trim costs before year-end. Most operators discover this
            in January when the accountant calls; you&apos;ll see it in May.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Check the chart monthly:</strong> if month N&apos;s
              actuals diverge &gt;10% from the projection, recalibrate
              your inputs. The projection is only useful if it stays
              honest.
            </li>
            <li>
              <strong>Plan price hikes for the dip:</strong> if you see
              winter Q1 dipping near break-even, raise prices in
              November/December so the new price is established before
              the dip bites.
            </li>
            <li>
              <strong>Cash-flow plan from the chart:</strong> the
              best-vs-worst month delta is your buffer requirement. If
              December nets 30k and February nets 8k, you need ~22k of
              working capital to bridge.
            </li>
            <li>
              <strong>Plan capex around the peaks:</strong> buy the new
              oven in May with summer cash on the way, not in February.
            </li>
            <li>
              <strong>Investor presentations need this view:</strong>
              monthly seasonality is more honest than annual averages.
              Always show the chart, not just the total.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> all scenario fields + the financial
            assumptions (inflation, seasonality). The chart is read-only
            and updates live.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Formula:</strong> per month, apply the seasonal
            multiplier to base orders/day and compound the wage +
            ingredient inflation to that month&apos;s point. Recompute
            the full P&amp;L for each month.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Read-out KPIs:</strong> 12-mo revenue, 12-mo costs,
            12-mo net profit, best month, worst month. The best-vs-worst
            spread is your working-capital requirement.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> Polish gastronomic seasonality
            data, restaurant-industry cash-flow patterns, NRA Industry
            Operations Report.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> opening / closing months
            (ramp + wind-down). Projection assumes steady-state ops
            across all 12 months. For year-1 projections, manually
            ramp the first 3-6 months.
          </p>
        </Methodology>
      </>
    ),
  },
  breakEven: {
    title: "Break-even at multiple horizons",
    body: (
      <>
        <p>
          The minimum throughput needed to cover labor + fixed costs.
          At break-even, net = 0 — anything above is profit, below is
          loss.
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: "0 0 6px" }}>
            Expressed at four scales (hour, day, month, equivalent
            monthly revenue) so you can match it to whatever metric the
            team watches live during service.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Worked example:</strong> break-even 45 orders/day,
            running 60 → every order past 45 drops (ticket × (1 − COGS%
            − card fee % − waste − refunds − loyalty)) zł of pre-tax
            contribution. The margin-of-safety (60 − 45) ÷ 60 = 25% is
            the cushion. Below 10% MoS, one bad week wipes you out; ≥
            20% is comfortable for institutional review.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Below this number you bleed; above it, you print. If break-even is
            <strong> 45 orders/day</strong> and you sell <strong>60</strong>, the last
            15 pizzas drop ~22 zł each straight into the bank — that&apos;s
            <strong> ~330 zł/day, ~9,000 zł/month</strong> of &quot;free money&quot;,
            because the first 45 already paid the rent. Every order past break-even is
            wildly profitable; every order under it deepens the hole.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Know your break-even per hour:</strong> if break-even
              is 45 orders/day across a 10-hour service window, the
              break-even hour is 4.5 orders. Use this for live KDS
              dashboards.
            </li>
            <li>
              <strong>Track hourly above/below break-even:</strong> red
              hours (below break-even) might need consolidation. Blue
              hours (way above) need more capacity to capture upside.
            </li>
            <li>
              <strong>Don&apos;t cut to break-even:</strong> running RIGHT
              at break-even leaves no buffer for shocks. Build a 20%
              margin-of-safety floor below current revenue.
            </li>
            <li>
              <strong>Use it to plan investments:</strong> if a new
              oven costs 15k and you currently sell 5 more pizzas/day
              than break-even, it&apos;ll pay back in ~6 months at 22 zł
              of profit each.
            </li>
            <li>
              <strong>Break-even falls if you cut fixed costs:</strong>
              every 1,000 zł off fixed costs is ~1.5 fewer orders/day
              needed to break even. Sometimes lower break-even matters
              more than higher revenue.
            </li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Inputs:</strong> derived — fixed costs, labor, ticket,
            COGS%, days/month all feed here. The break-even card is
            read-only.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Formula:</strong>
            <br />
            contribution margin per order = ticket × (1 − COGS% −
            processor fee %)
            <br />
            break-even orders/month = (labor + fixed) ÷ contribution
            margin per order
            <br />
            break-even orders/day = break-even orders/month ÷ days/month
            <br />
            break-even orders/hour = break-even orders/day ÷ service hours
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Realistic range:</strong> 30-55 orders/day break-even
            for a Polish pizza truck depending on fixed costs and prime
            cost. Below 30 you have unusually low fixed costs (suburban
            pitch); above 55 you&apos;re structurally fragile.
          </p>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sources:</strong> standard break-even analysis
            (Garrison &amp; Noreen, &quot;Managerial Accounting&quot;),
            restaurant unit-economics textbooks.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Not modelled:</strong> step-function labor (going
            from 1 cook to 2 isn&apos;t a smooth scaling). Real labor
            jumps in discrete chunks; the model treats it as continuous.
            For accurate near-break-even planning, lock in your hire
            decisions and recompute.
          </p>
        </Methodology>
      </>
    ),
  },
  sensitivity: {
    title: "±20% volume sensitivity",
    body: (
      <>
        <p>
          Five &quot;what if&quot; runs that flex orders/day by −20%,
          −10%, 0, +10%, +20% and report the net profit / margin
          response.
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: 0 }}>
            <strong>Why it matters:</strong> profit is a thin slice of
            revenue (typical 10-15%), so volume swings amplify into
            profit swings — a 10% revenue drop wipes 60-70% of profit,
            not 10%. If a −10% volume drop tips you into the red,
            you&apos;re running too thin — raise prices, cut a fixed
            cost, or grow attach rates before opening. Below 20% margin
            of safety is institutionally unsuited for capex.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Profit is a thin slice of revenue — usually <strong>10–15%</strong>. So a
            <strong> 10% revenue dip wipes out 60–70% of profit</strong>, not 10%.
            If your −10% column tips into the red, you&apos;re running too close to the
            line: one bad week (food poisoning rumour, road closure, heat dome) closes
            the truck. Grow attach, raise prices, or cut a fixed cost before opening
            day 1.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Target a +20% buffer:</strong> if you can&apos;t survive a −10% volume hit, your plan is too fragile to launch.</li>
            <li><strong>Use −20% as your &quot;worst case&quot;:</strong> stress-test working capital against the red end of the curve.</li>
            <li><strong>Re-run after every fixed-cost change:</strong> rent hikes and software subscriptions silently raise your sensitivity.</li>
            <li><strong>Match marketing spend to the upside:</strong> if +10% volume nets ~6k zł more profit, you can spend up to ~3k on customer acquisition and still win.</li>
            <li><strong>Watch the convexity:</strong> +20% lift is rarely 2× the +10% lift (capacity caps in). Validate with your kitchen throughput.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> derived. The card runs the full P&amp;L 5 times with orders/day flexed by −20%, −10%, 0, +10%, +20%.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> for each variant: revenue × multiplier, COGS scales linearly, labor + fixed held constant, recompute net.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Why ±20%:</strong> empirically a year-1 forecast misses by ±20-30%. Captures &quot;normal-execution variance&quot; without modelling extreme stress (use Cheapest-Pizza Shift for that).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> restaurant forecasting accuracy studies, OECD sectoral volatility data.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> capacity caps (you can&apos;t serve +20% if the oven is already saturated). Cross-check with the kitchen-saturation KPI.</p>
        </Methodology>
      </>
    ),
  },

  // Financial assumptions
  wageInflation: {
    title: "Wage inflation (annual)",
    body: (
      <>
        <p>
          Annual % growth in labor cost, compounded monthly in the
          12-month projection. PL 2026 baseline: ~7%.
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: 0 }}>
            Reflects statutory minimum-wage hikes (MRiPS announces Sep
            for next year), sector wage pressure, and inflation-linked
            contract adjustments. The 7% PL benchmark = min-wage jump
            (4666 zł → ~5000 zł brutto) + sector premium + skill
            inflation for pizzaiolo / chef roles. Treat as floor: a
            shock year (mandatory bonus, ZUS rate change) can spike to
            10-12%. Productivity (revenue per labor hour) is the
            offset — 5% productivity lift cancels typical wage inflation.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Wages in Poland are rising <strong>~7% a year</strong>. If your
            labor bill is <strong>60,000 zł/month today</strong>, it&apos;ll be
            <strong> ~64,200 zł</strong> next year — that&apos;s
            <strong> ~4,200 zł more in costs every month</strong> for the same
            crew doing the same work. The projection bakes this in so you can
            see the squeeze coming before payroll Friday hits.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Update yearly (Oct/Nov):</strong> the Polish min-wage for next year is announced in September. Refresh this field before the Q4 review.</li>
            <li><strong>Match menu prices to wage inflation:</strong> if labor is 30% of revenue and wages rise 7%, menu prices need ~2.1% lift just to hold margin flat.</li>
            <li><strong>Productivity beats price hikes:</strong> a 5% lift in revenue/labor-hour offsets the entire wage inflation. Invest in oven speed, layout, training.</li>
            <li><strong>Lock multi-year contracts where possible:</strong> 12-month contracts with key staff give cost certainty (and reduce poach risk).</li>
            <li><strong>Reduce labor-intensive SKUs:</strong> if a hand-stretched pizza takes 4 min vs 2 min for a pre-portioned one, wage inflation compounds the gap. Re-engineer for speed.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> single annual % (default 7% for PL 2026).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> labor_m = base_labor × (1 + wageInflation)^(m/12). Compounded monthly across the 12-month projection.</p>
          <p style={{ margin: "0 0 4px" }}><strong>PL 2026 calibration:</strong> ~7% reflects: min-wage jump (4666 zł → ~5000 zł brutto), sector premium (gastro pays above min), inflation-linked salaries for skilled roles (pizzaiolo, chef).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> GUS wage-growth data 2020-2025, MRiPS min-wage announcements, ZUS-published sectoral averages.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> structural hikes (a new ZUS rate, mandatory bonus). The model assumes smooth annual growth; for shock years use ingredient lever to stress-test.</p>
        </Methodology>
      </>
    ),
  },
  ingredientInflation: {
    title: "Ingredient + fixed inflation (annual)",
    body: (
      <>
        <p>
          Annual growth rate applied monthly to COGS and fixed-cost
          lines. PL 2026 ~4%.
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: 0 }}>
            Captures food-CPI (~5% per GUS), supplier list-price moves,
            utility tariff hikes (~6% URE), rent escalators (CPI-capped
            ~2-3%). 4% is the blended weighted average. Doesn&apos;t
            model commodity shocks — the Ukraine flour spike 2022 was
            +30% in 6 months for some operators. Use the Ingredient
            Stress card to layer specific commodity shocks on top of
            this baseline. Below 3%, you&apos;re modelling deflation
            (rare in PL casual-dining 2024+).
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Cheese, flour and electricity all creep up <strong>~4% a year</strong>.
            If COGS is <strong>60,000 zł/month</strong>, next year it&apos;s
            <strong> ~62,400 zł</strong> — same recipes,
            <strong> 2,400 zł more out the door each month</strong>. Either
            raise menu prices ~5% every January or accept your margin shrinks
            by ~2pp/year quietly.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Annual menu re-pricing in January:</strong> match average COGS inflation. Customers expect small annual bumps; they revolt against years of catch-up hikes.</li>
            <li><strong>Re-cost recipes quarterly:</strong> not every ingredient inflates at the same rate. The Recipes admin spots the worst drifters.</li>
            <li><strong>Hedge the cheese line:</strong> annual contracts with key suppliers lock the rate against sudden spikes.</li>
            <li><strong>Diversify suppliers:</strong> two suppliers per major ingredient = leverage in negotiation + insurance against single-supplier shocks.</li>
            <li><strong>Watch the GUS food CPI monthly:</strong> if it&apos;s &gt;6% your assumption is too low — bump this field and rerun the projection.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> single annual % applied to both COGS and fixed-cost lines (rent escalators are typically CPI-indexed in PL leases).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> cogs_m = base_cogs × (1 + foodInflation)^(m/12). Compounded monthly.</p>
          <p style={{ margin: "0 0 4px" }}><strong>PL 2026 calibration:</strong> ~4% blended. Food CPI ~5%, utilities ~6%, rent escalators ~2-3% (CPI-capped). Weighted average across cost structure.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> GUS food-CPI series 2020-2025, URE (energy regulator) tariff history, commercial-lease standard escalator clauses.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> commodity shocks (Ukraine war flour spike 2022 was +30% in 6 months). For shock scenarios, use the Ingredient Stress card on top of this baseline.</p>
        </Methodology>
      </>
    ),
  },
  onSiteCardFee: {
    title: "On-site card fee",
    body: (
      <>
        <p>
          Blended Stripe / terminal processor rate, applied to on-site
          card revenue only — not delivery aggregators, not cash. PL
          2026 norm 1.4-2.1% depending on volume tier.
        </p>
        <InstitutionalAnalysis>
          <p style={{ margin: 0 }}>
            Single biggest negotiable variable cost line outside COGS.
            Tier breakpoints around 50k / 100k / 200k zł/month card
            revenue typically unlock 0.2-0.4 pp savings. The Channel
            Economics card blends this with cashShare 0%, glovoFee
            ~27%, woltFee ~25% for the cross-channel weighted average
            that flows into the P&amp;L. BLIK is cheaper than card
            (~1.0%); promote in-store to lower the blended rate.
          </p>
        </InstitutionalAnalysis>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Every time a customer taps a card, the bank takes <strong>~1.9%</strong>.
            On <strong>120,000 zł/month</strong> of card sales that&apos;s
            <strong> ~2,300 zł silently gone</strong>. Negotiating with a
            smaller PSP can drop the rate to ~1.4% — that&apos;s
            <strong> ~600 zł/month back</strong> for one phone call.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Negotiate at volume tiers:</strong> Stripe/Adyen/PayU all drop rates above 50k zł/month and again at 100k. Always ask for the next tier.</li>
            <li><strong>Same-day settlement isn&apos;t free:</strong> default T+1 saves ~0.1-0.2 pp vs same-day. If cash flow allows, take the slower payout.</li>
            <li><strong>Avoid premium-card surcharges:</strong> Amex / corporate cards cost 2.5-3.5%. If they&apos;re &gt;5% of your volume, decline them or surcharge legally (PL allows).</li>
            <li><strong>BLIK is cheaper than card:</strong> typical 0.8-1.2% vs 1.9% for cards. Push BLIK in-store with on-screen prompts.</li>
            <li><strong>Annual PSP review:</strong> ask 2-3 PSPs for quotes every year. Switch every 2-3 years to keep rates honest.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> blended on-site card fee %. Applied to on-site revenue only (delivery aggregators take a different commission via the deliveryShare lever).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> monthly fee = revenue × cardShare × onSiteCardFee. cardShare = 1 − cashShare.</p>
          <p style={{ margin: "0 0 4px" }}><strong>PL 2026 norms:</strong> Stripe blended ~1.9%, Adyen ~1.7%, PayU ~1.6%, BLIK ~1.0%, local terminals ~1.4-2.1% depending on tier.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Stripe, PayU, Adyen published rate cards 2024-2025; PaySign Polish payments report.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> per-transaction fixed fees (0.10-0.20 zł per tx). At low ticket sizes these matter; at 65 zł average, the % rate dominates.</p>
        </Methodology>
      </>
    ),
  },
  cashShare: {
    title: "Cash share",
    body: (
      <>
        <p>
          % of revenue settled in cash. Zero processor fee, but reconciliation
          and shrinkage risk are higher. Polish food-truck norm 15–25%.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Cash orders carry <strong>zero card fee</strong>. If 20% of your
            <strong> 200,000 zł/month</strong> is cash, that&apos;s ~760 zł in
            fees you don&apos;t pay. But cash also gets miscounted, &quot;borrowed&quot;,
            or skipped at the till — a <strong>5% cash shrinkage</strong> on
            that volume costs <strong>~2,000 zł/month</strong>. Track it
            tightly or the cashless tax is cheaper.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Daily cash reconciliation:</strong> count cash at end-of-shift against POS cash sales. &gt;1% drift demands investigation.</li>
            <li><strong>CCTV at the till:</strong> not for punishment, for protection — staff are less tempted, and you have evidence if reconciliation fails.</li>
            <li><strong>Limit cash floats:</strong> 200-300 zł till float; bank deposit nightly. Less cash on premises = less shrinkage.</li>
            <li><strong>Push BLIK over cash:</strong> instant settlement, lower fees than card, no shrinkage. Promote with on-screen QR.</li>
            <li><strong>Track cash share vs neighborhood:</strong> tourist areas trend 40%+ cash, office areas under 10%. Set your expectation by location.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> share of on-site revenue paid in cash (0-100%). Default 15% for Warsaw urban; higher in tourist areas.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> cardShare = 1 − cashShare. Card fee applies only to cardShare × on-site revenue.</p>
          <p style={{ margin: "0 0 4px" }}><strong>PL 2026 norms:</strong> 10-15% in central Warsaw/Kraków, 20-35% in tourist districts (Stare Miasto, Kazimierz), 5-10% in office-heavy pitches.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> NBP cash-usage reports, Polish retail-payments studies, owner-operator till data.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> cash shrinkage / theft. Add 2-5% to your cash-channel COGS effectively, or use the dedicated Waste% field to capture it.</p>
        </Methodology>
      </>
    ),
  },
  glovoShare: {
    title: "Glovo share",
    body: (
      <>
        <p>
          % of orders routed through Glovo. Glovo&apos;s commission replaces the
          on-site card fee on this share. Channel mix flows through Per-channel
          CM1 below.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Every <strong>10pp shift toward Glovo</strong> on a 2,400-orders/month
            truck = 240 orders × ~17 zł margin gap =
            <strong> ~4,000 zł/month of contribution gone</strong>. Visibility
            and volume are real, but past <strong>40% Glovo share</strong>
            you&apos;re effectively running their business with your kitchen.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Cap Glovo at 30-35%:</strong> beyond that, the platform owns your demand and can squeeze commission. Build direct channels.</li>
            <li><strong>Don&apos;t list low-margin SKUs:</strong> Margherita on Glovo at 25% commission earns nothing. Restrict the menu to mains 50+ zł.</li>
            <li><strong>Surcharge Glovo orders:</strong> PL allows menu-price differentiation between channels. Many ops add 10-15% to Glovo prices to net the commission.</li>
            <li><strong>Run direct delivery within 2 km:</strong> own driver + 5-8 zł fee retains all the margin Glovo would take.</li>
            <li><strong>In-app loyalty pulls customers off Glovo:</strong> 5% off via your own app costs you 5%; saves you 25% Glovo commission. Net +20pp margin per converted order.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> share of orders via Glovo (0-100%). Excluded from on-site card-fee math; uses its own commission rate.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> Glovo channel revenue = orders × ticket × glovoShare. Glovo channel fee = revenue × glovoCommission. Margin gap vs on-site ≈ (glovoCommission − onSiteCardFee).</p>
          <p style={{ margin: "0 0 4px" }}><strong>PL 2026 norms:</strong> Glovo commission 25-30% depending on tier; some merchants negotiate to 22% at 300+ orders/week.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Glovo merchant agreements, food-delivery industry reports (KPMG, Roland Berger).</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> incremental demand (some Glovo orders wouldn&apos;t exist without the platform). The model treats Glovo orders as substitutes for on-site; check your real data — incremental share might be 30-50%.</p>
        </Methodology>
      </>
    ),
  },
  glovoCommission: {
    title: "Glovo commission",
    body: (
      <>
        <p>
          Glovo&apos;s marketplace take rate. Typical 25–30%; negotiable past
          ~200-300 orders/week thresholds.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Glovo keeps <strong>~27 zł of every 100 zł</strong> of order
            revenue. On 800 Glovo orders/month at 60 zł average that&apos;s
            <strong> ~13,000 zł going to the platform</strong>. Renegotiate from
            27% → 22% on volume and that&apos;s
            <strong> ~2,400 zł/month back</strong> — worth the cold call once
            you cross their threshold.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Hit a volume tier:</strong> Glovo tiers at ~50 / 200 / 500 orders/week. Each unlocks a 1-3 pp discount.</li>
            <li><strong>Negotiate quarterly:</strong> account managers respond to data. Show your 30-day growth, ask for the next tier rate.</li>
            <li><strong>Bundle Glovo + Wolt in negotiation:</strong> &quot;I&apos;ll commit to exclusivity for a year at 22%&quot; sometimes works.</li>
            <li><strong>Promo periods are negotiable:</strong> Glovo runs co-marketing campaigns where they discount their take in exchange for menu placement. Always ask.</li>
            <li><strong>Watch effective rate, not list rate:</strong> Glovo charges advertising fees, marketing co-fund, etc. Calculate fee ÷ revenue monthly.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> Glovo commission % (default 27% blended). Applied to Glovo channel revenue only.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> monthly Glovo fee = orders × ticket × glovoShare × glovoCommission.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Tiers (PL 2024-2025):</strong> 30% baseline → 27% at ~50 orders/week → 24% at ~200/wk → 22% at ~500/wk. Plus optional advertising co-fund.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Glovo merchant rate cards 2024, public reseller agreements, food-delivery industry analysis.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> advertising spend on the platform (some merchants pay 5-10% extra for featured placement). Add as a marketing fixed cost.</p>
        </Methodology>
      </>
    ),
  },
  woltShare: {
    title: "Wolt share",
    body: (
      <>
        <p>
          % of orders routed via Wolt. Like Glovo but smaller fleet in Poland;
          commission tier slightly lower.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Wolt is usually the smaller platform in PL but adds a useful
            redundancy lever. If <strong>10% of orders</strong> flow through
            Wolt at 25% commission, that&apos;s another
            <strong> ~5,000 zł/month in platform fees</strong> on a 200,000 zł
            truck. Some operators run both — when Glovo&apos;s app crashes (it
            will), Wolt covers the gap.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>List on both Glovo + Wolt:</strong> redundancy beats lock-in. If one platform&apos;s app crashes (it will), the other covers the gap.</li>
            <li><strong>Wolt customers tend to attach better:</strong> the app design emphasises sides + drinks more than Glovo. Push higher-margin SKUs first on Wolt.</li>
            <li><strong>Wolt&apos;s service area is smaller:</strong> if your pitch isn&apos;t central Warsaw / Kraków / Gdańsk, Wolt might not even cover you. Verify before listing.</li>
            <li><strong>Use Wolt for evening / dinner crowd:</strong> empirically Wolt indexes higher for dinner orders, Glovo for lunch.</li>
            <li><strong>Cross-promote:</strong> mention Wolt-only deals on Glovo-customer receipts (drives the lower-fee channel).</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> share of orders via Wolt (0-100%). Treated identically to Glovo but with its own commission tier.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> Wolt channel revenue = orders × ticket × woltShare. Wolt channel fee = revenue × woltCommission.</p>
          <p style={{ margin: "0 0 4px" }}><strong>PL 2026 norms:</strong> Wolt is smaller in PL (~25-30% of food-delivery market vs Glovo&apos;s 55-60%). Commission typically 22-30%, slightly cheaper than Glovo on average.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Wolt merchant agreements, food-delivery market-share reports (UCE, OECD).</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> overlap between Glovo + Wolt customers (some customers use both — the model assumes channel exclusivity which understates platform reach).</p>
        </Methodology>
      </>
    ),
  },
  woltCommission: {
    title: "Wolt commission",
    body: (
      <>
        <p>
          Wolt&apos;s take rate. Typical 22–30%; slightly cheaper than Glovo on
          average.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Wolt typically takes <strong>~25 zł of every 100 zł</strong> —
            slightly cheaper than Glovo, so if you&apos;re picking just one
            platform Wolt wins on margin. But Glovo has <strong>3–4× the
            customer base</strong> in big PL cities. Lift Wolt&apos;s share and
            you save fees; lift Glovo&apos;s share and you grow volume.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Negotiate on volume:</strong> Wolt tiers at ~30 / 100 / 300 orders/week. Each unlocks 1-2 pp lower rate.</li>
            <li><strong>Wolt is more flexible on promo:</strong> they often co-fund discounts to grow your share; Glovo less so. Pitch this when account-managing.</li>
            <li><strong>Watch effective rate:</strong> Wolt occasionally adds delivery-fee subsidies that the merchant funds — read the fine print quarterly.</li>
            <li><strong>Bundle as exclusive:</strong> if you commit to Wolt-only delivery, you can sometimes negotiate 20% or below.</li>
            <li><strong>Test menu pricing:</strong> Wolt customers tolerate slightly higher prices than Glovo (different demographic). Test a 5% lift on Wolt items.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> Wolt commission % (default 25% blended).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> monthly Wolt fee = orders × ticket × woltShare × woltCommission.</p>
          <p style={{ margin: "0 0 4px" }}><strong>PL 2026 norms:</strong> baseline 28-30%; volume tiers drop to 22-25% above ~300 orders/week. Some categories (alcohol via licensed merchants) see different rates.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Wolt merchant rate cards 2024, food-delivery industry analyses.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> Wolt+ subscription discounts (customers in the Wolt+ program order more frequently — incremental demand effect not captured).</p>
        </Methodology>
      </>
    ),
  },
  setupCost: {
    title: "Setup cost",
    body: (
      <>
        <p>
          Total capital outlay to launch the unit — vehicle, kitchen buildout,
          oven, permits, working capital. Drives payback months and
          cash-on-cash return.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            This is the <strong>one big cheque at the start</strong>. A used
            truck + Ferrara oven + permits in Warsaw 2026 runs
            <strong> ~280,000–350,000 zł</strong>. Spend 300,000 zł and net
            15,000 zł/month, and you&apos;re &quot;even&quot; at month
            <strong> 20</strong> — paying down the cheque before any actual
            profit accrues. Every 50,000 zł you trim off setup shortens that
            payback by ~3 months.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Buy used, finish new:</strong> a 5-year-old food truck refurbished saves ~80,000 zł vs new. Resale value barely differs.</li>
            <li><strong>Lease the oven if cash-tight:</strong> a Ferrara/Marra Forni lease at 1,500 zł/month over 5 years protects working capital but adds ~12% finance cost vs cash.</li>
            <li><strong>Permits + buildout = 30% of total:</strong> budget 90-110k for the regulatory + interior. Surprises here kill payback.</li>
            <li><strong>Keep 60k working capital:</strong> first 6 months you might be break-even at best. Don&apos;t starve the launch.</li>
            <li><strong>Negotiate landlord buildout contribution:</strong> for fixed pitches in malls/halls, landlords often cover 30-50k of buildout in exchange for longer lease.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> single sum capturing vehicle + oven + buildout + permits + working capital.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Where it flows:</strong> setup payback (months) = setup ÷ monthly net profit. Also feeds cash-on-cash return and investor-facing payback KPI.</p>
          <p style={{ margin: "0 0 4px" }}><strong>PL 2026 ranges:</strong> used truck 60-90k, new buildout 100-150k, oven 35-55k (wood/gas/electric), permits 10-20k, working capital 50-80k. Total: 280-350k for a Neapolitan-style operation.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Polish food-truck broker pricing, Ferrara/Marra Forni dealer quotes, owner-operator buildout post-mortems.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> contingency (most launches overrun by 10-15%). Add a 30k buffer to your real budget.</p>
        </Methodology>
      </>
    ),
  },
  depreciation: {
    title: "Depreciation & amortisation",
    body: (
      <>
        <p>
          Non-cash expense spreading setup cost across the asset&apos;s economic
          life. 5-year truck = setup/60 per month. Required for EBITDA →
          net-profit walk.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            D&amp;A is the accountant&apos;s way of saying &quot;your truck loses
            value every month even if nothing breaks&quot;. A
            <strong> 300,000 zł truck</strong> depreciated over 5 years =
            <strong> 5,000 zł/month</strong> off net profit. It doesn&apos;t
            leave your bank account today — it&apos;s the bill you&apos;re
            storing up for replacement in year 5. Ignore it at your peril.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Save D&amp;A to a separate account:</strong> auto-transfer the monthly D&amp;A figure to a savings account. Year 5 oven replacement = pre-funded.</li>
            <li><strong>Vehicle depreciates faster than kitchen:</strong> consider 4 years for the truck, 8-10 for the oven. The blended rate is a simplification.</li>
            <li><strong>D&amp;A vs CAPEX timing:</strong> the cash hits at purchase, the P&amp;L spreads it. Don&apos;t confuse the two when budgeting cash.</li>
            <li><strong>Tax-efficient choice:</strong> Polish CIT allows accelerated depreciation for some equipment. Ask your accountant — could shift 10-15k of profit out of year 1.</li>
            <li><strong>EBITDA excludes D&amp;A:</strong> when banks evaluate you, they look at EBITDA. Knowing the D&amp;A line helps you walk between EBITDA and bank-relevant numbers.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> monthly D&amp;A in zł. Default = setupCost ÷ 60 (5-year straight-line).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> monthly D&amp;A = capex ÷ useful_life_in_months. Subtracted from EBITDA to derive net profit.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Useful-life norms (PL gastro):</strong> truck 4-5 yr, kitchen equipment 8-10 yr, fit-out 5-7 yr, IT/POS 3 yr. Blended: 5 yr average.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Polish UoR depreciation tables, gastronomic accounting practices, KPMG fixed-asset benchmarks.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> mid-life repairs (the oven might need a 15k refurb at year 3). Add as a one-off fixed cost or extend the depreciation tail to cover renewal.</p>
        </Methodology>
      </>
    ),
  },
  interestExpense: {
    title: "Interest expense",
    body: (
      <>
        <p>
          Monthly debt-service cost (leasing, bank loan, asset finance). Zero
          for cash-purchased trucks.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            If you financed the truck instead of paying cash, the bank takes a
            slice every month. A <strong>150,000 zł loan at 10%</strong> is
            <strong> ~1,250 zł/month in interest alone</strong> — ~15,000 zł of
            net profit gone in year 1 before you pay back a złoty of the
            principal. Worth modelling vs draining your savings.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>BGK / PARP grants first:</strong> Polish public funding programs cover ~15-30% of buildout for new SMEs. Apply before signing a loan.</li>
            <li><strong>Equipment leasing &gt; bank loan:</strong> ovens, fridges, POS — leasing is usually 1-2 pp cheaper than a comparable bank loan and tax-deductible monthly.</li>
            <li><strong>Refinance after year 1:</strong> once you have 12 months of operating data, banks offer better rates than at launch. Aim for a 2-3 pp drop.</li>
            <li><strong>Interest is tax-deductible:</strong> in PL CIT, interest expense reduces taxable income. Effective cost ≈ rate × (1 − CIT rate).</li>
            <li><strong>Cash-vs-finance trade:</strong> if your cash earns 5% in a deposit and the loan costs 10%, financing burns 5 pp of net wealth. But it preserves working capital flexibility.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> monthly interest expense in zł. Zero for cash-purchased trucks.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> monthly interest ≈ loan_balance × annual_rate ÷ 12. Subtracted from EBITDA → net profit.</p>
          <p style={{ margin: "0 0 4px" }}><strong>PL 2026 norms:</strong> commercial bank loans for SMEs 8-12% APR, equipment leasing 7-10%, ZUS-backed startup loans 5-8%. Polish public programmes (PARP, BGK) often run 4-6%.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Polish bank SME-loan rate cards 2024, BGK published programmes, NBP base-rate trajectory.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> principal repayment (cash impact). Interest only affects P&amp;L; principal hits cash flow separately — track in the Cash Flow card if you have one.</p>
        </Methodology>
      </>
    ),
  },
  packagingPerOrder: {
    title: "Packaging per order",
    body: (
      <>
        <p>
          Per-order variable cost of takeaway boxes, napkins, plate wash, paper
          bags. Hits every order. Delivery-channel packaging (branded box +
          sleeve) usually layered on top.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Box ~2.50 zł, napkins ~0.30 zł, bag ~0.40 zł — about
            <strong> 3 zł per order in packaging</strong>. On 2,400 orders/month
            that&apos;s <strong>~7,200 zł in throwaway materials</strong>.
            Switching to plain kraft boxes (no print) can save 0.80 zł/order =
            <strong> ~1,900 zł/month</strong> — invisible to customers on a
            50-100 zł ticket.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Bulk-buy quarterly:</strong> 3-month orders cut unit price by 8-15%. Calculate the storage cost vs the discount.</li>
            <li><strong>Differentiate dine-in vs takeaway:</strong> dine-in needs no box, just a plate. Push dine-in if your pitch allows — eliminates ~2.50 zł/order.</li>
            <li><strong>Audit napkin / cutlery consumption:</strong> staff often default to &quot;extra of everything&quot;. Train + measure.</li>
            <li><strong>Negotiate with two suppliers:</strong> swap annually, quote shopping = 5-12% saving.</li>
            <li><strong>Premium branded for delivery only:</strong> a 0.80 zł cheaper kraft for in-store + branded for delivery = no perceived downgrade but lower blended cost.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> per-order packaging cost in zł. Default 3.00 zł blended (mix of dine-in + takeaway + delivery).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> monthly packaging cost = orders × ticket_factor (1 for takeaway, 0 for dine-in) × cost_per_order. Treated as variable cost.</p>
          <p style={{ margin: "0 0 4px" }}><strong>PL 2026 cost ranges:</strong> 30cm pizza box plain 1.80-2.20 zł, branded 2.50-3.50 zł, kraft bag 0.30-0.50 zł, napkin 0.05-0.10 zł. Cutlery another 0.40-0.80 zł if included.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Polish packaging-supplier price lists 2024-2025, gastronomic-procurement benchmarks.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> single-use plastic levy (likely PL 2026-2027 will introduce CRP-style packaging fees). Add 0.20-0.50 zł/order buffer if launching in this window.</p>
        </Methodology>
      </>
    ),
  },
  wastePct: {
    title: "Waste & spoilage",
    body: (
      <>
        <p>
          Spoilage + over-portioning + end-of-shift discards as % of revenue.
          QSR norm 1–3%. Tracked as variable leakage in True CM1.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Dough goes off, mozzarella balls get nicked, the last 4 portions of
            sauce go in the bin at 22:00. A <strong>2% waste rate</strong> on
            200,000 zł/month is <strong>4,000 zł literally thrown away</strong>
            every month. Most truck operators don&apos;t measure it — until they
            do, and discover it&apos;s 4-5%, not 2%.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Daily waste log:</strong> 2-min end-of-shift form. What got binned, why. Quantifying it is half the fix.</li>
            <li><strong>Smaller, more frequent dough batches:</strong> 4× 4-hour batches beat 1× 16-hour batch on freshness AND waste.</li>
            <li><strong>End-of-day half-price program:</strong> 21:30 onwards 50% off — converts waste into goodwill + small revenue.</li>
            <li><strong>FIFO discipline:</strong> oldest stock first. Train + spot-check. A wrong rotation costs you the difference between 1% and 4% waste.</li>
            <li><strong>Pre-prep vs cook-to-order:</strong> too much pre-prep raises waste; too little raises ticket time. Balance based on hourly forecast.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> waste % of revenue. Default 2% (QSR healthy).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> monthly waste cost = revenue × wastePct. Counted as variable cost in the True CM1 calculation.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Industry norms (QSR):</strong> 1.0-1.5% world-class (McDonald&apos;s, Domino&apos;s); 2-3% healthy independent; 4-5% under-measured; 6%+ undisciplined.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> NRA Industry Operations Report, MAPA-Polska gastronomic waste study, owner-operator daily-log compositions.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> EU food-waste regulations (the SUP directive + future EU food-waste reduction targets could mandate measurement &amp; reporting). Build the daily log now to be ready.</p>
        </Methodology>
      </>
    ),
  },
  refundsPct: {
    title: "Refunds / comps / theft",
    body: (
      <>
        <p>
          Voided orders, comp meals, staff free meals, till shortages as % of
          revenue. QSR norm 1–2%.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            A burnt pizza you refunded, the staff meal that&apos;s &quot;free&quot;,
            the angry customer comped. They add up to <strong>~2% on 200,000
            zł = 4,000 zł/month</strong> of revenue you booked but never kept.
            Tighten void approvals (manager only) and the number usually drops
            by half — easiest 2,000 zł/month you&apos;ll ever find.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Manager-only voids:</strong> the single biggest lever. Voids without manager auth often hide cash-skim or favouritism.</li>
            <li><strong>Standardise staff meals:</strong> one set meal/day per staff member, billed at cost not retail. Stops &quot;casual freebies&quot;.</li>
            <li><strong>Cap comps per shift:</strong> manager can comp 1 ticket/shift on their own; anything more needs ownership approval.</li>
            <li><strong>Burnt-pizza incidence is recipe drift:</strong> if you&apos;re comping 4+ pizzas/week for cooking errors, retrain the line. Don&apos;t accept it as cost-of-doing-business.</li>
            <li><strong>Track per-staff comp rate:</strong> if one staff member comps 5× the team average, you have an honesty problem, not a quality problem.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> refunds + comps + staff meals + till shortages as % of revenue. Default 1.5%.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> monthly leakage = revenue × refundsPct. Treated as revenue-side reduction (not cost) in True CM1.</p>
          <p style={{ margin: "0 0 4px" }}><strong>QSR norms:</strong> 0.5-1% world-class (tight ops); 1-2% healthy independent; 3%+ requires investigation.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> NRA, restaurant-loss-prevention literature (e.g. Henson on internal-loss controls), POS audit-trail data.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> the customer-relationship value of generous comps. A 50 zł comp that earns a 2,000 zł lifetime customer is net positive — but the model doesn&apos;t see that. Track customer LTV separately.</p>
        </Methodology>
      </>
    ),
  },
  loyaltyBurn: {
    title: "Loyalty point burn",
    body: (
      <>
        <p>
          Effective discount rate = points earned × redemption rate × point
          value. Default: 1 pt/PLN × 50% redeem × 5% value = ~1.2%.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Loyalty isn&apos;t free — every 100 zł a regular spends earns them
            a future ~1.20 zł discount on average. On 200,000 zł monthly
            revenue that&apos;s <strong>~2,400 zł/month given back</strong> via
            redemptions. If repeat rate climbs 10pp because of it, the trade
            more than pays — but you need to actually measure both sides, not
            just the burn.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Measure repeat-rate lift:</strong> the only metric that justifies loyalty cost. If repeat rate didn&apos;t move, the program is just a discount.</li>
            <li><strong>Tier the program:</strong> 1% earn for casual, 3% for VIPs (200+ zł/month spend). Pareto distribution applies — your top 20% justify the burn.</li>
            <li><strong>Use redemption pressure:</strong> &quot;you have 25 zł of credit expiring Sunday&quot; lifts re-visit frequency more than &quot;you have 25 zł of credit&quot;.</li>
            <li><strong>Bundle loyalty redemptions with attach:</strong> &quot;free coffee with your 4th pizza&quot; — high-margin redemption that boosts attach.</li>
            <li><strong>Watch the burn-to-earn ratio:</strong> healthy programs sit at 40-60% redemption. Above 80% you&apos;re bleeding; below 30% the program isn&apos;t engaging.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> effective discount rate as % of revenue. Default 1.2% (1 pt/PLN × 50% redeem × 5% point value).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> monthly loyalty cost = revenue × loyaltyBurn. Treated as revenue-side reduction in True CM1.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Default decomposition:</strong> 1 point earned per zł (100% earn rate) × 50% redeemed within 90 days (half forfeit) × 5 zł value per 100 points (typical PL casual-Italian scale) = 0.5 × 0.05 = 2.5% earned, ~1.2% effective burn.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> loyalty-program benchmarks (Sailthru, Bond), Polish e-commerce loyalty studies (PMR).</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> point breakage (forfeited points). Unredeemed points cost nothing but the model treats earned points as fully redeemed at the burn rate. For accuracy, run a quarterly breakage audit and refine the rate.</p>
        </Methodology>
      </>
    ),
  },
  citRate: {
    title: "Corporate income tax",
    body: (
      <>
        <p>
          Effective CIT rate. Polish small-CIT 9% applies up to €2M turnover;
          standard 19% above. Drives net-of-tax profit and IRR.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            After everything else, the tax-man takes a cut. <strong>9% small-CIT</strong>
            on 180,000 zł/year of pre-tax profit = ~<strong>16,200 zł</strong>
            to the tax office. Cross the <strong>€2M turnover line</strong>
            and the rate jumps to 19% — the same profit suddenly costs
            <strong> ~34,200 zł in tax</strong>. That&apos;s why some operators
            stay deliberately under the threshold.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Stay under €2M turnover if borderline:</strong> the jump from 9% → 19% is a 10pp tax hike. A 1.95M zł truck might net more than a 2.1M zł truck.</li>
            <li><strong>Multi-entity structure for chains:</strong> 2 trucks × separate sp. z o.o. each under €2M = both at 9%. Common PL structure for multi-unit operators.</li>
            <li><strong>Capex timing:</strong> a large equipment purchase in Q4 reduces this year&apos;s taxable profit — possibly worth bringing forward a planned year-1 buy.</li>
            <li><strong>R&amp;D tax relief:</strong> recipe development + POS software counts in PL. Talk to a tax advisor — up to 200% deductibility on qualified R&amp;D.</li>
            <li><strong>Estonian CIT (taxation when profits distributed):</strong> available for some PL companies; defers CIT until dividends paid out. Useful for reinvesting growth.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> effective CIT rate %. Default 9% (PL small-CIT).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> after-tax profit = pre-tax profit × (1 − CIT rate). Applied at the bottom of the P&amp;L.</p>
          <p style={{ margin: "0 0 4px" }}><strong>PL 2026 rates:</strong> 9% small-CIT for revenues ≤ €2M; 19% standard above. Estonian CIT (CIT na zasadach estońskich) defers tax until dividend distribution.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Polish tax code (Ustawa o CIT), Ministry of Finance interpretive notes, gastronomic tax-advisor guides (Crido, KPMG PL).</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> VAT (revenue gross-up vs net). The model treats revenue as net of VAT — if you enter gross figures, the tax math will overstate. Also doesn&apos;t model PIT for sole-proprietor operations (JDG), which has different rate structure.</p>
        </Methodology>
      </>
    ),
  },
  winterMultiplier: {
    title: "Winter volume multiplier",
    body: (
      <>
        <p>
          Dec / Jan / Feb volume multiplier applied to base orders/day. Default
          0.50 — Polish outdoor pizza-truck winter is brutal.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Winter halves your business. A truck doing <strong>80 orders/day</strong>
            in summer might do <strong>40</strong> in January — and your rent
            stays the same. That&apos;s
            <strong> ~50,000 zł of lost monthly revenue</strong> for three
            months running. Plan the cash crunch in December or move to an
            indoor pop-up for Q1.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Build a winter menu:</strong> hot soups, baked pasta, mulled wine. Higher-margin warming items that justify the visit.</li>
            <li><strong>Indoor pop-up partnership:</strong> December-February rent a corner in a mall food court. Saves the rent stack.</li>
            <li><strong>Push delivery harder Dec-Feb:</strong> bad weather = high delivery demand. Marketing spend pivots to delivery.</li>
            <li><strong>Reduce staff hours, not headcount:</strong> shorten service to 16-21h Dec-Feb. Keeps the team but cuts labor.</li>
            <li><strong>Cash plan from Q3:</strong> save 3 months of fixed costs by September. Winter eats reserves; running out triggers panic decisions.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> winter multiplier (default 0.50). Applied to base orders/day for Dec/Jan/Feb.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> winter_orders/day = base_orders/day × winterMultiplier. Applied in the monthly projection for the 3 winter months.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Range:</strong> 0.40-0.65 for outdoor PL truck. Indoor mall pitch: 0.85-0.95 (almost no dip). Pure delivery operation: 0.80 (delivery surges in cold weather).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Polish gastronomic seasonality reports, IMGW Warsaw winter-day data, owner-operator winter-revenue surveys.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> regional variation (Gdańsk vs Kraków vs Zakopane winter is very different). Override the multiplier for non-Warsaw locations.</p>
        </Methodology>
      </>
    ),
  },
  pizzasPerHour: {
    title: "Kitchen — pizzas/hour cap",
    body: (
      <>
        <p>
          Sustained throughput of one pizzaiolo + one Neapolitan oven. 60–80
          pizzas/hr realistic; 90+ needs a second line.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Your oven physically can&apos;t go faster than this. If your peak
            hour wants <strong>90 pizzas</strong> and your cap is <strong>70</strong>,
            <strong> 20 customers walk</strong> — that&apos;s ~1,200 zł of
            revenue refused per peak hour. A second oven + pizzaiolo doubles
            the ceiling but costs ~8,000 zł/month — only worth it if you&apos;re
            consistently saturating the current ceiling.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Pre-launch a pizzaiolo on the line for the peak hour only:</strong> 1-hour shift extension lifts capacity 50% at the rush, not 100%.</li>
            <li><strong>Pre-shape dough during slow hours:</strong> instead of full stretch-to-order, pre-portion + cold-prove during 14-17h. Cuts per-pizza time ~30s.</li>
            <li><strong>Batch the orders:</strong> 4-6 pizzas per oven cycle vs 1-2 lifts throughput dramatically. Train the line on batch discipline.</li>
            <li><strong>Watch for saturation:</strong> if your hourly heatmap shows red cells (saturated), every additional marketing zł is wasted. Capacity = constraint.</li>
            <li><strong>Second oven decision threshold:</strong> if peak hour saturation &gt; 90% on 3+ days/week consistently, the second oven pays back in 6-9 months.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> sustained pizzas/hour the line can produce. Default 70 (one pizzaiolo + one Neapolitan oven).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> daily kitchen capacity = pizzasPerHour × serviceHoursPerDay × oven_efficiency. Saturation = peak_hour_orders ÷ pizzasPerHour.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Realistic range:</strong> Neapolitan wood-fired oven 60-90/hr per pizzaiolo. Gas/electric deck 80-110. Conveyor 120+. The bottleneck is usually the pizzaiolo&apos;s shaping speed, not the oven.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Pizzeria operations literature (Bianco, Forni Ferrara dealer guides), AVPN (Associazione Verace Pizza Napoletana) production studies.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> menu mix complexity (a topping-heavy pizza takes ~25% longer than Margherita). The model assumes uniform pizza time; high-attach evenings might effectively run 10-15% slower.</p>
        </Methodology>
      </>
    ),
  },
  serviceHoursPerDay: {
    title: "Kitchen — service hours/day",
    body: (
      <>
        <p>
          Hours the line is producing — excludes prep + close-down. Drives
          capacity-orders-per-day calc.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Your kitchen is &quot;open&quot; 12 hours but really only producing
            for ~8. Adding <strong>1 extra service hour</strong> (lunch
            <em> and</em> dinner instead of just dinner) on a 70-pizza/hr line =
            ~70 extra orders/day capacity, ~30 extra orders actually filled,
            <strong> ~1,500 zł/day of upside</strong>. The catch: labor scales
            with it.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Add the highest-margin hour first:</strong> dinner peak (18-21) beats opening earlier on margin. Test late-evening (21-23) for premium aperitivo crowd before extending lunch.</li>
            <li><strong>Add lunch with a simplified menu:</strong> 4 fast pizzas at 35-45 zł, no antipasti, fewer SKUs. Different ops profile from dinner.</li>
            <li><strong>Calculate marginal labor cost:</strong> each extra service hour = ~1 staff-hour × ~45 zł brutto. Break-even at ~5 extra orders × ~12 zł margin.</li>
            <li><strong>Watch the demand curve:</strong> if the new hour fills less than 40% of capacity, you&apos;re paying for empty time. Cut it back.</li>
            <li><strong>Use the heatmap to validate:</strong> the hourly chart shows where adding an hour would actually capture demand vs add cost.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> service hours per day (default 8 — typical lunch + dinner split).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> daily capacity = pizzasPerHour × serviceHoursPerDay × ovenEfficiency. Excludes prep + setup + close-down hours.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Typical splits:</strong> lunch-only 4 hr, dinner-only 5 hr, lunch+dinner 9 hr, all-day 11 hr. Aperitivo bars sometimes extend to 12-14 hr.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Polish gastronomic operating-hours surveys, NRA service-window studies, owner-operator schedule analytics.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> prep + close-down labor (typically 1.5-2 hr/day each). The labor card should account for those hours even though they don&apos;t produce orders.</p>
        </Methodology>
      </>
    ),
  },
  laborFlex: {
    title: "Labor flex with volume",
    body: (
      <>
        <p>
          Share of labor that scales with order volume vs fully-fixed crew. 0%
          = always-on team, 100% = fully variable. 40% QSR norm.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            How &quot;elastic&quot; is your roster? <strong>0% flex</strong>
            means you pay the same labor whether you do 30 or 100 orders — bad
            day = brutal margin. <strong>80% flex</strong> (part-timers on call)
            means you can send people home in a slow lunch, saving
            <strong> ~2,000 zł/month</strong> — but staff turnover climbs.
            <strong> 40%</strong> is the sweet spot for most trucks.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Fixed core + flexible edges:</strong> 2-3 fixed pizzaiolos, 1-2 cooks; flex part-timers for peaks. Keeps quality + flex.</li>
            <li><strong>Use student-friendly hours:</strong> students want 18-22h shifts on weekdays — perfect for the dinner peak.</li>
            <li><strong>Call-off rules in writing:</strong> &quot;you may be called off with 4h notice during defined slow windows&quot;. Sets expectations early.</li>
            <li><strong>Pay slightly above market for flex:</strong> a part-timer paid 38 zł/h vs market 35 zł/h reduces turnover, which matters more than the 8% premium.</li>
            <li><strong>Cross-train fixed staff:</strong> they cover absence + flex roles without scheduling chaos.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> labor flex % (0-100). Default 40% (QSR norm — mix of fixed core + variable part-timers).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> variable_labor = labor × laborFlex × max(0, (orders/day − laborAnchor) ÷ laborAnchor). Adds proportionally above anchor; doesn&apos;t subtract below.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Industry ranges:</strong> 20-30% world-class chains (Domino&apos;s, Telepizza); 40-50% independent casual-Italian; 70%+ fast-casual w/ heavy part-time.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> NRA labor benchmarks, Polish fast-casual chain published reports, gig-economy gastronomic studies.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> minimum staffing constraints (you can&apos;t run a kitchen with 1 person no matter how slow). Real labor has a floor; the model treats variability as continuous.</p>
        </Methodology>
      </>
    ),
  },
  laborAnchor: {
    title: "Labor anchor (orders/day)",
    body: (
      <>
        <p>
          The orders/day for which the current labor mix is sized. Volume past
          this anchor pulls in additional variable labor proportionally.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Tell the model what volume your current roster is designed for. If
            you set anchor=80 and actually do 110 orders/day, the model adds
            extra variable labor (more part-timers, overtime) to handle it —
            typically <strong>~1,500 zł/month extra</strong> at moderate flex.
            If you do 50, labor stays the same — you can&apos;t unhire your
            fixed crew.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Set anchor to your typical orders/day:</strong> avg over 30 days. Not your good days, not your bad days.</li>
            <li><strong>Re-anchor quarterly:</strong> if volume grows steadily, your &quot;normal&quot; shifts up. Keep the anchor honest.</li>
            <li><strong>Anchor too low = overstated labor scaling:</strong> the model will project huge labor inflation as orders grow. Recalibrate.</li>
            <li><strong>Anchor too high = understated labor for growth:</strong> the model assumes you have spare capacity that doesn&apos;t exist. Budget more.</li>
            <li><strong>Tie to schedule:</strong> if your roster is sized for 80, set anchor=80. Match the model to your real ops.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> the orders/day for which the current labor mix is sized. Default = base orders/day.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> anchor is the reference point against which variable labor scales (see laborFlex methodology).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Best practice:</strong> set to the order volume your current schedule is built around. Don&apos;t use scenario projections; use historical actuals.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> labor scheduling literature, restaurant ops case studies.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> seasonal anchor shift (summer roster vs winter roster). The model uses one anchor across the year — use the seasonality card for volume swings.</p>
        </Methodology>
      </>
    ),
  },
  peakHourShare: {
    title: "Kitchen — peak-hour share",
    body: (
      <>
        <p>
          % of daily orders concentrated in the peak hour. This is the binding
          constraint, not the daily average. Default 18% on dinner-led truck.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            80 orders/day spread over 10 hours is 8/hour — easy. But if
            <strong> 20% pile into one hour</strong> (Friday 19:00–20:00) that&apos;s
            <strong> 16/hour</strong> — and if your oven only does 14, you
            turn away 2. Same daily total, totally different capacity story.
            This single percentage often decides whether you need a second oven.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Measure your peak hour from POS:</strong> not your perception. Friday 19h vs 20h vs Saturday 20h — find the worst hour, design capacity for it.</li>
            <li><strong>Flatten the peak with pre-orders:</strong> push customers to book 18:30 or 21:00 slots with a small incentive (free coffee).</li>
            <li><strong>Pre-bake low-attach items:</strong> Margherita / Marinara can pre-bake 5min early, finish in oven on order. Lifts capacity at peak.</li>
            <li><strong>Limited menu at peak:</strong> 3-4 SKUs only during 19-21h. Slashes per-pizza time, lifts throughput.</li>
            <li><strong>Capacity = peak × hour, not avg × day:</strong> when scaling, the peak hour is the binding constraint. Plan investments against it.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> % of daily orders concentrated in the single busiest hour. Default 18%.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> peak_hour_orders = orders/day × peakHourShare. Saturation = peak_hour_orders ÷ pizzasPerHour. If saturation &gt;1.0, demand exceeds capacity = lost orders.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Realistic ranges:</strong> 12-15% spread-load lunch-and-dinner; 18-22% dinner-led casual; 25-32% special-event / weekend-only; bar / aperitivo can hit 30%+ in the 18-20h window.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Polish POS data composites, NRA hourly-mix studies, restaurant capacity-planning literature (Kasavana).</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> within-hour volatility (most peak hours have a 15-min mega-peak). The model assumes flat distribution within the hour, which under-states real saturation.</p>
        </Methodology>
      </>
    ),
  },
  prepComplexity: {
    title: "Prep-complexity multiplier",
    body: (
      <>
        <p>
          Derates kitchen capacity for slow-prep menus. 1.0 = pizza-only;
          1.4–1.6 = pasta-heavy. Captures station bottlenecks the headline
          pizzas/hour misses.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            A 70-pizza/hr kitchen drops to <strong>~45 effective orders/hr</strong>
            when half the orders are pasta primo (90s extra per dish, separate
            station). The model bakes this in. Push pasta attach high without
            raising this multiplier and the simulator will lie to you — your
            &quot;capacity&quot; looks bigger than it actually is.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Calibrate from your menu mix:</strong> if 30% of orders are pasta primo, your multiplier is ~1.25. If 50%, ~1.5. Mix-weight your way to the right number.</li>
            <li><strong>Separate stations help:</strong> a dedicated pasta cook + pan + burner reduces the effective complexity drag — invest if pasta attach exceeds 20%.</li>
            <li><strong>Simplify the slow items:</strong> if antipasti needs assembly + plating, pre-portion to slash 60s/order at the line.</li>
            <li><strong>Audit your slowest SKU monthly:</strong> use POS prep-time stamps. Cut or simplify the 90%+ time outliers.</li>
            <li><strong>Mix-aware roster:</strong> peak with high pasta attach needs more line cooks, not more pizzaiolos. Match labor to the actual mix.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> effective-capacity multiplier (1.0 = pizza-only). Default 1.0; raise to 1.4-1.6 for pasta-heavy menus.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> effective pizzas/hour = pizzasPerHour ÷ prepComplexity. So a 70/hr line × 1.4 complexity = 50 effective orders/hr.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Typical calibration:</strong> pizza-only 1.00, pizza+drinks 1.05, +dessert/antipasti 1.15, +pasta primo 1.40, full-menu Italian 1.55+.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> kitchen-throughput studies, Italian-restaurant ops literature (Pomodoro Foundation training materials).</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> per-station bottlenecks (the pasta station might saturate before the pizza station). The model derates everything uniformly; real ops can have one station idle while another&apos;s slammed.</p>
        </Methodology>
      </>
    ),
  },
  summerMultiplier: {
    title: "Summer volume multiplier",
    body: (
      <>
        <p>
          Jun / Jul / Aug volume multiplier. Default 1.30 — peak truck season.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Summer is when trucks make money. A baseline truck doing
            <strong> 80 orders/day</strong> does <strong>~104</strong> in July
            — that&apos;s <strong>~50,000 zł of extra monthly revenue</strong>
            for three months. This is the season that funds winter survival —
            under-roster and you blow customers off; over-roster and you eat
            the margin.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Save summer surplus for winter:</strong> auto-transfer 30% of summer net profit to a winter reserve. Otherwise you&apos;ll spend it.</li>
            <li><strong>Pre-hire summer staff in April:</strong> students/part-timers book early. Wait until June and the talent pool is empty.</li>
            <li><strong>Patio expansion in May:</strong> rent extra outdoor furniture, get permits done early. Day-1 of warm weather = max revenue.</li>
            <li><strong>Aperitivo / spritz push:</strong> summer evenings reward drink attach. Train + stock + promote.</li>
            <li><strong>Don&apos;t over-extend:</strong> summer multiplier 1.30 doesn&apos;t mean you can do 1.30× capacity. Match labor + supplies; don&apos;t blow out service times.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> summer (Jun-Aug) volume multiplier. Default 1.30.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> summer_orders/day = base × summerMultiplier × heatwaveMultiplier × ... composed with other weather levers.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Range:</strong> 1.15-1.45 outdoor truck; 0.95-1.10 indoor mall (less seasonal); 1.20-1.30 tourist-area indoor. Resort/beach 1.50+.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Polish gastronomic seasonality studies, GUS hospitality reports, owner-operator monthly variance data.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> capacity-limited demand (your 1.30× theoretical might be capped by oven throughput). Check kitchen saturation against the summer peak.</p>
        </Methodology>
      </>
    ),
  },
  springMultiplier: {
    title: "Spring volume multiplier",
    body: (
      <>
        <p>
          Mar / Apr / May multiplier. Default 1.00 (baseline season).
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Spring is your &quot;normal&quot;. Use it as the calibration anchor
            — if you&apos;re forecasting from spring data, this sets the 1.00
            reference that summer and winter multipliers flex around. April/May
            warming usually adds a few percent through patio reopening, but
            don&apos;t over-promise.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>April patio launch:</strong> set up outdoor seating for the first warm weekend. Visibility = early-season buzz.</li>
            <li><strong>Easter is volatile:</strong> can be peak (family lunches) or zero (closure). Plan both scenarios.</li>
            <li><strong>Use spring to test menu changes:</strong> low-stakes season to A/B new items before summer rush.</li>
            <li><strong>Refresh marketing for the new season:</strong> &quot;spring menu&quot; framing converts even if the items are the same.</li>
            <li><strong>Calibrate the model:</strong> spring is your baseline. Match it to your last-year actuals so the other seasons are correctly flexed.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> spring (Mar-May) volume multiplier. Default 1.00 (baseline).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> spring_orders/day = base × springMultiplier × {"(other weather adjustments)"}.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Range:</strong> 0.95-1.10 typical. Late spring (May) often runs higher than early (March) — the multiplier averages across the quarter.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> seasonality studies, owner-operator monthly variance.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> Easter weekend swing (can be 2× or 0.3× depending on whether you open). Add as event-day if planning to open; as holiday-closure if not.</p>
        </Methodology>
      </>
    ),
  },
  autumnMultiplier: {
    title: "Autumn volume multiplier",
    body: (
      <>
        <p>
          Sep / Oct / Nov multiplier. Default 0.95 — slight cooling vs spring.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            September starts hot then cools fast. <strong>5% lower volume</strong>
            than spring means <strong>~10,000 zł less revenue/month</strong>
            by November. Plan a marketing push for early October (back-to-uni
            crowd) to compensate before the dark days hit.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>September back-to-school push:</strong> office lunch crowd returns. Marketing aimed at &quot;September resets&quot; outperforms June ads.</li>
            <li><strong>Autumn menu launch in early Oct:</strong> truffle, pumpkin, root-veg toppings. Higher-margin SKUs justify the seasonal effort.</li>
            <li><strong>Plan for Halloween:</strong> the peak day in autumn. Pre-promo, themed items, evening hours extended.</li>
            <li><strong>Watch the daylight drop:</strong> November evenings get dark at 16h. Patio dining dies; pivot to indoor / delivery emphasis.</li>
            <li><strong>Build the winter reserve:</strong> autumn is your last cash-positive season before winter. Save aggressively in October-November.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> autumn (Sep-Nov) volume multiplier. Default 0.95.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> autumn_orders/day = base × autumnMultiplier × ... composed with other weather levers.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Range:</strong> 0.85-1.05. Early autumn (Sep) often runs at 1.05; November typically 0.85. Multiplier averages across the quarter.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Polish gastronomic seasonality, owner-operator monthly variance, IMGW daylight-hour data.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> All Saints&apos; Day (1 Nov) revenue impact. Most pizzerias close — use the holidayClosed field separately.</p>
        </Methodology>
      </>
    ),
  },
  pizzasPerBake: {
    title: "Pizzas per bake cycle",
    body: (
      <>
        <p>
          Number of pizzas one oven cycle accommodates. Stefano Ferrara 6–9;
          multi-deck/conveyor 16+. Drives theoretical hourly capacity.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            One bake = how many pies side-by-side. A Ferrara holds
            <strong> 8 pizzas</strong>; a multi-deck conveyor holds
            <strong> 16+</strong>. If you&apos;re saturating the oven, going
            8 → 16 doubles theoretical capacity — but multi-decks cost
            <strong> ~80,000 zł</strong> and eat space. Usually a second truck
            is cheaper than a bigger oven.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Train the pizzaiolo to batch:</strong> 4-6 pies per bake vs 1-2 is the single biggest throughput lever. Cheap, fast, big impact.</li>
            <li><strong>Match orders to bakes:</strong> hold a tablet showing &quot;next 6 orders&quot; — the pizzaiolo prepares the batch together.</li>
            <li><strong>Pre-rotate dough during slow:</strong> portioned discs ready to stretch save 30-45s per pizza when the rush hits.</li>
            <li><strong>Oven layout matters:</strong> a deeper oven holds more but is harder to peel. Train on peel technique to max the capacity.</li>
            <li><strong>Second oven vs second truck:</strong> a second oven helps within one location; a second truck doubles your geographic reach. Different problems, different solutions.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> number of pizzas per single bake cycle. Default 8 (Stefano Ferrara). Multi-deck/conveyor 16+.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> theoretical pizzas/hour = pizzasPerBake × (3600 ÷ cycleTime) × ovenEfficiency.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Oven types &amp; capacity:</strong> Stefano Ferrara 8 pies, Marra Forni 6-9, Forno Bravo 4-6, multi-deck Lincoln 12-16, conveyor Middleby 16-20.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> oven manufacturer specs, AVPN production guides, Pizza University throughput data.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> uneven oven heat distribution (front vs back, hot spots). Real bakes need rotation; the model treats every slot as identical.</p>
        </Methodology>
      </>
    ),
  },
  cycleTime: {
    title: "Cycle time",
    body: (
      <>
        <p>
          Bake cycle in seconds. Neapolitan dough cooks ~90s at 450°C. Drives
          theoretical pizzas/hour.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Neapolitan = <strong>90 seconds at 450°C</strong>. Slower ovens
            (steel deck at 350°C) take 4-5 minutes — that&apos;s 3-4× slower and
            crushes capacity. If you&apos;ve calibrated for 90s but the oven
            actually runs 120s, the model overstates capacity by
            <strong> 33%</strong>. Chase the real number with a stopwatch on a
            Friday rush.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Stopwatch the actual time:</strong> measure 10 pizzas at peak. The real number is usually 15-30% longer than the recipe says.</li>
            <li><strong>Hotter oven = faster cycle:</strong> wood-fired Neapolitan at 480°C bakes in 60-75s; gas at 420°C is 90-110s.</li>
            <li><strong>Watch the dough hydration:</strong> wetter dough cooks faster but is harder to shape. 60-65% hydration is the Neapolitan sweet spot.</li>
            <li><strong>Recalibrate seasonally:</strong> winter cold-start ovens take longer to recover between bakes. Adjust cycle time in Dec-Feb.</li>
            <li><strong>If &gt;120s, audit the bake:</strong> peel technique, oven door discipline, dough drag — all add seconds.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> bake cycle in seconds. Default 90s (Neapolitan).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> theoretical pizzas/hour = pizzasPerBake × (3600 ÷ cycleTime) × ovenEfficiency.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Typical cycles:</strong> Neapolitan wood-fired 60-90s @ 450-480°C; gas deck 90-120s @ 350-420°C; conveyor 4-6 min @ 280-310°C (low-temp, high-throughput).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> AVPN standards, oven-manufacturer specs (Ferrara, Marra, Forno Bravo), pizzeria operations literature.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> oven recovery time after high-volume bakes (wood-fired ovens cool between rushes). Real cycle time creeps up in sustained peaks.</p>
        </Methodology>
      </>
    ),
  },
  ovenEfficiency: {
    title: "Realistic oven efficiency",
    body: (
      <>
        <p>
          % of theoretical bake capacity actually achieved. 20–35% on a real
          truck — pulls, sweeps, dough rebuilds, customer-facing time, plate-up
          all eat oven-adjacent time.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            The brochure says <strong>320 pizzas/hr</strong>; reality is
            <strong> ~70</strong>. Why? The pizzaiolo also takes orders, builds
            pizzas, wipes the peel, rebuilds dough balls, plates, hands across
            the counter, answers &quot;is this gluten-free?&quot;.
            <strong> 22% is default</strong>; veterans hit 30%; first-week crews
            limp along at 18%.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Add a runner to free the pizzaiolo:</strong> a runner does pre-build, plate-up, counter handoff. Lifts efficiency 4-8 pp.</li>
            <li><strong>Dedicated cashier at peak:</strong> separating order-taking from production lifts 2-4 pp.</li>
            <li><strong>Mise-en-place discipline:</strong> pre-portioned cheese, sliced toppings, ready dough — all save seconds per build.</li>
            <li><strong>Measure your real efficiency monthly:</strong> tickets baked ÷ theoretical. Watch the trend; if it&apos;s slipping, retrain.</li>
            <li><strong>Veterans hit 28-32%, newbies 15-20%:</strong> training is the highest-ROI investment in throughput.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> % of theoretical bake capacity actually achieved. Default 22%.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> realistic pizzas/hour = pizzasPerBake × (3600 ÷ cycleTime) × ovenEfficiency. Captures the gap between &quot;what the oven could do&quot; and &quot;what the pizzaiolo+oven combined actually do&quot;.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Realistic ranges:</strong> 15-20% first-week crews, 20-25% trained crew with single pizzaiolo, 28-35% multi-station with runner, 35-40% world-class chains with optimised mise-en-place.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> pizzeria operations time-and-motion studies, AVPN training data, owner-operator throughput audits.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> efficiency degradation late in shift (12+ hour shifts drop efficiency 5-10 pp by hour 10). Match shift-end with low-volume hours.</p>
        </Methodology>
      </>
    ),
  },
  unitCount: {
    title: "Unit count",
    body: (
      <>
        <p>
          Number of operating trucks. Setting ≥ 2 activates the fleet model
          (HQ overhead, supply discount, commissary, cannibalisation, royalty).
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            One truck = one P&amp;L. Five trucks = a chain with totally
            different economics — you suddenly have <strong>regional
            managers, supply contracts, central dough kitchens</strong>. The
            fleet panel shows the math. Don&apos;t set ≥ 2 unless you&apos;re
            seriously modelling growth — otherwise the numbers above will
            include franchise overhead you don&apos;t actually have.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Unit 2 is the hardest:</strong> you carry HQ overhead for two units but supply discounts haven&apos;t kicked in yet. Plan for 6-12 months of margin pressure.</li>
            <li><strong>Don&apos;t open Unit 2 within 1 km of Unit 1:</strong> cannibalisation is real. Use the cannibalisation lever to model the overlap.</li>
            <li><strong>Standardise before scaling:</strong> if your recipes/SOPs aren&apos;t documented, Unit 2 will not look like Unit 1. Customers notice.</li>
            <li><strong>Choose franchise vs corporate per unit:</strong> franchise = lower capex + royalty income; corporate = full margin + full risk. Plan the mix.</li>
            <li><strong>5 units is the magic number:</strong> below 5, HQ overhead drags. Above 5, scale economics start working.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> total operating trucks. Single unit = 1; chain mode activates at 2+.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Where it flows:</strong> activates the fleet panel showing HQ overhead allocation, supply discounts (kicks in at supplyDiscountAt), commissary savings (kicks in at commissaryAt), cannibalisation drag, royalty income (if franchised).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Critical-mass thresholds (PL casual-Italian):</strong> Unit 2-3 are hardest (cost layered without scale). Unit 4-5 unlocks supplier discounts. Unit 6-10 unlocks commissary economics. Above 10 = real chain.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> franchise economics literature (Justis &amp; Judd, Khan), PL chain post-mortems (Pizza Hut PL, Da Grasso, Telepizza).</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> location-specific revenue variance (Unit 5 in Gdańsk might do 70% of Unit 1 in Warsaw). Set unit count for the fleet structure; manually adjust per-unit revenue in real plans.</p>
        </Methodology>
      </>
    ),
  },
  hqOverhead: {
    title: "HQ overhead",
    body: (
      <>
        <p>
          Monthly cost of shared regional management, ops, finance. Spread
          across all units. Should fall below 5% of fleet revenue past 10
          units.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            A regional manager costs <strong>~15,000 zł/month</strong>. One
            truck doing 200,000 zł can&apos;t afford that (~7.5% of revenue —
            kills the margin). Five trucks doing 1M zł can (1.5%). HQ is
            <em> only</em> worth absorbing when you have units to spread it
            across — it&apos;s why the 2nd and 3rd truck always feel harder
            than the 5th.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Owner-operator the first 3:</strong> defer HQ overhead until unit 4-5. Owner doubles as regional manager.</li>
            <li><strong>Outsource finance early:</strong> a fractional CFO at 4,000 zł/month beats hiring full-time at 15k until you&apos;re at 5+ units.</li>
            <li><strong>Centralise the back-office:</strong> POS, marketing, accounting — one team across all units. Don&apos;t duplicate per-truck.</li>
            <li><strong>Target HQ &lt; 5% of fleet revenue:</strong> above 5% is dragging unit-level profitability. Restructure or absorb at higher volume.</li>
            <li><strong>Track HQ absorption monthly:</strong> as units grow, the % should fall. If it&apos;s rising, HQ growth is outpacing unit growth.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> monthly HQ overhead in zł (shared cost across all units).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> per-unit HQ overhead = hqOverhead ÷ unitCount. Deducted from each unit&apos;s EBITDA in the fleet panel.</p>
          <p style={{ margin: "0 0 4px" }}><strong>HQ overhead components:</strong> regional manager (~12-18k/mo), ops/finance/marketing leads (~10-15k each), shared software (~5-8k), accountant (~3-6k). Total typically 25-50k for a 5-10 unit chain.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Polish gastronomic chain financials, franchise system economics literature.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> step-function HQ hires. Going from 5 → 10 units doesn&apos;t double HQ — but going 10 → 20 might. Real HQ cost has staircase shape; the model treats it as linear allocation.</p>
        </Methodology>
      </>
    ),
  },
  royaltyPct: {
    title: "Royalty %",
    body: (
      <>
        <p>
          Franchise royalty taken from unit revenue. Industry norm 5–6%.
          Deducted from unit-level EBITDA.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            If you franchise the concept, you keep <strong>5–6% of every
            franchisee&apos;s revenue</strong>. On a 200,000 zł/month franchisee
            that&apos;s <strong>~11,000 zł/month per truck</strong> flowing
            back. Multiply by 20 trucks and you&apos;ve built a real business —
            but only if each franchisee still profits <em>after</em> the
            royalty.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Validate the franchisee P&amp;L first:</strong> if a franchisee can&apos;t net 8-12% AFTER paying you 5-6%, the franchise won&apos;t sell.</li>
            <li><strong>Tiered royalty by performance:</strong> 4% for first year, 5% second, 6% steady-state. Eases the early ramp.</li>
            <li><strong>Royalty + marketing combined &lt; 10%:</strong> above that, franchisees struggle. Industry sweet spot is 5% royalty + 2.5% marketing = 7.5% total.</li>
            <li><strong>Royalty income is real ops cash:</strong> use it to fund HQ, not as personal income. Otherwise scaling stalls.</li>
            <li><strong>Document the playbook before franchising:</strong> if a franchisee can&apos;t replicate from your manual, royalties collapse with quality.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> royalty % of franchisee revenue (default 5%).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> royalty income = franchisee revenue × royaltyPct, summed across all franchised units. Deducted from franchisee unit-level EBITDA.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Industry norms:</strong> QSR pizza chains 4-6% (Domino&apos;s 5.5%, Papa John&apos;s 5%, Telepizza 5.5%). Independent concepts: 5-7%.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> franchise disclosure documents (FDDs), Polish Franchise Association data.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> franchise fee (upfront, typically 30-80k zł). Treated separately in the buildoutLearning lever.</p>
        </Methodology>
      </>
    ),
  },
  marketingFund: {
    title: "Marketing fund %",
    body: (
      <>
        <p>
          Mandatory franchisee contribution to a shared marketing pool.
          Industry norm 2–3%.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Franchisees pay another <strong>2–3%</strong> into a national
            marketing pool (TV, Instagram, brand campaigns). On 200,000 zł
            revenue that&apos;s <strong>~5,000 zł/month</strong> per truck.
            Pooled across 20 trucks = 100,000 zł/month of marketing firepower —
            but the franchisee sees it as another fee on top of the royalty.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Spend the marketing fund visibly:</strong> franchisees lose patience if they pay 2.5% and don&apos;t see ad spend. Quarterly reports keep faith.</li>
            <li><strong>Mix local + national spend:</strong> 70% national brand campaigns, 30% allocated to franchisee local-area marketing. Both matter.</li>
            <li><strong>Earmark for digital, not legacy:</strong> Instagram/TikTok beats TV for casual-Italian audiences. Adjust the mix yearly.</li>
            <li><strong>Audit annually:</strong> some chains divert marketing-fund cash into HQ ops, which is contractually questionable. Stay clean.</li>
            <li><strong>Co-fund peak campaigns:</strong> Valentine&apos;s Day, summer aperitivo. Aligned spend across the fleet beats fragmented effort.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> mandatory marketing-fund contribution % of franchisee revenue (default 2.5%).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> marketing fund inflow = franchisee revenue × marketingFundPct. Pooled at HQ, spent on shared advertising/brand campaigns.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Industry norms:</strong> 2-3% for casual-Italian chains; sometimes 4% for heavy-marketing concepts (Pizza Hut historically 4%).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> franchise disclosure documents, Polish Franchise Association data.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> local-area marketing requirement (franchisees may also be required to spend 2-3% locally above the pooled fund). Add as separate variable cost if franchisees do this.</p>
        </Methodology>
      </>
    ),
  },
  supplyDiscountAt: {
    title: "Supply discount at",
    body: (
      <>
        <p>
          Number of units before wholesale suppliers offer COGS discounts.
          Typical threshold 4–5 units in PL food-service supply chains.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            A mozzarella supplier won&apos;t budge off list price for one
            truck. At <strong>4–5 trucks</strong> you&apos;re suddenly worth
            their sales-rep&apos;s time — they&apos;ll quote 8–12% off. That&apos;s
            why the 2nd and 3rd unit are often hardest (no scale yet) but the
            5th feels easy (supply margin kicks in).
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Negotiate when you cross 4 units:</strong> volume thresholds matter. Ask all key suppliers for the next-tier price.</li>
            <li><strong>Centralise ordering:</strong> one buyer for all units beats per-truck ordering. Volume leverage + admin saving.</li>
            <li><strong>Annual supplier reviews:</strong> renegotiate or switch yearly. Suppliers expect it; loyalty without leverage costs you.</li>
            <li><strong>Long-term contracts at thresholds:</strong> a 12-month commitment at 4+ units unlocks deeper discounts than month-to-month.</li>
            <li><strong>Push cheese hardest:</strong> ~35% of pizza COGS. A 10% discount on mozzarella = 3.5 pp COGS reduction across the fleet.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> minimum unit count to qualify for supply discount (default 4).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> if unitCount &gt;= supplyDiscountAt, apply supplyDiscountPct to base COGS. Below threshold, no discount.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Polish supplier-tier patterns:</strong> 1-3 units = list price; 4-7 units = 5-8% off list; 8-15 units = 10-12% off + payment terms; 15+ units = bespoke contracts, possibly &gt;15% off.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Polish food-service distribution reports (Makro, Eurocash), chain-supply negotiations literature.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> single-supplier risk (concentrating all volume on one cheese supplier means a 100% disruption if they fail). Discount comes with concentration risk.</p>
        </Methodology>
      </>
    ),
  },
  supplyDiscountPct: {
    title: "Supply discount %",
    body: (
      <>
        <p>
          COGS reduction once the supply-discount threshold is reached. −8 to
          −12% typical.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            When supply discount activates at <strong>10%</strong>, your 30%
            food cost drops to <strong>27%</strong>. On 1M zł of fleet revenue
            that&apos;s <strong>~30,000 zł/month back</strong> across the
            fleet — almost pays a regional manager by itself. Cheese is the
            biggest line, so push hardest on the dairy supplier first.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Don&apos;t pocket the saving — reinvest some:</strong> if COGS drops 3pp, reinvest 1pp into recipe quality. Customers reward perceptible upgrades.</li>
            <li><strong>Pass-through pricing for franchisees:</strong> centralised supply at HQ discount, sold to franchisees at slight markup. Earns HQ + saves franchisees.</li>
            <li><strong>Hedge cheese specifically:</strong> annual contracts at the discounted rate insulate against spike years.</li>
            <li><strong>Audit per-supplier:</strong> not all discount equally. Cheese and flour are easier; specialty (truffle, prosciutto) usually doesn&apos;t budge.</li>
            <li><strong>Quarterly review:</strong> as you grow, push for the next tier. Loyalty doesn&apos;t get rewarded — leverage does.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> COGS reduction % when fleet qualifies for supply discount (default 10%).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> if unitCount &gt;= supplyDiscountAt: effective COGS = baseCOGS × (1 − supplyDiscountPct). Otherwise no change.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Realistic discount sizes:</strong> 6-9% at first tier (4-7 units), 10-13% mid-tier (8-15 units), 15-20% at scale (15+ units, bespoke contracts). Cheese: highest discount headroom. Specialty ingredients: lowest.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Polish food-service supply margin data, chain procurement case studies, Makro/Eurocash wholesale-tier pricing.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> discount distribution across ingredient lines. The model applies uniform reduction; in reality cheese might be −12% while flour is only −3%. Calibrate to your supplier mix.</p>
        </Methodology>
      </>
    ),
  },
  commissaryAt: {
    title: "Commissary at",
    body: (
      <>
        <p>
          Units before centralised dough/sauce production becomes cost-positive.
          Typically 4+ units.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            A central kitchen making all the dough + sauce only makes sense
            with <strong>4+ trucks</strong> to feed — below that, the
            commissary fixed cost eats more than it saves. At 6–8 trucks the
            economics flip: same quality, same recipe everywhere,
            <strong> 3–6 pp of COGS</strong> clawed back fleet-wide.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Start with just dough:</strong> central dough production is the highest-leverage commissary win. Add sauce and pre-portioned cheese later.</li>
            <li><strong>Locate centrally:</strong> a commissary in the middle of your delivery radius cuts logistics. 30-min max to any truck.</li>
            <li><strong>Hire a head commissary chef:</strong> separates dough discipline from per-unit chaos. Worth the 8-10k zł/month.</li>
            <li><strong>Cold-chain logistics matter:</strong> dough needs &lt;6°C transport. Refrigerated van or daily delivery rounds — budget the operating cost.</li>
            <li><strong>HACCP from day 1:</strong> central production multiplies food-safety risk. Get certified before launching.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> minimum unit count before commissary becomes net-positive (default 4).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> if unitCount &gt;= commissaryAt: apply commissarySaving as a COGS reduction. Otherwise commissary cost outweighs benefit.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Commissary break-even math:</strong> ~15-25k zł/month commissary fixed cost (rent + 1 chef + utilities). To net-positive at 4 trucks: each truck must save ~5-7k zł/month from central production (i.e. 3-4 pp COGS).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> commissary case studies (Polish chains: Pizzeria 105, Da Grasso), QSR supply-chain literature.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> quality-consistency benefit (commissary recipes are uniform; per-unit production drifts). The model captures the COGS saving but not the customer-perception lift.</p>
        </Methodology>
      </>
    ),
  },
  commissarySaving: {
    title: "Commissary saving",
    body: (
      <>
        <p>
          COGS reduction from centralised production, net of commissary
          run-rate cost (rent, equipment, labor). ~3–6 pp typical.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            A commissary saves <strong>~4 pp of COGS</strong> (bulk purchasing,
            less waste, consistent recipe) — but subtract the central kitchen&apos;s
            own running cost. On a fleet doing 1.5M zł/month that&apos;s
            <strong> ~60,000 zł gross saving, ~30,000 zł net</strong> after the
            facility&apos;s own bills.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Use the saving to subsidise quality:</strong> if you save 4 pp COGS, reinvest 1 pp into better cheese / flour. Customers notice — the model doesn&apos;t see the upside but it shows in repeat rate.</li>
            <li><strong>Capture supplier rebates centrally:</strong> commissary buys volume; HQ keeps end-of-year rebates. Adds another 1-2 pp on top of the headline saving.</li>
            <li><strong>Reduce waste through forecasting:</strong> central production lets you forecast precisely. Per-truck production over-builds &quot;just in case&quot;.</li>
            <li><strong>Standardise the recipe books:</strong> commissary forces this; do it before launching the central kitchen.</li>
            <li><strong>Don&apos;t over-promise:</strong> commissary saving NET of fixed cost. Gross 4 pp can be net 2 pp at a small fleet — model both honestly.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> NET commissary saving as a COGS % reduction (default 4 pp, after subtracting commissary&apos;s own operating cost).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> effective COGS = baseCOGS − commissarySaving (in pp), applied only when unitCount &gt;= commissaryAt.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Decomposition:</strong> gross saving ~6-8 pp (bulk + waste + consistency); operating cost ~2-4 pp; net ~3-5 pp at fleet maturity.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> commissary economics literature, Polish chain post-mortems, QSR commissary studies.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> commissary CAPEX (a central kitchen costs 250-500k to build out). Add as a separate fleet-level setup cost in the multi-unit scenario.</p>
        </Methodology>
      </>
    ),
  },
  dmaCannibalisation: {
    title: "DMA cannibalisation",
    body: (
      <>
        <p>
          Revenue % a new unit takes from prior units in the same trade area.
          Modelled as (1 − pct)^(n−1) retained.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Open truck #2 across town and the existing one doesn&apos;t keep
            all its customers — maybe <strong>15% peel off</strong> to the new
            pitch. That&apos;s a real revenue hit you have to model honestly,
            otherwise multi-unit ROI looks artificially great. The cure is
            opening in a different city, not next door.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Choose new units &gt; 3 km from existing:</strong> below 3 km, cannibalisation typically 15-25%; above 5 km, &lt;10%.</li>
            <li><strong>Different daypart focus:</strong> if Unit 1 is lunch-led, position Unit 2 as evening-led. Reduces overlap.</li>
            <li><strong>Different demographic:</strong> office vs residential vs tourist. Same brand, different customer base.</li>
            <li><strong>Measure post-opening:</strong> Unit 1 revenue 30 days before vs after Unit 2 opens. The drop = your real cannibalisation.</li>
            <li><strong>Use it to model honestly to investors:</strong> presenting Unit 2 economics without cannibalisation gets you torn apart in due diligence.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> % of new-unit revenue cannibalised from prior units in same trade area (default 15%).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> effective per-unit revenue = baseRevenue × (1 − dmaCannibalisation)^(n−1) where n = number of overlapping units. The geometric formula reflects diminishing per-unit revenue as units cluster.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Realistic ranges:</strong> Same neighbourhood (&lt; 1 km): 25-40% cannibalisation. Same city, different district (3-5 km): 8-15%. Different city: 0-3% (residual brand effect only).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> trade-area analysis literature (Applebaum, Reilly), QSR cannibalisation case studies (Domino&apos;s, Starbucks density studies).</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> brand-density benefits (high-density clusters can have a marketing flywheel effect). Some chains deliberately cluster to dominate a district.</p>
        </Methodology>
      </>
    ),
  },
  buildoutLearning: {
    title: "Build-out learning curve",
    body: (
      <>
        <p>
          Setup-cost reduction per added unit, applied as (1 − learning)^(n−1).
          Reflects supplier rolodex, permit familiarity, build-team efficiency.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Your first truck cost <strong>300,000 zł</strong> because you made
            every rookie mistake (wrong oven, missing permits, paid retail).
            The fifth one costs maybe <strong>210,000 zł</strong> — same spec,
            known vendors, no surprises. <strong>30% off setup</strong> at
            scale, which compounds with the supply discount.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Document every cost in unit 1:</strong> the buildout log becomes the playbook for unit 2-3.</li>
            <li><strong>Single buildout team:</strong> hire one contractor + repeat. They learn your spec, save 10-15% on labor and time.</li>
            <li><strong>Standardise the kit:</strong> same oven, same fridge, same POS across all units. Bulk-buy savings + zero training overhead.</li>
            <li><strong>Pre-negotiate volume contracts:</strong> if you commit to 4 ovens / 4 fridges over 2 years, manufacturers offer 10-15% off list.</li>
            <li><strong>Test the playbook on unit 2:</strong> the second unit is where you find the gaps. Better to discover with #2 than #5.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> learning-curve reduction % per added unit. Default 8% (each unit ~8% cheaper than the previous).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> setup_cost(n) = setup_cost(1) × (1 − buildoutLearning)^(n−1), floored at buildoutFloor% of unit 1.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Realistic ranges:</strong> 5-12% per unit; chains tend toward the lower end (8%); fast-growing concepts hit 10-12% as the playbook tightens.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Wright&apos;s learning-curve theory, manufacturing &amp; construction learning-rate literature, QSR rollout case studies.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> learning loss with team turnover. If the build team changes between units 3 and 4, learning resets. Stable teams compound; rotating teams don&apos;t.</p>
        </Methodology>
      </>
    ),
  },
  buildoutFloor: {
    title: "Build-out floor",
    body: (
      <>
        <p>
          Minimum unit setup cost as % of unit 1. Caps the learning-curve
          benefit so the model doesn&apos;t simulate &quot;20th truck costs
          nothing&quot;.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Even the 50th truck still costs <em>something</em> — oven,
            vehicle and permits have a hard floor. The model caps the learning
            curve at <strong>~60–70% of unit 1</strong>, so build-out savings
            taper instead of going to zero. Keep this honest or the fleet
            payback math turns into fantasy.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Inflation-proof your floor:</strong> minimum setup cost rises 5-8%/year. Update the floor annually.</li>
            <li><strong>Identify the hard-cost line:</strong> vehicle (40-50k), oven (35-55k), permits (10-15k) — these don&apos;t shrink with scale. They&apos;re the floor.</li>
            <li><strong>Used trucks bend the floor:</strong> a fleet of 5-yr-old trucks (40-50k each) drops the floor 30% vs new. Trade-off: more maintenance.</li>
            <li><strong>Modular buildouts:</strong> standardised interior modules from one fabricator drop the floor more than the learning curve alone.</li>
            <li><strong>Keep the model honest:</strong> if the model says unit 30 costs 80k, you&apos;ll plan for fantasy. The floor enforces reality.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> minimum setup cost as % of unit 1 (default 60%).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> setup_cost(n) = max(unit1 × (1 − learning)^(n−1), unit1 × buildoutFloor).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Realistic floor:</strong> 55-70% of unit 1. The floor reflects unavoidable hard costs: truck/vehicle, oven, permits, ZUS startup ZUS costs. Even with perfect learning curve, you can&apos;t buy a working pizza truck for &lt;55% of the first one.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> manufacturing learning-curve floor analyses (Boston Consulting Group), pizzeria buildout cost decomposition.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> regulation tightening over time (PL gastronomic permits inflated 2020-2024). The floor might rise even at scale; track if you&apos;re building in 2026+.</p>
        </Methodology>
      </>
    ),
  },
  rainyShare: {
    title: "Rainy-day share",
    body: (
      <>
        <p>
          Fraction of days in a typical month with significant rain. Warsaw
          average ~30% (autumn/winter higher, summer lower).
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Warsaw has rain on roughly <strong>1 day in 3</strong>. At a 0.55
            rainy-day multiplier on an 80-order baseline, each rainy day costs
            ~50 zł × ~44 lost orders = ~2,200 zł in revenue. Across the
            <strong> ~9 rainy days/month</strong> that&apos;s
            <strong> ~20,000 zł the weather extracts</strong> from a normal
            truck. Knowing this matters before you sign a no-shelter pitch
            lease.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Adjust seasonally:</strong> rainy share is ~25% in summer, ~38% in autumn/winter. Don&apos;t use one annual average if you can flex.</li>
            <li><strong>Calibrate to your location:</strong> Gdańsk 35%, Warsaw 30%, Kraków 28%, Wrocław 30%. IMGW regional data published quarterly.</li>
            <li><strong>Indoor pitch shifts the math:</strong> if your unit is inside a mall food court, set rainyShare to a fraction (10-15%) since rain doesn&apos;t affect access.</li>
            <li><strong>Cross-check with your actual data:</strong> overlay 90 days of POS revenue with weather. Calibrate the share to what you actually saw.</li>
            <li><strong>Climate change creep:</strong> PL rainy days have crept up 3-5% over the past decade. Future projections should account.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> share of days with meaningful rain (default 30% Warsaw avg).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> effective volume = base × (rainyShare × rainyMultiplier + (1 − rainyShare) × 1.0). Composes with other weather levers.</p>
          <p style={{ margin: "0 0 4px" }}><strong>IMGW regional averages (PL, annual):</strong> Warsaw 30%, Kraków 28%, Gdańsk 35%, Wrocław 30%, Poznań 28%, Lublin 26%, Zakopane 40%.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> IMGW Polish meteorological service, EU Copernicus climate data, owner-operator weather logs.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> rain intensity (drizzle vs downpour). A 30% share including drizzle is gentler than 30% all-downpour. Calibrate the rainyMultiplier to your blended rain experience.</p>
        </Methodology>
      </>
    ),
  },
  heatwaveShare: {
    title: "Heatwave evening share",
    body: (
      <>
        <p>
          Share of evenings hot enough (typically 25°C+ at 19:00) to fire the
          heatwave volume bonus. Warsaw annual avg ~10%; ~30% in Jun–Aug.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            A real heatwave evening only happens <strong>~1 in 10
            nights</strong> averaged annually (closer to 3 in 10 in summer).
            When it fires, dinner does <strong>+40%</strong> — ~30 extra
            orders × ~30 zł margin =
            <strong> ~900 zł of one-night bonus</strong>. Put staff on call for
            hot-Friday forecasts and you&apos;ll capture it routinely.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Use weather forecast for staffing:</strong> 25°C+ predicted = add an extra staff member 48h ahead.</li>
            <li><strong>Pre-stock spritz ingredients:</strong> Aperol shortage on the hottest night of summer is criminal.</li>
            <li><strong>Patio expansion in summer:</strong> rent extra outdoor furniture for the heatwave months. The marginal cost is small vs the upside.</li>
            <li><strong>Climate shift:</strong> heatwave share is rising 2-4 pp/decade in PL. Future-proof by building outdoor capacity now.</li>
            <li><strong>Calibrate to your pitch:</strong> a downtown patio captures heatwaves; a delivery-only kitchen doesn&apos;t benefit. Set the multiplier accordingly.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> share of evenings hot enough (25°C+ at 19h) to fire the heatwave bonus (default 10% annual avg).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> effective volume = base × (heatwaveShare × heatwaveMultiplier + (1 − heatwaveShare) × 1.0). Composed in the seasonality stack.</p>
          <p style={{ margin: "0 0 4px" }}><strong>IMGW heatwave averages (PL, annual %):</strong> Warsaw 10%, Kraków 12%, Wrocław 14%, Poznań 11%, Gdańsk 7% (coastal cooler), Lublin 12%.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> IMGW Polish meteorological data 2014-2024, Eurostat climate-change indicators.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> 35°C+ extreme heat that REDUCES rather than lifts volume. The model assumes 25-32°C moderate heat; extreme heat is a separate (negative) effect not currently captured.</p>
        </Methodology>
      </>
    ),
  },
  peakDayMultiplier: {
    title: "Peak day multiplier",
    body: (
      <>
        <p>
          Volume multiplier applied to designated peak calendar days
          (Valentine&apos;s, NYE, Black Friday, Mother&apos;s Day). Default
          1.60.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>5 peak days/year at 1.60×</strong> is the difference
            between &quot;Valentine&apos;s was nice&quot; and &quot;Valentine&apos;s
            paid the rent&quot;. If a normal day does 80 × 65 = 5,200 zł, a
            peak day does <strong>~8,300 zł</strong> — five such days are
            <strong> ~15,000 zł of bonus revenue</strong>. Over-staff: huge
            upside. Under-staff: you blow the line in front of 30 dates.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Pre-book reservations:</strong> open Valentine&apos;s / Mother&apos;s Day booking 2 weeks ahead. Eliminates walk-in chaos.</li>
            <li><strong>Limited menu for peak days:</strong> 5-6 SKUs only. Faster line, higher throughput, less stress.</li>
            <li><strong>Over-staff deliberately:</strong> +1 cook, +1 runner. Cost of overrun &lt; cost of blown-up service.</li>
            <li><strong>Pre-portion everything:</strong> day before, ready to assemble. Saves 30-45 min of prep on the day.</li>
            <li><strong>Plan peak calendar 90 days ahead:</strong> Valentine&apos;s, Mother&apos;s Day, NYE, BF — staffing + menu + marketing locked early.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> volume multiplier for designated peak calendar days (default 1.60 = +60%).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> peak_day_orders = base_orders × peakDayMultiplier. Stacked with other multipliers (e.g. Valentine&apos;s on a Friday compounds).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Typical multipliers:</strong> Valentine&apos;s Friday 2.0-2.5×; NYE 1.5-2.0× (early dinner only); Mother&apos;s/Father&apos;s Day 1.6-1.8×; Halloween/BF 1.2-1.4×.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> POS-data composites from Italian-style PL chains, OpenTable peak-day analytics, holiday-dining surveys.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> capacity ceiling (you might WANT 2.5× but your oven caps at 1.5×). Cross-check the peak multiplier against your kitchen-saturation KPI.</p>
        </Methodology>
      </>
    ),
  },
  eventDayMultiplier: {
    title: "Event day multiplier",
    body: (
      <>
        <p>
          Volume multiplier on booked event days (food-truck rally, festival,
          sport game, concert). Default 1.50.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Food-truck rally? Concert near the pitch? Two event days/month at
            <strong> 1.50×</strong> adds <strong>~10,000 zł of monthly
            revenue</strong> without changing anything except the calendar.
            Different from peak days: events you can BOOK, peaks you just GET.
            Some trucks build their entire annual P&amp;L around
            <strong> 20–30 event weekends</strong> — the only question is how
            aggressively you chase them.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Build a dedicated event team:</strong> 1 truck + 1 dedicated trailer for events. Don&apos;t cannibalise your pitch for festival weekends.</li>
            <li><strong>Pre-cost the event:</strong> vendor fee + transport + extra labor + spoilage risk. Net only worth it if multiplier &gt;= 1.6×.</li>
            <li><strong>Book 6-12 months ahead:</strong> top festivals (Nocny Market, Krakow Live, OFF) book vendors way out. Late booking = worse slots.</li>
            <li><strong>Repeat events build loyalty:</strong> being &quot;the pizza truck&quot; at a recurring market 8 weekends/year compounds with brand recognition.</li>
            <li><strong>Track event ROI:</strong> tag event-day POS data. If your effective multiplier is &lt;1.4× on a given event, drop it next year.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> volume multiplier for booked event days (default 1.50).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> event_day_orders = base_orders × eventDayMultiplier. Stacks with weekend/peak multipliers if event happens on a peak day.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Realistic ranges:</strong> small street fair 1.3-1.5×, food-truck rally 1.6-2.0×, major festival 2.0-3.0×, concert / sports event with captive audience 2.5-4.0×. Calibrate per event type.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Polish food-truck event-revenue surveys, festival vendor-revenue reports, owner-operator event ROI analysis.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> vendor fees (often 3-10k zł per event). Subtract from event revenue to get true ROI. Some events have hidden costs (mandatory marketing fee, exclusivity contracts).</p>
        </Methodology>
      </>
    ),
  },

  // Headline KPIs
  monthlyRevenue: {
    title: "Monthly revenue",
    body: (
      <>
        <p>
          Total revenue per month = orders/day × avg ticket × days open.
          Headline top-line — everything below is some flavour of cost or margin.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            The biggest number you&apos;ll see — total cash flowing in before
            any costs come out. <strong>80 orders/day × 65 zł × 28 days = ~146,000
            zł/month</strong> of gross revenue. Doubling this is hard; doubling
            your <em>profit</em> from this is much easier through margin work.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Don&apos;t fixate on revenue alone:</strong> a 200k truck at 10% margin nets 20k; a 150k truck at 18% margin nets 27k. Profit, not revenue, is the goal.</li>
            <li><strong>Grow revenue 3 ways:</strong> more orders (marketing), higher ticket (attach), more days (extend hours). Pick the cheapest lever.</li>
            <li><strong>Watch for revenue ceiling:</strong> if marketing isn&apos;t lifting orders, capacity might be the cap. Check kitchen saturation.</li>
            <li><strong>Net revenue vs gross:</strong> Glovo/Wolt show gross order value; the cash you bank is after commission. Use net for comparisons.</li>
            <li><strong>Track revenue trend, not single month:</strong> compare 90-day rolling vs prior period. Single-month noise hides the trajectory.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> monthly revenue = orders/day × avg ticket × days/month × weather&amp;event multipliers. Net of attach lever ticket lifts.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy Polish casual-Italian truck revenue:</strong> 100-180k zł/month single truck; 200-300k+ for premium central locations.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Polish gastronomic-sector revenue benchmarks, food-truck association data.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> revenue from non-pizza streams (catering, special events, branded merchandise). Add as separate line if material.</p>
        </Methodology>
      </>
    ),
  },
  totalCost: {
    title: "Total cost",
    body: (
      <>
        <p>
          COGS + labor + fixed + variable leakage (waste, refund, fees,
          loyalty). Everything that doesn&apos;t end up as net profit.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            Every złoty in the truck that doesn&apos;t end up in your pocket.
            On 200,000 zł revenue, total cost usually sits at
            <strong> 160,000–180,000 zł</strong> — so net profit is the last
            10–20%. Tighten any single line by 1pp =
            <strong> ~2,000 zł/month more profit</strong>.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Diagnose the biggest line first:</strong> COGS at 35%? Audit recipes. Labor at 35%? Audit schedule. Don&apos;t scatter effort.</li>
            <li><strong>Watch the variable leakage:</strong> waste + refunds + loyalty often add to 4-6% combined. Each pp tightened = 1pp net margin.</li>
            <li><strong>Compare to prior month, not budget:</strong> budgets get out of date. Last 30 days vs prior 30 days is the live diagnostic.</li>
            <li><strong>Fixed costs &lt; 10% of revenue ideal:</strong> above that, you&apos;re too rent-heavy. Renegotiate or relocate.</li>
            <li><strong>Cost % matters more than cost zł:</strong> growing revenue while holding cost % flat is the cleanest path.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> total cost = COGS + labor + fixed + variable leakage (waste + refunds + card fees + loyalty burn). Sum of all P&amp;L cost lines.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy split (Polish casual-Italian):</strong> COGS 28-32%, labor 25-30%, fixed 6-10%, leakage 4-6%. Total: 65-78% of revenue. Net profit: 22-35% (rare for &gt;30 to be sustainable).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> NRA Industry Operations Report, PHG benchmark data.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> founder opportunity cost (your unpaid hours). Add ~5-10k zł/month mentally to value your own time honestly.</p>
        </Methodology>
      </>
    ),
  },
  netProfit: {
    title: "Net profit",
    body: (
      <>
        <p>
          Bottom-line monthly profit after all variable + labor + fixed costs,
          before tax. Drives owner take-home, cash-on-cash and payback.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            The only number that ends up in your bank. Everything above it is
            just bookkeeping. A healthy truck nets <strong>15–25% of
            revenue</strong> — under 10% and you&apos;re working too hard for
            too little. Track this monthly; the rest is diagnostics.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Pay yourself first:</strong> set up auto-transfer of 30% of net profit to a separate account on month-end. Otherwise it gets spent.</li>
            <li><strong>Build a 3-month reserve:</strong> winter cash crunch ruins businesses that don&apos;t save during peak. Aim for 3× monthly fixed costs in reserve.</li>
            <li><strong>Re-invest 20% in growth:</strong> equipment upgrades, marketing, training. Compounds the next year.</li>
            <li><strong>Watch CIT exposure:</strong> 9% small-CIT below €2M; 19% above. Net is BEFORE tax — actual take-home is net × (1 − CIT%).</li>
            <li><strong>Track net profit margin trend:</strong> if it&apos;s eroding 1pp/quarter, you&apos;re losing the inflation race. Re-price or cut costs.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> net profit = revenue − COGS − labor − fixed − variable leakage − D&amp;A − interest. Before CIT.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy margin ranges:</strong> 8-12% net = average; 12-18% = good; 18-25% = excellent; 25%+ = exceptional (or you&apos;re missing a cost).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> NRA pizza-segment benchmarks (typically 8-15% net), Polish PHG data, Bain restaurant-economics reports.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> personal income tax (PIT) for sole proprietors. The model shows pre-tax net; sole proprietors face progressive PIT (12-32%) on top.</p>
        </Methodology>
      </>
    ),
  },
  breakEvenKpi: {
    title: "Break-even (orders/day)",
    body: (
      <>
        <p>
          Orders/day required to cover all labor + fixed + variable costs.
          Below = loss, above = profit. Headline buffer metric.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            The <strong>minimum you have to sell</strong> to not lose money. If
            it&apos;s 45 orders/day and you&apos;re doing 60, you have a 33%
            safety cushion. If you&apos;re doing 50, one slow week sinks the
            month. The cushion <em>is</em> the business.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Compute break-even daily, not monthly:</strong> a 45 orders/day number is more actionable than &quot;1,260 orders/month&quot;. Use it as the live target.</li>
            <li><strong>Visualise on the KDS:</strong> a counter showing orders-to-break-even gives the team a live target.</li>
            <li><strong>Lower break-even = more flexibility:</strong> every 1 order/day off break-even gives you ~1.5% safety margin. Cut fixed costs to shrink the floor.</li>
            <li><strong>Reset on rent changes:</strong> a 1,000 zł/month rent hike adds ~1.5 orders/day to break-even. Negotiate hard.</li>
            <li><strong>Compare across months:</strong> break-even shouldn&apos;t move much. If it&apos;s creeping up, costs are inflating faster than tickets.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> break-even orders/day = (fixed + labor) ÷ (avg ticket × contribution margin × days). Contribution margin = 1 − COGS% − payment-fee% − variable-leakage%.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy range:</strong> 35-50 orders/day break-even for a Polish pizza truck. Below 30 indicates super-low fixed costs (suburban pitch); above 55 = structural fragility.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> standard break-even theory, restaurant unit-economics literature.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> demand variability (some days hit break-even, others don&apos;t). Average break-even hides daily volatility; use the sensitivity card to stress-test.</p>
        </Methodology>
      </>
    ),
  },

  // Operations KPIs (individual tiles)
  foodCostPct: {
    title: "Food cost % revenue",
    body: (
      <>
        <p>
          COGS as % of revenue. QSR target ≤ 30%. Sensitive to menu mix,
          portion control, supplier prices.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            For every 100 zł you sell, this is how much was food cost. Industry
            target: <strong>≤ 30%</strong>. At 35% you&apos;re either
            over-portioning or your supplier is squeezing you — a 5pp drop =
            <strong> ~10,000 zł/month back</strong> on a 200,000 zł revenue.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Cheese is the leverage point:</strong> 35-45% of pizza COGS. Cut 5% on the cheese = ~1.5pp on total food cost.</li>
            <li><strong>Re-cost every recipe quarterly:</strong> ingredient prices drift. Bumps to menu prices follow recipe-cost increases.</li>
            <li><strong>Standardise portions:</strong> +5g cheese per pizza × 2,400 pizzas = 12kg/month wastage. Train + weigh + spot-check.</li>
            <li><strong>Audit waste daily:</strong> if dough waste &gt;3%, your hourly forecast is off. Tighten the batch plan.</li>
            <li><strong>Track per-menu-item COGS%:</strong> some items run 40%, others 20%. Push the low-COGS items in marketing &amp; menu placement.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> food cost % = COGS ÷ revenue. COGS = Σ (recipe cost × menu mix × volume) + variable food costs (waste, employee meals).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Industry targets:</strong> ≤ 28% world-class chains, 30% healthy independent, 32%+ requires intervention. Polish pizza-segment benchmark: 28-32%.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> NRA Industry Operations Report, PHG Polish gastronomic benchmarks, Italian pizzeria economics studies.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> per-channel COGS variance (delivery COGS includes packaging differently). Track separately if delivery share is &gt;30%.</p>
        </Methodology>
      </>
    ),
  },
  laborCostPct: {
    title: "Labor cost % revenue",
    body: (
      <>
        <p>
          Total labor (incl. ZUS narzut) as % of revenue. QSR target ≤ 30%; hard
          cap at 35%.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            For every 100 zł you sell, this is how much went to
            <strong> wages + ZUS</strong>. Target ≤ 30%. Past 35% you&apos;re
            either overstaffed for the volume or under-pricing the menu — the
            math doesn&apos;t lie, and the staff Christmas bonus depends on this
            number.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Adjust schedule, not headcount:</strong> over-staffing 2 hours/day × 5 days × 4 weeks = 40h/month per role. Trim shift edges first.</li>
            <li><strong>Cross-train for fewer roles:</strong> a pizzaiolo who can run the till saves a half-shift cashier. Pay slightly more, save more.</li>
            <li><strong>Watch labor:revenue every week:</strong> if it&apos;s drifting up, demand might be softening or schedule is rigid. Catch within 14 days.</li>
            <li><strong>Productivity beats headcount cuts:</strong> 10% more revenue/labor-hour is better than 10% fewer hours. Train + tool.</li>
            <li><strong>Owner labor = real labor:</strong> if you work 40h/week unpaid, the model under-states labor. Add a notional owner-wage line.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> labor % = total brutto labor (incl. ~22% ZUS narzut) ÷ revenue.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Industry targets:</strong> ≤ 25% world-class chains, 28-30% healthy independent, 35%+ requires action. PL casual-Italian benchmark: 27-32%.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> NRA labor benchmarks, ZUS rates 2024, PHG annual gastronomic-employer surveys.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> tips received by staff (don&apos;t flow through P&amp;L but lift effective pay). Useful when retaining staff but not in margin math.</p>
        </Methodology>
      </>
    ),
  },
  primeCostPct: {
    title: "Prime cost % revenue",
    body: (
      <>
        <p>
          Food + labor combined as % of revenue. The single most-watched number
          in restaurant ops; ≤ 60–65% is healthy.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>The one number to memorize.</strong> Under 60% you breathe,
            at 65% you&apos;re working for the staff, past 70% you close. Each
            <strong> 1pp drop = ~2,000 zł/month</strong> back at typical volumes.
            Old restaurateurs scribble this number on their fridge mirror.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Make the team see it:</strong> a single dashboard number visible to the whole kitchen. Alignment around one KPI moves it.</li>
            <li><strong>Trade-off: lower one, accept higher other:</strong> sometimes lower food cost requires more labor (made from scratch). The combined number is what counts.</li>
            <li><strong>Re-engineer when prime &gt; 65%:</strong> it&apos;s not a wage cut or supplier squeeze — it&apos;s a menu/operations redesign issue.</li>
            <li><strong>Beware the false comfort of prime &lt; 55%:</strong> often means you&apos;re paying too little (high turnover) or under-portioning (customer complaints).</li>
            <li><strong>Set a 60% target line on the dashboard:</strong> visual reminder; everyone knows when they&apos;re above or below.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> prime cost % = (food + labor) ÷ revenue. The most-tracked operational KPI in restaurant management.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Industry targets:</strong> ≤ 55% world-class QSR chains; 60% healthy independent; 65% acceptable; &gt; 70% restructure or close.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> NRA Restaurant Industry Operations Report, Schmidgall &quot;Hospitality Industry Managerial Accounting&quot;, the universal-benchmark of restaurant ops literature.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> seasonal variance — winter prime might be 68% while summer is 55%. Annual averages can hide trouble; check monthly.</p>
        </Methodology>
      </>
    ),
  },
  contributionMargin: {
    title: "Contribution margin",
    body: (
      <>
        <p>
          Share of revenue left after every variable cost (COGS, packaging,
          waste, refunds, loyalty burn, payment fees, marketing CAC). Honest
          cash-drop per złoty of sales.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            For every 100 zł sold, this is <strong>how much survives</strong>
            after all variable costs. <strong>50%+ is healthy</strong>; below
            40% the truck is structurally unprofitable — every order is
            value-destructive even before labor and rent. Fix recipes or
            re-price before opening day 1.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Track per-item contribution:</strong> some pizzas contribute 60%, others 35%. Push the high-CM items in menu placement &amp; marketing.</li>
            <li><strong>Cut low-CM items:</strong> if an item runs &lt; 40% CM after all variable costs, it&apos;s subsidising — restrict or remove.</li>
            <li><strong>Channel matters:</strong> on-site CM might be 55%, Glovo CM might be 35%. Track separately when making channel decisions.</li>
            <li><strong>Inflation compresses CM:</strong> recompute monthly. If CM drops 2pp over 6 months, re-price or re-engineer.</li>
            <li><strong>Use CM for &quot;is this worth it?&quot; decisions:</strong> a 5,000 zł marketing campaign needs to generate ~10k incremental revenue at 50% CM to justify.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> contribution margin % = 1 − (COGS + packaging + waste + refunds + loyalty burn + payment fees) ÷ revenue.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges:</strong> 50-55% world-class; 45-50% healthy; 40-45% pressured; &lt; 40% structurally unprofitable. PL casual-Italian benchmark: 47-52%.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> restaurant managerial-accounting literature (Schmidgall), NRA industry-economics data.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> CAC (customer acquisition cost) as a variable. The model treats marketing as fixed; if you scale CAC with volume, CM contracts.</p>
        </Methodology>
      </>
    ),
  },
  marginOfSafety: {
    title: "Margin of safety",
    body: (
      <>
        <p>
          (Actual revenue − break-even revenue) ÷ actual revenue. The buffer
          before going underwater.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>How much revenue can drop before you go red.</strong> Below
            10% one bad week wipes you out; above 25% is comfortable. If
            it&apos;s 8% and a competitor opens nearby, start defensive moves
            <em> now</em> — don&apos;t wait for the first red month.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Target ≥ 20%:</strong> survives most one-off shocks (rainy 2 weeks, slow January). Below 15% you&apos;re running on luck.</li>
            <li><strong>Track quarterly:</strong> seasonality + inflation can erode MoS quietly. Reset the target each quarter.</li>
            <li><strong>Build MoS through cost cuts first:</strong> reducing fixed costs shrinks break-even; growing revenue grows MoS. Both matter.</li>
            <li><strong>Use it for hiring decisions:</strong> if a new hire raises break-even by 3 orders/day, you need MoS ≥ 10% AFTER the hire to be safe.</li>
            <li><strong>Investor expectation:</strong> Series A investors want 20%+ MoS in steady state. Founders pitching at 8% MoS struggle.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> margin of safety = (actual revenue − break-even revenue) ÷ actual revenue.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges:</strong> ≥ 25% comfortable; 15-25% adequate; 10-15% fragile; &lt; 10% one bad week from red.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Schmidgall &quot;Hospitality Industry Managerial Accounting&quot;, CVP (cost-volume-profit) literature.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> MoS at the worst weather/season point (winter MoS might be 5% while annual is 22%). The model uses average; check seasonal lows.</p>
        </Methodology>
      </>
    ),
  },
  revenuePerLaborHour: {
    title: "Revenue / labor hour",
    body: (
      <>
        <p>
          Monthly revenue ÷ total labor hours. Productivity benchmark for
          staffing decisions. PL pizza norm 90–140 zł/h.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            How much each hour of staff time generates. If it&apos;s
            <strong> 90 zł/h</strong> and they cost ~35 zł/h all-in,
            you&apos;re golden. If it&apos;s <strong>60 zł/h</strong>,
            you&apos;re overstaffed for the order volume — trim one head and
            watch this jump.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Target ≥ 100 zł/labor hour:</strong> below 90 you&apos;re overstaffed or under-priced. Diagnose which.</li>
            <li><strong>Compare by shift:</strong> lunch shift might be 70 zł/h, dinner 130. Cut underperforming shifts.</li>
            <li><strong>Trim shift-edges first:</strong> 30 min of pre/post-service is often the lowest productivity. Cut those before reducing peak hours.</li>
            <li><strong>Productivity training pays:</strong> a faster pizzaiolo lifts this number more than hiring. Invest in skill.</li>
            <li><strong>Compare against PL benchmarks:</strong> casual-Italian PL norm 90-140 zł/h. World-class 150+. Top quartile = real ops discipline.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> revenue per labor hour = monthly revenue ÷ total monthly labor hours (all roles, all shifts).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges (PL pizza):</strong> 70-90 zł/h needs work; 90-120 zł/h healthy; 120-160 zł/h good; 160+ zł/h excellent (often QSR chains with optimised mise-en-place).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> NRA labor-productivity benchmarks, PHG Polish gastronomic-employer surveys.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> non-productive hours (prep, cleaning, training). These count in the denominator but don&apos;t produce revenue. The model dilutes the metric; track productive-hour-only separately if needed.</p>
        </Methodology>
      </>
    ),
  },
  setupPaybackKpi: {
    title: "Setup payback",
    body: (
      <>
        <p>
          Naïve months of net profit needed to recoup setup cost. Setup ÷
          monthly profit. Investor-grade view in the Investor returns strip below.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>How many months until the truck pays itself off</strong>.
            18 months = solid, 24+ = bank loan territory, past 36 = think hard
            about whether this is the right business model. The fancier IRR/NPV
            numbers below are more honest, but this is the one the cousin who
            lent you 50,000 zł will ask about.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Target &lt; 24 months:</strong> investor-grade. Above 30 you struggle to attract capital; above 48 you&apos;re a hobby business by their standards.</li>
            <li><strong>Trim setup to shorten payback:</strong> every 30k zł off setup = ~2 months shorter payback at typical margins.</li>
            <li><strong>Don&apos;t over-prioritise vs IRR:</strong> a 14-month payback with 5% growth is worse than 22-month with 20% growth. Use IRR for honest comparison.</li>
            <li><strong>Payback ignores time-value:</strong> good for quick mental math, terrible for capital allocation. Use the investor-grade returns strip for real decisions.</li>
            <li><strong>Watch how the &quot;real&quot; investor metrics differ:</strong> NPV/IRR account for ramp, risk, discount rate. The Investor Returns card shows the gap.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> naïve payback = setup cost ÷ monthly net profit. Treats every month identically (no ramp, no discount).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges:</strong> ≤ 18 months excellent; 18-24 solid; 24-36 acceptable; &gt; 36 marginal; &gt; 48 reconsider.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Why it&apos;s naïve:</strong> ignores year-1 ramp (your first 6 months won&apos;t hit projected profit), ignores discount rate (1 zł today &gt; 1 zł in 24 months), ignores risk. Use the Investor-Returns card for honest IRR/NPV.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> classical finance textbooks, restaurant-industry payback benchmarks.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> ramp curve. Real businesses ramp over 6-12 months. Adjust payback to start counting from month 7 for realistic expectations.</p>
        </Methodology>
      </>
    ),
  },

  // Capacity strip
  kitchenCapacityKpi: {
    title: "Kitchen capacity",
    body: (
      <>
        <p>
          Theoretical orders/day the kitchen can produce at peak. Sets the
          ceiling on volume growth without capex.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>The most orders/day this kitchen can physically do.</strong>
            If you&apos;re consistently bumping into it, you&apos;ve outgrown
            the truck — time for a second one. If you&apos;re at 60% of it, you
            have headroom and the bottleneck is demand, not supply.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Stay at 70-85% of capacity:</strong> below 70% you have wasted overhead; above 85% you blow ticket times under peak.</li>
            <li><strong>Capacity expansion checklist:</strong> second oven first, second truck second, bigger oven last (expensive, locks you in).</li>
            <li><strong>Bottleneck is rarely the oven:</strong> usually the pizzaiolo shape-rate or the prep station. Identify before investing.</li>
            <li><strong>Capacity = peak × service hours, not daily avg:</strong> a 70 pizza/hr oven for 8 hours = 560 pizza/day theoretical, ~150 realistic with the efficiency factor.</li>
            <li><strong>Demand vs capacity:</strong> if demand exceeds capacity, marketing is wasted. Spend on operations.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> kitchen capacity (orders/day) = pizzasPerHour × serviceHoursPerDay × ovenEfficiency ÷ prepComplexity.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Typical PL pizza truck capacity:</strong> 100-180 orders/day at 70 pizzas/hr × 8 hours × 22% efficiency = ~123 orders/day. Multi-oven setups: 200-300.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> pizzeria operations literature, oven-manufacturer specs.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> within-day capacity bursts. A kitchen can hit 90 pizzas in the peak hour but average 30/hour across the day. Real saturation is hourly, not daily.</p>
        </Methodology>
      </>
    ),
  },
  peakOrdersPerHour: {
    title: "Peak orders / hour",
    body: (
      <>
        <p>
          Observed busiest hour from real orders. Compared against realistic
          oven capacity to flag saturation.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>Your busiest hour of the day.</strong> If your kitchen does
            70 pizzas/hr and your peak hour wants 80, you&apos;re refusing
            customers in plain sight — typically <strong>~500–1,000 zł of
            revenue walked</strong> per peak shift.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Smooth the peak:</strong> push pre-orders for 18:30 or 21:00 to drain the 19:30 spike. Free coffee bait works.</li>
            <li><strong>Limit menu at peak:</strong> simplified 4-SKU peak menu = +20% throughput.</li>
            <li><strong>Add a peak-hour staff:</strong> one part-timer 18:30-21:00 only. Captures the peak without paying full-day labor.</li>
            <li><strong>Watch the peak hour move:</strong> Friday peak might be 20h, Saturday 21h. Calibrate per day.</li>
            <li><strong>If peak hour &gt; capacity, expand:</strong> bigger oven, second oven, or limit orders to manage queue. Hidden walked customers cost more than visible ones.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Inputs:</strong> from real POS data — the busiest single hour across the analysis window.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Formula:</strong> peak orders/hour = max(orders in any 60-min window) across the observation period. Compared against pizzasPerHour × ovenEfficiency for saturation flag.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy peak share:</strong> 12-22% of daily orders concentrated in the peak hour. Higher = more sensitive to capacity.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> POS hourly-distribution analytics, NRA hourly-mix studies.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> within-hour micro-peaks (the 15-min mega-peak inside the busiest hour). Real saturation is often worse than the hourly stat shows.</p>
        </Methodology>
      </>
    ),
  },
  medianTicketTimeKpi: {
    title: "Median ticket time",
    body: (
      <>
        <p>
          Median order-to-ready time. Past 8 min, customer satisfaction
          craters; past 12 min, refund rate spikes.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>How long the average pizza takes</strong> from order to
            pickup. Under 8 minutes = customers happy. Past 12 minutes =
            <strong> 5–10% of customers leave a bad review</strong>. The clock
            starts when they order, not when you start cooking — train staff
            accordingly.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Target ≤ 8 min median:</strong> the breakpoint where customers&apos; subjective experience flips from &quot;fast&quot; to &quot;long&quot;.</li>
            <li><strong>Worse at peak:</strong> median is &lt; 8 min off-peak but &gt; 12 at the rush. Calibrate staffing to peak.</li>
            <li><strong>Display order-ready times:</strong> a screen showing estimated ready times sets expectations + reduces complaints.</li>
            <li><strong>Pre-bake at peak:</strong> Margherita / Marinara 5 min early, finish on order. Cuts perceived wait.</li>
            <li><strong>Refunds correlate inversely:</strong> if median ticket time &gt; 12 min, refunds tend to jump 2-4 pp. Fix the time, refunds drop.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> median ticket time = P50 of order-to-ready elapsed time, derived from KDS event log. Median (not mean) because slow outliers shouldn&apos;t dominate.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges:</strong> ≤ 6 min QSR ideal; 6-8 min comfortable; 8-12 min slipping; &gt; 12 min losing customers.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> QSR customer-satisfaction studies, restaurant ops literature on perceived-wait psychology (Maister&apos;s laws of service).</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> dine-in vs takeaway vs delivery distinction. Delivery tolerates longer (15-20 min OK); dine-in cratering at 12. Calibrate per channel.</p>
        </Methodology>
      </>
    ),
  },

  // Institutional KPIs (individual)
  ebitdaKpi: {
    title: "EBITDA",
    body: (
      <>
        <p>
          <strong>Earnings Before Interest, Tax, Depreciation, Amortisation.</strong>
          The headline cash-generation number. Strips out financing and accounting
          decisions so the underlying operating profit is comparable across deals.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>Profit before paperwork.</strong> Strips out bank interest,
            tax and accounting depreciation so you see the truck&apos;s
            <em> operating</em> power. <strong>20%+ EBITDA margin</strong> is
            what attracts investors; under 10% and you can&apos;t refinance,
            expand, or sell. Every 1pp uplift on 200,000 zł = +2,000 zł of
            attractiveness.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Investor minimum 15-20% EBITDA margin:</strong> below that, valuation drops fast. Many PE deals require ≥ 18%.</li>
            <li><strong>EBITDA grows by raising prices OR cutting variable costs:</strong> capex and depreciation don&apos;t affect it. Focus there for valuation.</li>
            <li><strong>Multiple of EBITDA = your sale price:</strong> Polish casual-Italian sells at 4-6× EBITDA. Lifting 1pp margin lifts valuation 4-6× more.</li>
            <li><strong>Track EBITDA trend yearly:</strong> investors look at trajectory, not just level. A flat 22% beats a declining 25%.</li>
            <li><strong>Don&apos;t game it:</strong> reclassifying real costs to depreciation inflates EBITDA but auditors catch it. Honest numbers.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> EBITDA = net profit + interest + tax + depreciation + amortisation. Standard adjusted EBITDA excludes one-off items.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges (PL casual-Italian):</strong> 12-18% standard; 18-25% strong; &gt; 25% exceptional (often a chain with scale economics).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> standard finance (Brealey, Myers, Allen), restaurant-industry valuation literature, Polish M&amp;A multiples data.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> &quot;normalisations&quot; that investors apply (founder salary normalisation, one-off legal costs, etc.). These can swing EBITDA 10-20% in either direction during diligence.</p>
        </Methodology>
      </>
    ),
  },
  ebitdarKpi: {
    title: "EBITDAR",
    body: (
      <>
        <p>
          EBITDA + Rent. Rent-adjusted so chains with different real-estate
          strategies are comparable. The franchise-rollup standard.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>EBITDA but ignoring rent.</strong> Useful when comparing
            your truck to one that owns its location. If a competitor brags
            about 30% EBITDA and you do 25%, look at rent — maybe they own the
            land and you don&apos;t. EBITDAR puts you on equal footing.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Use EBITDAR for franchise rollups:</strong> when buying multiple units with different rent profiles, EBITDAR is the apples-to-apples metric.</li>
            <li><strong>Compare against industry EBITDAR benchmarks:</strong> NRA / PHG publish ranges. Falling below means your operations OR your rent is uncompetitive.</li>
            <li><strong>Sale-leaseback consideration:</strong> if you own the land, EBITDAR shows what a buyer would pay assuming they pay rent. Used in real-estate-and-operating-business separations.</li>
            <li><strong>Watch the EBITDA-vs-EBITDAR spread:</strong> wide spread = high rent burden. Renegotiate or relocate.</li>
            <li><strong>Doesn&apos;t replace EBITDA for tax/financing:</strong> banks still look at EBITDA. EBITDAR is for valuation comparisons.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> EBITDAR = EBITDA + rent expense. Removes the real-estate decision from the operating-performance measure.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Industry standard:</strong> franchise rollups, hotel comparisons, restaurant chain valuations. PL casual-Italian benchmark EBITDAR margin: 22-32%.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> S&amp;P / Fitch credit-analysis frameworks, hospitality-finance textbooks (Vannoy).</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> other location-related costs (utilities, common-area maintenance). Pure rent only.</p>
        </Methodology>
      </>
    ),
  },
  cashOnCash: {
    title: "Cash-on-cash",
    body: (
      <>
        <p>
          Annualised net profit ÷ setup cost. The most-asked multi-unit return
          metric. ≥ 30% = success, ≥ 15% = acceptable, &lt; 0 = capital
          destruction.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>Of every złoty you spent setting up, how many come back per
            year?</strong> <strong>30%+ = an investor&apos;s dream</strong>
            (better than almost any stock or bond). Under 15% and a serious
            investor will ask why you didn&apos;t just buy index funds and
            spend the year skiing.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Target ≥ 30% for retail investors:</strong> S&amp;P returns ~8% historical; if you&apos;re below 20%, the comparison gets uncomfortable.</li>
            <li><strong>Compare against alternative use of cash:</strong> a 50k zł deposit at 5% = 2,500 zł/year. If your truck CoC is below 5%, you&apos;re destroying value.</li>
            <li><strong>Trim setup to lift CoC:</strong> denominator effect. 20k zł off setup lifts CoC ~3pp at typical margins.</li>
            <li><strong>Lever up cautiously:</strong> a smaller cash investment (debt-funded) lifts CoC mathematically — but interest expense erodes the numerator.</li>
            <li><strong>Use in fleet expansion decisions:</strong> if unit 5 CoC &lt; unit 1 CoC, you&apos;re hitting diminishing returns on rollout.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> cash-on-cash = (annual net profit) ÷ (setup cost / cash invested). Steady-state metric — assumes you&apos;ve passed the ramp.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges:</strong> ≥ 30% investor-grade; 20-30% solid; 15-20% acceptable; &lt; 15% reconsider deployment of capital; &lt; 0 destroying value.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> standard finance (Damodaran), restaurant-investment literature, PL venture-economics reports.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> debt structure. A levered truck (less cash, more loan) has higher CoC mathematically but more risk. CoC alone hides leverage.</p>
        </Methodology>
      </>
    ),
  },
  occupancyRatio: {
    title: "Occupancy ratio",
    body: (
      <>
        <p>
          Rent ÷ revenue. QSR target &lt; 8%; past 12% = real-estate overspend.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>What fraction of revenue goes to the landlord.</strong>
            Past <strong>12%</strong> you&apos;re paying too much for the pitch
            — the location had better be incredible. Under <strong>8%</strong>
            you have a steal; protect that lease at all costs and lock in a
            long renewal.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Lock long-term leases when occupancy &lt; 8%:</strong> if you have a steal of a pitch, sign 5+ years. Protect the asset.</li>
            <li><strong>Renegotiate at &gt; 10% occupancy:</strong> rent should track revenue. If revenue dropped 15% and rent didn&apos;t, present data and ask for relief.</li>
            <li><strong>Move &gt; 12% — seriously:</strong> a different pitch with 8% occupancy adds 4pp net margin. Often more than any operational lever.</li>
            <li><strong>Watch the renewal clauses:</strong> CPI-linked escalators bump rent. Negotiate caps (e.g. max 5%/year).</li>
            <li><strong>Pop-up &gt; long-term in untested pitches:</strong> 6-month pop-ups test demand before signing 5-year leases.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> occupancy ratio = rent + property tax + insurance ÷ revenue. All real-estate-related costs.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges:</strong> ≤ 8% excellent; 8-10% healthy; 10-12% pressured; &gt; 12% restructure (renegotiate, relocate, or scale revenue).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> NRA real-estate benchmarks, Cushman Wakefield / JLL Polish commercial-rent reports, PHG occupancy data.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> location-quality premium. Sometimes 12% occupancy in a great pitch beats 7% in a bad one. Use occupancy ratio AND revenue per sqm together.</p>
        </Methodology>
      </>
    ),
  },
  netSalesKpi: {
    title: "Net sales",
    body: (
      <>
        <p>
          Revenue − refunds − comps. The honest top-line after voids/comps.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>Revenue minus the orders you refunded or comped.</strong>
            If gross revenue is 200,000 zł but net sales is 195,000 zł,
            you&apos;re refunding ~2.5% of orders — typical. Past 5%, your food
            quality or service has a real problem.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Track gross-to-net spread weekly:</strong> if it widens, find the cause (recipe issue, training problem, void abuse) within 7 days.</li>
            <li><strong>Manager-only voids:</strong> the biggest source of leakage. Tighten the POS.</li>
            <li><strong>Comp budget per shift:</strong> manager can comp 1 ticket; anything more needs ownership approval.</li>
            <li><strong>Use net sales for tax filing:</strong> CIT/VAT calculated on net (refunded sales aren&apos;t taxable). Make sure your accountant uses net, not gross.</li>
            <li><strong>Investor reporting uses net:</strong> gross numbers are misleading. Net sales is the honest top-line.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> net sales = gross revenue − refunds − comps − discounts − loyalty redemptions. The clean top-line for accounting.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy gross-to-net:</strong> &lt; 3% gap (typical refunds + small loyalty); 3-5% acceptable; 5-8% indicates control problems; &gt; 8% structural issues.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> standard restaurant accounting (Schmidgall), Polish UoR reporting requirements.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> VAT (Polish 8% gastronomic VAT) — the model shows net of VAT throughout, but if you enter gross figures, expect a discrepancy at the bottom.</p>
        </Methodology>
      </>
    ),
  },
  contributionPerLaborHr: {
    title: "Contribution / labor hr",
    body: (
      <>
        <p>
          Monthly contribution ÷ labor hours. The labor KPI that actually
          drives staffing decisions. QSR target ≥ 150 zł/hr.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>How much profit (not revenue) each labor hour creates.</strong>
            If it&apos;s 80 zł/h, your roster is killing you. If it&apos;s
            <strong> 200 zł/h</strong>, you have a tight, productive team —
            protect them with raises before competitors poach.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Target ≥ 150 zł/labor hour:</strong> world-class QSR territory. Below 100 = under-staffed or under-priced.</li>
            <li><strong>Better than rev/labor-hr for staffing:</strong> rev counts revenue from low-margin items equally. This counts the profit-weighted output.</li>
            <li><strong>Use it for shift-level decisions:</strong> compare lunch shift contribution/hr vs dinner. Cut the underperforming shift.</li>
            <li><strong>Promotion vs raise:</strong> if a top performer&apos;s shift hits 250+ zł/hr, give them a promotion path before they leave.</li>
            <li><strong>Compare against benchmarks:</strong> top quartile PL casual-Italian ≥ 180 zł/hr. If you&apos;re there, you&apos;re running tight.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> contribution per labor hour = monthly contribution (revenue − all variable costs) ÷ total monthly labor hours.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges (PL pizza):</strong> &lt; 100 weak; 100-150 OK; 150-200 good; &gt; 200 excellent.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> NRA labor-productivity studies, hospitality-school KPI literature.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> prep hours that don&apos;t directly create contribution but are necessary. Track productive vs prep hours separately if labor mix is unusual.</p>
        </Methodology>
      </>
    ),
  },
  promoAdjustedAov: {
    title: "Promo-adjusted AOV",
    body: (
      <>
        <p>
          Avg ticket × (1 − loyalty burn). The honest ticket after loyalty
          discounts.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>Your ticket size after loyalty discounts come out.</strong>
            If gross AOV is 65 zł but promo-adjusted is 64 zł, loyalty is
            costing you ~1.5%. Some loss is fine if repeat rate climbs — but
            measure both sides, not just the burn.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Promo-adjusted AOV is the honest ticket:</strong> for forecasting + investor reports.</li>
            <li><strong>Watch the gross-to-net gap:</strong> &gt; 2pp gap = loyalty program is expensive (good if it&apos;s driving repeat).</li>
            <li><strong>Channel-specific:</strong> Glovo customers redeem less than walk-up regulars. Track per-channel.</li>
            <li><strong>Use for pricing:</strong> if you target 65 zł net AOV, list prices at 67 zł knowing ~3% comes off via promo.</li>
            <li><strong>Burn isn&apos;t inherently bad:</strong> the question is whether the resulting repeat rate justifies it. Measure both.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> promo-adjusted AOV = avg ticket × (1 − loyalty burn − promo discount rate − coupon usage).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Typical gap:</strong> 1-3% for healthy loyalty program; 3-5% for aggressive promotion; 5%+ may be over-discounting.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> loyalty-economics literature (Bond Brand Loyalty studies, Sailthru data).</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> incremental sales (some redemptions wouldn&apos;t have happened without the loyalty trigger). The model treats burn as pure cost; real incremental analysis usually shows loyalty is net positive at moderate burn.</p>
        </Methodology>
      </>
    ),
  },
  trueCm1PerOrderKpi: {
    title: "True CM1 / order",
    body: (
      <>
        <p>
          Per-order contribution after every variable leakage (COGS, fees,
          waste, refund, loyalty, packaging, CAC). Audit-grade unit economics.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>Of every customer&apos;s 65 zł, how many you actually
            keep</strong> before labor + rent. If it&apos;s <strong>25 zł+</strong>
            you have a real business; below 15 zł you&apos;re a charity in
            disguise. This number doesn&apos;t lie the way gross-margin does.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Target ≥ 25 zł/order at AOV ~65 zł:</strong> ~40% true CM1. Below 20 zł indicates structural issues.</li>
            <li><strong>Per-channel CM1:</strong> Glovo CM1 often 12-18 zł; on-site CM1 25-32 zł. The channel mix determines the blended number.</li>
            <li><strong>Use for menu engineering:</strong> some items have negative CM1 after all variable costs. Cut or re-price them.</li>
            <li><strong>Compare against marketing CAC:</strong> if a new customer costs 15 zł to acquire and CM1 is 20 zł, you break even on first order. Need repeat rate to make money.</li>
            <li><strong>Most-honest metric for investor pitches:</strong> beats both gross margin (ignores variable leakage) and net margin (mixes in labor + rent).</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> True CM1 per order = avg ticket × (1 − COGS% − payment fee % − packaging/order − waste% − refunds% − loyalty burn% − marketing CAC/order).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges:</strong> &gt; 30 zł/order excellent; 25-30 healthy; 20-25 pressured; &lt; 20 structural problem.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> &quot;Unit economics&quot; venture-finance literature, restaurant-investment due-diligence frameworks.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> attached customer lifetime value (LTV). CM1 is order-level; LTV captures cumulative orders over a customer&apos;s relationship. Use both in growth decisions.</p>
        </Methodology>
      </>
    ),
  },

  // Investor returns (individual)
  cashBreakEvenKpi: {
    title: "Cash break-even",
    body: (
      <>
        <p>
          First month where cumulative net profit clears the setup cost (with a
          4-month opening ramp). Institutional success: ≤ 24 months.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>When you&apos;ve earned back every złoty you spent
            opening.</strong> 18–22 months = good; past 24 the truck is
            borderline; past 36 you should have skipped it. Investors look at
            this number <em>first</em>, before they read anything else in the
            deck.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>More honest than naïve payback:</strong> includes 4-month ramp + cumulative cash. Use this number for real decisions.</li>
            <li><strong>&lt; 24 months = institutional grade:</strong> PE/VC investors expect this. Above 30 months, you&apos;re a lifestyle business in their eyes.</li>
            <li><strong>Improve via setup reduction, not just margin:</strong> 30k off setup shortens payback ~2 months. Pre-negotiate hard.</li>
            <li><strong>Ramp assumption matters:</strong> 4-month ramp is generous; reality can be 6-8. Stress-test if your launch playbook isn&apos;t proven.</li>
            <li><strong>Show cash break-even alongside NPV in pitches:</strong> investors look at both. NPV captures value, cash break-even captures speed.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> first month where cumulative net profit (with 4-month ramp: m1=20%, m2=40%, m3=60%, m4=80% of steady-state, m5+=100%) exceeds setup cost.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Institutional thresholds:</strong> &lt; 18 months excellent; 18-24 strong; 24-30 acceptable; 30-36 marginal; &gt; 36 reconsider.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> private-equity restaurant-investment frameworks (Roark Capital, L Catterton case studies), restaurant venture-economics literature.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> seasonal opening (launching in November vs May has very different ramp curves). The model uses smooth 4-month linear ramp; reality is choppier.</p>
        </Methodology>
      </>
    ),
  },
  npv10: {
    title: "NPV @ 10%",
    body: (
      <>
        <p>
          Net present value of 24-month cash flows at 10% annual discount rate.
          Positive = beats the rate. 10% ≈ safe-asset benchmark.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>&quot;Is this truck worth more than a 10% bond?&quot;</strong>
            If positive, yes. If negative, you&apos;d literally have made more
            sitting on the cash. 10% is the boring-but-safe benchmark; clearing
            it is the minimum bar for not feeling foolish.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>NPV &gt; 0 at 10% = minimum bar:</strong> if you can&apos;t beat a 10% bond return, the truck doesn&apos;t justify your time.</li>
            <li><strong>Use 10% for personal-investment decisions:</strong> matches typical PL deposit + equity blended alternative.</li>
            <li><strong>Compare across scenarios:</strong> Conservative NPV vs Optimistic NPV shows the upside if execution is strong.</li>
            <li><strong>Watch the assumption set:</strong> NPV is sensitive to 24-month projections; small input changes swing it materially.</li>
            <li><strong>Higher discount rates penalise long-horizon profits:</strong> if NPV @ 10 is high but NPV @ 20 is low, you have late-arriving cash. Investors discount more.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> NPV = Σ (monthly_cashflow_m ÷ (1 + 10%/12)^m) for m=1..24 minus setup cost.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Why 10%:</strong> approximates Polish risk-free + small premium. Roughly the long-run equity-market return for a passive investor.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> standard corporate finance (Brealey/Myers/Allen), CFA Institute investment-decision frameworks.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> terminal value beyond month 24. If the truck keeps running profitably for years 3+, the NPV understates true value. Add a terminal-value adjustment for long-term investments.</p>
        </Methodology>
      </>
    ),
  },
  npv15: {
    title: "NPV @ 15%",
    body: (
      <>
        <p>
          NPV at 15% discount rate. The &quot;decent venture&quot; hurdle.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>Same question, harder hurdle.</strong> 15% is the &quot;decent
            venture&quot; bar. If positive, the truck beats a venture-grade
            alternative — i.e. better than putting the money into a friend&apos;s
            startup.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>15% is the &quot;real business&quot; bar:</strong> serious investors expect returns clearing 15% to allocate capital.</li>
            <li><strong>If NPV @ 15 = 0 but NPV @ 10 &gt; 0, you&apos;re lifestyle:</strong> good for you, not for institutional money.</li>
            <li><strong>Plot all three (10/15/20) together:</strong> the curve&apos;s slope shows how concentrated the returns are. Steeper = more dependent on long-horizon cash.</li>
            <li><strong>Run sensitivity around 15%:</strong> if a 1pp drop in discount rate flips NPV positive, the project is marginal — be cautious.</li>
            <li><strong>Use for &quot;invest in growth?&quot; decisions:</strong> if you have spare cash, NPV @ 15 of opening unit #2 vs investing in stocks tells you which is better.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> identical to NPV @ 10 but with 15% annual discount.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Why 15%:</strong> &quot;decent venture&quot; benchmark. Approximates VC/seed-investor expected return for moderate-risk SME investments.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> corporate finance literature, VC return benchmarks.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> tax-adjusted vs pre-tax discount rate. Investors typically use after-tax hurdles; the model uses pre-tax cash flows so the comparison isn&apos;t perfectly apples-to-apples.</p>
        </Methodology>
      </>
    ),
  },
  npv20: {
    title: "NPV @ 20%",
    body: (
      <>
        <p>
          NPV at 20%. PE-style hurdle.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>The Private Equity bar.</strong> If positive, even
            hedge-fund money would want a slice. If negative, the math is fine
            for you personally but won&apos;t attract institutional capital
            when you go raising for unit #6.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>NPV @ 20 ≥ 0 = institutional-grade:</strong> PE firms target 18-22% IRR. Clearing this means you&apos;ll attract their capital.</li>
            <li><strong>If you&apos;re scaling 5+ units, this is the bar:</strong> rollup acquirers (Polish: Castle, AdVent, Innova) screen against ~20% IRR equivalent.</li>
            <li><strong>Hard to clear without supply discounts:</strong> usually requires unit 4+ economics (HQ overhead + supply discount kicking in).</li>
            <li><strong>Build the deck around it:</strong> &quot;positive NPV @ 20%&quot; is the line that closes meetings.</li>
            <li><strong>Compare across pitches:</strong> if location A clears NPV @ 20 and location B doesn&apos;t, you have your priority.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> NPV with 20% annual discount.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Why 20%:</strong> PE-style hurdle. Reflects illiquidity premium + minority-stake risk + sector risk for restaurant investments.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> private-equity return frameworks, S&amp;P/Cambridge PE-fund-of-funds benchmarks.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> deal-specific structural premiums (control premium, synergy expectations, exit-multiple compression). Real PE returns adjust for these on top of the base hurdle.</p>
        </Methodology>
      </>
    ),
  },
  irr24: {
    title: "IRR (24 mo)",
    body: (
      <>
        <p>
          Annualised internal rate of return on 24-month cash-flow series.
          ≥ 30% strong, ≥ 15% acceptable, &lt; 0 capital destruction.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>The effective &quot;interest rate&quot; your money earns by
            being in this truck.</strong> <strong>30%+ = chef&apos;s kiss</strong>;
            15–30% = a real business; under 15% and you should have bought
            stocks instead and saved yourself the 14-hour Sundays.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Target 25-35% for retail success:</strong> beats most asset classes. Anything 40%+ is exceptional and probably temporary.</li>
            <li><strong>Compare against your opportunity cost:</strong> what else could the cash do? Index fund (~8%), property (~6-10%), private equity (~12-18%).</li>
            <li><strong>IRR includes time-value:</strong> better than CoC because it accounts for when the cash arrives.</li>
            <li><strong>Sensitivity-test the 30% claim:</strong> what if revenue drops 15%? What if COGS rises 3pp? If IRR stays above 20% under stress, robust business.</li>
            <li><strong>Long-horizon IRR drops:</strong> 24-month IRR is typically higher than 5-year because terminal value pulls down. Use the appropriate horizon for the comparison.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> IRR = the discount rate r where Σ (monthly_cashflow_m ÷ (1 + r/12)^m) = setup cost. Solved numerically (no closed form).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges:</strong> &gt; 30% chef&apos;s-kiss; 20-30% solid; 15-20% acceptable; &lt; 15% reconsider; &lt; 0 capital destruction.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> standard corporate finance, CFA Level 1-2 capital-budgeting materials.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> reinvestment-rate assumption (IRR implicitly assumes interim cash flows reinvest at IRR rate — often unrealistic). Modified IRR (MIRR) is more honest for multi-period decisions.</p>
        </Methodology>
      </>
    ),
  },

  // 12-month projection strip
  twelveMoRevenue: {
    title: "12-mo revenue",
    body: (
      <>
        <p>
          Forward 12-month revenue projection with seasonality + price
          inflation baked in.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>The year ahead, top-line.</strong> A 200,000 zł/month truck
            typically projects <strong>~2.4M zł/year</strong> — but
            seasonality means it&apos;s not 200k × 12 (winter ~100k, summer
            ~260k). The shape matters more than the headline.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Watch the €2M turnover line:</strong> ~8.5M zł. Crossing it bumps CIT from 9% → 19%. Plan revenue around the threshold.</li>
            <li><strong>Use as your annual budget:</strong> the projection becomes the year&apos;s revenue target by month.</li>
            <li><strong>Re-run quarterly:</strong> as actuals come in, recalibrate. A January way under projection signals a real-world deviation.</li>
            <li><strong>Compare to last year:</strong> growing 10% on revenue is investor-grade; flat is OK; declining requires intervention.</li>
            <li><strong>Watch the inflation contribution:</strong> 5% revenue growth from price hikes alone is &quot;treading water&quot; — real growth is volume growth.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> 12-month revenue = Σ over m=1..12 of (base_orders × seasonal_multiplier(m) × ticket × days × (1 + ingredient_inflation)^(m/12)).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Seasonal split (PL pizza truck):</strong> winter Q1 ~17%, spring Q2 ~25%, summer Q3 ~33%, autumn Q4 ~25%. Note: NOT a flat 1/12 per month.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Polish gastronomic seasonality data, GUS sectoral monthly revenues.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> year-over-year growth from marketing investment or new menu launches. Treats the 12 months as steady-state projection from current inputs.</p>
        </Methodology>
      </>
    ),
  },
  twelveMoCosts: {
    title: "12-mo costs",
    body: (
      <>
        <p>
          Forward 12-month total cost compounding wage + ingredient inflation
          monthly.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>Total costs over the year ahead, with inflation baked in.</strong>
            If costs were 150,000/mo today they&apos;ll average ~155,000 across
            the year — that 5,000 zł/month creep adds up to
            <strong> ~60,000 zł of margin erosion</strong> per year.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Plan price hikes against this projection:</strong> if 12-mo costs are projected to grow 6%, plan a January menu price refresh of ~4% to offset.</li>
            <li><strong>Track cost trend monthly:</strong> if actuals diverge from projection by &gt;5% for 2 consecutive months, recalibrate.</li>
            <li><strong>Decompose by category:</strong> the projection rolls up COGS/labor/fixed. Look at each separately if a line is bloating.</li>
            <li><strong>Inflation is the silent killer:</strong> 4-5% annual cost growth needs matching price growth. Don&apos;t let it compound year-over-year unchecked.</li>
            <li><strong>Use for hiring decisions:</strong> new hire at 6,000 zł/month adds ~72k to the projection. Can you absorb it?</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> 12-mo costs = Σ m=1..12 of (labor × (1+wage_infl)^(m/12) + COGS × (1+food_infl)^(m/12) + fixed × (1+CPI)^(m/12)).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Composition:</strong> typically 40% labor, 40% COGS, 15% fixed, 5% variable leakage. Inflation impacts vary per line.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> GUS inflation data, ZUS rate-card history, owner-operator cost-tracking surveys.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> step-function cost changes (rent renewal, mandatory ZUS jump). The model treats inflation as smooth; reality has cliffs.</p>
        </Methodology>
      </>
    ),
  },
  twelveMoNetProfit: {
    title: "12-mo net profit",
    body: (
      <>
        <p>
          Forward 12-month net profit. Drives setup-payback math.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>Total take-home for the year ahead.</strong> Divide by 12
            for the monthly average. If this is 240,000 zł you&apos;re earning
            ~20,000 zł/month — solid Polish small-business income before
            personal tax. Below 100,000 zł/year, ask yourself whether you
            wouldn&apos;t earn more as a salaried pizzaiolo.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Compare to your alternative employment:</strong> a salaried head chef earns 90-130k zł/year in PL. If your truck nets below that, the math + risk doesn&apos;t justify.</li>
            <li><strong>Plan tax payments quarterly:</strong> 9% CIT × ~240k = ~22k zł/year. Set aside monthly.</li>
            <li><strong>Reinvestment plan:</strong> 30% personal take-home, 30% reserve, 20% growth, 20% buffer. Adjust to your goals.</li>
            <li><strong>Year-over-year growth target:</strong> 10-15% net growth annual is healthy. Below 5% you&apos;re losing to inflation in real terms.</li>
            <li><strong>Use for valuation:</strong> if you sell at 5× annual net profit, your truck&apos;s value is ~5× 12-mo net.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> 12-mo net profit = 12-mo revenue − 12-mo costs (both inflation-adjusted, seasonality-applied). Before CIT.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges (PL casual-Italian):</strong> 120-200k zł/year for single truck, 600k-1.5M for 5-7 unit chain, 3M+ for 20+ unit chain.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> PHG gastronomic benchmarks, restaurant-industry valuation reports.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> founder salary as a cost. The model treats unpaid owner labor as zero; mentally subtract ~80-120k zł/year if you&apos;re working full-time, to value your time honestly.</p>
        </Methodology>
      </>
    ),
  },
  bestWorstMonth: {
    title: "Best / worst month",
    body: (
      <>
        <p>
          Highest vs lowest month-net-profit in the projection. Measures
          seasonal swing risk.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>Your best month vs your worst.</strong> A 4× swing (e.g.,
            40,000 vs 10,000) is normal for trucks. The point: you have to
            <strong> bank the summer cash to cover the winter</strong>. Don&apos;t
            spend it the day it lands or January will be financially terrifying.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Reserve = 1.5× worst month:</strong> minimum cash buffer. Below that and a bad February closes you.</li>
            <li><strong>Auto-transfer summer surplus:</strong> after each high-month, move 30-40% to a separate reserve. Otherwise you spend it.</li>
            <li><strong>Best:worst ratio &gt; 3× is hot:</strong> indicates heavy seasonality. Plan staffing, cash, marketing accordingly.</li>
            <li><strong>If &gt; 5× ratio, consider indoor pivot:</strong> winter pop-up, catering, etc. Counter-seasonal revenue smooths the curve.</li>
            <li><strong>Use best-month for capex timing:</strong> buy equipment in your highest-cash month. Don&apos;t wait for a slow month and starve cash.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> best-vs-worst = max(monthly net profit) − min(monthly net profit) across the 12-month projection.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy swings (PL outdoor truck):</strong> typical 3-5× best:worst ratio. Lower (1.5-2×) means well-diversified channels; higher (5-8×) means heavy seasonality risk.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Polish gastronomic seasonality data, restaurant cash-flow management literature.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> intra-month cash-flow variance (timing of supplier payments, payroll cycles). Even within a &quot;best&quot; month, there can be cash-low days. Plan against a 7-day working capital minimum.</p>
        </Methodology>
      </>
    ),
  },

  // Prep flow / queue KPIs
  modelledTicketTime: {
    title: "Modelled ticket time",
    body: (
      <>
        <p>
          Predicted order-to-ready time from menu mix + per-attach prep
          seconds.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>What the spreadsheet says your ticket time should be.</strong>
            Compare to observed — if observed is 50% slower, your team has
            process problems; if observed is faster, your kitchen is more
            efficient than you give them credit for.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Use modelled vs observed gap as the diagnostic:</strong> if observed is much higher, find the bottleneck (prep, peel, plate-up).</li>
            <li><strong>Calibrate per-SKU prep time:</strong> Margherita 90s, Quattro Stagioni 150s, pasta 240s. Wrong per-SKU times = wrong overall model.</li>
            <li><strong>Re-run after menu changes:</strong> adding pasta primo lifts modelled time by 60-90s. Make sure observed catches up.</li>
            <li><strong>If observed &lt; modelled, the team is heroes:</strong> figure out why (better mise-en-place? smaller portions?) and document.</li>
            <li><strong>If modelled is &gt; 12 min, your menu is too complex:</strong> simplify before launching, not after.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> modelled ticket time = base oven cycle + Σ per-attach prep seconds × attach%. Each lever adds prep time proportional to its attach rate.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Default prep additions (seconds):</strong> dessert +20s, antipasti +60s, aperitivo +30s, premium toppings +15s, pasta primo +90s. Coffee +0s (parallel station).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> kitchen-throughput studies, pizzeria operations time-and-motion data.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> queue effects, batch optimisation (multiple orders prepped together can be faster than serial). The model assumes serial flow; well-run kitchens are partially parallel.</p>
        </Methodology>
      </>
    ),
  },
  observedTicketTime: {
    title: "Observed ticket time",
    body: (
      <>
        <p>
          Real measured order-to-ready time from actual orders (median).
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>The actual stopwatch time from real orders.</strong> Past
            <strong> 8 minutes</strong> customers start grumbling; past
            <strong> 12</strong> they leave bad Google reviews. Tracks ground
            truth — the model lies, this doesn&apos;t.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Measure weekly:</strong> not just at peak. Off-peak should be ~5-6 min; if it&apos;s 8+ already, you have a process issue.</li>
            <li><strong>Display the running median on KDS:</strong> creates team awareness + healthy competition.</li>
            <li><strong>Cross-reference with bad reviews:</strong> Google reviews mentioning &quot;slow&quot; vs your observed median — direct correlation above 12 min.</li>
            <li><strong>Per-station timing:</strong> the slowest station (pasta? assembly?) sets the overall pace. Fix the slowest.</li>
            <li><strong>Track P95, not just P50:</strong> a few 20-minute outliers ruin individual experiences. Reduce variance, not just the median.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> observed ticket time = P50 (median) of order-placement to order-ready timestamps from KDS event log.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges:</strong> ≤ 6 min QSR-class; 6-8 min comfortable; 8-12 min slipping; &gt; 12 min losing customers.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> KDS log data, customer-satisfaction surveys cross-referenced with wait time.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> delivery customer perception (Glovo customers tolerate longer because they aren&apos;t watching the kitchen clock). Track on-site separately.</p>
        </Methodology>
      </>
    ),
  },
  peakHourQueue: {
    title: "Peak-hour queue",
    body: (
      <>
        <p>
          Excess orders <em>per hour</em> at peak — arrivals beyond what the
          oven can produce. These are customers who walk because the queue is
          too long.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>Orders walking away at peak hour.</strong> Even
            <strong> 3 lost orders/hour × 3 peak hours/day × ~30 zł margin
            × 30 days = ~8,100 zł/month gone</strong>. Either a second oven,
            a stricter booking system, or pushing some orders off-peak fixes
            it. The tile shows /hr — multiply by your peak-hour count to size
            the monthly bleed.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Visible queue = lost queue:</strong> if customers can see &gt; 8 people waiting, ~25% walk. Hide the line or break it up visually.</li>
            <li><strong>Reservation system for the peak hour:</strong> 18:45 / 19:15 / 19:45 slots. Smooths arrivals.</li>
            <li><strong>SMS &quot;ready&quot; notifications:</strong> let customers wait at the pub next door, come back when buzzed. Adds 20-30% effective capacity.</li>
            <li><strong>Off-peak incentive:</strong> 10% off orders before 18:00 or after 21:00 shifts ~15% of demand.</li>
            <li><strong>Quantify the loss:</strong> use queue × wait-time abandonment rate × ticket value to size the monthly cost of inaction.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> peak-hour queue = max(0, peak_hour_orders − realistic_oven_capacity). Customers arriving above capacity who walk.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy range:</strong> 0 lost orders/hr at peak = perfect calibration. 1-3/hr = manageable. &gt; 5/hr = expansion required.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> queueing-theory literature (Erlang, Maister&apos;s laws of service), QSR throughput studies.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> partial-balking (customers who see the queue and leave without trying). Real lost orders may be 1.5-2× the modelled overflow.</p>
        </Methodology>
      </>
    ),
  },
  waitTime: {
    title: "Wait time",
    body: (
      <>
        <p>
          Average back-of-queue wait time at peak hour. Past 5 minutes drives
          5% conversion loss per extra minute, capped at 60%.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>How long the average customer waits at peak.</strong> Past
            <strong> 5 minutes</strong>, every extra minute drops conversion by
            5%. At 10 minutes you&apos;ve lost half your peak-hour upside — at
            that point a queue manager + better signage pays for itself in a
            week.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Target ≤ 3 min wait off-peak, ≤ 6 min peak:</strong> sets customer expectation, sustainable service quality.</li>
            <li><strong>Set expectation up front:</strong> &quot;your order in ~7 minutes&quot; — when set, customers tolerate 50% longer than ambient wait without complaint (Maister&apos;s law).</li>
            <li><strong>Give them something to do:</strong> menu QR codes, small bites samples, table-side coloring sheets. Perceived wait drops by 30-40%.</li>
            <li><strong>Queue Manager (one staff role) at peak:</strong> takes orders early, answers questions, manages perceived wait. Pays back in saved walkouts.</li>
            <li><strong>Wait time &gt; ticket time:</strong> wait time is queue + ticket time. Reduce queue first; ticket time is harder.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> wait time = queue_length × per-order ticket time. Queue derived from arrival rate vs serving rate.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Conversion sensitivity:</strong> 0-5 min wait: 95% complete; 5-10 min: 70%; 10-15 min: 40%; &gt; 15 min: ~20%. Polish QSR research.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> queueing theory, customer-experience research (Maister, Berry), QSR walkout-rate studies.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> day-part tolerance (lunch crowd has lower tolerance than dinner; tourists higher than locals). Calibrate per channel/daypart.</p>
        </Methodology>
      </>
    ),
  },

  // Oven curve KPIs
  theoreticalPeak: {
    title: "Theoretical peak",
    body: (
      <>
        <p>
          Pizzas-per-cycle × cycles per hour. Vendor-spec capacity in a vacuum.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>What the oven brochure says it can do.</strong> Ignore it —
            reality is 20–35% of this. A Ferrara that &quot;does 320/hr&quot;
            actually sustains <strong>~70/hr</strong> in a real truck once
            you account for prep, plate-up and customer-facing time.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Useful only for ceiling check:</strong> if your observed peak hits 50% of theoretical, the oven is fine. Bottleneck is elsewhere.</li>
            <li><strong>Don&apos;t plan staffing against it:</strong> always use realistic peak. Theoretical is marketing.</li>
            <li><strong>Test new oven purchases vs theoretical:</strong> two ovens at half the theoretical each &gt; one at double theoretical because parallel beats serial.</li>
            <li><strong>Vendor demos ARE the theoretical:</strong> they show the absolute best case. Discount by 70% for reality.</li>
            <li><strong>Theoretical &gt; demand = capacity wins:</strong> when demand &lt; theoretical, you have room to grow before capex.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> theoretical peak = pizzasPerBake × (3600 / cycleTime). No efficiency or labor de-rating.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Realistic ratio:</strong> 20-35% of theoretical sustained in real operation. The gap is labor, prep, plate-up, customer interaction.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> oven-vendor specifications, real-world pizzeria throughput audits.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> burst capacity (an oven can hit theoretical for 10-15 min before recovery drag). Useful for short peaks; not sustainable.</p>
        </Methodology>
      </>
    ),
  },
  realisticPeak: {
    title: "Realistic peak",
    body: (
      <>
        <p>
          Theoretical × efficiency factor (default 22%). Sustainable peak in
          real service.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>What the oven actually delivers</strong> at a sustained
            peak. <strong>This is the real number</strong> to plan capacity
            around. If your peak hour wants more than this, customers walk —
            no matter what the spec sheet promised.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Plan against this, not theoretical:</strong> realistic peak is the binding constraint for capacity planning.</li>
            <li><strong>Validate with stopwatch:</strong> run a Friday-night audit. If your modelled realistic peak is 70/hr but observed is 50/hr, recalibrate ovenEfficiency.</li>
            <li><strong>Track team-level improvements:</strong> training + better mise-en-place lifts realistic peak by 5-10 pizzas/hr. Cheaper than buying a second oven.</li>
            <li><strong>Compare against demand:</strong> if realistic peak &gt; peak demand by 30%+, you have growth headroom.</li>
            <li><strong>Investment threshold:</strong> if observed peak consistently &gt;= realistic peak for 30+ days, expansion conversation begins.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> realistic peak = theoretical_peak × ovenEfficiency ÷ prepComplexity.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy range:</strong> 50-90 pizzas/hr realistic for single pizzaiolo + Neapolitan oven; 110-160 with multi-station + runner; 200+ for QSR conveyor setup.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> pizzeria operations research, time-and-motion studies.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> hour-of-shift fatigue. Realistic peak drops 10-15% by hour 5+ of a shift. Schedule peak hours early in shifts.</p>
        </Methodology>
      </>
    ),
  },
  observedPeakHour: {
    title: "Observed peak hour",
    body: (
      <>
        <p>
          Max avg-orders-per-hour over the last 30 days of real orders.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>Your busiest hour, from real data.</strong> Compare to
            realistic peak: at <strong>85%+ of realistic capacity</strong>,
            you&apos;re at the &quot;open another unit&quot; threshold. Below
            60% and growth is a marketing problem, not a kitchen problem.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Watch the trend:</strong> rising = healthy growth; flat = market saturation; falling = problem (competitor? quality?).</li>
            <li><strong>Compare across days of week:</strong> Friday vs Tuesday peaks tell you which days drive your business.</li>
            <li><strong>Day-part breakdown:</strong> lunch peak vs dinner peak — invest in the bigger one.</li>
            <li><strong>Track per-channel:</strong> on-site, Glovo, Wolt peaks may differ. Each has its own capacity story.</li>
            <li><strong>If observed = realistic, expand:</strong> the kitchen is the bottleneck. Either second oven, second unit, or peak-shifting (reservations).</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> observed peak = max(orders in any single 60-min window) across the analysis window (default 30 days).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ratio:</strong> observed ÷ realistic 60-85% = sustainable; 85-100% = at-capacity (frequent walkouts); &gt; 100% = expansion required.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> POS hourly-event analytics, NRA hourly-mix benchmarks.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> seasonal peak shifts (summer peaks higher than winter for outdoor trucks). Average masks this; check seasonal extremes too.</p>
        </Methodology>
      </>
    ),
  },
  saturationStatus: {
    title: "Saturation status",
    body: (
      <>
        <p>
          Four-bucket categorisation of observed peak ÷ realistic peak:
          <strong> Headroom</strong> (&lt; 60%), <strong>Heading there</strong>
          (60–85%), <strong>At ceiling</strong> (85–100%),
          <strong> Blown out</strong> (&gt; 100%).
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            A one-glance read on whether you&apos;re slammed.
            <strong> Headroom</strong> = demand is the bottleneck, push
            marketing; <strong>Heading there</strong> = start prepping a
            second oven or second unit; <strong>At ceiling</strong> = one big
            Saturday from blowing out; <strong>Blown out</strong> = you&apos;re
            actively turning customers away. The boundaries (60 / 85 / 100%)
            are where most chains start planning capex.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Headroom (&lt; 60%):</strong> spend on marketing/awareness. Capacity isn&apos;t the issue.</li>
            <li><strong>Heading there (60-85%):</strong> begin capex planning — second oven, peak-hour staffing, reservation system.</li>
            <li><strong>At ceiling (85-100%):</strong> active expansion required. One bad Saturday wipes you out from over-promising.</li>
            <li><strong>Blown out (&gt; 100%):</strong> you&apos;re losing customers daily. Emergency: limit menu at peak, push reservations, or close the order book hours early.</li>
            <li><strong>Re-check after expansion:</strong> opening unit 2 might drop unit 1 from &quot;blown out&quot; back to &quot;heading there&quot;. Quantify.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> saturation ratio = observed peak hour ÷ realistic peak. Four-bucket categorisation at 60% / 85% / 100% thresholds.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Why the thresholds:</strong> 60% = utilisation enough to keep team sharp but not stressed. 85% = sustainable at peak but with no buffer. 100% = boundary; above = active customer loss.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> QSR operations literature (Domino&apos;s, McDonald&apos;s case studies on capacity utilisation), queueing theory.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> intraday saturation variance (you might be 60% average but 110% in the 15-min mega-peak). Use observed peak hour as the bound, not the average.</p>
        </Methodology>
      </>
    ),
  },

  // Unit economics tile labels
  revenuePerOrderKpi: {
    title: "Revenue / order",
    body: (
      <>
        <p>
          Average ticket size. Persists from real orders; matches scenario AOV.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>What the average customer pays per order.</strong> Polish
            pizza truck baseline 60–72 zł. Raising this by <strong>5 zł</strong>
            is usually easier (one combo nudge) than getting 5 more customers
            per day (full marketing campaign).
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Push attach over price:</strong> raising avg ticket via coffee/dessert attach is invisible to customers; raising menu prices is visible.</li>
            <li><strong>Track per-channel:</strong> on-site, Glovo, Wolt typically vary by 5-15 zł. Different optimisation per channel.</li>
            <li><strong>Combo conversion is the lever:</strong> 30% of customers taking a 65 zł combo vs 45 zł pizza raises blended AOV ~6 zł.</li>
            <li><strong>Monthly trend matters:</strong> if AOV is declining, customers are downshifting. Counter with value items or attach push.</li>
            <li><strong>Compare to peers:</strong> casual-Italian PL benchmark 60-72 zł. Below 50 = aggressive value positioning; above 80 = upscale.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> revenue per order = monthly revenue ÷ monthly orders. Net of refunds/comps.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges (PL casual-Italian):</strong> Pizza-only menu 45-55 zł; with drinks 60-68 zł; full dinner 70-85 zł; upscale Italian 90+ zł.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Glovo/Wolt published GMV-per-order, PHG benchmarks.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> party size (a 4-person order isn&apos;t 4× individual). The model treats one order = one customer.</p>
        </Methodology>
      </>
    ),
  },
  trueCm2PerOrder: {
    title: "True CM2 / order",
    body: (
      <>
        <p>
          CM1 minus per-order share of labor and fixed costs. Net unit-economic
          profit per ticket.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>What&apos;s left per order after labor and rent.</strong>
            If CM1 is 25 zł and CM2 is 6 zł, labor + rent ate 19 zł of every
            order. A truck running <strong>negative CM2</strong> is losing
            money on every customer who walks through — and no amount of
            marketing will fix that.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Negative CM2 = stop right now:</strong> every order loses money. Pause growth, fix the unit, then resume.</li>
            <li><strong>Healthy CM2:</strong> 5-10 zł/order for a well-run truck. Below 3 zł = fragile.</li>
            <li><strong>Levers for CM2:</strong> raise prices, reduce labor-per-order (productivity), trim fixed costs. Variable cost lifts CM1 not CM2.</li>
            <li><strong>Use it in unit-2 decisions:</strong> if Unit 1 CM2 is 8 zł, Unit 2 expected CM2 should be similar before opening. If projected lower, ask why.</li>
            <li><strong>Investor metric:</strong> alongside CM1, CM2 shows whether the unit is structurally profitable. The gap = how fixed-cost-heavy you are.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> True CM2 per order = True CM1 − (labor + fixed costs) ÷ monthly orders.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges:</strong> &gt; 10 zł/order excellent; 5-10 healthy; 2-5 marginal; &lt; 2 fragile; &lt; 0 structurally broken.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> unit economics frameworks (a16z, Bain), restaurant due-diligence literature.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> CM2 variance by daypart. Off-peak CM2 might be negative; peak CM2 strongly positive. Blended hides the truth — check both.</p>
        </Methodology>
      </>
    ),
  },
  monthlyOrdersKpi: {
    title: "Monthly orders",
    body: (
      <>
        <p>
          Total orders booked in the month. Drives all variable cost lines.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>Total orders in the month.</strong> 80/day × 28 days =
            <strong> ~2,240 orders</strong>. The unit-economics breakdown shows
            the per-order math; this puts it in context — every per-order
            improvement scales by this number.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Multiplier on every per-order improvement:</strong> a 1 zł lift in CM2 × 2,240 orders = 2,240 zł/month. Multipliers matter.</li>
            <li><strong>Customer count vs order count:</strong> if avg party size is 2.5, 2,240 orders = ~900 unique transactions. Track both.</li>
            <li><strong>Compare to capacity:</strong> kitchen capacity 4,000/month means you have ~45% headroom for growth.</li>
            <li><strong>Channel mix matters:</strong> 1,500 on-site + 700 delivery has different operations than 2,000 on-site + 240 delivery. Same number, very different ops.</li>
            <li><strong>Year-over-year growth target:</strong> 8-15% order growth annual is healthy. Lower = stagnating; much higher = check capacity.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> monthly orders = orders/day × days/month × weather/event multipliers. Net of refunds (counted as anti-orders, reducing the total).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges (PL pizza truck):</strong> 1,400-2,800 orders/month for a single unit. Below 1,400 = sub-scale; above 2,800 = capacity-pressed.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Polish food-truck association benchmarks, POS-data composites.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> order-vs-customer distinction. If avg party = 1.2, orders ≈ customers; if 3.0+, very different. Track party size separately.</p>
        </Methodology>
      </>
    ),
  },

  // Fleet tile labels
  fleetRevenue: {
    title: "Fleet revenue / mo",
    body: (
      <>
        <p>
          Sum of per-unit revenue across all units. Headline chain metric.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>Total revenue across all your trucks combined.</strong> At
            <strong> 5 trucks doing 200,000 zł each</strong> = 1M zł/month —
            chain territory, where suppliers take you seriously. Below 5 trucks
            you&apos;re effectively just one operator with backup units.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>5 units = real chain:</strong> below 5, you&apos;re scaling; at 5, you have leverage; above 5, you have a system.</li>
            <li><strong>Watch per-unit dilution:</strong> if fleet revenue grows 30% but unit-1 dropped, you have cannibalisation. Diagnose with per-unit data.</li>
            <li><strong>1M zł/mo unlocks tier-3 supply discounts:</strong> negotiate the next supplier tier when crossing.</li>
            <li><strong>Watch the €2M annual threshold per entity:</strong> staying under keeps 9% CIT. Cross it and you jump to 19%.</li>
            <li><strong>Compare YoY growth:</strong> fleet revenue should grow faster than per-unit. If they grow together, you&apos;re not scaling.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> fleet revenue = Σ per-unit revenue. Adjusted for cannibalisation between same-DMA units.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges by fleet size:</strong> 2 units 250-400k zł/mo; 5 units 700k-1.2M; 10 units 1.4-2.4M; 20 units 2.8-5M.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Polish franchise-system financials, chain-economics literature.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> per-unit variance. Fleet revenue averages mask outlier units. A struggling unit can be hidden in a successful fleet.</p>
        </Methodology>
      </>
    ),
  },
  fleetEbitda: {
    title: "Fleet EBITDA / mo",
    body: (
      <>
        <p>
          Sum of per-unit EBITDA across the fleet. The investor question for
          franchise rollups.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>Total EBITDA across the fleet.</strong> <strong>20%+ of
            fleet revenue</strong> is what makes a chain investable. Below 15%
            you can&apos;t fund growth from operations; you need debt or
            equity — and the bank wants to see this number first.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Fleet EBITDA &gt; 20% = self-fundable growth:</strong> can open new units from operations.</li>
            <li><strong>Watch the EBITDA margin trend:</strong> as you scale, HQ overhead can drag margin. If it&apos;s falling, HQ is bloating.</li>
            <li><strong>Valuation multiple: 4-7× EBITDA in PL casual-Italian:</strong> a 2.4M zł fleet EBITDA = 10-17M sale price. Material.</li>
            <li><strong>Reinvestment vs distribution:</strong> 30-40% reinvest, 40-50% pay down debt, 20-30% to owners is a balanced split.</li>
            <li><strong>Don&apos;t confuse EBITDA with cash:</strong> tax, working-capital changes, capex eat real cash. EBITDA is a proxy, not the bank account.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> fleet EBITDA = Σ (per-unit revenue − per-unit operating costs) − HQ overhead. Before D&amp;A, interest, tax.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges:</strong> 15-22% chain-grade; 22-28% investor-grade; 28-35% world-class chains; &gt; 35% suspicious (check normalisations).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> NRA chain-economics benchmarks, Polish franchise-system financials, M&amp;A multiples data.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> normalisations applied by investors in due diligence (founder salary normalisation, one-off costs). Real reported EBITDA can swing 10-20% from these adjustments.</p>
        </Methodology>
      </>
    ),
  },
  ebitdaPerUnit: {
    title: "EBITDA / unit",
    body: (
      <>
        <p>
          Average per-unit EBITDA (fleet EBITDA ÷ units). Tracks unit-level
          health as the chain scales.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>Average EBITDA per truck.</strong> If unit #1 does 50k
            EBITDA and unit #5 does 35k (cannibalisation), the average is 42k.
            Watch this trend as you add units — if it stops growing,
            <strong> scale economics aren&apos;t compounding</strong> and the
            next truck is harder to justify.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Rising EBITDA/unit = scale working:</strong> as you add units, supplier discounts &amp; HQ absorption compound. If flat, something&apos;s off.</li>
            <li><strong>Decompose new-unit performance:</strong> if Unit 5 underperforms Unit 1, identify why (worse location? leadership gap? cannibalisation?).</li>
            <li><strong>Set per-unit EBITDA floors:</strong> &quot;no unit allowed to ship at &lt; 30k zł EBITDA&quot; — clear bar for closure or restructuring.</li>
            <li><strong>Compare to industry chain benchmarks:</strong> Polish QSR chains avg ~35-50k EBITDA per casual-Italian unit. Above 50k is genuinely strong.</li>
            <li><strong>Year-over-year per-unit:</strong> should grow 5-10% as systems mature. Flat year-over-year = process stagnation.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> EBITDA per unit = fleet EBITDA ÷ unit count. Average; doesn&apos;t show distribution.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges (PL casual-Italian):</strong> 25-40k zł/month/unit at scale. World-class chains 45-60k/unit.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> NRA chain-economics, Polish franchise-system per-unit financials.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> outlier impact. One mega-unit can pull the average up while others struggle. Also use median or P25 per-unit EBITDA to spot weakness.</p>
        </Methodology>
      </>
    ),
  },
  hqOverheadAbsorption: {
    title: "HQ overhead absorption",
    body: (
      <>
        <p>
          HQ overhead ÷ fleet revenue. Should fall below 5% past 10 units.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>What share of revenue goes to regional management.</strong>
            At 10% you&apos;re top-heavy (small chain, big bureaucracy). Past
            10 trucks you should be <strong>under 5%</strong> — otherwise
            you&apos;re building a corporate office, not a restaurant business.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Target trajectory:</strong> 10% at 2 units → 7% at 5 → 5% at 10 → 3% at 20. Linear scale wins.</li>
            <li><strong>Don&apos;t hire HQ ahead of need:</strong> a 3-unit chain doesn&apos;t need a full operations director. Outsource fractional.</li>
            <li><strong>Audit HQ value-add quarterly:</strong> each HQ hire should justify their cost via per-unit performance lift. Cut roles that don&apos;t.</li>
            <li><strong>Centralise the highest-leverage functions first:</strong> finance, marketing, supply. Operations last (each unit needs local ops leadership).</li>
            <li><strong>Watch the absorption trend:</strong> rising = HQ growing faster than fleet. Either accelerate openings or freeze HQ hires.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> HQ overhead absorption = HQ overhead ÷ fleet revenue × 100%.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy trajectory:</strong> &lt; 3% at 20+ units (mature chain); 3-5% at 10-19 units; 5-8% at 5-9 units; 8-12% at 2-4 units.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> franchise economics literature, Polish chain financials (Pizza Hut PL, Da Grasso, Telepizza).</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> capability vs spend. A 5% HQ can be wasteful or world-class — the model only sees the cost ratio, not the output quality.</p>
        </Methodology>
      </>
    ),
  },
  fleetBuildout: {
    title: "Fleet build-out",
    body: (
      <>
        <p>
          Total capital outlay across all units. Aggregate setup cost driving
          fleet payback.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>Total money sunk into all the trucks combined.</strong>
            <strong> 5 trucks at 250k each</strong> (with the learning curve)
            ≈ 1.25M zł of capital deployed. Cash-on-cash divided by this is the
            only return number that matters at scale.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Watch the learning-curve compounding:</strong> if you save 8%/unit, by unit 6 your buildout is ~50% of unit 1. That&apos;s the chain economics moment.</li>
            <li><strong>Mix debt and equity strategically:</strong> equity for unit 1-2 (high uncertainty), debt for unit 3+ (proven). Cuts dilution.</li>
            <li><strong>Use franchise to lower fleet buildout:</strong> franchisees fund their own units. Fleet revenue grows; capital outlay stays flat.</li>
            <li><strong>Plan capex calendar:</strong> 2 units in spring, 1 in autumn. Don&apos;t bunch openings — split-cash risk.</li>
            <li><strong>Compare fleet buildout to fleet EBITDA:</strong> if it&apos;s 3-5× annual EBITDA, you&apos;re leveraged on growth. 2-3× is healthier.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> fleet buildout = Σ per-unit setup cost. Per-unit setup = unit_1 setup × (1 − learning)^(n−1), floored at buildoutFloor%.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Realistic range:</strong> 2 units ~520-580k zł (no learning yet); 5 units ~1.1-1.3M; 10 units ~1.9-2.3M; 20 units ~3.5-4.2M with mature learning curve.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Polish chain expansion case studies, franchise rollout literature.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> commissary buildout. If you add a central kitchen, add 250-500k to fleet buildout.</p>
        </Methodology>
      </>
    ),
  },

  // SSSG strip
  revenueGrowth: {
    title: "Revenue growth",
    body: (
      <>
        <p>
          % growth in revenue vs prior trailing window. SSSG headline.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>How much more (or less) you sold vs the same period
            before.</strong> +5% is healthy; +15% is hot; flat means
            you&apos;re keeping up with inflation; negative is a warning
            light — drop everything and figure out why.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Decompose growth weekly:</strong> orders growth + ticket growth = revenue growth. Know which lever is moving.</li>
            <li><strong>Beat inflation:</strong> nominal +4% growth in PL = real 0% (inflation matches). Aim for +8-10% nominal to grow in real terms.</li>
            <li><strong>SSSG (Same-Store Sales Growth) is THE chain metric:</strong> excludes new units. Pure organic growth of existing operations.</li>
            <li><strong>Negative growth = root-cause analysis:</strong> competitor opened? Quality drift? Bad reviews? Investigate within 30 days.</li>
            <li><strong>Compare to peers, not just yourself:</strong> if industry is +12% and you&apos;re +6%, you&apos;re losing share even while growing nominally.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> revenue growth = (current period revenue − prior period revenue) ÷ prior period revenue. Same-store basis (exclude new units).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Industry benchmark (PL gastronomic 2024):</strong> +6-9% nominal annual growth = healthy; +12% = strong; +15%+ = exceptional or capacity-constrained.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> GUS quarterly gastronomic-sector data, Polish hospitality association SSSG benchmarks.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> weather-adjusted growth. A rainy year hurts year-over-year unfairly. Compare to weather-adjusted baselines for honest measurement.</p>
        </Methodology>
      </>
    ),
  },
  orderGrowth: {
    title: "Order growth",
    body: (
      <>
        <p>
          % growth in order count. Volume-led growth signal.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>How many more (or fewer) orders you booked.</strong>
            Volume-led growth (more customers) is <em>healthier</em> than
            ticket-led growth (price hikes) — measures whether the brand is
            actually winning new people, not just charging existing ones more.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Volume growth is the truth-teller:</strong> if orders are flat but revenue grew, you&apos;ve only raised prices. That tops out.</li>
            <li><strong>Trace order growth to marketing channels:</strong> which channel acquired the new orders? Double down on what works.</li>
            <li><strong>Compare to capacity:</strong> if orders growing but capacity flat, you&apos;re approaching saturation. Plan capex.</li>
            <li><strong>Negative order growth + positive ticket growth:</strong> customers paying more individually but FEWER customers — defensive sign.</li>
            <li><strong>Watch retention vs acquisition split:</strong> growth from new customers vs returning. Different cost / different signal.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> order growth = (current period orders − prior period orders) ÷ prior period orders. Same-store basis.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges:</strong> +3-7% volume growth annual (real growth above inflation); &lt; +2% concerning; &gt; +12% likely capacity-pressed.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> GUS sectoral order-count data, NRA volume-growth benchmarks.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> seasonality. Compare year-over-year same-month, not month-over-month, for apples-to-apples.</p>
        </Methodology>
      </>
    ),
  },
  ticketGrowth: {
    title: "Ticket growth",
    body: (
      <>
        <p>
          % growth in avg ticket. Price/mix-led signal.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>How much bigger the average bill got.</strong> Price hikes
            show up here — fine in moderation, dangerous if it&apos;s the only
            growth source. Price-only growth always tops out, usually painfully
            (one day a customer says &quot;65 zł for a pizza? no thanks&quot;).
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Mix-driven ticket growth = healthy:</strong> attach more dessert/coffee = bigger ticket, customer doesn&apos;t notice. Best lever.</li>
            <li><strong>Price-driven ticket growth = compounds risk:</strong> annual menu hike of 5% matches inflation. Above that, customers feel it.</li>
            <li><strong>Decompose by SKU:</strong> the daily special is 10% higher YoY? Re-cost recipe. Premium pizza category 25% higher? Customers shifting to luxury items? Both?</li>
            <li><strong>Compare to capacity ROI:</strong> +5 zł avg ticket on 2,400 orders = ~12k zł/month. Worth a marketing investment of up to ~6k zł to lift attach.</li>
            <li><strong>Watch for downshift in ticket growth:</strong> consumer recession signal. Combine with cheapest-pizza shift to plan defensive.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> ticket growth = (current avg ticket − prior avg ticket) ÷ prior avg ticket. Same-store basis; pure mix/price effect.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges:</strong> +3-6% annual ticket growth = healthy (matches inflation + small mix lift); +8%+ = aggressive pricing or large mix shift.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> GUS price-index data, restaurant-industry mix-shift analysis.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> price elasticity. A 10% price hike doesn&apos;t lift ticket 10% — usually ~7% (some customers downshift). Adjust expectations.</p>
        </Methodology>
      </>
    ),
  },
  customerGrowth: {
    title: "Customer growth",
    body: (
      <>
        <p>
          % growth in unique-customer count. Acquisition-led signal.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>How many more new people walked through the door.</strong>
            Sustainable growth needs <em>both</em> positive customer growth +
            positive repeat rate — without both, the bucket leaks no matter how
            fast you pour in marketing spend.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Customer growth + repeat rate = total growth:</strong> new customers acquire, repeat customers compound. Track both.</li>
            <li><strong>Negative customer growth + positive revenue:</strong> existing customers paying more. Defensive — will collapse.</li>
            <li><strong>Trace channels:</strong> which marketing brought the new customers? Spend more there.</li>
            <li><strong>3-month rolling, not single month:</strong> single-month noise hides the trend.</li>
            <li><strong>Compare to local population:</strong> in a 50k-resident neighbourhood, growing customers 50%/year forever is impossible. Plan saturation.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> customer growth = (current period unique customers − prior period unique customers) ÷ prior period unique customers. Phone-based deduplication.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges:</strong> 5-10% annual net-new customer growth; &gt; 15% = high; &lt; 0 = customer-base decay.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Polish loyalty-program data, restaurant-customer-acquisition literature.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> phone-anonymous customers. Without phone-capture at checkout, the model can&apos;t deduplicate. Walk-up cash customers may be undercounted.</p>
        </Methodology>
      </>
    ),
  },

  // Customer economics
  repeatRate: {
    title: "Repeat rate",
    body: (
      <>
        <p>
          % of customers with ≥ 2 orders in the window. Healthy 30%+; below 15%
          = one-night-stand funnel.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>What % of customers come back.</strong> 30%+ means people
            love your pizza; below <strong>15%</strong> they tried it once and
            aren&apos;t returning — fix the <em>product</em>, not the
            marketing. No amount of Instagram spend rescues bad cheese.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Low repeat = product problem:</strong> the food, the wait, the temperature, the service. Fix this first; marketing only multiplies what&apos;s there.</li>
            <li><strong>Loyalty program targets repeat:</strong> &quot;4th pizza free&quot; gives a reason to return. Burn vs repeat-lift = the trade.</li>
            <li><strong>Texting recent customers:</strong> &quot;haven&apos;t seen you in 30 days, here&apos;s 5 zł off&quot; — converts ~12-18% of lapsed regulars.</li>
            <li><strong>Track within-90-day repeat:</strong> the meaningful metric (yearly is too long). 30%+ within 90 days = solid.</li>
            <li><strong>Compare across channels:</strong> direct customers repeat 2× more than Glovo customers. Channel mix affects this number directly.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> repeat rate = (customers with ≥ 2 orders in window) ÷ (total unique customers in window). Phone-based dedup.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges:</strong> 30%+ healthy (90-day); 40%+ strong; 50%+ excellent. Below 15% = one-time funnel; below 10% = product failure.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> loyalty-economics literature (Reichheld &quot;The Loyalty Effect&quot;), QSR repeat-rate benchmarks.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> seasonal-only customers (tourists, holiday-event-only). These look like non-repeaters but are repeat-by-season. Track separately if relevant.</p>
        </Methodology>
      </>
    ),
  },
  ordersPerCustomer: {
    title: "Orders / customer",
    body: (
      <>
        <p>
          Mean lifetime orders observed in the window.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>How many times the average customer orders.</strong> 1.0 =
            nobody comes back; 3.0 = real regulars; <strong>5.0+</strong> = you
            have a cult following (and probably should open a second truck
            within walking distance to monetise the foot traffic).
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Drives LTV directly:</strong> orders/customer × avg ticket × CM = customer lifetime value. More orders = more value.</li>
            <li><strong>Frequency-based loyalty:</strong> punch cards (4 pizzas → free dessert) directly lift this number.</li>
            <li><strong>SMS/email pings increase frequency:</strong> &quot;been a while, weekend special&quot; converts ~10% of lapsed regulars to repeat.</li>
            <li><strong>Watch the trend, not absolute:</strong> 2.3 → 2.7 over 6 months is healthy; flat at 1.5 forever is a fix-the-product signal.</li>
            <li><strong>Compare across cohorts:</strong> month-1 acquisition cohort might have 1.2 orders/customer; year-1 cohort might have 4.5. Cohort decay/growth is informative.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> orders per customer = total orders in window ÷ unique customers in window. Phone-based dedup.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges (90-day window):</strong> 1.0-1.5 transient; 1.5-2.5 average; 2.5-4 healthy regulars; 4+ cult following.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> loyalty-program data, restaurant-customer-frequency literature.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> frequency segmentation. A &quot;3.0 avg&quot; could be 20% of customers at 8 orders and 80% at 0.75 orders. Median tells a different story than mean.</p>
        </Methodology>
      </>
    ),
  },
  gpPerCustomer: {
    title: "GP / customer",
    body: (
      <>
        <p>
          Gross profit per unique customer in the window.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>Total profit you make per customer over the window.</strong>
            Multiplied by repeat rate, this is your effective LTV — and what
            you can afford to spend on acquisition. If GP/customer is 60 zł,
            you can spend up to <strong>~20 zł in marketing</strong> to acquire
            one (3× LTV/CAC rule).
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>3× LTV-to-CAC is the bar:</strong> spend up to 1/3 of GP/customer on acquiring them. Above that, payback gets too long.</li>
            <li><strong>Use GP, not revenue:</strong> revenue per customer overstates what you can afford. GP after variable costs is the cash you actually have.</li>
            <li><strong>Track cohort GP:</strong> month-1 cohort GP, month-12 cohort GP. Compounding cohorts = healthy growth.</li>
            <li><strong>Segment by channel:</strong> walk-up customer GP ≈ 2× Glovo customer GP (no commission). Allocate marketing accordingly.</li>
            <li><strong>Run unit economics test:</strong> at GP/customer = 60 zł × 90-day window, if marketing CAC = 30 zł, you have 100% payback in 90 days. Investor-grade.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> GP per customer = (revenue − COGS) ÷ unique customers, both computed over the analysis window.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges (90-day window, PL casual-Italian):</strong> 80-150 zł GP/customer for healthy operation; &lt; 60 zł indicates either low frequency or low ticket.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> SaaS/restaurant unit-economics literature (David Skok on cohort LTV).</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> customer LTV beyond the window. A 90-day GP underestimates a 24-month LTV. For investor-grade LTV, project the GP curve forward.</p>
        </Methodology>
      </>
    ),
  },
  cacImplied: {
    title: "CAC (implied)",
    body: (
      <>
        <p>
          Marketing fixed cost ÷ new customers per month. Real
          customer-acquisition cost.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>What each new customer cost you in marketing.</strong>
            Spend 5,000 zł, get 400 new customers, CAC = 12.50 zł. If
            <strong> LTV &lt; 3× this</strong>, your marketing is bleeding
            money — every Instagram ad makes you poorer. Pause it and fix
            retention first.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Channel mix CAC matters:</strong> Instagram CAC ~10-25 zł, Google ~15-35 zł, referral ~3-8 zł. Push the cheapest channel.</li>
            <li><strong>Loyalty referrals are gold:</strong> &quot;tell a friend, both get 10 zł off&quot; — CAC drops to ~5-8 zł for referred customers.</li>
            <li><strong>Track by acquisition cohort:</strong> January cohort CAC vs March cohort. Test creative + targeting changes.</li>
            <li><strong>Compare CAC to first-order CM1:</strong> if CAC = 25 zł and first-order CM1 = 25 zł, you break even on first visit. Profit comes from repeat.</li>
            <li><strong>Don&apos;t include organic in CAC denominator:</strong> only count attributed-marketing customers. Organic shouldn&apos;t flatter your numbers.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> CAC = marketing fixed cost ÷ net-new customers/month. Net-new = customers in current window with zero orders in prior window.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges (PL casual-Italian):</strong> 8-15 zł CAC with mostly-organic / referral mix; 15-30 zł with paid-social channels; 30-50 zł heavy paid acquisition.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> marketing-economics literature, restaurant-acquisition cost studies.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> attribution (one customer sees 3 ads + a friend&apos;s post + a Glovo placement). The model assumes single-touch attribution; reality is multi-touch.</p>
        </Methodology>
      </>
    ),
  },
  ltvCac: {
    title: "LTV / CAC",
    body: (
      <>
        <p>
          Customer lifetime value ÷ CAC. Institutional gate ≥ 3×. Below 1.5×
          is unprofitable acquisition.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>The most important number in marketing.</strong> 3×+ = scale
            your ads; 1.5–3× = workable but tight; <strong>below 1.5×</strong>
            = stop spending and fix retention first. Every champion brand sits
            above 5×; that&apos;s where you want to be before the second truck.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>3× is the institutional gate:</strong> below this, investors won&apos;t back marketing scale-up. It&apos;s the universal SaaS/QSR benchmark.</li>
            <li><strong>Improve the numerator (LTV):</strong> attach lift + repeat rate increase + ticket growth all raise LTV. Easier than cutting CAC.</li>
            <li><strong>Improve the denominator (CAC):</strong> referral programs + organic content. Paid acquisition has rising CAC; organic compounds.</li>
            <li><strong>Watch the trend, not just level:</strong> if LTV/CAC dropped 0.5× in 6 months, you&apos;re scaling marketing faster than you should.</li>
            <li><strong>Below 1.0× = stop:</strong> you&apos;re paying customers to come. Pause acquisition, fix the funnel, restart.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> LTV/CAC ratio = customer lifetime value ÷ customer acquisition cost. LTV = orders/customer × avg ticket × CM (over LTV window — typically 12-24 months).</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges:</strong> ≥ 3× institutional-grade; 2-3× workable; 1.5-2× tight; &lt; 1.5× pause marketing; &lt; 1 destroy value.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> SaaS/marketplace economics literature (David Skok), restaurant unit-economics frameworks.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> LTV time-horizon. Some champions cite LTV/CAC at 5+ years; restaurant churn is faster. Use 12-24 month window for honest casual-Italian math.</p>
        </Methodology>
      </>
    ),
  },
  customerPaybackKpi: {
    title: "Customer payback",
    body: (
      <>
        <p>
          Months for cumulative GP per customer to cover CAC. ≤ 6 mo strong,
          ≤ 12 mo acceptable.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>How many months until a new customer pays back what you
            spent acquiring them.</strong> Under 6 months = ad spend is rocket
            fuel; past 12 months = ad spend is anchor. The shorter this is,
            the faster you can compound — payback &lt; 3 months is where the
            growth-hack stories happen.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Payback &lt; 6 months = scale acquisition aggressively:</strong> your money compounds twice within the year.</li>
            <li><strong>6-12 months payback = balanced spend:</strong> match acquisition with cash flow; don&apos;t lever.</li>
            <li><strong>&gt; 12 months payback = constrain spend:</strong> the cash gap is too long; only spend what you can carry for &gt; 12 months.</li>
            <li><strong>Cohort payback varies:</strong> first-month customers might break even immediately; long-tail cohorts months 6-12. Mix matters.</li>
            <li><strong>Lift first-order CM1 to shorten payback:</strong> attach + ticket on the first visit makes the math work faster.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> customer payback = months for cumulative GP per customer to cover CAC. Numerically solved as the first month where Σ(month_m GP) ≥ CAC.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges:</strong> ≤ 3 mo = rocket fuel; 3-6 mo = strong; 6-12 mo = acceptable; 12-18 mo = constrained; &gt; 18 mo = stop.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> SaaS/marketplace payback frameworks, restaurant-cohort literature.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> customer survival (churn). The model assumes a typical customer continues earning GP; reality has cohort decay. Use a 24-month projected GP curve for accurate payback.</p>
        </Methodology>
      </>
    ),
  },
  newCustomerRevenue: {
    title: "New customer revenue",
    body: (
      <>
        <p>
          % of period revenue from net-new customers.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>% of revenue from people who walked through the door for
            the first time.</strong> If it&apos;s 70%+ you have a leaky bucket
            (no retention); if it&apos;s 20% you have a loyal base + a slow
            acquisition engine. Healthy mature trucks sit around <strong>30–40%
            new</strong>.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>30-40% new for mature operation:</strong> sustainable acquisition + healthy retention.</li>
            <li><strong>&gt; 60% new = leaky bucket:</strong> you&apos;re replacing churn with acquisition. Fix retention before scaling further.</li>
            <li><strong>&lt; 20% new = saturating:</strong> dependent on existing base. Open new acquisition channels.</li>
            <li><strong>Track quarterly:</strong> shifts in new vs returning signal market saturation, brand fatigue, or competitor entry.</li>
            <li><strong>Newer cohorts cost more to acquire:</strong> if new-customer share rises while CAC rises, you&apos;re scaling but bleeding. Investigate the funnel.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> new customer revenue share = revenue from customers with zero orders in prior window ÷ total revenue this window. Phone-based.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges:</strong> 30-40% new = balanced; 50-60% = acquisition-led growth; &gt; 60% = leaky; &lt; 20% = saturated.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> loyalty-economics literature, restaurant-customer-cohort studies.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> seasonal new-customer surges (tourists, festival visitors). These look like new acquisition but aren&apos;t retainable. Track tourist share separately if material.</p>
        </Methodology>
      </>
    ),
  },
  returningRevenue: {
    title: "Returning revenue",
    body: (
      <>
        <p>
          % of period revenue from prior-window customers.
        </p>
        <PlainTalk>
          <p style={{ margin: 0 }}>
            <strong>% of revenue from people who came back.</strong> The mirror
            of new-customer revenue. <strong>Returning &gt; new = sustainable
            repeat business</strong>. New &gt; returning = leaky bucket — fix
            retention before scaling ads, or you&apos;re running on a treadmill.
          </p>
        </PlainTalk>
        <Tips>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Returning &gt; 50% = sustainable:</strong> the institutional sign of a real brand vs a one-night-stand funnel.</li>
            <li><strong>Loyalty program lifts this directly:</strong> punch cards, app discounts, SMS reminders. Each compounds returning share.</li>
            <li><strong>Watch the customer LTV embedded here:</strong> returning customers cost less to retain than acquiring new ones. Each pp shift toward returning improves CAC efficiency.</li>
            <li><strong>If returning declining: check product quality:</strong> price, taste, service. Don&apos;t solve it with marketing.</li>
            <li><strong>Frequency boost = returning lift:</strong> SMS &quot;haven&apos;t seen you in 30 days&quot; recovers ~10-15% of lapsed regulars.</li>
          </ul>
        </Tips>
        <Methodology>
          <p style={{ margin: "0 0 6px" }}><strong>Formula:</strong> returning revenue share = revenue from customers with ≥ 1 order in prior window ÷ total revenue this window. Phone-based dedup.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Healthy ranges:</strong> 50-60% returning = sustainable; 60-70% = strong loyalty; &gt; 70% = saturated or low-acquisition.</p>
          <p style={{ margin: "0 0 4px" }}><strong>Sources:</strong> Reichheld &quot;The Loyalty Effect&quot;, QSR returning-customer literature.</p>
          <p style={{ margin: 0 }}><strong>Not modelled:</strong> partially-anonymous customers (no phone captured = can&apos;t deduplicate). Walk-up cash customers may be miscounted as new each visit.</p>
        </Methodology>
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
      // Preset sets the attach % VALUES but does NOT auto-enable the levers.
      // Every behavior assumption ships disabled by default; the operator
      // opts in explicitly by toggling each lever. Otherwise loading a
      // preset silently flips on six attach levers + their effect on the
      // P&L, which surprised operators who expected the preset to just
      // re-shape the base ticket / volume / COGS. Enabled state is
      // preserved if a lever was already on.
      assumptions: {
        ...(s.assumptions ?? DEFAULT_ASSUMPTIONS),
        coffeeAttach: {
          ...(s.assumptions?.coffeeAttach ?? DEFAULT_ASSUMPTIONS.coffeeAttach!),
          attachPct: preset.attach.coffee,
        },
        dessertAttach: {
          ...(s.assumptions?.dessertAttach ?? DEFAULT_ASSUMPTIONS.dessertAttach!),
          attachPct: preset.attach.dessert,
        },
        antipastiAttach: {
          ...(s.assumptions?.antipastiAttach ?? DEFAULT_ASSUMPTIONS.antipastiAttach!),
          attachPct: preset.attach.antipasti,
        },
        aperitivoAttach: {
          ...(s.assumptions?.aperitivoAttach ?? DEFAULT_ASSUMPTIONS.aperitivoAttach!),
          attachPct: preset.attach.aperitivo,
        },
        premiumToppingsAttach: {
          ...(s.assumptions?.premiumToppingsAttach ?? DEFAULT_ASSUMPTIONS.premiumToppingsAttach!),
          attachPct: preset.attach.premiumToppings,
        },
        pastaPrimoAttach: {
          ...(s.assumptions?.pastaPrimoAttach ?? DEFAULT_ASSUMPTIONS.pastaPrimoAttach!),
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
  // Channel economics + fleet economics use the RAW scenario's rates
  // (cogsPct, on-site paymentProcessorPct) so per-channel / per-unit rows
  // show the operator's typed values rather than the cross-channel
  // blended rate applyAssumptions produced. But the VOLUME (ordersPerDay
  // × daysOpenPerMonth) must come from effectiveScenario so monthly
  // amounts reconcile to the headline P&L — using typed volume here
  // over-states by ~8% for typical Warsaw seasonality (rainy days,
  // holiday closures, peak/event bonuses).
  const effectiveVolume = effectiveScenario
    ? {
        ordersPerDay: effectiveScenario.ordersPerDay,
        daysOpenPerMonth: effectiveScenario.daysOpenPerMonth,
      }
    : { ordersPerDay: scenario.ordersPerDay, daysOpenPerMonth: scenario.daysOpenPerMonth };
  const channels = computeChannelEconomics({ ...scenario, ...effectiveVolume });
  const attachEfficiency = computeAttachmentEfficiency(effectiveScenario!);
  const fleetEcon = computeFleetEconomics(
    { ...scenario, ...effectiveVolume },
    scenario.setupCostGrosze ?? 0,
  );
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
          label={<LabelWithInfo text="Monthly revenue" help={HELP.monthlyRevenue} />}
          value={computed.monthlyRevenue / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Wallet}
          tone="brand"
          hint={`${scenario.ordersPerDay} orders/day × ${scenario.daysOpenPerMonth} days`}
        />
        <KpiCard
          label={<LabelWithInfo text="Total cost" help={HELP.totalCost} />}
          value={computed.totalCost / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Banknote}
          tone="warning"
          hint={`COGS + labor + fixed`}
        />
        <KpiCard
          label={<LabelWithInfo text="Net profit" help={HELP.netProfit} />}
          value={computed.netProfit / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={computed.netProfit >= 0 ? TrendingUp : TrendingDown}
          tone={profitTone}
          hint={`${(computed.margin * 100).toFixed(1)}% margin`}
        />
        <KpiCard
          label={<LabelWithInfo text="Break-even" help={HELP.breakEvenKpi} />}
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

      <Card>
        <CardHeader
          title="Fixed monthly costs"
          description="What you pay every month regardless of orders. Revenue inputs (orders/day, ticket, days open, COGS) now live inside the editable Menu scenario cards below — pick or build a scenario there and click Apply."
          actions={<InfoButton title={HELP.fixedCosts.title} label="About fixed costs">{HELP.fixedCosts.body}</InfoButton>}
        />
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
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

      <MenuScenarioPicker
        activeId={scenario.menuScenario}
        overrides={scenario.menuScenarioOverrides}
        onApply={applyMenuScenario}
        onSaveOverride={(id, override) =>
          update((s) => ({
            ...s,
            menuScenarioOverrides: { ...(s.menuScenarioOverrides ?? {}), [id]: override },
          }))
        }
        onResetOverride={(id) =>
          update((s) => {
            const next = { ...(s.menuScenarioOverrides ?? {}) };
            delete next[id];
            return {
              ...s,
              menuScenarioOverrides: Object.keys(next).length > 0 ? next : undefined,
            };
          })
        }
      />

      <BehaviorAssumptionsCard
        assumptions={scenario.assumptions ?? DEFAULT_ASSUMPTIONS}
        baseTicketGrosze={scenario.avgTicketGrosze}
        baseCogsPct={scenario.cogsPct}
        ordersPerDay={effectiveScenario?.ordersPerDay ?? scenario.ordersPerDay}
        daysOpenPerMonth={effectiveScenario?.daysOpenPerMonth ?? scenario.daysOpenPerMonth}
        typedOrdersPerDay={scenario.ordersPerDay}
        typedDaysOpenPerMonth={scenario.daysOpenPerMonth}
        paymentProcessorPct={effectiveScenario?.paymentProcessorPct ?? scenario.paymentProcessorPct ?? 0}
        wastePct={scenario.wastePct ?? 0}
        refundPct={scenario.refundPct ?? 0}
        loyaltyBurnPct={scenario.loyaltyBurnPct ?? 0}
        citPct={scenario.citPct ?? 0}
        onChange={(next) => update((s) => ({ ...s, assumptions: next }))}
      />

      {attachEfficiency.length > 0 && <AttachmentEfficiencyPanel rows={attachEfficiency} />}

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
          label={<LabelWithInfo text="Food cost % revenue" help={HELP.foodCostPct} />}
          value={computed.foodCostPct * 100}
          format={(n) => `${n.toFixed(1)}%`}
          icon={Utensils}
          tone={computed.foodCostPct > 0.32 ? "danger" : computed.foodCostPct > 0.28 ? "warning" : "success"}
          hint="Industry target ≤ 30%"
        />
        <KpiCard
          label={<LabelWithInfo text="Labor cost % revenue" help={HELP.laborCostPct} />}
          value={computed.laborPct * 100}
          format={(n) => `${n.toFixed(1)}%`}
          icon={ChefHat}
          tone={computed.laborPct > 0.32 ? "danger" : computed.laborPct > 0.28 ? "warning" : "success"}
          hint="Restaurant target ≤ 30%"
        />
        <KpiCard
          label={<LabelWithInfo text="Prime cost % revenue" help={HELP.primeCostPct} />}
          value={computed.primeCostPct * 100}
          format={(n) => `${n.toFixed(1)}%`}
          icon={Scale}
          tone={computed.primeCostPct > 0.65 ? "danger" : computed.primeCostPct > 0.6 ? "warning" : "success"}
          hint="COGS + labor — keep ≤ 60–65%"
        />
        <KpiCard
          label={<LabelWithInfo text="Contribution margin" help={HELP.contributionMargin} />}
          value={computed.trueContributionMarginPct * 100}
          format={(n) => `${n.toFixed(1)}%`}
          icon={Percent}
          tone={computed.trueContributionMarginPct < 0.50 ? "danger" : computed.trueContributionMarginPct < 0.60 ? "warning" : "success"}
          hint={`After COGS, fees, waste, refunds, loyalty (was ${(computed.contributionMarginPct * 100).toFixed(1)}% upper-bound)`}
        />
        <KpiCard
          label={<LabelWithInfo text="Margin of safety" help={HELP.marginOfSafety} />}
          value={computed.marginOfSafetyPct * 100}
          format={(n) => `${n.toFixed(1)}%`}
          icon={Shield}
          tone={computed.marginOfSafetyPct < 0.1 ? "danger" : computed.marginOfSafetyPct < 0.25 ? "warning" : "success"}
          hint="Demand drop you can absorb"
        />
        <KpiCard
          label={<LabelWithInfo text="Revenue / labor hour" help={HELP.revenuePerLaborHour} />}
          value={computed.revenuePerLaborHour / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Gauge}
          tone="info"
          hint={`${Math.round(computed.laborHoursPerMonth).toLocaleString("pl-PL")} labor h/mo`}
        />
        <KpiCard
          label={<LabelWithInfo text="Setup payback" help={HELP.setupPaybackKpi} />}
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
            label={<LabelWithInfo text="Kitchen capacity" help={HELP.kitchenCapacityKpi} />}
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
              label={<LabelWithInfo text="Peak orders / hour" help={HELP.peakOrdersPerHour} />}
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
            label={<LabelWithInfo text="Median ticket time" help={HELP.medianTicketTimeKpi} />}
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
          <PlainTalk>
            <p style={{ margin: 0 }}>
              These are the numbers an investor reads before deciding whether to write
              you a cheque. The one to memorise: <strong>cash-on-cash</strong>. If you
              spent <strong>300,000 zł</strong> setting up the truck and it generates
              <strong> 90,000 zł of profit/year</strong>, that&apos;s
              <strong> 30% cash-on-cash</strong> — better than almost any stock or
              bond. Below 15% an investor will ask why you didn&apos;t just buy index
              funds.
            </p>
          </PlainTalk>
        </InfoButton>
        <span className="v2-muted text-xs">EBITDA / EBITDAR / cash-on-cash / occupancy — IC-grade headline metrics</span>
      </div>
      <section className="v2-kpi-grid">
        <KpiCard
          label={<LabelWithInfo text="EBITDA" help={HELP.ebitdaKpi} />}
          value={computed.ebitda / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Wallet}
          tone={computed.ebitda >= 0 ? "success" : "danger"}
          hint={`${monthlyRevenuePctOrDash(computed.ebitda, computed.monthlyRevenue)} EBITDA margin`}
        />
        <KpiCard
          label={<LabelWithInfo text="EBITDAR" help={HELP.ebitdarKpi} />}
          value={computed.ebitdar / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Wallet}
          tone={computed.ebitdar >= 0 ? "success" : "danger"}
          hint="EBITDA + rent — the franchise-rollup standard"
        />
        <KpiCard
          label={<LabelWithInfo text="Cash-on-cash" help={HELP.cashOnCash} />}
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
          label={<LabelWithInfo text="Occupancy ratio" help={HELP.occupancyRatio} />}
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
          label={<LabelWithInfo text="Net sales" help={HELP.netSalesKpi} />}
          value={computed.netSales / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Banknote}
          tone="info"
          hint="Revenue net of refunds / comps / voids"
        />
        <KpiCard
          label={<LabelWithInfo text="Contribution / labor hr" help={HELP.contributionPerLaborHr} />}
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
          label={<LabelWithInfo text="Promo-adjusted AOV" help={HELP.promoAdjustedAov} />}
          value={computed.promoAdjustedAvgTicket / 100}
          format={(n) => `${n.toFixed(2)} zł`}
          icon={HandCoins}
          tone="info"
          hint={`Gross ${(scenario.avgTicketGrosze / 100).toFixed(2)} − loyalty drag`}
        />
        <KpiCard
          label={<LabelWithInfo text="True CM1 / order" help={HELP.trueCm1PerOrderKpi} />}
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
          <PlainTalk>
            <p style={{ margin: 0 }}>
              The honest version of &quot;when do I get my money back?&quot;. If you
              spent <strong>300,000 zł</strong> on truck + buildout and the first 4
              months only do 50–100% of normal volume (training, slow word-of-mouth),
              you don&apos;t actually clear setup until month <strong>18–22</strong>,
              not month 12 like the simple math suggests. Investors care: a 20-month
              payback beats a 30-month one by ~<strong>40% in IRR terms</strong>, and
              that&apos;s the difference between funded and ignored.
            </p>
          </PlainTalk>
        </InfoButton>
        <span className="v2-muted text-xs">
          24-month projection with a 4-month opening ramp · setup{" "}
          {formatPrice(scenario.setupCostGrosze ?? 0)}
        </span>
      </div>
      <section className="v2-kpi-grid">
        <KpiCard
          label={<LabelWithInfo text="Cash break-even" help={HELP.cashBreakEvenKpi} />}
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
          label={<LabelWithInfo text="NPV @ 10%" help={HELP.npv10} />}
          value={investorReturns.npv10 / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Wallet}
          tone={investorReturns.npv10 > 0 ? "success" : "danger"}
          hint="Discount rate: 10% / yr"
        />
        <KpiCard
          label={<LabelWithInfo text="NPV @ 15%" help={HELP.npv15} />}
          value={investorReturns.npv15 / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Wallet}
          tone={investorReturns.npv15 > 0 ? "success" : "warning"}
          hint="Discount rate: 15% / yr"
        />
        <KpiCard
          label={<LabelWithInfo text="NPV @ 20%" help={HELP.npv20} />}
          value={investorReturns.npv20 / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Wallet}
          tone={investorReturns.npv20 > 0 ? "success" : "danger"}
          hint="Hurdle rate for PE-style capital"
        />
        <KpiCard
          label={<LabelWithInfo text="IRR (24 mo)" help={HELP.irr24} />}
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
        anchorId="top-line-growth"
      />

      <SssgStrip
        sssg={
          sssg && (sssg.currentOrders > 0 || sssg.priorOrders > 0)
            ? sssg
            : computeSimulatedSssg(effectiveScenario ?? scenario)
        }
        simulated={!sssg || (sssg.currentOrders === 0 && sssg.priorOrders === 0)}
      />

      <ModuleDivider
        index={2}
        title="Scale story (multi-unit / franchise)"
        subtitle="HQ absorption, supply consolidation, royalty, DMA cannibalisation, build-out learning"
        anchorId="fleet"
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
        anchorId="unit-economics"
      />

      <UnitEconomicsPanel
        scenario={effectiveScenario ?? scenario}
        computed={computed}
        actuals={actuals}
      />

      <ChannelEconomicsPanel rows={channels} />

      <ModuleDivider
        index={4}
        title="Customer economics"
        subtitle="Cohort retention, LTV, CAC, new-vs-returning mix"
        anchorId="customer-economics"
      />

      {cohorts && cohorts.totalCustomers > 0 ? (
        <CohortPanel cohorts={cohorts} marketingMonthlyGrosze={scenario.fixedCosts.marketing ?? 0} />
      ) : (
        <EmptyModuleCard
          title="Cohort retention populates from real orders"
          description="Once 20+ paid orders carry a customer phone (the loyalty engine captures phone at checkout), this section will surface repeat rate, GP per customer, implied CAC, LTV/CAC ratio, customer payback, and the new-vs-returning revenue mix. Until then, the scenario's flat assumptions about retention and marketing drive the projection above."
          cta={`Orders observed so far: ${cohorts?.totalCustomers ?? 0} distinct phones in the rolling 180-day window.`}
        />
      )}

      <ModuleDivider
        index={5}
        title="Operational throughput"
        subtitle="Daypart mix, hourly volume, oven physics, prep flow, queue conversion, shift coverage"
        anchorId="operations"
      />

      {dayparts && dayparts.some((d) => d.ordersCount > 0) ? (
        <DaypartPanel dayparts={dayparts} />
      ) : (
        <EmptyModuleCard
          title="Daypart breakdown waits on timestamped orders"
          description="Splits real orders into Lunch (11-15) / Dinner (17-22) / Late-night (22-04) / Off-peak buckets, then computes per-daypart volume, AOV, and gross-profit rate. The 5/6/7 modules below (oven curve, prep flow, shift plan) all build on this signal."
          cta="No fulfilled orders yet in the rolling 90-day window."
        />
      )}

      {hourly && hourly.some((h) => h.totalOrders > 0) ? (
        <HourlyThroughputPanel hourly={hourly} pizzasPerHourCap={cap} />
      ) : null}

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
        anchorId="menu-strategy"
      />

      {(() => {
        const hasReal = menuEng && menuEng.length > 0;
        const rows = hasReal ? menuEng : computeSimulatedMenuEngineering(effectiveScenario ?? scenario);
        if (rows.length === 0) return null;
        return (
          <>
            <MenuEngineeringPanel rows={rows} simulated={!hasReal} />
            <MarginTrapsCallout rows={rows} simulated={!hasReal} />
          </>
        );
      })()}

      <ModuleDivider
        index={7}
        title="Sensitivity & scenario analysis"
        subtitle="Tornado, conservative / realistic / optimistic, heatmaps, ±20% volume flex"
        anchorId="sensitivity"
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
        anchorId="projection"
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
              label={<LabelWithInfo text="Wage inflation (annual)" help={HELP.wageInflation} />}
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
              label={<LabelWithInfo text="Ingredient + fixed inflation (annual)" help={HELP.ingredientInflation} />}
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
              label={<LabelWithInfo text="On-site card fee" help={HELP.onSiteCardFee} />}
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
              label={<LabelWithInfo text="Cash share" help={HELP.cashShare} />}
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
              label={<LabelWithInfo text="Glovo share" help={HELP.glovoShare} />}
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
              label={<LabelWithInfo text="Glovo commission" help={HELP.glovoCommission} />}
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
              label={<LabelWithInfo text="Wolt share" help={HELP.woltShare} />}
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
              label={<LabelWithInfo text="Wolt commission" help={HELP.woltCommission} />}
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
              label={<LabelWithInfo text="Setup cost" help={HELP.setupCost} />}
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
              label={<LabelWithInfo text="Depreciation & amortisation" help={HELP.depreciation} />}
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
              label={<LabelWithInfo text="Interest expense" help={HELP.interestExpense} />}
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
              label={<LabelWithInfo text="Packaging per order" help={HELP.packagingPerOrder} />}
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
                <PlainTalk>
                  <p style={{ margin: 0 }}>
                    Are Instagram ads &quot;rent&quot; (you pay it regardless) or
                    &quot;customer cost&quot; (you only pay because of the customers
                    you got)? Flipping this changes the answer. If you spend
                    <strong> 3,000 zł/month</strong> on marketing and get
                    <strong> 2,400 orders/month</strong>, that&apos;s
                    <strong> 1.25 zł of CAC per order</strong> — invisible in the
                    fixed-cost view, but big enough to flip Glovo orders from
                    &quot;profitable&quot; to &quot;losing&quot; once you do the math
                    honestly.
                  </p>
                </PlainTalk>
              </InfoButton>
            </div>
            <Input
              label={<LabelWithInfo text="Waste & spoilage" help={HELP.wastePct} />}
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
              label={<LabelWithInfo text="Refunds / comps / theft" help={HELP.refundsPct} />}
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
              label={<LabelWithInfo text="Loyalty point burn" help={HELP.loyaltyBurn} />}
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
              label={<LabelWithInfo text="Corporate income tax" help={HELP.citRate} />}
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
              label={<LabelWithInfo text="Winter volume multiplier" help={HELP.winterMultiplier} />}
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
              label={<LabelWithInfo text="Kitchen — pizzas/hour" help={HELP.pizzasPerHour} />}
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
              label={<LabelWithInfo text="Kitchen — service hours/day" help={HELP.serviceHoursPerDay} />}
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
              label={<LabelWithInfo text="Labor flex with volume" help={HELP.laborFlex} />}
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
              label={<LabelWithInfo text="Labor anchor (orders/day)" help={HELP.laborAnchor} />}
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
              label={<LabelWithInfo text="Kitchen — peak-hour share" help={HELP.peakHourShare} />}
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
              label={<LabelWithInfo text="Prep-complexity multiplier" help={HELP.prepComplexity} />}
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
              label={<LabelWithInfo text="Summer volume multiplier" help={HELP.summerMultiplier} />}
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
              label={<LabelWithInfo text="Spring volume multiplier" help={HELP.springMultiplier} />}
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
              label={<LabelWithInfo text="Autumn volume multiplier" help={HELP.autumnMultiplier} />}
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
              label={<LabelWithInfo text="12-mo revenue" help={HELP.twelveMoRevenue} />}
              value={projectionTotals.revenue}
              format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
              icon={CalendarRange}
              tone="brand"
            />
            <KpiCard
              label={<LabelWithInfo text="12-mo costs" help={HELP.twelveMoCosts} />}
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
              label={<LabelWithInfo text="12-mo net profit" help={HELP.twelveMoNetProfit} />}
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
              label={<LabelWithInfo text="Best / worst month" help={HELP.bestWorstMonth} />}
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
        anchorId="ai"
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
  overrides: Record<string, SimulationMenuScenarioOverride> | undefined;
  onApply: (preset: MenuScenarioPreset) => void;
  onSaveOverride: (id: string, override: SimulationMenuScenarioOverride) => void;
  onResetOverride: (id: string) => void;
}

function MenuScenarioPicker({ activeId, overrides, onApply, onSaveOverride, onResetOverride }: MenuScenarioPickerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingPreset = editingId
    ? resolveScenarioPreset(editingId, overrides)
    : null;
  return (
    <Card>
      <CardHeader
        title="Menu scenarios"
        description="Six archetypes — pick one to load orders/day, ticket, COGS and behavior levers in a single click, or click the pencil to edit a card's values. Save persists your edits across reloads; Reset restores the baked-in defaults."
        actions={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <InfoButton title={HELP.menuScenario.title} label="About menu scenarios">{HELP.menuScenario.body}</InfoButton>
            <Utensils className="h-4 w-4 v2-muted" />
          </span>
        }
      />
      <CardBody>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {MENU_SCENARIOS_WITH_CUSTOM.map((preset) => {
            const resolved = resolveScenarioPreset(preset.id, overrides);
            const isActive = preset.id === activeId;
            const hasOverride = overrides?.[preset.id] !== undefined;
            return (
              <div
                key={preset.id}
                style={{
                  position: "relative",
                  textAlign: "left",
                  padding: 14,
                  borderRadius: 12,
                  border: `1.5px solid ${isActive ? "var(--brand)" : "var(--border)"}`,
                  background: isActive ? "var(--brand-soft, var(--surface-2))" : "var(--surface-2)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  fontFamily: "inherit",
                  color: "inherit",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                <button
                  type="button"
                  onClick={() => setEditingId(preset.id)}
                  aria-label={`Edit ${preset.name}`}
                  title="Edit values"
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    border: "1px solid color-mix(in oklab, var(--fg) 12%, transparent)",
                    background: "color-mix(in oklab, var(--fg) 4%, transparent)",
                    color: "color-mix(in oklab, var(--fg) 75%, transparent)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onApply(resolved)}
                  aria-pressed={isActive}
                  style={{
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: "inherit",
                    fontFamily: "inherit",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 36 }}>
                    <span style={{ fontSize: 28, lineHeight: 1 }} aria-hidden>
                      {resolved.emoji}
                    </span>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {hasOverride && (
                        <Badge tone="info" variant="soft">
                          Customised
                        </Badge>
                      )}
                      {isActive && (
                        <Badge tone="brand" variant="soft" dot>
                          Active
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{resolved.name}</div>
                  <div className="v2-muted" style={{ fontSize: 12, lineHeight: 1.4, minHeight: 50 }}>
                    {resolved.description}
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
                      <strong className="tabular">{resolved.ordersPerDay}</strong>
                    </span>
                    <span>
                      <span className="v2-muted">Ticket</span>{" "}
                      <strong className="tabular">{formatPrice(resolved.avgTicketGrosze)}</strong>
                    </span>
                    <span>
                      <span className="v2-muted">Days/mo</span>{" "}
                      <strong className="tabular">{resolved.daysOpenPerMonth}</strong>
                    </span>
                    <span>
                      <span className="v2-muted">COGS</span>{" "}
                      <strong className="tabular">{Math.round(resolved.cogsPct * 100)}%</strong>
                    </span>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </CardBody>
      {editingPreset && (
        <MenuScenarioEditDialog
          preset={editingPreset}
          basePreset={MENU_SCENARIO_BY_ID.get(editingPreset.id) ?? CUSTOM_PRESET}
          override={overrides?.[editingPreset.id]}
          isActive={editingPreset.id === activeId}
          onClose={() => setEditingId(null)}
          onPreview={(override) => {
            // Real-time preview: every keystroke pushes the draft into
            // the live scenario. This is the "real-time results" the
            // operator expects — KPIs / heatmaps / projections all
            // recompute on each edit through the existing useMemo
            // dependency chain.
            const base = MENU_SCENARIO_BY_ID.get(editingPreset.id) ?? CUSTOM_PRESET;
            onApply({
              ...base,
              ordersPerDay: override.ordersPerDay,
              daysOpenPerMonth: override.daysOpenPerMonth,
              avgTicketGrosze: override.avgTicketGrosze,
              cogsPct: override.cogsPct,
              attach: override.attach,
            });
          }}
          onSave={(override) => {
            // Persist + activate. Save means "I'm done editing — keep
            // these as the card's defaults AND make them the active
            // scenario."
            const base = MENU_SCENARIO_BY_ID.get(editingPreset.id) ?? CUSTOM_PRESET;
            onSaveOverride(editingPreset.id, override);
            onApply({
              ...base,
              ordersPerDay: override.ordersPerDay,
              daysOpenPerMonth: override.daysOpenPerMonth,
              avgTicketGrosze: override.avgTicketGrosze,
              cogsPct: override.cogsPct,
              attach: override.attach,
            });
            setEditingId(null);
          }}
          onReset={() => {
            const base = MENU_SCENARIO_BY_ID.get(editingPreset.id) ?? CUSTOM_PRESET;
            onResetOverride(editingPreset.id);
            // If this card is the active scenario, also reapply the
            // baked-in defaults so the live KPIs jump back to baseline.
            if (editingPreset.id === activeId) {
              onApply(base);
            }
            setEditingId(null);
          }}
        />
      )}
    </Card>
  );
}

interface MenuScenarioEditDialogProps {
  preset: MenuScenarioPreset;
  basePreset: MenuScenarioPreset;
  override: SimulationMenuScenarioOverride | undefined;
  isActive: boolean;
  /** Fires on every input change — pushes the current draft into the
   *  live scenario so KPIs / heatmaps / projections preview the impact
   *  immediately. Doesn't persist the override (Save does that). */
  onPreview: (override: SimulationMenuScenarioOverride) => void;
  onClose: () => void;
  onSave: (override: SimulationMenuScenarioOverride) => void;
  onReset: () => void;
}

/** Edit popup for a menu scenario card. Pushes a real-time preview into
 *  the live scenario on every keystroke so the operator sees the
 *  numbers move as they edit. Save persists the override (survives
 *  reload); Reset restores baked-in defaults. */
function MenuScenarioEditDialog({
  preset,
  basePreset,
  override,
  isActive,
  onPreview,
  onClose,
  onSave,
  onReset,
}: MenuScenarioEditDialogProps) {
  const startingDraft: SimulationMenuScenarioOverride = {
    ordersPerDay: preset.ordersPerDay,
    daysOpenPerMonth: preset.daysOpenPerMonth,
    avgTicketGrosze: preset.avgTicketGrosze,
    cogsPct: preset.cogsPct,
    attach: { ...preset.attach },
  };
  // Capture the scenario state at open-time so Cancel can roll back
  // any real-time previews the operator triggered while editing.
  const initialRef = useRef<SimulationMenuScenarioOverride>(startingDraft);
  const [draft, setDraft] = useState<SimulationMenuScenarioOverride>(startingDraft);
  const hasOverride = override !== undefined;
  const patchDraft = (patch: Partial<SimulationMenuScenarioOverride>) =>
    setDraft((d) => {
      const next = { ...d, ...patch };
      // Real-time preview only when this is the active scenario;
      // editing an inactive card shouldn't move the live KPIs (would
      // be confusing — operator is just configuring a saved preset).
      if (isActive) onPreview(next);
      return next;
    });
  const patchAttach = (patch: Partial<SimulationMenuScenarioOverride["attach"]>) =>
    setDraft((d) => {
      const next = { ...d, attach: { ...d.attach, ...patch } };
      if (isActive) onPreview(next);
      return next;
    });
  const handleCancel = () => {
    // Roll back any real-time preview to where we started.
    if (isActive) onPreview(initialRef.current);
    onClose();
  };
  return (
    <Dialog
      open
      onClose={handleCancel}
      title={`Edit ${preset.name}`}
      description={`Baked-in defaults: ${basePreset.ordersPerDay} orders/day · ${(basePreset.avgTicketGrosze / 100).toFixed(2)} zł ticket · ${basePreset.daysOpenPerMonth} days/mo · ${Math.round(basePreset.cogsPct * 100)}% COGS. Reset restores these.`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={onReset}
            disabled={!hasOverride}
            title={hasOverride ? "Restore baked-in defaults" : "No saved override to reset"}
          >
            Reset to default
          </Button>
          <Button variant="primary" onClick={() => onSave(draft)}>
            <Save className="h-3.5 w-3.5" />
            <span>Save</span>
          </Button>
        </>
      }
    >
      <div className="v2-stack-12">
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>
            Revenue inputs
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Orders / day"
              type="number"
              min="0"
              value={String(draft.ordersPerDay)}
              onChange={(e) => patchDraft({ ordersPerDay: Math.max(0, parseInt(e.target.value, 10) || 0) })}
            />
            <Input
              label="Avg ticket"
              type="number"
              step="0.50"
              min="0"
              value={(draft.avgTicketGrosze / 100).toFixed(2)}
              onChange={(e) =>
                patchDraft({
                  avgTicketGrosze: Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100)),
                })
              }
              trailingAdornment={<span className="v2-muted">zł</span>}
            />
            <Input
              label="Days / month"
              type="number"
              min="0"
              max="31"
              value={String(draft.daysOpenPerMonth)}
              onChange={(e) =>
                patchDraft({
                  daysOpenPerMonth: Math.max(0, Math.min(31, parseInt(e.target.value, 10) || 0)),
                })
              }
            />
            <Input
              label="COGS %"
              type="number"
              step="1"
              min="0"
              max="100"
              value={String(Math.round(draft.cogsPct * 100))}
              onChange={(e) =>
                patchDraft({ cogsPct: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)) })
              }
              trailingAdornment={<span className="v2-muted">%</span>}
            />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>
            Attach rates
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(
              [
                ["coffee", "Coffee"],
                ["dessert", "Dessert"],
                ["antipasti", "Antipasti"],
                ["aperitivo", "Aperitivo"],
                ["premiumToppings", "Prem. tops"],
                ["pastaPrimo", "Pasta primo"],
              ] as const
            ).map(([key, label]) => (
              <Input
                key={key}
                label={label}
                type="number"
                step="1"
                min="0"
                max="100"
                value={String(Math.round(draft.attach[key] * 100))}
                onChange={(e) =>
                  patchAttach({
                    [key]: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)),
                  })
                }
                trailingAdornment={<span className="v2-muted">%</span>}
              />
            ))}
          </div>
        </div>
      </div>
    </Dialog>
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

/** Empty-state card surfaced inside a module when the data it needs
 *  hasn't accumulated yet. Without this, modules just disappear
 *  silently — the user sees the divider with no content and assumes
 *  the feature is broken. */
function EmptyModuleCard({
  title,
  description,
  cta,
}: {
  title: string;
  description: string;
  cta?: string;
}) {
  return (
    <Card>
      <CardBody>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 8,
            padding: "16px 4px",
          }}
        >
          <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <Database
              className="h-4 w-4"
              style={{ color: "color-mix(in oklab, var(--brand) 70%, var(--fg))" }}
            />
            <span style={{ fontWeight: 600, fontSize: 14, color: "var(--fg)" }}>
              {title}
            </span>
          </div>
          <div
            style={{
              fontSize: 13.5,
              lineHeight: 1.5,
              color: "color-mix(in oklab, var(--fg) 75%, transparent)",
            }}
          >
            {description}
          </div>
          {cta && (
            <div
              style={{
                fontSize: 12.5,
                fontStyle: "italic",
                color: "color-mix(in oklab, var(--fg) 60%, transparent)",
              }}
            >
              {cta}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
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
  anchorId,
}: {
  index: number;
  title: string;
  subtitle?: string;
  /** Optional fragment id — when set, the divider becomes a #-link target
   *  so capability entries / direct URLs can jump straight to the module
   *  (e.g. /admin/simulation#fleet-model). The scroll offset accounts for
   *  the sticky topbar via scroll-margin-top on .v2-module-divider. */
  anchorId?: string;
}) {
  return (
    <div className="v2-module-divider" id={anchorId}>
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
              <PlainTalk>
                <p style={{ margin: 0 }}>
                  The flat labor number lies. If you&apos;ve got <strong>2 people at
                  14:00</strong> when one would do, and <strong>2 people at 19:00</strong>
                  when you need four, you&apos;re losing on both ends — the empty
                  lunch costs ~50 zł/hour and the dinner rush leaves angry customers
                  walking off (~500 zł of orders refused). Reshuffle headcount to peak
                  dayparts and you can drop total hours by <strong>10–15%</strong> while
                  actually serving more pizzas — typically <strong>~3,000 zł/month
                  saved</strong>.
                </p>
              </PlainTalk>
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
              <PlainTalk>
                <p style={{ margin: 0 }}>
                  Customers walk when the line is too long. If your peak hour wants
                  <strong> 40 pizzas</strong> but the oven only does 30, the 10 that
                  show up later wait 7+ minutes — and <strong>2 of them just leave</strong>.
                  Across a month that&apos;s ~60 lost orders ≈
                  <strong> ~4,000 zł of contribution gone</strong>. Adding a second
                  pizzaiolo for the dinner rush (~600 zł/month extra labor) more than
                  pays for itself.
                </p>
              </PlainTalk>
            </InfoButton>
            <Clock className="h-4 w-4 v2-muted" />
          </span>
        }
      />
      <CardBody>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label={<LabelWithInfo text="Modelled ticket time" help={HELP.modelledTicketTime} />}
            value={modeledMin}
            format={(n) => `${n.toFixed(1)} min`}
            icon={Clock}
            tone={modeledMin <= 4 ? "success" : modeledMin <= 8 ? "info" : modeledMin <= 12 ? "warning" : "danger"}
            hint="Pizza + weighted attach prep"
          />
          <KpiCard
            label={<LabelWithInfo text="Observed ticket time" help={HELP.observedTicketTime} />}
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
            label={<LabelWithInfo text="Peak-hour queue" help={HELP.peakHourQueue} />}
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
            label={<LabelWithInfo text="Wait time" help={HELP.waitTime} />}
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
              <PlainTalk>
                <p style={{ margin: 0 }}>
                  The brochure says the oven does <strong>320 pizzas/hour</strong>.
                  In real life you&apos;ll see <strong>70</strong>. Every pull, sweep,
                  dough rebuild and &quot;sorry, can I see the menu?&quot; eats oven
                  time. When your busiest hour hits <strong>85% of realistic capacity</strong>
                  (~60 pizzas/hr in this example), you&apos;re leaving money on the
                  table at peak — that&apos;s the signal to open truck #2 or add a
                  second oven, not push harder on marketing.
                </p>
              </PlainTalk>
            </InfoButton>
            <Flame className="h-4 w-4 v2-muted" />
          </span>
        }
      />
      <CardBody>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <Input
            label={<LabelWithInfo text="Pizzas per bake cycle" help={HELP.pizzasPerBake} />}
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
            label={<LabelWithInfo text="Cycle time" help={HELP.cycleTime} />}
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
            label={<LabelWithInfo text="Realistic efficiency" help={HELP.ovenEfficiency} />}
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
            label={<LabelWithInfo text="Theoretical peak" help={HELP.theoreticalPeak} />}
            value={theoreticalPerHour}
            format={(n) => `${Math.round(n)} /hr`}
            tone="info"
            hint={`${perCycle} pizzas × ${(3600 / cycleSec).toFixed(0)} cycles/hr`}
          />
          <KpiCard
            label={<LabelWithInfo text="Realistic peak" help={HELP.realisticPeak} />}
            value={realisticPerHour}
            format={(n) => `${Math.round(n)} /hr`}
            tone="info"
            hint={`Theoretical × ${(efficiency * 100).toFixed(0)}% efficiency`}
          />
          <KpiCard
            label={<LabelWithInfo text="Observed peak hour" help={HELP.observedPeakHour} />}
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
            label={<LabelWithInfo text="Saturation status" help={HELP.saturationStatus} />}
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
              <PlainTalk>
                <p style={{ margin: 0 }}>
                  Look at the bar pattern, not just the height. A truck with
                  <strong> 4 blue bars and 1 red bar</strong> is leaving money on the
                  table — you have a 4-hour empty window that could host a lunch
                  promotion or pre-rush coffee menu. A truck with
                  <strong> 18 blue bars and 6 red bars</strong> is fine; one with
                  <strong> 8 red bars in a row</strong> needs a second oven yesterday.
                  Each red hour is 5–15 walked-away customers ≈ 300–900 zł of revenue
                  refused that day.
                </p>
              </PlainTalk>
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
              <PlainTalk>
                <p style={{ margin: 0 }}>
                  Treat each daypart like a separate business. A red <strong>lunch
                  column</strong> with green dinner means your lunch menu is wrong (too
                  cheap, too few sides) — fix it with a 35 zł panini combo and the
                  daypart can go from <strong>−500 zł/month to +3,000 zł/month</strong>.
                  A red <strong>late-night column</strong> usually means staff cost
                  doesn&apos;t match the few orders — cut hours by 1 and save
                  ~1,200 zł/month.
                </p>
              </PlainTalk>
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
        <div style={{ position: "relative", height: 22, marginTop: 6 }}>
          {/* 0 — anchored to the far-left edge */}
          <span
            className="v2-muted text-xs"
            style={{ position: "absolute", left: 0, top: 0, transform: "translateX(0%)" }}
          >
            0
          </span>
          {/* Break-even label — anchored under the red marker */}
          <span
            className="text-xs"
            style={{
              position: "absolute",
              left: `${safe(breakeven)}%`,
              top: 0,
              transform: "translateX(-50%)",
              color: "rgb(239,68,68)",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            break-even {breakeven.toFixed(0)}
          </span>
          {/* Capacity label — anchored under the dark marker */}
          {computed.capacityOrdersPerDay > 0 && (
            <span
              className="text-xs"
              style={{
                position: "absolute",
                left: `${safe(computed.capacityOrdersPerDay)}%`,
                top: 0,
                transform: "translateX(-50%)",
                color: "color-mix(in oklab, var(--fg) 70%, transparent)",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              capacity {computed.capacityOrdersPerDay.toFixed(0)}
            </span>
          )}
          {/* Scale max — anchored to the far-right edge */}
          <span
            className="v2-muted text-xs"
            style={{ position: "absolute", right: 0, top: 0, transform: "translateX(0%)" }}
          >
            {Math.round(scaleMax)}
          </span>
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
  /** Per-attached-unit gross margin (sell − COGS only). Easy mental
   *  anchor; over-states the actual P&L impact by ~15-25%. */
  grossMarginPerUnitGrosze: number;
  /** Per-attached-unit NET margin after variable leakage (payment fees,
   *  waste, refunds, loyalty burn) AND CIT. Drives monthlyLift so the
   *  panel reconciles to the actual P&L delta. */
  netMarginPerUnitGrosze: number;
  /** Monthly profit lift = attachPct × netMargin × ordersPerMonth.
   *  Matches the actual P&L delta when this lever's attach % moves. */
  monthlyLiftGrosze: number;
}

/** Per-lever attachment efficiency — answers "is the espresso push actually
 *  earning its slot?" by computing the EFFECTIVE NET contribution per
 *  attached item (sell × (1 − itemCOGS − blendedPaymentFee − waste − refunds
 *  − loyaltyBurn) × (1 − CIT)) and the total monthly lift. Match the actual
 *  P&L delta rather than the misleadingly higher gross-margin number — see
 *  the AttachLeverHelp methodology block for the same decomposition. */
function computeAttachmentEfficiency(s: SimulationScenario): AttachLeverEfficiency[] {
  const a = s.assumptions;
  if (!a) return [];
  const ordersPerMonth = s.ordersPerDay * s.daysOpenPerMonth;
  // Scenario-level variable leakage applied to incremental attach revenue.
  // paymentProcessorPct is already the blended on-site/card/cash/Glovo/Wolt
  // rate when effectiveScenario was passed in (applyAssumptions blends it).
  const leakagePct =
    (s.paymentProcessorPct ?? 0) +
    (s.wastePct ?? 0) +
    (s.refundPct ?? 0) +
    (s.loyaltyBurnPct ?? 0);
  const citPct = s.citPct ?? 0;
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
    const grossMargin = lever.avgPriceGrosze * (1 - lever.cogsPct);
    const effRatio = Math.max(0, 1 - lever.cogsPct - leakagePct);
    const netMargin = lever.avgPriceGrosze * effRatio * (1 - citPct);
    rows.push({
      key,
      label,
      attachPct: lever.attachPct,
      avgPriceGrosze: lever.avgPriceGrosze,
      cogsPct: lever.cogsPct,
      grossMarginPerUnitGrosze: grossMargin,
      netMarginPerUnitGrosze: netMargin,
      monthlyLiftGrosze: lever.attachPct * netMargin * ordersPerMonth,
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
        description="Per-attach-lever NET contribution and monthly profit lift. Reconciles to the actual P&L delta — not just gross sell − COGS."
        actions={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <InfoButton title="Attachment efficiency" label="About attachment efficiency">
              <p>
                Attach rate is half the story. A 30% espresso attach at high net margin
                earns more than a 50% pasta attach at lower net margin — the lever you
                push depends on the <em>money</em>, not the percentage.
              </p>
              <p>
                <strong>Net margin / unit</strong> = sell × (1 − itemCOGS% −
                blendedPaymentFee − waste − refunds − loyaltyBurn) × (1 − CIT).{" "}
                This is the actual złoty each attached unit puts on the bottom line —
                not the gross sell − COGS, which over-states by 15-25% because the
                P&amp;L also applies all the variable-leakage rates and CIT to
                incremental attach revenue.
              </p>
              <p>
                <strong>Monthly lift = attachPct × net margin × orders/month.</strong>
                Reconciles directly to the actual monthly net-profit delta when the
                lever&apos;s attach % moves. Sorted descending — top row is where to
                push first.
              </p>
              <p>
                The &quot;Gross&quot; column shows sell − COGS for context — useful for
                staff coaching (&quot;each cup earns ~7.92 zł in raw margin&quot;) but
                don&apos;t use it for forecasting; the &quot;Net&quot; column is what
                actually lands.
              </p>
              <PlainTalk>
                <p style={{ margin: 0 }}>
                  Don&apos;t train your staff to push the lever with the biggest
                  percentage — train them on the lever with the biggest złoty. A
                  <strong> 50% pasta attach sounds amazing</strong>, but each pasta only
                  earns ~6 zł of NET margin after everything (high food cost, payment
                  fees, tax). A <strong>30% espresso attach</strong> sounds small, but
                  each cup nets ~6 zł too — and is 10× easier to suggest. Sort by the{" "}
                  <em>Monthly lift</em> column, talk about the top row at every staff
                  meeting.
                </p>
              </PlainTalk>
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
              <th
                style={{ padding: "8px 4px", textAlign: "right" }}
                title="Sell − COGS only. Easy mental anchor; over-states actual P&L impact."
              >
                Gross / unit
              </th>
              <th
                style={{ padding: "8px 4px", textAlign: "right" }}
                title="Sell × (1 − COGS − payment − waste − refunds − loyalty) × (1 − CIT). What actually lands on the bottom line."
              >
                Net / unit
              </th>
              <th
                style={{ padding: "8px 4px", textAlign: "right" }}
                title="attachPct × Net / unit × orders/month — matches actual P&L delta."
              >
                Monthly lift
              </th>
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
                    opacity: 0.75,
                  }}
                >
                  {(r.grossMarginPerUnitGrosze / 100).toFixed(2)} zł
                </td>
                <td
                  className="tabular"
                  style={{
                    padding: "8px 4px",
                    textAlign: "right",
                    color: r.netMarginPerUnitGrosze >= 500 ? "rgb(22,163,74)" : "inherit",
                    fontWeight: 500,
                  }}
                >
                  {(r.netMarginPerUnitGrosze / 100).toFixed(2)} zł
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
              <td colSpan={5}></td>
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
  source,
  revenuePerOrder,
  scaleMax,
}: {
  label: string;
  grosze: number;
  bold?: boolean;
  isTotal?: boolean;
  tone?: "neutral" | "warning" | "success" | "danger" | "brand";
  note?: string;
  /** Source tag: "actuals" if value comes from real-order data, "assumption"
   *  if operator-typed. Drives the inline chip — lets the IC reader see at
   *  a glance which lines are grounded and which are narrative. */
  source?: "actuals" | "assumption";
  revenuePerOrder: number;
  scaleMax: number;
}) {
  const pctOfRevenue = revenuePerOrder > 0 ? Math.abs(grosze) / revenuePerOrder : 0;
  const barPct = scaleMax > 0 ? (Math.abs(grosze) / scaleMax) * 100 : 0;
  const isCost = grosze < 0;
  const toneClass = tone ? `v2-ue-tone-${tone}` : "";
  return (
    <tr className={`v2-ue-row ${toneClass} ${isTotal ? "v2-ue-row-total" : ""} ${bold ? "v2-ue-row-bold" : ""}`}>
      <td className="v2-ue-cell v2-ue-label">
        <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
          <span>{label}</span>
          {source && <SourceTag kind={source} />}
        </div>
      </td>
      <td className="v2-ue-cell v2-ue-magnitude">
        <div className="v2-ue-bar-track">
          <div
            className="v2-ue-bar-fill"
            style={{
              [isCost ? "right" : "left"]: 0,
              [isCost ? "left" : "right"]: "auto",
              width: `${Math.min(100, barPct)}%`,
            }}
          />
        </div>
      </td>
      <td className="v2-ue-cell v2-ue-value tabular">
        {grosze >= 0 ? "+" : ""}
        {(grosze / 100).toFixed(2)} zł
      </td>
      <td className="v2-ue-cell v2-ue-pct tabular">
        {pctOfRevenue > 0 ? `${(pctOfRevenue * 100).toFixed(1)}%` : "—"}
      </td>
      <td className="v2-ue-cell v2-ue-note">{note ?? ""}</td>
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
  actuals,
}: {
  scenario: SimulationScenario;
  computed: Computed;
  actuals: SimulationActualsSnapshot | null;
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
  // Source detection — "actuals" if the operator input matches real-order
  // data within 5%; "assumption" otherwise (or when no actuals available).
  // Drives the inline SourceTag chips so the operator (and IC reader) sees
  // which lines are grounded vs operator narrative.
  const inferSource = (operator: number, actual: number | undefined): "actuals" | "assumption" => {
    if (!actuals || actual === undefined || actual === 0) return "assumption";
    const variance = Math.abs((operator - actual) / actual);
    return variance <= 0.05 ? "actuals" : "assumption";
  };
  const revenueSource = inferSource(revenuePerOrder, actuals?.avgTicketGrosze);
  const cogsSource = actuals && actuals.weightedCogsPct > 0
    ? (Math.abs((scenario.cogsPct - actuals.weightedCogsPct) / actuals.weightedCogsPct) <= 0.05 ? "actuals" : "assumption")
    : "assumption";
  // Pre-CM1 cost lines — hide any that are zero so the table stays tight.
  // Notes are dynamic: they show the exact operator input + the per-order
  // arithmetic (e.g. "2.0% × 45.00 zł = 0.90 zł"), so the table is no
  // longer a static label sheet — every cell is data-derived and updates
  // live with scenario state.
  const variableLines: Array<{ key: string; label: string; grosze: number; note: string; tone: "warning"; source: "actuals" | "assumption" }> = [
    {
      key: "cogs",
      label: "Less: COGS (food)",
      grosze: -cogsPerOrder,
      tone: "warning",
      source: cogsSource,
      note: actuals && actuals.weightedCogsPct > 0
        ? `${(scenario.cogsPct * 100).toFixed(1)}% × ticket — recipe-weighted from ${actuals.ordersCount} real orders`
        : `${(scenario.cogsPct * 100).toFixed(1)}% × ${(revenuePerOrder / 100).toFixed(2)} zł ticket = ${(cogsPerOrder / 100).toFixed(2)} zł`,
    },
    {
      key: "packaging",
      label: "Less: Packaging",
      grosze: -packagingPerOrder,
      tone: "warning",
      source: "assumption",
      note: `${(packagingPerOrder / 100).toFixed(2)} zł / order — napkins, plates wash, boxes`,
    },
    {
      key: "waste",
      label: "Less: Waste & spoilage",
      grosze: -wastePerOrder,
      tone: "warning",
      source: "assumption",
      note: `${((scenario.wastePct ?? 0) * 100).toFixed(1)}% × ticket = ${(wastePerOrder / 100).toFixed(2)} zł`,
    },
    {
      key: "refund",
      label: "Less: Refund / comp / theft",
      grosze: -refundPerOrder,
      tone: "warning",
      source: actuals && actuals.refundPct > 0
        ? (Math.abs(((scenario.refundPct ?? 0) - actuals.refundPct) / actuals.refundPct) <= 0.05 ? "actuals" : "assumption")
        : "assumption",
      note: actuals && actuals.refundPct > 0
        ? `${((scenario.refundPct ?? 0) * 100).toFixed(2)}% × ticket — last-90d cancel rate ${(actuals.refundPct * 100).toFixed(2)}%`
        : `${((scenario.refundPct ?? 0) * 100).toFixed(2)}% × ticket = ${(refundPerOrder / 100).toFixed(2)} zł`,
    },
    {
      key: "loyalty",
      label: "Less: Loyalty burn",
      grosze: -loyaltyPerOrder,
      tone: "warning",
      source: "assumption",
      note: `${((scenario.loyaltyBurnPct ?? 0) * 100).toFixed(2)}% × ticket — points redeemed at face value`,
    },
    {
      key: "payment",
      label: "Less: Payment fees (blended)",
      grosze: -paymentPerOrder,
      tone: "warning",
      source: "assumption",
      note: `${((scenario.paymentProcessorPct ?? 0) * 100).toFixed(2)}% blended — cash ${((scenario.cashSharePct ?? 0) * 100).toFixed(0)}% · Glovo ${((scenario.glovoSharePct ?? 0) * 100).toFixed(0)}% · Wolt ${((scenario.woltSharePct ?? 0) * 100).toFixed(0)}%`,
    },
    {
      key: "cac",
      label: "Less: Marketing CAC (amortised)",
      grosze: -marketingPerOrder,
      tone: "warning",
      source: "assumption",
      note: computed.marketingCac > 0
        ? `${Math.round(computed.marketingCac / 100).toLocaleString("pl-PL")} zł/mo ÷ ${Math.round(orders).toLocaleString("pl-PL")} orders = ${(marketingPerOrder / 100).toFixed(2)} zł`
        : "Marketing kept in fixed costs (toggle to amortise as CAC)",
    },
  ];
  const fixedLines: Array<{ key: string; label: string; grosze: number; note: string; tone: "warning"; source: "actuals" | "assumption" }> = [
    {
      key: "labor",
      label: "Less: Labor amortised",
      grosze: -laborPerOrder,
      tone: "warning",
      source: "assumption",
      note: `${Math.round(computed.laborMonthly / 100).toLocaleString("pl-PL")} zł/mo ÷ ${Math.round(orders).toLocaleString("pl-PL")} orders = ${(laborPerOrder / 100).toFixed(2)} zł`,
    },
    {
      key: "fixed",
      label: "Less: Fixed amortised (+ D&A + interest)",
      grosze: -fixedPerOrder,
      tone: "warning",
      source: "assumption",
      note: `${Math.round((computed.fixedTotal + computed.depreciation + computed.interest) / 100).toLocaleString("pl-PL")} zł/mo ÷ ${Math.round(orders).toLocaleString("pl-PL")} orders = ${(fixedPerOrder / 100).toFixed(2)} zł`,
    },
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
              <PlainTalk>
                <p style={{ margin: 0 }}>
                  This is the &quot;follow the złoty&quot; chart. A customer hands you
                  <strong> 65 zł</strong>. By the time it&apos;s in your bank account
                  after food, packaging, the Glovo cut, a tiny waste allowance, payment
                  fees and loyalty burn, you&apos;re holding <strong>~28 zł</strong>
                  (CM1). After labor and rent that drops to <strong>~6 zł</strong>
                  (CM2). Knowing exactly which line ate the rest is how you find the
                  biggest fixable leak — usually packaging, fees or waste.
                </p>
              </PlainTalk>
            </InfoButton>
            <Calculator className="h-4 w-4 v2-muted" />
          </span>
        }
      />
      <CardBody>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KpiCard
            label={<LabelWithInfo text="Revenue / order" help={HELP.revenuePerOrderKpi} />}
            value={revenuePerOrder / 100}
            format={(n) => `${n.toFixed(2)} zł`}
            icon={HandCoins}
            tone="info"
            hint="Gross ticket size"
          />
          <KpiCard
            label={<LabelWithInfo text="True CM1 / order" help={HELP.trueCm1PerOrderKpi} />}
            value={cm1PerOrder / 100}
            format={(n) => `${n.toFixed(2)} zł`}
            icon={Wallet}
            tone={cm1Tone}
            hint={`${(cm1Pct * 100).toFixed(1)}% of revenue`}
          />
          <KpiCard
            label={<LabelWithInfo text="True CM2 / order" help={HELP.trueCm2PerOrder} />}
            value={cm2PerOrder / 100}
            format={(n) => `${n.toFixed(2)} zł`}
            icon={PiggyBank}
            tone={cm2Tone}
            hint={`${(cm2Pct * 100).toFixed(1)}% of revenue · post-labor & fixed`}
          />
          <KpiCard
            label={<LabelWithInfo text="Monthly orders" help={HELP.monthlyOrdersKpi} />}
            value={orders}
            format={(n) => Math.round(n).toLocaleString("pl-PL")}
            icon={Gauge}
            tone="neutral"
            hint={`${scenario.ordersPerDay}/day × ${scenario.daysOpenPerMonth} days`}
          />
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="v2-ue-table">
            <thead>
              <tr>
                <th>Line</th>
                <th>Magnitude</th>
                <th className="v2-ue-th-right">zł / order</th>
                <th className="v2-ue-th-right">% rev</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              <UnitEconRow
                label="Revenue / order"
                grosze={revenuePerOrder}
                bold
                tone="brand"
                source={revenueSource}
                revenuePerOrder={revenuePerOrder}
                scaleMax={scaleMax}
                note={
                  actuals && actuals.avgTicketGrosze > 0
                    ? `Gross ticket · last-90d real avg ${(actuals.avgTicketGrosze / 100).toFixed(2)} zł`
                    : "Gross ticket — operator-typed, no order history yet"
                }
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
                    source={l.source}
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
                    source={l.source}
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
              <PlainTalk>
                <p style={{ margin: 0 }}>
                  Same pizza, four different prices once fees are netted. A
                  <strong> 65 zł pizza</strong> earns you ~28 zł of CM1 on cash, ~26 zł
                  on a card terminal, but only <strong>~10 zł on Glovo</strong> after
                  the 27% cut. If 40% of your volume is Glovo, that&apos;s
                  <strong> ~13,000 zł/month of contribution</strong> the platform is
                  eating. Doesn&apos;t mean quit Glovo — it means push a 10% discount
                  for ordering direct via your own site and shift even 5pp of volume.
                </p>
              </PlainTalk>
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
              <PlainTalk>
                <p style={{ margin: 0 }}>
                  Going from 1 truck to 5 isn&apos;t just 5× the spreadsheet. Suppliers
                  give you <strong>~10% off cheese</strong> when you buy in bulk, but
                  you now pay <strong>~15,000 zł/month for a regional manager</strong>
                  that 1 truck couldn&apos;t afford. The model shows whether the math
                  actually works: typically truck #1 earns 25% margin, truck #4 earns
                  ~32% margin (supply leverage), but truck #6 might only earn 28% if
                  it cannibalises truck #3&apos;s catchment.
                </p>
              </PlainTalk>
            </InfoButton>
            <Grid3X3 className="h-4 w-4 v2-muted" />
            <span className="v2-muted text-xs">{f.unitCount} unit{f.unitCount === 1 ? "" : "s"}</span>
          </span>
        }
      />
      <CardBody>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <Input
            label={<LabelWithInfo text="Unit count" help={HELP.unitCount} />}
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
            label={<LabelWithInfo text="HQ overhead" help={HELP.hqOverhead} />}
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
            label={<LabelWithInfo text="Royalty %" help={HELP.royaltyPct} />}
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
            label={<LabelWithInfo text="Marketing fund %" help={HELP.marketingFund} />}
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
            label={<LabelWithInfo text="Supply discount at" help={HELP.supplyDiscountAt} />}
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
            label={<LabelWithInfo text="Supply discount" help={HELP.supplyDiscountPct} />}
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
            label={<LabelWithInfo text="Commissary at" help={HELP.commissaryAt} />}
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
            label={<LabelWithInfo text="Commissary saving" help={HELP.commissarySaving} />}
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
            label={<LabelWithInfo text="DMA cannibalisation" help={HELP.dmaCannibalisation} />}
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
            label={<LabelWithInfo text="Build-out learning" help={HELP.buildoutLearning} />}
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
            label={<LabelWithInfo text="Build-out floor" help={HELP.buildoutFloor} />}
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
                label={<LabelWithInfo text="Fleet revenue / mo" help={HELP.fleetRevenue} />}
                value={fleet.totalRevenue / 100}
                format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
                tone="info"
                hint={`${fleet.unitCount} units · avg ${Math.round(fleet.avgRevenuePerUnit / 100).toLocaleString("pl-PL")} zł / unit`}
              />
              <KpiCard
                label={<LabelWithInfo text="Fleet EBITDA / mo" help={HELP.fleetEbitda} />}
                value={fleet.totalEbitda / 100}
                format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
                tone={fleet.totalEbitda >= 0 ? "success" : "danger"}
                hint={`After ${Math.round(fleet.hqOverhead / 100).toLocaleString("pl-PL")} zł HQ overhead`}
              />
              <KpiCard
                label={<LabelWithInfo text="EBITDA / unit" help={HELP.ebitdaPerUnit} />}
                value={fleet.avgEbitdaPerUnit / 100}
                format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
                tone={fleet.avgEbitdaPerUnit >= 0 ? "success" : "danger"}
                hint="Average over the fleet"
              />
              <KpiCard
                label={<LabelWithInfo text="HQ overhead absorption" help={HELP.hqOverheadAbsorption} />}
                value={fleet.hqOverheadAbsorption * 100}
                format={(n) => `${n.toFixed(1)}%`}
                tone={fleet.hqOverheadAbsorption < 0.05 ? "success" : fleet.hqOverheadAbsorption < 0.10 ? "info" : "warning"}
                hint="HQ / fleet revenue"
              />
              <KpiCard
                label={<LabelWithInfo text="Fleet build-out" help={HELP.fleetBuildout} />}
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
function SssgStrip({ sssg, simulated }: { sssg: SimulationSssgSnapshot; simulated?: boolean }) {
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
          <PlainTalk>
            <p style={{ margin: 0 }}>
              Two restaurants both report <strong>&quot;+12% growth&quot;</strong>. One
              raised prices 10% and lost a few customers; the other actually doubled
              new-customer count but ticket fell. They&apos;ll look identical on the
              top line and behave totally differently in 6 months — the price-raiser is
              fragile (one competitor opens nearby and you&apos;re done), the volume-grower
              is durable. This decomposition tells you which one you are.
            </p>
          </PlainTalk>
        </InfoButton>
        <span className="v2-muted text-xs">
          Last {sssg.windowDays}d vs prior {sssg.windowDays}d
        </span>
        <SourceTag
          kind={simulated ? "assumption" : "actuals"}
          hint={simulated ? "Simulated from scenario — populates from real orders once they exist." : "From real orders."}
        />
      </div>
      <section className="v2-kpi-grid">
        <KpiCard
          label={<LabelWithInfo text="Revenue growth" help={HELP.revenueGrowth} />}
          value={sssg.revenueGrowthPct * 100}
          format={(n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`}
          display={fmtPct(sssg.revenueGrowthPct)}
          icon={TrendingUp}
          tone={toneFor(sssg.revenueGrowthPct)}
          hint={`${Math.round(sssg.currentRevenueGrosze / 100).toLocaleString("pl-PL")} zł vs ${Math.round(sssg.priorRevenueGrosze / 100).toLocaleString("pl-PL")} zł`}
        />
        <KpiCard
          label={<LabelWithInfo text="Order growth" help={HELP.orderGrowth} />}
          value={sssg.orderGrowthPct * 100}
          format={(n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`}
          display={fmtPct(sssg.orderGrowthPct)}
          icon={Gauge}
          tone={toneFor(sssg.orderGrowthPct)}
          hint={`${sssg.currentOrders} vs ${sssg.priorOrders}`}
        />
        <KpiCard
          label={<LabelWithInfo text="Ticket growth" help={HELP.ticketGrowth} />}
          value={sssg.ticketGrowthPct * 100}
          format={(n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`}
          display={fmtPct(sssg.ticketGrowthPct)}
          icon={HandCoins}
          tone={toneFor(sssg.ticketGrowthPct)}
          hint="Avg ticket move"
        />
        <KpiCard
          label={<LabelWithInfo text="Customer growth" help={HELP.customerGrowth} />}
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
          <PlainTalk>
            <p style={{ margin: 0 }}>
              Acquiring a new customer is expensive; getting one to come back is almost
              free. If your CAC is <strong>15 zł</strong> and the average customer
              brings <strong>~45 zł of profit over a year</strong>, that&apos;s a
              <strong> 3× LTV/CAC</strong> — healthy. If repeat rate falls from 35% to
              20% (bad experience, competitor opened, menu got stale), LTV drops to
              <strong> ~25 zł</strong> and suddenly every Instagram ad is losing
              money. Watch repeat rate weekly; it&apos;s the earliest warning sign.
            </p>
          </PlainTalk>
        </InfoButton>
        <SourceTag kind="actuals" hint={`Last ${cohorts.windowDays} days, grouped by phone`} />
      </div>
      <section className="v2-kpi-grid">
        <KpiCard
          label={<LabelWithInfo text="Repeat rate" help={HELP.repeatRate} />}
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
          label={<LabelWithInfo text="Orders / customer" help={HELP.ordersPerCustomer} />}
          value={cohorts.avgOrdersPerCustomer}
          format={(n) => n.toFixed(2)}
          icon={HandCoins}
          tone="info"
          hint="Mean over the window"
        />
        <KpiCard
          label={<LabelWithInfo text="GP / customer" help={HELP.gpPerCustomer} />}
          value={cohorts.avgGpPerCustomerGrosze / 100}
          format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
          icon={Wallet}
          tone={cohorts.avgGpPerCustomerGrosze > 5000 ? "success" : "info"}
          hint={`Avg revenue ${Math.round(cohorts.avgRevenuePerCustomerGrosze / 100).toLocaleString("pl-PL")} zł`}
        />
        <KpiCard
          label={<LabelWithInfo text="CAC (implied)" help={HELP.cacImplied} />}
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
          label={<LabelWithInfo text="LTV / CAC" help={HELP.ltvCac} />}
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
          label={<LabelWithInfo text="Customer payback" help={HELP.customerPaybackKpi} />}
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
              label={<LabelWithInfo text="New customer revenue" help={HELP.newCustomerRevenue} />}
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
              label={<LabelWithInfo text="Returning revenue" help={HELP.returningRevenue} />}
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
              <PlainTalk>
                <p style={{ margin: 0 }}>
                  Look at the top bar — that&apos;s what to worry about. If
                  <strong> volume sensitivity</strong> is biggest, your business is
                  fragile to a slow week (build attach to grow profit per existing
                  customer). If <strong>food cost</strong> is biggest, one cheese price
                  hike could wipe out a month of profit (lock in supplier contracts).
                  Most trucks find volume + food cost are top — that combo says
                  &quot;defend revenue and renegotiate cheese&quot; is the priority
                  list, in that order.
                </p>
              </PlainTalk>
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

/** Spoilage-keyword set — used by both the server-side computation in
 *  store.ts and the client-side synthesis fallback below. Keep in sync. */
const SPOILAGE_KEYWORDS_CLIENT = ["burrata", "truffle", "tartufata", "frozen", "tiramisù", "tiramisu"];

/** Synthesize a menu-engineering breakdown from the active scenario's
 *  attach rates + the static menu definition. Used when there's no real
 *  order history yet so the matrix isn't empty in simulation mode —
 *  every preset still produces a believable mix of stars / plowhorses /
 *  puzzles / dogs. Once real orders flow in (≥1 order), the server
 *  endpoint takes over.
 *
 *  IMPORTANT: callers must pass `effectiveScenario` (post-applyAnnualWeather),
 *  not the raw operator-typed scenario. Volume math must match the headline
 *  P&L which runs on effective annualised volume — using typed values
 *  over-states monthly numbers by ~8% for typical Warsaw seasonality. */
function computeSimulatedMenuEngineering(
  s: SimulationScenario,
): SimulationMenuEngineeringLine[] {
  const monthlyOrders = s.ordersPerDay * s.daysOpenPerMonth;
  if (monthlyOrders <= 0) return [];

  const a = s.assumptions;
  const attach = {
    coffee: a?.coffeeAttach?.enabled !== false ? a?.coffeeAttach?.attachPct ?? 0 : 0,
    dessert: a?.dessertAttach?.enabled !== false ? a?.dessertAttach?.attachPct ?? 0 : 0,
    antipasti: a?.antipastiAttach?.enabled !== false ? a?.antipastiAttach?.attachPct ?? 0 : 0,
    aperitivo: a?.aperitivoAttach?.enabled !== false ? a?.aperitivoAttach?.attachPct ?? 0 : 0,
    pasta: a?.pastaPrimoAttach?.enabled !== false ? a?.pastaPrimoAttach?.attachPct ?? 0 : 0,
  };
  const deliveryShare = a?.deliveryShare?.enabled !== false ? a?.deliveryShare?.pct ?? 0 : 0;

  // Per-category total units sold across the month — derived from
  // scenario's attach assumptions. Pizza is 1× per order baseline.
  const unitsByCategory: Record<string, number> = {
    pizza: monthlyOrders,
    drinks: monthlyOrders * attach.coffee + monthlyOrders * 0.15, // espresso attach + other drinks
    desserts: monthlyOrders * attach.dessert,
    antipasti: monthlyOrders * (attach.antipasti + attach.aperitivo * 0.3),
    pasta: monthlyOrders * attach.pasta,
    panini: monthlyOrders * 0.04, // light tail
  };

  // Group menu items by category, separating delivery-only.
  const available = krakowMenu.filter((item) => item.available);
  const dineInItems = available.filter((item) => !item.deliveryOnly);
  const deliveryItems = available.filter((item) => item.deliveryOnly);

  const byCategory: Record<string, typeof dineInItems> = {};
  for (const item of dineInItems) {
    const cat = item.category;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }

  // Weight per menuRole — hero items sell ~2× a no-role item; anchors
  // sell ~0.3× (they're decoys / aspirational); profit-drivers sell
  // 1.5×. Falls back to 1.0 for items without a role tag.
  const weightFor = (item: (typeof dineInItems)[number]): number => {
    switch (item.menuRole) {
      case "hero":
        return 2.0;
      case "profit-driver":
        return 1.5;
      case "anchor":
        return 0.3;
      default:
        return 1.0;
    }
  };

  // Build line items by distributing each category's total units across
  // the available items weighted by menuRole.
  type Row = {
    item: (typeof dineInItems)[number];
    units: number;
    isDelivery: boolean;
  };
  const synthesized: Row[] = [];
  for (const [category, items] of Object.entries(byCategory)) {
    const totalUnits = unitsByCategory[category] ?? 0;
    if (totalUnits <= 0 || items.length === 0) continue;
    const weights = items.map(weightFor);
    const sumW = weights.reduce((sum, w) => sum + w, 0);
    items.forEach((item, idx) => {
      const units = Math.round((weights[idx] / sumW) * totalUnits);
      if (units > 0) synthesized.push({ item, units, isDelivery: false });
    });
  }

  // Delivery-only items: ~15% of delivery orders carry a pantry item.
  if (deliveryShare > 0 && deliveryItems.length > 0) {
    const deliveryUnits = monthlyOrders * deliveryShare * 0.15;
    const weights = deliveryItems.map(weightFor);
    const sumW = weights.reduce((sum, w) => sum + w, 0);
    deliveryItems.forEach((item, idx) => {
      const units = Math.round((weights[idx] / sumW) * deliveryUnits);
      if (units > 0) synthesized.push({ item, units, isDelivery: true });
    });
  }

  if (synthesized.length === 0) return [];

  // Build the engineering rows — same shape as the server-side
  // computeMenuEngineering function so the panels are blind to source.
  const wastePct = s.wastePct ?? 0;
  const refundPct = s.refundPct ?? 0;
  const loyaltyPct = s.loyaltyBurnPct ?? 0;
  const feePct = s.paymentProcessorPct ?? 0;
  const leakageRate = feePct + wastePct + refundPct + loyaltyPct;

  const rows = synthesized.map(({ item, units, isDelivery }) => {
    const pricePerUnit = item.price;
    const costPerUnit = item.cost ?? 0;
    const gpPerUnit = pricePerUnit - costPerUnit;
    const effectiveLeakage = isDelivery
      ? 0.27 + wastePct + refundPct + loyaltyPct
      : leakageRate;
    const trueCm1 = pricePerUnit * (1 - effectiveLeakage) - costPerUnit;
    const nameLower = item.name.toLowerCase();
    const spoilageRisk = SPOILAGE_KEYWORDS_CLIENT.some((k) => nameLower.includes(k));
    const role = item.menuRole;
    return {
      menuItemId: item.id,
      name: item.name,
      category: item.category ?? "other",
      unitsSold: units,
      gpPerUnit,
      revenue: units * pricePerUnit,
      cost: units * costPerUnit,
      deliveryOnly: isDelivery,
      prepTimeMinutes: item.prepTimeMinutes ?? 0,
      trueCm1PerUnit: trueCm1,
      spoilageRisk,
      menuRole: role === "hero" || role === "profit-driver" || role === "anchor" ? role : undefined,
    };
  });

  // Same median-based quadrant cut + flag detection as the server path.
  const median = (xs: number[]): number => {
    const sorted = [...xs].sort((x, y) => x - y);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };
  const medianUnits = median(rows.map((r) => r.unitsSold));
  const medianGp = median(rows.map((r) => r.gpPerUnit));
  const medianPrep = median(rows.map((r) => r.prepTimeMinutes).filter((p) => p > 0));

  return rows.map((r): SimulationMenuEngineeringLine => {
    const highVol = r.unitsSold >= medianUnits;
    const highGp = r.gpPerUnit >= medianGp;
    const quadrant: SimulationMenuEngineeringLine["quadrant"] =
      highVol && highGp ? "star" : highVol ? "plowhorse" : highGp ? "puzzle" : "dog";
    const gmRatio = r.revenue > 0 ? r.gpPerUnit / (r.revenue / Math.max(1, r.unitsSold)) : 0;
    const marginTrap = gmRatio >= 0.5 && r.trueCm1PerUnit < r.gpPerUnit * 0.5;
    const prepHeavy = medianPrep > 0 && r.prepTimeMinutes >= medianPrep * 1.5;
    return { ...r, quadrant, marginTrap, prepHeavy };
  });
}

/** Synthesize an SSSG snapshot from the active scenario when there's no
 *  real order history. Treats the current scenario's monthly revenue as
 *  "current period" and applies a seasonality-driven multiplier for the
 *  prior period so the panel surfaces a plausible comp signal in
 *  simulation mode. Real-orders path takes over once the actuals exist.
 *
 *  IMPORTANT: callers must pass `effectiveScenario` (post-applyAnnualWeather),
 *  not the raw operator-typed scenario. Volume math must match the headline
 *  P&L which runs on effective annualised volume — using typed values
 *  over-states monthly numbers by ~8% for typical Warsaw seasonality. */
function computeSimulatedSssg(s: SimulationScenario): SimulationSssgSnapshot {
  const monthlyRevenue = s.ordersPerDay * s.avgTicketGrosze * s.daysOpenPerMonth;
  const monthlyOrders = s.ordersPerDay * s.daysOpenPerMonth;
  // Prior-period multiplier — use seasonality.spring as a proxy for the
  // shoulder-season baseline (most likely the immediate prior month
  // relative to a typical Warsaw Q3 snapshot).
  const season = s.seasonality;
  const seasonAvg = season
    ? (season.spring + season.summer + season.autumn + season.winter) / 4
    : 1;
  // Bias prior period to baseline (so growth is +X% over baseline).
  const priorFactor = seasonAvg > 0 ? 1 / seasonAvg : 1;
  const priorRevenue = monthlyRevenue * priorFactor;
  const priorOrders = monthlyOrders * priorFactor;
  // Use a small split (~70/30) for ticket vs volume growth contribution
  // — keeps the decomposition realistic in simulation mode.
  const priorTicket = priorOrders > 0 ? priorRevenue / priorOrders : 0;
  const currentTicket = monthlyOrders > 0 ? monthlyRevenue / monthlyOrders : 0;
  const pct = (a: number, b: number): number => (b > 0 ? (a - b) / b : a > 0 ? 1 : 0);
  return {
    windowDays: 30,
    currentRevenueGrosze: monthlyRevenue,
    priorRevenueGrosze: priorRevenue,
    revenueGrowthPct: pct(monthlyRevenue, priorRevenue),
    orderGrowthPct: pct(monthlyOrders, priorOrders),
    ticketGrowthPct: pct(currentTicket, priorTicket),
    // No customer data in simulation mode — use the order count as a
    // proxy so the column doesn't look broken.
    customerGrowthPct: pct(monthlyOrders, priorOrders),
    currentOrders: Math.round(monthlyOrders),
    priorOrders: Math.round(priorOrders),
    currentCustomers: Math.round(monthlyOrders * 0.5), // ~half repeat
    priorCustomers: Math.round(priorOrders * 0.5),
    generatedAt: new Date().toISOString(),
  };
}

/** Margin traps callout — items the menu-engineering matrix would put in
 *  good quadrants on GP alone but where TrueCM1 (after channel fees,
 *  waste, refund, loyalty) tells a different story. Surfaces the audit's
 *  exact warning list: delivery-only marketplace casualties, spoilage-
 *  risk items, prep-heavy false-high-revenue items. */
function MarginTrapsCallout({ rows, simulated }: { rows: SimulationMenuEngineeringLine[]; simulated?: boolean }) {
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
              <PlainTalk>
                <p style={{ margin: 0 }}>
                  The classic case: <strong>burrata pizza at 52 zł</strong>, looks like
                  a 65% GM star. Reality check: burrata spoils in 48h (waste eats 8%),
                  90% of orders come via Glovo (27% fee), and one bad shift dumps a
                  whole portion (4 zł each). <strong>True margin: ~12%</strong>, not
                  65%. Either reprice to 62 zł, switch to a longer-life cheese, or
                  pull it from delivery. A single trap item in your top-3 sellers can
                  silently cost <strong>~3,000 zł/month</strong>.
                </p>
              </PlainTalk>
            </InfoButton>
            {simulated && <SourceTag kind="assumption" hint="Simulated from scenario — once real orders flow in, trap detection runs on actuals." />}
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
  simulated,
}: {
  rows: SimulationMenuEngineeringLine[];
  simulated?: boolean;
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
              <PlainTalk>
                <p style={{ margin: 0 }}>
                  Think of every menu item as living in one of four houses:
                  <strong> Stars</strong> (your bestsellers, keep them on page 1),
                  <strong> Puzzles</strong> (great margin but nobody orders them — fix
                  the photo, mention them at the till), <strong>Plowhorses</strong>
                  (everyone orders them but margin is thin — raise the price 2 zł,
                  customers won&apos;t notice) and <strong>Dogs</strong> (nobody buys
                  them, they earn nothing — delete and free up menu space). Cleaning
                  the dogs and raising plowhorse prices can lift profit
                  <strong> ~5,000 zł/month</strong> in one menu update.
                </p>
              </PlainTalk>
            </InfoButton>
            <SourceTag
              kind={simulated ? "assumption" : "actuals"}
              hint={simulated
                ? "Simulated from scenario attach rates + the static menu definition. Populates from real orders once they exist."
                : "Computed from real order line items."}
            />
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
              <PlainTalk>
                <p style={{ margin: 0 }}>
                  This is the reality check. Your scenario says <strong>80 orders/day,
                  65 zł ticket</strong>. Real data says <strong>62 orders/day, 71 zł
                  ticket</strong>. That 22% volume miss means every forecast above
                  this strip is too optimistic by ~<strong>22,000 zł/month of
                  revenue</strong>. Click &quot;Apply actuals&quot; to snap the model
                  to truth — then plan against the real numbers, not the wished-for
                  ones.
                </p>
              </PlainTalk>
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
  /** When set, the help popup renders the live-computed AttachLeverHelp body
   *  using the lever's current price / COGS / attach values. Used by the
   *  six standard attach levers (coffee, dessert, antipasti, aperitivo,
   *  premium toppings, pasta primo). */
  helpKind?: AttachLeverKind;
  /** EFFECTIVE annualised volume after weather + holiday adjustments. */
  ordersPerDay?: number;
  daysOpenPerMonth?: number;
  /** Raw typed values — surfaced in the Methodology block so the operator
   *  sees the weather drag explicitly instead of being confused why the
   *  narrative shows different numbers from the Scenario card. */
  typedOrdersPerDay?: number;
  typedDaysOpenPerMonth?: number;
  /** Variable-leakage rates the P&L applies on incremental attach revenue —
   *  threaded through so the headroom matches the actual net P&L delta. */
  paymentProcessorPct?: number;
  wastePct?: number;
  refundPct?: number;
  loyaltyBurnPct?: number;
  citPct?: number;
}

function AttachLeverRow({
  label,
  hint,
  lever,
  baseTicketGrosze,
  onChange,
  help,
  helpKind,
  ordersPerDay,
  daysOpenPerMonth,
  typedOrdersPerDay,
  typedDaysOpenPerMonth,
  paymentProcessorPct,
  wastePct,
  refundPct,
  loyaltyBurnPct,
  citPct,
}: AttachRowProps) {
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
          {helpKind ? (
            <InfoButton
              title={ATTACH_HELP[helpKind].title}
              label={`About ${ATTACH_HELP[helpKind].title.toLowerCase()}`}
              size="sm"
            >
              <AttachLeverHelp
                kind={helpKind}
                lever={lever}
                ordersPerDay={ordersPerDay ?? 0}
                daysOpenPerMonth={daysOpenPerMonth ?? 0}
                typedOrdersPerDay={typedOrdersPerDay ?? ordersPerDay ?? 0}
                typedDaysOpenPerMonth={typedDaysOpenPerMonth ?? daysOpenPerMonth ?? 0}
                paymentProcessorPct={paymentProcessorPct ?? 0}
                wastePct={wastePct ?? 0}
                refundPct={refundPct ?? 0}
                loyaltyBurnPct={loyaltyBurnPct ?? 0}
                citPct={citPct ?? 0}
              />
            </InfoButton>
          ) : (
            help && (
              <InfoButton title={help.title} label={`About ${help.title.toLowerCase()}`} size="sm">
                {help.body}
              </InfoButton>
            )
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
  /** EFFECTIVE annualised volume after weather + holiday-closure adjustments
   *  (i.e. typed × applyAnnualWeather). Used for all monetary math so the
   *  headroom matches the actual P&L delta. */
  ordersPerDay: number;
  daysOpenPerMonth: number;
  /** Raw values the operator typed in the Scenario card — shown alongside
   *  the effective values in the Methodology block so the operator sees
   *  the weather adjustment explicitly. */
  typedOrdersPerDay: number;
  typedDaysOpenPerMonth: number;
  /** Variable-leakage rates the P&L applies on incremental attach revenue.
   *  Without these the headroom number would overstate the actual net P&L
   *  delta — see AttachLeverHelp methodology for the full decomposition. */
  paymentProcessorPct: number;
  wastePct: number;
  refundPct: number;
  loyaltyBurnPct: number;
  citPct: number;
  onChange: (next: SimulationAssumptions) => void;
}

function BehaviorAssumptionsCard({
  assumptions,
  baseTicketGrosze,
  baseCogsPct,
  ordersPerDay,
  daysOpenPerMonth,
  typedOrdersPerDay,
  typedDaysOpenPerMonth,
  paymentProcessorPct,
  wastePct,
  refundPct,
  loyaltyBurnPct,
  citPct,
  onChange,
}: BehaviorCardProps) {
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
              helpKind="coffee"
              ordersPerDay={ordersPerDay}
              daysOpenPerMonth={daysOpenPerMonth}
              typedOrdersPerDay={typedOrdersPerDay}
              typedDaysOpenPerMonth={typedDaysOpenPerMonth}
              paymentProcessorPct={paymentProcessorPct}
              wastePct={wastePct}
              refundPct={refundPct}
              loyaltyBurnPct={loyaltyBurnPct}
              citPct={citPct}
            />
          )}
          {a.dessertAttach && (
            <AttachLeverRow
              label="Dessert attach"
              hint="Tiramisu / cannoli / panna cotta."
              lever={a.dessertAttach}
              baseTicketGrosze={baseTicketGrosze}
              onChange={(v) => set("dessertAttach", v)}
              helpKind="dessert"
              ordersPerDay={ordersPerDay}
              daysOpenPerMonth={daysOpenPerMonth}
              typedOrdersPerDay={typedOrdersPerDay}
              typedDaysOpenPerMonth={typedDaysOpenPerMonth}
              paymentProcessorPct={paymentProcessorPct}
              wastePct={wastePct}
              refundPct={refundPct}
              loyaltyBurnPct={loyaltyBurnPct}
              citPct={citPct}
            />
          )}
          {a.antipastiAttach && (
            <AttachLeverRow
              label="Antipasti / starter attach"
              hint="Bruschetta, burrata, olives."
              lever={a.antipastiAttach}
              baseTicketGrosze={baseTicketGrosze}
              onChange={(v) => set("antipastiAttach", v)}
              helpKind="antipasti"
              ordersPerDay={ordersPerDay}
              daysOpenPerMonth={daysOpenPerMonth}
              typedOrdersPerDay={typedOrdersPerDay}
              typedDaysOpenPerMonth={typedDaysOpenPerMonth}
              paymentProcessorPct={paymentProcessorPct}
              wastePct={wastePct}
              refundPct={refundPct}
              loyaltyBurnPct={loyaltyBurnPct}
              citPct={citPct}
            />
          )}
          {a.aperitivoAttach && (
            <AttachLeverRow
              label="Aperitivo / wine attach"
              hint="Aperol, wine glass — needs alcohol licence."
              lever={a.aperitivoAttach}
              baseTicketGrosze={baseTicketGrosze}
              onChange={(v) => set("aperitivoAttach", v)}
              helpKind="aperitivo"
              ordersPerDay={ordersPerDay}
              daysOpenPerMonth={daysOpenPerMonth}
              typedOrdersPerDay={typedOrdersPerDay}
              typedDaysOpenPerMonth={typedDaysOpenPerMonth}
              paymentProcessorPct={paymentProcessorPct}
              wastePct={wastePct}
              refundPct={refundPct}
              loyaltyBurnPct={loyaltyBurnPct}
              citPct={citPct}
            />
          )}
          {a.premiumToppingsAttach && (
            <AttachLeverRow
              label="Premium toppings attach"
              hint="Buffalo mozzarella, 'nduja, truffle oil."
              lever={a.premiumToppingsAttach}
              baseTicketGrosze={baseTicketGrosze}
              onChange={(v) => set("premiumToppingsAttach", v)}
              helpKind="premiumToppings"
              ordersPerDay={ordersPerDay}
              daysOpenPerMonth={daysOpenPerMonth}
              typedOrdersPerDay={typedOrdersPerDay}
              typedDaysOpenPerMonth={typedDaysOpenPerMonth}
              paymentProcessorPct={paymentProcessorPct}
              wastePct={wastePct}
              refundPct={refundPct}
              loyaltyBurnPct={loyaltyBurnPct}
              citPct={citPct}
            />
          )}
          {a.pastaPrimoAttach && (
            <AttachLeverRow
              label="Pasta primo attach"
              hint="Pasta course alongside the pizza."
              lever={a.pastaPrimoAttach}
              baseTicketGrosze={baseTicketGrosze}
              onChange={(v) => set("pastaPrimoAttach", v)}
              helpKind="pastaPrimo"
              ordersPerDay={ordersPerDay}
              daysOpenPerMonth={daysOpenPerMonth}
              typedOrdersPerDay={typedOrdersPerDay}
              typedDaysOpenPerMonth={typedDaysOpenPerMonth}
              paymentProcessorPct={paymentProcessorPct}
              wastePct={wastePct}
              refundPct={refundPct}
              loyaltyBurnPct={loyaltyBurnPct}
              citPct={citPct}
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
  const enabled = w.enabled !== false;
  const patch = (next: Partial<SimulationWeather>) => onChange({ ...w, ...next });

  // Live preview of the composite volume multiplier (matches applyAnnualWeather).
  // When the card is toggled OFF these all collapse to 1.0 / no-op so the
  // displayed "effective" row equals the baseline.
  const rainAdj = enabled ? w.rainyShare * w.rainyDayMultiplier + (1 - w.rainyShare) : 1;
  const hotAdj = enabled ? w.heatwaveShare * w.heatwaveMultiplier + (1 - w.heatwaveShare) : 1;
  const schoolAdj = enabled ? (2 / 12) * w.schoolHolidayLunchMultiplier + 10 / 12 : 1;
  const compositeVolume = rainAdj * hotAdj * schoolAdj;
  const peakBonus = enabled ? w.holidayPeakDaysPerMonth * (w.holidayPeakMultiplier - 1) * baseOrdersPerDay : 0;
  const eventBonus = enabled ? w.eventDaysPerMonth * (w.eventDayMultiplier - 1) * baseOrdersPerDay : 0;
  const effectiveDaysOpen = enabled
    ? Math.max(0, baseDaysOpen - w.holidayClosedDaysPerMonth)
    : baseDaysOpen;
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
            <LeverSwitch
              enabled={enabled}
              onChange={(next) => patch({ enabled: next })}
              ariaLabel="Toggle weather & calendar adjustments"
            />
            <InfoButton title={HELP.weatherOverview.title} label="About weather & calendar">{HELP.weatherOverview.body}</InfoButton>
            <CalendarRange className="h-4 w-4 v2-muted" />
          </span>
        }
      />
      <CardBody>
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
          style={{ opacity: enabled ? 1 : 0.55, pointerEvents: enabled ? "auto" : "none" }}
          aria-disabled={!enabled}
        >
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
            label={<LabelWithInfo text="Rainy-day share" help={HELP.rainyShare} />}
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
            label={<LabelWithInfo text="Heatwave evening share" help={HELP.heatwaveShare} />}
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
            label={<LabelWithInfo text="Peak day multiplier" help={HELP.peakDayMultiplier} />}
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
            label={<LabelWithInfo text="Event day multiplier" help={HELP.eventDayMultiplier} />}
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
