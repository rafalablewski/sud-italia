"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, ChevronDown, Users } from "lucide-react";

import { useCartStore } from "@/store/cart";
import {
  BundleTier,
  BundleMealPeriod,
  BundleAvailabilityRules,
  bundleSavings,
  computeBundlePrice,
  isDynamicBundle,
  resolveBundles,
  resolveBundleRules,
  resolveBundleAvailability,
  resolveBundleSlots,
} from "@/lib/bundles";
import { resolveClientVariant, type Experiment } from "@/lib/experiments";
import { useCustomer } from "@/store/customer";
import type { CartItem, MenuItem } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import { BundleComposerSheet } from "./BundleComposerSheet";

interface BundleLadderProps {
  allMenuItems: MenuItem[];
  /** Admin-configured bundle list (LocationUpsellConfig.bundles). When
   *  unset / empty, DEFAULT_BUNDLES from src/lib/bundles.ts wins. */
  configBundles?: BundleTier[] | null;
  /** Admin-configured availability rules (LocationUpsellConfig.bundleRules).
   *  When unset, DEFAULT_BUNDLE_RULES wins (lunch 11–14, family minMainItems 5). */
  configRules?: Partial<BundleAvailabilityRules> | null;
  /** Optional A/B experiment configured for this location. When set + the
   *  customer's phone hashes to a variant with bundle overrides, the
   *  override is applied client-side BEFORE pricing so the cart shows
   *  exactly what the server will charge. */
  configExperiment?: Experiment | null;
  /** Active combo discount (grosze). When > 0 the bundle CTA shows the
   *  *incremental* savings ("save X more than your current Italian
   *  Classic 10%") so the customer doesn't feel like applying the
   *  bundle silently kills their combo — it's a net-better trade. */
  activeComboSavings?: number;
  activeComboName?: string | null;
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
  configExperiment = null,
  activeComboSavings = 0,
  activeComboName = null,
}: BundleLadderProps) {
  const items = useCartStore((s) => s.items);
  const locationSlug = useCartStore((s) => s.locationSlug);
  const appliedBundleId = useCartStore((s) => s.appliedBundleId);
  const applyBundle = useCartStore((s) => s.applyBundle);
  const clearBundle = useCartStore((s) => s.clearBundle);
  const { customer } = useCustomer();

  // Resolve A/B variant once per customer/experiment combo. SHA-256 hashed
  // so server reproduces it at checkout — same discount %s on both sides.
  const [variantApply, setVariantApply] = useState<((b: BundleTier) => BundleTier) | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  useEffect(() => {
    if (!configExperiment?.active || !customer?.phone) {
      setVariantApply(null);
      setVariantId(null);
      return;
    }
    let cancelled = false;
    resolveClientVariant(configExperiment, customer.phone).then((v) => {
      if (cancelled || !v) return;
      setVariantApply(() => v.applyToBundle);
      setVariantId(v.variantId);
    });
    return () => {
      cancelled = true;
    };
  }, [configExperiment, customer?.phone]);

  const allBundles = useMemo(
    () => {
      const raw = resolveBundles(configBundles ?? null);
      return variantApply ? raw.map(variantApply) : raw;
    },
    [configBundles, variantApply],
  );

  const rules = useMemo(
    () => resolveBundleRules(configRules ?? null),
    [configRules],
  );

  const hasLunch = allBundles.some((b) => b.mealPeriod === "lunch");
  const hasFamily = allBundles.some((b) => b.mealPeriod === "family");

  const hasLateNight = allBundles.some((b) => b.mealPeriod === "lateNight");

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
  const lateNightAvailability = useMemo(
    () =>
      hasLateNight
        ? resolveBundleAvailability("lateNight", items, rules, hour)
        : { kind: "hidden" as const },
    [hasLateNight, items, rules, hour],
  );

  // User's preferred ladder when multiple are available — drives the
  // header switcher. Effective period intersects preference with what
  // actually qualifies, so the user's choice survives availability flips.
  const [preferredPeriod, setPreferredPeriod] = useState<BundleMealPeriod>("family");

  const period: BundleMealPeriod | null = (() => {
    const lunchOk = lunchAvailability.kind === "show";
    const familyOk = familyAvailability.kind === "show";
    const lateOk = lateNightAvailability.kind === "show";
    if (preferredPeriod === "family" && familyOk) return "family";
    if (preferredPeriod === "lunch" && lunchOk) return "lunch";
    if (preferredPeriod === "lateNight" && lateOk) return "lateNight";
    // Late-night dominates when in-window (it's a tight one-tap deal);
    // otherwise family beats lunch when both qualify.
    if (lateOk) return "lateNight";
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

  // Composer-sheet state — taps don't auto-apply; they open the picker
  // so the customer can swap defaults (Domino's Mix & Match × McDonald's
  // Make-it-a-Meal). Re-tapping an already-applied bundle clears it.
  const [composerBundle, setComposerBundle] = useState<BundleTier | null>(null);

  // Funnel telemetry — fire once per (period, bundle id set, location)
  // combination so an idle drawer doesn't repeatedly log the same view.
  // Uses sendBeacon for fire-and-forget submission that survives unload.
  const sentImpressionsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!locationSlug || !period) return;
    for (const b of visibleBundles) {
      const key = `${locationSlug}|${period}|${b.id}|${variantId ?? ""}`;
      if (sentImpressionsRef.current.has(key)) continue;
      sentImpressionsRef.current.add(key);
      const body = JSON.stringify({
        kind: "impression",
        bundleId: b.id,
        locationSlug,
        customerPhone: customer?.phone,
        experimentVariant: variantId ?? undefined,
      });
      try {
        const blob = new Blob([body], { type: "application/json" });
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
          navigator.sendBeacon("/api/customer/bundle-funnel", blob);
        } else if (typeof fetch !== "undefined") {
          void fetch("/api/customer/bundle-funnel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
          });
        }
      } catch {
        // Funnel beaconing is best-effort.
      }
    }
  }, [visibleBundles, locationSlug, period, customer?.phone, variantId]);

  const sendFunnel = (kind: "composer_opened" | "composer_abandoned", bundleId: string) => {
    if (!locationSlug) return;
    const body = JSON.stringify({
      kind,
      bundleId,
      locationSlug,
      customerPhone: customer?.phone,
      experimentVariant: variantId ?? undefined,
    });
    try {
      const blob = new Blob([body], { type: "application/json" });
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon("/api/customer/bundle-funnel", blob);
      } else if (typeof fetch !== "undefined") {
        void fetch("/api/customer/bundle-funnel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        });
      }
    } catch {
      // best-effort
    }
  };

  // No ladder + no hint → render nothing.
  if (!locationSlug) return null;
  if (!showLadder && !showFamilyHint) return null;

  const handleApply = (bundle: BundleTier) => {
    if (appliedBundleId === bundle.id) {
      clearBundle();
      return;
    }
    // Open the composer so the customer can review/swap add-on choices
    // before locking. Fixed-bundle taps still open the sheet for parity —
    // they can confirm in one tap if they don't want to change anything.
    sendFunnel("composer_opened", bundle.id);
    setComposerBundle(bundle);
  };

  const handleComposerClose = () => {
    if (composerBundle) sendFunnel("composer_abandoned", composerBundle.id);
    setComposerBundle(null);
  };

  const handleComposerApply = (lines: CartItem[], priceGrosze: number) => {
    if (!composerBundle || priceGrosze <= 0) return;
    applyBundle(composerBundle.id, priceGrosze, lines, locationSlug);
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

  const availableShown =
    [lunchAvailability, familyAvailability, lateNightAvailability].filter(
      (a) => a.kind === "show",
    ).length;

  // Loss-aversion framing — derived from the largest tier's refPrice
  // (the "Without the bundle you'd pay X" anchor). Picks the max so the
  // header copy reflects the biggest available à-la-carte total.
  const topTierPricing = (() => {
    let best: { priceGrosze: number; refPriceGrosze: number; savings: number; mainsCount: number } | null = null;
    for (const b of visibleBundles) {
      const p = computeBundlePrice(b, items, allMenuItems);
      if (!p) continue;
      if (!best || p.refPriceGrosze > best.refPriceGrosze) best = p;
    }
    return best;
  })();

  // Pick the *default-pushed* tier as the primary CTA target. Falls back
  // to anchor, then highest-savings tier. McDonald's-style "Make it a
  // Family Feast" pattern frames non-bundling as the deviant choice.
  const primaryTier =
    visibleBundles.find((b) => b.isDefault) ??
    visibleBundles.find((b) => b.isAnchor) ??
    visibleBundles
      .slice()
      .sort(
        (a, b) =>
          bundleSavings(b, items, allMenuItems) -
          bundleSavings(a, items, allMenuItems),
      )[0];
  const compareTiers = visibleBundles.filter((b) => b.id !== primaryTier?.id);
  const primaryPricing = primaryTier
    ? computeBundlePrice(primaryTier, items, allMenuItems)
    : null;
  const primaryIsApplied =
    primaryTier !== undefined && appliedBundleId === primaryTier.id;

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

      {showLadder && visibleBundles.length > 0 && primaryTier && primaryPricing && (
        <>
          <div className="flex items-baseline justify-between">
            <p className="flex items-center gap-2 text-xs font-semibold text-italia-gray uppercase tracking-wide">
              <Sparkles className="h-4 w-4 text-italia-gold" />
              Make it a bundle
              {topTierPricing && topTierPricing.savings > 0 && (
                <span className="text-italia-gold-dark normal-case font-medium tracking-normal">
                  {" "}
                  · without it you&rsquo;d pay {formatPrice(topTierPricing.refPriceGrosze)}
                </span>
              )}
            </p>
            {availableShown > 1 && (
              <button
                type="button"
                onClick={() =>
                  setPreferredPeriod((p) => {
                    // Cycle through the available periods in order.
                    const order: BundleMealPeriod[] = ["family", "lunch", "lateNight"];
                    const visible = order.filter((per) =>
                      per === "lunch"
                        ? lunchAvailability.kind === "show"
                        : per === "family"
                          ? familyAvailability.kind === "show"
                          : lateNightAvailability.kind === "show",
                    );
                    const idx = visible.indexOf(p);
                    return visible[(idx + 1) % visible.length] ?? p;
                  })
                }
                className="inline-flex items-center gap-0.5 text-[11px] font-medium text-italia-red"
              >
                {period === "lunch" ? "Lunch" : period === "family" ? "Family" : "Late dinner"}
                <ChevronDown className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Primary CTA — McDonald's "Make it a Meal" pattern. Default-pushed
              tier (red Most-picked badge) is rendered as a full-width tile so
              non-bundling reads as the deviant choice. Tap opens the composer
              sheet so the customer can swap defaults rather than getting
              cheapest-only. */}
          <PrimaryBundleCTA
            bundle={primaryTier}
            pricing={primaryPricing}
            applied={primaryIsApplied}
            onApply={() => handleApply(primaryTier)}
            mainsCount={primaryPricing.mainsCount}
            activeComboSavings={activeComboSavings}
            activeComboName={activeComboName}
          />

          {/* Smaller comparison row: the entry tier + decoy stay visible so
              the customer perceives the ladder, but they don't compete with
              the primary CTA for attention. */}
          {compareTiers.length > 0 && (
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${Math.min(compareTiers.length, 2)}, minmax(0, 1fr))` }}
            >
              {compareTiers.map((bundle) => (
                <BundleChip
                  key={bundle.id}
                  bundle={bundle}
                  cartItems={items}
                  menuItems={allMenuItems}
                  applied={appliedBundleId === bundle.id}
                  onApply={() => handleApply(bundle)}
                  compact
                />
              ))}
            </div>
          )}
        </>
      )}

      <BundleComposerSheet
        open={composerBundle !== null}
        onClose={handleComposerClose}
        bundle={composerBundle}
        cartItems={items}
        menuItems={allMenuItems}
        locationSlug={locationSlug}
        onApply={handleComposerApply}
      />
    </div>
  );
}

interface PrimaryCTAProps {
  bundle: BundleTier;
  pricing: { priceGrosze: number; refPriceGrosze: number; savings: number; mainsCount: number };
  applied: boolean;
  onApply: () => void;
  mainsCount: number;
  activeComboSavings: number;
  activeComboName: string | null;
}

function PrimaryBundleCTA({
  bundle,
  pricing,
  applied,
  onApply,
  mainsCount,
  activeComboSavings,
  activeComboName,
}: PrimaryCTAProps) {
  const perPerson = mainsCount > 0 ? Math.round(pricing.priceGrosze / mainsCount) : 0;
  // Per-person framing only kicks in at ≥3 mains so a 2-person bundle
  // doesn't get awkward maths. Family Feast at 3 mains ≈ 40 PLN per
  // person carries the cinema-combo "deal-for-everyone" psychology.
  const showPerPerson = mainsCount >= 3 && perPerson > 0;

  // Combo × Bundle clarity (user-asked scenario): when a combo deal is
  // already saving the customer some PLN, the bundle's "save X" copy
  // would over-promise — applying the bundle replaces the combo, so the
  // *net* benefit to the customer is bundle savings MINUS combo savings.
  // We show the bundle's full save (it's still the real à-la-carte gap)
  // but also surface the honest "extra you save by upgrading" so the
  // customer doesn't feel cheated when the 10% Italian Classic badge
  // silently disappears on bundle apply.
  const incrementalVsCombo =
    activeComboSavings > 0 ? Math.max(0, pricing.savings - activeComboSavings) : 0;

  return (
    <button
      type="button"
      onClick={onApply}
      className={`w-full rounded-xl border p-3 transition-all text-left animate-fade-in ${
        applied
          ? "border-italia-green/40 bg-italia-green/5 cursor-default"
          : "border-italia-red/40 bg-gradient-to-r from-italia-red/10 to-italia-gold/10 hover:border-italia-red hover:shadow-md cursor-pointer"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                applied
                  ? "bg-italia-green text-white"
                  : "bg-italia-red text-white"
              }`}
            >
              {applied ? "Applied" : "Most picked"}
            </span>
            <span className="font-heading font-bold text-sm text-italia-dark">
              Make it a {bundle.tier}
            </span>
          </div>
          <p className="text-xs text-italia-gray mt-0.5 leading-snug">
            {bundle.description}
            {showPerPerson && (
              <span className="text-italia-gold-dark font-semibold">
                {" "}· {formatPrice(perPerson)} per person
              </span>
            )}
          </p>
          {!applied && incrementalVsCombo > 0 && activeComboName && (
            <p className="text-[11px] text-italia-green-dark font-semibold mt-1 leading-snug">
              +{formatPrice(incrementalVsCombo)} more than your current {activeComboName}
            </p>
          )}
          {!applied && activeComboSavings > 0 && (
            <p className="text-[10px] text-italia-gray mt-0.5 leading-snug italic">
              Replaces the active {activeComboName ?? "combo deal"}.
            </p>
          )}
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="font-heading text-lg font-bold text-italia-red">
            {formatPrice(pricing.priceGrosze)}
          </div>
          {pricing.refPriceGrosze > pricing.priceGrosze && (
            <div className="text-[10px] text-italia-gray line-through leading-tight">
              {formatPrice(pricing.refPriceGrosze)}
            </div>
          )}
          {pricing.savings > 0 && (
            <div className="text-[10px] font-bold text-italia-green-dark uppercase tracking-wider mt-0.5">
              Save {formatPrice(pricing.savings)}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

interface ChipProps {
  bundle: BundleTier;
  cartItems: import("@/data/types").CartItem[];
  menuItems: MenuItem[];
  applied: boolean;
  onApply: () => void;
  /** When true, render in compact comparison-row styling (smaller text,
   *  no Most-picked/Best-value badges — those are reserved for the
   *  primary CTA above). Used for the entry tier + decoy when the
   *  default-pushed tier is the primary CTA. */
  compact?: boolean;
}

function BundleChip({ bundle, cartItems, menuItems, applied, onApply, compact = false }: ChipProps) {
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

  // Visual ladder roles are defined on the bundle. Compact mode is used
  // for the secondary comparison row when a default-pushed tier carries
  // the primary CTA above — we drop the red/gold badges there so they
  // don't compete with the primary CTA's "Most picked" treatment.
  const baseClass = (() => {
    if (applied) {
      return "border-italia-green/40 bg-italia-green/5";
    }
    if (compact) {
      // Decoy stays slightly muted to do its dominance-heuristic job.
      return bundle.isDecoy
        ? "border-gray-200 bg-white opacity-85 hover:border-italia-gold/40"
        : "border-gray-200 bg-white hover:border-italia-gold/40";
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
      {!applied && !compact && bundle.isDefault && (
        <span className="absolute -top-2 left-2.5 px-2 py-0.5 rounded-full bg-italia-red text-white text-[9px] font-bold uppercase tracking-wider">
          Most picked
        </span>
      )}
      {!applied && !compact && !bundle.isDefault && bundle.isAnchor && (
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
