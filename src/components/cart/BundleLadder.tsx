"use client";

import { useMemo, useState } from "react";
import { Sparkles, ChevronDown } from "lucide-react";

import { useCartStore } from "@/store/cart";
import {
  BundleTier,
  BundleMealPeriod,
  bundleSavings,
  buildBundleCartLines,
  resolveBundles,
  resolveBundleSlots,
  suggestedBundleMealPeriod,
} from "@/lib/bundles";
import type { MenuItem } from "@/data/types";
import { formatPrice } from "@/lib/utils";

interface BundleLadderProps {
  allMenuItems: MenuItem[];
  /** Admin-configured bundle list (LocationUpsellConfig.bundles). When
   *  unset / empty, DEFAULT_BUNDLES from src/lib/bundles.ts wins. */
  configBundles?: BundleTier[] | null;
}

/**
 * Bundle ladder (audit §3.2) — surfaces the Lunch tier or Family Feast tier
 * above the per-item suggestions in the cart drawer. One picker, two meal
 * periods, switchable header chip when both are relevant.
 *
 * Tap a tier → cart's items are replaced with the bundle's resolved
 * composition (preferring whatever the customer already added) and the
 * subtotal locks to the bundle price. Adding/removing any line breaks the
 * lock — handled inside the cart store.
 */
export function BundleLadder({ allMenuItems, configBundles }: BundleLadderProps) {
  const items = useCartStore((s) => s.items);
  const locationSlug = useCartStore((s) => s.locationSlug);
  const appliedBundleId = useCartStore((s) => s.appliedBundleId);
  const applyBundle = useCartStore((s) => s.applyBundle);
  const clearBundle = useCartStore((s) => s.clearBundle);

  const allBundles = useMemo(
    () => resolveBundles(configBundles ?? null),
    [configBundles],
  );

  const suggestedPeriod = useMemo(
    () => suggestedBundleMealPeriod(items),
    [items],
  );
  const hasLunch = allBundles.some((b) => b.mealPeriod === "lunch");
  const hasFamily = allBundles.some((b) => b.mealPeriod === "family");
  const initialPeriod: BundleMealPeriod | null =
    suggestedPeriod ??
    (hasLunch ? "lunch" : hasFamily ? "family" : null);

  const [period, setPeriod] = useState<BundleMealPeriod | null>(initialPeriod);

  // Filter to the currently shown period AND only bundles whose composition
  // can be fulfilled at this location's menu — hides the tier rather than
  // surfacing a broken offer when a slot has zero candidates.
  const visibleBundles = useMemo(() => {
    if (!period || allMenuItems.length === 0) return [];
    return allBundles
      .filter((b) => b.mealPeriod === period)
      .filter((b) => resolveBundleSlots(b, allMenuItems) !== null);
  }, [allBundles, allMenuItems, period]);

  if (!locationSlug || visibleBundles.length === 0) return null;

  const handleApply = (bundle: BundleTier) => {
    if (appliedBundleId === bundle.id) {
      clearBundle();
      return;
    }
    const lines = buildBundleCartLines(bundle, allMenuItems, items, locationSlug);
    if (!lines) return;
    applyBundle(bundle.id, bundle.priceGrosze, lines, locationSlug);
  };

  // Decide the column layout once so chips tile cleanly. 4 tiers (full lunch
  // ladder) → 2 rows of 2 on the drawer's narrow width; 3 tiers → 3 columns.
  const cols = visibleBundles.length === 4 ? 2 : Math.min(visibleBundles.length, 3);

  return (
    <div className="px-5 mt-3">
      <div className="flex items-baseline justify-between mb-2">
        <p className="flex items-center gap-2 text-xs font-semibold text-italia-gray uppercase tracking-wide">
          <Sparkles className="h-4 w-4 text-italia-gold" />
          Make it a bundle{visibleBundles.length > 0 && (
            <span className="text-italia-gold-dark normal-case font-medium tracking-normal">
              {" "}
              · save up to {formatPrice(Math.max(...visibleBundles.map(bundleSavings)))}
            </span>
          )}
        </p>
        {hasLunch && hasFamily && (
          <button
            type="button"
            onClick={() =>
              setPeriod((p) => (p === "lunch" ? "family" : "lunch"))
            }
            className="inline-flex items-center gap-0.5 text-[11px] font-medium text-italia-red"
          >
            {period === "lunch" ? "Lunch" : "Family"}
            <ChevronDown className="h-3 w-3" />
          </button>
        )}
      </div>

      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {visibleBundles.map((bundle) => (
          <BundleChip
            key={bundle.id}
            bundle={bundle}
            applied={appliedBundleId === bundle.id}
            onApply={() => handleApply(bundle)}
          />
        ))}
      </div>
    </div>
  );
}

interface ChipProps {
  bundle: BundleTier;
  applied: boolean;
  onApply: () => void;
}

function BundleChip({ bundle, applied, onApply }: ChipProps) {
  const savings = bundleSavings(bundle);
  const showRef = bundle.refPriceGrosze > bundle.priceGrosze;

  // Visual ladder roles are defined on the bundle. The default-push tier
  // gets red emphasis; the anchor gets gold; decoy is muted; everything
  // else is the neutral baseline.
  const baseClass = (() => {
    if (applied) {
      return "border-italia-green/40 bg-italia-green/5";
    }
    if (bundle.isDefault) {
      return "border-italia-red/40 bg-italia-red/5 hover:border-italia-red";
    }
    if (bundle.isAnchor) {
      return "border-italia-gold/40 bg-[linear-gradient(135deg,rgba(184,146,46,0.06)_0%,rgba(184,146,46,0.02)_100%)] hover:border-italia-gold";
    }
    if (bundle.isDecoy) {
      return "border-gray-200 bg-white opacity-90 hover:border-italia-gold/40";
    }
    return "border-gray-200 bg-white hover:border-italia-gold/40";
  })();

  return (
    <button
      type="button"
      onClick={onApply}
      className={`relative text-left rounded-xl border p-2.5 transition-all animate-fade-in ${baseClass} ${
        applied ? "cursor-default" : "cursor-pointer hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0"
      }`}
    >
      {/* Tier ribbon — Most picked / Best value badge above the card. */}
      {!applied && bundle.isDefault && (
        <span className="absolute -top-2 left-2.5 px-2 py-0.5 rounded-full bg-italia-red text-white text-[9px] font-bold uppercase tracking-wider">
          Most picked
        </span>
      )}
      {!applied && bundle.isAnchor && (
        <span className="absolute -top-2 left-2.5 px-2 py-0.5 rounded-full bg-italia-gold-dark text-white text-[9px] font-bold uppercase tracking-wider">
          Best value
        </span>
      )}
      {applied && (
        <span className="absolute top-1.5 right-2 text-[10px] font-bold uppercase tracking-wider text-italia-green-dark">
          Applied
        </span>
      )}

      <div className="text-[10px] font-bold uppercase tracking-wider text-italia-gray mt-0.5">
        {bundle.tier}
      </div>
      <div className="font-heading text-sm font-semibold text-italia-dark leading-tight mt-0.5">
        {bundle.name}
      </div>
      <div className="text-[11px] text-italia-gray leading-snug mt-1 min-h-[28px]">
        {bundle.description}
      </div>
      <div className="flex items-baseline gap-1.5 mt-1.5">
        <span
          className={`text-base font-bold ${
            applied ? "text-italia-green-dark" : "text-italia-red"
          }`}
        >
          {formatPrice(bundle.priceGrosze)}
        </span>
        {showRef && (
          <span className="text-[10px] text-italia-gray line-through">
            {formatPrice(bundle.refPriceGrosze)}
          </span>
        )}
      </div>
      {savings > 0 && (
        <div className="text-[10px] font-bold uppercase tracking-wider text-italia-green-dark mt-0.5">
          Save {formatPrice(savings)}
        </div>
      )}
    </button>
  );
}
