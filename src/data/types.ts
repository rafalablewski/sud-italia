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
  costPerUnit: number; // grosze per unit (e.g., 2500 = 25.00 PLN per kg)
  supplier?: string;
  notes?: string;
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
}

export type FulfillmentType = "takeout" | "delivery";

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
  specialInstructions?: string;
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
   *  orders, SMS otherwise. */
  channel?: "web" | "whatsapp";
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

export type StaffRole = "manager" | "kitchen" | "front" | "driver" | "courier";
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

export interface TruckStop {
  name: string;
  /** Optional decimal lat/lng for map placement. */
  lat?: number;
  lng?: number;
  startTime?: string;
  endTime?: string;
}

export interface TruckRoute {
  id: string;
  name: string;
  locationSlug: string;
  description?: string;
  stops: TruckStop[];
  createdAt: string;
}

export type TruckEventStatus = "scheduled" | "live" | "done" | "cancelled";

export interface TruckEvent {
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
  status: TruckEventStatus;
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
  locationSlug?: string;
  notes?: string;
  createdAt: string;
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
