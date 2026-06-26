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
  modifiers: z.array(z.object({ groupId: z.string(), optionId: z.string() })),
});

export const OrderSchema = z.object({
  id: z.string(),
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
