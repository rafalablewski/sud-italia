import { MenuItem, MenuCategory, CartItem } from "@/data/types";

/**
 * Bundle architecture (audit §3.2 — decoy + anchor).
 *
 * Bundles are fixed-price combos with a *predetermined composition* — the
 * customer picks Lunch+ and gets pasta + drink + tiramisù for 46 PLN flat.
 * They differ from existing `ComboDeal`s, which apply a percentage discount
 * to whatever the customer happens to assemble.
 *
 * The behavioural shape matters more than the items: each tier uses the
 * decoy + anchor + default-push pattern from Dan Ariely's pricing work.
 *   Solo               — just the headline item, no savings
 *   Lunch (default)    — McDonald's combo effect; visually pre-selected
 *   Lunch+ (anchor)    — best-value badge; the rational pick
 *   Hungry (decoy)     — overshoot tier; makes Lunch+ look reasonable
 *
 * Composition uses category slots (`any-pasta`) so a single bundle definition
 * works at every location without having to reference per-truck item IDs.
 */

export type BundleMealPeriod = "lunch" | "family";

export type BundleSlot =
  | { kind: "category"; category: MenuCategory; quantity: number }
  | { kind: "item"; itemIdSuffix: string; quantity: number };

export interface BundleTier {
  id: string;
  /** Short tier label rendered in the chip header — Solo / Lunch / Lunch+ / Hungry. */
  tier: string;
  /** Headline used as the chip's name. Keep <24 chars for the cart drawer. */
  name: string;
  /** One-sentence composition copy rendered under the name. */
  description: string;
  /** Locked bundle price in grosze. */
  priceGrosze: number;
  /** "You'd pay" reference price in grosze — drives the strikethrough +
   *  savings copy. Always greater than priceGrosze for paid tiers. */
  refPriceGrosze: number;
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

/**
 * Default bundles per location — composition uses category slots so this
 * single list works for both Kraków and Warszawa without referencing
 * per-truck item IDs. Admin can override via LocationUpsellConfig.bundles.
 *
 * Numbers come straight from audit §3.2:
 *   Lunch tier:   26 / 32* / 46* / 58
 *   Family tier:  89 / 119* / 169
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

  // ---- Family Feast (audit §3.2, family table) -------------------------
  {
    id: "family-classic",
    tier: "Family",
    name: "Two pizzas + sides",
    description: "2 pizzas + 1 side + 2 drinks",
    priceGrosze: 8900,
    refPriceGrosze: 10800,
    composition: [
      { kind: "category", category: "pizza", quantity: 2 },
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
    description: "2 pizzas + bruschetta + 4 drinks + tiramisù",
    priceGrosze: 11900,
    refPriceGrosze: 16200,
    composition: [
      { kind: "category", category: "pizza", quantity: 2 },
      { kind: "item", itemIdSuffix: "anti-bruschetta", quantity: 1 },
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
    description: "3 pizzas + 2 sides + 6 drinks + 2 desserts",
    priceGrosze: 16900,
    refPriceGrosze: 23200,
    composition: [
      { kind: "category", category: "pizza", quantity: 3 },
      { kind: "category", category: "antipasti", quantity: 2 },
      { kind: "category", category: "drinks", quantity: 6 },
      { kind: "category", category: "desserts", quantity: 2 },
    ],
    mealPeriod: "family",
    isDecoy: true,
    active: true,
  },
];

/**
 * Pick the bundle tier most relevant to the cart's current contents.
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
 * location. Returns null if any slot has no candidates (bundle can't be
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
    const candidates =
      slot.kind === "item"
        ? menuItems.filter(
            (m) => m.available && m.id.endsWith(slot.itemIdSuffix),
          )
        : menuItems.filter(
            (m) => m.available && m.category === slot.category,
          );
    if (candidates.length === 0) return null;
    out.push({ slot, candidates });
  }
  return out;
}

/**
 * Build the cart line-up that satisfies a bundle, preferring items already
 * in the cart so applying a bundle to a cart-with-pasta keeps that pasta
 * rather than swapping it for the cheapest option. Returns one CartItem per
 * slot occurrence (a "drinks: 4" slot returns 4 lines).
 */
export function buildBundleCartLines(
  bundle: BundleTier,
  menuItems: MenuItem[],
  existingCart: CartItem[],
  locationSlug: string,
): CartItem[] | null {
  const resolved = resolveBundleSlots(bundle, menuItems);
  if (!resolved) return null;

  const out: CartItem[] = [];
  for (const { slot, candidates } of resolved) {
    const existingMatch = existingCart.find((ci) =>
      candidates.some((c) => c.id === ci.menuItem.id),
    );
    const pick = existingMatch?.menuItem ?? candidates[0];
    for (let i = 0; i < slot.quantity; i++) {
      out.push({
        menuItem: pick,
        quantity: 1,
        locationSlug,
      });
    }
  }
  return out;
}

/** Per-bundle savings in grosze (used in the "Save 18 zł" badge). */
export function bundleSavings(bundle: BundleTier): number {
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
