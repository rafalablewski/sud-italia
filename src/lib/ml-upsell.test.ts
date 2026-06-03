import { test } from "node:test";
import assert from "node:assert/strict";
import type { CartItem, MenuItem, Order } from "@/data/types";
import {
  sigmoid,
  fitLogistic,
  featureVector,
  buildTrainingSet,
  trainModel,
  scoreCandidates,
  predictProba,
  FEATURE_NAMES,
  MIN_TRAINING_SAMPLES,
} from "./ml-upsell";

// ─── helpers to fabricate a realistic menu + order stream ────────────────

function menuItem(id: string, category: MenuItem["category"], price: number, cost: number): MenuItem {
  return {
    id,
    name: id,
    description: "",
    price,
    cost,
    category,
    tags: [],
    available: true,
  };
}

const MENU: MenuItem[] = [
  menuItem("krk-pizza-margherita", "pizza", 3200, 1100),
  menuItem("krk-pasta-carbonara", "pasta", 3400, 1200),
  menuItem("krk-espresso", "drinks", 990, 150),
  menuItem("krk-limonata", "drinks", 1200, 400),
  menuItem("krk-tiramisu", "desserts", 1800, 600),
  menuItem("krk-garlic-bread", "antipasti", 990, 220),
];

function line(item: MenuItem, quantity = 1): CartItem {
  return { menuItem: item, quantity, locationSlug: "krakow" };
}

function order(id: string, phone: string, createdAt: string, items: CartItem[]): Order {
  return {
    id,
    locationSlug: "krakow",
    items,
    totalAmount: items.reduce((s, ci) => s + ci.menuItem.price * ci.quantity, 0),
    status: "completed",
    customerName: phone,
    customerPhone: phone,
    fulfillmentType: "takeout",
    slotId: "s1",
    slotDate: createdAt.slice(0, 10),
    slotTime: "12:00",
    createdAt,
  } as Order;
}

const pizza = MENU[0];
const espresso = MENU[2];
const tiramisu = MENU[4];

// ─── sigmoid + logistic regression core ──────────────────────────────────

test("sigmoid is centred and saturates", () => {
  assert.ok(Math.abs(sigmoid(0) - 0.5) < 1e-9);
  assert.ok(sigmoid(20) > 0.999);
  assert.ok(sigmoid(-20) < 0.001);
});

test("fitLogistic separates a linearly separable toy set", () => {
  // One feature: negatives near -1, positives near +1.
  const Xs: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < 50; i++) {
    Xs.push([-1 + (i % 5) * 0.01]);
    y.push(0);
    Xs.push([1 - (i % 5) * 0.01]);
    y.push(1);
  }
  const w = fitLogistic(Xs, y, { epochs: 800, lr: 0.5 });
  // Predict on the two cluster centres via the same z = w0 + w1*x.
  const pNeg = sigmoid(w[0] + w[1] * -1);
  const pPos = sigmoid(w[0] + w[1] * 1);
  assert.ok(pPos > 0.9, `expected pos>0.9, got ${pPos}`);
  assert.ok(pNeg < 0.1, `expected neg<0.1, got ${pNeg}`);
});

test("featureVector lays out features in the declared order + length", () => {
  const f = featureVector(espresso, {
    hour: 11,
    priorOrders: 4,
    priorAttachForItem: 3,
    globalItemAttachRate: 0.5,
    categoryHourAttach: 0.6,
  });
  assert.equal(f.length, FEATURE_NAMES.length);
  assert.ok(Math.abs(f[0] - 0.75) < 1e-9, "customerItemAttachRate = 3/4");
  assert.equal(f[1], 1, "customerHasOrderedItem");
  assert.equal(f[2], 0.5, "globalItemAttachRate");
  assert.equal(f[3], 0.6, "categoryHourAttach");
  assert.ok(f[4] > 0.8, "espresso margin ratio is high");
  assert.equal(f[6], 0, "not a new customer");
});

test("featureVector flags a brand-new customer", () => {
  const f = featureVector(espresso, {
    hour: 9,
    priorOrders: 0,
    priorAttachForItem: 0,
    globalItemAttachRate: 0.4,
    categoryHourAttach: 0.5,
  });
  assert.equal(f[0], 0, "no personal attach rate yet");
  assert.equal(f[5], 0, "log1p(0) = 0");
  assert.equal(f[6], 1, "isNewCustomer");
});

// ─── training-set construction + no leakage ──────────────────────────────

test("buildTrainingSet emits one example per (anchor order × candidate)", () => {
  const orders = [
    order("o1", "+48111", "2026-05-01T12:00:00", [line(pizza), line(espresso)]),
    order("o2", "+48222", "2026-05-02T19:00:00", [line(pizza)]),
  ];
  const { examples } = buildTrainingSet(orders, MENU);
  const candidates = MENU.filter((m) => ["drinks", "desserts", "antipasti", "panini"].includes(m.category));
  assert.equal(examples.length, 2 * candidates.length);
  // o1 attached espresso → exactly one positive among its candidate rows.
  const positives = examples.filter((e) => e.label === 1).length;
  assert.equal(positives, 1);
});

test("buildTrainingSet uses only PRIOR orders for per-customer features (no leakage)", () => {
  const phone = "+48777";
  const orders = [
    order("o1", phone, "2026-05-01T12:00:00", [line(pizza), line(espresso)]),
    order("o2", phone, "2026-05-08T12:00:00", [line(pizza), line(espresso)]),
  ];
  const { examples } = buildTrainingSet(orders, MENU);
  // The espresso example for the FIRST order must see customerItemAttachRate 0
  // (no prior history) — if it leaked the current order it would be > 0.
  const espressoIdx = FEATURE_NAMES.indexOf("customerItemAttachRate");
  const firstEspresso = examples.find((e) => e.features[espressoIdx] > 0 && e.label === 1);
  // The second order's espresso example SHOULD have prior rate 1 (attached in o1).
  assert.ok(firstEspresso, "second-order espresso carries prior attach history");
  // And there must be exactly one positive espresso example with prior rate 0
  // (the first order) — found by scanning.
  const zeroPriorPositives = examples.filter(
    (e) => e.label === 1 && e.features[espressoIdx] === 0,
  );
  assert.ok(zeroPriorPositives.length >= 1, "first order's positive has no prior history");
});

test("trainModel returns null on cold start (too few orders)", () => {
  const orders = [order("o1", "+48111", "2026-05-01T12:00:00", [line(pizza), line(espresso)])];
  assert.equal(trainModel(orders, MENU, "krakow"), null);
});

// ─── end-to-end: a learnable preference is recovered + ranked ────────────

test("trainModel learns a per-hour preference and ranks it on top", () => {
  // Synthetic regularity: mornings attach espresso, evenings attach tiramisù.
  const orders: Order[] = [];
  let t = 0;
  for (let i = 0; i < 120; i++) {
    const phone = `+48${1000 + i}`;
    // morning order → espresso
    orders.push(
      order(`m${i}`, phone, `2026-05-${String((t % 27) + 1).padStart(2, "0")}T09:30:00`, [
        line(pizza),
        line(espresso),
      ]),
    );
    // evening order → tiramisù
    orders.push(
      order(`e${i}`, phone, `2026-05-${String((t % 27) + 1).padStart(2, "0")}T20:30:00`, [
        line(pizza),
        line(tiramisu),
      ]),
    );
    t++;
  }
  const model = trainModel(orders, MENU, "krakow");
  assert.ok(model, "enough samples to train");
  assert.ok(model!.sampleCount >= MIN_TRAINING_SAMPLES);
  assert.ok(model!.logLoss > 0 && Number.isFinite(model!.logLoss));

  const candidates = MENU.filter((m) => m.id !== pizza.id);
  // Morning: espresso should outrank tiramisù.
  const morning = scoreCandidates(model!, candidates, {
    hour: 9,
    customerOrderCount: 0,
    customerAttachByItemId: {},
  });
  const espRank = morning.findIndex((c) => c.itemId === espresso.id);
  const tirRank = morning.findIndex((c) => c.itemId === tiramisu.id);
  assert.ok(espRank < tirRank, `espresso should outrank tiramisù in the morning (esp@${espRank}, tir@${tirRank})`);

  // Evening: tiramisù should outrank espresso.
  const evening = scoreCandidates(model!, candidates, {
    hour: 20,
    customerOrderCount: 0,
    customerAttachByItemId: {},
  });
  const espRankPm = evening.findIndex((c) => c.itemId === espresso.id);
  const tirRankPm = evening.findIndex((c) => c.itemId === tiramisu.id);
  assert.ok(tirRankPm < espRankPm, "tiramisù should outrank espresso in the evening");
});

test("scoreCandidates personalises: a regular espresso buyer gets espresso lifted", () => {
  // Customers with REPEAT orders + consistent habits, so the prior-attach
  // feature carries signal: half always pair espresso, half always tiramisù.
  const orders: Order[] = [];
  for (let c = 0; c < 40; c++) {
    const phone = `+48${2000 + c}`;
    const attaches = c % 2 === 0 ? espresso : tiramisu;
    for (let k = 0; k < 5; k++) {
      const day = String((c % 25) + 1).padStart(2, "0");
      orders.push(
        order(`a${c}-${k}`, phone, `2026-05-${day}T13:0${k}:00`, [line(pizza), line(attaches)]),
      );
    }
  }
  const model = trainModel(orders, MENU, "krakow");
  assert.ok(model);
  const pBase = predictProba(
    model!,
    featureVector(espresso, {
      hour: 13,
      priorOrders: 4,
      priorAttachForItem: 0,
      globalItemAttachRate: model!.globalItemAttachRate[espresso.id] ?? 0,
      categoryHourAttach: model!.categoryHourAttach[espresso.category]?.[13] ?? 0,
    }),
  );
  const pLoyal = predictProba(
    model!,
    featureVector(espresso, {
      hour: 13,
      priorOrders: 4,
      priorAttachForItem: 4, // attached every prior visit
      globalItemAttachRate: model!.globalItemAttachRate[espresso.id] ?? 0,
      categoryHourAttach: model!.categoryHourAttach[espresso.category]?.[13] ?? 0,
    }),
  );
  assert.ok(pLoyal > pBase, `a habitual espresso buyer should score higher (${pLoyal} vs ${pBase})`);
});
