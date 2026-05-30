import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCohortReport } from "./cohort-analytics";
import type { Order } from "@/data/types";

// Run with:  npx tsx --test src/lib/cohort-analytics.test.ts
//
// The audit (§11.3) asks for a cohort retention curve + CLTV. This engine
// feeds both the /admin/reports/cohort board and the new LTV/CAC surface, so
// the retention matrix, CLTV horizons, and repeat-rate totals are pinned here.

const order = (
  phone: string,
  createdAt: string,
  totalAmount: number,
  status: Order["status"] = "completed",
): Order =>
  ({
    id: `o-${phone}-${createdAt}`,
    locationSlug: "krakow",
    customerPhone: phone,
    totalAmount,
    status,
    createdAt,
  }) as Order;

const now = new Date("2026-03-15T00:00:00.000Z");

// Cohort: A and B both first-order in Jan 2026. A reorders in Feb. B never
// returns. A pending + a cancelled order are noise that must be excluded.
const orders: Order[] = [
  order("+48111", "2026-01-10T12:00:00.000Z", 2000), // A first
  order("+48111", "2026-02-20T12:00:00.000Z", 3000), // A reorder (41 days out)
  order("+48222", "2026-01-20T12:00:00.000Z", 5000), // B first, never returns
  order("+48333", "2026-01-25T12:00:00.000Z", 9999, "pending"), // excluded
  order("+48111", "2026-03-01T12:00:00.000Z", 9999, "cancelled"), // excluded
];

test("only paid orders with a phone count toward cohorts", () => {
  const r = buildCohortReport(orders, now);
  assert.equal(r.totals.customers, 2); // A + B, not the pending-only C
});

test("retention matrix tracks distinct active months per cohort offset", () => {
  const r = buildCohortReport(orders, now);
  const jan = r.cohortsByMonth.find((c) => c.cohortMonth === "2026-01");
  assert.ok(jan, "January cohort should exist");
  assert.equal(jan!.cohortSize, 2);
  // Offset 0 = January: both A and B active, revenue 2000 + 5000.
  assert.equal(jan!.retention[0].retained, 2);
  assert.equal(jan!.retention[0].revenueGrosze, 7000);
  // Offset 1 = February: only A returns.
  assert.equal(jan!.retention[1].retained, 1);
  assert.equal(jan!.retention[1].revenueGrosze, 3000);
  // Offset 2 = March: nobody from the cohort ordered (cancelled order excluded).
  assert.equal(jan!.retention[2].retained, 0);
  // Horizon = months from cohort to `now` → offsets 0,1,2.
  assert.equal(jan!.retention.length, 3);
});

test("CLTV accumulates per-customer revenue across day horizons", () => {
  const r = buildCohortReport(orders, now);
  const jan = r.cltv.find((c) => c.cohortMonth === "2026-01");
  assert.ok(jan);
  // d30: A has only the 2000 first order within 30d; B has 5000 → (2000+5000)/2.
  assert.equal(jan!.cltv30Grosze, 3500);
  // d60+: A's 3000 reorder (41 days) now counts → (5000+5000)/2 = 5000.
  assert.equal(jan!.cltv60Grosze, 5000);
  assert.equal(jan!.cltv90Grosze, 5000);
});

test("totals compute repeat rate and average orders per customer", () => {
  const r = buildCohortReport(orders, now);
  assert.equal(r.totals.repeatCustomers, 1); // only A ordered twice
  assert.equal(r.totals.repeatRatePct, 50); // 1 of 2
  assert.equal(r.totals.avgOrdersPerCustomer, 1.5); // 3 paid orders / 2 customers
  assert.equal(r.totals.medianGrossePerCustomer, 5000); // A=5000, B=5000
});

test("an empty order list produces a zeroed report, never throws", () => {
  const r = buildCohortReport([], now);
  assert.equal(r.totals.customers, 0);
  assert.equal(r.totals.repeatRatePct, 0);
  assert.equal(r.cohortsByMonth.length, 0);
  assert.equal(r.cltv.length, 0);
});
