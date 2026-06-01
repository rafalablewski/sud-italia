import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCustomerIntelligence,
  type IntelOrder,
} from "./customer-intelligence";
import type { MenuCategory } from "@/data/types";

// Run with:  npx tsx --test src/lib/customer-intelligence.test.ts

function ord(p: {
  phone?: string;
  at: string; // ISO instant (paidAt)
  items: [string, MenuCategory, number][]; // [name, category, qty]
  total?: number;
  fulfillment?: IntelOrder["fulfillmentType"];
  party?: number;
  status?: IntelOrder["status"];
  simulated?: boolean;
}): IntelOrder {
  return {
    customerPhone: p.phone ?? "+48500100100",
    items: p.items.map(([name, category, quantity]) => ({ menuItem: { name, category }, quantity })),
    totalAmount: p.total ?? 5000,
    status: p.status ?? "completed",
    fulfillmentType: p.fulfillment ?? "takeout",
    partySize: p.party,
    createdAt: p.at,
    paidAt: p.at,
    simulated: p.simulated,
  };
}

// A "Friday ~18:30" regular: 6 Fridays of pizza + tiramisù, every 7 days.
function fridayRegular(): IntelOrder[] {
  const out: IntelOrder[] = [];
  // 2025-05-02 is a Friday; 18:30 Warsaw (UTC+2 summer) = 16:30 UTC.
  for (let w = 0; w < 6; w++) {
    const day = 2 + w * 7; // 2,9,16,23,30 May then 6 Jun
    const date = day <= 30 ? `2025-05-${String(day).padStart(2, "0")}` : `2025-06-${String(day - 31).padStart(2, "0")}`;
    out.push(
      ord({
        at: `${date}T16:30:00.000Z`,
        items: [["Margherita", "pizza", 1], ["Tiramisù", "desserts", 1]],
      }),
    );
  }
  return out;
}

test("empty history → safe empty profile, low confidence", () => {
  const ci = buildCustomerIntelligence("+48500100100", [], { now: new Date("2025-06-15T12:00:00Z") });
  assert.equal(ci.orderCount, 0);
  assert.equal(ci.confidence, "low");
  assert.equal(ci.topCategory, null);
  assert.equal(ci.nextOrder.items.length, 0);
});

test("only pending/cancelled/simulated orders do not count", () => {
  const orders: IntelOrder[] = [
    ord({ at: "2025-05-02T16:30:00Z", items: [["Margherita", "pizza", 1]], status: "pending" }),
    ord({ at: "2025-05-03T16:30:00Z", items: [["Margherita", "pizza", 1]], status: "cancelled" }),
    ord({ at: "2025-05-04T16:30:00Z", items: [["Margherita", "pizza", 1]], simulated: true }),
  ];
  const ci = buildCustomerIntelligence("+48500100100", orders, { now: new Date("2025-06-15T12:00:00Z") });
  assert.equal(ci.orderCount, 0);
});

test("filters by phone — other customers' orders ignored", () => {
  const orders = [
    ...fridayRegular(),
    ord({ phone: "+48999999999", at: "2025-05-02T10:00:00Z", items: [["Carbonara", "pasta", 5]] }),
  ];
  const ci = buildCustomerIntelligence("+48500100100", orders, { now: new Date("2025-06-08T12:00:00Z") });
  assert.equal(ci.orderCount, 6);
  assert.equal(ci.topItems.find((t) => t.name === "Carbonara"), undefined);
});

test("dish affinity ranks by units and computes share", () => {
  const ci = buildCustomerIntelligence("+48500100100", fridayRegular(), {
    now: new Date("2025-06-08T12:00:00Z"),
  });
  assert.equal(ci.topItems[0].name, "Margherita");
  assert.equal(ci.topCategory, "pizza");
  // 6 Margherita + 6 Tiramisù = 12 units → each 0.5 share
  assert.ok(Math.abs(ci.topItems[0].share - 0.5) < 1e-9);
});

test("temporal signature detects the Friday ~18:30 pattern in Warsaw time", () => {
  const ci = buildCustomerIntelligence("+48500100100", fridayRegular(), {
    now: new Date("2025-06-08T12:00:00Z"),
  });
  assert.equal(ci.temporal.topDayOfWeek, 5); // Friday
  assert.equal(ci.temporal.topHour, 18); // 16:30 UTC → 18:30 Warsaw
  assert.match(ci.temporal.label ?? "", /Fri ~18:30/);
  assert.ok(ci.temporal.concentration > 0.99);
});

test("cadence → ~7-day median and a predicted next visit", () => {
  const ci = buildCustomerIntelligence("+48500100100", fridayRegular(), {
    now: new Date("2025-06-09T12:00:00Z"),
  });
  assert.ok(ci.cadence.medianIntervalDays !== null);
  assert.ok(Math.abs((ci.cadence.medianIntervalDays as number) - 7) < 0.01);
  assert.ok(ci.cadence.predictedNextAt !== null);
  // last order 2025-06-06 + 7d ≈ 2025-06-13
  assert.match(ci.cadence.predictedNextAt as string, /2025-06-13/);
});

test("churn: on-cadence regular is low risk; long silence is lost", () => {
  const onCadence = buildCustomerIntelligence("+48500100100", fridayRegular(), {
    now: new Date("2025-06-09T12:00:00Z"), // 3d after last, median 7
  });
  assert.equal(onCadence.churn.risk, "low");

  const lapsed = buildCustomerIntelligence("+48500100100", fridayRegular(), {
    now: new Date("2025-10-01T12:00:00Z"), // ~117d after last
  });
  assert.equal(lapsed.churn.risk, "lost");
  assert.ok(lapsed.churn.hazard >= 0.9);
});

test("attach rule: tiramisù attaches when party ≥ 4 (dine-in)", () => {
  const orders: IntelOrder[] = [
    // small solo orders — pizza only, no dessert
    ord({ at: "2025-05-01T16:00:00Z", items: [["Margherita", "pizza", 1]], fulfillment: "dine-in", party: 2 }),
    ord({ at: "2025-05-08T16:00:00Z", items: [["Margherita", "pizza", 1]], fulfillment: "dine-in", party: 2 }),
    ord({ at: "2025-05-15T16:00:00Z", items: [["Margherita", "pizza", 1]], fulfillment: "dine-in", party: 1 }),
    // big-party orders — always add tiramisù
    ord({ at: "2025-05-22T16:00:00Z", items: [["Margherita", "pizza", 2], ["Tiramisù", "desserts", 2]], fulfillment: "dine-in", party: 4 }),
    ord({ at: "2025-05-29T16:00:00Z", items: [["Margherita", "pizza", 2], ["Tiramisù", "desserts", 2]], fulfillment: "dine-in", party: 5 }),
  ];
  const ci = buildCustomerIntelligence("+48500100100", orders, { now: new Date("2025-06-01T12:00:00Z") });
  const rule = ci.attachRules.find((r) => r.item === "Tiramisù" && r.trigger === "party ≥ 4");
  assert.ok(rule, "expected a party≥4 → Tiramisù attach rule");
  assert.ok((rule as { lift: number }).lift > 1.3);
  assert.equal(ci.party.max, 5);
});

test("next-order headline names dishes, day and attach", () => {
  const orders: IntelOrder[] = [
    ...fridayRegular(),
    // add two big-party Fridays so the attach rule fires too
    ord({ at: "2025-06-13T16:30:00Z", items: [["Margherita", "pizza", 2], ["Tiramisù", "desserts", 2]], fulfillment: "dine-in", party: 4 }),
    ord({ at: "2025-06-20T16:30:00Z", items: [["Margherita", "pizza", 2], ["Tiramisù", "desserts", 2]], fulfillment: "dine-in", party: 4 }),
  ];
  const ci = buildCustomerIntelligence("+48500100100", orders, { now: new Date("2025-06-22T12:00:00Z") });
  assert.match(ci.nextOrder.headline, /Margherita/);
  assert.match(ci.nextOrder.headline, /Friday/);
  assert.equal(ci.confidence, "high");
});

test("channel mix + preferred channel + AOV", () => {
  const orders: IntelOrder[] = [
    ord({ at: "2025-05-02T16:00:00Z", items: [["Margherita", "pizza", 1]], fulfillment: "delivery", total: 6000 }),
    ord({ at: "2025-05-09T16:00:00Z", items: [["Margherita", "pizza", 1]], fulfillment: "delivery", total: 4000 }),
    ord({ at: "2025-05-16T16:00:00Z", items: [["Margherita", "pizza", 1]], fulfillment: "takeout", total: 5000 }),
  ];
  const ci = buildCustomerIntelligence("+48500100100", orders, { now: new Date("2025-05-20T12:00:00Z") });
  assert.equal(ci.preferredChannel, "delivery");
  assert.equal(ci.avgOrderValueGrosze, 5000);
});
