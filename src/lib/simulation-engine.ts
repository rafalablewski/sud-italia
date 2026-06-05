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
import type { BusinessCostPayrollRole, SimulationScenario } from "@/data/types";

export const WEEKS_PER_MONTH = 4.345;

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
