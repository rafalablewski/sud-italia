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
  SimulationAssumptions,
  SimulationAttachLever,
  SimulationIngredientLever,
  SimulationLaborLine,
  SimulationScenario,
  SimulationSeasonality,
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
  totalCost: number;
  /** Net profit AFTER tax — the bottom line the operator should plan on. */
  netProfit: number;
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
  const laborByRole: { role: BusinessCostPayrollRole; grosze: number }[] = s.labor.map((l) => ({
    role: l.role,
    grosze: Math.round(l.headcount * l.hoursPerWeek * WEEKS_PER_MONTH * l.hourlyRateGrosze),
  }));
  const laborMonthly = laborByRole.reduce((sum, r) => sum + r.grosze, 0);
  const laborHoursPerMonth = s.labor.reduce(
    (sum, l) => sum + l.headcount * l.hoursPerWeek * WEEKS_PER_MONTH,
    0,
  );
  const fixedTotal = Object.values(s.fixedCosts).reduce(
    (sum: number, v) => sum + (v ?? 0),
    0,
  );
  const paymentFees = Math.round(monthlyRevenue * (s.paymentProcessorPct ?? 0));
  // Operational leakage — all scale with revenue, not a fixed line.
  const wastePct = s.wastePct ?? 0;
  const refundPct = s.refundPct ?? 0;
  const loyaltyBurnPct = s.loyaltyBurnPct ?? 0;
  const citPct = s.citPct ?? 0;
  const wasteCost = Math.round(monthlyRevenue * wastePct);
  const refundLoss = Math.round(monthlyRevenue * refundPct);
  const loyaltyCost = Math.round(monthlyRevenue * loyaltyBurnPct);
  const totalCost = monthlyCogs + laborMonthly + fixedTotal + paymentFees + wasteCost + refundLoss + loyaltyCost;
  const preTaxProfit = monthlyRevenue - totalCost;
  // CIT applies only on positive pre-tax profit. Polish small-CIT 9% / full 19%.
  const citAmount = preTaxProfit > 0 ? Math.round(preTaxProfit * citPct) : 0;
  const netProfit = preTaxProfit - citAmount;
  const margin = monthlyRevenue > 0 ? netProfit / monthlyRevenue : 0;
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
  };
}

/** Project the scenario across 12 months. Input is the assumptions-only
 *  scenario (no weather applied); weather is composed per-month inside
 *  so seasonal effects (heatwave only in summer, school dip only in
 *  Jul/Aug) land in the right months. Labor flexes with seasonal
 *  volume via LABOR_SEASONAL_FLEX. Fixed costs inflate at wage CPI
 *  (closer proxy than food CPI for rent/SaaS/accountant). */
function projectTwelveMonths(s: SimulationScenario, startMonth = 0) {
  const seasonality = s.seasonality ?? DEFAULT_SEASONALITY;
  const w = s.weather;
  const wageMonthly = (1 + (s.wageInflationPct ?? 0)) ** (1 / 12) - 1;
  const cogsMonthly = (1 + (s.ingredientInflationPct ?? 0)) ** (1 / 12) - 1;
  const baseLaborMonthly = s.labor.reduce(
    (sum, l) =>
      sum + l.headcount * l.hoursPerWeek * WEEKS_PER_MONTH * l.hourlyRateGrosze,
    0,
  );
  const baseFixed = Object.values(s.fixedCosts).reduce(
    (sum: number, v) => sum + (v ?? 0),
    0,
  );
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
  for (let i = 0; i < 12; i++) {
    const monthIndex = (startMonth + i) % 12;
    const season = MONTH_TO_SEASON[monthIndex];
    const seasonMult = seasonality[season];
    const weatherMult = monthVolumeMult(monthIndex, w);
    const closedDays = w?.holidayClosedDaysPerMonth ?? 0;
    const daysOpen = Math.max(0, s.daysOpenPerMonth - closedDays);
    let monthDailyOrders = s.ordersPerDay * seasonMult * weatherMult;
    if (w && daysOpen > 0) {
      const baseDaily = s.ordersPerDay;
      const peakBonus = w.holidayPeakDaysPerMonth * (w.holidayPeakMultiplier - 1) * baseDaily;
      const eventBonus = w.eventDaysPerMonth * (w.eventDayMultiplier - 1) * baseDaily;
      monthDailyOrders += (peakBonus + eventBonus) / daysOpen;
    }
    const orders = monthDailyOrders * daysOpen;
    const wageMult = (1 + wageMonthly) ** i;
    const cogsMult = (1 + cogsMonthly) ** i;
    // Labor partially flexes with seasonal volume — fixed share stays put.
    const laborFlex = 1 + LABOR_SEASONAL_FLEX * (seasonMult - 1);
    const revenue = Math.round(orders * s.avgTicketGrosze);
    const cogs = Math.round(revenue * s.cogsPct * cogsMult);
    const labor = Math.round(baseLaborMonthly * wageMult * laborFlex);
    const fixed = Math.round(baseFixed * wageMult);
    const payment = Math.round(revenue * (s.paymentProcessorPct ?? 0));
    const waste = Math.round(revenue * (s.wastePct ?? 0));
    const refund = Math.round(revenue * (s.refundPct ?? 0));
    const loyalty = Math.round(revenue * (s.loyaltyBurnPct ?? 0));
    const preTax = revenue - cogs - labor - fixed - payment - waste - refund - loyalty;
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

  return {
    ...s,
    avgTicketGrosze: newTicket,
    cogsPct: newCogsPct,
    paymentProcessorPct: Math.max(0, Math.min(1, (s.paymentProcessorPct ?? 0) + extraProcessorPct)),
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
            left after variable costs (COGS + payment fees) to cover fixed
            costs and profit. Below 55% and there&apos;s no room for rent shocks.
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
    ...(computed.netProfit > 0
      ? [{ name: "Net profit", value: computed.netProfit / 100 }]
      : []),
  ];

  const profitTone = computed.netProfit >= 0 ? "success" : "danger";

  // Matrices, archetypes and 12-month projection — all recompute every
  // render because the underlying math is cheap (≤ 100 cells × ~15 ns).
  const ordersTicketMatrix = buildMatrix(effectiveScenario!, "orders", "ticket", 5, 0.3);
  const cogsTicketMatrix = buildMatrix(effectiveScenario!, "cogs", "ticket", 5, 0.08);
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
                label={<LabelWithInfo text="Orders per day" help={HELP.ordersPerDay} />}
                type="number"
                min="0"
                value={String(scenario.ordersPerDay)}
                onChange={(e) =>
                  update((s) => ({ ...s, ordersPerDay: Math.max(0, (parseInt(e.target.value, 10) || 0)) }))
                }
              />
              <Input
                label={<LabelWithInfo text="Average ticket" help={HELP.avgTicket} />}
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
                label={<LabelWithInfo text="Days open per month" help={HELP.daysOpen} />}
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
                label={<LabelWithInfo text="Ingredient cost ratio" help={HELP.cogsPct} />}
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
            title="Labor mix"
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
              <PnlRow
                label="Net profit / (loss)"
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
          value={computed.contributionMarginPct * 100}
          format={(n) => `${n.toFixed(1)}%`}
          icon={Percent}
          tone={computed.contributionMarginPct < 0.55 ? "danger" : computed.contributionMarginPct < 0.65 ? "warning" : "success"}
          hint="Per PLN after COGS + fees"
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
          label="Net profit / order"
          value={computed.profitPerOrder / 100}
          format={(n) => `${n.toFixed(2)} zł`}
          icon={HandCoins}
          tone={computed.profitPerOrder >= 0 ? "success" : "danger"}
          hint={`${(scenario.ordersPerDay * scenario.daysOpenPerMonth).toLocaleString("pl-PL")} orders/mo`}
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
      </section>

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
              label="Card processor fee"
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
              description="Blended Stripe/terminal fee on revenue."
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
              description="Dec / Jan / Feb. Default 0.70 — slower months."
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
              description="Sep / Oct / Nov. Default 1.00."
            />
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

      <Card>
        <CardHeader
          title="Break-even at multiple horizons"
          description="The minimum throughput needed to cover labor + fixed at the current ticket and COGS."
          actions={
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <InfoButton title={HELP.breakEven.title} label="About break-even">{HELP.breakEven.body}</InfoButton>
              <Calculator className="h-4 w-4 v2-muted" />
            </span>
          }
        />
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Orders / hour"
              value={computed.breakEvenOrdersPerDay / 10}
              format={(n) => n.toFixed(2)}
              tone="info"
              hint="across the 10 h service window"
            />
            <KpiCard
              label="Orders / day"
              value={computed.breakEvenOrdersPerDay}
              format={(n) => n.toFixed(1)}
              tone="info"
            />
            <KpiCard
              label="Orders / month"
              value={computed.breakEvenOrdersPerMonth}
              format={(n) => Math.ceil(n).toLocaleString("pl-PL")}
              tone="info"
            />
            <KpiCard
              label="Revenue / month"
              value={computed.breakEvenRevenue / 100}
              format={(n) => `${Math.round(n).toLocaleString("pl-PL")} zł`}
              tone="info"
            />
          </div>
        </CardBody>
      </Card>

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="v2-muted text-xs">{label}</div>
      <div className="tabular">{value}</div>
    </div>
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
