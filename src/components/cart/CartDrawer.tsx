"use client";

import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { useCartStore } from "@/store/cart";
import { CartItemRow } from "./CartItem";
import { CartUpsell } from "./CartUpsell";
import { DeliveryProgress } from "./DeliveryProgress";
import { ComboDealBanner } from "./ComboDealBanner";
import { LoyaltyEarnPreview } from "./LoyaltyEarnPreview";
import { TodBanner } from "./TodBanner";
import { TierPerkBanner } from "./TierPerkBanner";
import { BundleLadder } from "./BundleLadder";
import { CorporateOrderBanner } from "./CorporateOrderBanner";
import type { BundleTier } from "@/lib/bundles";
import { formatPrice } from "@/lib/utils";
import {
  getCartSuggestions,
  getActiveComboDeals,
  getDeliveryThresholdForCustomer,
  getCustomerSegment,
  computeDeliveryFee,
  UpsellConfig,
  PairingContext,
} from "@/lib/upsell";
import { calculateTier } from "@/lib/loyalty";
import {
  ShoppingCart,
  Trash2,
  Package,
  Truck,
  Star,
  Clock,
  Check,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { SlotPicker } from "./SlotPicker";
import { krakowMenu } from "@/data/menus/krakow";
import { warszawaMenu } from "@/data/menus/warszawa";
import { useCustomer } from "@/store/customer";
import { postCartPresenceToServer } from "@/lib/cart-presence-post-client";
import { useLiveMenuAvailability } from "@/lib/useLiveMenuAvailability";

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  allMenuItems?: import("@/data/types").MenuItem[];
}

const PHONE_PATTERN = /^[\d\s\-()]{7,}$/;

export function CartDrawer({ open, onClose, allMenuItems = [] }: CartDrawerProps) {
  const items = useCartStore((s) => s.items);
  const getTotal = useCartStore((s) => s.getTotal);
  const clearCart = useCartStore((s) => s.clearCart);
  const locationSlug = useCartStore((s) => s.locationSlug);
  const fulfillmentType = useCartStore((s) => s.fulfillmentType);
  const setFulfillmentType = useCartStore((s) => s.setFulfillmentType);
  const selectedSlotId = useCartStore((s) => s.selectedSlotId);
  const selectedSlotTime = useCartStore((s) => s.selectedSlotTime);
  const selectedSlotDate = useCartStore((s) => s.selectedSlotDate);
  const deliveryAddress = useCartStore((s) => s.deliveryAddress);
  const setDeliveryAddress = useCartStore((s) => s.setDeliveryAddress);

  const { customer: loyaltyCustomer } = useCustomer();

  const [customerFirstName, setCustomerFirstName] = useState("");
  const [customerLastName, setCustomerLastName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phoneError, setPhoneError] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [slotFomo, setSlotFomo] = useState<{ anyLow: boolean } | null>(null);
  // Fetch location-specific upsell config from admin settings
  const [upsellConfig, setUpsellConfig] = useState<UpsellConfig | null>(null);
  useEffect(() => {
    if (!locationSlug) return;
    fetch(`/api/settings/upsell?location=${locationSlug}`)
      .then((r) => r.json())
      .then((data) => { if (data) setUpsellConfig(data); })
      .catch(() => {});
  }, [locationSlug]);

  // Per-customer attach history (audit §3.1) — fetched once when the drawer
  // first sees a known phone. Feeds scorePairing() inside getCartSuggestions
  // so the chips re-rank by "you added it 3 of last 4 visits".
  const [attachHistory, setAttachHistory] = useState<{
    orderCount: number;
    attachByItemId: Record<string, number>;
  } | null>(null);
  useEffect(() => {
    if (!loyaltyCustomer?.phone) {
      setAttachHistory(null);
      return;
    }
    fetch(`/api/customer/attach-history?phone=${encodeURIComponent(loyaltyCustomer.phone)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data === "object") setAttachHistory(data);
      })
      .catch(() => setAttachHistory(null));
  }, [loyaltyCustomer?.phone]);

  // Slot scarcity for honest FOMO (same data as SlotPicker)
  useEffect(() => {
    if (!open || !locationSlug || items.length === 0) {
      setSlotFomo(null);
      return;
    }
    const date =
      selectedSlotDate ?? new Date().toISOString().split("T")[0];
    let cancelled = false;
    fetch(
      `/api/slots?location=${encodeURIComponent(locationSlug)}&date=${encodeURIComponent(date)}&type=${fulfillmentType}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        const anyLow = list.some(
          (s: { spotsLeft: number }) => s.spotsLeft <= 2
        );
        setSlotFomo({ anyLow });
      })
      .catch(() => {
        if (!cancelled) setSlotFomo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, locationSlug, items.length, selectedSlotDate, fulfillmentType]);

  // Live availability map for the cart's location — flips item-86 toggles
  // through to the cart drawer within one polling interval so customers can
  // remove unavailable items before they hit "Pay".
  const availabilitySeed = useMemo(() => {
    const seed: Record<string, boolean> = {};
    for (const i of items) seed[i.menuItem.id] = true;
    return seed;
  }, [items]);
  const liveAvailability = useLiveMenuAvailability(
    locationSlug || "",
    availabilitySeed,
  );
  const unavailableItems = useMemo(
    () =>
      items.filter(
        (i) => liveAvailability[i.menuItem.id] === false,
      ),
    [items, liveAvailability],
  );

  const subtotal = getTotal();
  const appliedBundleId = useCartStore((s) => s.appliedBundleId);
  const bundlePriceGrosze = useCartStore((s) => s.bundlePriceGrosze);
  const isBundleActive = appliedBundleId !== null && bundlePriceGrosze > 0;

  // Apply combo deal discount to actual total — disabled while a bundle
  // is locked (the bundle's own savings replace the percentage discount).
  const comboResult = useMemo(() => getActiveComboDeals(items, upsellConfig), [items, upsellConfig]);
  const comboDiscount =
    isBundleActive
      ? 0
      : comboResult.isComplete
        ? comboResult.savings
        : 0;
  const tipAmount = useCartStore((s) => s.tipAmount);
  const setTipAmount = useCartStore((s) => s.setTipAmount);

  // Per-segment free-delivery threshold (audit §2.5 Uber Eats).
  // Resolves the customer's tier from their points balance and feeds the
  // segmented threshold to DeliveryProgress so the bar shows the right
  // target. The same threshold is passed to computeDeliveryFee in
  // /api/checkout so the receipt matches what the bar promised.
  const deliverySegment = loyaltyCustomer
    ? {
        ordersCount: loyaltyCustomer.ordersCount,
        tier: calculateTier(loyaltyCustomer.points),
      }
    : null;
  const deliveryThreshold = getDeliveryThresholdForCustomer(deliverySegment);
  const isDeliveryPersonalised =
    !!deliverySegment && getCustomerSegment(deliverySegment) !== "regular";

  // Mirror the server-side fee calculation so the pay-bar shows the same
  // number Stripe will charge. createOrder.ts:161 calls computeDeliveryFee
  // with the post-discount subtotal and the same per-segment threshold.
  const deliveryFee = computeDeliveryFee(
    subtotal - comboDiscount,
    fulfillmentType,
    deliveryThreshold,
  );
  const total = subtotal - comboDiscount + deliveryFee + tipAmount;

  const isPhoneValid = PHONE_PATTERN.test(customerPhone.trim());

  const canCheckout =
    customerFirstName.trim().length > 0 &&
    customerLastName.trim().length > 0 &&
    isPhoneValid &&
    selectedSlotId !== null &&
    unavailableItems.length === 0 &&
    (fulfillmentType !== "delivery" || deliveryAddress.trim().length > 0);

  // Pre-fill checkout fields from loyalty identity
  useEffect(() => {
    if (loyaltyCustomer) {
      if (!customerFirstName && !customerLastName) {
        const fullName = loyaltyCustomer.name.trim();
        const lastName = (loyaltyCustomer.lastName || "").trim();

        if (lastName) {
          const firstName = fullName.endsWith(lastName)
            ? fullName.slice(0, fullName.length - lastName.length).trim()
            : fullName;
          setCustomerFirstName(firstName);
          setCustomerLastName(lastName);
        } else {
          const parts = fullName.split(/\s+/);
          setCustomerFirstName(parts[0] || "");
          setCustomerLastName(parts.slice(1).join(" ") || "");
        }
      }
      if (!customerPhone) {
        const phone = loyaltyCustomer.phone.replace(/^\+48/, "");
        setCustomerPhone(phone);
      }
    }
  }, [loyaltyCustomer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve menu items — use prop if available, otherwise look up by location
  const resolvedMenuItems = useMemo(() => {
    if (allMenuItems.length > 0) return allMenuItems;
    // Fallback: load from hardcoded menus based on cart's location
    const menus: Record<string, import("@/data/types").MenuItem[]> = {
      krakow: krakowMenu,
      warszawa: warszawaMenu,
    };
    return locationSlug ? menus[locationSlug] || [] : [];
  }, [allMenuItems, locationSlug]);

  // Cross-sell suggestions — always have menu items to work with now.
  // Pass §3.1 pairing context so the chips re-rank by hour + customer
  // attach history. When the drawer is open we read the local hour fresh
  // each render so a customer who lingers past 13:00 sees the post-lunch
  // ranking shift in place.
  const pairingContext = useMemo<PairingContext>(
    () => ({
      hour: new Date().getHours(),
      customerOrderCount: attachHistory?.orderCount ?? 0,
      customerAttachByItemId: attachHistory?.attachByItemId ?? {},
    }),
    [attachHistory],
  );
  const suggestions = useMemo(
    () => getCartSuggestions(items, resolvedMenuItems, 4, upsellConfig, pairingContext),
    [items, resolvedMenuItems, upsellConfig, pairingContext]
  );

  const handlePhoneChange = (value: string) => {
    setCustomerPhone(value);
    if (phoneError && PHONE_PATTERN.test(value.trim())) {
      setPhoneError(false);
    }
  };

  const handleCheckout = async () => {
    if (!customerFirstName.trim() || !customerLastName.trim()) return;
    if (!isPhoneValid) {
      setPhoneError(true);
      return;
    }

    const customerName = [customerFirstName, customerLastName]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            id: i.menuItem.id,
            quantity: i.quantity,
            notes: i.notes,
          })),
          locationSlug,
          customerName,
          customerPhone: `+48${customerPhone.trim()}`,
          fulfillmentType,
          slotId: selectedSlotId,
          slotDate: selectedSlotDate,
          slotTime: selectedSlotTime,
          deliveryAddress: fulfillmentType === "delivery" ? deliveryAddress.trim() : undefined,
          customerEmail: customerEmail.trim() || undefined,
          specialInstructions: specialInstructions.trim() || undefined,
          tipAmount: tipAmount > 0 ? tipAmount : undefined,
          appliedBundleId: appliedBundleId || undefined,
        }),
      });

      const data = await res.json();

      if (data.url) {
        // Loyalty auto-enrollment happens server-side via the checkout API
        // (phone number is stored with the order in the database)
        window.location.href = data.url;
      } else if (data.orderId) {
        const presenceSlug = locationSlug;
        clearCart();
        if (presenceSlug) void postCartPresenceToServer(presenceSlug, [], 0);
        setCustomerFirstName("");
        setCustomerLastName("");
        setCustomerPhone("");
        onClose();
        window.location.href = `/order-confirmation?orderId=${data.orderId}&location=${locationSlug}`;
      } else {
        setCheckoutError(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setCheckoutError("Connection error. Please check your internet and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <Sheet open={open} onClose={onClose} title="Your Order">
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="w-20 h-20 rounded-full bg-italia-cream flex items-center justify-center mb-5">
            <span className="text-4xl">🍕</span>
          </div>
          <p className="font-heading font-bold text-xl text-italia-dark mb-2">Your next meal is waiting</p>
          <p className="text-sm text-italia-gray mb-6">Browse the menu and add your favorites to get started</p>
          <button
            onClick={onClose}
            className="px-6 py-3 bg-italia-red text-white font-semibold rounded-xl hover:bg-italia-red-dark transition-colors text-sm"
          >
            Browse Menu
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title="Your Order">
      {unavailableItems.length > 0 && (
        <div className="mx-5 mt-3 mb-1 rounded-xl border border-italia-red/30 bg-italia-red/5 px-3 py-2.5">
          <p className="text-xs font-semibold text-italia-red leading-snug">
            {unavailableItems.length === 1
              ? `"${unavailableItems[0].menuItem.name}" just sold out`
              : `${unavailableItems.length} items just sold out`}
          </p>
          <p className="text-[11px] text-italia-gray mt-0.5">
            Remove {unavailableItems.length === 1 ? "it" : "them"} below to continue.
          </p>
        </div>
      )}

      {/* Audit §3.4 — Sud Italia Corporate. Surfaces above everything so
          the customer sees who's paying before they scan their cart. */}
      <CorporateOrderBanner />

      {/* Time-of-day banner (audit §2.3) — picks one variant by local hour.
          Sits above the items list so it primes the customer before they
          scroll into their cart contents. Admin override via
          LocationUpsellConfig.timeWindows[] when set; otherwise the
          hardcoded DEFAULT_TIME_WINDOWS. */}
      <TodBanner allMenuItems={allMenuItems} upsellConfig={upsellConfig} />

      {/* Items list */}
      <div className="px-5">
        {items.map((item) => {
          const soldOut = liveAvailability[item.menuItem.id] === false;
          return (
            <div
              key={item.menuItem.id}
              className={soldOut ? "opacity-60" : ""}
              data-soldout={soldOut ? "true" : undefined}
            >
              <CartItemRow item={item} />
              {soldOut && (
                <p className="-mt-2 mb-3 text-[11px] font-medium text-italia-red">
                  Sold out — remove to continue
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Loyalty status banner */}
      <div className="px-5 mt-3">
        {loyaltyCustomer ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-italia-gold/8 border border-italia-gold/15">
            <Star className="h-4 w-4 text-italia-gold flex-shrink-0" />
            <p className="text-xs text-italia-dark">
              Earning points as <span className="font-semibold">{loyaltyCustomer.name.split(" ")[0]}</span>
              <span className="text-italia-gold-dark font-bold ml-1">{loyaltyCustomer.points} pts</span>
            </p>
          </div>
        ) : (
          <a href="/rewards" className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-100 hover:bg-italia-gold/5 transition-colors">
            <Star className="h-4 w-4 text-italia-gray flex-shrink-0" />
            <p className="text-xs text-italia-gray leading-snug">
              <span className="font-medium text-italia-dark">Points follow the phone you enter below.</span>{" "}
              Tap to sign in — see your balance and redeem coupons.
            </p>
          </a>
        )}
      </div>

      {/* Gold/Platinum perk banner (audit §2.2 row 6) — visible only to
          eligible tiers; offers a comp'd antipasto via a price-0 cart line. */}
      <TierPerkBanner allMenuItems={allMenuItems} />

      {/* Bundle ladder (audit §3.2) — fixed-price tiers above the per-item
          chips. Sits before the combo banner because once the customer locks
          a bundle, the percentage-discount combo is moot. Lunch ladder is
          hour-gated; Family Feast is quantity-gated; both rules are
          admin-configurable via LocationUpsellConfig.bundleRules. */}
      <BundleLadder
        allMenuItems={resolvedMenuItems}
        configBundles={
          (upsellConfig as { bundles?: BundleTier[] } | null)?.bundles ?? null
        }
        configRules={
          (upsellConfig as { bundleRules?: import("@/lib/bundles").BundleAvailabilityRules } | null)?.bundleRules ?? null
        }
      />

      {/* Combo deal banner */}
      <ComboDealBanner cartItems={items} />

      {/* Cross-sell suggestions */}
      <CartUpsell suggestions={suggestions} />

      {/* Delivery progress bar */}
      {/* Per-segment threshold (audit §2.5 Uber Eats): first-timers see 39 PLN,
          regulars 60 PLN, Gold/Platinum 0 (already free). */}
      <DeliveryProgress
        cartTotal={total}
        fulfillmentType={fulfillmentType}
        thresholdGrosze={deliveryThreshold}
        isPersonalised={isDeliveryPersonalised}
      />

      {/* Fulfillment type selector */}
      <div className="px-5 mt-4 mb-3">
        <p className="text-xs font-semibold text-italia-gray uppercase tracking-wide mb-2">
          How would you like your order?
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setFulfillmentType("takeout")}
            className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
              fulfillmentType === "takeout"
                ? "border-italia-green bg-italia-green/5 text-italia-green"
                : "border-gray-200 text-italia-gray hover:border-gray-300"
            }`}
          >
            <Package className="h-4 w-4" />
            Takeout
          </button>
          <button
            onClick={() => setFulfillmentType("delivery")}
            className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
              fulfillmentType === "delivery"
                ? "border-italia-red bg-italia-red/5 text-italia-red"
                : "border-gray-200 text-italia-gray hover:border-gray-300"
            }`}
          >
            <Truck className="h-4 w-4" />
            Delivery
          </button>
        </div>
      </div>

      {/* Delivery address — TODO: integrate Google Places Autocomplete
           When NEXT_PUBLIC_GOOGLE_PLACES_KEY is set, replace this input with
           a Places Autocomplete component. See: https://developers.google.com/maps/documentation/places/web-service/autocomplete */}
      {fulfillmentType === "delivery" && (
        <div className="px-5 mb-3">
          <label className="sr-only" htmlFor="checkout-address">Delivery address</label>
          <input
            id="checkout-address"
            type="text"
            placeholder="Street address, apt/building, city"
            value={deliveryAddress}
            onChange={(e) => setDeliveryAddress(e.target.value)}
            autoComplete="street-address"
            className="pub-input min-h-[44px]"
          />
        </div>
      )}

      {/* Time slot picker */}
      {locationSlug && (
        <div className="px-5 mb-3">
          <SlotPicker
            locationSlug={locationSlug}
            fulfillmentType={fulfillmentType}
          />
          {slotFomo &&
            (() => {
              if (!selectedSlotId) {
                // Low-stock warning already shown inside SlotPicker; avoid duplicate amber banner.
                if (slotFomo.anyLow) {
                  return null;
                }
                return (
                  <div
                    className="mt-2 flex items-start gap-2.5 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5"
                    role="status"
                  >
                    <Clock
                      className="h-4 w-4 flex-shrink-0 text-italia-red mt-0.5"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-italia-dark leading-snug">
                        Pick your pickup time
                      </p>
                      <p className="text-[11px] text-italia-gray mt-1 leading-relaxed">
                        Popular pickup windows fill up fast — choose yours below.
                      </p>
                    </div>
                  </div>
                );
              }

              // Per-slot scarcity ("Only 2 left", "Last spot!") is already on the slot button.
              return (
                <div
                  className="mt-2 flex items-start gap-2.5 rounded-xl border border-italia-green/20 bg-italia-green/5 px-3 py-2.5"
                  role="status"
                >
                  <Check
                    className="h-4 w-4 flex-shrink-0 text-italia-green mt-0.5"
                    aria-hidden
                  />
                  <p className="text-xs leading-snug text-italia-dark">
                    <span className="font-semibold">Time selected.</span>{" "}
                    <span className="text-italia-gray font-normal">
                      Complete checkout to confirm your pickup window.
                    </span>
                  </p>
                </div>
              );
            })()}
        </div>
      )}

      {/* Customer details section */}
      <div className="border-t border-gray-100 px-4 pt-3 pb-3 sm:px-5 sm:pt-3 sm:pb-4 space-y-2 bg-gray-50">
        <p className="text-xs font-semibold text-italia-gray uppercase tracking-wide">Your details</p>
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="sr-only" htmlFor="checkout-first-name">First name</label>
              <input
                id="checkout-first-name"
                type="text"
                placeholder="First name"
                value={customerFirstName}
                onChange={(e) => setCustomerFirstName(e.target.value)}
                className="pub-input min-h-[40px] text-sm"
                autoComplete="given-name"
              />
            </div>
            <div>
              <label className="sr-only" htmlFor="checkout-last-name">Last name</label>
              <input
                id="checkout-last-name"
                type="text"
                placeholder="Last name"
                value={customerLastName}
                onChange={(e) => setCustomerLastName(e.target.value)}
                className="pub-input min-h-[40px] text-sm"
                autoComplete="family-name"
              />
            </div>
          </div>
          <div className="flex items-center gap-0">
            <label className="sr-only" htmlFor="checkout-phone">Phone number</label>
            <span className="inline-flex items-center px-2.5 min-h-[40px] rounded-l-[0.75rem] border-y-[1.5px] border-l-[1.5px] border-r-0 border-[#e5e7eb] bg-gray-50 text-sm font-medium text-italia-gray select-none" aria-hidden="true">
              +48
            </span>
            <input
              id="checkout-phone"
              type="tel"
              placeholder="Phone number"
              value={customerPhone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              autoComplete="tel"
              className={`pub-input min-h-[40px] text-sm rounded-l-none ${
                phoneError ? "border-italia-red" : ""
              }`}
            />
          </div>

          {/* Optional email */}
          <label className="sr-only" htmlFor="checkout-email">Email address</label>
          <input
            id="checkout-email"
            type="email"
            placeholder="Email (receipt + 10% off next order)"
            autoComplete="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            className="pub-input min-h-[40px] text-sm text-italia-gray"
          />
          <label className="sr-only" htmlFor="checkout-notes">Special instructions</label>
          <textarea
            id="checkout-notes"
            placeholder="Special instructions (allergies, doorbell code, etc.)"
            value={specialInstructions}
            onChange={(e) => setSpecialInstructions(e.target.value)}
            rows={2}
            className="pub-input min-h-[52px] py-2 text-sm text-italia-gray resize-none leading-snug"
          />
        </div>
        {phoneError && (
          <p className="text-xs text-italia-red">
            Please enter a valid phone number
          </p>
        )}
      </div>

      {/* Tip picker — optional gratuity. Tied to cart subtotal so the
           preset percentages always look right; custom amount in zł for
           anyone who prefers absolute. */}
      <TipPicker
        subtotalGrosze={subtotal - comboDiscount}
        valueGrosze={tipAmount}
        onChange={setTipAmount}
      />

      {/* Sticky pay bar */}
      <div className="sticky bottom-0 border-t border-gray-100 px-4 py-3 sm:px-5 sm:py-4 bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <div className="space-y-1">
          <div className="flex justify-between items-center text-sm text-italia-gray">
            <span>Subtotal{isBundleActive && <span className="ml-1 text-italia-green-dark text-xs font-medium">· bundle locked</span>}</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          {comboDiscount > 0 && (
            <div className="flex justify-between items-center text-sm font-medium text-italia-green">
              <span>{comboResult.activeDeal?.name} -{comboResult.activeDeal?.discountPercent}%</span>
              <span>-{formatPrice(comboDiscount)}</span>
            </div>
          )}
          {tipAmount > 0 && (
            <div className="flex justify-between items-center text-sm text-italia-gray">
              <span>Tip</span>
              <span>{formatPrice(tipAmount)}</span>
            </div>
          )}
          {fulfillmentType === "delivery" && (
            <div className="flex justify-between items-center text-sm text-italia-gray">
              <span>Delivery</span>
              <span>
                {deliveryFee === 0 ? (
                  <span className="text-italia-green font-medium">Free</span>
                ) : (
                  formatPrice(deliveryFee)
                )}
              </span>
            </div>
          )}
          <div className="flex justify-between items-center text-lg font-bold border-t border-gray-100 pt-2">
            <span>Total</span>
            <span className="text-italia-red">{formatPrice(total)}</span>
          </div>
        </div>

        <div className="mt-1.5 flex flex-col gap-1 empty:hidden">
          <LoyaltyEarnPreview cartTotal={total} />
        </div>

        {checkoutError && (
          <div className="mt-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700 flex items-start gap-2">
            <span className="text-red-500 mt-0.5 flex-shrink-0">!</span>
            <div>
              <p>{checkoutError}</p>
              <button onClick={() => setCheckoutError(null)} className="text-xs text-red-500 underline mt-1">Dismiss</button>
            </div>
          </div>
        )}

        <Button
          onClick={() => { setCheckoutError(null); handleCheckout(); }}
          disabled={isSubmitting || !canCheckout}
          className="w-full min-h-[48px] mt-3"
          size="md"
        >
          {isSubmitting
            ? "Processing..."
            : unavailableItems.length > 0
              ? "Remove sold-out items"
              : !selectedSlotId
                ? "Select a time slot"
                : canCheckout
                  ? `Pay ${formatPrice(total)}`
                  : fulfillmentType === "delivery" && !deliveryAddress.trim()
                    ? "Enter delivery address"
                    : "Enter name & phone to order"}
        </Button>

        <button
          type="button"
          onClick={() => clearCart()}
          className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5 mt-1.5 text-italia-gray hover:text-italia-red active:text-italia-red transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5 flex-shrink-0" />
          Clear cart
        </button>
      </div>
    </Sheet>
  );
}

/**
 * Tip presets (10 / 15 / 20%) plus a custom-zł input. Stored in grosze on the
 * Zustand cart so it survives a refresh and gets cleared on checkout. The
 * picker computes preset percentages off `subtotalGrosze` (post-discount,
 * pre-tip) so toggling between presets feels stable.
 */
function TipPicker({
  subtotalGrosze,
  valueGrosze,
  onChange,
}: {
  subtotalGrosze: number;
  valueGrosze: number;
  onChange: (g: number) => void;
}) {
  const presets = [0.1, 0.15, 0.2];
  const presetValues = presets.map((p) => Math.round(subtotalGrosze * p));
  const [customMode, setCustomMode] = useState(
    valueGrosze > 0 && !presetValues.includes(valueGrosze),
  );
  const [customStr, setCustomStr] = useState(
    valueGrosze > 0 && !presetValues.includes(valueGrosze)
      ? (valueGrosze / 100).toFixed(2)
      : "",
  );

  if (subtotalGrosze <= 0) return null;

  return (
    <div className="px-5 pt-3">
      <p className="text-xs font-semibold text-italia-gray uppercase tracking-wide mb-2">
        Add a tip — optional
      </p>
      <div className="grid grid-cols-5 gap-1.5">
        <button
          type="button"
          onClick={() => {
            setCustomMode(false);
            onChange(0);
          }}
          className={`px-2 py-2 text-xs font-medium rounded-lg border transition-colors ${
            valueGrosze === 0 && !customMode
              ? "border-italia-red bg-italia-red/5 text-italia-red"
              : "border-gray-200 text-italia-gray hover:border-gray-300"
          }`}
        >
          None
        </button>
        {presets.map((p, i) => {
          const g = presetValues[i];
          const selected = !customMode && valueGrosze === g && g > 0;
          return (
            <button
              key={p}
              type="button"
              onClick={() => {
                setCustomMode(false);
                onChange(g);
              }}
              className={`flex flex-col items-center justify-center px-2 py-2 text-xs font-medium rounded-lg border transition-colors ${
                selected
                  ? "border-italia-red bg-italia-red/5 text-italia-red"
                  : "border-gray-200 text-italia-gray hover:border-gray-300"
              }`}
            >
              <span>{Math.round(p * 100)}%</span>
              <span className="text-[10px] opacity-70">{(g / 100).toFixed(2)} zł</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            setCustomMode(true);
            onChange(Math.round(parseFloat(customStr || "0") * 100));
          }}
          className={`px-2 py-2 text-xs font-medium rounded-lg border transition-colors ${
            customMode
              ? "border-italia-red bg-italia-red/5 text-italia-red"
              : "border-gray-200 text-italia-gray hover:border-gray-300"
          }`}
        >
          Custom
        </button>
      </div>
      {customMode && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-italia-gray">zł</span>
          <input
            type="number"
            min="0"
            step="0.50"
            inputMode="decimal"
            value={customStr}
            onChange={(e) => {
              setCustomStr(e.target.value);
              onChange(Math.round(parseFloat(e.target.value || "0") * 100));
            }}
            placeholder="0.00"
            className="pub-input min-h-[36px] text-sm"
          />
        </div>
      )}
    </div>
  );
}
