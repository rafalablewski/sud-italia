"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronLeft } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import {
  type BundleTier,
  type BundleMealPeriod,
  computeBundlePrice,
  isDynamicBundle,
  resolveBundleSlots,
} from "@/lib/bundles";
import { MENU_CATEGORY_LABELS, type CartItem, type MenuCategory, type MenuItem } from "@/data/types";

/**
 * Bundle composition picker (Domino's "Mix & Match" × McDonald's "Make
 * it a Meal" pattern). Rendered INLINE inside the cart drawer — in place
 * of the bundle ladder — when the customer taps a bundle CTA. It is not
 * a separate sheet/overlay: a guest edits the deal without ever leaving
 * their cart, and a "← Bundles" back affordance returns them to the tier
 * list. Pre-fills each slot with the cheapest available option (or
 * whatever was already in cart) and lets them swap individual units;
 * confirming applies the bundle with the chosen line-up so the price
 * reflects the exact items they'll be charged for (closes the limonata
 * margin leak the old "tap → silently cheapest" flow exposed).
 *
 * V8 Trattoria language (parchment / Cormorant / terracotta) so it reads
 * as one continuous surface with the ladder it replaces. Slot pickers are
 * tap-to-expand cards (one open at a time, big ≥52px targets, grid-rows
 * height animation) tuned for one-thumb mobile use. A hero ribbon leads
 * with the savings + per-person framing; the footer carries the total +
 * inline apply CTA (NOT sticky — the cart drawer owns the sticky footer).
 *
 * Compared to the auto-apply path (`buildBundleCartLines` from
 * BundleLadder.tsx), this gives the customer explicit agency over add-on
 * choice without breaking the bundle lock — a meaningful conversion
 * uplift in QSR A/Bs (Domino's reported ~9% AOV lift on Mix & Match).
 */

interface BundleComposerProps {
  /** The tier being composed — non-null because the composer is only
   *  mounted while a bundle is actively being edited. */
  bundle: BundleTier;
  cartItems: CartItem[];
  menuItems: MenuItem[];
  locationSlug: string;
  /** Customer phone (E.164) — when provided, the composer fetches the
   *  customer's last applied composition for this bundle and pre-fills
   *  the picks so a repeat customer can confirm in one tap (Sprint 8
   *  #8 — Domino's "Same as last time" pattern). */
  customerPhone?: string | null;
  /** Returns to the bundle ladder without applying (the "← Bundles"
   *  back affordance + abandon beacon live on the BundleLadder side). */
  onCancel: () => void;
  /** Called with the final composition + computed price when the
   *  customer confirms. The ladder's `applyBundle` flow consumes this
   *  to lock the cart. */
  onApply: (lines: CartItem[], priceGrosze: number) => void;
}

/** Italian flourish per meal period — mirrors the BundleLadder header so
 *  the composer reads as the same offer the customer just tapped. */
const PERIOD_IT: Record<BundleMealPeriod, string> = {
  lunch: "il pranzo",
  family: "festa di famiglia",
  lateNight: "la cena tardi",
};

/** A warm glyph per category for the slot eyebrow. Decorative only. */
const CATEGORY_GLYPH: Record<MenuCategory, string> = {
  pizza: "🍕",
  pasta: "🍝",
  antipasti: "🫒",
  panini: "🥪",
  drinks: "🥤",
  desserts: "🍰",
};

export function BundleComposer({
  bundle,
  cartItems,
  menuItems,
  locationSlug,
  customerPhone,
  onCancel,
  onApply,
}: BundleComposerProps) {
  const [lastComposition, setLastComposition] = useState<{ menuItemId: string; quantity: number }[] | null>(null);
  // True once the repeat-customer lookup has SETTLED — fetched, failed, or
  // there was no phone to look up. Gates the one-shot pick init below so the
  // "same as last time" prefill isn't lost to the async fetch: without this,
  // picks initialize on the first render (while lastComposition is still
  // null) and never re-run, so the customer's prior composition never lands.
  const [lastBundleLoaded, setLastBundleLoaded] = useState(false);
  // Which slot/unit chooser is expanded — only one open at a time keeps the
  // inline picker calm. Key is `${slotIdx}:${unitIdx}`.
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Fetch the customer's last composition for this bundle. The component is
  // keyed by bundle.id and only mounted while active, and these deps are
  // stable per mount, so this runs once. (Don't reintroduce a `lastFetchedFor`
  // state guard in the dep array — setting it here would retrigger the effect,
  // the cleanup would flip `active` off, and `lastBundleLoaded` would never be
  // set → the composer deadlocks on the loading state.)
  useEffect(() => {
    let active = true;
    if (!customerPhone || !locationSlug) {
      setLastBundleLoaded(true);
      return;
    }
    const qs = new URLSearchParams({
      phone: customerPhone,
      bundleId: bundle.id,
      locationSlug,
    });
    fetch(`/api/customer/last-bundle?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { composition?: { menuItemId: string; quantity: number }[] | null }) => {
        if (active) setLastComposition(data.composition ?? null);
      })
      .catch(() => {
        if (active) setLastComposition(null);
      })
      .finally(() => {
        if (active) setLastBundleLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [bundle.id, customerPhone, locationSlug]);

  const resolved = useMemo(
    () => (menuItems.length > 0 ? resolveBundleSlots(bundle, menuItems) : null),
    [bundle, menuItems],
  );

  // Per-slot, per-unit pick state. Initialized from the cheapest-or-cart
  // selection so the customer can confirm with a single tap if they
  // don't want to customize anything.
  const [picks, setPicks] = useState<MenuItem[][] | null>(null);

  // One-shot initial selection, computed once the slot candidates are
  // resolved AND the repeat-customer lookup has settled. The component is
  // keyed by bundle.id in BundleLadder, so switching tiers remounts and
  // re-runs this; within a tier it runs exactly once (guarded by
  // `initialized`), so a later cart edit can't wipe the customer's add-on
  // choices. Render-phase setState for derived state — React supports this.
  const [initialized, setInitialized] = useState(false);
  if (resolved && lastBundleLoaded && !initialized) {
    // Initial-pick priority for repeat customers:
    //   1. customer's prior composition for this same bundle (Sprint 8
    //      #8 — Domino's "Same as last time")
    //   2. items already in the cart (preserves their choices)
    //   3. cheapest available at this location (fallback)
    const priorPool: MenuItem[] = [];
    if (lastComposition) {
      for (const entry of lastComposition) {
        const m = menuItems.find((x) => x.id === entry.menuItemId && x.available);
        if (!m) continue;
        for (let i = 0; i < entry.quantity; i++) priorPool.push(m);
      }
    }
    const cartPool: MenuItem[] = isDynamicBundle(bundle)
      ? cartItems
          .filter((ci) => !bundle.mainCategories.includes(ci.menuItem.category))
          .flatMap((ci) => Array.from({ length: ci.quantity }, () => ci.menuItem))
      : cartItems.flatMap((ci) => Array.from({ length: ci.quantity }, () => ci.menuItem));
    const initial: MenuItem[][] = resolved.map(({ slot, candidates }) => {
      const slotPicks: MenuItem[] = [];
      const candidateIds = new Set(candidates.map((c) => c.id));
      for (let i = 0; i < slot.quantity; i++) {
        // (1) Last-composition pick
        const priorIdx = priorPool.findIndex((m) => candidateIds.has(m.id));
        if (priorIdx >= 0) {
          slotPicks.push(priorPool[priorIdx]);
          priorPool.splice(priorIdx, 1);
          continue;
        }
        // (2) Cart pick
        const cartIdx = cartPool.findIndex((m) => candidateIds.has(m.id));
        if (cartIdx >= 0) {
          slotPicks.push(cartPool[cartIdx]);
          cartPool.splice(cartIdx, 1);
          continue;
        }
        // (3) Cheapest fallback
        slotPicks.push(candidates[0]);
      }
      return slotPicks;
    });
    setPicks(initial);
    setInitialized(true);
  }

  const header = (
    <div className="v8-composer-head">
      <button type="button" onClick={onCancel} className="v8-composer-back">
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        Bundles
      </button>
      <h3 className="v8-composer-title">
        Make it a {bundle.tier}
        <span className="v8-composer-title-it"> · {PERIOD_IT[bundle.mealPeriod]}</span>
      </h3>
    </div>
  );

  if (!resolved || !picks) {
    return (
      <div className="v8-composer">
        {header}
        <div className="v8-composer-loading">Apparecchiando la tavola…</div>
      </div>
    );
  }

  const swapUnit = (slotIdx: number, unitIdx: number, itemId: string) => {
    const cand = resolved[slotIdx].candidates.find((c) => c.id === itemId);
    if (!cand) return;
    setPicks((prev) => {
      if (!prev) return prev;
      const next = prev.map((arr) => [...arr]);
      next[slotIdx][unitIdx] = cand;
      return next;
    });
    setOpenKey(null);
  };

  // Compute the live price from current picks. Dynamic bundles apply the
  // tier's discount %s to mains-from-cart + the selected add-ons; fixed
  // bundles ignore picks and use the stored price.
  const mainLines: CartItem[] = isDynamicBundle(bundle)
    ? cartItems.filter((ci) => bundle.mainCategories.includes(ci.menuItem.category))
    : [];
  const mainsSubtotal = isDynamicBundle(bundle)
    ? mainLines.reduce((s, ci) => s + ci.menuItem.price * ci.quantity, 0)
    : 0;
  const addOnsSubtotal = picks.flat().reduce((s, m) => s + m.price, 0);
  const livePricing = (() => {
    if (!isDynamicBundle(bundle)) {
      return computeBundlePrice(bundle, cartItems, menuItems);
    }
    const refPrice = mainsSubtotal + addOnsSubtotal;
    const mainsPct = bundle.mainsDiscountPercent ?? bundle.discountPercent;
    const addOnsPct = bundle.addOnsDiscountPercent ?? bundle.discountPercent;
    const priceGrosze = Math.round(
      mainsSubtotal * (1 - mainsPct / 100) + addOnsSubtotal * (1 - addOnsPct / 100),
    );
    return {
      priceGrosze,
      refPriceGrosze: refPrice,
      savings: Math.max(0, refPrice - priceGrosze),
      mainsCount: mainLines.reduce((s, ci) => s + ci.quantity, 0),
      mainsSubtotal,
      addOnsSubtotal,
    };
  })();

  // Per-person framing — how many people this feast feeds. Dynamic tiers
  // use the actual mains-in-cart count; fixed tiers count the pizza/pasta
  // units baked into the composition.
  const serves = isDynamicBundle(bundle)
    ? livePricing?.mainsCount ?? 0
    : bundle.composition.reduce((s, slot) => {
        const isMain =
          slot.kind === "category"
            ? slot.category === "pizza" || slot.category === "pasta"
            : /pizza|pasta/.test(slot.itemIdSuffix);
        return isMain ? s + slot.quantity : s;
      }, 0);
  const perPerson = serves >= 2 && livePricing ? Math.round(livePricing.priceGrosze / serves) : null;

  const handleApply = () => {
    if (!livePricing) return;
    const mainsLines: CartItem[] = isDynamicBundle(bundle)
      ? mainLines.map((ci) => ({ ...ci, locationSlug }))
      : [];
    const addOnLines: CartItem[] = picks
      .flat()
      .map((m) => ({ menuItem: m, quantity: 1, locationSlug }));
    onApply([...mainsLines, ...addOnLines], livePricing.priceGrosze);
  };

  const slotHeading = (slot: { kind: string; quantity: number; category?: MenuCategory; itemIdSuffix?: string }) => {
    if (slot.kind === "category" && slot.category) {
      const label = MENU_CATEGORY_LABELS[slot.category];
      return slot.quantity === 1 ? `Choose your ${label.toLowerCase()}` : `Choose ${slot.quantity} ${label.toLowerCase()}`;
    }
    const friendly = slot.itemIdSuffix
      ?.replace(/^anti-/, "")
      .replace(/^dessert-/, "")
      .replace(/^drink-/, "")
      .replace(/-/g, " ");
    return `Includes ${friendly ?? "item"}`;
  };

  const priceLabel = livePricing ? formatPrice(livePricing.priceGrosze) : "—";

  return (
    <div className="v8-composer">
      {header}

      <div className="v8-composer-body">
        {/* Hero — savings + per-person framing */}
        <div className="v8-composer-hero">
          <p className="v8-composer-hero-name">{bundle.name}</p>
          <p className="v8-composer-hero-desc">{bundle.description}</p>
          {livePricing && livePricing.savings > 0 && (
            <div className="v8-composer-hero-deal">
              <span className="v8-composer-hero-save">Save {formatPrice(livePricing.savings)}</span>
              <span className="v8-composer-hero-ref">
                à la carte {formatPrice(livePricing.refPriceGrosze)}
              </span>
            </div>
          )}
          {perPerson !== null && (
            <span className="v8-composer-hero-pp">
              ~{formatPrice(perPerson)} <em>/ person</em> · feeds {serves}
            </span>
          )}
          {lastComposition && lastComposition.length > 0 && (
            <p className="v8-composer-lastorder">
              ★ Same as your last {bundle.tier} — confirm or tweak below
            </p>
          )}
        </div>

        {/* Read-only mains carried in from the cart (dynamic tiers) */}
        {mainLines.length > 0 && (
          <div className="v8-composer-mains">
            <p className="v8-composer-mains-title">Your mains — folded into the feast</p>
            {mainLines.map((ci) => (
              <div key={ci.menuItem.id} className="v8-composer-mains-row">
                <span className="v8-composer-mains-qty">{ci.quantity}×</span>
                <span className="v8-composer-mains-name">{ci.menuItem.name}</span>
                <span className="v8-composer-mains-price">{formatPrice(ci.menuItem.price * ci.quantity)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Slot pickers */}
        {resolved.map((r, slotIdx) => {
          const glyph = r.slot.kind === "category" && r.slot.category ? CATEGORY_GLYPH[r.slot.category] : "✨";
          return (
            <div key={slotIdx} className="v8-composer-slot">
              <p className="v8-composer-slot-label">
                <span aria-hidden className="v8-composer-slot-glyph">{glyph}</span>
                {slotHeading(r.slot)}
              </p>
              <div className="v8-composer-units">
                {picks[slotIdx].map((pick, unitIdx) => {
                  const single = r.candidates.length === 1;
                  if (single) {
                    return (
                      <div key={unitIdx} className="v8-composer-included">
                        <span className="v8-composer-pick-name">{pick.name}</span>
                        <span className="v8-composer-included-tag">included</span>
                      </div>
                    );
                  }
                  const key = `${slotIdx}:${unitIdx}`;
                  const isOpen = openKey === key;
                  return (
                    <div key={unitIdx} className="v8-composer-unit">
                      <button
                        type="button"
                        className={`v8-composer-pick${isOpen ? " is-open" : ""}`}
                        onClick={() => setOpenKey(isOpen ? null : key)}
                        aria-expanded={isOpen}
                      >
                        {picks[slotIdx].length > 1 && (
                          <span className="v8-composer-unit-tag">#{unitIdx + 1}</span>
                        )}
                        <span className="v8-composer-pick-name">{pick.name}</span>
                        <span className="v8-composer-pick-price">{formatPrice(pick.price)}</span>
                        <ChevronDown
                          className={`v8-composer-pick-chevron${isOpen ? " is-open" : ""}`}
                          aria-hidden
                        />
                      </button>
                      <div className={`v8-composer-options${isOpen ? " is-open" : ""}`}>
                        <div className="v8-composer-options-inner">
                          {r.candidates.map((c) => {
                            const selected = c.id === pick.id;
                            return (
                              <button
                                key={c.id}
                                type="button"
                                className={`v8-composer-option${selected ? " is-selected" : ""}`}
                                onClick={() => swapUnit(slotIdx, unitIdx, c.id)}
                              >
                                <span className="v8-composer-option-check" aria-hidden>
                                  {selected && <Check className="h-3.5 w-3.5" />}
                                </span>
                                <span className="v8-composer-option-name">{c.name}</span>
                                <span className="v8-composer-option-price">{formatPrice(c.price)}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirm footer — inline (the cart drawer owns the sticky footer) */}
      <div className="v8-composer-foot">
        <div className="v8-composer-foot-row">
          <span className="v8-composer-total-label">
            Bundle total
            {perPerson !== null && (
              <em className="v8-composer-total-pp"> · ~{formatPrice(perPerson)}/person</em>
            )}
          </span>
          <span className="v8-composer-total-now">{priceLabel}</span>
        </div>
        <button
          type="button"
          className="v8-composer-apply"
          onClick={handleApply}
          disabled={!livePricing}
        >
          Apply {bundle.tier} · {priceLabel}
        </button>
      </div>
    </div>
  );
}
