import type { PosTabDiscount } from "@/data/types";

/**
 * The grosze value of a manual POS discount against a base amount (the
 * subtotal after any auto combo deal). Shared by the client footer preview
 * (CoreV2Pos) and the server charge pipeline (pos/orders) so the displayed
 * total always matches the charged total. Never exceeds the base, never
 * negative; percent is clamped 0–100.
 */
export function manualDiscountGrosze(base: number, d: PosTabDiscount | null | undefined): number {
  if (!d || base <= 0) return 0;
  if (d.type === "percent") {
    const pct = Math.max(0, Math.min(100, Number(d.value) || 0));
    return Math.min(base, Math.round((base * pct) / 100));
  }
  // amount (grosze)
  return Math.min(base, Math.max(0, Math.round(Number(d.value) || 0)));
}
