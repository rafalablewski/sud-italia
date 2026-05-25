import type { FulfillmentType } from "@/data/types";

/** Human-readable labels for each fulfillment channel. Shared across the
 *  customer order tracker and every admin / kitchen surface so "Dine-in"
 *  reads identically everywhere. */
export const FULFILLMENT_LABELS: Record<FulfillmentType, string> = {
  takeout: "Takeout",
  delivery: "Delivery",
  "dine-in": "Dine-in",
};

export function fulfillmentLabel(type: FulfillmentType): string {
  return FULFILLMENT_LABELS[type] ?? FULFILLMENT_LABELS.takeout;
}

/** "1 guest" / "4 guests" — the dine-in party size in human form. Single
 *  source so every surface (order tracker, KDS, admin order detail) reads
 *  identically and a future locale switch only touches this one place. */
export function formatPartySize(size: number): string {
  return `${size} ${size === 1 ? "guest" : "guests"}`;
}
