import { MenuItem, MenuCategory, CartItem, MenuRole, ModifierOption } from "@/data/types";

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

export type BadgeType =
  | "popular"
  | "staff-pick"
  | "new"
  | "best-value"
  | "hero"
  | "pizzaiolo-choice"
  | "chef-signature";

// Configurable upsell config shape (matches LocationUpsellConfig from store)
export interface UpsellConfig {
  popularItems?: string[];
  staffPicks?: string[];
  /** Menu-engineering badges managed from /admin/crosssell → Menu badges.
   *  Additive to any intrinsic `menuRole` on the seed item; the resolved
   *  badge set is the union so an item can be promoted to "Hero" without
   *  editing the seed data. */
  heroItems?: string[];
  pizzaioloChoiceItems?: string[];
  chefSignatureItems?: string[];
  newItems?: string[];
  preferredCoffee?: string;
  preferredDessert?: string;
  preferredDrink?: string;
  /** Audit §3 — fourth "Complete your meal" slot. Garlic bread is the
   *  highest-attach side for pizza orders. Admin-configurable per
   *  location so operators can swap it for bruschetta / arancini etc. */
  preferredGarlicBread?: string;
  combos?: {
    id: string;
    name: string;
    description: string;
    categories: string[];
    discountPercent: number;
    minItems: number;
    active: boolean;
    requiredItems?: { suffix: string; label: string }[];
    /** Channel restriction — see ComboDeal.channel. */
    channel?: "dine-in" | "delivery";
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
  const newItems = config?.newItems ?? NEW_ITEMS;
  if (popular.includes(itemId)) badges.push("popular");
  if (staffPicks.includes(itemId)) badges.push("staff-pick");
  if (newItems.includes(itemId)) badges.push("new");
  return badges;
}

/**
 * Menu-engineering sort order (audit §4.4 — Hierarchy Of Menu Page).
 * Hero → Profit-driver → Anchor → standard items by popularity → unranked.
 * Stable inside each band so the rest of the popularity ranking carries through.
 *
 * Drinks and desserts inside a *single category view* still follow this order;
 * the "drinks bottom of menu" rule from §4.4 is a cross-category hint that's
 * already enforced by the category tab order in MenuSection.
 */
export function compareMenuEngineering(
  a: { id: string; menuRole?: MenuRole },
  b: { id: string; menuRole?: MenuRole },
  locationSlug: string,
  config?: UpsellConfig | null,
): number {
  const rank = (role?: string) => {
    if (role === "hero") return 0;
    if (role === "profit-driver") return 1;
    if (role === "anchor") return 2;
    return 3;
  };
  const ra = rank(a.menuRole);
  const rb = rank(b.menuRole);
  if (ra !== rb) return ra - rb;
  // Inside the residual band: popularity → alphabetical fallback handled
  // by callers (MenuSection keeps the alphabetical tiebreak).
  const popular = config?.popularItems || DEFAULT_POPULAR_ITEMS[locationSlug] || [];
  const aPop = popular.includes(a.id) ? 0 : 1;
  const bPop = popular.includes(b.id) ? 0 : 1;
  return aPop - bPop;
}

/**
 * Menu-engineering badges derived directly from the item's `menuRole`
 * (audit §4.3). Kept separate from `getItemBadges` because:
 *  - menu role is intrinsic to the item; popularity/staff-pick are admin-
 *    editable per location,
 *  - role-based badges drive layout decisions (hero is full-width, profit
 *    drivers occupy the sweet-spot row) that admin overrides shouldn't move.
 * Returns the empty array for items without a role so callers can spread it
 * unconditionally.
 */
export function getMenuRoleBadges(
  item: { id?: string; menuRole?: MenuRole; isLimited?: boolean },
  config?: UpsellConfig | null,
): BadgeType[] {
  const out: BadgeType[] = [];
  const id = item.id;
  const isHero =
    item.menuRole === "hero" || (!!id && !!config?.heroItems?.includes(id));
  const isPizzaiolo =
    item.menuRole === "profit-driver" ||
    (!!id && !!config?.pizzaioloChoiceItems?.includes(id));
  const isChef =
    item.menuRole === "anchor" ||
    (!!id && !!config?.chefSignatureItems?.includes(id));
  if (isHero) out.push("hero");
  if (isPizzaiolo) out.push("pizzaiolo-choice");
  if (isChef) out.push("chef-signature");
  return out;
}

export const BADGE_CONFIG: Record<BadgeType, { label: string; color: string }> = {
  popular: { label: "Most Popular", color: "bg-italia-red/10 text-italia-red" },
  "staff-pick": { label: "Staff Pick", color: "bg-italia-gold/15 text-italia-gold-dark" },
  new: { label: "New", color: "bg-italia-green/10 text-italia-green" },
  "best-value": { label: "Best Value", color: "bg-purple-50 text-purple-600" },
  hero: { label: "Our Hero", color: "bg-italia-red text-white" },
  "pizzaiolo-choice": {
    label: "Pizzaiolo's Choice",
    color: "bg-italia-gold/15 text-italia-gold-dark",
  },
  "chef-signature": {
    label: "Chef's Signature",
    color: "bg-italia-dark text-italia-cream",
  },
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

// Default preferred cross-sell items per location — the four "Complete
// your meal" slots (audit §3). Admins override via LocationUpsellConfig;
// the engine falls back to these when no config exists.
const DEFAULT_PREFERRED_COFFEE: Record<string, string> = {
  krakow: "krk-drink-espresso",
  warszawa: "waw-drink-espresso",
};

const DEFAULT_PREFERRED_DESSERT: Record<string, string> = {
  krakow: "krk-dessert-tiramisu",
  warszawa: "waw-dessert-tiramisu",
};

const DEFAULT_PREFERRED_GARLIC_BREAD: Record<string, string> = {
  krakow: "krk-anti-garlic-bread",
  warszawa: "waw-anti-garlic-bread",
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
   * Optional pairing context (audit §3.1). When present, the reason copy
   * pivots to recognition language ("you added it 3 of last 4 visits")
   * for items the customer has strong attach signal on. The slot order
   * stays fixed — the four-slot model is the customer-facing contract.
   */
  pairingContext?: PairingContext | null,
): UpsellSuggestion[] {
  if (cartItems.length === 0 || allMenuItems.length === 0) return [];

  const locationSlug = cartItems[0]?.locationSlug || "";

  // "Complete your meal" is a fixed FOUR-slot panel (audit §3 product
  // direction): Espresso → Tiramisù → Garlic Bread → Limonata. Admins
  // override the SKU per slot in /admin/crosssell → Cart pairings.
  // Chips render even when the item is already in cart — the slot is the
  // shape of the panel, not a context-dependent recommendation. Customers
  // can keep tapping the same chip to add more of the SKU.
  const slots: { id: string | undefined; priority: number }[] = [
    { id: config?.preferredCoffee || DEFAULT_PREFERRED_COFFEE[locationSlug], priority: 1 },
    { id: config?.preferredDessert || DEFAULT_PREFERRED_DESSERT[locationSlug], priority: 2 },
    { id: config?.preferredGarlicBread || DEFAULT_PREFERRED_GARLIC_BREAD[locationSlug], priority: 3 },
    { id: config?.preferredDrink || DEFAULT_PREFERRED_DRINK[locationSlug], priority: 4 },
  ];

  const availableById = new Map(
    allMenuItems.filter((m) => m.available).map((m) => [m.id, m]),
  );
  // Drop duplicates if two slots resolve to the same SKU (e.g. admin sets
  // preferredDrink = preferredCoffee), keeping the lower-priority entry.
  const seenIds = new Set<string>();

  const out: UpsellSuggestion[] = [];
  for (const slot of slots) {
    if (!slot.id) continue;
    if (seenIds.has(slot.id)) continue;
    const item = availableById.get(slot.id);
    if (!item) continue;
    seenIds.add(slot.id);
    const baseReason = reasonForItem(item, "Complete your meal");
    const suggestion: UpsellSuggestion = {
      item,
      reason: pairingContext
        ? contextualReason({ item, reason: baseReason, priority: slot.priority }, pairingContext)
        : baseReason,
      priority: slot.priority,
    };
    out.push(suggestion);
  }

  return out.slice(0, maxSuggestions);
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

export interface ComboDealRequiredItem {
  /** Suffix matched against menuItem.id with endsWith. Use the part after
   *  the location prefix, e.g. "pizza-margherita" to match both
   *  "krk-pizza-margherita" and "waw-pizza-margherita" without needing
   *  per-truck entries. Mirrors the BundleSlot itemIdSuffix convention. */
  suffix: string;
  /** Friendly label rendered in the "still need: Margherita" banner copy. */
  label: string;
}

export interface ComboDeal {
  id: string;
  name: string;
  description: string;
  categories: MenuCategory[];
  discountPercent: number;
  minItems: number;
  /** When set, the combo only activates if the cart contains an item
   *  matching every required suffix. Generic category-only combos leave
   *  this undefined and match any item from the listed categories. */
  requiredItems?: ComboDealRequiredItem[];
  /** Channel restriction (audit §3 — dine-in vs delivery economics).
   *  Unset = both channels; "dine-in" = truck only; "delivery" = delivery
   *  only. Lets operators run dine-in-exclusive premium experiences or
   *  delivery-exclusive pantry bundles without code changes. */
  channel?: "dine-in" | "delivery";
}

// Default combos (used when no admin config exists for the location).
// Audit §3 — DO NOT discount the success path. Espresso and Tiramisù have
// 60% / 28% organic attach to pizza orders. Discounting them subsidises a
// behaviour customers already do for free. The new Italian Classic Deal
// gates on Limonata (a non-organic-attach drink) so the combo captures
// a different cohort than the existing espresso upsell.
export const DEFAULT_COMBO_DEALS: ComboDeal[] = [
  {
    id: "italian-classic",
    name: "Italian Classic Deal",
    description: "Margherita + Limonata + Tiramisù",
    categories: ["pizza", "drinks", "desserts"],
    requiredItems: [
      { suffix: "pizza-margherita", label: "Margherita" },
      { suffix: "drink-limonata", label: "Limonata" },
      { suffix: "dessert-tiramisu", label: "Tiramisù" },
    ],
    discountPercent: 10,
    minItems: 3,
  },
  // Pasta Combo — honours the lunch TodBanner promise ("Add a pasta and a
  // drink to save 10%"). Also the graceful fallback when a customer locks
  // the Lunch bundle (pasta + drink + Panna Cotta) and then removes the
  // dessert: the cart drops out of the bundle but the 10% combo still
  // applies on what's left. Keeping dessert OUT of the discount aligns
  // with the §3 audit rule — dessert has high organic attach we don't
  // want to subsidise.
  {
    id: "pasta-combo",
    name: "Pasta Combo",
    description: "Any pasta + drink",
    categories: ["pasta", "drinks"],
    discountPercent: 10,
    minItems: 2,
  },
  // Pizza + Garlic Bread combo — replaces the dead Lunch Special (panini +
  // drink, 2 PLN savings, ignored at 0% activation). Garlic bread has a
  // higher attach intent than panini and is a real lunch driver.
  {
    id: "pizza-side",
    name: "Pizza & Side",
    description: "Any pizza + garlic bread",
    categories: ["pizza", "antipasti"],
    requiredItems: [
      { suffix: "anti-garlic-bread", label: "Garlic Bread" },
    ],
    discountPercent: 12,
    minItems: 2,
  },
];

// Keep backward-compatible export
export const COMBO_DEALS = DEFAULT_COMBO_DEALS;

export interface ComboDealResult {
  activeDeal: ComboDeal | null;
  savings: number;
  /** Categories from `deal.categories` not yet present in the cart. Stays
   *  populated for category-only combos so the banner can keep its existing
   *  "add a pizza, drinks" copy. Item-required combos leave this empty and
   *  use `missingItems` instead. */
  missingCategories: MenuCategory[];
  /** Friendly labels for required items still missing from the cart, used
   *  by item-required combos like "Italian Classic Deal" (Margherita,
   *  Espresso, Tiramisù). Empty for generic category-only combos. */
  missingItems: string[];
  /** Additional cart units needed to satisfy `minItems`. Zero when the
   *  qty gate is already met. Surfaced so the banner can render "Add 1
   *  more item" when categories/items are all matched but minItems is
   *  short. */
  missingQuantity: number;
  progress: number;
  /** True only when the combo is fully satisfied — categories matched AND
   *  every required item matched AND total quantity ≥ minItems. Discount
   *  callers MUST gate on this rather than `missingCategories.length === 0`
   *  so item-required combos don't apply prematurely. */
  isComplete: boolean;
}

export function getActiveComboDeals(
  cartItems: CartItem[],
  config?: UpsellConfig | null,
  /** Filter combos by fulfillment channel (audit §3). When omitted, every
   *  combo applies regardless of channel — used by the cart's pre-checkout
   *  preview where the channel isn't pinned yet. When passed, dine-in
   *  combos only fire on "takeout" / dine-in carts and delivery combos
   *  only fire on "delivery" carts. */
  fulfillmentType?: "takeout" | "delivery" | null,
): ComboDealResult {
  const allCombos: ComboDeal[] = config?.combos
    ? config.combos
        .filter((c) => c.active)
        .map((c) => ({
          ...c,
          categories: c.categories as MenuCategory[],
          channel: c.channel as ComboDeal["channel"],
        }))
    : DEFAULT_COMBO_DEALS;
  // Channel filter: undefined channel = always available; "dine-in" only
  // when fulfillmentType≠"delivery"; "delivery" only when fulfillmentType="delivery".
  const combos: ComboDeal[] = allCombos.filter((c) => {
    if (!c.channel) return true;
    if (!fulfillmentType) return true; // No channel context yet — show.
    if (c.channel === "delivery") return fulfillmentType === "delivery";
    return fulfillmentType !== "delivery";
  });

  const empty: ComboDealResult = {
    activeDeal: null,
    savings: 0,
    missingCategories: [],
    missingItems: [],
    missingQuantity: 0,
    progress: 0,
    isComplete: false,
  };

  if (combos.length === 0 || cartItems.length === 0) return empty;

  const cartCategories = new Set(cartItems.map((ci) => ci.menuItem.category));
  const totalQuantity = cartItems.reduce((s, ci) => s + ci.quantity, 0);

  // Cheapest unit price per category present in the cart. Used to cap the
  // discount at "one combo's worth" — without this a cart of 5 pizzas + drink
  // + dessert would get 10% off all 5 pizzas, scaling unbounded with qty.
  const cheapestByCategory = new Map<MenuCategory, number>();
  for (const ci of cartItems) {
    const cat = ci.menuItem.category;
    const prev = cheapestByCategory.get(cat);
    if (prev === undefined || ci.menuItem.price < prev) {
      cheapestByCategory.set(cat, ci.menuItem.price);
    }
  }

  // Pre-compute the cheapest unit price per required-item suffix across
  // every combo's requirements. One O(N · S) pass replaces a per-suffix
  // scan per call inside the scoring loop.
  const allSuffixes = new Set<string>();
  for (const c of combos) {
    if (c.requiredItems) {
      for (const r of c.requiredItems) allSuffixes.add(r.suffix);
    }
  }
  const cheapestBySuffix = new Map<string, number>();
  for (const ci of cartItems) {
    for (const suffix of allSuffixes) {
      if (!ci.menuItem.id.endsWith(suffix)) continue;
      const prev = cheapestBySuffix.get(suffix);
      if (prev === undefined || ci.menuItem.price < prev) {
        cheapestBySuffix.set(suffix, ci.menuItem.price);
      }
    }
  }

  type Scored = {
    deal: ComboDeal;
    missingCategories: MenuCategory[];
    missingItemLabels: string[];
    missingQuantity: number;
    progress: number;
    savings: number;
    complete: boolean;
    index: number;
  };

  const scored: Scored[] = combos.map((deal, index) => {
    // Defensive dedupe — admin UI uses checkboxes/unique pickers but
    // direct API calls could submit duplicates, which would otherwise
    // count the same item's price twice in the savings reduce.
    const uniqueCats = Array.from(new Set(deal.categories));
    const matchedCats = uniqueCats.filter((c) => cartCategories.has(c));
    const missingCats = uniqueCats.filter((c) => !cartCategories.has(c));
    const qtyShort = Math.max(0, deal.minItems - totalQuantity);

    if (deal.requiredItems && deal.requiredItems.length > 0) {
      // Item-required path: completion gated on suffix matches, not just
      // categories. Dedupe suffixes by the suffix key so two label aliases
      // for the same item don't double-count toward savings.
      const uniqueBySuffix = new Map<string, ComboDealRequiredItem>();
      for (const r of deal.requiredItems) {
        if (!uniqueBySuffix.has(r.suffix)) uniqueBySuffix.set(r.suffix, r);
      }
      const required = Array.from(uniqueBySuffix.values());
      const matchedReq = required.filter(
        (r) => cheapestBySuffix.get(r.suffix) !== undefined,
      );
      const missingReq = required.filter(
        (r) => cheapestBySuffix.get(r.suffix) === undefined,
      );
      const reqProgress = matchedReq.length / required.length;
      const oneComboSubtotal = matchedReq.reduce(
        (s, r) => s + (cheapestBySuffix.get(r.suffix) ?? 0),
        0,
      );
      const savings = Math.round(oneComboSubtotal * (deal.discountPercent / 100));
      const complete = missingReq.length === 0 && qtyShort === 0;
      return {
        deal,
        missingCategories: complete ? [] : missingCats,
        missingItemLabels: missingReq.map((r) => r.label),
        missingQuantity: complete ? 0 : qtyShort,
        progress: complete ? 1 : reqProgress,
        savings,
        complete,
        index,
      };
    }

    // Category-only path.
    const reqCount = uniqueCats.length;
    const progress = reqCount === 0 ? 0 : matchedCats.length / reqCount;
    const oneComboSubtotal = matchedCats.reduce(
      (s, c) => s + (cheapestByCategory.get(c) ?? 0),
      0,
    );
    const savings = Math.round(oneComboSubtotal * (deal.discountPercent / 100));
    const complete =
      reqCount > 0 && missingCats.length === 0 && qtyShort === 0;
    return {
      deal,
      missingCategories: missingCats,
      missingItemLabels: [],
      missingQuantity: complete ? 0 : qtyShort,
      progress,
      savings,
      complete,
      index,
    };
  });

  // Complete combos always beat partial ones so the customer gets a real
  // applied discount, not a "you could save X" hint. Within each bucket
  // we prefer the largest savings; original index breaks ties so the order
  // the admin set in the config is honoured.
  const complete = scored.filter((s) => s.complete);
  if (complete.length > 0) {
    complete.sort((a, b) => b.savings - a.savings || a.index - b.index);
    const w = complete[0];
    return {
      activeDeal: w.deal,
      savings: w.savings,
      missingCategories: [],
      missingItems: [],
      missingQuantity: 0,
      progress: 1,
      isComplete: true,
    };
  }

  // Partial: combos with at least one match OR all-matched-but-qty-short
  // (so the banner can prompt "Add 1 more item to unlock").
  const partial = scored.filter((s) => {
    if (s.complete) return false;
    const anyCategoryMatched =
      s.missingCategories.length < Array.from(new Set(s.deal.categories)).length;
    const anyItemMatched =
      s.deal.requiredItems
        ? s.missingItemLabels.length <
          new Set(s.deal.requiredItems.map((r) => r.suffix)).size
        : false;
    const qtyOnlyShort =
      s.missingCategories.length === 0 &&
      s.missingItemLabels.length === 0 &&
      s.missingQuantity > 0;
    return anyCategoryMatched || anyItemMatched || qtyOnlyShort;
  });
  if (partial.length === 0) return empty;
  partial.sort((a, b) => b.savings - a.savings || a.index - b.index);
  const w = partial[0];
  return {
    activeDeal: w.deal,
    savings: w.savings,
    missingCategories: w.missingCategories,
    missingItems: w.missingItemLabels,
    missingQuantity: w.missingQuantity,
    progress: w.progress,
    isComplete: false,
  };
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
// Five bands (audit §3 update — VIPs now have a non-zero floor so a Gold
// customer can't get free delivery on a 6.90 PLN bottle of water):
//   first-time (orders < 2)      → 39 PLN — remove friction on visit 1
//   growing    (orders 2–4)      → 49 PLN — slight raise as confidence builds
//   regular    (orders ≥ 5)      → 59 PLN — they'll hit it anyway
//   vip        (Gold / Platinum) → 35 PLN — non-zero floor protects delivery
//                                  unit economics; below 35 the VIP pays the
//                                  standard fee. The "free delivery" perk is
//                                  surfaced as "free above 35 PLN" copy.
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
  vip: 3500, // 35 PLN — non-zero floor protects courier economics
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

export interface DeliveryThresholdOverride {
  firstTime?: number;
  growing?: number;
  regular?: number;
  vip?: number;
}

export function getDeliveryThresholdForCustomer(
  customer: CustomerSegmentInput | null | undefined,
  /** Admin-supplied per-segment overrides (audit §3) — when set, beat
   *  the SEGMENT_FREE_DELIVERY_THRESHOLD defaults. Undefined per-segment
   *  values fall back to the defaults so an operator can retune one tier
   *  without re-setting all four. */
  override?: DeliveryThresholdOverride | null,
): number {
  const segment = getCustomerSegment(customer);
  const map: Record<CustomerSegment, number | undefined> = {
    "first-time": override?.firstTime,
    growing: override?.growing,
    regular: override?.regular,
    vip: override?.vip,
  };
  const fromOverride = map[segment];
  return typeof fromOverride === "number"
    ? Math.max(0, fromOverride)
    : SEGMENT_FREE_DELIVERY_THRESHOLD[segment];
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
    comboId: "pasta-combo",
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
    sub: "Margherita + Limonata + Tiramisù save 10% with our Italian Classic Deal",
    badge: "Tip",
    cta: "What pairs well",
    comboId: "italian-classic",
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

// --- Item modifiers (audit §3) ------------------------------------------
//
// Modifier groups attach to MenuItem. Each cart line carries
// `selectedModifiers[]` referencing groupId + optionId. The helpers below
// sum priceDelta and costDelta across selections so the cart drawer,
// checkout, and bundle margin alert agree on a single source of truth.

/** Resolve a SelectedModifier reference to its option in the item's
 *  current modifierGroups. Returns null for unknown / stale references
 *  (e.g. admin removed the option after the customer's cart was hydrated). */
export function findModifierOption(
  item: MenuItem,
  groupId: string,
  optionId: string,
): ModifierOption | null {
  const group = item.modifierGroups?.find((g) => g.id === groupId);
  if (!group) return null;
  return group.options.find((o) => o.id === optionId) ?? null;
}

/** Per-unit modifier price delta in grosze. Sum of every selected option's
 *  priceDelta, clamped at 0 (negative deltas are ignored — modifiers can
 *  never refund). */
export function modifierPriceDelta(
  cartItem: Pick<CartItem, "menuItem" | "selectedModifiers">,
): number {
  if (!cartItem.selectedModifiers || cartItem.selectedModifiers.length === 0) return 0;
  let total = 0;
  for (const sel of cartItem.selectedModifiers) {
    const opt = findModifierOption(cartItem.menuItem, sel.groupId, sel.optionId);
    if (!opt) continue;
    if (opt.priceDelta > 0) total += opt.priceDelta;
  }
  return total;
}

/** Per-unit modifier cost delta in grosze. Used for honest margin calc. */
export function modifierCostDelta(
  cartItem: Pick<CartItem, "menuItem" | "selectedModifiers">,
): number {
  if (!cartItem.selectedModifiers || cartItem.selectedModifiers.length === 0) return 0;
  let total = 0;
  for (const sel of cartItem.selectedModifiers) {
    const opt = findModifierOption(cartItem.menuItem, sel.groupId, sel.optionId);
    if (!opt || typeof opt.costDelta !== "number") continue;
    if (opt.costDelta > 0) total += opt.costDelta;
  }
  return total;
}

/** Effective per-unit price including modifiers — the unit price the
 *  cart UI and checkout should both display. */
export function effectiveUnitPrice(
  cartItem: Pick<CartItem, "menuItem" | "selectedModifiers">,
): number {
  return cartItem.menuItem.price + modifierPriceDelta(cartItem);
}

/** Effective per-unit food cost including modifiers — used for the
 *  bundle low-margin alert + Reports gross-margin column. */
export function effectiveUnitCost(
  cartItem: Pick<CartItem, "menuItem" | "selectedModifiers">,
): number {
  return cartItem.menuItem.cost + modifierCostDelta(cartItem);
}

// --- Packaging cost (audit §3 — delivery economics) ---------------------
//
// Per-item packaging cost (grosze) used to compute delivery margin
// honestly. Falls back to a category baseline when MenuItem.packagingCost
// is unset. Subtracted from contribution when fulfillment="delivery".
//
//   pizza        — box + napkin set         180 grosze
//   pasta        — tray + lid + napkin       250 grosze
//   antipasti    — tray + cutlery            150 grosze
//   panini       — wrap + napkin              80 grosze
//   drinks       — bottle / cup carrier       60 grosze (per unit)
//   desserts     — sealed cup                100 grosze
//
// Bundles add a brand-carrier-bag surcharge of ~180 grosze split across
// lines so the per-line attribution adds up. The cart drawer renders the
// total as a delivery surcharge line item for transparency.

const CATEGORY_PACKAGING_COST_FALLBACK: Record<MenuCategory, number> = {
  pizza: 180,
  pasta: 250,
  antipasti: 150,
  panini: 80,
  drinks: 60,
  desserts: 100,
};

/** Per-unit packaging cost in grosze for a menu item under a given channel.
 *  Returns 0 for non-delivery channels — packaging is internalised at the
 *  truck for dine-in. */
export function packagingCostFor(
  item: MenuItem,
  fulfillmentType: "takeout" | "delivery",
): number {
  if (fulfillmentType !== "delivery") return 0;
  if (typeof item.packagingCost === "number") return item.packagingCost;
  return CATEGORY_PACKAGING_COST_FALLBACK[item.category] ?? 100;
}

/** Sum the packaging cost across a cart for a given fulfillment channel.
 *  Used by the bundle margin alert + the Reports delivery profitability
 *  endpoint to make sure delivery margin is computed against real
 *  packaging cost, not naked plate cost. */
export function totalPackagingCost(
  cartItems: CartItem[],
  fulfillmentType: "takeout" | "delivery",
): number {
  if (fulfillmentType !== "delivery") return 0;
  return cartItems.reduce(
    (s, ci) => s + packagingCostFor(ci.menuItem, fulfillmentType) * ci.quantity,
    0,
  );
}

// --- KDS complexity scoring (audit §5 — operations) ---------------------
//
// Single number 0..N that captures how much load a ticket places on the
// kitchen. The expo / pass screen sorts by descending complexity so a
// Family Feast (12 lines, 4 stations) lands at the top with a "PRIORITY:
// COMPLEX BUNDLE" badge and the line can fire the longest-prep items first.
//
// Weights are tuned to roughly minutes of station occupancy:
//   pizza      1.0   (oven slot)
//   pasta      0.8   (pan + plating)
//   antipasti  0.6   (cold prep or fryer)
//   panini     0.5   (press + plating)
//   desserts   0.4   (cold plate / dusting)
//   drinks     0.15  (grab-and-go)
//
// A Family Feast with 4 pizzas + 2 antipasti + 4 drinks + 1 tiramisù
// scores 4·1 + 2·0.6 + 4·0.15 + 1·0.4 = 6.2. Anything ≥ 6 is "complex"
// and the KDS card surfaces the priority badge.

const CATEGORY_COMPLEXITY_WEIGHT: Record<MenuCategory, number> = {
  pizza: 1.0,
  pasta: 0.8,
  antipasti: 0.6,
  panini: 0.5,
  desserts: 0.4,
  drinks: 0.15,
};

export interface TicketComplexity {
  score: number;
  lineCount: number;
  /** Distinct stations a ticket hits (pizza oven, cold prep, drinks, dessert).
   *  Used by KDS to highlight tickets that touch 4+ stations. */
  stationCount: number;
  isComplex: boolean;
}

export const KDS_COMPLEX_THRESHOLD = 6;

export function computeTicketComplexity(
  cartItems: CartItem[],
): TicketComplexity {
  let score = 0;
  let lineCount = 0;
  const stations = new Set<MenuCategory>();
  for (const ci of cartItems) {
    const weight = CATEGORY_COMPLEXITY_WEIGHT[ci.menuItem.category] ?? 0.5;
    score += weight * ci.quantity;
    lineCount += ci.quantity;
    stations.add(ci.menuItem.category);
  }
  return {
    score: Math.round(score * 10) / 10,
    lineCount,
    stationCount: stations.size,
    isComplex: score >= KDS_COMPLEX_THRESHOLD,
  };
}

