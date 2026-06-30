/**
 * Wire DTO types — ported from the backend Zod contract (`src/lib/api/v1/schemas.ts`).
 * In the extracted repo these are generated from `docs/native/openapi.json` via
 * swift-openapi-generator's TS analogue; here they are hand-mirrored 1:1. Money is
 * always minor units (grosze) on the wire — format with `formatMoney`.
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

export type FulfillmentType = "takeout" | "delivery" | "dine-in";
export type OrderChannel = "web" | "whatsapp" | "qr";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn?: number;
  tokenType: "Bearer";
}

export interface User {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  scope: string;
}

export interface CustomerProfile {
  phone: string;
  name: string | null;
  email: string | null;
  points: number;
  tier: string;
  orderCount: number;
  totalSpentGrosze: number;
}

export interface LocationDTO {
  slug: string;
  name: string;
  city: string;
  address: string;
  coordinates: { lat: number; lng: number };
  heroImage: string;
  shortDescription: string;
  hours: { day: string; open: string; close: string }[];
  currency: "PLN";
  servesAlcohol: boolean;
  teamLead: string | null;
}

export interface MenuItemDTO {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: "PLN";
  category: string;
  image: string | null;
  tags: string[];
  available: boolean;
  menuRole: string | null;
  allergens: string[];
  nutrition: unknown;
  prepTimeMinutes: number | null;
  isLimited: boolean;
  deliveryOnly: boolean;
  modifierGroups: unknown[];
  disclosures: {
    halalStatus: string | null;
    nutriGrade: string | null;
    containsPork: boolean;
    containsAlcohol: boolean;
  };
}

export interface OrderLineModifier {
  label: string;
  flag: boolean;
}

export interface OrderLineDTO {
  menuItemId: string;
  name: string;
  category: string;
  quantity: number;
  unitPrice: number;
  notes: string | null;
  modifiers: OrderLineModifier[];
  allergens: string[];
}

export interface OrderCoursing {
  fired: string[];
  held: string[];
}

export interface OrderPrediction {
  promisedReadyAtMs: number | null;
  predictedReadyAtMs: number;
  predSeconds: number;
  atRisk: boolean;
}

export interface OrderDTO {
  id: string;
  shortId: string;
  locationSlug: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  channel: OrderChannel;
  customerName: string;
  customerPhone: string;
  items: OrderLineDTO[];
  totalAmount: number;
  tipAmount: number | null;
  deliveryFee: number | null;
  partySize: number | null;
  tableId: string | null;
  specialInstructions: string | null;
  slotDate: string;
  slotTime: string;
  createdAt: string;
  paidAt: string | null;
  estimatedReadyAt: string | null;
  queuePosition: number | null;
  coursing: OrderCoursing | null;
  simulated: boolean;
  prediction: OrderPrediction | null;
}

// ── KDS fleet (owner atlas) ────────────────────────────────────────────────

export interface FleetStationDTO {
  id: string;
  label: string;
  currentLoad: number;
  forecast: number;
  demand: number;
  capacity: number;
  pct: number;
  tier: "calm" | "warn" | "risk";
}

export interface FleetTileDTO {
  slug: string;
  name: string;
  counts: { active: number; ready: number; late: number; risk: number };
  health: number;
  healthState: string;
  healthClass: "good" | "warn" | "risk" | "alert";
  onShift: number;
  throughputHr: number;
  coversHr: number;
  revenueHr: number;
  promiseAccuracy: number;
  stations: FleetStationDTO[];
  tickets: OrderDTO[];
}

export interface FleetBoardDTO {
  generatedAt: string;
  paceWindowMin: number;
  promiseTarget: number;
  totals: {
    active: number;
    late: number;
    risk: number;
    ready: number;
    throughputHr: number;
    coversHr: number;
    revenueHr: number;
  };
  benchmark: { fleetAccuracy: number; leader: string | null; gap: number };
  tiles: FleetTileDTO[];
}

export interface FloorOpsDTO {
  locationSlug: string;
  throughputLastHour: number;
  onShift: number;
}
