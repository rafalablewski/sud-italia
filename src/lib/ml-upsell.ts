import type { CartItem, MenuCategory, MenuItem, Order } from "@/data/types";

/**
 * Per-customer upsell scoring — a logistic-regression ranker trained on
 * real order history (audit elite-qsr §1, ⭐⭐⭐). Replaces the static
 * 4-slot cross-sell panel's ordering with a per-customer × per-cart ×
 * per-hour predicted attach probability, ranked by expected contribution
 * (margin × P(attach)).
 *
 * Everything here is learned from actual orders — there are no hardcoded
 * category weights or hand-tuned hour curves (CLAUDE Rule #1). The model
 * persists the aggregates it needs at inference time (global + per-hour
 * attach rates) alongside the fitted weights + feature scaler, so scoring
 * is a pure function of (model, candidate, customer-context).
 *
 * Pure module (no I/O) so it trains in an admin route, scores in an
 * inference route, and runs under `node --test`. The store layer owns
 * persistence; the A/B harness owns rollout.
 */

/** Cart mains that make a cart "attach-eligible" (a meal to pair with). */
export const ANCHOR_CATEGORIES: MenuCategory[] = ["pizza", "pasta"];
/** Candidate categories the ranker scores as attach suggestions. */
export const ATTACH_CATEGORIES: MenuCategory[] = ["drinks", "desserts", "antipasti", "panini"];

/** Feature names, in the exact order the weight vector expects (after the
 *  bias term, which is weights[0]). Persisted with the model so a future
 *  feature change can't silently misalign weights ↔ inputs. */
export const FEATURE_NAMES = [
  "customerItemAttachRate",
  "customerHasOrderedItem",
  "globalItemAttachRate",
  "categoryHourAttach",
  "itemMarginRatio",
  "logCustomerOrderCount",
  "isNewCustomer",
] as const;

export interface MLUpsellModel {
  version: 1;
  trainedAt: string;
  locationSlug: string | null;
  featureNames: string[];
  /** length = featureNames.length + 1; weights[0] is the bias/intercept. */
  weights: number[];
  /** Per-feature standardisation (z-score) computed at train time and
   *  re-applied at inference so the scorer sees the same distribution. */
  mean: number[];
  std: number[];
  sampleCount: number;
  positiveRate: number;
  logLoss: number;
  /** itemId → fraction of anchor orders that attached it (inference feature). */
  globalItemAttachRate: Record<string, number>;
  /** category → 24 hourly attach rates (inference feature). */
  categoryHourAttach: Record<string, number[]>;
}

/** Context for scoring one customer's cart at one moment — the same shape
 *  the cart drawer already assembles for the rules ranker. */
export interface MLScoreContext {
  hour: number;
  customerOrderCount: number;
  customerAttachByItemId: Record<string, number>;
}

export interface ScoredCandidate {
  itemId: string;
  pAttach: number;
  /** P(attach) × per-unit margin in grosze — the ranking key. */
  expectedContributionGrosze: number;
}

// ─── Math primitives ──────────────────────────────────────────────────────

export function sigmoid(z: number): number {
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

function marginRatio(item: Pick<MenuItem, "price" | "cost">): number {
  if (!item.price || item.price <= 0) return 0;
  return clamp01((item.price - (item.cost ?? 0)) / item.price);
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function hasAnchor(items: CartItem[]): boolean {
  return items.some((ci) => ci.menuItem && ANCHOR_CATEGORIES.includes(ci.menuItem.category));
}

function isAttachCandidate(item: MenuItem): boolean {
  return ATTACH_CATEGORIES.includes(item.category) && item.menuRole !== "anchor";
}

// ─── Feature vector ─────────────────────────────────────────────────────

/**
 * Raw (un-standardised) feature vector for one (candidate × customer-
 * context) pair, in FEATURE_NAMES order. `priorAttach` / `priorOrders`
 * are the customer's history BEFORE the order in question (training) or
 * their full history (inference) — the caller controls leakage.
 */
export function featureVector(
  item: MenuItem,
  ctx: {
    hour: number;
    priorOrders: number;
    priorAttachForItem: number;
    globalItemAttachRate: number;
    categoryHourAttach: number;
  },
): number[] {
  const customerItemAttachRate = ctx.priorOrders > 0 ? ctx.priorAttachForItem / ctx.priorOrders : 0;
  return [
    customerItemAttachRate,
    ctx.priorAttachForItem > 0 ? 1 : 0,
    ctx.globalItemAttachRate,
    ctx.categoryHourAttach,
    marginRatio(item),
    Math.log1p(ctx.priorOrders),
    ctx.priorOrders === 0 ? 1 : 0,
  ];
}

// ─── Training-set construction (leakage-controlled) ──────────────────────

interface TrainingExample {
  features: number[];
  label: number;
}

interface TrainingAggregates {
  globalItemAttachRate: Record<string, number>;
  categoryHourAttach: Record<string, number[]>;
}

/** Hour (0–23) from an ISO timestamp in the server's local zone — matches
 *  how the cart reads `new Date().getHours()` at inference. */
function hourOf(iso: string): number {
  const h = new Date(iso).getHours();
  return Number.isFinite(h) ? h : 12;
}

/**
 * Global + per-category-hour attach rates over all anchor orders. These
 * are aggregate priors (mild, standard aggregate leakage); the per-
 * customer features below are the leakage-sensitive ones and use prior
 * orders only.
 */
function computeAggregates(anchorOrders: Order[], menuItems: MenuItem[]): TrainingAggregates {
  const candidates = menuItems.filter(isAttachCandidate);
  const itemAttachCount: Record<string, number> = {};
  for (const c of candidates) itemAttachCount[c.id] = 0;

  // category → [attachCount per hour, anchorOrderCount per hour]
  const catHourAttach: Record<string, number[]> = {};
  const catHourTotal: Record<string, number[]> = {};
  for (const cat of ATTACH_CATEGORIES) {
    catHourAttach[cat] = new Array(24).fill(0);
    catHourTotal[cat] = new Array(24).fill(0);
  }

  for (const order of anchorOrders) {
    const hour = hourOf(order.createdAt);
    const present = new Set(
      order.items.map((ci) => ci.menuItem?.id).filter((id): id is string => !!id),
    );
    const presentCats = new Set(
      order.items.map((ci) => ci.menuItem?.category).filter((c): c is MenuCategory => !!c),
    );
    for (const c of candidates) {
      if (present.has(c.id)) itemAttachCount[c.id] += 1;
    }
    for (const cat of ATTACH_CATEGORIES) {
      catHourTotal[cat][hour] += 1;
      if (presentCats.has(cat)) catHourAttach[cat][hour] += 1;
    }
  }

  const n = anchorOrders.length || 1;
  const globalItemAttachRate: Record<string, number> = {};
  for (const c of candidates) globalItemAttachRate[c.id] = itemAttachCount[c.id] / n;

  const categoryHourAttach: Record<string, number[]> = {};
  for (const cat of ATTACH_CATEGORIES) {
    categoryHourAttach[cat] = catHourAttach[cat].map((a, h) =>
      catHourTotal[cat][h] > 0 ? a / catHourTotal[cat][h] : 0,
    );
  }

  return { globalItemAttachRate, categoryHourAttach };
}

/**
 * Build (features, label) examples from real orders. For every anchor
 * order, each attach candidate becomes one example labelled 1 if the
 * order included it. Per-customer features use only that customer's
 * orders strictly BEFORE the current one (orders processed in createdAt
 * order, history updated after each), so the model can't peek at the
 * outcome it's predicting.
 */
export function buildTrainingSet(
  orders: Order[],
  menuItems: MenuItem[],
): { examples: TrainingExample[]; aggregates: TrainingAggregates } {
  const candidates = menuItems.filter(isAttachCandidate);
  const sorted = orders
    .filter((o) => hasAnchor(o.items))
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const aggregates = computeAggregates(sorted, menuItems);

  // Running per-customer history (prior orders only).
  const priorOrders: Record<string, number> = {};
  const priorAttach: Record<string, Record<string, number>> = {};

  const examples: TrainingExample[] = [];
  for (const order of sorted) {
    const phone = order.customerPhone || "anon";
    const hour = hourOf(order.createdAt);
    const present = new Set(
      order.items.map((ci) => ci.menuItem?.id).filter((id): id is string => !!id),
    );
    const pOrders = priorOrders[phone] ?? 0;
    const pAttach = priorAttach[phone] ?? {};

    for (const item of candidates) {
      const features = featureVector(item, {
        hour,
        priorOrders: pOrders,
        priorAttachForItem: pAttach[item.id] ?? 0,
        globalItemAttachRate: aggregates.globalItemAttachRate[item.id] ?? 0,
        categoryHourAttach: aggregates.categoryHourAttach[item.category]?.[hour] ?? 0,
      });
      examples.push({ features, label: present.has(item.id) ? 1 : 0 });
    }

    // Update history AFTER emitting this order's examples.
    priorOrders[phone] = pOrders + 1;
    const nextAttach = { ...pAttach };
    for (const id of present) nextAttach[id] = (nextAttach[id] ?? 0) + 1;
    priorAttach[phone] = nextAttach;
  }

  return { examples, aggregates };
}

// ─── Logistic regression ─────────────────────────────────────────────────

export interface TrainOpts {
  lr?: number;
  epochs?: number;
  l2?: number;
}

function standardize(
  X: number[][],
): { Xs: number[][]; mean: number[]; std: number[] } {
  const d = X[0]?.length ?? 0;
  const mean = new Array(d).fill(0);
  const std = new Array(d).fill(0);
  for (const row of X) for (let j = 0; j < d; j++) mean[j] += row[j];
  for (let j = 0; j < d; j++) mean[j] /= X.length || 1;
  for (const row of X) for (let j = 0; j < d; j++) std[j] += (row[j] - mean[j]) ** 2;
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j] / (X.length || 1)) || 1;
  const Xs = X.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));
  return { Xs, mean, std };
}

/**
 * Batch gradient descent on the binary cross-entropy loss with L2
 * regularisation. Returns weights with the bias at index 0; the input
 * rows must already be standardised. Deterministic (no randomness) so
 * tests are stable.
 */
export function fitLogistic(Xs: number[][], y: number[], opts: TrainOpts = {}): number[] {
  const lr = opts.lr ?? 0.3;
  const epochs = opts.epochs ?? 400;
  const l2 = opts.l2 ?? 0.001;
  const n = Xs.length;
  const d = Xs[0]?.length ?? 0;
  const w = new Array(d + 1).fill(0); // w[0] = bias

  for (let epoch = 0; epoch < epochs; epoch++) {
    const grad = new Array(d + 1).fill(0);
    for (let i = 0; i < n; i++) {
      let z = w[0];
      for (let j = 0; j < d; j++) z += w[j + 1] * Xs[i][j];
      const err = sigmoid(z) - y[i];
      grad[0] += err;
      for (let j = 0; j < d; j++) grad[j + 1] += err * Xs[i][j];
    }
    w[0] -= lr * (grad[0] / n);
    for (let j = 0; j < d; j++) w[j + 1] -= lr * (grad[j + 1] / n + l2 * w[j + 1]);
  }
  return w;
}

/** P(label=1) for a RAW feature vector given the model's scaler + weights. */
export function predictProba(model: MLUpsellModel, rawFeatures: number[]): number {
  let z = model.weights[0];
  for (let j = 0; j < rawFeatures.length; j++) {
    const xs = (rawFeatures[j] - model.mean[j]) / (model.std[j] || 1);
    z += model.weights[j + 1] * xs;
  }
  return sigmoid(z);
}

function logLoss(model: MLUpsellModel, examples: TrainingExample[]): number {
  if (examples.length === 0) return 0;
  let sum = 0;
  for (const ex of examples) {
    const p = Math.min(1 - 1e-9, Math.max(1e-9, predictProba(model, ex.features)));
    sum += ex.label * Math.log(p) + (1 - ex.label) * Math.log(1 - p);
  }
  return -sum / examples.length;
}

/** Minimum labelled examples before a fitted model is worth trusting. */
export const MIN_TRAINING_SAMPLES = 200;

/**
 * Train a model from real orders. Returns null on cold start (too few
 * anchor orders) so the caller falls back to the rules ranker.
 */
export function trainModel(
  orders: Order[],
  menuItems: MenuItem[],
  locationSlug: string | null,
): MLUpsellModel | null {
  const { examples, aggregates } = buildTrainingSet(orders, menuItems);
  if (examples.length < MIN_TRAINING_SAMPLES) return null;

  const X = examples.map((e) => e.features);
  const y = examples.map((e) => e.label);
  const { Xs, mean, std } = standardize(X);
  const weights = fitLogistic(Xs, y);

  const model: MLUpsellModel = {
    version: 1,
    trainedAt: new Date().toISOString(),
    locationSlug,
    featureNames: [...FEATURE_NAMES],
    weights,
    mean,
    std,
    sampleCount: examples.length,
    positiveRate: y.reduce((s, v) => s + v, 0) / y.length,
    logLoss: 0,
    globalItemAttachRate: aggregates.globalItemAttachRate,
    categoryHourAttach: aggregates.categoryHourAttach,
  };
  model.logLoss = logLoss(model, examples);
  return model;
}

// ─── Inference ──────────────────────────────────────────────────────────

/**
 * Score + rank attach candidates for a live cart. Returns candidates
 * sorted by expected contribution (P(attach) × per-unit margin) desc.
 * Candidates should already exclude items in the cart.
 */
export function scoreCandidates(
  model: MLUpsellModel,
  candidates: MenuItem[],
  ctx: MLScoreContext,
): ScoredCandidate[] {
  return candidates
    .filter(isAttachCandidate)
    .map((item) => {
      const raw = featureVector(item, {
        hour: ctx.hour,
        priorOrders: ctx.customerOrderCount,
        priorAttachForItem: ctx.customerAttachByItemId[item.id] ?? 0,
        globalItemAttachRate: model.globalItemAttachRate[item.id] ?? 0,
        categoryHourAttach: model.categoryHourAttach[item.category]?.[ctx.hour] ?? 0,
      });
      const pAttach = predictProba(model, raw);
      const margin = Math.max(0, item.price - (item.cost ?? 0));
      return {
        itemId: item.id,
        pAttach,
        expectedContributionGrosze: pAttach * margin,
      };
    })
    .sort((a, b) => b.expectedContributionGrosze - a.expectedContributionGrosze);
}
