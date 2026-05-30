// LTV / CAC engine — audit §11.3 "what's the LTV/CAC? — not computed".
//
// This is the missing acquisition-economics layer. It reuses buildCohortReport
// as the single source of truth for cohort sizes (new customers / month) and
// CLTV horizons, then layers on Customer Acquisition Cost computed from the
// REAL marketing-category rows in the operating-costs ledger
// (/admin/business-costs). No invented numbers: every figure traces to a paid
// order or a logged marketing cost.
//
// Pure over (orders, marketingCosts, now) so it's deterministic + testable.

import type { Order, BusinessCostFrequency } from "@/data/types";
import { buildCohortReport } from "./cohort-analytics";
import { monthlyGrosze } from "./business-costs-math";

/** Subset of a BusinessCost row this engine needs (category already filtered
 *  to "marketing" by the caller). */
export interface MarketingCostInput {
  amountGrosze: number;
  frequency: BusinessCostFrequency;
  /** ISO date (YYYY-MM-DD). One-off costs land in this month; recurring costs
   *  start accruing from this month. Undefined recurring ⇒ accrues across the
   *  whole analysis window. */
  startDate?: string;
  /** ISO date a recurring cost stopped. Undefined ⇒ through `now`. */
  endDate?: string;
}

export interface LtvCacMonthRow {
  cohortMonth: string; // YYYY-MM
  newCustomers: number;
  marketingSpendGrosze: number;
  /** spend / newCustomers — null when no new customers landed that month. */
  cacGrosze: number | null;
  /** Revenue CLTV at the 365-day horizon for this cohort (from cohort report). */
  ltv365Grosze: number;
  /** Margin-adjusted CLTV (ltv365 × blended gross margin) — the figure that
   *  actually has to clear CAC. */
  ltv365MarginGrosze: number;
  /** marginLTV / CAC — null when CAC is unknown or zero. */
  ltvCacRatio: number | null;
  /** Months for margin CLTV to recoup CAC (1/2/3/6/12 horizons). 13 = not
   *  recouped within a year; null = no CAC to recoup. */
  paybackMonths: number | null;
}

export interface LtvCacReport {
  generatedAt: string;
  /** Blended gross margin (0–100) derived from paid-order line items. */
  blendedMarginPct: number;
  totals: {
    newCustomers: number;
    marketingSpendGrosze: number;
    blendedCacGrosze: number | null;
    /** Size-weighted mean 365-day revenue CLTV across cohorts. */
    blendedLtvGrosze: number;
    blendedLtvMarginGrosze: number;
    ltvCacRatio: number | null;
    paybackMonths: number | null;
    /** False when no marketing costs are logged — UI prompts the operator to
     *  record spend in /admin/business-costs rather than showing a fake CAC. */
    hasMarketingData: boolean;
  };
  months: LtvCacMonthRow[];
}

/** Day-horizon → month bucket used for payback. */
const HORIZONS: { months: number; key: "d30" | "d60" | "d90" | "d180" | "d365" }[] = [
  { months: 1, key: "d30" },
  { months: 2, key: "d60" },
  { months: 3, key: "d90" },
  { months: 6, key: "d180" },
  { months: 12, key: "d365" },
];

/** Blended gross margin (0–1) from paid-order line items: Σ(price−cost)·qty /
 *  Σ price·qty. Returns 0 when there's no priced revenue. */
function blendedMargin(orders: Order[]): number {
  let revenue = 0;
  let profit = 0;
  for (const o of orders) {
    if (o.status === "pending" || o.status === "cancelled") continue;
    for (const item of o.items ?? []) {
      const price = item.menuItem?.price ?? 0;
      const cost = item.menuItem?.cost ?? 0;
      const qty = item.quantity ?? 0;
      revenue += price * qty;
      profit += (price - cost) * qty;
    }
  }
  return revenue > 0 ? profit / revenue : 0;
}

function ym(iso: string): string {
  return iso.slice(0, 7);
}

/** Attribute marketing spend to each month in `months`. One-off costs hit the
 *  month of their startDate; recurring costs add their monthly-normalized burn
 *  to every month inside [startDate, endDate] that overlaps the window. */
export function marketingSpendByMonth(
  costs: MarketingCostInput[],
  months: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of months) out[m] = 0;
  if (months.length === 0) return out;
  const windowStart = months[0];
  const windowEnd = months[months.length - 1];

  for (const c of costs) {
    if (c.frequency === "one-off") {
      if (!c.startDate) continue; // can't place an undated one-off
      const m = ym(c.startDate);
      if (m in out) out[m] += c.amountGrosze;
      continue;
    }
    const burn = monthlyGrosze(c);
    if (burn <= 0) continue;
    const from = c.startDate ? ym(c.startDate) : windowStart;
    const to = c.endDate ? ym(c.endDate) : windowEnd;
    for (const m of months) {
      if (m >= from && m <= to) out[m] += burn;
    }
  }
  return out;
}

function paybackFromCurve(
  cltv: { cltv30Grosze: number; cltv60Grosze: number; cltv90Grosze: number; cltv180Grosze: number; cltv365Grosze: number },
  margin: number,
  cacGrosze: number | null,
): number | null {
  if (cacGrosze === null || cacGrosze <= 0) return null;
  const byKey: Record<string, number> = {
    d30: cltv.cltv30Grosze,
    d60: cltv.cltv60Grosze,
    d90: cltv.cltv90Grosze,
    d180: cltv.cltv180Grosze,
    d365: cltv.cltv365Grosze,
  };
  for (const h of HORIZONS) {
    if (byKey[h.key] * margin >= cacGrosze) return h.months;
  }
  return 13; // sentinel: not recouped within 12 months
}

export function buildLtvCacReport(
  orders: Order[],
  marketingCosts: MarketingCostInput[],
  now: Date = new Date(),
): LtvCacReport {
  const cohort = buildCohortReport(orders, now);
  const margin = blendedMargin(orders);
  const months = cohort.cohortsByMonth.map((c) => c.cohortMonth);
  const spend = marketingSpendByMonth(marketingCosts, months);
  const cltvByMonth = new Map(cohort.cltv.map((c) => [c.cohortMonth, c]));

  const rows: LtvCacMonthRow[] = cohort.cohortsByMonth.map((c) => {
    const cl = cltvByMonth.get(c.cohortMonth);
    const ltv365 = cl?.cltv365Grosze ?? 0;
    const ltv365Margin = Math.round(ltv365 * margin);
    const spendThisMonth = spend[c.cohortMonth] ?? 0;
    // CAC is null (unknown) when no spend is attributed to the month — NOT 0.
    // A 0 here would render as "free acquisition", but the honest reading is
    // "no marketing spend attributed to this cohort month" (e.g. spend started
    // later, or wasn't dated). Keeps CAC consistent with the ratio/payback,
    // which already treat a zero/absent CAC as unknown.
    const cac =
      c.cohortSize > 0 && spendThisMonth > 0
        ? Math.round(spendThisMonth / c.cohortSize)
        : null;
    const ratio = cac && cac > 0 ? Math.round((ltv365Margin / cac) * 100) / 100 : null;
    const payback = cl
      ? paybackFromCurve(cl, margin, cac)
      : null;
    return {
      cohortMonth: c.cohortMonth,
      newCustomers: c.cohortSize,
      marketingSpendGrosze: spendThisMonth,
      cacGrosze: cac,
      ltv365Grosze: ltv365,
      ltv365MarginGrosze: ltv365Margin,
      ltvCacRatio: ratio,
      paybackMonths: payback,
    };
  });

  const totalNew = cohort.totals.customers;
  const totalSpend = months.reduce((s, m) => s + (spend[m] ?? 0), 0);
  const hasMarketingData = totalSpend > 0;
  const blendedCac =
    hasMarketingData && totalNew > 0 ? Math.round(totalSpend / totalNew) : null;

  // Size-weighted mean 365-day revenue CLTV across cohorts.
  let weightedLtv = 0;
  let sizeSum = 0;
  for (const c of cohort.cltv) {
    weightedLtv += c.cltv365Grosze * c.cohortSize;
    sizeSum += c.cohortSize;
  }
  const blendedLtv = sizeSum > 0 ? Math.round(weightedLtv / sizeSum) : 0;
  const blendedLtvMargin = Math.round(blendedLtv * margin);
  const ratio =
    blendedCac && blendedCac > 0
      ? Math.round((blendedLtvMargin / blendedCac) * 100) / 100
      : null;

  // Blended payback from the size-weighted CLTV curve.
  const weightedCurve = { cltv30Grosze: 0, cltv60Grosze: 0, cltv90Grosze: 0, cltv180Grosze: 0, cltv365Grosze: 0 };
  if (sizeSum > 0) {
    for (const c of cohort.cltv) {
      weightedCurve.cltv30Grosze += c.cltv30Grosze * c.cohortSize;
      weightedCurve.cltv60Grosze += c.cltv60Grosze * c.cohortSize;
      weightedCurve.cltv90Grosze += c.cltv90Grosze * c.cohortSize;
      weightedCurve.cltv180Grosze += c.cltv180Grosze * c.cohortSize;
      weightedCurve.cltv365Grosze += c.cltv365Grosze * c.cohortSize;
    }
    weightedCurve.cltv30Grosze = Math.round(weightedCurve.cltv30Grosze / sizeSum);
    weightedCurve.cltv60Grosze = Math.round(weightedCurve.cltv60Grosze / sizeSum);
    weightedCurve.cltv90Grosze = Math.round(weightedCurve.cltv90Grosze / sizeSum);
    weightedCurve.cltv180Grosze = Math.round(weightedCurve.cltv180Grosze / sizeSum);
    weightedCurve.cltv365Grosze = Math.round(weightedCurve.cltv365Grosze / sizeSum);
  }
  const blendedPayback = paybackFromCurve(weightedCurve, margin, blendedCac);

  return {
    generatedAt: now.toISOString(),
    blendedMarginPct: Math.round(margin * 1000) / 10,
    totals: {
      newCustomers: totalNew,
      marketingSpendGrosze: totalSpend,
      blendedCacGrosze: blendedCac,
      blendedLtvGrosze: blendedLtv,
      blendedLtvMarginGrosze: blendedLtvMargin,
      ltvCacRatio: ratio,
      paybackMonths: blendedPayback,
      hasMarketingData,
    },
    months: rows,
  };
}
