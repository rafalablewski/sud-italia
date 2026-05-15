"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, ChevronDown, Users } from "lucide-react";

import { useCartStore } from "@/store/cart";
import {
  BundleTier,
  BundleMealPeriod,
  BundleAvailabilityRules,
  bundleSavings,
  buildBundleCartLines,
  computeBundlePrice,
  isDynamicBundle,
  resolveBundles,
  resolveBundleRules,
  resolveBundleAvailability,
  resolveBundleSlots,
} from "@/lib/bundles";
import type { MenuItem } from "@/data/types";
import { formatPrice } from "@/lib/utils";

interface BundleLadderProps {
  allMenuItems: MenuItem[];
  /** Admin-configured bundle list (LocationUpsellConfig.bundles). When
   *  unset / empty, DEFAULT_BUNDLES from src/lib/bundles.ts wins. */
  configBundles?: BundleTier[] | null;
  /** Admin-configured availability rules (LocationUpsellConfig.bundleRules).
   *  When unset, DEFAULT_BUNDLE_RULES wins (lunch 11–14, family minMainItems 5). */
  configRules?: Partial<BundleAvailabilityRules> | null;
}

/**
 * Bundle ladder (audit §3.2) — surfaces the Lunch tier or Family Feast tier
 * above the per-item suggestions in the cart drawer. Two ladders, two
 * different gates:
 *
 *   Lunch  — hour-gated. Only renders during the configured lunch window
 *            (default 11–14). Outside the window, returns null (no chrome).
 *
 *   Family — quantity-gated. Only renders once the cart has ≥ minMainItems
 *            (default 5) pizzas + pastas. When the cart is within
 *            `hintWithin` of the threshold, renders a one-line hint
 *            ("Add 1 more pizza or pasta to unlock the Family Feast")
 *            instead of the full ladder so we nudge without clutter.
 *
 * Tap a tier → cart's items are replaced with the bundle's resolved
 * composition (preferring whatever the customer already added) and the
 * subtotal locks to the bundle price. Adding/removing any line breaks the
 * lock — handled inside the cart store.
 */
export function BundleLadder({
  allMenuItems,
  configBundles,
  configRules,
}: BundleLadderProps) {
  const items = useCartStore((s) => s.items);
  const locationSlug = useCartStore((s) => s.locationSlug);
  const appliedBundleId = useCartStore((s) => s.appliedBundleId);
  const applyBundle = useCartStore((s) => s.applyBundle);
  const clearBundle = useCartStore((s) => s.clearBundle);

  const allBundles = useMemo(
    () => resolveBundles(configBundles ?? null),
    [configBundles],
  );

  const rules = useMemo(
    () => resolveBundleRules(configRules ?? null),
    [configRules],
  );

  const hasLunch = allBundles.some((b) => b.mealPeriod === "lunch");
  const hasFamily = allBundles.some((b) => b.mealPeriod === "family");

  // Recompute the local hour every minute so a customer who lingers in the
  // drawer sees the lunch ladder appear at 11:00 and disappear at 14:00.
  // One-minute resolution is plenty — the hour gate switches on the hour.
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const i = setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(i);
  }, []);

  // Decide what each ladder should do given current cart shape + hour.
  const lunchAvailability = useMemo(
    () =>
      hasLunch
        ? resolveBundleAvailability("lunch", items, rules, hour)
        : { kind: "hidden" as const },
    [hasLunch, items, rules, hour],
  );
  const familyAvailability = useMemo(
    () =>
      hasFamily
        ? resolveBundleAvailability("family", items, rules, hour)
        : { kind: "hidden" as const },
    [hasFamily, items, rules, hour],
  );

  // User's preferred ladder when both are available — drives the header
  // switcher. We derive the *effective* period below from this preference
  // intersected with what's actually showable, so the user's choice
  // survives availability flips without an effect-driven sync.
  const [preferredPeriod, setPreferredPeriod] = useState<BundleMealPeriod>("family");

  // Effective period: respect the user's preference when that ladder is
  // showable; otherwise fall back to whichever ladder is currently allowed.
  const period: BundleMealPeriod | null = (() => {
    const lunchOk = lunchAvailability.kind === "show";
    const familyOk = familyAvailability.kind === "show";
    if (preferredPeriod === "family" && familyOk) return "family";
    if (preferredPeriod === "lunch" && lunchOk) return "lunch";
    if (familyOk) return "family";
    if (lunchOk) return "lunch";
    return null;
  })();

  const showLadder = period !== null;
  const showFamilyHint = familyAvailability.kind === "hint";

  // Filter to the currently shown period AND only bundles whose composition
  // resolves at this location AND whose dynamic gates (minMains) are met by
  // the current cart — Feast Deluxe stays hidden until the cart has enough
  // mains to make it viable.
  const visibleBundles = useMemo(() => {
    if (!period || allMenuItems.length === 0) return [];
    return allBundles
      .filter((b) => b.mealPeriod === period)
      .filter((b) => resolveBundleSlots(b, allMenuItems) !== null)
      .filter((b) => {
        if (!isDynamicBundle(b)) return true;
        const pricing = computeBundlePrice(b, items, allMenuItems);
        return pricing !== null;
      });
  }, [allBundles, allMenuItems, period, items]);

  // No ladder + no hint → render nothing.
  if (!locationSlug) return null;
  if (!showLadder && !showFamilyHint) return null;

  const handleApply = (bundle: BundleTier) => {
    if (appliedBundleId === bundle.id) {
      clearBundle();
      return;
    }
    const lines = buildBundleCartLines(bundle, allMenuItems, items, locationSlug);
    if (!lines) return;
    // Dynamic bundles price live off cart + menu; fixed bundles use stored.
    const pricing = computeBundlePrice(bundle, items, allMenuItems);
    const priceGrosze = pricing?.priceGrosze ?? (isDynamicBundle(bundle) ? 0 : bundle.priceGrosze);
    if (priceGrosze <= 0) return;
    applyBundle(bundle.id, priceGrosze, lines, locationSlug);
  };

  // When the hint fires, surface the cheapest family tier's savings so the
  // copy can read "Save 19 zł — add 1 more pizza or pasta". Dynamic tiers
  // need cart context to price; we use the current cart so the copy still
  // reflects what the customer would unlock.
  const familyMinSavings =
    showFamilyHint && allBundles.length > 0
      ? Math.min(
          ...allBundles
            .filter((b) => b.mealPeriod === "family")
            .map((b) => bundleSavings(b, items, allMenuItems)),
        )
      : 0;

  const ladderHasBoth =
    lunchAvailability.kind === "show" && familyAvailability.kind === "show";
  const visibleSavings = visibleBundles
    .map((b) => bundleSavings(b, items, allMenuItems))
    .filter((s) => s > 0);
  const cols =
    visibleBundles.length === 4 ? 2 : Math.min(visibleBundles.length, 3);

  return (
    <div className="px-5 mt-3 space-y-2">
      {/* Family-feast nudge — only when within hintWithin items of the
          minimum, and only when the full family ladder isn't already showing. */}
      {showFamilyHint && familyAvailability.kind === "hint" && (
        <FamilyHint
          needed={familyAvailability.needed}
          mainItems={familyAvailability.mainItems}
          minSavings={familyMinSavings}
        />
      )}

      {showLadder && visibleBundles.length > 0 && (
        <>
          <div className="flex items-baseline justify-between">
            <p className="flex items-center gap-2 text-xs font-semibold text-italia-gray uppercase tracking-wide">
              <Sparkles className="h-4 w-4 text-italia-gold" />
              Make it a bundle
              {visibleSavings.length > 0 && (
                <span className="text-italia-gold-dark normal-case font-medium tracking-normal">
                  {" "}
                  · save up to {formatPrice(Math.max(...visibleSavings))}
                </span>
              )}
            </p>
            {ladderHasBoth && (
              <button
                type="button"
                onClick={() =>
                  setPreferredPeriod((p) => (p === "lunch" ? "family" : "lunch"))
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
                cartItems={items}
                menuItems={allMenuItems}
                applied={appliedBundleId === bundle.id}
                onApply={() => handleApply(bundle)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface ChipProps {
  bundle: BundleTier;
  cartItems: import("@/data/types").CartItem[];
  menuItems: MenuItem[];
  applied: boolean;
  onApply: () => void;
}

function BundleChip({ bundle, cartItems, menuItems, applied, onApply }: ChipProps) {
  const pricing = computeBundlePrice(bundle, cartItems, menuItems);
  const priceGrosze = pricing?.priceGrosze ?? (isDynamicBundle(bundle) ? 0 : bundle.priceGrosze);
  const refPriceGrosze = pricing?.refPriceGrosze ?? (isDynamicBundle(bundle) ? 0 : bundle.refPriceGrosze);
  const savings = pricing?.savings ?? 0;
  const showRef = refPriceGrosze > priceGrosze;

  // Dynamic-tier description: replace "Your mains" prefix with the actual
  // count + noun so a 3-margherita cart sees "3 pizzas + 2 antipasti +
  // 4 drinks + tiramisù". Derives the noun from the cart, not the bundle
  // config, so a mixed pizza+pasta cart reads "mains" while a pure-pizza
  // cart reads "pizzas".
  const description = (() => {
    if (!isDynamicBundle(bundle) || !pricing) return bundle.description;
    const n = pricing.mainsCount;
    const mainCats = new Set(
      cartItems
        .filter((ci) => bundle.mainCategories.includes(ci.menuItem.category))
        .map((ci) => ci.menuItem.category),
    );
    const noun =
      mainCats.size === 1
        ? Array.from(mainCats)[0] === "pizza"
          ? n === 1 ? "pizza" : "pizzas"
          : n === 1 ? "pasta" : "pastas"
        : n === 1 ? "main" : "mains";
    return bundle.description.replace(/^Your mains/i, `${n} ${noun}`);
  })();

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
        {description}
      </div>
      <div className="flex items-baseline gap-1.5 mt-1.5">
        <span
          className={`text-base font-bold ${
            applied ? "text-italia-green-dark" : "text-italia-red"
          }`}
        >
          {formatPrice(priceGrosze)}
        </span>
        {showRef && (
          <span className="text-[10px] text-italia-gray line-through">
            {formatPrice(refPriceGrosze)}
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

interface FamilyHintProps {
  needed: number;
  mainItems: number;
  minSavings: number;
}

/**
 * One-line nudge that appears when the cart is `hintWithin` items short of
 * the Family Feast threshold — the full ladder stays hidden, but we tell
 * the customer how close they are.
 */
function FamilyHint({ needed, mainItems, minSavings }: FamilyHintProps) {
  const noun = needed === 1 ? "pizza or pasta" : "pizzas or pastas";
  return (
    <div className="flex items-center gap-2.5 p-2.5 rounded-xl border border-italia-gold/30 bg-italia-gold/5">
      <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-italia-gold/15 text-italia-gold-dark inline-flex items-center justify-center">
        <Users className="h-4 w-4" />
      </span>
      <p className="flex-1 text-xs text-italia-dark leading-snug">
        Add{" "}
        <span className="font-semibold">{needed} more {noun}</span>
        {" "}to unlock the Family Feast bundle
        {minSavings > 0 && (
          <span className="text-italia-gold-dark font-semibold">
            {" "}— save up to {formatPrice(minSavings)}
          </span>
        )}
        <span className="text-italia-gray"> · {mainItems} of needed total</span>
      </p>
    </div>
  );
}
