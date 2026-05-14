import { MenuItem, MenuCategory, CartItem } from "@/data/types";

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
  config?: UpsellConfig | null
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
        reason: "Perfect after your meal — Italian espresso",
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
        reason: "Finish with our signature Tiramisù",
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
        reason: "Add a refreshing drink to your order",
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
        reason: "Add a pizza to make it a meal",
        priority: 4,
      });
    }
  }

  // Sort by priority and limit
  return suggestions
    .sort((a, b) => a.priority - b.priority)
    .slice(0, maxSuggestions);
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

// --- Per-segment free-delivery threshold (audit §2.5 Uber Eats) ----------
//
// First-time customers see a lower bar (less friction to first conversion);
// regulars see the standard 60 PLN; Gold/Platinum members get free delivery
// always as a retention perk. The numbers below match the audit's table.

export type CustomerSegment = "first-time" | "regular" | "vip";

/** Resolved tier should be calculated upstream via `calculateTier(points)`
 *  from `@/lib/loyalty` — kept as a plain string here to avoid an import
 *  cycle and to leave room for future segment classifiers. */
export interface CustomerSegmentInput {
  ordersCount?: number | null;
  tier?: string | null;
}

export const SEGMENT_FREE_DELIVERY_THRESHOLD: Record<CustomerSegment, number> = {
  "first-time": 3900, // 39 PLN — low bar to remove friction on visit 1
  regular: FREE_DELIVERY_THRESHOLD, // 60 PLN (default)
  vip: 0, // Gold / Platinum — always free
};

export function getCustomerSegment(
  customer: CustomerSegmentInput | null | undefined,
): CustomerSegment {
  if (!customer) return "first-time";
  const tier = (customer.tier || "").toLowerCase();
  if (tier === "gold" || tier === "platinum") return "vip";
  const orders = customer.ordersCount ?? 0;
  if (orders < 2) return "first-time";
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

/**
 * Returns the time window active at `now` (local hour), or null if no window
 * matches. Used by TodBanner to pick the right copy + CTA.
 *
 * `now` is a parameter so callers can fix the clock for tests; in production
 * it defaults to a fresh Date so each render reflects the actual hour.
 */
export function getActiveTimeWindow(now: Date = new Date()): TimeWindow | null {
  const hour = now.getHours();
  return (
    DEFAULT_TIME_WINDOWS.find((w) => hour >= w.startHour && hour < w.endHour) ||
    null
  );
}
