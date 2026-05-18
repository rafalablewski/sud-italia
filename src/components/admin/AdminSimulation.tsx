"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  Calculator,
  CalendarRange,
  ChefHat,
  Clock,
  Database,
  FlaskConical,
  Gauge,
  Grid3X3,
  HandCoins,
  LineChart as LineChartIcon,
  PiggyBank,
  Plus,
  Pizza,
  RefreshCw,
  Save,
  Scale,
  Sliders,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type {
  BusinessCostCategory,
  BusinessCostPayrollRole,
  MenuCategory,
  SimulationAssumptions,
  SimulationAttachLever,
  SimulationLaborLine,
  SimulationMenuMixLine,
  SimulationScenario,
  SimulationSeasonality,
  SimulationWeather,
} from "@/data/types";
import { getActiveLocations } from "@/data/locations";
import { useToast } from "./v2/ui/Toast";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
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

const MENU_CATEGORY_LABEL: Record<MenuCategory, string> = {
  pizza: "Pizza",
  pasta: "Pasta",
  antipasti: "Antipasti",
  panini: "Panini",
  drinks: "Drinks",
  desserts: "Desserts",
};

interface MenuSnapshotItem {
  id: string;
  name: string;
  category: MenuCategory;
  priceGrosze: number;
  costGrosze: number;
  recipeCostGrosze: number;
  recentQty: number;
}

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
  sizeUpsell: { pct: 0.10, priceDeltaGrosze: 500, costDeltaGrosze: 40 },
  cheapestPizzaShift: { pp: 0, ticketDeltaGrosze: 300, cogsDeltaGrosze: 100 },
  deliveryShare: { pct: 0.25, packagingCostGrosze: 250, extraProcessorPct: 0, avgFeeGrosze: 800 },
};

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
  totalCost: number;
  netProfit: number;
  margin: number;
  breakEvenOrdersPerDay: number;
  breakEvenOrdersPerMonth: number;
  breakEvenRevenue: number;
  laborByRole: { role: BusinessCostPayrollRole; grosze: number }[];
  laborHoursPerMonth: number;
  laborPct: number;
  primeCostPct: number;
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
  const totalCost = monthlyCogs + laborMonthly + fixedTotal + paymentFees;
  const netProfit = monthlyRevenue - totalCost;
  const margin = monthlyRevenue > 0 ? netProfit / monthlyRevenue : 0;
  // Break-even: contribution per order = avgTicket × (1 − cogsPct − paymentFee%).
  const contributionRatio = 1 - s.cogsPct - (s.paymentProcessorPct ?? 0);
  const contributionPerOrder = s.avgTicketGrosze * Math.max(0, contributionRatio);
  const fixedAndLabor = laborMonthly + fixedTotal;
  const breakEvenOrdersPerMonth =
    contributionPerOrder > 0 ? fixedAndLabor / contributionPerOrder : 0;
  const breakEvenOrdersPerDay =
    s.daysOpenPerMonth > 0 ? breakEvenOrdersPerMonth / s.daysOpenPerMonth : 0;
  const breakEvenRevenue = breakEvenOrdersPerMonth * s.avgTicketGrosze;
  const laborPct = monthlyRevenue > 0 ? laborMonthly / monthlyRevenue : 0;
  const primeCostPct =
    monthlyRevenue > 0 ? (monthlyCogs + laborMonthly) / monthlyRevenue : 0;
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
    totalCost,
    netProfit,
    margin,
    breakEvenOrdersPerMonth,
    breakEvenRevenue,
    laborHoursPerMonth,
    laborPct,
    primeCostPct,
    revenuePerLaborHour,
    profitPerOrder,
    paybackMonths,
    breakEvenOrdersPerDay,
    laborByRole,
  };
}

/** Project the scenario across 12 months, applying seasonal volume
 *  multipliers and monthly inflation drift on labor + COGS + fixed
 *  costs. Returns one row per month. */
function projectTwelveMonths(s: SimulationScenario, startMonth = 0) {
  const seasonality = s.seasonality ?? DEFAULT_SEASONALITY;
  const wageMonthly = (1 + (s.wageInflationPct ?? 0)) ** (1 / 12) - 1;
  const cogsMonthly = (1 + (s.ingredientInflationPct ?? 0)) ** (1 / 12) - 1;
  const baseLaborHours = s.labor.reduce(
    (sum, l) => sum + l.headcount * l.hoursPerWeek * WEEKS_PER_MONTH,
    0,
  );
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
    const orders = s.ordersPerDay * seasonMult * s.daysOpenPerMonth;
    const wageMult = (1 + wageMonthly) ** i;
    const cogsMult = (1 + cogsMonthly) ** i;
    const revenue = Math.round(orders * s.avgTicketGrosze);
    const cogs = Math.round(revenue * s.cogsPct * cogsMult);
    const labor = Math.round(baseLaborMonthly * wageMult);
    const fixed = Math.round(baseFixed * cogsMult);
    const payment = Math.round(revenue * (s.paymentProcessorPct ?? 0));
    const netProfit = revenue - cogs - labor - fixed - payment;
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
  // suppress unused-var lint — baseLaborHours kept for downstream tweaks
  void baseLaborHours;
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

/** Resolve the effective avgTicketGrosze + cogsPct from the menu mix
 *  (when non-empty + at least one weighted item resolves in the menu
 *  snapshot). Returns null when the mix is inactive or empty, in which
 *  case the scenario's own avgTicketGrosze + cogsPct stand. Weights
 *  are normalised so they sum to 1 — operator-typed values can total
 *  anything; UX shows the warning. */
function deriveMixValues(
  mix: SimulationMenuMixLine[] | undefined,
  menu: MenuSnapshotItem[],
): { avgTicketGrosze: number; cogsPct: number; matchedWeight: number } | null {
  if (!mix || mix.length === 0 || menu.length === 0) return null;
  const byId = new Map(menu.map((m) => [m.id, m]));
  let weightedPrice = 0;
  let weightedCost = 0;
  let totalWeight = 0;
  for (const line of mix) {
    const item = byId.get(line.menuItemId);
    if (!item || line.weight <= 0) continue;
    weightedPrice += line.weight * item.priceGrosze;
    weightedCost += line.weight * item.recipeCostGrosze;
    totalWeight += line.weight;
  }
  if (totalWeight <= 0) return null;
  const avgTicketGrosze = Math.round(weightedPrice / totalWeight);
  const cogsPct = weightedPrice > 0 ? weightedCost / weightedPrice : 0;
  return { avgTicketGrosze, cogsPct, matchedWeight: totalWeight };
}

/** Per-order ticket + cost adjustment from a single attach lever. */
function attachDelta(
  lever: SimulationAttachLever | undefined,
): { ticket: number; cogs: number } {
  if (!lever) return { ticket: 0, cogs: 0 };
  const ticket = lever.attachPct * lever.avgPriceGrosze;
  const cogs = lever.attachPct * lever.avgPriceGrosze * lever.cogsPct;
  return { ticket, cogs };
}

/** Fold the behavior + weather levers into the scenario. Returns a new
 *  scenario where ordersPerDay × avgTicket × cogsPct already absorb every
 *  lever — so every downstream chart, KPI, heatmap and projection picks
 *  them up without further changes. */
function applyAssumptionsAndWeather(s: SimulationScenario): SimulationScenario {
  const a = s.assumptions;
  const w = s.weather;

  let extraTicket = 0;
  let extraCogs = 0;

  if (a) {
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
    if (a.comboConversion) {
      const c = a.comboConversion;
      extraTicket += c.pct * (c.addonGrosze - c.discountGrosze);
      extraCogs += c.pct * c.addonGrosze * c.addonCogsPct;
    }
    if (a.sizeUpsell) {
      extraTicket += a.sizeUpsell.pct * a.sizeUpsell.priceDeltaGrosze;
      extraCogs += a.sizeUpsell.pct * a.sizeUpsell.costDeltaGrosze;
    }
    if (a.cheapestPizzaShift) {
      extraTicket -= a.cheapestPizzaShift.pp * a.cheapestPizzaShift.ticketDeltaGrosze;
      extraCogs -= a.cheapestPizzaShift.pp * a.cheapestPizzaShift.cogsDeltaGrosze;
    }
    if (a.deliveryShare) {
      const dShare = a.deliveryShare;
      extraTicket += dShare.pct * dShare.avgFeeGrosze;
      const ticketBeforeDelivery = s.avgTicketGrosze + extraTicket - dShare.pct * dShare.avgFeeGrosze;
      extraCogs +=
        dShare.pct *
        (dShare.packagingCostGrosze + ticketBeforeDelivery * dShare.extraProcessorPct);
    }
  }

  const newTicket = Math.max(0, s.avgTicketGrosze + extraTicket);
  const baselineCogsValue = s.avgTicketGrosze * s.cogsPct;
  const totalCogsValue = Math.max(0, baselineCogsValue + extraCogs);
  const newCogsPct = newTicket > 0 ? Math.min(1, totalCogsValue / newTicket) : s.cogsPct;

  // Weather + calendar — modify effective ordersPerDay / daysOpen.
  let volumeMult = 1;
  let daysOpen = s.daysOpenPerMonth;
  let ordersPerDay = s.ordersPerDay;
  if (w) {
    volumeMult *= w.rainyShare * w.rainyDayMultiplier + (1 - w.rainyShare);
    volumeMult *= w.heatwaveShare * w.heatwaveMultiplier + (1 - w.heatwaveShare);
    // School-holiday lunch dip — applies only to summer months. Annualised as 2/12.
    const summerShare = 2 / 12;
    volumeMult *= summerShare * w.schoolHolidayLunchMultiplier + (1 - summerShare);
    // Holiday closures: reduce effective days open.
    daysOpen = Math.max(0, s.daysOpenPerMonth - w.holidayClosedDaysPerMonth);
    // Peak + event days: extra orders/month re-amortised across the (now-shorter) month.
    ordersPerDay = s.ordersPerDay * volumeMult;
    if (daysOpen > 0) {
      const baseDaily = s.ordersPerDay; // pre-multiplier daily volume for bonus math
      const peakBonus =
        w.holidayPeakDaysPerMonth * (w.holidayPeakMultiplier - 1) * baseDaily;
      const eventBonus =
        w.eventDaysPerMonth * (w.eventDayMultiplier - 1) * baseDaily;
      ordersPerDay += (peakBonus + eventBonus) / daysOpen;
    }
  }

  return {
    ...s,
    ordersPerDay,
    avgTicketGrosze: newTicket,
    cogsPct: newCogsPct,
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

const ACTIVE_LOCATIONS = getActiveLocations();

export function AdminSimulation() {
  const toast = useToast();
  const [scenario, setScenario] = useState<SimulationScenario | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seedConfirmOpen, setSeedConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [menuSnapshot, setMenuSnapshot] = useState<MenuSnapshotItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const dirtyRef = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchScenario = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/simulation");
      if (res.ok) {
        const data = (await res.json()) as SimulationScenario;
        setScenario(data);
        dirtyRef.current = false;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScenario();
  }, [fetchScenario]);

  // Pull the menu snapshot whenever the scenario's menuMixLocation
  // changes (defaults to the first active location). Idempotent — the
  // server route filters by available items only.
  const menuLocation =
    scenario?.menuMixLocation ?? ACTIVE_LOCATIONS[0]?.slug ?? "warszawa";
  useEffect(() => {
    let cancelled = false;
    setMenuLoading(true);
    fetch(`/api/admin/simulation/menu?location=${encodeURIComponent(menuLocation)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.items) setMenuSnapshot(j.items as MenuSnapshotItem[]);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setMenuLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [menuLocation]);

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

  // Debounced auto-save on edits — 1 s after the last keystroke.
  const update = useCallback(
    (mut: (prev: SimulationScenario) => SimulationScenario) => {
      setScenario((prev) => {
        if (!prev) return prev;
        const next = mut(prev);
        dirtyRef.current = true;
        if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
        autosaveTimer.current = setTimeout(() => {
          if (dirtyRef.current) persist(next, { quiet: true });
        }, 1000);
        return next;
      });
    },
    [persist],
  );

  useEffect(
    () => () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    },
    [],
  );

  // When menu mix is active, the avgTicketGrosze and cogsPct fields on
  // the scenario are display-only — the real values come from the
  // weighted mix. effectiveScenario is the one fed into every chart,
  // matrix, projection and KPI on this page.
  const mixDerived = useMemo(
    () => deriveMixValues(scenario?.menuMix, menuSnapshot),
    [scenario?.menuMix, menuSnapshot],
  );
  const effectiveScenario = useMemo<SimulationScenario | null>(() => {
    if (!scenario) return null;
    let s: SimulationScenario = scenario;
    if (mixDerived) {
      s = {
        ...s,
        avgTicketGrosze: mixDerived.avgTicketGrosze,
        cogsPct: mixDerived.cogsPct,
      };
    }
    return applyAssumptionsAndWeather(s);
  }, [scenario, mixDerived]);
  const computed = useMemo(
    () => (effectiveScenario ? computeScenario(effectiveScenario) : null),
    [effectiveScenario],
  );

  const weightById = useMemo(() => {
    const m = new Map<string, number>();
    for (const line of scenario?.menuMix ?? []) m.set(line.menuItemId, line.weight);
    return m;
  }, [scenario?.menuMix]);

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
    const seeded = (await res.json()) as SimulationScenario;
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
        { id: "pizzaiolo", role: "pizzaiolo", headcount: 2, hoursPerWeek: 66, hourlyRateGrosze: 4300 },
        { id: "chef", role: "chef", headcount: 1, hoursPerWeek: 66, hourlyRateGrosze: 3700 },
        { id: "sous-chef", role: "sous-chef", headcount: 1, hoursPerWeek: 48, hourlyRateGrosze: 3300 },
        { id: "barista", role: "barista", headcount: 1, hoursPerWeek: 60, hourlyRateGrosze: 3900 },
        { id: "waiter", role: "waiter", headcount: 2, hoursPerWeek: 60, hourlyRateGrosze: 4000 },
        { id: "kitchen-porter", role: "kitchen-porter", headcount: 1, hoursPerWeek: 36, hourlyRateGrosze: 3000 },
        { id: "manager", role: "manager", headcount: 1, hoursPerWeek: 50, hourlyRateGrosze: 5500 },
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
          id: `line-${Date.now().toString(36)}`,
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

  const setMixWeight = (itemId: string, pct: number) => {
    const w = Math.max(0, Math.min(1, pct / 100));
    update((s) => {
      const next = new Map<string, number>();
      for (const line of s.menuMix ?? []) next.set(line.menuItemId, line.weight);
      if (w > 0) next.set(itemId, w);
      else next.delete(itemId);
      return {
        ...s,
        menuMix: Array.from(next.entries()).map(([menuItemId, weight]) => ({
          menuItemId,
          weight,
        })),
      };
    });
  };

  const autoFillMixFromHistory = () => {
    const total = menuSnapshot.reduce((sum, m) => sum + m.recentQty, 0);
    if (total === 0) {
      toast.warning("No order history yet", "Last 30 days are empty for this location.");
      return;
    }
    update((s) => ({
      ...s,
      menuMix: menuSnapshot
        .filter((m) => m.recentQty > 0)
        .map((m) => ({ menuItemId: m.id, weight: m.recentQty / total })),
    }));
    toast.success("Filled from last 30 days");
  };

  const clearMix = () => {
    update((s) => ({ ...s, menuMix: undefined }));
    toast.success("Menu mix disabled", "Average ticket + COGS are now manual.");
  };

  const setMixLocation = (slug: string) => {
    update((s) => ({ ...s, menuMixLocation: slug, menuMix: undefined }));
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
  const projection = projectTwelveMonths(effectiveScenario!);
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

      <section className="v2-kpi-grid">
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
          <CardHeader title="Revenue inputs" description="Volume and ticket assumptions." />
          <CardBody>
            <div className="v2-stack-12">
              <Input
                label="Orders per day"
                type="number"
                min="0"
                value={String(scenario.ordersPerDay)}
                onChange={(e) =>
                  update((s) => ({ ...s, ordersPerDay: Math.max(0, parseInt(e.target.value || "0", 10)) }))
                }
              />
              <Input
                label={mixDerived ? "Average ticket (derived from menu mix)" : "Average ticket"}
                type="number"
                step="0.01"
                min="0"
                value={
                  mixDerived
                    ? (mixDerived.avgTicketGrosze / 100).toFixed(2)
                    : (scenario.avgTicketGrosze / 100).toFixed(2)
                }
                onChange={(e) => {
                  if (mixDerived) return;
                  update((s) => ({
                    ...s,
                    avgTicketGrosze: Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100)),
                  }));
                }}
                readOnly={!!mixDerived}
                trailingAdornment={<span className="v2-muted">zł</span>}
                description={mixDerived ? "Computed from the Menu mix card below." : undefined}
              />
              <Input
                label="Days open per month"
                type="number"
                min="0"
                max="31"
                value={String(scenario.daysOpenPerMonth)}
                onChange={(e) =>
                  update((s) => ({
                    ...s,
                    daysOpenPerMonth: Math.max(0, Math.min(31, parseInt(e.target.value || "0", 10))),
                  }))
                }
              />
              <Input
                label={
                  mixDerived
                    ? "Ingredient cost ratio (derived from menu mix)"
                    : "Ingredient cost ratio"
                }
                type="number"
                step="1"
                min="0"
                max="100"
                value={
                  mixDerived
                    ? (mixDerived.cogsPct * 100).toFixed(1)
                    : String(Math.round(scenario.cogsPct * 100))
                }
                onChange={(e) => {
                  if (mixDerived) return;
                  update((s) => ({
                    ...s,
                    cogsPct: Math.max(0, Math.min(1, parseFloat(e.target.value || "0") / 100)),
                  }));
                }}
                readOnly={!!mixDerived}
                trailingAdornment={<span className="v2-muted">%</span>}
                description={
                  mixDerived
                    ? "Weighted average of menu items' recipe-derived cost / price."
                    : "Share of revenue eaten by food cost. 28–32% is typical for pizza + pasta + coffee."
                }
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Labor mix"
            description="Per-role headcount × weekly hours × hourly rate. Default rates are Warsaw 2026 brutto × 1.22 (full employer cost incl. ZUS narzut). Divide by 1.22 if you'd rather think in pure brutto."
            actions={
              <Button size="sm" variant="ghost" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={addLaborRow}>
                Add row
              </Button>
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
                            headcount: Math.max(0, parseInt(e.target.value || "0", 10)),
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
                            hoursPerWeek: Math.max(0, parseInt(e.target.value || "0", 10)),
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
                              Math.round(parseFloat(e.target.value || "0") * 100),
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

      <Card>
        <CardHeader
          title="Menu mix"
          description={
            mixDerived
              ? `Live: derived avg ticket ${formatPrice(mixDerived.avgTicketGrosze)}, COGS ${(mixDerived.cogsPct * 100).toFixed(1)}%. Total weight ${(mixDerived.matchedWeight * 100).toFixed(0)}%.`
              : "Pick how often each menu item sells. Weights drive the average ticket and food cost ratio automatically. Empty = simple inputs above stand."
          }
          actions={
            <div className="flex items-center gap-2">
              <Select
                value={menuLocation}
                onChange={(e) => setMixLocation(e.target.value)}
                options={ACTIVE_LOCATIONS.map((l) => ({ value: l.slug, label: l.city }))}
                aria-label="Menu location"
              />
              <Button
                size="sm"
                variant="secondary"
                leadingIcon={<Sparkles className="h-3.5 w-3.5" />}
                onClick={autoFillMixFromHistory}
                disabled={menuLoading}
              >
                Auto-fill (30 d)
              </Button>
              {mixDerived && (
                <Button size="sm" variant="ghost" onClick={clearMix}>
                  Disable mix
                </Button>
              )}
            </div>
          }
        />
        <CardBody>
          {menuLoading ? (
            <div className="v2-page-loading">Loading menu…</div>
          ) : menuSnapshot.length === 0 ? (
            <div className="v2-muted text-sm">
              No available menu items for this location. Check{" "}
              <Link href="/admin/menu" className="underline">
                /admin/menu
              </Link>{" "}
              and ensure items are marked available.
            </div>
          ) : (
            <MenuMixGrid
              items={menuSnapshot}
              weightById={weightById}
              onWeightChange={setMixWeight}
              mixActive={!!mixDerived}
            />
          )}
        </CardBody>
      </Card>

      <BehaviorAssumptionsCard
        assumptions={scenario.assumptions ?? DEFAULT_ASSUMPTIONS}
        baseTicketGrosze={mixDerived?.avgTicketGrosze ?? scenario.avgTicketGrosze}
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
            actions={<FlaskConical className="h-4 w-4 v2-muted" />}
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
            actions={<ChefHat className="h-4 w-4 v2-muted" />}
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

      <section className="v2-kpi-grid">
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
          actions={<Sparkles className="h-4 w-4 v2-muted" />}
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
            actions={<Grid3X3 className="h-4 w-4 v2-muted" />}
          />
          <CardBody>
            <Heatmap
              cells={ordersTicketMatrix.cells}
              xLabels={ordersTicketMatrix.xLabels}
              yLabels={ordersTicketMatrix.yLabels}
              rowHeight={36}
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
            actions={<Grid3X3 className="h-4 w-4 v2-muted" />}
          />
          <CardBody>
            <Heatmap
              cells={cogsTicketMatrix.cells}
              xLabels={cogsTicketMatrix.xLabels}
              yLabels={cogsTicketMatrix.yLabels}
              rowHeight={36}
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
          actions={<Sliders className="h-4 w-4 v2-muted" />}
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
                  wageInflationPct: Math.max(0, Math.min(1, parseFloat(e.target.value || "0") / 100)),
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
                  ingredientInflationPct: Math.max(0, Math.min(1, parseFloat(e.target.value || "0") / 100)),
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
                  paymentProcessorPct: Math.max(0, Math.min(0.1, parseFloat(e.target.value || "0") / 100)),
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
                  setupCostGrosze: Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100)),
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
                    winter: Math.max(0, Math.min(3, parseFloat(e.target.value || "0"))),
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
                    summer: Math.max(0, Math.min(3, parseFloat(e.target.value || "0"))),
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
                    spring: Math.max(0, Math.min(3, parseFloat(e.target.value || "0"))),
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
                    autumn: Math.max(0, Math.min(3, parseFloat(e.target.value || "0"))),
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
          actions={<LineChartIcon className="h-4 w-4 v2-muted" />}
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
          actions={<Calculator className="h-4 w-4 v2-muted" />}
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

interface MenuMixGridProps {
  items: MenuSnapshotItem[];
  weightById: Map<string, number>;
  onWeightChange: (itemId: string, pct: number) => void;
  mixActive: boolean;
}

function MenuMixGrid({ items, weightById, onWeightChange, mixActive }: MenuMixGridProps) {
  const grouped = useMemo(() => {
    const groups = new Map<MenuCategory, MenuSnapshotItem[]>();
    for (const item of items) {
      const list = groups.get(item.category) ?? [];
      list.push(item);
      groups.set(item.category, list);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const totalWeight = useMemo(() => {
    let sum = 0;
    for (const w of weightById.values()) sum += w;
    return sum;
  }, [weightById]);

  return (
    <div className="v2-stack-12">
      <div className="flex items-center justify-between gap-3">
        <Badge tone={mixActive ? "success" : "neutral"} variant="soft" dot>
          {mixActive ? "Mix active" : "Mix off"}
        </Badge>
        <span className="text-sm v2-muted">
          Total weight:{" "}
          <strong
            className={`tabular ${
              Math.abs(totalWeight - 1) < 0.01
                ? ""
                : totalWeight > 1.01
                  ? "text-amber-500"
                  : totalWeight > 0
                    ? "text-amber-500"
                    : ""
            }`}
          >
            {(totalWeight * 100).toFixed(0)}%
          </strong>{" "}
          (weights are auto-normalised to 100% in the math)
        </span>
      </div>
      <div className="max-h-[480px] overflow-y-auto pr-1">
        {grouped.map(([category, rows]) => (
          <div key={category} className="mb-3">
            <div className="v2-section-h flex items-center gap-2 mb-1">
              <Pizza className="h-3.5 w-3.5 v2-muted" aria-hidden />
              <span>{MENU_CATEGORY_LABEL[category]}</span>
              <span className="v2-muted text-xs">({rows.length})</span>
            </div>
            <div className="grid grid-cols-12 gap-2 text-xs v2-muted px-2 py-1 border-b border-[var(--border)]">
              <div className="col-span-5">Item</div>
              <div className="col-span-2 text-right">Price</div>
              <div className="col-span-2 text-right">Food cost</div>
              <div className="col-span-1 text-right">Margin</div>
              <div className="col-span-2 text-right">Weight</div>
            </div>
            {rows.map((row) => {
              const w = weightById.get(row.id) ?? 0;
              const margin =
                row.priceGrosze > 0 ? 1 - row.recipeCostGrosze / row.priceGrosze : 0;
              return (
                <div
                  key={row.id}
                  className="grid grid-cols-12 gap-2 items-center px-2 py-1.5 border-b border-[var(--border)] text-sm"
                >
                  <div className="col-span-5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{row.name}</span>
                      {row.recentQty > 0 && (
                        <Badge tone="info" variant="soft">
                          {row.recentQty} ord/30d
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2 text-right tabular">
                    {formatPrice(row.priceGrosze)}
                  </div>
                  <div className="col-span-2 text-right tabular v2-muted">
                    {formatPrice(row.recipeCostGrosze)}
                  </div>
                  <div
                    className={`col-span-1 text-right tabular ${
                      margin >= 0.6 ? "text-emerald-500" : margin >= 0.4 ? "" : "text-amber-500"
                    }`}
                  >
                    {(margin * 100).toFixed(0)}%
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={Math.round(w * 100)}
                      onChange={(e) => onWeightChange(row.id, parseFloat(e.target.value || "0"))}
                      className="v2-input"
                      style={{ textAlign: "right", paddingRight: 8 }}
                      aria-label={`Weight for ${row.name}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
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
}

function AttachLeverRow({ label, hint, lever, baseTicketGrosze, onChange }: AttachRowProps) {
  // Per-order projected ticket lift = attachPct × price; margin = (1 − cogsPct) × ticket lift.
  const ticketLift = lever.attachPct * lever.avgPriceGrosze;
  const cogsLift = ticketLift * lever.cogsPct;
  const marginLift = ticketLift - cogsLift;
  const pctOfBase = baseTicketGrosze > 0 ? (ticketLift / baseTicketGrosze) * 100 : 0;
  return (
    <div className="grid grid-cols-12 gap-2 items-end">
      <div className="col-span-12 md:col-span-4">
        <div className="text-sm font-medium">{label}</div>
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
              attachPct: Math.max(0, Math.min(1, parseFloat(e.target.value || "0") / 100)),
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
              avgPriceGrosze: Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100)),
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
              cogsPct: Math.max(0, Math.min(1, parseFloat(e.target.value || "0") / 100)),
            })
          }
          trailingAdornment={<span className="v2-muted">%</span>}
        />
      </div>
      <div className="col-span-12 md:col-span-2 text-xs v2-muted text-right">
        +{formatPrice(Math.round(ticketLift))} AOV
        <br />
        +{formatPrice(Math.round(marginLift))} margin
        <br />
        <span className="opacity-70">{pctOfBase.toFixed(1)}% of ticket</span>
      </div>
    </div>
  );
}

interface BehaviorCardProps {
  assumptions: SimulationAssumptions;
  baseTicketGrosze: number;
  onChange: (next: SimulationAssumptions) => void;
}

function BehaviorAssumptionsCard({ assumptions, baseTicketGrosze, onChange }: BehaviorCardProps) {
  const a = assumptions;
  const set = <K extends keyof SimulationAssumptions>(key: K, value: SimulationAssumptions[K]) =>
    onChange({ ...a, [key]: value });

  return (
    <Card>
      <CardHeader
        title="Behavior assumptions"
        description="Tune attach rates, combos and channel mix — every lever folds into effective ticket + COGS, then flows into every KPI, heatmap and projection below."
        actions={<Sparkles className="h-4 w-4 v2-muted" />}
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
            />
          )}
          {a.dessertAttach && (
            <AttachLeverRow
              label="Dessert attach"
              hint="Tiramisu / cannoli / panna cotta."
              lever={a.dessertAttach}
              baseTicketGrosze={baseTicketGrosze}
              onChange={(v) => set("dessertAttach", v)}
            />
          )}
          {a.antipastiAttach && (
            <AttachLeverRow
              label="Antipasti / starter attach"
              hint="Bruschetta, burrata, olives."
              lever={a.antipastiAttach}
              baseTicketGrosze={baseTicketGrosze}
              onChange={(v) => set("antipastiAttach", v)}
            />
          )}
          {a.aperitivoAttach && (
            <AttachLeverRow
              label="Aperitivo / wine attach"
              hint="Aperol, wine glass — needs alcohol licence."
              lever={a.aperitivoAttach}
              baseTicketGrosze={baseTicketGrosze}
              onChange={(v) => set("aperitivoAttach", v)}
            />
          )}
          {a.premiumToppingsAttach && (
            <AttachLeverRow
              label="Premium toppings attach"
              hint="Buffalo mozzarella, 'nduja, truffle oil."
              lever={a.premiumToppingsAttach}
              baseTicketGrosze={baseTicketGrosze}
              onChange={(v) => set("premiumToppingsAttach", v)}
            />
          )}
          {a.pastaPrimoAttach && (
            <AttachLeverRow
              label="Pasta primo attach"
              hint="Pasta course alongside the pizza."
              lever={a.pastaPrimoAttach}
              baseTicketGrosze={baseTicketGrosze}
              onChange={(v) => set("pastaPrimoAttach", v)}
            />
          )}

          <div className="border-t border-[var(--border)] pt-3" />

          {a.comboConversion && (
            <div className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-12 md:col-span-4">
                <div className="text-sm font-medium">Combo conversion</div>
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
                      pct: Math.max(0, Math.min(1, parseFloat(e.target.value || "0") / 100)),
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
                      addonGrosze: Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100)),
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
                      discountGrosze: Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100)),
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
                      addonCogsPct: Math.max(0, Math.min(1, parseFloat(e.target.value || "0") / 100)),
                    })
                  }
                  trailingAdornment={<span className="v2-muted">%</span>}
                />
              </div>
            </div>
          )}

          {a.sizeUpsell && (
            <div className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-12 md:col-span-4">
                <div className="text-sm font-medium">Size / crust upsell</div>
                <div className="v2-muted text-xs">
                  Sourdough or 33 cm — pure margin add, marginal cost is tiny.
                </div>
              </div>
              <div className="col-span-4 md:col-span-2">
                <Input
                  label="Upsell %"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={String(Math.round(a.sizeUpsell.pct * 100))}
                  onChange={(e) =>
                    set("sizeUpsell", {
                      ...a.sizeUpsell!,
                      pct: Math.max(0, Math.min(1, parseFloat(e.target.value || "0") / 100)),
                    })
                  }
                  trailingAdornment={<span className="v2-muted">%</span>}
                />
              </div>
              <div className="col-span-4 md:col-span-3">
                <Input
                  label="+ price"
                  type="number"
                  step="0.5"
                  min="0"
                  value={(a.sizeUpsell.priceDeltaGrosze / 100).toFixed(2)}
                  onChange={(e) =>
                    set("sizeUpsell", {
                      ...a.sizeUpsell!,
                      priceDeltaGrosze: Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100)),
                    })
                  }
                  trailingAdornment={<span className="v2-muted">zł</span>}
                />
              </div>
              <div className="col-span-4 md:col-span-3">
                <Input
                  label="+ cost"
                  type="number"
                  step="0.1"
                  min="0"
                  value={(a.sizeUpsell.costDeltaGrosze / 100).toFixed(2)}
                  onChange={(e) =>
                    set("sizeUpsell", {
                      ...a.sizeUpsell!,
                      costDeltaGrosze: Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100)),
                    })
                  }
                  trailingAdornment={<span className="v2-muted">zł</span>}
                />
              </div>
            </div>
          )}

          {a.cheapestPizzaShift && (
            <div className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-12 md:col-span-4">
                <div className="text-sm font-medium">Cheapest-pizza shift (recession stress)</div>
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
                      pp: Math.max(0, Math.min(1, parseFloat(e.target.value || "0") / 100)),
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
                      ticketDeltaGrosze: Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100)),
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
                      cogsDeltaGrosze: Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100)),
                    })
                  }
                  trailingAdornment={<span className="v2-muted">zł</span>}
                />
              </div>
            </div>
          )}

          {a.deliveryShare && (
            <div className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-12 md:col-span-4">
                <div className="text-sm font-medium">Delivery channel share</div>
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
                      pct: Math.max(0, Math.min(1, parseFloat(e.target.value || "0") / 100)),
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
                        Math.round(parseFloat(e.target.value || "0") * 100),
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
                        Math.min(0.1, parseFloat(e.target.value || "0") / 100),
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
                      avgFeeGrosze: Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100)),
                    })
                  }
                  trailingAdornment={<span className="v2-muted">zł</span>}
                />
              </div>
            </div>
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
        actions={<CalendarRange className="h-4 w-4 v2-muted" />}
      />
      <CardBody>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <Input
            label="Rainy-day multiplier"
            type="number"
            step="0.05"
            min="0"
            max="3"
            value={w.rainyDayMultiplier.toFixed(2)}
            onChange={(e) =>
              patch({ rainyDayMultiplier: Math.max(0, Math.min(3, parseFloat(e.target.value || "0"))) })
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
              patch({ rainyShare: Math.max(0, Math.min(1, parseFloat(e.target.value || "0") / 100)) })
            }
            trailingAdornment={<span className="v2-muted">%</span>}
            description="Share of days that are rainy (Warsaw avg ~30%)."
          />
          <Input
            label="Heatwave multiplier"
            type="number"
            step="0.05"
            min="0"
            max="3"
            value={w.heatwaveMultiplier.toFixed(2)}
            onChange={(e) =>
              patch({ heatwaveMultiplier: Math.max(0, Math.min(3, parseFloat(e.target.value || "0"))) })
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
              patch({ heatwaveShare: Math.max(0, Math.min(1, parseFloat(e.target.value || "0") / 100)) })
            }
            trailingAdornment={<span className="v2-muted">%</span>}
            description="Share of evenings hot enough to fire the bonus."
          />
          <Input
            label="Holiday closed days / month"
            type="number"
            step="0.5"
            min="0"
            max="31"
            value={w.holidayClosedDaysPerMonth.toFixed(1)}
            onChange={(e) =>
              patch({
                holidayClosedDaysPerMonth: Math.max(
                  0,
                  Math.min(31, parseFloat(e.target.value || "0")),
                ),
              })
            }
            description="Easter Sunday, NYE, 25 Dec, 15 Aug, Boże Ciało (~12/yr ÷ 12)."
          />
          <Input
            label="Peak days / month"
            type="number"
            step="0.5"
            min="0"
            max="31"
            value={w.holidayPeakDaysPerMonth.toFixed(1)}
            onChange={(e) =>
              patch({
                holidayPeakDaysPerMonth: Math.max(
                  0,
                  Math.min(31, parseFloat(e.target.value || "0")),
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
              patch({ holidayPeakMultiplier: Math.max(0, Math.min(5, parseFloat(e.target.value || "0"))) })
            }
            description="Default 1.60 — peak days run hot."
          />
          <Input
            label="School-holiday lunch dip"
            type="number"
            step="0.05"
            min="0"
            max="2"
            value={w.schoolHolidayLunchMultiplier.toFixed(2)}
            onChange={(e) =>
              patch({
                schoolHolidayLunchMultiplier: Math.max(
                  0,
                  Math.min(2, parseFloat(e.target.value || "0")),
                ),
              })
            }
            description="July + August offices empty (default 0.85)."
          />
          <Input
            label="Event days / month"
            type="number"
            step="0.5"
            min="0"
            max="31"
            value={w.eventDaysPerMonth.toFixed(1)}
            onChange={(e) =>
              patch({
                eventDaysPerMonth: Math.max(0, Math.min(31, parseFloat(e.target.value || "0"))),
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
              patch({ eventDayMultiplier: Math.max(0, Math.min(5, parseFloat(e.target.value || "0"))) })
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
