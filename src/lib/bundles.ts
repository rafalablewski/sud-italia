import { MenuItem, MenuCategory, CartItem } from "@/data/types";

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

/** Type guard — treats missing pricingMode as "fixed" so legacy entries work. */
export function isDynamicBundle(b: BundleTier): b is BundleDynamicTier {
  return b.pricingMode === "dynamic";
}

/**
 * Default bundles per location — composition uses category slots so this
 * single list works for both Kraków and Warszawa without referencing
 * per-truck item IDs. Admin can override via LocationUpsellConfig.bundles.
 *
 * Lunch ladder (fixed-price, solo eating):  26 / 32* / 46* / 58
 * Family ladder (dynamic, scales on mains): 20% / 28%* / 24%* discount
 *   * = anchor (best % savings)
 */
export const DEFAULT_BUNDLES: BundleTier[] = [
  // ---- Lunch (audit §3.2, lunch table) ---------------------------------
  {
    id: "lunch-solo",
    tier: "Solo",
    name: "Just the pasta",
    description: "1 pasta of your choice",
    priceGrosze: 2600,
    refPriceGrosze: 2600,
    composition: [{ kind: "category", category: "pasta", quantity: 1 }],
    mealPeriod: "lunch",
    active: true,
  },
  {
    id: "lunch-classic",
    tier: "Lunch",
    name: "Pasta + drink",
    description: "1 pasta + 1 drink. The classic.",
    priceGrosze: 3200,
    refPriceGrosze: 3800,
    composition: [
      { kind: "category", category: "pasta", quantity: 1 },
      { kind: "category", category: "drinks", quantity: 1 },
    ],
    mealPeriod: "lunch",
    isDefault: true,
    active: true,
  },
  {
    id: "lunch-plus",
    tier: "Lunch+",
    name: "Pasta + drink + tiramisù",
    description: "A meal you'll remember.",
    priceGrosze: 4600,
    refPriceGrosze: 5600,
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
    tier: "Hungry",
    name: "+ bruschetta",
    description: "Pasta, drink, dessert & bruschetta. For a real one.",
    priceGrosze: 5800,
    refPriceGrosze: 7600,
    composition: [
      { kind: "category", category: "pasta", quantity: 1 },
      { kind: "category", category: "drinks", quantity: 1 },
      { kind: "item", itemIdSuffix: "dessert-tiramisu", quantity: 1 },
      { kind: "item", itemIdSuffix: "anti-bruschetta", quantity: 1 },
    ],
    mealPeriod: "lunch",
    isDecoy: true,
    active: true,
  },

  // ---- Family ladder (dynamic — mains scale with cart) -----------------
  // Discount calibration follows the §3.2 ladder psychology:
  //   Family       — entry: 20% blend (10% mains / 30% add-ons protects
  //                  pizza margin while making drinks feel almost free)
  //   Family Feast — anchor + default-pushed: 28% blend (15% mains / 40%
  //                  add-ons). Highest absolute savings AND highest %
  //                  among any tier the customer would rationally pick.
  //   Feast Deluxe — decoy at 20% blend (12% mains / 32% add-ons). Lower
  //                  % AND only marginally larger absolute savings despite
  //                  costing meaningfully more → Family Feast wins by
  //                  Ariely's dominance heuristic.
  // maxMains caps every dynamic tier so a 50-pizza cart can't abuse the
  // discount (real ops risk, called out in the §3.2 red-team audit).
  {
    id: "family",
    tier: "Family",
    name: "Your pizzas + sides",
    description: "Your mains + bruschetta + 2 drinks",
    pricingMode: "dynamic",
    mainCategories: ["pizza", "pasta"],
    minMains: 2,
    maxMains: 6,
    discountPercent: 20,
    mainsDiscountPercent: 10,
    addOnsDiscountPercent: 30,
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
    minMains: 2,
    maxMains: 8,
    discountPercent: 28,
    mainsDiscountPercent: 15,
    addOnsDiscountPercent: 40,
    composition: [
      { kind: "category", category: "antipasti", quantity: 2 },
      { kind: "category", category: "drinks", quantity: 4 },
      { kind: "item", itemIdSuffix: "dessert-tiramisu", quantity: 1 },
    ],
    mealPeriod: "family",
    isDefault: true,
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
    minMains: 3,
    maxMains: 12,
    discountPercent: 20,
    mainsDiscountPercent: 12,
    addOnsDiscountPercent: 32,
    composition: [
      { kind: "category", category: "antipasti", quantity: 2 },
      { kind: "category", category: "drinks", quantity: 6 },
      { kind: "category", category: "desserts", quantity: 2 },
    ],
    mealPeriod: "family",
    isDecoy: true,
    active: true,
  },

  // ---- Late-night (audit §2.3 + §7B) -----------------------------------
  // After 21:00 decision energy is lower and impulse is higher; a single
  // tightly-scoped bundle outperforms the full family ladder. Gates on
  // hour rather than minMains so a 1-pizza late-night cart still
  // qualifies (the whole point — solo-eater convenience).
  {
    id: "late-night",
    tier: "Late dinner",
    name: "Pizza + drink + dessert",
    description: "Your pizza + 1 drink + tiramisù",
    pricingMode: "dynamic",
    mainCategories: ["pizza"],
    minMains: 1,
    maxMains: 3,
    discountPercent: 22,
    mainsDiscountPercent: 12,
    addOnsDiscountPercent: 35,
    composition: [
      { kind: "category", category: "drinks", quantity: 1 },
      { kind: "item", itemIdSuffix: "dessert-tiramisu", quantity: 1 },
    ],
    mealPeriod: "lateNight",
    isDefault: true,
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
  family: { minMainItems: 2, hintWithin: 1 },
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
 *  or pasta-only bundles down the road. Falls back to pizza+pasta. */
function countCartInCategories(
  cartItems: CartItem[],
  categories: MenuCategory[],
): number {
  const set = new Set(categories);
  return cartItems.reduce((sum, ci) => {
    if (set.has(ci.menuItem.category)) return sum + ci.quantity;
    return sum;
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

/** Resolve admin-configured + default bundles for a location. Admin entries
 *  win when present so operators can A/B specific tiers without losing the
 *  rest of the ladder. */
export function resolveBundles(
  configBundles?: BundleTier[] | null,
): BundleTier[] {
  if (configBundles && configBundles.length > 0) {
    return configBundles.filter((b) => b.active);
  }
  return DEFAULT_BUNDLES.filter((b) => b.active);
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
            (m) => m.available && m.category === slot.category,
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

  // Mains: every cart line in mainCategories carries over at à la carte.
  const mainsSubtotal = cartItems
    .filter((ci) => bundle.mainCategories.includes(ci.menuItem.category))
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
