import { MenuItem, MenuCategory, CartItem, FulfillmentType } from "@/data/types";

/**
 * Bundle architecture (audit §3.2 — decoy + anchor).
 *
 * Two pricing modes:
 *
 *   fixed   — locked price, locked composition. Lunch tiers use this: a
 *             customer picks Lunch+ and gets the exact 1 pasta + 1 drink +
 *             tiramisù at the configured flat price.
 *
 *   dynamic — locked add-on composition, but the mains (pizza/pasta) scale
 *             with whatever the customer already added. Price is computed
 *             live from menu × cart at apply time. Family tiers use this:
 *             3 margheritas in cart + tap Family Feast = 3 pizzas + 2 antipasti
 *             + 4 drinks + tiramisù at (à la carte × 0.72).
 *
 * Each tier still uses the decoy + anchor + default-push pattern from
 * Dan Ariely's pricing work. The behaviour shape matters more than the
 * items — admins can swap items per location via /admin/upsell. The
 * `pricingMode` discriminant is optional in stored configs; missing
 * means "fixed" so pre-existing saved bundles round-trip unchanged.
 */

export type BundleMealPeriod = "lunch" | "family" | "lateNight";

export type BundleSlot =
  | { kind: "category"; category: MenuCategory; quantity: number }
  | { kind: "item"; itemIdSuffix: string; quantity: number };

interface BundleBase {
  id: string;
  /** Short tier label rendered in the chip header — Solo / Lunch / Family Feast. */
  tier: string;
  /** Headline used as the chip's name. Keep <24 chars for the cart drawer. */
  name: string;
  /** One-sentence composition copy rendered under the name. */
  description: string;
  composition: BundleSlot[];
  mealPeriod: BundleMealPeriod;
  /** When true, the chip renders with the gold "Best value" badge. */
  isAnchor?: boolean;
  /** When true, the chip is a decoy — slightly muted styling. */
  isDecoy?: boolean;
  /** When true, the chip renders with the red "Most picked" badge and is
   *  visually pre-selected. The McDonald's combo effect. */
  isDefault?: boolean;
  active: boolean;
  /** Scarcity / time-pressure framing — ISO YYYY-MM-DD. When in the
   *  future, the chip shows a "limited until <date>" badge to add
   *  urgency. Past dates auto-deactivate the bundle so an admin who
   *  shipped a "this week only" deal can't accidentally leave it
   *  running. */
  limitedUntil?: string;
  /** Per-day-of-week gating. Lower-case English day names; empty/unset
   *  = always available. Drives merchandising on weekly cadences
   *  (Friday Family Feast push, Wednesday Lunch+ default, etc.). */
  activeDays?: string[];
  /** Channel restriction (audit §3 — dine-in vs delivery economics).
   *  Unset = both channels; "dine-in" = truck-only experience offer;
   *  "delivery" = delivery-only pantry/heavy-AOV play. */
  channel?: "dine-in" | "delivery";
  /** Member-exclusive bundle pricing (audit §3). When true, the bundle
   *  only surfaces to customers with a non-empty phone on file — i.e.
   *  customers who have given us a phone number for loyalty. Drives
   *  phone-collection as a measurable conversion rather than a passive
   *  ask. */
  membersOnly?: boolean;
}

export interface BundleFixedTier extends BundleBase {
  /** Optional — missing = "fixed" for back-compat with pre-existing saved configs. */
  pricingMode?: "fixed";
  /** Locked bundle price in grosze. */
  priceGrosze: number;
  /** "You'd pay" reference price in grosze — drives the strikethrough +
   *  savings copy. Always greater than priceGrosze for paid tiers. */
  refPriceGrosze: number;
}

export interface BundleDynamicTier extends BundleBase {
  pricingMode: "dynamic";
  /** Categories that scale with the cart — typically ["pizza", "pasta"].
   *  Customer-supplied mains in these categories carry over into the
   *  bundle 1:1 at their à la carte price (before discount). */
  mainCategories: MenuCategory[];
  /** Minimum mains in cart for this tier to apply. The ladder also uses
   *  this as the "show this chip" gate so a small cart doesn't see the
   *  bigger tier. */
  minMains: number;
  /** Hard cap — required on every dynamic tier so a 50-pizza cart can't
   *  abuse the discount. */
  maxMains?: number;
  /** Single discount percent applied uniformly to mains + add-ons.
   *  0–50. Used when split-discount fields aren't set (back-compat). */
  discountPercent: number;
  /** Split-discount mode: apply different %s to mains vs add-ons so
   *  operators can protect demand-anchor margin (low % on pizza, high %
   *  on drinks/desserts). When either is set the other defaults to it,
   *  but both should be configured for split mode to make sense. */
  mainsDiscountPercent?: number;
  addOnsDiscountPercent?: number;
  /** Optional loyalty gate — only Gold/Platinum customers see this tier.
   *  Resolves via calculateTier(customer.points) on the client + server. */
  requiredTier?: "gold" | "platinum";
}

export type BundleTier = BundleFixedTier | BundleDynamicTier;

/**
 * Contribution-margin floor for a bundle, as a 0–1 ratio
 * ((price − food cost) / price). A bundle whose margin drops below this
 * is "bleeding" — it discounts past the point where the order still
 * carries its plate cost plus a healthy contribution.
 *
 * Single source of truth for every margin signal so they can't disagree:
 *   - the post-order `bundle_low_margin` operator alert (createOrder.ts),
 *   - the live margin preview tones in the bundle editor,
 *   - the save-time guardian confirm in the Upsell admin (audit
 *     bundle-ladder-revenue-rebuild — "per-bundle margin floor enforcement
 *     at admin save-time").
 * Keep it at 0.4: the 50% blended target is aspirational, but 40% is the
 * line below which a single bundle is actively eroding contribution.
 */
export const BUNDLE_MARGIN_FLOOR = 0.4;

/** Type guard — treats missing pricingMode as "fixed" so legacy entries work. */
export function isDynamicBundle(b: BundleTier): b is BundleDynamicTier {
  return b.pricingMode === "dynamic";
}

/**
 * Default bundles per location — composition uses category slots so this
 * single list works for both Kraków and Warszawa without referencing
 * per-truck item IDs. Admin can override via LocationUpsellConfig.bundles.
 *
 * Restructured per audit §3 (May 2026):
 *   1) Parallel lunch ladders — pizza-led AND pasta-led. Previous lunch
 *      ladder was pasta-only on a Neapolitan-pizza brand.
 *   2) Family minimum raised to 3 mains (was 2 — was cannibalising
 *      couple orders).
 *   3) Family Feast add-ons discount capped at 30% (was 40% — pushed
 *      blended discount past 25% margin floor).
 *   4) Feast Deluxe rebuilt as a true decoy (6+ mains gate, higher
 *      discount only unlocks at scale — anchor dominates at lower counts).
 *   5) Pizza Family Pack — fixed-price simple bundle for couple/quad
 *      orders (3 pizzas + 1L drink at 99 / 119 PLN). The simplest possible
 *      bundle, marketed first.
 *   6) Late-night expanded into a real ladder — slice tier, classic
 *      tier, party tier.
 *   7) Hungry rebuilt as a true decoy — savings % dropped below Lunch+
 *      so dominance theory works in the right direction.
 */
export const DEFAULT_BUNDLES: BundleTier[] = [
  // ---- Lunch (audit §3, restructured): parallel pasta + pizza ladders.
  // Pasta ladder kept the original line-up with the decoy fixed.
  {
    id: "lunch-solo",
    tier: "Solo",
    name: "Pasta + water",
    description: "1 pasta + 1 mineral water. Anchored in the deal.",
    priceGrosze: 2790,
    refPriceGrosze: 2980,
    composition: [
      { kind: "category", category: "pasta", quantity: 1 },
      { kind: "item", itemIdSuffix: "drink-water", quantity: 1 },
    ],
    mealPeriod: "lunch",
    active: true,
  },
  {
    id: "lunch-classic",
    tier: "Lunch",
    name: "Pasta + drink + Panna Cotta",
    description: "1 pasta + 1 drink + Panna Cotta — the value tier.",
    priceGrosze: 3890,
    refPriceGrosze: 4685,
    composition: [
      { kind: "category", category: "pasta", quantity: 1 },
      { kind: "category", category: "drinks", quantity: 1 },
      { kind: "item", itemIdSuffix: "dessert-panna-cotta", quantity: 1 },
    ],
    mealPeriod: "lunch",
    isDefault: true,
    active: true,
  },
  {
    id: "lunch-plus",
    tier: "Lunch+",
    name: "Pasta + drink + Tiramisù",
    description: "Just +6 zł more — the premium dessert.",
    priceGrosze: 4490,
    refPriceGrosze: 5485,
    composition: [
      { kind: "category", category: "pasta", quantity: 1 },
      { kind: "category", category: "drinks", quantity: 1 },
      { kind: "item", itemIdSuffix: "dessert-tiramisu", quantity: 1 },
    ],
    mealPeriod: "lunch",
    isAnchor: true,
    active: true,
  },
  {
    id: "lunch-hungry",
    tier: "Big Lunch",
    name: "+ bruschetta + espresso",
    description: "For a real one. Five lines on the bill.",
    // Hungry priced so its discount % is LOWER than Lunch+ — true decoy.
    // Lunch+ saves ~18%, Big Lunch saves ~13% on a higher absolute base.
    // Customer comparison: Big Lunch costs more AND saves less per zloty.
    priceGrosze: 6890,
    refPriceGrosze: 7875,
    composition: [
      { kind: "category", category: "pasta", quantity: 1 },
      { kind: "category", category: "drinks", quantity: 1 },
      { kind: "item", itemIdSuffix: "dessert-tiramisu", quantity: 1 },
      { kind: "item", itemIdSuffix: "anti-bruschetta", quantity: 1 },
      { kind: "item", itemIdSuffix: "drink-espresso", quantity: 1 },
    ],
    mealPeriod: "lunch",
    isDecoy: true,
    active: true,
  },

  // Pizza-led lunch ladder — NEW (audit §3). Pizza is the hero product,
  // pasta was the only lunch option. Margherita Personale (8") is the
  // entry size so lunch-lead prices stay below the standard 12".
  {
    id: "lunch-pizza-solo",
    tier: "Pizza Solo",
    name: "Personal pizza + water",
    description: "8\" Margherita + mineral water. Quick lunch.",
    priceGrosze: 2290,
    refPriceGrosze: 2480,
    composition: [
      { kind: "item", itemIdSuffix: "pizza-personale", quantity: 1 },
      { kind: "item", itemIdSuffix: "drink-water", quantity: 1 },
    ],
    mealPeriod: "lunch",
    active: true,
  },
  {
    id: "lunch-pizza-classic",
    tier: "Pizza Lunch",
    name: "Pizza + drink + Panna Cotta",
    description: "Any pizza + 1 drink + Panna Cotta.",
    priceGrosze: 3990,
    refPriceGrosze: 4985,
    composition: [
      { kind: "category", category: "pizza", quantity: 1 },
      { kind: "category", category: "drinks", quantity: 1 },
      { kind: "item", itemIdSuffix: "dessert-panna-cotta", quantity: 1 },
    ],
    mealPeriod: "lunch",
    isDefault: true,
    active: true,
  },
  {
    id: "lunch-pizza-plus",
    tier: "Pizza Lunch+",
    name: "Pizza + drink + Tiramisù",
    description: "Just +5 zł more — the premium dessert.",
    priceGrosze: 4490,
    refPriceGrosze: 5485,
    composition: [
      { kind: "category", category: "pizza", quantity: 1 },
      { kind: "category", category: "drinks", quantity: 1 },
      { kind: "item", itemIdSuffix: "dessert-tiramisu", quantity: 1 },
    ],
    mealPeriod: "lunch",
    isAnchor: true,
    active: true,
  },

  // Pizza Family Pack — NEW (audit §3). Fixed-price 3-pizza family bundle
  // that DOMINATES the dynamic family ladder for the simple "couple of
  // friends" use case. Composition is opinionated: 3 Margheritas + 1L
  // Limonata. Customer can swap to other pizzas in the composer but
  // pricing locks here. refPrice = 3 × Margherita Kraków (27.90) + Limonata
  // 1L Kraków (19.90) = 103.60 — matches actual ala carte at the lower-
  // priced location so the "Save" claim is honest for both trucks.
  {
    id: "family-pizza-pack",
    tier: "Pizza Pack",
    name: "3 pizzas + 1L drink",
    description: "Three pizzas + a 1L bottle. Set price, no maths.",
    priceGrosze: 9900,
    refPriceGrosze: 10360,
    composition: [
      { kind: "item", itemIdSuffix: "pizza-margherita", quantity: 3 },
      { kind: "item", itemIdSuffix: "drink-limonata-1l", quantity: 1 },
    ],
    mealPeriod: "family",
    isDefault: true,
    active: true,
  },

  // ---- Family ladder (dynamic — mains scale with cart) -----------------
  // Audit §3 update — minimum raised from 2 → 3 mains. Discount caps
  // tightened to keep blended margin ≥ 50%.
  {
    id: "family",
    tier: "Family",
    name: "Your pizzas + sides",
    description: "Your mains + bruschetta + 2 drinks",
    pricingMode: "dynamic",
    mainCategories: ["pizza", "pasta"],
    minMains: 3,
    maxMains: 6,
    discountPercent: 18,
    mainsDiscountPercent: 8,
    addOnsDiscountPercent: 28,
    composition: [
      { kind: "category", category: "antipasti", quantity: 1 },
      { kind: "category", category: "drinks", quantity: 2 },
    ],
    mealPeriod: "family",
    active: true,
  },
  {
    id: "family-feast",
    tier: "Family Feast",
    name: "Whole-table dinner",
    description: "Your mains + 2 antipasti + 4 drinks + tiramisù",
    pricingMode: "dynamic",
    mainCategories: ["pizza", "pasta"],
    minMains: 3,
    maxMains: 8,
    discountPercent: 22,
    mainsDiscountPercent: 12,
    addOnsDiscountPercent: 30,
    composition: [
      { kind: "category", category: "antipasti", quantity: 2 },
      { kind: "category", category: "drinks", quantity: 4 },
      { kind: "item", itemIdSuffix: "dessert-tiramisu", quantity: 1 },
    ],
    mealPeriod: "family",
    isAnchor: true,
    active: true,
  },
  {
    id: "family-deluxe",
    tier: "Feast Deluxe",
    name: "Big group, no leftovers",
    description: "Your mains + 2 antipasti + 6 drinks + 2 desserts",
    pricingMode: "dynamic",
    mainCategories: ["pizza", "pasta"],
    // True decoy: gate at 6 mains so it only unlocks for very large parties.
    // At low counts (3–5 mains) the customer sees only Family + Feast, so
    // Family Feast wins on dominance. At 6+ Feast Deluxe becomes the
    // genuine best deal (25% blended), rewarding scale.
    minMains: 6,
    maxMains: 12,
    discountPercent: 25,
    mainsDiscountPercent: 15,
    addOnsDiscountPercent: 38,
    composition: [
      { kind: "category", category: "antipasti", quantity: 2 },
      { kind: "category", category: "drinks", quantity: 6 },
      { kind: "category", category: "desserts", quantity: 2 },
    ],
    mealPeriod: "family",
    isDecoy: true,
    active: true,
  },

  // ---- Late-night (audit §3 — expanded to a real ladder) ---------------
  // Slice tier captures the 1AM post-club demographic. Late Party tier
  // captures the group-of-4 segment.
  {
    id: "late-slice",
    tier: "Slice",
    name: "Slice + drink",
    description: "1 slice reheated to order + 1 drink.",
    priceGrosze: 1690,
    refPriceGrosze: 1780,
    composition: [
      { kind: "item", itemIdSuffix: "pizza-slice", quantity: 1 },
      { kind: "category", category: "drinks", quantity: 1 },
    ],
    mealPeriod: "lateNight",
    active: true,
  },
  {
    id: "late-night",
    tier: "Late dinner",
    name: "Pizza + drink + dessert",
    description: "Your pizza + 1 drink + tiramisù",
    pricingMode: "dynamic",
    mainCategories: ["pizza"],
    minMains: 1,
    maxMains: 3,
    discountPercent: 20,
    mainsDiscountPercent: 10,
    addOnsDiscountPercent: 32,
    composition: [
      { kind: "category", category: "drinks", quantity: 1 },
      { kind: "item", itemIdSuffix: "dessert-tiramisu", quantity: 1 },
    ],
    mealPeriod: "lateNight",
    isDefault: true,
    active: true,
  },
  {
    id: "late-party",
    tier: "Late Party",
    name: "2 pizzas + 4 drinks + 2 desserts",
    description: "Pizza party for the group — late-night exclusive.",
    pricingMode: "dynamic",
    mainCategories: ["pizza"],
    minMains: 2,
    maxMains: 4,
    discountPercent: 28,
    mainsDiscountPercent: 15,
    addOnsDiscountPercent: 38,
    composition: [
      { kind: "category", category: "drinks", quantity: 4 },
      { kind: "category", category: "desserts", quantity: 2 },
    ],
    mealPeriod: "lateNight",
    isAnchor: true,
    active: true,
  },

  // ---- Delivery-exclusive bundle (audit §3 — channel economics) -------
  // "Pantry Pack" — uses delivery-only SKUs the customer can't carry
  // from a truck. High AOV, high margin, unique to delivery channel.
  {
    id: "delivery-pantry",
    tier: "Pantry Pack",
    name: "Pizza + pantry trio",
    description: "Any pizza + frozen tiramisù + Peroni 4-pack + olive oil.",
    pricingMode: "dynamic",
    mainCategories: ["pizza"],
    minMains: 1,
    maxMains: 3,
    discountPercent: 15,
    mainsDiscountPercent: 8,
    addOnsDiscountPercent: 22,
    composition: [
      { kind: "item", itemIdSuffix: "pantry-tiramisu-frozen", quantity: 1 },
      { kind: "item", itemIdSuffix: "pantry-beer-4pack", quantity: 1 },
      { kind: "item", itemIdSuffix: "pantry-olive-oil", quantity: 1 },
    ],
    mealPeriod: "family",
    channel: "delivery",
    active: true,
  },
];

/**
 * Per-ladder availability rules. The Lunch ladder is hour-gated so it
 * only surfaces during the lunch window; the Family ladder is
 * quantity-gated. With dynamic bundles each tier carries its own
 * `minMains`; this rule provides the fallback / ladder-show threshold
 * used when no bundles are configured.
 *
 *   lunch  — 11:00–13:59 local
 *   family — show at ≥2 main items (pizza + pasta); hint when within 1.
 *
 * Admins override via LocationUpsellConfig.bundleRules so each truck can
 * tune the windows independently.
 */
export interface BundleAvailabilityRules {
  lunch: { startHour: number; endHour: number };
  family: { minMainItems: number; hintWithin: number };
  lateNight: { startHour: number; endHour: number };
}

export const DEFAULT_BUNDLE_RULES: BundleAvailabilityRules = {
  lunch: { startHour: 11, endHour: 14 },
  // Family minimum raised 2 → 3 (audit §3 — 2-main carts were couples,
  // not families; bundle add-ons cannibalised AOV).
  family: { minMainItems: 3, hintWithin: 1 },
  lateNight: { startHour: 21, endHour: 24 },
};

export function resolveBundleRules(
  override?: Partial<BundleAvailabilityRules> | null,
): BundleAvailabilityRules {
  return {
    lunch: { ...DEFAULT_BUNDLE_RULES.lunch, ...(override?.lunch ?? {}) },
    family: { ...DEFAULT_BUNDLE_RULES.family, ...(override?.family ?? {}) },
    lateNight: { ...DEFAULT_BUNDLE_RULES.lateNight, ...(override?.lateNight ?? {}) },
  };
}

/**
 * Count the cart's "main" items — pizzas + pastas. Family eligibility
 * keys off this; sides, drinks and desserts don't count toward the minimum.
 */
export function countMainItems(cartItems: CartItem[]): number {
  return cartItems.reduce((sum, ci) => {
    if (ci.menuItem.category === "pizza" || ci.menuItem.category === "pasta") {
      return sum + ci.quantity;
    }
    return sum;
  }, 0);
}

/** Like countMainItems but with the bundle's own mainCategories — accepts
 *  any dynamic-bundle category set so an admin can configure pizza-only
 *  or pasta-only bundles down the road. Falls back to pizza+pasta.
 *
 *  Anchor SKUs (menuRole="anchor", Tartufata / Pizzaiolo) and delivery-
 *  only pantry items are excluded — they don't fold into bundle counts.
 *  A customer with 3 Tartufatas at 80 PLN each shouldn't trigger Family
 *  Feast at a 22% discount on their anchor-pizza order. */
function countCartInCategories(
  cartItems: CartItem[],
  categories: MenuCategory[],
): number {
  const set = new Set(categories);
  return cartItems.reduce((sum, ci) => {
    if (!set.has(ci.menuItem.category)) return sum;
    if (ci.menuItem.menuRole === "anchor") return sum;
    if (ci.menuItem.deliveryOnly) return sum;
    return sum + ci.quantity;
  }, 0);
}

export type BundleAvailability =
  | { kind: "show" }
  | { kind: "hidden" }
  | { kind: "hint"; mealPeriod: BundleMealPeriod; mainItems: number; needed: number };

/**
 * Decide what the cart drawer should do for a given ladder + cart shape +
 * local hour:
 *   show   — render the ladder normally
 *   hidden — don't render anything
 *   hint   — render a one-line "add N more …" notification only
 *
 * Hour gates apply to lunch; quantity gates apply to family. A ladder that
 * fails its gate but is *close* (within `hintWithin`) returns a `hint` so
 * the drawer can nudge without showing the full ladder.
 */
export function resolveBundleAvailability(
  mealPeriod: BundleMealPeriod,
  cartItems: CartItem[],
  rules: BundleAvailabilityRules,
  hour: number,
): BundleAvailability {
  if (mealPeriod === "lunch") {
    const inWindow =
      hour >= rules.lunch.startHour && hour < rules.lunch.endHour;
    return inWindow ? { kind: "show" } : { kind: "hidden" };
  }
  if (mealPeriod === "lateNight") {
    // Late-night gates on both hour AND ≥1 main — solo-eater convenience
    // play. The window wraps midnight only when endHour > 24; with the
    // default 21–24 it's a simple [21, 24) check.
    const inWindow =
      hour >= rules.lateNight.startHour && hour < rules.lateNight.endHour;
    if (!inWindow) return { kind: "hidden" };
    const hasMain = cartItems.some(
      (ci) => ci.menuItem.category === "pizza" || ci.menuItem.category === "pasta",
    );
    return hasMain ? { kind: "show" } : { kind: "hidden" };
  }
  // family
  const mains = countMainItems(cartItems);
  if (mains >= rules.family.minMainItems) return { kind: "show" };
  const needed = rules.family.minMainItems - mains;
  if (needed > 0 && needed <= rules.family.hintWithin) {
    return { kind: "hint", mealPeriod: "family", mainItems: mains, needed };
  }
  return { kind: "hidden" };
}

/** Pick the bundle tier most relevant to the cart's current contents.
 * Returns the matching meal period (lunch when the cart leans pasta /
 * panini, family when it has pizzas or grows past 4 line items).
 */
export function suggestedBundleMealPeriod(
  cartItems: CartItem[],
): BundleMealPeriod | null {
  if (cartItems.length === 0) return null;
  const totalQty = cartItems.reduce((s, ci) => s + ci.quantity, 0);
  const hasPizza = cartItems.some((ci) => ci.menuItem.category === "pizza");
  if (hasPizza || totalQty >= 4) return "family";
  return "lunch";
}

const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** Returns true when the bundle is *currently* eligible to render —
 *  active flag set AND limitedUntil not in the past AND today is in
 *  activeDays (if set). The caller (resolveBundles + cart-side filters)
 *  uses this so admin-side scarcity / weekday merchandising gates work
 *  without each touch-point having to re-implement the rules. */
export function isBundleActiveNow(bundle: BundleTier, now: Date = new Date()): boolean {
  if (!bundle.active) return false;
  if (bundle.limitedUntil) {
    // Compare as YYYY-MM-DD to avoid local-timezone-of-midnight gotchas.
    const today = now.toISOString().slice(0, 10);
    if (today > bundle.limitedUntil) return false;
  }
  if (bundle.activeDays && bundle.activeDays.length > 0) {
    const day = WEEKDAY_NAMES[now.getDay()];
    if (!bundle.activeDays.includes(day)) return false;
  }
  return true;
}

/** Resolve admin-configured + default bundles for a location. Admin entries
 *  win when present so operators can A/B specific tiers without losing the
 *  rest of the ladder. Channel-filter applied when fulfillmentType supplied
 *  so delivery bundles only render on delivery carts. */
export function resolveBundles(
  configBundles?: BundleTier[] | null,
  now: Date = new Date(),
  fulfillmentType?: FulfillmentType | null,
): BundleTier[] {
  const source = configBundles && configBundles.length > 0 ? configBundles : DEFAULT_BUNDLES;
  return source
    .filter((b) => isBundleActiveNow(b, now))
    .filter((b) => {
      if (!b.channel) return true;
      if (!fulfillmentType) return true; // Pre-checkout — show all.
      if (b.channel === "delivery") return fulfillmentType === "delivery";
      return fulfillmentType !== "delivery";
    });
}

/** Returns true when this bundle is a member-only offer the supplied
 *  customer can see. Members-only bundles require a non-empty phone
 *  signal — audit §3, converts phone-collection into an active lever. */
export function bundleVisibleToCustomer(
  bundle: BundleTier,
  customerPhone: string | null | undefined,
): boolean {
  if (!bundle.membersOnly) return true;
  return !!customerPhone && customerPhone.length > 0;
}

export interface ResolvedBundleSlot {
  slot: BundleSlot;
  candidates: MenuItem[];
}

/**
 * Resolve every slot in a bundle to candidate menu items at the given
 * location, sorted cheapest-first so fallbacks pick the most affordable
 * option. Returns null if any slot has no candidates (bundle can't be
 * fulfilled here — usually means the menu doesn't carry the antipasto/
 * dessert it requires). The cart UI can then hide the tier rather than
 * surface a broken offer.
 *
 * Anchor items (menuRole="anchor", e.g. Tartufata Reale, Pizza del
 * Pizzaiolo) AND delivery-only pantry items are excluded from category
 * slots — they exist to range-extend perception or capture delivery AOV,
 * not to fold into discounted bundles. Item-suffix slots ignore both
 * filters because they explicitly opt-in to a specific SKU.
 */
export function resolveBundleSlots(
  bundle: BundleTier,
  menuItems: MenuItem[],
): ResolvedBundleSlot[] | null {
  const out: ResolvedBundleSlot[] = [];
  for (const slot of bundle.composition) {
    const candidates = (
      slot.kind === "item"
        ? menuItems.filter(
            (m) => m.available && m.id.endsWith(slot.itemIdSuffix),
          )
        : menuItems.filter(
            (m) =>
              m.available &&
              m.category === slot.category &&
              m.menuRole !== "anchor" &&
              !m.deliveryOnly,
          )
    ).slice().sort((a, b) => a.price - b.price);
    if (candidates.length === 0) return null;
    out.push({ slot, candidates });
  }
  return out;
}

/**
 * Pick the actual menu items that will fill each slot, preferring items
 * already in the existing cart so the customer's chosen drinks/desserts
 * carry through. Falls back to the cheapest candidate when nothing in
 * cart matches. Shared by `buildBundleCartLines` (cart-line construction)
 * and `computeBundlePrice` (price preview / Stripe parity) so the price
 * displayed always reflects the exact items the customer will receive —
 * closes the limonata margin leak where the chip priced espresso but the
 * cart shipped premium drinks.
 */
function selectSlotItems(
  resolved: ResolvedBundleSlot[],
  /** Non-main cart units flattened to a per-unit pool. Each unit can fill
   *  at most one slot — preserves variety for carts with two different
   *  drinks. */
  nonMainPool: MenuItem[],
): MenuItem[][] {
  const pool = [...nonMainPool];
  return resolved.map(({ slot, candidates }) => {
    const candidateIds = new Set(candidates.map((c) => c.id));
    const picked: MenuItem[] = [];
    for (let i = 0; i < slot.quantity; i++) {
      const matchIdx = pool.findIndex((m) => candidateIds.has(m.id));
      if (matchIdx >= 0) {
        picked.push(pool[matchIdx]);
        pool.splice(matchIdx, 1);
      } else {
        // candidates is cheapest-first, so [0] is the cheapest available.
        picked.push(candidates[0]);
      }
    }
    return picked;
  });
}

/**
 * Compute a bundle's effective price + reference price + savings given
 * the current cart and menu. For fixed bundles this is just the stored
 * priceGrosze / refPriceGrosze. For dynamic bundles:
 *
 *   mainsSubtotal = Σ cart-mains-in-categories × menu price
 *   addOnsSubtotal = Σ slot.quantity × cheapest-candidate price
 *   bundlePrice = round((mainsSubtotal + addOnsSubtotal) × (1 - discountPercent/100))
 *   refPrice = mainsSubtotal + addOnsSubtotal
 *
 * Returns null when a dynamic bundle's add-ons can't be resolved at this
 * location or the cart fails the min/max mains gate — callers can use
 * that signal to hide the tier or fall back to a hint.
 */
export interface BundlePricing {
  priceGrosze: number;
  refPriceGrosze: number;
  savings: number;
  /** Actual mains-in-cart count used to compute the price. Useful for
   *  composition copy ("3 pizzas + ..."). */
  mainsCount: number;
  /** Pre-discount mains total — surfaced for split-discount admin
   *  preview + per-person framing maths. Zero for fixed bundles. */
  mainsSubtotal: number;
  /** Pre-discount add-ons total — surfaced for the same reasons.
   *  Zero for fixed bundles. */
  addOnsSubtotal: number;
}

export function computeBundlePrice(
  bundle: BundleTier,
  cartItems: CartItem[],
  menuItems: MenuItem[],
): BundlePricing | null {
  if (!isDynamicBundle(bundle)) {
    return {
      priceGrosze: bundle.priceGrosze,
      refPriceGrosze: bundle.refPriceGrosze,
      savings: Math.max(0, bundle.refPriceGrosze - bundle.priceGrosze),
      mainsCount: 0,
      mainsSubtotal: 0,
      addOnsSubtotal: 0,
    };
  }

  const mainsCount = countCartInCategories(cartItems, bundle.mainCategories);
  if (mainsCount < bundle.minMains) return null;
  if (bundle.maxMains && mainsCount > bundle.maxMains) return null;

  // Mains: every cart line in mainCategories carries over at à la carte —
  // EXCLUDING anchor SKUs and delivery-only pantry items so the bundle
  // doesn't discount items that exist to range-extend perception.
  const mainsSubtotal = cartItems
    .filter(
      (ci) =>
        bundle.mainCategories.includes(ci.menuItem.category) &&
        ci.menuItem.menuRole !== "anchor" &&
        !ci.menuItem.deliveryOnly,
    )
    .reduce((s, ci) => s + ci.menuItem.price * ci.quantity, 0);

  // Add-ons: resolve which actual items will fill each slot using the
  // same selector buildBundleCartLines uses (cart-preferred, cheapest-
  // fallback). Price on those actual items — fixes the margin leak where
  // a customer with 4 limonatas in cart was charged at espresso price.
  const resolved = resolveBundleSlots(bundle, menuItems);
  if (!resolved) return null;
  const nonMainPool: MenuItem[] = cartItems
    .filter((ci) => !bundle.mainCategories.includes(ci.menuItem.category))
    .flatMap((ci) => Array.from({ length: ci.quantity }, () => ci.menuItem));
  const picked = selectSlotItems(resolved, nonMainPool);
  const addOnsSubtotal = picked
    .flat()
    .reduce((s, m) => s + m.price, 0);

  const refPrice = mainsSubtotal + addOnsSubtotal;
  // Split-discount mode: mains and add-ons can have separate %s so
  // operators can protect demand-anchor margin (low % on pizza) while
  // discounting high-GM attachments (high % on drinks/desserts). Falls
  // back to the single discountPercent when split fields aren't set.
  const mainsPct = bundle.mainsDiscountPercent ?? bundle.discountPercent;
  const addOnsPct = bundle.addOnsDiscountPercent ?? bundle.discountPercent;
  const discountedMains = mainsSubtotal * (1 - mainsPct / 100);
  const discountedAddOns = addOnsSubtotal * (1 - addOnsPct / 100);
  const priceGrosze = Math.round(discountedMains + discountedAddOns);
  return {
    priceGrosze,
    refPriceGrosze: refPrice,
    savings: Math.max(0, refPrice - priceGrosze),
    mainsCount,
    mainsSubtotal,
    addOnsSubtotal,
  };
}

/**
 * Build the cart line-up that satisfies a bundle, preferring items already
 * in the cart so applying a bundle to a cart-with-pasta keeps that pasta
 * rather than swapping it for the cheapest option. Returns one CartItem per
 * slot occurrence (a "drinks: 4" slot returns 4 lines).
 *
 * Existing-cart items are consumed one-at-a-time, not duplicated en bloc,
 * so a cart with two different pizzas going into the Family ladder keeps
 * both pizzas instead of being collapsed to two of the first match.
 *
 * Dynamic bundles preserve all main-category cart lines as-is, then
 * resolve the static add-on composition from the remaining pool.
 */
export function buildBundleCartLines(
  bundle: BundleTier,
  menuItems: MenuItem[],
  existingCart: CartItem[],
  locationSlug: string,
  /** Optional override — when the customer used the composition picker
   *  to swap defaults (e.g. "burrata instead of bruschetta"), the picker
   *  passes the per-slot picks here. Each entry replaces the default
   *  selection for the slot at the matching index, falling back to the
   *  selector when an entry is missing or invalid. */
  slotPicks?: (string | undefined)[],
): CartItem[] | null {
  const resolved = resolveBundleSlots(bundle, menuItems);
  if (!resolved) return null;

  if (isDynamicBundle(bundle)) {
    const mainsCount = countCartInCategories(
      existingCart,
      bundle.mainCategories,
    );
    if (mainsCount < bundle.minMains) return null;
    if (bundle.maxMains && mainsCount > bundle.maxMains) return null;

    // Mains carry over 1:1 from cart — preserving every line so the
    // customer's 2 margheritas + 1 quattro stay distinct.
    const mainsLines: CartItem[] = existingCart
      .filter((ci) => bundle.mainCategories.includes(ci.menuItem.category))
      .map((ci) => ({ ...ci, locationSlug }));

    const nonMainPool: MenuItem[] = existingCart
      .filter((ci) => !bundle.mainCategories.includes(ci.menuItem.category))
      .flatMap((ci) => Array.from({ length: ci.quantity }, () => ci.menuItem));

    const picked = selectSlotItems(resolved, nonMainPool);
    const addOnLines: CartItem[] = [];
    picked.forEach((slotPicked, slotIndex) => {
      const override = slotPicks?.[slotIndex];
      const overrideItem = override
        ? resolved[slotIndex].candidates.find((c) => c.id === override)
        : undefined;
      for (let i = 0; i < slotPicked.length; i++) {
        // Use the picker override (if valid) for the FIRST unit of each
        // slot; remaining units fall back to the default selection so
        // a "1 of N picks" UX can still pin the first while letting the
        // rest auto-fill. Composition picker passes per-unit, but the
        // simpler per-slot override degrades gracefully.
        const pick = i === 0 && overrideItem ? overrideItem : slotPicked[i];
        addOnLines.push({ menuItem: pick, quantity: 1, locationSlug });
      }
    });
    return [...mainsLines, ...addOnLines];
  }

  // Fixed bundle — flat per-unit pool against the full composition.
  const pool: MenuItem[] = existingCart.flatMap((ci) =>
    Array.from({ length: ci.quantity }, () => ci.menuItem),
  );
  const picked = selectSlotItems(resolved, pool);
  return picked.flat().map((m) => ({
    menuItem: m,
    quantity: 1,
    locationSlug,
  }));
}

/**
 * Server-side composition check (audit §3.2 — security). Returns true iff
 * the supplied cart contents satisfy every slot of the bundle, line-for-
 * line. Used by /api/checkout to defend against a client that posts an
 * `appliedBundleId` plus arbitrary expensive items hoping to pay the
 * bundle price — without this, a single-quantity check would let a
 * malicious cart get a 46 PLN tier for 200 PLN of pizza.
 *
 * For dynamic bundles, the *non-main* portion of the cart must match the
 * add-on composition exactly; mains are validated against minMains /
 * maxMains. For fixed bundles, the whole cart must match line-for-line.
 */
export function cartSatisfiesBundle(
  bundle: BundleTier,
  cartItems: CartItem[],
  menuItems: MenuItem[],
): boolean {
  if (isDynamicBundle(bundle)) {
    const mainsCount = countCartInCategories(cartItems, bundle.mainCategories);
    if (mainsCount < bundle.minMains) return false;
    if (bundle.maxMains && mainsCount > bundle.maxMains) return false;

    const addOnSlotQty = bundle.composition.reduce(
      (s, slot) => s + slot.quantity,
      0,
    );
    // Pool of non-main cart units — must exactly match the static slots.
    const pool: MenuItem[] = cartItems
      .filter((ci) => !bundle.mainCategories.includes(ci.menuItem.category))
      .flatMap((ci) =>
        Array.from({ length: ci.quantity }, () => ci.menuItem),
      );
    if (pool.length !== addOnSlotQty) return false;

    const resolved = resolveBundleSlots(bundle, menuItems);
    if (!resolved) return false;

    for (const { slot, candidates } of resolved) {
      const candidateIds = new Set(candidates.map((c) => c.id));
      for (let i = 0; i < slot.quantity; i++) {
        const idx = pool.findIndex((m) => candidateIds.has(m.id));
        if (idx === -1) return false;
        pool.splice(idx, 1);
      }
    }
    return pool.length === 0;
  }

  // Fixed bundle path — full cart must equal full composition.
  const totalSlotQty = bundle.composition.reduce(
    (s, slot) => s + slot.quantity,
    0,
  );
  const totalCartQty = cartItems.reduce((s, ci) => s + ci.quantity, 0);
  if (totalSlotQty !== totalCartQty) return false;

  const resolved = resolveBundleSlots(bundle, menuItems);
  if (!resolved) return false;

  const pool: MenuItem[] = cartItems.flatMap((ci) =>
    Array.from({ length: ci.quantity }, () => ci.menuItem),
  );

  for (const { slot, candidates } of resolved) {
    const candidateIds = new Set(candidates.map((c) => c.id));
    for (let i = 0; i < slot.quantity; i++) {
      const idx = pool.findIndex((m) => candidateIds.has(m.id));
      if (idx === -1) return false;
      pool.splice(idx, 1);
    }
  }
  return pool.length === 0;
}

/** Per-bundle savings in grosze (used in the "Save 18 zł" badge). For
 *  dynamic bundles pass cartItems + menuItems so the savings reflects the
 *  customer's actual mains count; without those args returns 0 for dynamic
 *  bundles (caller should compute via computeBundlePrice for accurate copy).
 */
export function bundleSavings(
  bundle: BundleTier,
  cartItems?: CartItem[],
  menuItems?: MenuItem[],
): number {
  if (isDynamicBundle(bundle)) {
    if (!cartItems || !menuItems) return 0;
    const pricing = computeBundlePrice(bundle, cartItems, menuItems);
    return pricing?.savings ?? 0;
  }
  return Math.max(0, bundle.refPriceGrosze - bundle.priceGrosze);
}

/** Find a bundle by id from the active list (admin override + defaults). */
export function findBundle(
  bundleId: string,
  configBundles?: BundleTier[] | null,
): BundleTier | null {
  const all = resolveBundles(configBundles);
  return all.find((b) => b.id === bundleId) ?? null;
}

/**
 * Returns true when *any* bundle tier would render in the cart drawer
 * given the current cart shape, hour, and config. Used by the combo
 * banner to step aside when the bundle ladder dominates (a 4.99 PLN
 * combo banner is psychologically invisible next to a 47 PLN bundle
 * save — Starbucks-style "show one upsell at a time" UX rule).
 */
export function isBundleLadderShowable(
  cartItems: CartItem[],
  menuItems: MenuItem[],
  configBundles: BundleTier[] | null | undefined,
  configRules: Partial<BundleAvailabilityRules> | null | undefined,
  hour: number,
): boolean {
  if (cartItems.length === 0 || menuItems.length === 0) return false;
  const all = resolveBundles(configBundles ?? null);
  if (all.length === 0) return false;
  const rules = resolveBundleRules(configRules ?? null);
  for (const period of ["lunch", "family", "lateNight"] as BundleMealPeriod[]) {
    if (!all.some((b) => b.mealPeriod === period)) continue;
    const av = resolveBundleAvailability(period, cartItems, rules, hour);
    if (av.kind !== "show") continue;
    // Need at least one bundle for this period whose slots resolve at the
    // location AND, for dynamic tiers, meets minMains.
    const hasViable = all.some((b) => {
      if (b.mealPeriod !== period) return false;
      if (resolveBundleSlots(b, menuItems) === null) return false;
      if (isDynamicBundle(b)) {
        const pricing = computeBundlePrice(b, cartItems, menuItems);
        return pricing !== null;
      }
      return true;
    });
    if (hasViable) return true;
  }
  return false;
}
