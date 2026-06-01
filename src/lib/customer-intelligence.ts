import type { FulfillmentType, MenuCategory, MenuItem, OrderStatus } from "@/data/types";

/**
 * Customer Intelligence engine — the keystone of the "Customer Identity
 * Network" (see docs/strategy/restaurant-os-blueprint.md). Pure compute over
 * a single customer's real order history; no I/O, fully unit-testable (mirrors
 * cohort-analytics.ts / customer-segments.ts). The API route feeds it live
 * orders from getOrders(); never hardcode or mock customer behaviour.
 *
 * It derives a behavioural graph + forward predictions from what the customer
 * actually bought and when:
 *   - dish affinity (top SKUs / category)
 *   - temporal signature (the "Friday ~18:30" pattern), in Europe/Warsaw time
 *   - cadence → predicted next visit + churn hazard
 *   - party-size + conditional attach rules ("adds dessert when party ≥ 4")
 *   - channel mix + AOV
 *   - a next-order prediction headline
 */

/* ----------------------------- public types ----------------------------- */

/** Minimal structural shape the engine needs — a real `Order` satisfies it. */
export interface IntelOrder {
  customerPhone: string;
  items: { menuItem: Pick<MenuItem, "name" | "category">; quantity: number }[];
  totalAmount: number;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  partySize?: number;
  createdAt: string;
  paidAt?: string | null;
  simulated?: boolean;
}

export type ChurnRisk = "low" | "watch" | "high" | "lost";
export type Confidence = "low" | "medium" | "high";

export interface DishAffinity {
  name: string;
  category: MenuCategory;
  qty: number;
  /** Share of total units this dish represents (0–1). */
  share: number;
}

export interface TemporalSignature {
  /** 0 = Sunday … 6 = Saturday, in Europe/Warsaw. Null when no history. */
  topDayOfWeek: number | null;
  topHour: number | null;
  /** Human label, e.g. "Fri ~18:30". Null when no history. */
  label: string | null;
  /** Fraction of orders that land on the top weekday (0–1) — a confidence proxy. */
  concentration: number;
}

export interface Cadence {
  avgIntervalDays: number | null;
  medianIntervalDays: number | null;
  lastOrderAt: string | null;
  daysSinceLast: number | null;
  /** lastOrder + median interval, ISO. Null when < 2 orders. */
  predictedNextAt: string | null;
  /** daysSinceLast / medianInterval. > 1 means overdue. Null when < 2 orders. */
  overdueRatio: number | null;
}

export interface ChurnAssessment {
  hazard: number; // 0–1
  risk: ChurnRisk;
  reason: string;
}

export interface AttachRule {
  /** e.g. "party ≥ 4" or "with pizza/pasta". */
  trigger: string;
  item: string;
  /** P(item | trigger) / P(item) — how much the trigger lifts the attach. */
  lift: number;
  /** Number of trigger-orders that support the rule. */
  support: number;
}

export interface ChannelShare {
  channel: FulfillmentType;
  share: number; // 0–1
}

export interface NextOrderPrediction {
  items: { name: string; category: MenuCategory; confidence: number }[];
  /** ISO predicted timestamp (from cadence). Null when not predictable. */
  when: string | null;
  /** Human label, e.g. "Fridays around 18:30". */
  whenLabel: string | null;
  /** One-line operator/staff-facing summary — the "wow". */
  headline: string;
}

export interface CustomerIntelligence {
  phone: string;
  orderCount: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  avgOrderValueGrosze: number;
  topItems: DishAffinity[];
  topCategory: MenuCategory | null;
  temporal: TemporalSignature;
  cadence: Cadence;
  churn: ChurnAssessment;
  party: { avg: number | null; max: number | null; dineInShare: number };
  attachRules: AttachRule[];
  channelMix: ChannelShare[];
  preferredChannel: FulfillmentType | null;
  nextOrder: NextOrderPrediction;
  confidence: Confidence;
}

/* ----------------------------- constants -------------------------------- */

const DAY = 86_400_000;
const ADD_ON_CATEGORIES: MenuCategory[] = ["desserts", "drinks", "antipasti"];
const MAIN_CATEGORIES: MenuCategory[] = ["pizza", "pasta"];
const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** A counted order = real revenue signal: not pending, not cancelled, not a KDS sim. */
function isCounted(o: IntelOrder): boolean {
  return o.status !== "pending" && o.status !== "cancelled" && !o.simulated;
}

function orderInstant(o: IntelOrder): number {
  return new Date(o.paidAt ?? o.createdAt).getTime();
}

/* ------------------- Europe/Warsaw weekday + clock ---------------------- */
// Order timestamps are stored in UTC; the restaurant lives in Warsaw, so the
// "Friday 18:30" signature must be read in local time, not server UTC.

const WARSAW_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Warsaw",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const SHORT_DOW_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function warsawParts(ms: number): { dow: number; hour: number; minute: number } {
  const parts = WARSAW_FMT.formatToParts(new Date(ms));
  let dow = 0;
  let hour = 0;
  let minute = 0;
  for (const p of parts) {
    if (p.type === "weekday") dow = SHORT_DOW_INDEX[p.value] ?? 0;
    else if (p.type === "hour") hour = Number(p.value) % 24;
    else if (p.type === "minute") minute = Number(p.value);
  }
  return { dow, hour, minute };
}

function fmtClock(hour: number, minute: number): string {
  const m = minute < 15 ? 0 : minute < 45 ? 30 : 0;
  const h = minute >= 45 ? (hour + 1) % 24 : hour;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/* ------------------------------- engine --------------------------------- */

export function buildCustomerIntelligence(
  phone: string,
  allOrders: IntelOrder[],
  opts: { now?: Date } = {},
): CustomerIntelligence {
  const nowMs = (opts.now ?? new Date()).getTime();

  const orders = allOrders
    .filter((o) => o.customerPhone === phone && isCounted(o))
    .sort((a, b) => orderInstant(a) - orderInstant(b));

  const empty: CustomerIntelligence = {
    phone,
    orderCount: 0,
    firstOrderAt: null,
    lastOrderAt: null,
    avgOrderValueGrosze: 0,
    topItems: [],
    topCategory: null,
    temporal: { topDayOfWeek: null, topHour: null, label: null, concentration: 0 },
    cadence: {
      avgIntervalDays: null,
      medianIntervalDays: null,
      lastOrderAt: null,
      daysSinceLast: null,
      predictedNextAt: null,
      overdueRatio: null,
    },
    churn: { hazard: 0, risk: "low", reason: "No order history yet." },
    party: { avg: null, max: null, dineInShare: 0 },
    attachRules: [],
    channelMix: [],
    preferredChannel: null,
    nextOrder: {
      items: [],
      when: null,
      whenLabel: null,
      headline: "No order history yet — nothing to predict.",
    },
    confidence: "low",
  };
  if (orders.length === 0) return empty;

  /* --- dish affinity --- */
  const itemAgg = new Map<string, { name: string; category: MenuCategory; qty: number }>();
  let totalUnits = 0;
  for (const o of orders) {
    for (const it of o.items) {
      const key = it.menuItem.name;
      const cur = itemAgg.get(key) ?? { name: it.menuItem.name, category: it.menuItem.category, qty: 0 };
      cur.qty += it.quantity;
      itemAgg.set(key, cur);
      totalUnits += it.quantity;
    }
  }
  const topItems: DishAffinity[] = [...itemAgg.values()]
    .map((v) => ({ ...v, share: totalUnits ? v.qty / totalUnits : 0 }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const catAgg = new Map<MenuCategory, number>();
  for (const v of itemAgg.values()) catAgg.set(v.category, (catAgg.get(v.category) ?? 0) + v.qty);
  const topCategory =
    [...catAgg.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  /* --- temporal signature (Warsaw) --- */
  const dayCounts = new Array(7).fill(0);
  const hourBuckets: number[][] = Array.from({ length: 7 }, () => []);
  for (const o of orders) {
    const { dow, hour, minute } = warsawParts(orderInstant(o));
    dayCounts[dow] += 1;
    hourBuckets[dow].push(hour * 60 + minute);
  }
  const topDayOfWeek = dayCounts.reduce((best, c, i) => (c > dayCounts[best] ? i : best), 0);
  const topDayHasData = dayCounts[topDayOfWeek] > 0;
  const minutesOnTopDay = hourBuckets[topDayOfWeek];
  const medianMinuteOfDay = topDayHasData ? median(minutesOnTopDay) : 0;
  const topHour = topDayHasData ? Math.floor(medianMinuteOfDay / 60) : null;
  const concentration = topDayHasData ? dayCounts[topDayOfWeek] / orders.length : 0;
  const temporalLabel = topDayHasData
    ? `${DOW_SHORT[topDayOfWeek]} ~${fmtClock(Math.floor(medianMinuteOfDay / 60), medianMinuteOfDay % 60)}`
    : null;
  const temporal: TemporalSignature = {
    topDayOfWeek: topDayHasData ? topDayOfWeek : null,
    topHour,
    label: temporalLabel,
    concentration,
  };

  /* --- cadence --- */
  const instants = orders.map(orderInstant);
  const firstOrderAt = new Date(instants[0]).toISOString();
  const lastMs = instants[instants.length - 1];
  const lastOrderAt = new Date(lastMs).toISOString();
  const daysSinceLast = Math.max(0, (nowMs - lastMs) / DAY);

  let avgIntervalDays: number | null = null;
  let medianIntervalDays: number | null = null;
  let predictedNextAt: string | null = null;
  let overdueRatio: number | null = null;
  if (instants.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < instants.length; i++) gaps.push((instants[i] - instants[i - 1]) / DAY);
    avgIntervalDays = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    medianIntervalDays = median(gaps);
    if (medianIntervalDays > 0) {
      predictedNextAt = new Date(lastMs + medianIntervalDays * DAY).toISOString();
      overdueRatio = daysSinceLast / medianIntervalDays;
    }
  }
  const cadence: Cadence = {
    avgIntervalDays,
    medianIntervalDays,
    lastOrderAt,
    daysSinceLast,
    predictedNextAt,
    overdueRatio,
  };

  /* --- churn hazard --- */
  const churn = assessChurn(orders.length, daysSinceLast, overdueRatio, medianIntervalDays);

  /* --- party + dine-in --- */
  const dineIn = orders.filter((o) => o.fulfillmentType === "dine-in");
  const parties = dineIn.map((o) => o.partySize).filter((p): p is number => typeof p === "number" && p > 0);
  const party = {
    avg: parties.length ? parties.reduce((a, b) => a + b, 0) / parties.length : null,
    max: parties.length ? Math.max(...parties) : null,
    dineInShare: orders.length ? dineIn.length / orders.length : 0,
  };

  /* --- attach rules --- */
  const attachRules = detectAttachRules(orders);

  /* --- channel mix --- */
  const chanCount = new Map<FulfillmentType, number>();
  for (const o of orders) chanCount.set(o.fulfillmentType, (chanCount.get(o.fulfillmentType) ?? 0) + 1);
  const channelMix: ChannelShare[] = [...chanCount.entries()]
    .map(([channel, n]) => ({ channel, share: n / orders.length }))
    .sort((a, b) => b.share - a.share);
  const preferredChannel = channelMix[0]?.channel ?? null;

  /* --- AOV --- */
  const avgOrderValueGrosze = Math.round(
    orders.reduce((a, o) => a + o.totalAmount, 0) / orders.length,
  );

  /* --- overall confidence --- */
  const confidence: Confidence =
    orders.length >= 8 && concentration >= 0.4 ? "high" : orders.length >= 4 ? "medium" : "low";

  /* --- next-order prediction (the headline) --- */
  const nextOrder = buildNextOrder(orders.length, topItems, temporal, cadence, attachRules);

  return {
    phone,
    orderCount: orders.length,
    firstOrderAt,
    lastOrderAt,
    avgOrderValueGrosze,
    topItems,
    topCategory,
    temporal,
    cadence,
    churn,
    party,
    attachRules,
    channelMix,
    preferredChannel,
    nextOrder,
    confidence,
  };
}

function assessChurn(
  orderCount: number,
  daysSinceLast: number,
  overdueRatio: number | null,
  medianIntervalDays: number | null,
): ChurnAssessment {
  // Hard lapse aligns with the customer-segments "lapsed" threshold (90d).
  if (daysSinceLast > 90) {
    return {
      hazard: clamp01(Math.max(0.9, overdueRatio ? overdueRatio / 4 : 0.9)),
      risk: "lost",
      reason: `${Math.round(daysSinceLast)}d since last order — past the 90-day lapse line.`,
    };
  }
  if (orderCount < 2 || overdueRatio === null || medianIntervalDays === null) {
    // Single visit: hazard rises with silence but stays low-confidence.
    const hazard = daysSinceLast > 45 ? 0.6 : daysSinceLast > 21 ? 0.35 : 0.15;
    return {
      hazard,
      risk: hazard >= 0.5 ? "watch" : "low",
      reason:
        orderCount < 2
          ? `Single visit, ${Math.round(daysSinceLast)}d ago — no cadence yet.`
          : `${Math.round(daysSinceLast)}d since last order.`,
    };
  }
  const hazard = clamp01(overdueRatio / 3);
  const risk: ChurnRisk = overdueRatio < 0.9 ? "low" : overdueRatio < 1.75 ? "watch" : "high";
  const cadenceLabel = `usually every ~${Math.round(medianIntervalDays)}d`;
  const reason =
    risk === "low"
      ? `On cadence — last order ${Math.round(daysSinceLast)}d ago, ${cadenceLabel}.`
      : `${Math.round(daysSinceLast)}d since last order (${cadenceLabel}) — ${overdueRatio.toFixed(1)}× their normal gap.`;
  return { hazard, risk, reason };
}

function detectAttachRules(orders: IntelOrder[]): AttachRule[] {
  const counted = orders.length;
  if (counted < 3) return [];

  // Per add-on item: baseline support, plus conditional support under triggers.
  const baseHas = new Map<string, number>(); // item -> # orders containing it
  for (const o of orders) {
    const names = new Set(o.items.filter((i) => ADD_ON_CATEGORIES.includes(i.menuItem.category)).map((i) => i.menuItem.name));
    for (const n of names) baseHas.set(n, (baseHas.get(n) ?? 0) + 1);
  }

  const largeParty = orders.filter((o) => o.fulfillmentType === "dine-in" && (o.partySize ?? 0) >= 4);
  const withMain = orders.filter((o) => o.items.some((i) => MAIN_CATEGORIES.includes(i.menuItem.category)));

  const rules: AttachRule[] = [];
  for (const [item, baseCount] of baseHas.entries()) {
    if (baseCount < 2) continue;
    const pBase = baseCount / counted;

    // Rule A — party ≥ 4
    if (largeParty.length >= 2) {
      const hit = largeParty.filter((o) => o.items.some((i) => i.menuItem.name === item)).length;
      const pCond = hit / largeParty.length;
      const lift = pBase > 0 ? pCond / pBase : 0;
      if (pCond >= 0.5 && lift >= 1.3) {
        rules.push({ trigger: "party ≥ 4", item, lift, support: hit });
      }
    }
    // Rule B — with pizza/pasta
    if (withMain.length >= 2) {
      const hit = withMain.filter((o) => o.items.some((i) => i.menuItem.name === item)).length;
      const pCond = hit / withMain.length;
      const lift = pBase > 0 ? pCond / pBase : 0;
      if (pCond >= 0.6 && lift >= 1.2) {
        rules.push({ trigger: "with pizza/pasta", item, lift, support: hit });
      }
    }
  }

  // Strongest rule per item, then strongest overall, cap 3.
  const byItem = new Map<string, AttachRule>();
  for (const r of rules) {
    const cur = byItem.get(r.item);
    if (!cur || r.lift > cur.lift) byItem.set(r.item, r);
  }
  return [...byItem.values()].sort((a, b) => b.lift - a.lift || b.support - a.support).slice(0, 3);
}

function buildNextOrder(
  orderCount: number,
  topItems: DishAffinity[],
  temporal: TemporalSignature,
  cadence: Cadence,
  attachRules: AttachRule[],
): NextOrderPrediction {
  const items = topItems.slice(0, 3).map((t) => ({ name: t.name, category: t.category, confidence: t.share }));
  const whenLabel =
    temporal.topDayOfWeek !== null && temporal.label
      ? `${DOW_LONG[temporal.topDayOfWeek]}s around ${temporal.label.split("~")[1] ?? ""}`.trim()
      : null;

  if (orderCount < 3 || items.length === 0) {
    return {
      items,
      when: cadence.predictedNextAt,
      whenLabel,
      headline:
        orderCount < 3
          ? "Building a profile — a few more orders and we'll predict the next one."
          : "Not enough signal to predict the next order yet.",
    };
  }

  const itemPhrase =
    items.length >= 2 ? `${items[0].name} + ${items[1].name}` : items[0].name;
  const timePhrase = whenLabel ? ` on ${whenLabel}` : "";
  const attachPhrase =
    attachRules.length > 0 ? ` — adds ${attachRules[0].item} ${attachRules[0].trigger}` : "";

  return {
    items,
    when: cadence.predictedNextAt,
    whenLabel,
    headline: `Usually orders ${itemPhrase}${timePhrase}${attachPhrase}.`,
  };
}
