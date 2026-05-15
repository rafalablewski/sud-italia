import { createHash } from "crypto";
import type { BundleTier } from "@/lib/bundles";
import { getUpsellSettings } from "@/lib/store";

/**
 * A/B-test framework (Sprint 3 #14) for bundle discounts. Per-location,
 * phone-hashed variant assignment so the same customer always sees the
 * same variant across visits + the server can reproduce it at checkout
 * for parity with what the client displayed.
 *
 * Stored under LocationUpsellConfig.experiment — single active
 * experiment per location, weighted variants, per-bundle discount
 * overrides. Audit log records the variant id so the operator can A/B
 * uplift on contribution profit, not just AOV.
 */

export interface ExperimentVariant {
  /** Stable id used in the audit log. Keep short, ASCII. */
  id: string;
  /** Display label for the admin dashboard. */
  label: string;
  /** Integer weight (1–100). All variants in an experiment should sum to 100. */
  weight: number;
  /** Per-bundle discount override. Key = bundle id; value = either a
   *  single percent (replaces discountPercent) or { mains, addOns }
   *  (replaces split fields). Missing entries leave the bundle alone. */
  bundleOverrides?: Record<
    string,
    | number
    | { mainsDiscountPercent?: number; addOnsDiscountPercent?: number; discountPercent?: number }
  >;
}

export interface Experiment {
  id: string;
  name: string;
  active: boolean;
  variants: ExperimentVariant[];
}

export interface ResolvedVariant {
  variantId: string;
  experimentId: string;
  /** Apply this variant's overrides to a bundle, returning a new tier
   *  with the adjusted discount fields. Idempotent — safe to call
   *  inside .map() over the bundle list. */
  applyToBundle: (bundle: BundleTier) => BundleTier;
}

/** Stable phone-hash → integer in [0, 99]. SHA-256 → first 4 bytes → mod 100. */
function hashPhoneToBucket(experimentId: string, phoneE164: string): number {
  const h = createHash("sha256").update(`${experimentId}|${phoneE164}`).digest();
  const n = (h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3];
  // Coerce to unsigned then bucket. Math.abs keeps the sign-bit case sane.
  return Math.abs(n) % 100;
}

/** Browser-safe variant of the bucket hash. Uses the Web Crypto API when
 *  available (every modern mobile browser) and falls back to a simple
 *  multiplicative hash for the rare environments without it. The server
 *  uses the Node SHA-256 above — both produce the same bucket for the
 *  same (experiment id, phone) pair *because* the SHA-256 implementations
 *  are stable. The fallback path is only ever exercised in jsdom-style
 *  tests. */
export async function resolveClientVariant(
  experiment: Experiment | null | undefined,
  phoneE164: string | null | undefined,
): Promise<ResolvedVariant | null> {
  if (!experiment || !experiment.active || experiment.variants.length === 0) return null;
  if (!phoneE164) return null;

  const totalWeight = experiment.variants.reduce((s, v) => s + Math.max(0, v.weight), 0);
  if (totalWeight <= 0) return null;

  const subtle = typeof globalThis !== "undefined" && (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  let bucket: number;
  if (subtle) {
    const data = new TextEncoder().encode(`${experiment.id}|${phoneE164}`);
    const digest = await subtle.digest("SHA-256", data);
    const bytes = new Uint8Array(digest);
    const n = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
    bucket = (Math.abs(n) % 100) / 100;
  } else {
    let h = 0;
    const s = `${experiment.id}|${phoneE164}`;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    bucket = (Math.abs(h) % 100) / 100;
  }

  let cumulative = 0;
  let picked: ExperimentVariant | null = null;
  for (const v of experiment.variants) {
    cumulative += Math.max(0, v.weight) / totalWeight;
    if (bucket < cumulative) {
      picked = v;
      break;
    }
  }
  if (!picked) picked = experiment.variants[experiment.variants.length - 1];
  const variant = picked;

  return {
    variantId: variant.id,
    experimentId: experiment.id,
    applyToBundle: (bundle) => {
      const override = variantOverrideFor(variant, bundle.id);
      if (
        override.discountPercent === undefined &&
        override.mainsDiscountPercent === undefined &&
        override.addOnsDiscountPercent === undefined
      ) {
        return bundle;
      }
      if (bundle.pricingMode !== "dynamic") return bundle;
      return {
        ...bundle,
        discountPercent: override.discountPercent ?? bundle.discountPercent,
        mainsDiscountPercent: override.mainsDiscountPercent ?? bundle.mainsDiscountPercent,
        addOnsDiscountPercent: override.addOnsDiscountPercent ?? bundle.addOnsDiscountPercent,
      };
    },
  };
}

function variantOverrideFor(
  variant: ExperimentVariant,
  bundleId: string,
): { discountPercent?: number; mainsDiscountPercent?: number; addOnsDiscountPercent?: number } {
  const o = variant.bundleOverrides?.[bundleId];
  if (o === undefined) return {};
  if (typeof o === "number") return { discountPercent: o };
  return {
    discountPercent: o.discountPercent,
    mainsDiscountPercent: o.mainsDiscountPercent,
    addOnsDiscountPercent: o.addOnsDiscountPercent,
  };
}

/** Resolve the active variant for a customer at a given location. Returns
 *  null when no experiment is active. Used both client-side (cart drawer)
 *  and server-side (checkout reconciliation) so the same variant always
 *  applies for the same phone hash → no client/server drift. */
export async function resolveCustomerVariant(
  locationSlug: string,
  phoneE164: string,
): Promise<ResolvedVariant | null> {
  const settings = await getUpsellSettings();
  const loc = settings[locationSlug] as
    | { experiment?: Experiment | null }
    | undefined;
  const exp = loc?.experiment;
  if (!exp || !exp.active || exp.variants.length === 0) return null;

  // Normalize weights and pick the variant whose cumulative band the
  // bucket falls into.
  const totalWeight = exp.variants.reduce((s, v) => s + Math.max(0, v.weight), 0);
  if (totalWeight <= 0) return null;
  const bucket = hashPhoneToBucket(exp.id, phoneE164) / 100; // 0..1
  let cumulative = 0;
  let picked: ExperimentVariant | null = null;
  for (const v of exp.variants) {
    cumulative += Math.max(0, v.weight) / totalWeight;
    if (bucket < cumulative) {
      picked = v;
      break;
    }
  }
  if (!picked) picked = exp.variants[exp.variants.length - 1];

  const variant = picked;
  return {
    variantId: variant.id,
    experimentId: exp.id,
    applyToBundle: (bundle) => {
      const override = variantOverrideFor(variant, bundle.id);
      if (
        override.discountPercent === undefined &&
        override.mainsDiscountPercent === undefined &&
        override.addOnsDiscountPercent === undefined
      ) {
        return bundle;
      }
      // Only dynamic bundles accept discount overrides; fixed bundles
      // ignore them (their price is locked in the config).
      if (bundle.pricingMode !== "dynamic") return bundle;
      return {
        ...bundle,
        discountPercent:
          override.discountPercent ?? bundle.discountPercent,
        mainsDiscountPercent:
          override.mainsDiscountPercent ?? bundle.mainsDiscountPercent,
        addOnsDiscountPercent:
          override.addOnsDiscountPercent ?? bundle.addOnsDiscountPercent,
      };
    },
  };
}
