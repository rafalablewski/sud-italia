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

// --- Popular item IDs per location (simulated social proof) ---

const POPULAR_ITEMS: Record<string, string[]> = {
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

const STAFF_PICKS: Record<string, string[]> = {
  krakow: ["krk-pizza-quattro-formaggi", "krk-anti-burrata", "krk-pasta-pesto"],
  warszawa: ["waw-pizza-napoli", "waw-anti-burrata", "waw-pasta-cacio-pepe"],
};

const NEW_ITEMS: string[] = [];

export type BadgeType = "popular" | "staff-pick" | "new" | "best-value";

export function getItemBadges(itemId: string, locationSlug: string): BadgeType[] {
  const badges: BadgeType[] = [];
  if (POPULAR_ITEMS[locationSlug]?.includes(itemId)) badges.push("popular");
  if (STAFF_PICKS[locationSlug]?.includes(itemId)) badges.push("staff-pick");
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

export interface UpsellSuggestion {
  item: MenuItem;
  reason: string;
}

export function getCartSuggestions(
  cartItems: CartItem[],
  allMenuItems: MenuItem[],
  maxSuggestions: number = 3
): UpsellSuggestion[] {
  if (cartItems.length === 0) return [];

  const cartItemIds = new Set(cartItems.map((ci) => ci.menuItem.id));
  const cartCategories = new Set(cartItems.map((ci) => ci.menuItem.category));

  // Find categories we should suggest
  const suggestCategories = new Set<MenuCategory>();
  for (const cat of cartCategories) {
    const targets = CROSS_SELL_MAP[cat] || [];
    for (const t of targets) {
      if (!cartCategories.has(t)) suggestCategories.add(t);
    }
  }

  // Specific rules
  const hasPizzaOrPasta = cartCategories.has("pizza") || cartCategories.has("pasta");
  const hasDrink = cartCategories.has("drinks");
  const hasDessert = cartCategories.has("desserts");

  const suggestions: UpsellSuggestion[] = [];
  const available = allMenuItems.filter(
    (m) => m.available && !cartItemIds.has(m.id)
  );

  // Rule 1: No drink with main → suggest a drink
  if (hasPizzaOrPasta && !hasDrink) {
    const drinks = available.filter((m) => m.category === "drinks");
    if (drinks.length > 0) {
      const pick = drinks[Math.floor(Math.random() * drinks.length)];
      suggestions.push({
        item: pick,
        reason: "Add a drink to complete your meal",
      });
    }
  }

  // Rule 2: No dessert with main → suggest a dessert
  if (hasPizzaOrPasta && !hasDessert) {
    const desserts = available.filter((m) => m.category === "desserts");
    if (desserts.length > 0) {
      const pick = desserts[Math.floor(Math.random() * desserts.length)];
      suggestions.push({
        item: pick,
        reason: "Finish with something sweet",
      });
    }
  }

  // Rule 3: Fill remaining from suggested categories
  for (const cat of suggestCategories) {
    if (suggestions.length >= maxSuggestions) break;
    if (suggestions.some((s) => s.item.category === cat)) continue;
    const items = available.filter((m) => m.category === cat);
    if (items.length > 0) {
      const pick = items[Math.floor(Math.random() * items.length)];
      const reason = getReasonForCategory(cat);
      suggestions.push({ item: pick, reason });
    }
  }

  return suggestions.slice(0, maxSuggestions);
}

function getReasonForCategory(cat: MenuCategory): string {
  switch (cat) {
    case "antipasti":
      return "Start with a classic appetizer";
    case "pizza":
      return "Add a pizza to your order";
    case "pasta":
      return "Try our handmade pasta";
    case "drinks":
      return "Don't forget a refreshing drink";
    case "desserts":
      return "Save room for dessert";
    case "panini":
      return "Grab a panino for later";
    default:
      return "You might also like";
  }
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

export const COMBO_DEALS: ComboDeal[] = [
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

export function getActiveComboDeals(cartItems: CartItem[]): {
  activeDeal: ComboDeal | null;
  savings: number;
  missingCategories: MenuCategory[];
  progress: number;
} {
  const cartCategories = new Set(cartItems.map((ci) => ci.menuItem.category));

  for (const deal of COMBO_DEALS) {
    const matched = deal.categories.filter((c) => cartCategories.has(c));
    const missing = deal.categories.filter((c) => !cartCategories.has(c));
    const progress = matched.length / deal.categories.length;

    if (matched.length >= 1 && missing.length > 0) {
      const cartTotal = cartItems.reduce(
        (sum, ci) => sum + ci.menuItem.price * ci.quantity,
        0
      );
      const potentialSavings = Math.round(
        cartTotal * (deal.discountPercent / 100)
      );

      return {
        activeDeal: deal,
        savings: potentialSavings,
        missingCategories: missing as MenuCategory[],
        progress,
      };
    }

    if (missing.length === 0 && cartItems.length >= deal.minItems) {
      const cartTotal = cartItems.reduce(
        (sum, ci) => sum + ci.menuItem.price * ci.quantity,
        0
      );
      return {
        activeDeal: deal,
        savings: Math.round(cartTotal * (deal.discountPercent / 100)),
        missingCategories: [],
        progress: 1,
      };
    }
  }

  return { activeDeal: null, savings: 0, missingCategories: [], progress: 0 };
}

// --- Free delivery threshold ---

export const FREE_DELIVERY_THRESHOLD = 6000; // 60 PLN

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
