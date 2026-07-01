export interface Location {
  slug: string;
  name: string;
  city: string;
  address: string;
  coordinates: { lat: number; lng: number };
  heroImage: string;
  description: string;
  shortDescription: string;
  hours: { day: string; open: string; close: string }[];
  isActive: boolean;
  currency: "PLN";
  /** When true, Polish Labor Code §190 prohibits under-18 staff from working
   *  during the location's open hours. Drives scheduling-rule warnings. */
  servesAlcohol?: boolean;
  /** Optional "Cooked by X and crew" attribution line shown under the
   *  description on the V8 LocationsGrid cards. Keep short — V8 styles
   *  this as a single Cormorant-italic line with an ochre left border. */
  teamLead?: string;
}

export type MenuCategory =
  | "pizza"
  | "pasta"
  | "antipasti"
  | "panini"
  | "drinks"
  | "desserts";

export const MENU_CATEGORY_LABELS: Record<MenuCategory, string> = {
  pizza: "Pizza",
  pasta: "Pasta",
  antipasti: "Antipasti",
  panini: "Panini",
  drinks: "Drinks",
  desserts: "Desserts",
};

// --- Allergens (EU regulation + Japanese 7 major) ---

export type Allergen =
  | "gluten"
  | "dairy"
  | "eggs"
  | "fish"
  | "shellfish"
  | "nuts"
  | "peanuts"
  | "soy"
  | "celery"
  | "mustard"
  | "sesame"
  | "sulfites"
  | "lupin"
  | "molluscs";

export const ALLERGEN_LABELS: Record<Allergen, { en: string; pl: string; emoji: string }> = {
  gluten: { en: "Gluten", pl: "Gluten", emoji: "🌾" },
  dairy: { en: "Dairy", pl: "Nabiał", emoji: "🥛" },
  eggs: { en: "Eggs", pl: "Jaja", emoji: "🥚" },
  fish: { en: "Fish", pl: "Ryby", emoji: "🐟" },
  shellfish: { en: "Shellfish", pl: "Skorupiaki", emoji: "🦐" },
  nuts: { en: "Tree Nuts", pl: "Orzechy", emoji: "🥜" },
  peanuts: { en: "Peanuts", pl: "Orzeszki ziemne", emoji: "🥜" },
  soy: { en: "Soy", pl: "Soja", emoji: "🫘" },
  celery: { en: "Celery", pl: "Seler", emoji: "🥬" },
  mustard: { en: "Mustard", pl: "Gorczyca", emoji: "🟡" },
  sesame: { en: "Sesame", pl: "Sezam", emoji: "⚪" },
  sulfites: { en: "Sulfites", pl: "Siarczyny", emoji: "🍷" },
  lupin: { en: "Lupin", pl: "Łubin", emoji: "🌿" },
  molluscs: { en: "Molluscs", pl: "Mięczaki", emoji: "🦑" },
};

// --- Nutritional Information ---

export interface NutritionInfo {
  calories: number;      // kcal per serving
  protein: number;       // grams
  carbs: number;         // grams
  fat: number;           // grams
  /** Grams of sugars within `carbs` — reported separately because EU
   *  1169/2011 + UK FIR + FDA NFP all require "of which sugars" on the
   *  back-of-pack label. Always ≤ `carbs`. Optional because operators
   *  may roll out macros gradually. */
  sugar?: number;        // grams
  fiber?: number;        // grams
  sodium?: number;       // mg
}

/**
 * Menu engineering role (audit §4.3 — Hero / Profit-Driver / LTO triangle).
 *  - "hero"          — gateway item; biggest photo, full-width top slot
 *  - "profit-driver" — high GM × low awareness; "Pizzaiolo's Choice" badge,
 *                       prioritized after the hero in the sweet-spot row
 *  - "anchor"        — premium range-extender (PLN 48 Pizza del Pizzaiolo);
 *                       exists to make tier-2 feel modest, doesn't need volume
 *  - "lto"           — limited-time / seasonal driver; pairs with isLimited
 * Unset = standard menu item, ranked by popularity.
 */
export type MenuRole = "hero" | "profit-driver" | "anchor" | "lto";

// --- Item Modifiers (audit §3 — the biggest missing capability) ---------
//
// A modifier group attaches to a menu item. Each group has a set of
// options the customer can pick from (size, extra toppings, crust type).
// Options carry a `priceDelta` in grosze added to the line price, and
// optionally a `costDelta` for food-cost accuracy.
//
// Example: Pizza Margherita gets a "Crust" modifier group with options
// [Standard 0, Sourdough +500, Gluten-free +500] and a "Premium toppings"
// modifier group with multiselect [Extra cheese +600, Truffle oil +800,
// Buffalo mozzarella +900].
//
// The cart line for a pizza with selections carries `selectedModifiers`,
// each holding the group id + option id. Price math sums priceDelta × qty.

export interface ModifierOption {
  id: string;
  label: string;
  /** Price added to the line in grosze. Can be 0 (Standard crust) or
   *  positive (extra cheese +600). Negative values are clamped to 0
   *  at runtime — we don't credit refunds via modifier picks. */
  priceDelta: number;
  /** Food cost in grosze added when this option is selected. Used by
   *  the bundle margin alert + Reports for honest margin calc. */
  costDelta?: number;
  /** Optional flag — when true, modifier choice fires a KDS callout
   *  ("BUFFALO MOZZ" highlighted on the ticket). */
  flagOnKds?: boolean;
}

export interface ModifierGroup {
  id: string;
  /** Customer-facing label rendered above the option list. */
  label: string;
  /** Minimum number of options that must be selected (default 0 =
   *  optional group; 1 = required). */
  minSelections?: number;
  /** Maximum number of options the customer can select. 1 = radio
   *  (default for required groups); ≥2 = checkbox multiselect. */
  maxSelections?: number;
  options: ModifierOption[];
}

export interface SelectedModifier {
  /** ModifierGroup.id */
  groupId: string;
  /** ModifierOption.id */
  optionId: string;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number; // in grosze (1/100 PLN), e.g. 2500 = 25.00 PLN
  cost: number; // food cost in grosze — used for margin/PnL calculations
  category: MenuCategory;
  image?: string;
  tags: ("vegetarian" | "vegan" | "spicy" | "gluten-free")[];
  available: boolean;
  /** Operator-facing inventory / accounting code. Distinct from `id` (which
   *  is the stable database slug). Free-form up to 60 chars so operators
   *  can plug into existing SKU schemes (e.g. "SI-PIZ-MARG-001"). */
  sku?: string;
  /** Menu engineering role — see MenuRole. Drives card hierarchy + badges
   *  on the public menu page. Same item can be `anchor` AND `isLimited`. */
  menuRole?: MenuRole;
  // Japanese standard (Kodawari) fields
  allergens?: Allergen[];
  nutrition?: NutritionInfo;
  sourcing?: string;     // e.g. "San Marzano tomatoes from Campania, Italy"
  prepTimeMinutes?: number;
  isLimited?: boolean;   // seasonal/limited-time item
  limitedUntil?: string; // ISO date string
  /** Delivery-exclusive SKU (audit §3 channel economics). When true the
   *  menu page hides this item for dine-in/takeout and only surfaces it
   *  when fulfillmentType=delivery. Pantry items, beer 4-packs, frozen
   *  desserts live here. */
  deliveryOnly?: boolean;
  /** Per-unit packaging cost in grosze (audit §3 — boxes, napkins, carrier
   *  bag share). Subtracted from gross margin on delivery orders so the
   *  Bundle KPI dashboard / margin alert reflects real delivery economics
   *  rather than naked plate cost. Unset = 0 packaging cost. */
  packagingCost?: number;
  /** Item modifier groups (audit §3 — size upgrades, extra toppings,
   *  crust types). Each group can be optional (minSelections=0) or
   *  required, single-select (radio) or multi-select (checkbox). */
  modifierGroups?: ModifierGroup[];
  // --- Regulatory disclosures (audit §11.1) ---------------------------
  /** SG MUIS halal status. "halal" = the truck holds a current MUIS
   *  certificate AND this specific item is halal-compliant; "non-halal"
   *  = explicitly contains pork / non-halal slaughter / alcohol used in
   *  prep; "uncertified" = no claim. SG operators must disclose halal
   *  status or absence of certification. */
  halalStatus?: "halal" | "non-halal" | "uncertified";
  /** SG NEA Nutri-Grade (A best — D worst). Mandatory front-of-pack on
   *  pre-packaged sugar-sweetened beverages from Dec-2023. Restaurants
   *  must display the grade next to the item price when an in-house
   *  beverage qualifies. */
  nutriGrade?: "A" | "B" | "C" | "D";
  /** Per SG religious-disclosure expectation: items containing pork
   *  must be visibly flagged so Muslim and Jewish customers can avoid
   *  them at a glance. Independent of halalStatus (an item can be
   *  non-halal without containing pork — e.g. uses non-halal beef). */
  containsPork?: boolean;
  /** Items containing alcohol (cooking wine, beer reduction, gelato
   *  flambéed in rum). Required disclosure for Muslim customers in SG
   *  and for jurisdictions that ban under-18 sale of any alcohol-bearing
   *  preparation. */
  containsAlcohol?: boolean;
}

// --- Ingredients & Recipes ---

export type IngredientCategory =
  | "dairy"
  | "meat"
  | "seafood"
  | "produce"
  | "dry"
  | "sauce"
  | "oil"
  | "spice"
  | "bread"
  | "beverage"
  | "other";

export const INGREDIENT_CATEGORY_LABELS: Record<IngredientCategory, string> = {
  dairy: "Dairy",
  meat: "Meat",
  seafood: "Seafood",
  produce: "Produce",
  dry: "Dry Goods",
  sauce: "Sauces",
  oil: "Oils & Fats",
  spice: "Spices & Herbs",
  bread: "Bread & Dough",
  beverage: "Beverages",
  other: "Other",
};

export type IngredientUnit = "kg" | "g" | "L" | "ml" | "piece" | "bunch" | "can" | "bottle";

export interface Ingredient {
  id: string;
  name: string;
  category: IngredientCategory;
  unit: IngredientUnit;
  /** Reference into `IngredientProduct.id` — the per-distributor offering
   *  whose cost + nutrition values are used when this ingredient appears
   *  in a recipe. Operators switch distributors by changing which
   *  offering is active, not by retyping cost / kcal / macros. Unset on
   *  ingredients that haven't been linked to any supplier offering yet. */
  activeProductId?: string;
  notes?: string;
  // ---- Derived read-only fields ------------------------------------
  //
  // Source of truth for cost + nutrition lives on `IngredientProduct`
  // — one row per (ingredient, distributor) combo. `getIngredients()`
  // joins each ingredient to its active offering and surfaces the
  // values below as a convenience so call sites (recipe cost, PO
  // pricing, variance, inventory valuation, search) don't have to
  // re-do the join themselves.
  //
  // Writes go through ingredient_products + activeProductId; never
  // through these fields directly. Treat them as readonly cache.
  costPerUnit?: number;
  kcalPerUnit?: number;
  proteinPerUnit?: number;
  carbsPerUnit?: number;
  sugarPerUnit?: number;
  fiberPerUnit?: number;
  fatPerUnit?: number;
  /** Free-text supplier name from the active offering (or the legacy
   *  text field on rows that haven't been migrated to a real Supplier
   *  FK yet). Surfaces in search results + the ingredients table. */
  supplier?: string;
}

/**
 * Per-distributor offering of an ingredient — what the chain buys, with
 * the distributor-specific cost, supplier SKU, and nutrition label
 * (energy + macros per-unit). One ingredient can have many offerings
 * (one per distributor that carries it); a single offering is flagged
 * "active" via `Ingredient.activeProductId` and drives recipe cost +
 * nutrition. Swapping distributor = pointing `activeProductId` at a
 * different row.
 *
 * Nutrition lives here rather than on Ingredient because two
 * distributors selling "Mozzarella di Bufala" may print different macro
 * profiles on the back of the pack (different fat / moisture / brining).
 * Same reason for cost: it's a property of the offering, not the
 * ingredient.
 */
export interface IngredientProduct {
  id: string;
  ingredientId: string;
  /** FK into `Supplier.id`. Required so an offering always traces back
   *  to a Supplier row — we use the supplier name in the picker label
   *  + the operator can update contact / lead time / address in one
   *  place. */
  supplierId: string;
  /** Distributor's catalogue SKU / part number for this product — e.g.
   *  "MZ-BUFALA-1KG-EU". Free-form so operators can plug into whatever
   *  scheme the distributor uses. Optional. */
  supplierSku?: string;
  /** Operator-friendly display name, e.g. "Bufala 1kg pack". When
   *  blank, the UI falls back to `<supplier name> · <ingredient name>`. */
  displayName?: string;
  /** Grosze per unit (per kg / per L / per piece). */
  costPerUnit: number;
  /** Energy + macros per unit. Same semantics as the previous
   *  ingredient-level fields — display layer renders per-100g, storage
   *  stays per-unit. All optional so operators can backfill gradually. */
  kcalPerUnit?: number;
  proteinPerUnit?: number;
  carbsPerUnit?: number;
  sugarPerUnit?: number;
  fiberPerUnit?: number;
  fatPerUnit?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeIngredient {
  ingredientId: string;
  quantity: number;       // in the ingredient's unit
  wasteFactor: number;    // multiplier, e.g. 1.1 = 10% waste/trimming
}

export interface Recipe {
  id: string;             // e.g. "rcp-a1b2c3d4"
  menuItemId: string;
  ingredients: RecipeIngredient[];
  prepTimeMinutes?: number;
  yieldPortions: number;  // how many servings this recipe makes
  notes?: string;
}

export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  locationSlug: string;
  /**
   * Free-text per-line special request, e.g. "no onion", "extra crispy",
   * "well-done". Surfaced on the KDS ticket and on the admin order detail.
   */
  notes?: string;
  /** Modifier selections for this line (audit §3). Each entry pairs a
   *  modifier group id with the chosen option id. Cart math sums
   *  `option.priceDelta × quantity` into the line subtotal. */
  selectedModifiers?: SelectedModifier[];
}

export type FulfillmentType = "takeout" | "delivery" | "dine-in";

export type SlotStatus = "draft" | "active";

export interface TimeSlot {
  id: string;
  locationSlug: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  maxOrders: number;
  currentOrders: number;
  fulfillmentTypes: FulfillmentType[]; // which types this slot supports
  status: SlotStatus; // "draft" until admin approves, then "active"
  /**
   * Minimum order value (grosze) to book this slot. The Demand Exchange yield
   * lever for kitchen-capped slots: raise price when you can't raise volume.
   * Unset / 0 = no minimum. Enforced server-side at checkout.
   */
  minSpendGrosze?: number;
}

// --- Feedback ---

export interface OrderFeedback {
  overallRating: number;
  categoryRatings?: Record<string, number>;
  comment?: string;
  submittedAt: string;
}

// --- Quality Control (Kaizen) ---

export interface QualityCheck {
  checkedBy?: string;
  checkedAt?: string;
  temperatureOk?: boolean;
  presentationOk?: boolean;
  accuracyOk?: boolean;
  notes?: string;
}

/** Single source of truth for order lifecycle statuses (kitchen + API validation).
 *
 * m2_13 added the three delivery-specific transitions between `ready` and
 * `completed`. Takeout orders skip them and flip ready → completed directly.
 *   ready      kitchen finished prep
 *   assigned   driver picked the bag up
 *   picked_up  driver left the truck en route to the customer
 *   delivered  customer received it (admin or driver marks this)
 *   completed  closeout — analytics + closing reports look at this set
 */
export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "assigned",
  "picked_up",
  "delivered",
  "completed",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Reason codes for refunds, voids, and comps. Surfaced in the admin UI dropdown. */
export const REFUND_REASON_CODES = [
  "customer_request",
  "wrong_item",
  "quality_issue",
  "late_or_no_show",
  "missing_item",
  "duplicate_charge",
  "manager_comp",
  "other",
] as const;

export type RefundReasonCode = (typeof REFUND_REASON_CODES)[number];

export const REFUND_REASON_LABELS: Record<RefundReasonCode, string> = {
  customer_request: "Customer request",
  wrong_item: "Wrong item / wrong order",
  quality_issue: "Quality issue",
  late_or_no_show: "Late or no-show",
  missing_item: "Missing item",
  duplicate_charge: "Duplicate charge",
  manager_comp: "Manager comp (on the house)",
  other: "Other",
};

export interface OrderRefund {
  /** "full" refunds the entire paid amount and cancels the order; "partial" leaves the order intact. */
  type: "full" | "partial";
  /** Refunded amount in grosze. */
  amount: number;
  reasonCode: RefundReasonCode;
  notes?: string;
  /** Stripe refund id when the original charge was reversed; absent for offline / demo-mode refunds. */
  stripeRefundId?: string;
  /** Actor identifier (today: "admin"). */
  refundedBy: string;
  refundedAt: string;
}

/** Stripe dispute lifecycle statuses. Mirrors Stripe's own values 1:1. */
export const DISPUTE_STATUSES = [
  "warning_needs_response",
  "warning_under_review",
  "warning_closed",
  "needs_response",
  "under_review",
  "won",
  "lost",
] as const;

export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export interface OrderDispute {
  /** Stripe dispute id (`dp_…`). */
  stripeDisputeId: string;
  status: DisputeStatus;
  /** Stripe-supplied reason, e.g. "fraudulent", "product_not_received". */
  reason: string;
  /** Disputed amount in grosze. May be less than the charge total. */
  amount: number;
  /** ISO timestamp when the dispute was first opened. */
  createdAt: string;
  /** ISO timestamp of the most recent webhook update. */
  updatedAt: string;
  /** ISO timestamp of dispute resolution (won/lost), if closed. */
  closedAt?: string;
}

export interface Order {
  id: string;
  locationSlug: string;
  items: CartItem[];
  totalAmount: number;
  status: OrderStatus;
  customerName: string;
  customerPhone: string;
  fulfillmentType: FulfillmentType;
  deliveryAddress?: string;
  /** Number of guests for a dine-in reservation. Set only when
   *  fulfillmentType === "dine-in"; the slot doubles as the table booking
   *  time and the cart is the pre-chosen food. */
  partySize?: number;
  /** Assigned floor table (FloorTable.id) for dine-in orders, set from the
   *  POS or the Floor page. Pairs with partySize (covers). */
  tableId?: string;
  specialInstructions?: string;
  /** POS dine-in coursing state captured at fire time — which courses are away
   *  on the line vs still held back. Set by the POS order actuator when a
   *  coursed check fires; drives the KDS "course held" hint. Held courses are
   *  intentionally absent from `items` until they're fired. */
  coursing?: { fired: PosCourse[]; held: PosCourse[] };
  slotId: string;
  slotDate: string;
  slotTime: string;
  createdAt: string;
  paidAt?: string;
  // Japanese standard additions
  queuePosition?: number;
  estimatedReadyAt?: string;
  feedback?: OrderFeedback;
  qualityCheck?: QualityCheck;
  // Stripe correlation — captured by the webhook on checkout.session.completed.
  // Required to issue refunds against the original charge.
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  /** Set when a refund (full or partial) has been processed. */
  refund?: OrderRefund;
  /** Set when Stripe sent a `charge.dispute.created`. Drives the AdminOrders dispute badge. */
  dispute?: OrderDispute;
  /** Optional tip captured at checkout (grosze). Goes to Stripe as a separate
   *  line item so receipts show "Items 28 zł + Tip 3 zł = 31 zł" cleanly. */
  tipAmount?: number;
  /** Delivery fee in grosze (m2_12). Charged on top of items + tip for
   *  delivery orders below the free-delivery threshold. 0 / unset for
   *  takeout. */
  deliveryFee?: number;
  /** Staff member id assigned as the courier (m2_11). Set when admin
   *  taps "Assign driver" on the order detail. Used to scope driver-
   *  facing views and to compute delivery margin in m2_14. */
  assignedDriverId?: string;
  /** Origin channel for the order. Defaults to "web" when absent so
   *  legacy rows still resolve. The comms dispatcher uses this to pick
   *  the right outbound transport — WhatsApp replies for whatsapp
   *  orders, SMS otherwise. "qr" = in-restaurant QR-code table ordering
   *  (a walk-in dine-in order, no time-slot booking). */
  channel?: "web" | "whatsapp" | "qr";
  /** Marks a synthetic / simulated order. Reserved scaffolding — the KDS
   *  order simulator that produced these was removed, but the flag stays for
   *  future simulation tooling: getOrders() filters simulated records out of
   *  every read by default, so they never reach the dashboard, Orders list,
   *  reports or CRM, and never trigger stock decrement, customer rollups, or
   *  customer comms. */
  simulated?: boolean;
  /** Tender breakdown captured at POS charge — how the bill was settled. One
   *  entry for a single payment, several for a split. Sums to net due + tip. */
  payments?: PosPayment[];
  /** Cash handling at charge: total cash handed over and change returned
   *  (grosze). Set only when (part of) the bill was paid in cash. */
  cashTendered?: number;
  changeGiven?: number;
  /** Manager comp applied at the till (grosze) — food taken off the bill, a
   *  pure loss tracked separately from the gross `totalAmount` (which stays the
   *  full menu value, like a refund). Audited + capped per shift via the same
   *  refund-guard path as post-sale refunds. */
  compAmount?: number;
  compReasonCode?: RefundReasonCode;
  compNote?: string;
}

/** A single tender against a POS check (one of several when the bill is split).
 *  `amount` is what was applied to the bill in grosze, excluding any cash change. */
export interface PosPayment {
  method: "cash" | "card";
  amount: number;
}

// --- Floor: physical tables + reservations (per location) ---

export type TableStatus = "available" | "seated" | "reserved" | "out-of-service";

/** A physical table on a location's floor. `number` is the operator-facing
 *  label (free-form so it can be "12", "Bar 3", "Patio A"). */
export interface FloorTable {
  id: string;
  locationSlug: string;
  number: string;
  seats: number;
  zone?: string;
  status: TableStatus;
  /** Free-text service note for the table (allergy, VIP, high-chair, …),
   *  edited live from the Service → Floor table detail. */
  notes?: string;
  createdAt: string;
}

export type ReservationStatus =
  | "booked"
  | "seated"
  | "completed"
  | "cancelled"
  | "no-show";

/** A dine-in booking. Held against a table for a time window
 *  (`time` + `durationMin`); two active bookings on the same table whose
 *  windows overlap are a conflict (see reservationsOverlap). */
export interface Reservation {
  id: string;
  locationSlug: string;
  customerName: string;
  customerPhone?: string;
  partySize: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  durationMin: number;
  tableId?: string;
  /**
   * Links the booking to a dine-in time slot (the merged Floor+Slots flow):
   * the slot supplies the date/time and the booking capacity, the table the
   * seat. Set when created via the unified booking flow; absent on legacy
   * manually-timed reservations.
   */
  slotId?: string;
  status: ReservationStatus;
  notes?: string;
  createdAt: string;
}

// --- POS open checks (tabs) ---

export type PosTabStatus = "open" | "parked" | "pay";

/** A single ordered line on an open check. Stores the menu-item id + quantity
 *  only — never a price. Prices + discounts are resolved server-side against
 *  the location's real menu when the tab is sent to the kitchen or charged, so
 *  the till can never dictate what an item costs. */
/** A dine-in coursing bucket. Lines are fired to the kitchen course-by-course
 *  (starters away, mains held) so the line cooks pace a sit-down service.
 *  Takeaway / delivery tabs ignore coursing and fire everything at once. */
export type PosCourse = "starter" | "main" | "dessert" | "drink";

export interface PosTabLine {
  menuItemId: string;
  quantity: number;
  /** Which course this line belongs to (dine-in coursing). Absent lines are
   *  treated as "main" so legacy / non-coursed tabs still resolve. */
  course?: PosCourse;
  /** Per-line modifier selections (group id + option id). Priced server-side
   *  off the live menu's option `priceDelta`s — the till never sends a price.
   *  Two otherwise-identical lines with different picks stay separate. */
  modifiers?: SelectedModifier[];
  /** Free-text special request for this line ("no chili", "well done", an
   *  allergy flag). Surfaced on the KDS ticket and the receipt. */
  notes?: string;
  /** True when a GUEST added this line via QR to the table's open check — it
   *  awaits the server's review before firing (the "fourth renderer"
   *  contributing to the same check, not a parallel order). Cleared on fire. */
  guestPending?: boolean;
}

/** An open check at the counter — the "Tabs" POS lets staff juggle several at
 *  once. Persisted server-side (per location) so it survives a refresh and is
 *  shared across tills. `orderId` is set once the check is sent to the KDS or
 *  charged: from then on the real Order is the source of truth for the kitchen,
 *  and this tab just tracks the till-side editing state until it's paid off. */
/** Operator-applied manual discount on a POS check (on top of any auto combo
 *  deal). Server re-computes the charged amount from this — never the client. */
export interface PosTabDiscount {
  type: "amount" | "percent";
  /** Grosze when type === "amount"; whole percent 0–100 when "percent". */
  value: number;
  reason?: string;
}

export interface PosTab {
  id: string;
  locationSlug: string;
  name: string;
  /** No default — staff must pick a channel before a tab can be sent or charged. */
  channel: FulfillmentType | null;
  status: PosTabStatus;
  items: PosTabLine[];
  /** Dine-in: assigned floor table (FloorTable.id) + party size. */
  tableId?: string;
  covers?: number;
  /** Delivery: free-text address + driver note. */
  address?: string;
  /** Loyalty member attached to the check — points accrue to this phone on
   *  payment (Rule #6, phone-based). Optional name for the receipt. */
  customerPhone?: string;
  customerName?: string;
  /** Operator-applied manual discount, on top of any auto combo deal. */
  discount?: PosTabDiscount;
  /** Dine-in: fire course-by-course (true) vs everything together (false).
   *  Defaults to coursed for dine-in, together for takeaway / delivery. */
  coursed?: boolean;
  /** Server-owned: which courses have been fired to the kitchen so far. Grows
   *  as the operator fires each course; the linked Order is rebuilt from the
   *  union of these courses' lines, so held courses never hit the KDS. */
  firedCourses?: PosCourse[];
  /** True once the check has been fired to the kitchen display. */
  sentKds: boolean;
  /** The real Order created on send / charge. Absent until then. */
  orderId?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Inventory (per-location stock for an ingredient) ---

export interface IngredientStock {
  ingredientId: string;
  locationSlug: string;
  /** Current quantity on hand, in the ingredient's unit. */
  onHand: number;
  /** Target stock level — guides receive quantities. */
  parLevel: number;
  /** Below this number, generate a low-stock alert. */
  reorderPoint: number;
  /** ISO timestamp of the last manual stocktake. */
  lastCountedAt?: string;
  lastCountedBy?: string;
  updatedAt: string;
}

export type StockMovementType = "receive" | "waste" | "consume" | "adjust";

export interface StockMovement {
  id: string;
  ingredientId: string;
  locationSlug: string;
  type: StockMovementType;
  /** Signed delta applied to onHand (negative for waste/consume/adjust-). */
  quantity: number;
  /** Optional cost impact in grosze (e.g. waste valuation). */
  costImpact?: number;
  reason?: string;
  occurredAt: string;
  byUser?: string;
}

// --- Suppliers + Purchase Orders ---

export interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  /** Typical days between PO send and delivery. */
  leadTimeDays?: number;
  notes?: string;
  createdAt: string;
}

export type PurchaseOrderStatus = "draft" | "sent" | "received" | "cancelled";

export interface PurchaseOrderLine {
  ingredientId: string;
  quantity: number;
  /** Per-unit cost in grosze (snapshot at PO time). */
  unitCost: number;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  locationSlug: string;
  status: PurchaseOrderStatus;
  lines: PurchaseOrderLine[];
  totalCents: number;
  expectedAt?: string;
  receivedAt?: string;
  notes?: string;
  createdAt: string;
  createdBy?: string;
}

// --- CRM ---

export interface CustomerNote {
  id: string;
  /** Canonical E.164 PL phone — the customer key. */
  phone: string;
  body: string;
  tags?: string[];
  authoredBy?: string;
  createdAt: string;
}

// --- Staff / HR ---

/**
 * Job titles, not access tiers. The granular title lives on the roster so a
 * manager hires a "pizzaiolo" or a "waiter" — not an abstract "kitchen" or
 * "front" worker. Each title maps to an access role + landing surface via
 * `src/lib/staff-roles.ts` (kitchen titles → KDS, floor titles → POS).
 *
 * The legacy values (`kitchen`, `front`) are kept so pre-existing roster rows
 * and shifts keep validating; new hires pick a specific title.
 */
export type StaffRole =
  | "manager"
  | "pizzaiolo"
  | "chef"
  | "kp"
  | "kitchen"
  | "waiter"
  | "front"
  | "driver"
  | "courier";
export type StaffStatus = "active" | "inactive";

export interface StaffMember {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  role: StaffRole;
  locationSlug: string;
  /** Hourly rate in grosze. */
  hourlyRateGrosze: number;
  hireDate?: string;
  /** ISO date of birth (YYYY-MM-DD). Used by scheduling rules to enforce
   *  under-18 / alcohol-hours restrictions per Polish Labor Code. */
  dob?: string;
  status: StaffStatus;
  notes?: string;
  createdAt: string;
  /**
   * Links this roster row to its login account (AdminUser) when the manager
   * granted "login access" at hire time. Set on both sides (AdminUser.staffId)
   * so deleting/disabling one can cascade to the other.
   */
  userId?: string;
}

export type ShiftStatus = "scheduled" | "in-progress" | "done" | "missed";

export interface Shift {
  id: string;
  staffId: string;
  locationSlug: string;
  /** ISO start timestamp. */
  startAt: string;
  /** ISO end timestamp. */
  endAt: string;
  role: StaffRole;
  status: ShiftStatus;
  notes?: string;
}

export interface TimePunch {
  id: string;
  staffId: string;
  /** ISO timestamp of the punch. */
  occurredAt: string;
  type: "clock-in" | "clock-out";
  /** Optional shift this punch is associated with. */
  shiftId?: string;
}

// --- Truck operations ---

export interface RunSheetSegment {
  name: string;
  /** Optional decimal lat/lng for map placement. */
  lat?: number;
  lng?: number;
  startTime?: string;
  endTime?: string;
}

export interface EventRunSheet {
  id: string;
  name: string;
  locationSlug: string;
  description?: string;
  stops: RunSheetSegment[];
  createdAt: string;
}

export type BookingEventStatus = "scheduled" | "live" | "done" | "cancelled";

export interface BookingEvent {
  id: string;
  routeId?: string;
  locationSlug: string;
  name: string;
  date: string; // YYYY-MM-DD
  expectedAttendance?: number;
  actualRevenueGrosze?: number;
  actualOrders?: number;
  /** Free-form notes (weather, road closures, etc). */
  notes?: string;
  status: BookingEventStatus;
  createdAt: string;
}

// --- Expansion readiness checklist (per prospective location) ---

export interface ExpansionChecklistItem {
  id: string;
  label: string;
  done: boolean;
  category: "legal" | "site" | "supply" | "people" | "ops" | "marketing";
  notes?: string;
}

export interface ExpansionChecklist {
  locationSlug: string;
  /** Free-form name when the slug refers to a planned but not-yet-active location. */
  city?: string;
  items: ExpansionChecklistItem[];
  notes?: string;
  /** ISO timestamp of last edit. */
  updatedAt: string;
}

// --- Cash management (truck float, drops, EOD variance) ---

export interface CashDrop {
  id: string;
  /** Grosze added (positive) or removed (negative) from the till at this drop. */
  amountGrosze: number;
  /** "sale" = cash sale recorded by cashier, "drop" = bank/safe drop, "payout" = cash paid out, "adjust" = correction. */
  kind: "sale" | "drop" | "payout" | "adjust";
  /** ISO timestamp. */
  at: string;
  notes?: string;
  actor?: string;
}

export interface CashSession {
  id: string;
  locationSlug: string;
  /** ISO timestamp the session opened. */
  openedAt: string;
  /** Opening float in grosze (manager-supplied count when starting). */
  openingFloat: number;
  openedBy: string;
  drops: CashDrop[];
  /** Counted total in grosze at EOD; absent until close. */
  closingCountGrosze?: number;
  closedAt?: string;
  closedBy?: string;
  /** closingCountGrosze − (openingFloat + sum(drops)). Negative ⇒ short; positive ⇒ over. */
  varianceGrosze?: number;
  notes?: string;
  /** Soft-hidden from the default History view. The row is preserved for
   *  audit and can be revealed via the "Show hidden" toggle. */
  hidden?: boolean;
}

// --- Compliance calendar (licences, inspections, insurance) ---

export const COMPLIANCE_KINDS = [
  "alcohol_license",
  "fire_inspection",
  "sanepid",
  "insurance",
  "gas_inspection",
  "lease",
  "other",
] as const;

export type ComplianceKind = (typeof COMPLIANCE_KINDS)[number];

export const COMPLIANCE_KIND_LABELS: Record<ComplianceKind, string> = {
  alcohol_license: "Alcohol license",
  fire_inspection: "Fire inspection",
  sanepid: "SANEPID",
  insurance: "Insurance",
  gas_inspection: "Gas inspection",
  lease: "Lease",
  other: "Other",
};

export interface ComplianceItem {
  id: string;
  locationSlug: string;
  kind: ComplianceKind;
  /** Human-friendly title — e.g. "Concession alcohol license (Stary Rynek)". */
  title: string;
  /** ISO date when the document/license expires. */
  expiresAt: string;
  /** ISO date the document was last renewed, if known. */
  lastRenewedAt?: string;
  /** Optional internal/contact notes (renewal procedure, lawyer contact, etc.). */
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Admin users + roles ---

export type AdminRole = "owner" | "manager" | "franchisee" | "staff" | "kitchen";
export type AdminUserStatus = "active" | "disabled";

export interface AdminUser {
  id: string;
  name: string;
  email?: string;
  role: AdminRole;
  status: AdminUserStatus;
  /**
   * Legacy single-location binding. Still honored, but `locationSlugs` is the
   * canonical multi-location field — a manager can run more than one site.
   * Resolve with `userLocationSlugs()` (prefers the array, falls back to this).
   */
  locationSlug?: string;
  /**
   * Locations this account is scoped to. Empty/absent = all locations (owners,
   * unscoped accounts). Bound into the session's comma-separated locationScope
   * at login and enforced by requireLocationAccess on every admin route.
   */
  locationSlugs?: string[];
  notes?: string;
  createdAt: string;
  /**
   * Granular per-user permission grant (action-level keys from
   * `src/lib/permissions.ts`). When set this is the authoritative, fully-custom
   * grant and overrides role-rank gating for this user. When absent the user
   * falls back to their role's default preset, so legacy accounts are
   * unaffected. Owner is always all-access regardless of this field.
   */
  permissions?: string[];
  /** Base32 TOTP secret, set during enrollment (before it's confirmed). */
  totpSecret?: string;
  /** True once the user confirms a code — login then requires a TOTP. */
  totpEnabled?: boolean;
  /**
   * Per-user scrypt password hash (format from `src/lib/password.ts`). When
   * set, login verifies against THIS — the account no longer rides the shared
   * ADMIN_PASSWORD. Absent for the bootstrap owner, who keeps the shared
   * secret until they set a personal one.
   */
  passwordHash?: string;
  /**
   * Per-user scrypt PIN hash, for fast login on a shared kitchen/POS terminal
   * (`/terminal`). Same hash format as the password; kept separate so a short
   * PIN never doubles as the full password.
   */
  pinHash?: string;
  /** Links a login account back to its roster row (StaffMember.id). */
  staffId?: string;
  /**
   * Registered WebAuthn credentials (passkeys / hardware security keys such as
   * a YubiKey) the account can authenticate with — phishing-resistant, no
   * shared secret, private key never leaves the authenticator.
   */
  webauthnCredentials?: WebAuthnCredential[];
  /**
   * Transient challenge issued during passkey enrollment, consumed by
   * register-finish then cleared. Login challenges live in a short-lived signed
   * cookie instead, since there's no session yet at that point.
   */
  currentWebauthnChallenge?: string;
}

/** One registered passkey / security key. Public key only — never a secret. */
export interface WebAuthnCredential {
  /** Base64url credential ID (the authenticator's handle). */
  id: string;
  /** Base64 COSE public key. */
  publicKey: string;
  /** Signature counter, bumped each auth to detect cloned authenticators. */
  counter: number;
  /** Hints like "usb" / "nfc" / "internal" for the browser prompt. */
  transports?: string[];
  /** Operator-friendly label, e.g. "YubiKey 5C" or "MacBook Touch ID". */
  name?: string;
  createdAt: string;
}

// --- Business costs (operating expenses ledger) ---

export type BusinessCostCategory =
  | "payroll"
  | "rent"
  | "utilities"
  | "insurance"
  | "fuel"
  | "vehicle"
  | "maintenance"
  | "licenses"
  | "marketing"
  | "ingredients"
  | "equipment"
  | "software"
  | "professional"
  | "tax"
  | "other";

/** Sub-role used when category=payroll so KPIs can split labor by craft. */
export type BusinessCostPayrollRole =
  | "pizzaiolo"
  | "chef"
  | "sous-chef"
  | "kitchen-porter"
  | "waiter"
  | "barista"
  | "driver"
  | "manager"
  | "cleaner"
  | "other";

export type BusinessCostFrequency =
  | "one-off"
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly";

export type BusinessCostStatus = "active" | "archived";

export interface BusinessCost {
  id: string;
  /** Human label, e.g. "Restaurant rent Kraków", "Pizzaiolo Marco Rossi". */
  name: string;
  category: BusinessCostCategory;
  /** Free-form when not payroll; constrained payroll role otherwise. */
  payrollRole?: BusinessCostPayrollRole;
  vendor?: string;
  /** Cost per `frequency` period, in grosze (1 PLN = 100 grosze). */
  amountGrosze: number;
  frequency: BusinessCostFrequency;
  /** Location slug, or undefined for chain-wide. */
  locationSlug?: string;
  status: BusinessCostStatus;
  /** ISO date (YYYY-MM-DD) the cost begins (or the date of a one-off). */
  startDate?: string;
  /** ISO date the cost ended — set when archiving recurring costs. */
  endDate?: string;
  /** ISO date next payment is due — operator reminder for recurring items. */
  nextDueDate?: string;
  paymentMethod?: "card" | "bank-transfer" | "cash" | "direct-debit" | "other";
  taxDeductible?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Finance simulation (sandbox monthly P&L) ----------------------------
//
// A what-if scenario operators tweak inside /admin/simulation. Pure
// projection — never feeds the real business-costs ledger. Persists to
// simulation-scenarios.json so reopening the page picks up where the
// operator left off.

export interface SimulationLaborLine {
  id: string;
  role: BusinessCostPayrollRole;
  /** Number of people on this role line. */
  headcount: number;
  /** Per-person hours per week (service + prep + close-down). */
  hoursPerWeek: number;
  /** Per-person gross pay rate in grosze / hour. */
  hourlyRateGrosze: number;
}

export interface SimulationSeasonality {
  /** Multiplier applied to ordersPerDay for Dec/Jan/Feb. */
  winter: number;
  /** Multiplier applied to ordersPerDay for Mar/Apr/May. */
  spring: number;
  /** Multiplier applied to ordersPerDay for Jun/Jul/Aug. */
  summer: number;
  /** Multiplier applied to ordersPerDay for Sep/Oct/Nov. */
  autumn: number;
  /** Optional per-month overrides (length 12, Jan=0..Dec=11). When set,
   *  the per-month value REPLACES the quarterly value for that month —
   *  letting operators decouple Jan from Feb from Dec, which matters for
   *  an indoor restaurant where December books up with festive dinners
   *  and Jan/Feb soften. Undefined entries fall back to the quarter. */
  monthlyOverrides?: (number | undefined)[];
}

/** Per-preset override values the operator has saved. Same shape as the
 *  baked-in MenuScenarioPreset minus its identity fields (id / name /
 *  emoji / description) — the editable surface for a single scenario. */
export interface SimulationMenuScenarioOverride {
  ordersPerDay: number;
  daysOpenPerMonth: number;
  avgTicketGrosze: number;
  cogsPct: number;
  attach: {
    coffee: number;
    dessert: number;
    antipasti: number;
    aperitivo: number;
    premiumToppings: number;
    pastaPrimo: number;
  };
}

export interface SimulationMenuMixLine {
  menuItemId: string;
  /** Share of orders this item represents (0–1). The mix sums to ~1.
   *  Deprecated: kept for backward compatibility with saved scenarios.
   *  The simulator no longer reads this — operators pick from a small
   *  set of preset menu scenarios instead. */
  weight: number;
}

/** A "X% of orders attach an espresso (avg 9 zł, 12% COGS)" lever. */
export interface SimulationAttachLever {
  /** When false, the lever's values are preserved but excluded from the math.
   *  Default: true. Lets operators flip on/off to compare with vs without. */
  enabled?: boolean;
  /** Share of orders that get this add-on (0–1). */
  attachPct: number;
  /** Average price added per attached order, in grosze. */
  avgPriceGrosze: number;
  /** COGS ratio for this add-on (0–1). */
  cogsPct: number;
}

/** A "what if cheese price drops 10%" or "what if we cut dough weight 10%"
 *  lever. Multiplies the base-pizza COGS by `(1 + cogsShare × costDeltaPct)`
 *  so an ingredient that's 25% of COGS getting 10% more expensive lifts
 *  total COGS by 2.5%. Use positive deltas for cost rises / extra usage,
 *  negatives for cost drops / recipe trims. */
export interface SimulationIngredientLever {
  /** When false, excluded from the math without losing the configured values. */
  enabled?: boolean;
  /** What share of base pizza COGS this ingredient represents (0–1). */
  cogsShare: number;
  /** Price (or usage) change as a fraction. +0.20 = +20%, −0.10 = −10%. */
  costDeltaPct: number;
}

/** Behavioral assumption levers. Each lever folds into effective ticket
 *  and COGS — operators tune attach rates instead of plain revenue. Every
 *  lever has an `enabled` flag so the operator can isolate the impact of
 *  a single hypothesis. */
export interface SimulationAssumptions {
  coffeeAttach?: SimulationAttachLever;
  dessertAttach?: SimulationAttachLever;
  antipastiAttach?: SimulationAttachLever;
  aperitivoAttach?: SimulationAttachLever;
  premiumToppingsAttach?: SimulationAttachLever;
  pastaPrimoAttach?: SimulationAttachLever;
  /** Combo: X% of mains convert to a combo (main + drink + dessert) at a discount. */
  comboConversion?: {
    enabled?: boolean;
    pct: number;
    /** Typical combo addon price (drink + dessert), in grosze. */
    addonGrosze: number;
    /** Bundle discount per combo, in grosze. */
    discountGrosze: number;
    /** COGS ratio for the addon portion (0–1). */
    addonCogsPct: number;
  };
  /** Cheapest-pizza recession shift, in percentage points. Positive = more
   *  Margherita/Marinara share, lower AOV, lower COGS. */
  cheapestPizzaShift?: {
    enabled?: boolean;
    pp: number;
    /** Per-pp drop in AOV in grosze. */
    ticketDeltaGrosze: number;
    /** Per-pp drop in COGS in grosze. */
    cogsDeltaGrosze: number;
  };
  /** Delivery channel share (0–1) with packaging + processor + fee deltas. */
  deliveryShare?: {
    enabled?: boolean;
    pct: number;
    /** Per-order extra packaging cost, in grosze. */
    packagingCostGrosze: number;
    /** Additional processor fee on the delivery share (e.g. 0.005 = +0.5pp). */
    extraProcessorPct: number;
    /** Average delivery fee revenue per order, in grosze. */
    avgFeeGrosze: number;
  };
  /** Ingredient cost stress tests — recipe + supplier "what ifs". Each
   *  lever has a calibration share (what % of base-pizza COGS it represents)
   *  and an editable cost-delta the operator can flex up or down. */
  ingredients?: {
    mozzarella?: SimulationIngredientLever;
    tomato?: SimulationIngredientLever;
    flour?: SimulationIngredientLever;
    doughWeight?: SimulationIngredientLever;
    oliveOil?: SimulationIngredientLever;
    curedMeats?: SimulationIngredientLever;
    buffaloMozz?: SimulationIngredientLever;
    eggs?: SimulationIngredientLever;
    ovenFuel?: SimulationIngredientLever;
    packaging?: SimulationIngredientLever;
  };
}

/** Weather + calendar levers — modify effective ordersPerDay and daysOpen. */
export interface SimulationWeather {
  /** Master toggle. When false, applyAnnualWeather() skips all
   *  adjustments and the headline P&L runs on raw operator-typed
   *  ordersPerDay × daysOpenPerMonth. Defaults to true (enabled). */
  enabled?: boolean;
  /** Multiplier on volume for rainy days (e.g. 0.75 = -25%). */
  rainyDayMultiplier: number;
  /** Share of days that are rainy in a typical month (0–1). */
  rainyShare: number;
  /** Multiplier on volume for hot patio evenings. */
  heatwaveMultiplier: number;
  /** Share of evenings hot enough to apply the heatwave bonus (0–1). */
  heatwaveShare: number;
  /** Closed days per month due to Polish holidays (Easter / NYE / 25 Dec / etc). */
  holidayClosedDaysPerMonth: number;
  /** Peak days per month (NYE, Valentine's, Mother's Day, etc). */
  holidayPeakDaysPerMonth: number;
  /** Multiplier on volume for peak days. */
  holidayPeakMultiplier: number;
  /** Lunch volume multiplier in July + August (offices empty). */
  schoolHolidayLunchMultiplier: number;
  /** Event days per month (festivals, local events, big match days). */
  eventDaysPerMonth: number;
  /** Volume multiplier on event days. */
  eventDayMultiplier: number;
}

export interface SimulationScenario {
  /** Average orders served per operating day. */
  ordersPerDay: number;
  /** Average order ticket size in grosze. */
  avgTicketGrosze: number;
  /** How many days per month the restaurant is open. */
  daysOpenPerMonth: number;
  /** Food cost ratio (0–1). 0.30 = ingredients eat 30% of revenue. */
  cogsPct: number;
  labor: SimulationLaborLine[];
  /** Fixed monthly costs in grosze, keyed by business-cost category. */
  fixedCosts: Partial<Record<BusinessCostCategory, number>>;
  /** Annual wage inflation (0–1). Drives the 12-month projection. */
  wageInflationPct?: number;
  /** Annual ingredient + fixed-cost inflation (0–1). */
  ingredientInflationPct?: number;
  /** Card processor blended fee as fraction of revenue (e.g. 0.019 Stripe). */
  paymentProcessorPct?: number;
  /** Setup cost in grosze (restaurant fit-out, kitchen build, deposits) — payback calc. */
  setupCostGrosze?: number;
  /** Seasonal multipliers on ordersPerDay across the four quarters. */
  seasonality?: SimulationSeasonality;
  /** Id of the active menu scenario preset (e.g. "balanced", "premium").
   *  Picking a preset loads avgTicketGrosze + cogsPct + assumption levers
   *  in one click. Operators can still tweak any value afterwards. */
  menuScenario?: string;
  /** Per-preset operator overrides — when the operator edits a scenario
   *  card and clicks Save, the customised values land here keyed by preset
   *  id. Reset-to-default deletes the key, restoring the baked-in preset.
   *  Used by the MenuScenarioPicker to render editable cards that persist
   *  across reloads. The "custom" preset id is always operator-defined. */
  menuScenarioOverrides?: Record<string, SimulationMenuScenarioOverride>;
  /** Internal: tracks one-time data migrations applied to this scenario.
   *  When the loader sees a value lower than the current CURRENT_VERSION
   *  it applies the missing migrations and bumps the marker. Operator
   *  doesn't see this field. */
  assumptionsMigrationVersion?: number;
  /** Behavioral attach / upsell levers — fold into effective ticket + COGS. */
  assumptions?: SimulationAssumptions;
  /** Weather + Polish-holiday calendar levers — modify effective volume. */
  weather?: SimulationWeather;
  /** Food waste / spoilage as fraction of revenue (0–1). QSR benchmark 1-3%
   *  of revenue (= ~4-8% of COGS). Folded into total COGS; not visible as a
   *  separate fixed-cost line because it scales with volume. */
  wastePct?: number;
  /** Refund / void / comp / theft as fraction of revenue (0–1). QSR
   *  benchmark 1-2%. Reduces net sales before margin is computed. */
  refundPct?: number;
  /** Loyalty point burn as fraction of revenue (0–1). Real cost of points
   *  the customer eventually redeems; the public loyalty engine in this
   *  codebase issues 1 pt/PLN, so left unmodeled this is a silent margin
   *  drag. Default 1.2% reflects ~50% redemption × ~5% effective value. */
  loyaltyBurnPct?: number;
  /** Corporate income tax rate (0–1). Polish small-CIT is 9%; full CIT is
   *  19%. Applied to pre-tax net profit; if pre-tax is negative, no tax. */
  citPct?: number;
  /** Channel mix: share of revenue paid in cash (no processor fee).
   *  Polish sit-down-restaurant norm ~10-15% (dine-in pays card at the
   *  table). Higher share is more cash-handling cost (counted in fixed
   *  `other`) but lower processor blend. */
  cashSharePct?: number;
  /** Channel mix: share of revenue routed through Glovo. Glovo takes
   *  22-30% commission — wildly different from on-site card 1-2%. */
  glovoSharePct?: number;
  /** Glovo commission rate (0–1). Negotiated; typical 25-30%. */
  glovoFeePct?: number;
  /** Channel mix: share of revenue routed through Wolt. */
  woltSharePct?: number;
  /** Wolt commission rate (0–1). Typical 22-30%. */
  woltFeePct?: number;
  /** Kitchen throughput ceiling — one pizzaiolo + one Stefano Ferrara oven
   *  realistically produces 60-80 pizzas/hour at sustained pace. Multiplied
   *  by openHoursPerDay and a peak-load realism factor gives max orders/day. */
  kitchenCapacity?: SimulationKitchenCapacity;
  /** Variable share of labor that flexes with order volume (0–1). Default
   *  0.40 — about 40% of labor (extra cook on a busy night, more dish-pit
   *  hours) tracks volume; 60% is fixed crew. Set to 0 for fully fixed
   *  staffing (restaurant won't add headcount), 1 for fully variable. */
  laborVariablePct?: number;
  /** Reference daily-orders baseline that the current labor mix is sized
   *  for. The flex curve only kicks in when ordersPerDay diverges from
   *  this anchor — so adding orders past it pulls in more labor cost,
   *  and dropping below it lets some labor fall away. Defaults to
   *  ordersPerDay at scenario-creation time. */
  laborAnchorOrdersPerDay?: number;
  /** Monthly depreciation + amortisation in grosze — straight-line on
   *  the setup cost (fit-out + kitchen + oven + dining-room build) over its
   *  economic life. Separated from "maintenance" fixed cost so EBITDA can
   *  be computed honestly. Default = setupCost / 90 months (~7.5-year
   *  restaurant fit-out life; leasehold improvements outlast a truck). */
  depreciationMonthlyGrosze?: number;
  /** Monthly interest expense in grosze — non-zero only when the fit-out
   *  was financed. Default 0. Separated so EBIT = EBITDA − D&A and
   *  pre-tax profit = EBIT − interest, the standard institutional cut. */
  interestMonthlyGrosze?: number;
  /** Per-order packaging cost in grosze that applies to EVERY order —
   *  napkins, plates wash for dine-in; boxes + bags for takeout / delivery.
   *  Previously only modeled as a delivery-share extra; the audit pointed
   *  out dine-in still incurs real packaging (~1 zł/order). Default 120
   *  grosze (1.20 zł). The delivery-share lever's packagingCostGrosze
   *  stays as the additional delivery premium on top. */
  packagingPerOrderGrosze?: number;
  /** When true, marketing fixed cost is excluded from "fixed costs" in
   *  the P&L and instead amortised per order as a customer-acquisition
   *  cost line. Defaults to true. Makes the CM1 honest. */
  marketingAsCac?: boolean;
  /** Menu prep-complexity multiplier (≥ 1, default 1.0). Derates
   *  kitchen capacity when the menu skews to slow-prep items the
   *  pizza-throughput model doesn't price: pasta (2× the kitchen time
   *  of pizza, separate station), antipasti plating, etc. Pasta-heavy
   *  menus typically 1.3-1.6. Audit §6: false-high-revenue items. */
  prepComplexityMultiplier?: number;
  /** Multi-unit fleet model (audit §8). When unitCount > 1, the fleet
   *  panel computes per-unit averages, HQ overhead absorption, supply
   *  discount, commissary savings, franchise royalty + marketing fund,
   *  DMA cannibalisation, and build-out cost regression. */
  fleet?: SimulationFleetModel;
  updatedAt: string;
}

export interface SimulationFleetModel {
  /** How many restaurants the operator is modeling at steady state. 1 =
   *  the default single-unit simulator, ≥2 activates the fleet panel. */
  unitCount: number;
  /** Monthly HQ overhead in grosze (regional manager, accountant on
   *  retainer, ops director). At unitCount = 1 the entire amount lands
   *  on the single restaurant; absorption curve makes it ratio drops as N
   *  grows. Default 0 — operator opts in when modeling >1 unit. */
  hqOverheadMonthlyGrosze: number;
  /** Supply discount on COGS once the fleet hits the trigger unit count.
   *  Real-world: at 4-5 units mozzarella distributors stop quoting list
   *  price and start quoting -8 to -12%. Applied as a flat COGS multi-
   *  plier reduction once unitCount >= supplyDiscountAtUnits. */
  supplyDiscountAtUnits: number;
  supplyDiscountPct: number;
  /** Commissary (centralised dough + sauce production) becomes cost-
   *  positive at ~4 units. When enabled, reduces COGS by ~3-6pp net of
   *  the central facility's run-rate cost (operator can edit). */
  commissaryEnabledAtUnits: number;
  commissarySavingsPct: number;
  /** Franchise economics: % of revenue paid as royalty (5-6% institutional
   *  norm) and marketing fund (2-3%). Applied per-unit. Set to 0 for
   *  fully owned fleet. */
  royaltyPct: number;
  marketingFundPct: number;
  /** DMA cannibalisation: each additional unit in the same trade area
   *  takes this share from the prior restaurant's revenue. 0 means new
   *  units open new markets cleanly; 0.15 = realistic urban Kraków cluster. */
  dmaOverlapPct: number;
  /** Build-out learning curve. Each new unit costs `(1 - learningPct)^
   *  (n-1)` × the original setup, capped at the floor. 0.05 default
   *  (Y10 unit ~60% of Y1 cost). */
  buildoutLearningPct: number;
  /** Floor for the build-out learning curve as a fraction of original
   *  setup. 0.55 default — past 50% you're not actually learning faster. */
  buildoutFloorPct: number;
}

export interface SimulationKitchenCapacity {
  /** Pizzas the line can sustain per hour (single pizzaiolo + one oven).
   *  60-80 is realistic for one Neapolitan line; 90+ requires two ovens. */
  pizzasPerHour: number;
  /** Hours the kitchen is producing per service day (excl. prep + close). */
  openHoursPerDay: number;
  /** Share of daily orders concentrated in peak hours (lunch + dinner rush).
   *  0.35 means 35% of the day's orders hit during the busiest hour-equivalents,
   *  which is the binding constraint — not the daily average. */
  peakHourSharePct: number;
  /** Oven physics — pizzas per single bake cycle (Stefano Ferrara 6-9). */
  ovenPizzasPerCycle?: number;
  /** Oven cycle time in seconds (Neapolitan dough ~90s). */
  ovenCycleSeconds?: number;
  /** Realistic-to-theoretical efficiency (0-1). Pulls, sweeps, dough
   *  rebuild, customer-facing time, drink pours, plate-up: a real Neapolitan
   *  kitchen's peak sustains 20-35% of theoretical. Default 0.25. */
  ovenEfficiencyPct?: number;
}

/** Same-store sales growth — trailing-period revenue vs prior trailing
 *  period of the same length. The most-watched chain metric on the planet
 *  ("comp sales"); presented as a percent change with order-count and
 *  ticket-size components broken out so the operator can see whether the
 *  growth was volume or price-led. */
export interface SimulationSssgSnapshot {
  /** Length of each comparison window in days (e.g. 30 = MoM). */
  windowDays: number;
  /** Most-recent window revenue, in grosze. */
  currentRevenueGrosze: number;
  /** Prior window revenue (next windowDays back). */
  priorRevenueGrosze: number;
  /** (current − prior) / prior. */
  revenueGrowthPct: number;
  /** Order-count growth — how much was volume-led. */
  orderGrowthPct: number;
  /** Avg-ticket growth — how much was price/mix-led. */
  ticketGrowthPct: number;
  /** Distinct customer growth — how much was acquisition-led. */
  customerGrowthPct: number;
  /** Counts for context. */
  currentOrders: number;
  priorOrders: number;
  currentCustomers: number;
  priorCustomers: number;
  generatedAt: string;
}

/** Per-hour throughput slice — average orders served per service hour
 *  over the window, plus kitchen-capacity utilisation if the operator
 *  has wired the kitchenCapacity inputs. Drives the hourly throughput
 *  chart that surfaces rush-hour risk the daily-aggregated view hides. */
export interface SimulationHourlyThroughputLine {
  /** Hour of day, 0-23 (local UTC). */
  hour: number;
  /** Total orders served at this hour over the window. */
  totalOrders: number;
  /** Average orders per active day at this hour. */
  avgOrdersPerHour: number;
  /** Capacity utilisation if pizzasPerHour is set (0-1+). */
  capacityUtilization: number;
}

/** Per-daypart slice of real-order activity. Surfaces lunch / dinner /
 *  late-night economics separately because the average hides the truth:
 *  late-night is mostly slices at 76% GM, dinner is full plates at 65%,
 *  lunch is the panini-AOV sweet spot. */
export interface SimulationDaypartLine {
  key: "lunch" | "dinner" | "late-night" | "off-peak";
  label: string;
  hours: string;
  ordersCount: number;
  /** Share of total orders in the window. */
  sharePct: number;
  avgTicketGrosze: number;
  revenueGrosze: number;
  gpGrosze: number;
  /** GP / revenue — daypart's contribution margin upper bound. */
  gpRatePct: number;
}

/** Cohort retention snapshot — computed over a rolling window of real orders,
 *  grouped by customer phone. Drives the LTV/CAC card the institutional
 *  review flagged as the single most important missing piece for any
 *  franchise / scale conversation. */
export interface SimulationCohortSnapshot {
  windowDays: number;
  /** Distinct customers (by phone) with ≥1 order in the window. */
  totalCustomers: number;
  /** Customers with ≥2 orders in the window. */
  repeatCustomers: number;
  /** repeatCustomers / totalCustomers (0–1). */
  repeatRatePct: number;
  /** Avg orders per customer over the window. */
  avgOrdersPerCustomer: number;
  /** Avg revenue per customer over the window, in grosze. */
  avgRevenuePerCustomerGrosze: number;
  /** Avg gross profit per customer over the window (using item-level costs
   *  when available), in grosze. */
  avgGpPerCustomerGrosze: number;
  /** Estimated new customers per month (annualised from the window). */
  newCustomersPerMonth: number;
  /** Revenue from customers whose FIRST order is in the window (new) vs
   *  customers who had orders before the window started (returning).
   *  Surfaces the new-vs-returning mix the audit flagged as missing. */
  newCustomerRevenueGrosze: number;
  returningCustomerRevenueGrosze: number;
  generatedAt: string;
}

/** Per-item slice for the menu-engineering matrix (stars / plowhorses /
 *  puzzles / dogs). Velocity is units sold over the window; GP is gross
 *  profit per unit after modifier deltas. Quadrants are split at the
 *  median velocity and median GP across the menu. */
export interface SimulationMenuEngineeringLine {
  menuItemId: string;
  name: string;
  category: string;
  /** Units sold in the window (quantity-weighted). */
  unitsSold: number;
  /** Gross profit per unit in grosze (price + Σ priceDelta − cost − Σ costDelta). */
  gpPerUnit: number;
  /** Total revenue and cost contribution from this item in the window. */
  revenue: number;
  cost: number;
  /** Quadrant label per Kasavana-Smith menu engineering. */
  quadrant: "star" | "plowhorse" | "puzzle" | "dog";
  /** Operator-set role tag from the menu definition — hero (lead SKU),
   *  profit-driver (high-margin lever), or anchor (premium decoy). The
   *  matrix uses these to enrich the quadrant view; "anchor" items are
   *  expected to live in the puzzle quadrant (high margin, low velocity)
   *  by design and shouldn't be deleted. */
  menuRole?: "hero" | "profit-driver" | "anchor";
  /** Item flags surfaced from the menu definition — used to build the
   *  margin-trap callout panel without invasive new menu schema. */
  deliveryOnly: boolean;
  prepTimeMinutes: number;
  /** True CM1 per unit AFTER the scenario's blended payment fee +
   *  waste + refund + loyalty. The audit's per-product number. */
  trueCm1PerUnit: number;
  /** Heuristic: high GM but TrueCM1 destroyed by fees (delivery-only
   *  marketplace commission, etc.). When true, item is flagged in
   *  the "Margin traps" callout. */
  marginTrap: boolean;
  /** Heuristic: high prep time vs the median — operationally expensive
   *  items that look profitable on paper but eat kitchen throughput. */
  prepHeavy: boolean;
  /** Heuristic: known spoilage-risk ingredient (burrata, truffle,
   *  uncooked dairy / fresh seafood). Flagged on name match for
   *  Polish-market burrata + truffle defaults; safe to ignore for
   *  scenarios where shelf life is operationally managed. */
  spoilageRisk: boolean;
}

/** Snapshot of real-order actuals over a rolling window, used to ground-truth
 *  the simulator inputs (ordersPerDay, avgTicket, channel mix). Pulled from
 *  the live orders table — never operator-entered. */
export interface SimulationActualsSnapshot {
  /** Trailing-window size in days. */
  windowDays: number;
  /** Number of fulfilled orders in the window (excludes cancelled). */
  ordersCount: number;
  /** Distinct days that had at least one order. */
  daysWithOrders: number;
  /** Mean orders per active day. */
  ordersPerDay: number;
  /** Mean order total in grosze. */
  avgTicketGrosze: number;
  /** Weighted food-cost ratio computed from the actual menu mix (Σqty×cost
   *  ÷ Σqty×price across every line item). Honest replacement for the
   *  operator-typed flat cogsPct. Falls back to 0 when no item carries
   *  cost data. */
  weightedCogsPct: number;
  /** Share of orders by fulfillment type. */
  takeoutSharePct: number;
  deliverySharePct: number;
  /** Refund / cancellation rate as fraction of total orders (0-1). */
  refundPct: number;
  /** Median ticket time in seconds — createdAt → estimatedReadyAt — across
   *  orders that carry both timestamps. Null when no order in the window
   *  has an estimatedReadyAt. */
  medianTicketTimeSeconds: number | null;
  /** Earliest order createdAt in the window (ISO). */
  fromISO: string;
  /** Snapshot generation timestamp (ISO). */
  generatedAt: string;
}

// --- Audit log ---

export interface AuditLogEntry {
  id: string;
  /** Actor identifier (e.g. "admin" today; phase 24 introduces named users). */
  actor: string;
  /** Action performed, e.g. "settings.update", "orders.status_change". */
  action: string;
  /** Optional entity reference, e.g. order id or menu item id. */
  entityType?: string;
  entityId?: string;
  /** Snapshot of what changed — kept JSON-stringifiable. */
  before?: unknown;
  after?: unknown;
  occurredAt: string;
}
