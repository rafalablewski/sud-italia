import { z } from "zod";
import { ORDER_STATUSES } from "@/data/types";

/**
 * The single source of truth for the `/api/v1` contract.
 *
 * Every request body is PARSED through these (runtime validation), and every
 * response DTO type is INFERRED from these (`z.infer`) — so a route that shapes
 * a response wrong fails to compile, and the OpenAPI document (openapi.ts) is
 * GENERATED from the same schemas via `z.toJSONSchema`. One definition drives
 * validation, the TS types, and the published contract → the wire shape cannot
 * drift from any of the three (ARCHITECTURE §5, DECISION B).
 *
 * The `apiRegistry` names the response schemas so the generated OpenAPI emits
 * shared `#/components/schemas/*` `$ref`s (clean, reusable Swift types from
 * swift-openapi-generator), rather than inlining them.
 */

export const API_ERROR_CODES = [
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "validation_failed",
  "internal",
] as const;

// ── Request bodies ─────────────────────────────────────────────────────────

export const LoginBodySchema = z.object({
  email: z.string().trim().email().optional(),
  password: z.string().min(1),
  totp: z.string().trim().optional(),
  app: z.enum(["ottaviano", "ottaviano-kds"]).optional(),
});

export const RefreshBodySchema = z.object({ refreshToken: z.string().min(3) });
export const LogoutBodySchema = z.object({ refreshToken: z.string().min(3) });
export const OrderStatusPatchSchema = z.object({ status: z.enum(ORDER_STATUSES) });

/** Customer app phone-OTP login (Rule #6: zero-friction, no passwords). */
export const CustomerAuthRequestSchema = z.object({ phone: z.string().min(6) });
export const CustomerAuthVerifySchema = z.object({
  phone: z.string().min(6),
  code: z.string().regex(/^\d{6}$/, "6-digit code"),
});

/** Customer / guest order creation — server prices authoritatively from item
 *  ids (never trusts client totals). Phone/name come from the customer token
 *  when present, else required here for guest checkout. */
const OrderItemInputSchema = z.object({
  id: z.string(),
  quantity: z.number().int().positive(),
  notes: z.string().max(140).optional(),
  selectedModifiers: z
    .array(z.object({ groupId: z.string(), optionId: z.string() }))
    .optional(),
});
export const OrderCreateSchema = z.object({
  locationSlug: z.string(),
  items: z.array(OrderItemInputSchema).min(1),
  fulfillmentType: z.enum(["takeout", "delivery", "dine-in"]),
  customerName: z.string().min(1).optional(),
  customerPhone: z.string().optional(),
  slotId: z.string().optional(),
  slotDate: z.string().optional(),
  slotTime: z.string().optional(),
  immediate: z.boolean().optional(),
  tableNumber: z.string().optional(),
  deliveryAddress: z.string().optional(),
  partySize: z.number().int().positive().optional(),
  tipAmount: z.number().int().nonnegative().optional(),
  appliedBundleId: z.string().optional(),
  channel: z.enum(["web", "whatsapp", "qr"]).optional(),
});

// ── Response DTOs ──────────────────────────────────────────────────────────

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
  refreshExpiresIn: z.number().int().optional(),
  tokenType: z.literal("Bearer"),
});

export const UserSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  role: z.string(),
  scope: z.string(),
});

export const CustomerProfileSchema = z.object({
  phone: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  points: z.number().int().describe("Total loyalty points (earned + manual)"),
  tier: z.string(),
  orderCount: z.number().int(),
  totalSpentGrosze: z.number().int(),
});

export const LocationSchema = z.object({
  slug: z.string(),
  name: z.string(),
  city: z.string(),
  address: z.string(),
  coordinates: z.object({ lat: z.number(), lng: z.number() }),
  heroImage: z.string(),
  shortDescription: z.string(),
  hours: z.array(z.object({ day: z.string(), open: z.string(), close: z.string() })),
  currency: z.literal("PLN"),
  servesAlcohol: z.boolean(),
  teamLead: z.string().nullable(),
});

export const MenuItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  price: z.number().int().describe("Minor units (grosze)"),
  currency: z.literal("PLN"),
  category: z.string(),
  image: z.string().nullable(),
  tags: z.array(z.string()),
  available: z.boolean(),
  menuRole: z.string().nullable(),
  allergens: z.array(z.string()),
  // Refined later — nutrition + modifier groups are passed through opaquely for now.
  nutrition: z.unknown().nullable(),
  prepTimeMinutes: z.number().int().nullable(),
  isLimited: z.boolean(),
  deliveryOnly: z.boolean(),
  modifierGroups: z.array(z.unknown()),
  disclosures: z.object({
    halalStatus: z.string().nullable(),
    nutriGrade: z.string().nullable(),
    containsPork: z.boolean(),
    containsAlcohol: z.boolean(),
  }),
});

export const PaymentIntentSchema = z.object({
  /** Stripe PaymentIntent client secret — the app inits PaymentSheet with this. */
  clientSecret: z.string(),
  /** Publishable key, so the app can configure the Stripe SDK (public value). */
  publishableKey: z.string(),
  amount: z.number().int().describe("Charge amount, minor units (grosze)"),
  currency: z.string(),
  orderId: z.string(),
});

export const OrderLineSchema = z.object({
  menuItemId: z.string(),
  name: z.string(),
  category: z.string().describe("Menu category (drives the KDS station filter)"),
  quantity: z.number().int(),
  unitPrice: z.number().int().describe("Minor units (grosze)"),
  notes: z.string().nullable(),
  // Resolved for the line cook: option label + the menu's `flagOnKds` callout
  // (e.g. BUFALO MOZZ), so the app needn't carry the modifier catalogue. Mirrors
  // the web KDS ticket (`buildKdsTicket`).
  modifiers: z.array(z.object({ label: z.string(), flag: z.boolean() })),
  // Allergens for the line's dish — the KDS allergen callout. Web parity.
  allergens: z.array(z.string()),
});

/** POS coursing state (dine-in) — which courses are away vs still in the
 *  kitchen. Drives the KDS "Coursed · … held" callout. */
export const OrderCoursingSchema = z.object({
  fired: z.array(z.string()),
  held: z.array(z.string()),
});

/** Predicted-ready model output for one ticket (server-computed via
 *  `analyzeTruck`, per location). Powers the KDS SLA meter, due countdown and
 *  the at-risk tone tier — the signature predictive parity with the web board.
 *  Null on non-active tickets (completed / cancelled) the model doesn't score. */
export const OrderPredictionSchema = z.object({
  /** Promised-ready instant (ms epoch) from the order SLA, or null. */
  promisedReadyAtMs: z.number().nullable(),
  /** Model's predicted-ready instant (ms epoch). */
  predictedReadyAtMs: z.number(),
  /** Seconds until predicted plate-up, from the frame's compute time. */
  predSeconds: z.number().int(),
  /** Model predicts the promise will be missed, before it is actually late. */
  atRisk: z.boolean(),
});

/** A dish cancelled AFTER it fired (KDS cancel-notify) — shown struck-through on
 *  the pass so the line never silently vanishes. Mirrors `Order.voidedItems`. */
export const VoidedItemSchema = z.object({
  name: z.string(),
  quantity: z.number().int(),
  reason: z.string().nullable(),
  at: z.string(),
});

export const OrderSchema = z.object({
  id: z.string(),
  /** Short, glanceable ticket id (last 6, uppercased) — the KDS card header. */
  shortId: z.string(),
  locationSlug: z.string(),
  status: z.enum(ORDER_STATUSES),
  fulfillmentType: z.enum(["takeout", "delivery", "dine-in"]),
  channel: z.enum(["web", "whatsapp", "qr"]),
  customerName: z.string(),
  customerPhone: z.string(),
  items: z.array(OrderLineSchema),
  totalAmount: z.number().int(),
  tipAmount: z.number().int().nullable(),
  deliveryFee: z.number().int().nullable(),
  partySize: z.number().int().nullable(),
  tableId: z.string().nullable(),
  specialInstructions: z.string().nullable(),
  slotDate: z.string(),
  slotTime: z.string(),
  createdAt: z.string(),
  paidAt: z.string().nullable(),
  estimatedReadyAt: z.string().nullable(),
  queuePosition: z.number().int().nullable(),
  // KDS ticket enrichment (web `KdsTicket` parity) — coursing callout, the
  // simulation marker, and the predictive block (SLA meter / at-risk tier).
  coursing: OrderCoursingSchema.nullable(),
  simulated: z.boolean(),
  prediction: OrderPredictionSchema.nullable(),
  /** Dishes voided after firing (KDS cancel-notify); null when none. */
  voidedItems: z.array(VoidedItemSchema).nullable(),
});

// ── KDS fleet (owner atlas) + floor-ops (manager header) feeds ─────────────

/** Manager floor-control header signals not already in the order stream:
 *  throughput (orders completed in the last 60 min) + staff on the clock.
 *  Open/late/oldest are derived client-side from the streamed board. */
export const FloorOpsSchema = z.object({
  /** The location this reflects, or "" when aggregated chain-wide. */
  locationSlug: z.string(),
  throughputLastHour: z.number().int().describe("Orders completed in the last 60 min"),
  onShift: z.number().int().describe("Staff currently clocked in"),
});

/** One station's capacity-vs-demand pace row on a fleet tile. */
export const FleetStationSchema = z.object({
  id: z.string(),
  label: z.string(),
  currentLoad: z.number().int(),
  forecast: z.number().int(),
  demand: z.number().int(),
  capacity: z.number(),
  pct: z.number().int().describe("util %, 999 when capacity is 0"),
  tier: z.enum(["calm", "warn", "risk"]),
});

/** One truck's live KDS health + pace + active-ticket preview. */
export const FleetTileSchema = z.object({
  slug: z.string(),
  name: z.string(),
  counts: z.object({
    active: z.number().int(),
    ready: z.number().int(),
    late: z.number().int(),
    risk: z.number().int(),
  }),
  health: z.number().int().describe("0–100 health score"),
  healthState: z.string(),
  healthClass: z.enum(["good", "warn", "risk", "alert"]),
  onShift: z.number().int(),
  throughputHr: z.number().int(),
  coversHr: z.number().int(),
  revenueHr: z.number().int().describe("Minor units (grosze), last 60 min"),
  promiseAccuracy: z.number(),
  stations: z.array(FleetStationSchema),
  tickets: z.array(OrderSchema),
});

/** The owner Atlas board — every active truck's KDS health, the cross-truck
 *  promise-accuracy benchmark, and fleet totals. */
export const FleetBoardSchema = z.object({
  generatedAt: z.string(),
  paceWindowMin: z.number().int(),
  promiseTarget: z.number().int(),
  totals: z.object({
    active: z.number().int(),
    late: z.number().int(),
    risk: z.number().int(),
    ready: z.number().int(),
    throughputHr: z.number().int(),
    coversHr: z.number().int(),
    revenueHr: z.number().int(),
  }),
  benchmark: z.object({
    fleetAccuracy: z.number(),
    leader: z.string().nullable(),
    gap: z.number(),
  }),
  tiles: z.array(FleetTileSchema),
});

/** A floor table for the POS dine-in table picker (read-only over v1). */
export const FloorTableSchema = z.object({
  id: z.string(),
  number: z.string(),
  seats: z.number().int(),
  zone: z.string().nullable(),
  status: z.enum(["available", "seated", "reserved", "out-of-service"]),
  notes: z.string().nullable(),
});

// ── Inferred TS types (consumed by the DTO mappers + routes) ───────────────

export type LoginBody = z.infer<typeof LoginBodySchema>;
export type OrderCreateBody = z.infer<typeof OrderCreateSchema>;
export type TokenPairDTO = z.infer<typeof TokenPairSchema>;
export type UserDTO = z.infer<typeof UserSchema>;
export type CustomerProfileDTO = z.infer<typeof CustomerProfileSchema>;
export type PaymentIntentDTO = z.infer<typeof PaymentIntentSchema>;
export type LocationDTO = z.infer<typeof LocationSchema>;
export type MenuItemDTO = z.infer<typeof MenuItemSchema>;
export type OrderLineDTO = z.infer<typeof OrderLineSchema>;
export type OrderDTO = z.infer<typeof OrderSchema>;
export type FloorOpsDTO = z.infer<typeof FloorOpsSchema>;
export type FleetStationDTO = z.infer<typeof FleetStationSchema>;
export type FleetTileDTO = z.infer<typeof FleetTileSchema>;
export type FleetBoardDTO = z.infer<typeof FleetBoardSchema>;
export type FloorTableDTO = z.infer<typeof FloorTableSchema>;

// ── Registry → drives OpenAPI components.schemas with shared $refs ─────────

export const apiRegistry = z.registry<{ id: string }>();
apiRegistry.add(ErrorEnvelopeSchema, { id: "ErrorEnvelope" });
apiRegistry.add(TokenPairSchema, { id: "TokenPair" });
apiRegistry.add(UserSchema, { id: "User" });
apiRegistry.add(CustomerProfileSchema, { id: "CustomerProfile" });
apiRegistry.add(PaymentIntentSchema, { id: "PaymentIntent" });
apiRegistry.add(LocationSchema, { id: "Location" });
apiRegistry.add(MenuItemSchema, { id: "MenuItem" });
apiRegistry.add(OrderLineSchema, { id: "OrderLine" });
apiRegistry.add(OrderSchema, { id: "Order" });
apiRegistry.add(FloorOpsSchema, { id: "FloorOps" });
apiRegistry.add(FleetStationSchema, { id: "FleetStation" });
apiRegistry.add(FleetTileSchema, { id: "FleetTile" });
apiRegistry.add(FleetBoardSchema, { id: "FleetBoard" });
apiRegistry.add(FloorTableSchema, { id: "FloorTable" });
