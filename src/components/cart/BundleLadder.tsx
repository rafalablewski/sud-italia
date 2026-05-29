"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
import type { CartItem, MenuItem, FulfillmentType } from "@/data/types";
import { formatPrice } from "@/lib/utils";
import { BundleComposerSheet } from "./BundleComposerSheet";

interface BundleLadderProps {
  allMenuItems: MenuItem[];
  configBundles?: BundleTier[] | null;
  configRules?: Partial<BundleAvailabilityRules> | null;
  configExperiment?: Experiment | null;
  fulfillmentType?: FulfillmentType;
  activeComboSavings?: number;
  activeComboName?: string | null;
}

/**
 * Bundle ladder (audit §3.2) — V8 reskin.
 *
 * Three ladders (Lunch, Family Feast, Late dinner), each with its own
 * gate; the customer can switch which one is showing via the
 * `.v8-cart-ladder-switch` chip when more than one qualifies. The
 * primary CTA is rendered as a full-width paper tile
 * (`.v8-cart-ladder-primary`) — McDonald's "Make it a Meal" pattern —
 * with secondary tiers as smaller paper chips below
 * (`.v8-cart-ladder-chip`). The family-feast hint, when the cart is
 * just shy of the threshold, lands as `.v8-cart-ladder-hint`.
 *
 * Every audit-tied wiring is preserved: A/B variant resolution via
 * SHA-256 hashed phone, funnel beaconing (impression / composer_opened /
 * composer_abandoned), dynamic-bundle pricing, member-only gating,
 * lunch hour gating, family minMains gating, late-night window gating,
 * composer-sheet handoff.
 */
export function BundleLadder({
  allMenuItems,
  configBundles,
  configRules,
  configExperiment = null,
  fulfillmentType = "takeout",
  activeComboSavings = 0,
  activeComboName = null,
}: BundleLadderProps) {
  const items = useCartStore((s) => s.items);
  const locationSlug = useCartStore((s) => s.locationSlug);
  const appliedBundleId = useCartStore((s) => s.appliedBundleId);
  const applyBundle = useCartStore((s) => s.applyBundle);
  const clearBundle = useCartStore((s) => s.clearBundle);
  const { customer } = useCustomer();

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
      const raw = resolveBundles(configBundles ?? null, new Date(), fulfillmentType);
      const filtered = variantApply ? raw.map(variantApply) : raw;
      return filtered.filter((b) => !b.membersOnly || !!customer?.phone);
    },
    [configBundles, variantApply, fulfillmentType, customer?.phone],
  );

  const rules = useMemo(
    () => resolveBundleRules(configRules ?? null),
    [configRules],
  );

  const hasLunch = allBundles.some((b) => b.mealPeriod === "lunch");
  const hasFamily = allBundles.some((b) => b.mealPeriod === "family");
  const hasLateNight = allBundles.some((b) => b.mealPeriod === "lateNight");

  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const i = setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(i);
  }, []);

  const lunchAvailability = useMemo(
    () => hasLunch ? resolveBundleAvailability("lunch", items, rules, hour) : { kind: "hidden" as const },
    [hasLunch, items, rules, hour],
  );
  const familyAvailability = useMemo(
    () => hasFamily ? resolveBundleAvailability("family", items, rules, hour) : { kind: "hidden" as const },
    [hasFamily, items, rules, hour],
  );
  const lateNightAvailability = useMemo(
    () => hasLateNight ? resolveBundleAvailability("lateNight", items, rules, hour) : { kind: "hidden" as const },
    [hasLateNight, items, rules, hour],
  );

  const [preferredPeriod, setPreferredPeriod] = useState<BundleMealPeriod>("family");

  const period: BundleMealPeriod | null = (() => {
    const lunchOk = lunchAvailability.kind === "show";
    const familyOk = familyAvailability.kind === "show";
    const lateOk = lateNightAvailability.kind === "show";
    if (preferredPeriod === "family" && familyOk) return "family";
    if (preferredPeriod === "lunch" && lunchOk) return "lunch";
    if (preferredPeriod === "lateNight" && lateOk) return "lateNight";
    if (lateOk) return "lateNight";
    if (familyOk) return "family";
    if (lunchOk) return "lunch";
    return null;
  })();

  const showLadder = period !== null;
  const showFamilyHint = familyAvailability.kind === "hint";

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

  const [composerBundle, setComposerBundle] = useState<BundleTier | null>(null);

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
        // best-effort
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

  if (!locationSlug) return null;
  if (!showLadder && !showFamilyHint) return null;

  const handleApply = (bundle: BundleTier) => {
    if (appliedBundleId === bundle.id) {
      clearBundle();
      return;
    }
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

  const topTierPricing = (() => {
    let best: { priceGrosze: number; refPriceGrosze: number; savings: number; mainsCount: number } | null = null;
    for (const b of visibleBundles) {
      const p = computeBundlePrice(b, items, allMenuItems);
      if (!p) continue;
      if (!best || p.refPriceGrosze > best.refPriceGrosze) best = p;
    }
    return best;
  })();

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

  const periodLabel = period === "lunch"
    ? { en: "Lunch", it: "il pranzo" }
    : period === "family"
      ? { en: "Family feast", it: "festa di famiglia" }
      : { en: "Late dinner", it: "la cena tardi" };

  return (
    <>
      {showFamilyHint && familyAvailability.kind === "hint" && (
        <FamilyHint
          needed={familyAvailability.needed}
          mainItems={familyAvailability.mainItems}
          minSavings={familyMinSavings}
        />
      )}

      {showLadder && visibleBundles.length > 0 && primaryTier && primaryPricing && (
        <div className="v8-cart-ladder">
          <div className="v8-cart-ladder-head">
            <div className="v8-cart-ladder-title">
              {periodLabel.en} <span className="v8-cart-ladder-it">· {periodLabel.it}</span>
            </div>
            {availableShown > 1 && (
              <button
                type="button"
                onClick={() =>
                  setPreferredPeriod((p) => {
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
                className="v8-cart-ladder-switch"
              >
                switch ↻
              </button>
            )}
          </div>

          {topTierPricing && topTierPricing.savings > 0 && (
            <div className="v8-cart-ladder-sub">
              À la carte you&apos;d pay{" "}
              <span className="num">{formatPrice(topTierPricing.refPriceGrosze)}</span> —
              cross a threshold and share a feast with la famiglia.
            </div>
          )}

          <PrimaryBundleCTA
            bundle={primaryTier}
            pricing={primaryPricing}
            applied={primaryIsApplied}
            onApply={() => handleApply(primaryTier)}
            mainsCount={primaryPricing.mainsCount}
            activeComboSavings={activeComboSavings}
            activeComboName={activeComboName}
          />

          {compareTiers.length > 0 && (
            <div
              className="v8-cart-ladder-chips"
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
                />
              ))}
            </div>
          )}
        </div>
      )}

      <BundleComposerSheet
        open={composerBundle !== null}
        onClose={handleComposerClose}
        bundle={composerBundle}
        cartItems={items}
        menuItems={allMenuItems}
        locationSlug={locationSlug}
        customerPhone={customer?.phone ?? null}
        onApply={handleComposerApply}
      />
    </>
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
  const showPerPerson = mainsCount >= 3 && perPerson > 0;
  const incrementalVsCombo =
    activeComboSavings > 0 ? Math.max(0, pricing.savings - activeComboSavings) : 0;

  return (
    <button
      type="button"
      onClick={onApply}
      className={`v8-cart-ladder-primary${applied ? " is-applied" : ""}`}
    >
      <div className="v8-cart-ladder-primary-head">
        <span className={`v8-cart-ladder-badge${applied ? " is-applied" : ""}`}>
          {applied ? "Applied · attivato" : "Most picked · il preferito"}
        </span>
        <span className="v8-cart-ladder-primary-name">
          Make it a <em>{bundle.tier}</em>
        </span>
      </div>
      <div className="v8-cart-ladder-primary-body">
        <div className="v8-cart-ladder-primary-desc">
          {bundle.description}
          {showPerPerson && (
            <span className="v8-cart-ladder-primary-perperson">
              {" · "}<span className="num">{formatPrice(perPerson)}</span> per person
            </span>
          )}
        </div>
        <div className="v8-cart-ladder-primary-price">
          <div className="v8-cart-ladder-primary-now num">{formatPrice(pricing.priceGrosze)}</div>
          {pricing.refPriceGrosze > pricing.priceGrosze && (
            <div className="v8-cart-ladder-primary-ref num">{formatPrice(pricing.refPriceGrosze)}</div>
          )}
          {pricing.savings > 0 && (
            <div className="v8-cart-ladder-primary-save">
              Save <span className="num">{formatPrice(pricing.savings)}</span>
            </div>
          )}
        </div>
      </div>
      {!applied && incrementalVsCombo > 0 && activeComboName && (
        <div className="v8-cart-ladder-primary-incremental">
          +<span className="num">{formatPrice(incrementalVsCombo)}</span> more than your current {activeComboName}
        </div>
      )}
      {!applied && activeComboSavings > 0 && (
        <div className="v8-cart-ladder-primary-replaces">
          Replaces the active {activeComboName ?? "combo deal"}.
        </div>
      )}
    </button>
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

  const classes = [
    "v8-cart-ladder-chip",
    applied ? "is-applied" : "",
    bundle.isDecoy && !applied ? "is-decoy" : "",
  ].filter(Boolean).join(" ");

  return (
    <button type="button" onClick={onApply} className={classes}>
      <div className="v8-cart-ladder-chip-tier">{bundle.tier}</div>
      <div className="v8-cart-ladder-chip-name">{bundle.name}</div>
      <div className="v8-cart-ladder-chip-desc">{description}</div>
      <div className="v8-cart-ladder-chip-price">
        <span className="v8-cart-ladder-chip-now num">{formatPrice(priceGrosze)}</span>
        {showRef && (
          <span className="v8-cart-ladder-chip-ref num">{formatPrice(refPriceGrosze)}</span>
        )}
      </div>
      {savings > 0 && (
        <div className="v8-cart-ladder-chip-save">
          Save <span className="num">{formatPrice(savings)}</span>
        </div>
      )}
      {applied && <div className="v8-cart-ladder-chip-applied">Applied</div>}
    </button>
  );
}

interface FamilyHintProps {
  needed: number;
  mainItems: number;
  minSavings: number;
}

function FamilyHint({ needed, mainItems, minSavings }: FamilyHintProps) {
  const noun = needed === 1 ? "pizza or pasta" : "pizzas or pastas";
  return (
    <div className="v8-cart-ladder-hint" role="status">
      <span className="v8-cart-ladder-hint-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="5.5" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="12.5" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M1.5 15 C 1.5 11.5, 3.5 10, 5.5 10 C 7.5 10, 9.5 11.5, 9.5 15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M8.5 15 C 8.5 11.5, 10.5 10, 12.5 10 C 14.5 10, 16.5 11.5, 16.5 15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </span>
      <div>
        Add{" "}
        <em>
          <span className="num">{needed}</span> more {noun}
        </em>{" "}
        to unlock <em>Festa di famiglia</em>
        {minSavings > 0 && (
          <> — save up to <span className="num">{formatPrice(minSavings)}</span></>
        )}
        <span className="v8-cart-ladder-hint-progress"> · <span className="num">{mainItems}</span> in cart</span>
      </div>
    </div>
  );
}
