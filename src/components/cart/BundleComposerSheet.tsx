"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/utils";
import {
  type BundleTier,
  computeBundlePrice,
  isDynamicBundle,
  resolveBundleSlots,
} from "@/lib/bundles";
import type { CartItem, MenuItem } from "@/data/types";

/**
 * Bundle composition picker (Domino's "Mix & Match" × McDonald's "Make
 * it a Meal" pattern). Opens after the customer taps a bundle CTA;
 * pre-fills each slot with the cheapest available option (or whatever
 * was already in cart) and lets them swap individual units. Confirming
 * applies the bundle with the chosen line-up — the price reflects the
 * exact items they'll be charged for (closes the limonata margin leak
 * that the old "tap → silently cheapest" flow used to expose).
 *
 * Compared to the auto-apply path (`buildBundleCartLines` from
 * BundleLadder.tsx), this gives the customer explicit agency over add-on
 * choice without breaking the bundle lock — a meaningful conversion
 * uplift in QSR A/Bs (Domino's reported ~9% AOV lift on Mix & Match).
 */

interface BundleComposerSheetProps {
  open: boolean;
  onClose: () => void;
  bundle: BundleTier | null;
  cartItems: CartItem[];
  menuItems: MenuItem[];
  locationSlug: string;
  /** Customer phone (E.164) — when provided, the composer fetches the
   *  customer's last applied composition for this bundle and pre-fills
   *  the picks so a repeat customer can confirm in one tap (Sprint 8
   *  #8 — Domino's "Same as last time" pattern). */
  customerPhone?: string | null;
  /** Called with the final composition + computed price when the
   *  customer confirms. The drawer's `applyBundle` flow consumes this
   *  to lock the cart. */
  onApply: (lines: CartItem[], priceGrosze: number) => void;
}

export function BundleComposerSheet({
  open,
  onClose,
  bundle,
  cartItems,
  menuItems,
  locationSlug,
  customerPhone,
  onApply,
}: BundleComposerSheetProps) {
  const [lastComposition, setLastComposition] = useState<{ menuItemId: string; quantity: number }[] | null>(null);
  const [lastFetchedFor, setLastFetchedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !bundle || !customerPhone || !locationSlug) return;
    const key = `${bundle.id}|${customerPhone}|${locationSlug}`;
    if (lastFetchedFor === key) return;
    setLastFetchedFor(key);
    const qs = new URLSearchParams({
      phone: customerPhone,
      bundleId: bundle.id,
      locationSlug,
    });
    fetch(`/api/customer/last-bundle?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { composition?: { menuItemId: string; quantity: number }[] | null }) => {
        setLastComposition(data.composition ?? null);
      })
      .catch(() => setLastComposition(null));
  }, [open, bundle, customerPhone, locationSlug, lastFetchedFor]);
  const resolved = useMemo(
    () => (bundle && menuItems.length > 0 ? resolveBundleSlots(bundle, menuItems) : null),
    [bundle, menuItems],
  );

  // Per-slot, per-unit pick state. Initialized from the cheapest-or-cart
  // selection so the customer can confirm with a single tap if they
  // don't want to customize anything.
  const [picks, setPicks] = useState<MenuItem[][] | null>(null);

  // Reset picks when the sheet opens with a new bundle. We can't read
  // setState in render so we mirror the resolved slots into local state
  // via useMemo + state assignment in an effect-like pattern; simpler
  // to just recompute when bundle/resolve changes via a key check.
  const lastSig = useMemo(() => {
    if (!resolved) return null;
    return `${bundle?.id}|${resolved.map((r) => r.slot.quantity).join(",")}|${cartItems.map((c) => c.menuItem.id + "x" + c.quantity).join(",")}`;
  }, [bundle, resolved, cartItems]);
  const [initSig, setInitSig] = useState<string | null>(null);
  if (open && resolved && lastSig !== null && lastSig !== initSig) {
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
    const cartPool: MenuItem[] = bundle && isDynamicBundle(bundle)
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
    setInitSig(lastSig);
  }

  if (!bundle || !resolved || !picks) {
    return (
      <Sheet open={open} onClose={onClose} title="Build your bundle">
        <div className="px-5 py-8 text-center text-sm text-italia-gray">
          Loading bundle…
        </div>
      </Sheet>
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
  };

  // Compute the live price from current picks. Dynamic bundles apply the
  // tier's discount %s to mains-from-cart + the selected add-ons; fixed
  // bundles ignore picks and use the stored price.
  const mainsSubtotal = isDynamicBundle(bundle)
    ? cartItems
        .filter((ci) => bundle.mainCategories.includes(ci.menuItem.category))
        .reduce((s, ci) => s + ci.menuItem.price * ci.quantity, 0)
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
      mainsCount: cartItems
        .filter((ci) => bundle.mainCategories.includes(ci.menuItem.category))
        .reduce((s, ci) => s + ci.quantity, 0),
      mainsSubtotal,
      addOnsSubtotal,
    };
  })();

  const handleApply = () => {
    if (!livePricing) return;
    const mainsLines: CartItem[] = isDynamicBundle(bundle)
      ? cartItems
          .filter((ci) => bundle.mainCategories.includes(ci.menuItem.category))
          .map((ci) => ({ ...ci, locationSlug }))
      : [];
    const addOnLines: CartItem[] = picks
      .flat()
      .map((m) => ({ menuItem: m, quantity: 1, locationSlug }));
    onApply([...mainsLines, ...addOnLines], livePricing.priceGrosze);
    onClose();
  };

  const slotLabel = (slot: { kind: string; quantity: number; category?: string; itemIdSuffix?: string }) => {
    if (slot.kind === "category") return `${slot.quantity} × ${slot.category}`;
    const friendly = slot.itemIdSuffix
      ?.replace(/^anti-/, "")
      .replace(/^dessert-/, "")
      .replace(/^drink-/, "")
      .replace(/-/g, " ");
    return `${slot.quantity} × ${friendly ?? "item"}`;
  };

  return (
    <Sheet open={open} onClose={onClose} title={`Make it a ${bundle.tier}`}>
      <div className="px-5 py-4 space-y-4">
        <div className="rounded-xl bg-italia-cream/40 border border-italia-gold/20 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-italia-gold-dark">
            {bundle.name}
          </p>
          <p className="text-xs text-italia-gray mt-0.5">{bundle.description}</p>
          {livePricing && livePricing.savings > 0 && (
            <p className="text-xs text-italia-green-dark font-semibold mt-1.5">
              Without the bundle you&rsquo;d pay {formatPrice(livePricing.refPriceGrosze)} ·
              save {formatPrice(livePricing.savings)}
            </p>
          )}
          {lastComposition && lastComposition.length > 0 && (
            <p className="text-[11px] text-italia-gold-dark font-semibold mt-1.5">
              ★ Same as your last {bundle.tier} — confirm or tweak below
            </p>
          )}
        </div>

        {resolved.map((r, slotIdx) => (
          <div key={slotIdx}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-italia-gray mb-1.5">
              Pick {slotLabel(r.slot)}
            </p>
            <div className="space-y-1.5">
              {picks[slotIdx].map((pick, unitIdx) => (
                <div key={unitIdx} className="flex items-center gap-2">
                  <span className="text-[10px] text-italia-gray w-4 text-right">
                    #{unitIdx + 1}
                  </span>
                  <select
                    className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm bg-white"
                    value={pick.id}
                    onChange={(e) => swapUnit(slotIdx, unitIdx, e.target.value)}
                  >
                    {r.candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {formatPrice(c.price)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Sticky confirm bar */}
      <div className="sticky bottom-0 border-t border-gray-100 bg-white px-5 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs text-italia-gray">Bundle total</span>
          <span className="text-xl font-bold text-italia-red">
            {livePricing ? formatPrice(livePricing.priceGrosze) : "—"}
          </span>
        </div>
        <Button onClick={handleApply} disabled={!livePricing} className="w-full">
          Apply {bundle.tier} · {livePricing ? formatPrice(livePricing.priceGrosze) : "—"}
        </Button>
      </div>
    </Sheet>
  );
}
