import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLtvCacReport,
  marketingSpendByMonth,
  type MarketingCostInput,
} from "./ltv-cac";
import type { Order } from "@/data/types";

// Run with:  npx tsx --test src/lib/ltv-cac.test.ts
//
// Pins the acquisition-economics math the audit (§11.3) called out as missing:
// CAC from real marketing-ledger spend, blended gross margin from order line
// items, and the LTV:CAC ratio + payback derived from the cohort CLTV curve.

const order = (phone: string, createdAt: string, price: number, cost: number): Order =>
  ({
    id: `o-${phone}-${createdAt}`,
    locationSlug: "krakow",
    customerPhone: phone,
    status: "completed",
    createdAt,
    totalAmount: price,
    items: [{ menuItem: { id: "krk-pizza-margherita", price, cost, category: "pizza" }, quantity: 1 }],
  }) as unknown as Order;

const now = new Date("2026-06-15T00:00:00.000Z");

// Two customers, both first-order Jan 2026, one pizza each (price 2500, cost
// 800 → 68% margin). 10 PLN/mo marketing spend recurring from Jan.
const orders: Order[] = [
  order("+48111", "2026-01-10T12:00:00.000Z", 2500, 800),
  order("+48222", "2026-01-20T12:00:00.000Z", 2500, 800),
];
const marketing: MarketingCostInput[] = [
  { amountGrosze: 1000, frequency: "monthly", startDate: "2026-01-01" },
];

test("blended gross margin is derived from real line-item price/cost", () => {
  const r = buildLtvCacReport(orders, marketing, now);
  assert.equal(r.blendedMarginPct, 68); // (2500-800)/2500
});

test("CAC = marketing spend that month / new customers acquired", () => {
  const r = buildLtvCacReport(orders, marketing, now);
  const jan = r.months.find((m) => m.cohortMonth === "2026-01")!;
  assert.equal(jan.newCustomers, 2);
  assert.equal(jan.marketingSpendGrosze, 1000);
  assert.equal(jan.cacGrosze, 500); // 1000 / 2
});

test("LTV:CAC ratio uses margin-adjusted CLTV over CAC", () => {
  const r = buildLtvCacReport(orders, marketing, now);
  // ltv365 = 2500 revenue/customer; margin LTV = 2500 * 0.68 = 1700; / 500 = 3.4.
  assert.equal(r.totals.blendedLtvGrosze, 2500);
  assert.equal(r.totals.blendedLtvMarginGrosze, 1700);
  assert.equal(r.totals.blendedCacGrosze, 500);
  assert.equal(r.totals.ltvCacRatio, 3.4);
  // Margin CLTV clears CAC by the first horizon → 1-month payback.
  assert.equal(r.totals.paybackMonths, 1);
});

test("with no marketing logged, CAC/ratio are null (no fabricated number)", () => {
  const r = buildLtvCacReport(orders, [], now);
  assert.equal(r.totals.hasMarketingData, false);
  assert.equal(r.totals.blendedCacGrosze, null);
  assert.equal(r.totals.ltvCacRatio, null);
  assert.equal(r.totals.paybackMonths, null);
  // LTV is still computed from real orders.
  assert.equal(r.totals.blendedLtvGrosze, 2500);
});

test("marketingSpendByMonth: one-off lands in its month, recurring fills the window", () => {
  const months = ["2026-01", "2026-02", "2026-03"];
  const spend = marketingSpendByMonth(
    [
      { amountGrosze: 5000, frequency: "one-off", startDate: "2026-02-14" },
      { amountGrosze: 900, frequency: "monthly", startDate: "2026-01-01", endDate: "2026-02-28" },
    ],
    months,
  );
  assert.equal(spend["2026-01"], 900); // recurring only
  assert.equal(spend["2026-02"], 900 + 5000); // recurring + one-off
  assert.equal(spend["2026-03"], 0); // recurring ended Feb, no one-off
});

test("CAC is null (not 0) for a cohort month with customers but no attributed spend", () => {
  // Marketing only starts in February, but the January cohort still has
  // customers. January CAC must read "unknown" (null → "—"), never a
  // fabricated 0 that implies free acquisition.
  const mixed: Order[] = [
    order("+48111", "2026-01-10T12:00:00.000Z", 2500, 800), // Jan cohort
    order("+48222", "2026-02-10T12:00:00.000Z", 2500, 800), // Feb cohort
  ];
  const febOnly: MarketingCostInput[] = [
    { amountGrosze: 1000, frequency: "monthly", startDate: "2026-02-01" },
  ];
  const r = buildLtvCacReport(mixed, febOnly, now);
  const jan = r.months.find((m) => m.cohortMonth === "2026-01")!;
  const feb = r.months.find((m) => m.cohortMonth === "2026-02")!;
  assert.equal(jan.marketingSpendGrosze, 0);
  assert.equal(jan.cacGrosze, null); // unknown, not 0
  assert.equal(jan.ltvCacRatio, null);
  assert.equal(jan.paybackMonths, null);
  assert.equal(feb.cacGrosze, 1000); // 1000 / 1 new customer
});

test("an empty order list yields a zeroed, non-throwing report", () => {
  const r = buildLtvCacReport([], marketing, now);
  assert.equal(r.totals.newCustomers, 0);
  assert.equal(r.totals.blendedLtvGrosze, 0);
  assert.equal(r.months.length, 0);
});
