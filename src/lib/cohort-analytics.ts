import type { Order } from "@/data/types";

/**
 * Audit §2 "Defensibility — no data moat" + §10 "Top features elite
 * competitors would already have, #3 CLTV + CAC + cohort retention".
 *
 * A cohort is the set of customers whose first paid order landed in a
 * given month. Retention = (customers from cohort C who reordered in
 * month M) / (cohort size at month 0). CLTV is the running sum of net
 * revenue per cohort customer through month N.
 *
 * Everything here is a pure function over the orders list — keeps the
 * report deterministic, testable, and trivially serializable to JSON.
 * The cron in /api/admin/cron/customer-segments-rebuild reuses this
 * helper to score per-customer segments.
 */

export interface CohortRow {
  cohortMonth: string; // "YYYY-MM"
  cohortSize: number;
  newCustomerRevenueGrosze: number;
  /** Index 0 = cohort month itself. Length = up to (today - cohortMonth) + 1 in months. */
  retention: { monthOffset: number; retained: number; revenueGrosze: number }[];
}

export interface CltvSummary {
  cohortMonth: string;
  cohortSize: number;
  cltv30Grosze: number;
  cltv60Grosze: number;
  cltv90Grosze: number;
  cltv180Grosze: number;
  cltv365Grosze: number;
}

export interface CohortReport {
  generatedAt: string;
  cohortsByMonth: CohortRow[];
  cltv: CltvSummary[];
  totals: {
    customers: number;
    repeatCustomers: number;
    repeatRatePct: number;
    avgOrdersPerCustomer: number;
    medianGrossePerCustomer: number;
  };
}

function ymd(iso: string): string {
  return iso.slice(0, 10);
}

function ym(iso: string): string {
  return iso.slice(0, 7);
}

function monthsBetween(fromYm: string, toYm: string): number {
  const [fy, fm] = fromYm.split("-").map(Number);
  const [ty, tm] = toYm.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.floor(
    (new Date(toIso).getTime() - new Date(fromIso).getTime()) /
      (24 * 60 * 60 * 1000),
  );
}

export function buildCohortReport(orders: Order[], now: Date = new Date()): CohortReport {
  // Treat only paid (non-pending, non-cancelled) orders as cohort signal.
  // Cancellations and abandoned checkouts shouldn't pollute retention math.
  const paid = orders.filter(
    (o) => o.status !== "pending" && o.status !== "cancelled" && o.customerPhone,
  );

  // Group by phone. Earliest paid order = cohort anchor.
  const byPhone = new Map<string, Order[]>();
  for (const o of paid) {
    const arr = byPhone.get(o.customerPhone) ?? [];
    arr.push(o);
    byPhone.set(o.customerPhone, arr);
  }
  for (const arr of byPhone.values()) {
    arr.sort((a, b) =>
      (a.paidAt || a.createdAt).localeCompare(b.paidAt || b.createdAt),
    );
  }

  // Build cohort buckets.
  const cohortBuckets = new Map<
    string,
    { phones: Set<string>; ordersByMonth: Map<number, { count: number; revenue: number }> }
  >();
  const cltvBuckets = new Map<
    string,
    { phones: Set<string>; revenueBuckets: { d30: number; d60: number; d90: number; d180: number; d365: number } }
  >();

  const nowYm = ym(now.toISOString());

  for (const [phone, customerOrders] of byPhone) {
    const first = customerOrders[0];
    const firstAt = first.paidAt || first.createdAt;
    const cohortMonth = ym(firstAt);

    const bucket =
      cohortBuckets.get(cohortMonth) ??
      cohortBuckets.set(cohortMonth, {
        phones: new Set(),
        ordersByMonth: new Map(),
      }).get(cohortMonth)!;
    bucket.phones.add(phone);

    const cltvBucket =
      cltvBuckets.get(cohortMonth) ??
      cltvBuckets.set(cohortMonth, {
        phones: new Set(),
        revenueBuckets: { d30: 0, d60: 0, d90: 0, d180: 0, d365: 0 },
      }).get(cohortMonth)!;
    cltvBucket.phones.add(phone);

    // Track retention by months-from-cohort. Net revenue per cohort month.
    const seenMonths = new Set<number>();
    for (const o of customerOrders) {
      const at = o.paidAt || o.createdAt;
      const offset = monthsBetween(cohortMonth, ym(at));
      if (!seenMonths.has(offset)) seenMonths.add(offset); // dedupe "retained" within a month
      const slot =
        bucket.ordersByMonth.get(offset) ??
        bucket.ordersByMonth.set(offset, { count: 0, revenue: 0 }).get(offset)!;
      slot.revenue += o.totalAmount;
      // count = repeat order indicator — we only set "retained" once per month,
      // so increment 1 per (phone, month) pair.
      // Use a side set keyed (offset, phone) to dedupe across multiple orders
      // by the same customer in the same month.
      slot.count += 0; // placeholder; recomputed below

      // CLTV day buckets.
      const days = daysBetween(firstAt, at);
      if (days <= 30) cltvBucket.revenueBuckets.d30 += o.totalAmount;
      if (days <= 60) cltvBucket.revenueBuckets.d60 += o.totalAmount;
      if (days <= 90) cltvBucket.revenueBuckets.d90 += o.totalAmount;
      if (days <= 180) cltvBucket.revenueBuckets.d180 += o.totalAmount;
      if (days <= 365) cltvBucket.revenueBuckets.d365 += o.totalAmount;
    }

    // Recompute "retained" as the count of distinct cohort months the customer
    // showed up in (per offset bucket: count = 1 if they ordered in that month).
    const offsetsThisCustomer = new Set<number>();
    for (const o of customerOrders) {
      const offset = monthsBetween(cohortMonth, ym(o.paidAt || o.createdAt));
      offsetsThisCustomer.add(offset);
    }
    for (const offset of offsetsThisCustomer) {
      const slot = bucket.ordersByMonth.get(offset)!;
      slot.count += 1;
    }
  }

  // Materialize cohorts in chronological order. Trim to last 18 months for
  // the dashboard so the matrix stays viewable; full history is in /api/admin/reports/cohort.
  const cohortMonths = Array.from(cohortBuckets.keys()).sort();
  const cohortsByMonth: CohortRow[] = cohortMonths.map((cohortMonth) => {
    const b = cohortBuckets.get(cohortMonth)!;
    const horizon = monthsBetween(cohortMonth, nowYm);
    const retention: CohortRow["retention"] = [];
    for (let i = 0; i <= horizon; i++) {
      const slot = b.ordersByMonth.get(i);
      retention.push({
        monthOffset: i,
        retained: slot?.count ?? 0,
        revenueGrosze: slot?.revenue ?? 0,
      });
    }
    return {
      cohortMonth,
      cohortSize: b.phones.size,
      newCustomerRevenueGrosze: retention[0]?.revenueGrosze ?? 0,
      retention,
    };
  });

  const cltv: CltvSummary[] = cohortMonths.map((cohortMonth) => {
    const b = cltvBuckets.get(cohortMonth)!;
    const size = Math.max(1, b.phones.size);
    return {
      cohortMonth,
      cohortSize: b.phones.size,
      cltv30Grosze: Math.round(b.revenueBuckets.d30 / size),
      cltv60Grosze: Math.round(b.revenueBuckets.d60 / size),
      cltv90Grosze: Math.round(b.revenueBuckets.d90 / size),
      cltv180Grosze: Math.round(b.revenueBuckets.d180 / size),
      cltv365Grosze: Math.round(b.revenueBuckets.d365 / size),
    };
  });

  // Totals.
  const customers = byPhone.size;
  let repeatCustomers = 0;
  let totalOrders = 0;
  const spendByPhone: number[] = [];
  for (const arr of byPhone.values()) {
    if (arr.length >= 2) repeatCustomers++;
    totalOrders += arr.length;
    spendByPhone.push(arr.reduce((s, o) => s + o.totalAmount, 0));
  }
  spendByPhone.sort((a, b) => a - b);
  const medianGrosze =
    spendByPhone.length === 0
      ? 0
      : spendByPhone.length % 2 === 1
        ? spendByPhone[(spendByPhone.length - 1) / 2]
        : Math.round(
            (spendByPhone[spendByPhone.length / 2 - 1] +
              spendByPhone[spendByPhone.length / 2]) /
              2,
          );

  return {
    generatedAt: now.toISOString(),
    cohortsByMonth,
    cltv,
    totals: {
      customers,
      repeatCustomers,
      repeatRatePct: customers > 0 ? Math.round((repeatCustomers / customers) * 1000) / 10 : 0,
      avgOrdersPerCustomer:
        customers > 0 ? Math.round((totalOrders / customers) * 100) / 100 : 0,
      medianGrossePerCustomer: medianGrosze,
    },
  };
}

// Re-export to keep imports honest if a caller only wants the date helpers.
export { ymd as _ymd, ym as _ym };
