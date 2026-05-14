import { MenuItem, MenuCategory, CartItem } from "@/data/types";

// --- Contextual pairing graph (audit §3.1) -----------------------------
//
// `CROSS_SELL_MAP` (further down) is the safety net — every cart still gets
// the canonical "with pizza, suggest espresso + dessert + drink" rules.
// On top of that, each candidate item gets a per-cart composite weight
// from four signals:
//
//   margin       — gross-margin × historic attach rate, normalised 0..1
//   hourBias     — does this category usually attach at THIS hour?
//                  (espresso → 0.82 at lunch, 0.31 at dinner)
//   customer     — how often did THIS phone add it on past orders?
//                  (espresso → 0.95 if last 4 of 4; 0 if first ever)
//   noveltyDecay — small +bonus for items the customer has never tried,
//                  small −penalty for items they always add (chip rotates).
//
// The customer + hour signals come in via PairingContext. Callers can omit
// either; the function still produces a usable score off margin × hour.

export interface PairingContext {
  /** Local hour 0..23 used to look up hour-of-day bias curves. */
  hour?: number;
  /**
   * How many of THIS phone's past orders included each item id. Resolves
   * the &ldquo;you added it 3 of last 4 visits&rdquo; copy + the customer signal.
   * Empty / missing → treated as a brand-new customer (novelty bonus applies).
   */
  customerAttachByItemId?: Record<string, number>;
  /** Total non-pending orders this phone has placed — denominator for the
   *  attach rate. 0 / unset means we have no history at all. */
  customerOrderCount?: number;
}

/** Per-category attach rates measured against historic order data. These are
 *  the §2.4 numbers from the audit, exposed as a constant so the admin debug
 *  view in /admin/upsell can render the same percentages the engine uses. */
const CATEGORY_BASE_ATTACH: Record<MenuCategory, number> = {
  drinks: 0.6, // espresso etc — the highest-leverage SKU
  desserts: 0.28,
  antipasti: 0.18,
  panini: 0.05,
  pasta: 0.04,
  pizza: 0.03,
};

/** Hour-of-day bias by category, hand-calibrated against the §2.3 windows.
 *  Each entry is a full 24-element array (0..23) so the lookup is O(1) and
 *  the curve is explicit rather than computed. Espresso peaks at 11 (lunch
 *  coffee) and dips at dinner; tiramisù holds steady through the evening;
 *  drinks rise across lunch and dinner; antipasti spike at dinner. */
const CATEGORY_HOUR_BIAS: Record<MenuCategory, number[]> = {
  // 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23
  drinks: [
    0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.5, 0.6, 0.7, 0.78, 0.82, 0.85, 0.85, 0.78,
    0.65, 0.58, 0.55, 0.5, 0.45, 0.41, 0.42, 0.42, 0.42, 0.4,
  ],
  desserts: [
    0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.55, 0.6, 0.65, 0.7, 0.72, 0.7,
    0.7, 0.7, 0.72, 0.78, 0.82, 0.85, 0.85, 0.78, 0.7, 0.6,
  ],
  antipasti: [
    0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.45, 0.5, 0.55, 0.62, 0.7, 0.65,
    0.55, 0.55, 0.6, 0.72, 0.82, 0.85, 0.78, 0.65, 0.55, 0.45,
  ],
  panini: [
    0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.4, 0.55, 0.7, 0.75, 0.8, 0.82, 0.78, 0.65,
    0.55, 0.5, 0.45, 0.42, 0.4, 0.38, 0.35, 0.32, 0.3, 0.3,
  ],
  pasta: [
    0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.78, 0.82, 0.78,
    0.65, 0.55, 0.55, 0.7, 0.82, 0.85, 0.78, 0.6, 0.5, 0.45,
  ],
  pizza: [
    0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.72, 0.78, 0.7,
    0.6, 0.55, 0.6, 0.75, 0.85, 0.88, 0.82, 0.7, 0.6, 0.5,
  ],
};

/** Composite score breakdown — surfaced to /admin/upsell so operators can
 *  see exactly why a chip was ranked the way it was. */
export interface PairingScore {
  composite: number;
  margin: number;
  hourBias: number;
  customer: number;
  noveltyDecay: number;
}

/**
 * Score one candidate item for one cart context. Returns 0..1 (clamped) plus
 * the raw signals so the admin debug view can render the breakdown.
 *
 * Pure function — no fetching, no clock reads. Callers pass `hour` and
 * `customerAttachByItemId` so tests can pin the signals.
 */
export function scorePairing(
  item: MenuItem,
  context: PairingContext,
): PairingScore {
  const baseAttach = CATEGORY_BASE_ATTACH[item.category] ?? 0.1;
  const margin = item.cost > 0 ? Math.max(0, (item.price - item.cost) / item.price) : 0.5;
  const marginSignal = clamp01(margin * baseAttach * 1.4);

  let hourBias = 0.5;
  if (typeof context.hour === "number") {
    const h = ((Math.floor(context.hour) % 24) + 24) % 24;
    hourBias = CATEGORY_HOUR_BIAS[item.category]?.[h] ?? 0.5;
  }

  const orderCount = context.customerOrderCount ?? 0;
  const attachCount = context.customerAttachByItemId?.[item.id] ?? 0;
  let customerSignal = 0.5;
  let noveltyDecay = 0;
  if (orderCount > 0) {
    const rate = attachCount / orderCount;
    customerSignal = clamp01(rate * 0.95 + 0.5 * (1 - Math.min(1, rate)));
    if (rate >= 0.75) {
      // They always add it — quietly rotate to the next-best earner.
      noveltyDecay = -0.12;
    } else if (rate === 0 && orderCount >= 2) {
      // Established customer who hasn't tried — small novelty bonus.
      noveltyDecay = 0.08;
    }
  } else {
    // Brand new — small bonus across the board to surface variety.
    noveltyDecay = 0.05;
  }

  const composite = clamp01(
    marginSignal * 0.4 + hourBias * 0.3 + customerSignal * 0.3 + noveltyDecay,
  );

  return {
    composite,
    margin: marginSignal,
    hourBias,
    customer: customerSignal,
    noveltyDecay,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// --- Cross-sell rules: suggest complementary categories ---

const CROSS_SELL_MAP: Record<MenuCategory, MenuCategory[]> = {
  pizza: ["drinks", "desserts", "antipasti"],
  pasta: ["drinks", "desserts", "antipasti"],
  antipasti: ["pizza", "pasta", "drinks"],
  panini: ["drinks", "desserts"],
  drinks: ["desserts", "pizza"],
  desserts: ["drinks"],
};

// --- Default popular item IDs per location (used when no admin config exists) ---

const DEFAULT_POPULAR_ITEMS: Record<string, string[]> = {
  krakow: [
    "krk-pizza-margherita",
    "krk-pizza-diavola",
    "krk-pasta-carbonara",
    "krk-dessert-tiramisu",
    "krk-drink-limonata",
  ],
  warszawa: [
    "waw-pizza-margherita",
    "waw-pizza-bufala",
    "waw-pasta-carbonara",
    "waw-dessert-tiramisu",
    "waw-drink-limonata",
  ],
};

const DEFAULT_STAFF_PICKS: Record<string, string[]> = {
  krakow: ["krk-pizza-quattro-formaggi", "krk-anti-burrata", "krk-pasta-pesto"],
  warszawa: ["waw-pizza-napoli", "waw-anti-burrata", "waw-pasta-cacio-pepe"],
};

const NEW_ITEMS: string[] = [];

export type BadgeType = "popular" | "staff-pick" | "new" | "best-value";

// Configurable upsell config shape (matches LocationUpsellConfig from store)
export interface UpsellConfig {
  popularItems?: string[];
  staffPicks?: string[];
  preferredCoffee?: string;
  preferredDessert?: string;
  preferredDrink?: string;
  combos?: {
    id: string;
    name: string;
    description: string;
    categories: string[];
    discountPercent: number;
    minItems: number;
    active: boolean;
  }[];
  /** Admin override for the §2.3 time-of-day banner. When present + non-empty,
   *  these windows replace DEFAULT_TIME_WINDOWS for the location. Same shape
   *  as TimeWindow below; `active: false` rows are skipped. */
  timeWindows?: {
    id: string;
    variant: string; // narrowed to TimeWindowVariant at runtime
    startHour: number;
    endHour: number;
    title: string;
    sub: string;
    badge: string;
    cta: string;
    addItemIdSuffix?: string;
    active: boolean;
  }[];
}

export function getItemBadges(
  itemId: string,
  locationSlug: string,
  config?: UpsellConfig | null
): BadgeType[] {
  const badges: BadgeType[] = [];
  const popular = config?.popularItems || DEFAULT_POPULAR_ITEMS[locationSlug] || [];
  const staffPicks = config?.staffPicks || DEFAULT_STAFF_PICKS[locationSlug] || [];
  if (popular.includes(itemId)) badges.push("popular");
  if (staffPicks.includes(itemId)) badges.push("staff-pick");
  if (NEW_ITEMS.includes(itemId)) badges.push("new");
  return badges;
}

export const BADGE_CONFIG: Record<BadgeType, { label: string; color: string }> = {
  popular: { label: "Most Popular", color: "bg-italia-red/10 text-italia-red" },
  "staff-pick": { label: "Staff Pick", color: "bg-italia-gold/15 text-italia-gold-dark" },
  new: { label: "New", color: "bg-italia-green/10 text-italia-green" },
  "best-value": { label: "Best Value", color: "bg-purple-50 text-purple-600" },
};

// --- Cross-sell suggestions for the cart ---
// RULE: Every pizza/pasta MUST get a coffee and dessert suggestion.
// This is the #1 AOV driver.
//
// Margin-ranked ordering (audit §2.4): the priority numbers below double as a
// margin × attach-rate ranking. Espresso comes first because PLN 5 of margin
// (83% GM) × 60% attach rate ≈ PLN 110k/year/truck — the single
// highest-leverage SKU. Dessert is second (70% GM, ~28% attach). A non-coffee
// drink is third. Do not reorder these without re-checking the cost table in
// src/data/menus/krakow.ts.

export interface UpsellSuggestion {
  item: MenuItem;
  reason: string;
  priority: number; // lower = shown first
}

/**
 * Per-item reason copy overrides — keyed by item id suffix so a single
 * entry covers both Kraków (`krk-...`) and Warszawa (`waw-...`). Production
 * brand voice for the chip subtitle. Anything not in this map falls back
 * to the priority-rule copy below ("Perfect after your meal …").
 */
const ITEM_REASON_OVERRIDES: Record<string, string> = {
  "drink-espresso": "Never too late",
  "dessert-tiramisu": "Pizzaiolo's fav",
  "anti-burrata": "Freshly-baked today",
  "anti-bruschetta": "Freshly-baked today",
};

function reasonForItem(item: MenuItem, fallback: string): string {
  for (const [suffix, copy] of Object.entries(ITEM_REASON_OVERRIDES)) {
    if (item.id.endsWith(suffix)) return copy;
  }
  return fallback;
}

// Default preferred cross-sell items per location
const DEFAULT_PREFERRED_COFFEE: Record<string, string> = {
  krakow: "krk-drink-espresso",
  warszawa: "waw-drink-espresso",
};

const DEFAULT_PREFERRED_DESSERT: Record<string, string> = {
  krakow: "krk-dessert-tiramisu",
  warszawa: "waw-dessert-tiramisu",
};

const DEFAULT_PREFERRED_DRINK: Record<string, string> = {
  krakow: "krk-drink-limonata",
  warszawa: "waw-drink-limonata",
};

export function getCartSuggestions(
  cartItems: CartItem[],
  allMenuItems: MenuItem[],
  maxSuggestions: number = 4,
  config?: UpsellConfig | null,
  /**
   * Optional pairing context (audit §3.1). When present, candidates are
   * re-ranked by `scorePairing()` × the canonical priority so the chips
   * shift with hour-of-day and the customer's history. Pure / opt-in:
   * absent context keeps today's deterministic order.
   */
  pairingContext?: PairingContext | null,
): UpsellSuggestion[] {
  if (cartItems.length === 0 || allMenuItems.length === 0) return [];

  const cartItemIds = new Set(cartItems.map((ci) => ci.menuItem.id));
  const cartCategories = new Set(cartItems.map((ci) => ci.menuItem.category));
  const locationSlug = cartItems[0]?.locationSlug || "";

  const available = allMenuItems.filter(
    (m) => m.available && !cartItemIds.has(m.id)
  );
  const byId = new Map(available.map((m) => [m.id, m]));

  const hasPizzaOrPasta = cartCategories.has("pizza") || cartCategories.has("pasta");
  const hasPanini = cartCategories.has("panini");
  const hasMain = hasPizzaOrPasta || hasPanini;
  const hasCoffee = cartItems.some((ci) => ci.menuItem.id.includes("espresso"));
  const hasDrink = cartCategories.has("drinks");
  const hasDessert = cartCategories.has("desserts");

  // Use admin config if available, otherwise defaults
  const prefCoffee = config?.preferredCoffee || DEFAULT_PREFERRED_COFFEE[locationSlug];
  const prefDessert = config?.preferredDessert || DEFAULT_PREFERRED_DESSERT[locationSlug];
  const prefDrink = config?.preferredDrink || DEFAULT_PREFERRED_DRINK[locationSlug];

  const suggestions: UpsellSuggestion[] = [];

  // RULE 1: Always suggest espresso with pizza/pasta (highest priority)
  if (hasMain && !hasCoffee) {
    const coffee = prefCoffee ? byId.get(prefCoffee) : null;
    const anyCoffee = coffee || available.find((m) => m.id.includes("espresso"));
    if (anyCoffee) {
      suggestions.push({
        item: anyCoffee,
        reason: reasonForItem(anyCoffee, "Perfect after your meal — Italian espresso"),
        priority: 1,
      });
    }
  }

  // RULE 2: Always suggest dessert with pizza/pasta
  if (hasMain && !hasDessert) {
    const dessert = prefDessert ? byId.get(prefDessert) : null;
    const anyDessert = dessert || available.find((m) => m.category === "desserts");
    if (anyDessert) {
      suggestions.push({
        item: anyDessert,
        reason: reasonForItem(anyDessert, "Finish with our signature Tiramisù"),
        priority: 2,
      });
    }
  }

  // RULE 3: Suggest a refreshing drink if no drink at all
  if (hasMain && !hasDrink && !hasCoffee) {
    const drink = prefDrink ? byId.get(prefDrink) : null;
    const anyDrink = drink || available.find((m) => m.category === "drinks" && !m.id.includes("espresso"));
    if (anyDrink) {
      suggestions.push({
        item: anyDrink,
        reason: reasonForItem(anyDrink, "Add a refreshing drink to your order"),
        priority: 3,
      });
    }
  }

  // RULE 4: If only drinks/desserts, suggest a main
  if (!hasMain && (hasDrink || hasDessert)) {
    const pizza = available.find((m) => m.category === "pizza");
    if (pizza) {
      suggestions.push({
        item: pizza,
        reason: reasonForItem(pizza, "Add a pizza to make it a meal"),
        priority: 4,
      });
    }
  }

  // Sort: priority first (canonical espresso → dessert → drink ladder), then
  // composite pairing score within the same priority bucket so two equally
  // hot candidates resolve by margin × hour × customer (§3.1). The reason
  // copy also pivots when the customer has a strong attach signal.
  if (pairingContext) {
    const scored = suggestions.map((s) => ({
      s,
      score: scorePairing(s.item, pairingContext).composite,
    }));
    scored.sort((a, b) => {
      if (a.s.priority !== b.s.priority) return a.s.priority - b.s.priority;
      return b.score - a.score;
    });
    return scored.slice(0, maxSuggestions).map(({ s }) => ({
      ...s,
      reason: contextualReason(s, pairingContext),
    }));
  }

  return suggestions
    .sort((a, b) => a.priority - b.priority)
    .slice(0, maxSuggestions);
}

/**
 * Pivot the chip's reason copy when the customer has a strong attach
 * signal — "you added it 3 of last 4 visits" reads as recognition, not as
 * a generic recommendation. Falls back to the canonical reason otherwise.
 */
function contextualReason(
  s: UpsellSuggestion,
  ctx: PairingContext,
): string {
  const orderCount = ctx.customerOrderCount ?? 0;
  const attach = ctx.customerAttachByItemId?.[s.item.id] ?? 0;
  // Strong attach signal → recognition copy. Even when the item has a
  // brand-voice override, "you added it 3 of last 4 visits" is more
  // useful in the chip subtitle.
  if (orderCount >= 2 && attach >= 2 && attach / orderCount >= 0.5) {
    return `You added it ${attach} of last ${orderCount} visits`;
  }
  // Otherwise the per-item brand voice (Pizzaiolo's fav etc) wins, with
  // the priority-rule copy as the final fallback.
  return reasonForItem(s.item, s.reason);
}

// --- Combo / Bundle Deals ---

export interface ComboDeal {
  id: string;
  name: string;
  description: string;
  categories: MenuCategory[];
  discountPercent: number;
  minItems: number;
}

// Default combos (used when no admin config exists for the location)
export const DEFAULT_COMBO_DEALS: ComboDeal[] = [
  {
    id: "meal-deal",
    name: "Meal Deal",
    description: "Any main + drink + dessert",
    categories: ["pizza", "drinks", "desserts"],
    discountPercent: 10,
    minItems: 3,
  },
  {
    id: "pasta-combo",
    name: "Pasta Combo",
    description: "Any pasta + drink + dessert",
    categories: ["pasta", "drinks", "desserts"],
    discountPercent: 10,
    minItems: 3,
  },
  {
    id: "lunch-special",
    name: "Lunch Special",
    description: "Any panino + drink",
    categories: ["panini", "drinks"],
    discountPercent: 8,
    minItems: 2,
  },
];

// Keep backward-compatible export
export const COMBO_DEALS = DEFAULT_COMBO_DEALS;

export function getActiveComboDeals(
  cartItems: CartItem[],
  config?: UpsellConfig | null
): {
  activeDeal: ComboDeal | null;
  savings: number;
  missingCategories: MenuCategory[];
  progress: number;
} {
  // Resolve combos: use admin config if available, otherwise defaults
  const combos: ComboDeal[] = config?.combos
    ? config.combos
        .filter((c) => c.active)
        .map((c) => ({
          ...c,
          categories: c.categories as MenuCategory[],
        }))
    : DEFAULT_COMBO_DEALS;

  const cartCategories = new Set(cartItems.map((ci) => ci.menuItem.category));

  for (const deal of combos) {
    const matched = deal.categories.filter((c) => cartCategories.has(c));
    const missing = deal.categories.filter((c) => !cartCategories.has(c));
    const progress = matched.length / deal.categories.length;

    // Calculate savings based only on items that form the combo, not the full cart
    const comboItemsTotal = cartItems
      .filter((ci) => deal.categories.includes(ci.menuItem.category))
      .reduce((sum, ci) => sum + ci.menuItem.price * ci.quantity, 0);

    if (matched.length >= 1 && missing.length > 0) {
      const potentialSavings = Math.round(
        comboItemsTotal * (deal.discountPercent / 100)
      );

      return {
        activeDeal: deal,
        savings: potentialSavings,
        missingCategories: missing as MenuCategory[],
        progress,
      };
    }

    if (missing.length === 0 && cartItems.length >= deal.minItems) {
      return {
        activeDeal: deal,
        savings: Math.round(comboItemsTotal * (deal.discountPercent / 100)),
        missingCategories: [],
        progress: 1,
      };
    }
  }

  return { activeDeal: null, savings: 0, missingCategories: [], progress: 0 };
}

// --- Free delivery threshold + fee (m2_12) ------------------------------

export const FREE_DELIVERY_THRESHOLD = 6000; // 60 PLN
/** Flat delivery fee in grosze applied when cart total is below threshold. */
export const DELIVERY_FEE_GROSZE = 700; // 7.00 PLN

export function getDeliveryProgress(cartTotal: number): {
  remaining: number;
  progress: number;
  qualified: boolean;
} {
  if (cartTotal >= FREE_DELIVERY_THRESHOLD) {
    return { remaining: 0, progress: 1, qualified: true };
  }
  const remaining = FREE_DELIVERY_THRESHOLD - cartTotal;
  const progress = cartTotal / FREE_DELIVERY_THRESHOLD;
  return { remaining, progress, qualified: false };
}

/**
 * Compute the delivery fee that applies to a cart (grosze). Returns 0 for
 * takeout, 0 for delivery above the threshold, and DELIVERY_FEE_GROSZE
 * otherwise. Mirrors getDeliveryProgress so the customer sees the same
 * "Spend X more for free delivery" CTA as the checkout charges.
 */
export function computeDeliveryFee(
  cartSubtotal: number,
  fulfillmentType: "takeout" | "delivery",
  /** Per-customer threshold override (audit §2.5). Defaults to the standard
   *  60 PLN bar; callers that know the customer should pass the segmented
   *  threshold so the displayed bar and the actual charge stay in sync. */
  thresholdOverride: number = FREE_DELIVERY_THRESHOLD,
): number {
  if (fulfillmentType !== "delivery") return 0;
  const threshold = thresholdOverride <= 0 ? 0 : thresholdOverride;
  if (cartSubtotal >= threshold) return 0;
  return DELIVERY_FEE_GROSZE;
}

// --- Per-segment free-delivery threshold (audit §2.5 + §3.3) -------------
//
// Four bands, each tuned to where the customer is in their lifecycle:
//   first-time (orders < 2)      → 39 PLN — remove friction on visit 1
//   growing    (orders 2–4)      → 49 PLN — slight raise as confidence builds
//   regular    (orders ≥ 5)      → 59 PLN — they'll hit it anyway
//   vip        (Gold / Platinum) → free   — surface as a tier perk
// Numbers match the §3.3 table; Uber Eats reported ~+4% GMV / customer
// from the same shape.

export type CustomerSegment = "first-time" | "growing" | "regular" | "vip";

/** Resolved tier should be calculated upstream via `calculateTier(points)`
 *  from `@/lib/loyalty` — kept as a plain string here to avoid an import
 *  cycle and to leave room for future segment classifiers. */
export interface CustomerSegmentInput {
  ordersCount?: number | null;
  tier?: string | null;
}

export const SEGMENT_FREE_DELIVERY_THRESHOLD: Record<CustomerSegment, number> = {
  "first-time": 3900, // 39 PLN
  growing: 4900, // 49 PLN
  regular: 5900, // 59 PLN — slightly under the legacy 60 PLN bar
  vip: 0,
};

export function getCustomerSegment(
  customer: CustomerSegmentInput | null | undefined,
): CustomerSegment {
  if (!customer) return "first-time";
  const tier = (customer.tier || "").toLowerCase();
  if (tier === "gold" || tier === "platinum") return "vip";
  const orders = customer.ordersCount ?? 0;
  if (orders < 2) return "first-time";
  if (orders < 5) return "growing";
  return "regular";
}

export function getDeliveryThresholdForCustomer(
  customer: CustomerSegmentInput | null | undefined,
): number {
  return SEGMENT_FREE_DELIVERY_THRESHOLD[getCustomerSegment(customer)];
}

/**
 * Variant of getDeliveryProgress that takes a per-customer threshold so we
 * can surface the same "tuned for you" bar the audit prescribes. Falls back
 * to the default 60 PLN threshold if no override is given.
 */
export function getDeliveryProgressFor(
  cartTotal: number,
  threshold: number = FREE_DELIVERY_THRESHOLD,
): { remaining: number; progress: number; qualified: boolean; threshold: number } {
  if (threshold <= 0 || cartTotal >= threshold) {
    return { remaining: 0, progress: 1, qualified: true, threshold };
  }
  return {
    remaining: threshold - cartTotal,
    progress: cartTotal / threshold,
    qualified: false,
    threshold,
  };
}

// --- Time-of-day banner windows (audit §2.3) -----------------------------
//
// One banner at a time, picked server-side by local hour × customer state.
// This is the hardcoded default schedule; once /admin/upsell exposes a
// `timeWindows` editor in LocationUpsellConfig, that overrides this list.

export type TimeWindowVariant =
  | "morning"
  | "lunch"
  | "afternoon"
  | "dinner"
  | "late";

export interface TimeWindow {
  id: string;
  variant: TimeWindowVariant;
  /** Local-hour interval, [start, end). Use 24h clock. */
  startHour: number;
  endHour: number;
  title: string;
  sub: string;
  /** Short label that goes in the right-side pill, e.g. "−10%", "PLN 6". */
  badge: string;
  /** Primary CTA copy. Defer to copy-toggle when banner is default-applied. */
  cta: string;
  /** Optional menu-item id to add when the CTA is tapped (afternoon espresso). */
  addItemId?: string;
  /** If set, the banner implies an existing combo deal id is in play; the
   *  banner becomes informational once that combo auto-applies. */
  comboId?: string;
}

export const DEFAULT_TIME_WINDOWS: TimeWindow[] = [
  {
    id: "morning",
    variant: "morning",
    startHour: 7,
    endHour: 10,
    title: "Pre-order lunch — beat the noon rush",
    sub: "Lock the 12:00 slot now, walk past the queue",
    badge: "Pre-order",
    cta: "Pick a slot",
  },
  {
    id: "lunch",
    variant: "lunch",
    startHour: 11,
    endHour: 13,
    title: "Lunch combo — pasta + drink",
    sub: "Add a pasta and a drink to save 10%",
    badge: "−10%",
    cta: "How it works",
    comboId: "meal-deal",
  },
  {
    id: "afternoon",
    variant: "afternoon",
    startHour: 14,
    endHour: 16,
    title: "Espresso break",
    sub: "Add an espresso — pickup in 4 min",
    badge: "Quick add",
    cta: "Add espresso",
    addItemId: "espresso",
  },
  {
    id: "dinner",
    variant: "dinner",
    startHour: 17,
    endHour: 19,
    title: "Cooking for the table tonight?",
    sub: "Multiple pizzas + sides + drinks save 10% via Meal Deal",
    badge: "Tip",
    cta: "What pairs well",
    comboId: "meal-deal",
  },
  {
    id: "late",
    variant: "late",
    startHour: 20,
    endHour: 23,
    title: "Late-night espresso & dessert",
    sub: "Tiramisù pairs with an espresso · ready in 6 min",
    badge: "Quick add",
    cta: "Add espresso",
    addItemId: "espresso",
  },
];

/** Narrow a free-form variant string off of `UpsellConfig.timeWindows[].variant`
 *  to the closed `TimeWindowVariant` set. Anything unrecognised falls back to
 *  "lunch" — keeps the editor permissive without crashing the UI. */
function asTimeWindowVariant(variant: string): TimeWindowVariant {
  return (["morning", "lunch", "afternoon", "dinner", "late"] as const).includes(
    variant as TimeWindowVariant,
  )
    ? (variant as TimeWindowVariant)
    : "lunch";
}

/**
 * Returns the time window active at `now` (local hour), or null if no window
 * matches. Used by TodBanner to pick the right copy + CTA.
 *
 * `now` is a parameter so callers can fix the clock for tests; in production
 * it defaults to a fresh Date so each render reflects the actual hour.
 *
 * When an admin has saved custom `timeWindows[]` on the location's
 * UpsellConfig those win over the hardcoded DEFAULT_TIME_WINDOWS — inactive
 * entries are skipped, so admins can disable a single window without
 * wiping the row.
 */
export function getActiveTimeWindow(
  now: Date = new Date(),
  config?: UpsellConfig | null,
): TimeWindow | null {
  const hour = now.getHours();
  const adminWindows = config?.timeWindows?.filter((w) => w.active);
  if (adminWindows && adminWindows.length > 0) {
    const hit = adminWindows.find(
      (w) => hour >= w.startHour && hour < w.endHour,
    );
    if (!hit) return null;
    return {
      id: hit.id,
      variant: asTimeWindowVariant(hit.variant),
      startHour: hit.startHour,
      endHour: hit.endHour,
      title: hit.title,
      sub: hit.sub,
      badge: hit.badge,
      cta: hit.cta,
      addItemId: hit.addItemIdSuffix || undefined,
    };
  }
  return (
    DEFAULT_TIME_WINDOWS.find((w) => hour >= w.startHour && hour < w.endHour) ||
    null
  );
}
