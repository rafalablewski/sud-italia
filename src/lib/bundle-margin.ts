import type { MenuItem } from "@/data/types";
import type { BundleConfig } from "@/components/admin/AdminSellingShared";
import { BUNDLE_MARGIN_FLOOR } from "@/lib/bundles";

/**
 * Pure bundle contribution-margin sampling. Lives in a lib (no React, no
 * server APIs) so both the bundle editor's live preview and the Upsell
 * admin's save-time margin-floor guardian compute margin the exact same
 * way — the audit (bundle-ladder-revenue-rebuild) cares that every margin
 * signal agrees, so there is one implementation, not two.
 *
 * Margin is (price − food cost) / price, where food cost sums each slot's
 * cheapest resolvable candidate `MenuItem.cost`. Items missing a cost
 * contribute 0 (conservative — never overstates margin).
 */

export interface MarginSample {
  label: string;
  priceLabel: string;
  margin: number | null;
  hint: string;
}

export function computeMarginSamples(bundle: BundleConfig, menu: MenuItem[]): MarginSample[] {
  const isDynamic = (bundle.pricingMode ?? "fixed") === "dynamic";
  if (!isDynamic) {
    const price = bundle.priceGrosze ?? 0;
    if (price === 0) return [{ label: "Sample", priceLabel: "—", margin: null, hint: "Set a price on the Pricing tab." }];
    const sample = sampleFixed(bundle, menu);
    return [
      {
        label: "Locked price",
        priceLabel: `zł ${(price / 100).toFixed(2)}`,
        margin: sample.margin,
        hint: sample.margin === null
          ? "Composition doesn't resolve at this location."
          : "Single-line bundle; margin is the same on every order.",
      },
    ];
  }
  const samplePoints = uniq([
    Math.max(2, bundle.minMains ?? 2),
    Math.max(3, (bundle.minMains ?? 2) + 1),
    Math.min(bundle.maxMains ?? 8, Math.max(4, (bundle.minMains ?? 2) + 2)),
  ]).sort((a, b) => a - b);
  return samplePoints.map((n) => {
    const s = sampleDynamic(bundle, menu, n);
    return {
      label: `@ ${n} ${n === 1 ? "main" : "mains"}`,
      priceLabel: s.price === null ? "—" : `zł ${(s.price / 100).toFixed(2)}`,
      margin: s.margin,
      hint:
        s.margin === null
          ? "Outside min/max mains or missing add-on candidates."
          : s.margin >= BUNDLE_MARGIN_FLOOR
          ? "Healthy — well above the 40% bleeding line."
          : s.margin >= 0.25
          ? "Watch this — close to the bleeding threshold."
          : "Bleeding — lower the discount or raise minMains.",
    };
  });
}

/**
 * Worst-case contribution margin across the bundle's resolvable margin
 * samples (the lowest non-null sample). Returns null when no sample
 * resolves at this location (composition can't be fulfilled / no price
 * set). Used by the save-time margin-floor guardian so the operator is
 * warned about the worst the bundle can bleed to, not its best-case
 * sample — a dynamic tier that's healthy at 4 mains can still go
 * underwater at the 2-main minimum.
 */
export function worstBundleMargin(bundle: BundleConfig, menu: MenuItem[]): number | null {
  const margins = computeMarginSamples(bundle, menu)
    .map((s) => s.margin)
    .filter((m): m is number => m !== null);
  return margins.length === 0 ? null : Math.min(...margins);
}

function uniq<T>(arr: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const x of arr) {
    if (!seen.has(x)) { seen.add(x); out.push(x); }
  }
  return out;
}

function cheapestByCat(menu: MenuItem[], cat: string): MenuItem | undefined {
  return menu.filter((m) => m.available && m.category === cat).sort((a, b) => a.price - b.price)[0];
}

function sampleFixed(bundle: BundleConfig, menu: MenuItem[]): { margin: number | null } {
  const price = bundle.priceGrosze ?? 0;
  if (price === 0) return { margin: null };
  let cost = 0;
  for (const slot of bundle.composition) {
    const candidate =
      slot.kind === "item"
        ? menu.find((m) => m.available && m.id.endsWith(slot.itemIdSuffix ?? ""))
        : cheapestByCat(menu, slot.category ?? "");
    if (!candidate) return { margin: null };
    cost += (candidate.cost ?? 0) * slot.quantity;
  }
  return { margin: price === 0 ? 0 : (price - cost) / price };
}

function sampleDynamic(bundle: BundleConfig, menu: MenuItem[], mains: number): { price: number | null; margin: number | null } {
  const samplePizza = menu.filter((m) => m.available && m.category === "pizza").sort((a, b) => a.price - b.price)[0];
  if (!samplePizza) return { price: null, margin: null };
  if (mains < (bundle.minMains ?? 1)) return { price: null, margin: null };
  if (bundle.maxMains && mains > bundle.maxMains) return { price: null, margin: null };
  const mainsSubtotal = samplePizza.price * mains;
  const mainsCost = (samplePizza.cost ?? 0) * mains;
  let addOnsSubtotal = 0;
  let addOnsCost = 0;
  for (const slot of bundle.composition) {
    const candidate =
      slot.kind === "item"
        ? menu.find((m) => m.available && m.id.endsWith(slot.itemIdSuffix ?? ""))
        : cheapestByCat(menu, slot.category ?? "");
    if (!candidate) return { price: null, margin: null };
    addOnsSubtotal += candidate.price * slot.quantity;
    addOnsCost += (candidate.cost ?? 0) * slot.quantity;
  }
  const mainsPct = bundle.mainsDiscountPercent ?? bundle.discountPercent ?? 0;
  const addOnsPct = bundle.addOnsDiscountPercent ?? bundle.discountPercent ?? 0;
  const price = Math.round(mainsSubtotal * (1 - mainsPct / 100) + addOnsSubtotal * (1 - addOnsPct / 100));
  const cost = mainsCost + addOnsCost;
  return { price, margin: price === 0 ? 0 : (price - cost) / price };
}
