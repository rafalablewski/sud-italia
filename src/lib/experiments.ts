import type { BundleTier } from "@/lib/bundles";

/**
 * A/B-test framework for bundle discounts — *client-safe* surface.
 * Per-location, phone-hashed variant assignment so the same customer
 * always sees the same variant across visits + the server can reproduce
 * it at checkout for parity with what the client displayed.
 *
 * Stored under LocationUpsellConfig.experiment — single active
 * experiment per location, weighted variants, per-bundle discount
 * overrides. Audit log records the variant id so the operator can A/B
 * uplift on contribution profit, not just AOV.
 *
 * This module is *intentionally* free of server-only imports (no
 * `fs`, no `crypto`, no store) so `"use client"` components can pull it
 * directly without dragging the Node bundle into the browser. The
 * server-side resolver that reads upsell-settings.json lives in
 * `@/lib/experiments-server`.
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

export function variantOverrideFor(
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

/** Build a `ResolvedVariant` from a chosen `ExperimentVariant`. Shared
 *  between the client and server resolvers so the `applyToBundle`
 *  contract is identical on both sides. */
export function buildResolvedVariant(
  experiment: Experiment,
  variant: ExperimentVariant,
): ResolvedVariant {
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
      // Only dynamic bundles accept discount overrides; fixed bundles
      // ignore them (their price is locked in the config).
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

/** Pick a variant from the experiment given a stable bucket in [0, 1). */
export function pickVariantFromBucket(
  experiment: Experiment,
  bucket: number,
): ExperimentVariant | null {
  const totalWeight = experiment.variants.reduce((s, v) => s + Math.max(0, v.weight), 0);
  if (totalWeight <= 0) return null;
  let cumulative = 0;
  for (const v of experiment.variants) {
    cumulative += Math.max(0, v.weight) / totalWeight;
    if (bucket < cumulative) return v;
  }
  return experiment.variants[experiment.variants.length - 1] ?? null;
}

/** Browser-safe variant of the bucket hash. Uses the Web Crypto API
 *  when available (every modern mobile browser) and falls back to a
 *  simple multiplicative hash for the rare environments without it.
 *  The server-side hash in `experiments-server.ts` uses Node's
 *  `createHash("sha256")` against the same `${experiment.id}|${phone}`
 *  input — both produce the same bucket because SHA-256 is stable. */
export async function resolveClientVariant(
  experiment: Experiment | null | undefined,
  phoneE164: string | null | undefined,
): Promise<ResolvedVariant | null> {
  if (!experiment || !experiment.active || experiment.variants.length === 0) return null;
  if (!phoneE164) return null;

  const subtle =
    typeof globalThis !== "undefined" &&
    (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
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

  const picked = pickVariantFromBucket(experiment, bucket);
  if (!picked) return null;
  return buildResolvedVariant(experiment, picked);
}
