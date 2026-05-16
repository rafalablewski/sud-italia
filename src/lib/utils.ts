import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(priceInGrosze: number): string {
  const zloty = priceInGrosze / 100;
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
  }).format(zloty);
}

export function generateOrderId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 7);
  return `SI-${timestamp}-${random}`.toUpperCase();
}

/** Strip the leading short location prefix from a menu item id so the
 *  "same" product across locations groups under one base slug
 *  (`krk-pizza-margherita` and `waw-pizza-margherita` both → `pizza-margherita`).
 *  Recognises both the seed prefixes hand-rolled in `src/data/menus/*.ts`
 *  (`krk`, `waw`, …) and the slug-derived prefixes that `createCustomItem`
 *  generates via `slug.slice(0, 3)` (`kra`, `war`, …). */
export function getBaseSlug(itemId: string): string {
  const m = itemId.match(/^[a-z]{2,4}-(.+)$/);
  return m ? m[1] : itemId;
}

/** Gross-margin percentage rounded to a whole number. Returns 0 when the
 *  price is zero or negative so callers don't have to special-case it. */
export function marginPct(price: number, cost: number): number {
  if (price <= 0) return 0;
  return Math.round(((price - cost) / price) * 100);
}

/** Tone class for the margin chip — kept here so AdminMenu's list view
 *  and AdminMenuDetail's per-location table agree on the colour bands. */
export function marginTone(margin: number): "danger" | "warning" | "success" {
  if (margin < 50) return "danger";
  if (margin < 65) return "warning";
  return "success";
}
