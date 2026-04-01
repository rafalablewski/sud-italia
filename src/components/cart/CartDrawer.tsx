"use client";

import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { useCartStore } from "@/store/cart";
import { CartItemRow } from "./CartItem";
import { CartUpsell } from "./CartUpsell";
import { DeliveryProgress } from "./DeliveryProgress";
import { ComboDealBanner } from "./ComboDealBanner";
import { LoyaltyEarnPreview } from "./LoyaltyEarnPreview";
import { formatPrice } from "@/lib/utils";
import { getCartSuggestions, getActiveComboDeals, UpsellConfig } from "@/lib/upsell";
import {
  ShoppingCart,
  Trash2,
  Package,
  Truck,
  Star,
  Clock,
  AlertCircle,
  Check,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { SlotPicker } from "./SlotPicker";
import { krakowMenu } from "@/data/menus/krakow";
import { warszawaMenu } from "@/data/menus/warszawa";
import { useCustomer } from "@/store/customer";

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
  const [slotFomo, setSlotFomo] = useState<{
    anyLow: boolean;
    selectedSpots: number | null;
  } | null>(null);

  // Fetch location-specific upsell config from admin settings
  const [upsellConfig, setUpsellConfig] = useState<UpsellConfig | null>(null);
  useEffect(() => {
    if (!locationSlug) return;
    fetch(`/api/settings/upsell?location=${locationSlug}`)
      .then((r) => r.json())
      .then((data) => { if (data) setUpsellConfig(data); })
      .catch(() => {});
  }, [locationSlug]);

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
        let selectedSpots: number | null = null;
        if (selectedSlotId) {
          const sel = list.find((s: { id: string }) => s.id === selectedSlotId);
          selectedSpots = sel ? sel.spotsLeft : null;
        }
        setSlotFomo({ anyLow, selectedSpots });
      })
      .catch(() => {
        if (!cancelled) setSlotFomo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    open,
    locationSlug,
    items.length,
    selectedSlotDate,
    selectedSlotId,
    fulfillmentType,
  ]);

  const subtotal = getTotal();

  // Apply combo deal discount to actual total
  const comboResult = useMemo(() => getActiveComboDeals(items, upsellConfig), [items, upsellConfig]);
  const comboDiscount = comboResult.missingCategories.length === 0 ? comboResult.savings : 0;
  const total = subtotal - comboDiscount;

  const isPhoneValid = PHONE_PATTERN.test(customerPhone.trim());
  const canCheckout =
    customerFirstName.trim().length > 0 &&
    customerLastName.trim().length > 0 &&
    isPhoneValid &&
    selectedSlotId !== null &&
    (fulfillmentType !== "delivery" || deliveryAddress.trim().length > 0);

  // Pre-fill checkout fields from loyalty identity
  useEffect(() => {
    if (loyaltyCustomer) {
      if (!customerFirstName && !customerLastName) {
        if (loyaltyCustomer.lastName) {
          setCustomerFirstName(loyaltyCustomer.name);
          setCustomerLastName(loyaltyCustomer.lastName);
        } else {
          const parts = loyaltyCustomer.name.trim().split(/\s+/);
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

  // Cross-sell suggestions — always have menu items to work with now
  const suggestions = useMemo(
    () => getCartSuggestions(items, resolvedMenuItems, 4, upsellConfig),
    [items, resolvedMenuItems, upsellConfig]
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
        }),
      });

      const data = await res.json();

      if (data.url) {
        // Loyalty auto-enrollment happens server-side via the checkout API
        // (phone number is stored with the order in the database)
        window.location.href = data.url;
      } else if (data.orderId) {
        clearCart();
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
      {/* Items list */}
      <div className="px-5">
        {items.map((item) => (
          <CartItemRow key={item.menuItem.id} item={item} />
        ))}
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

      {/* Combo deal banner */}
      <ComboDealBanner cartItems={items} />

      {/* Cross-sell suggestions */}
      <CartUpsell suggestions={suggestions} />

      {/* Delivery progress bar */}
      <DeliveryProgress cartTotal={total} fulfillmentType={fulfillmentType} />

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
        <div className="px-5">
          <SlotPicker
            locationSlug={locationSlug}
            fulfillmentType={fulfillmentType}
          />
          {slotFomo &&
            (() => {
              const t = selectedSlotTime || "your time";

              if (!selectedSlotId) {
                if (slotFomo.anyLow) {
                  return (
                    <div
                      className="mt-2 flex items-start gap-2.5 rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2.5"
                      role="status"
                    >
                      <AlertCircle
                        className="h-4 w-4 flex-shrink-0 text-amber-700 mt-0.5"
                        aria-hidden
                      />
                      <p className="text-xs font-medium text-amber-950 leading-snug">
                        Some times today are almost full — pick your slot below.
                      </p>
                    </div>
                  );
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

              if (slotFomo.selectedSpots === 1) {
                return (
                  <div
                    className="mt-2 flex items-start gap-2.5 rounded-xl border border-red-200/90 bg-red-50/90 px-3 py-2.5"
                    role="status"
                  >
                    <AlertCircle
                      className="h-4 w-4 flex-shrink-0 text-red-600 mt-0.5"
                      aria-hidden
                    />
                    <p className="text-xs font-semibold text-red-950 leading-snug">
                      Last spot at {t} — checkout soon to secure it.
                    </p>
                  </div>
                );
              }

              if (slotFomo.selectedSpots === 2) {
                return (
                  <div
                    className="mt-2 flex items-start gap-2.5 rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2.5"
                    role="status"
                  >
                    <AlertCircle
                      className="h-4 w-4 flex-shrink-0 text-amber-700 mt-0.5"
                      aria-hidden
                    />
                    <p className="text-xs font-medium text-amber-950 leading-snug">
                      Only 2 spots left at {t}.
                    </p>
                  </div>
                );
              }

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
      <div className="border-t border-gray-100 px-4 py-3 sm:px-5 sm:py-4 space-y-2 bg-gray-50">
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

      {/* Sticky pay bar */}
      <div className="sticky bottom-0 border-t border-gray-100 px-4 py-3 sm:px-5 sm:py-4 bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <div className="space-y-1">
          <div className="flex justify-between items-center text-sm text-italia-gray">
            <span>Subtotal</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          {comboDiscount > 0 && (
            <div className="flex justify-between items-center text-sm font-medium text-italia-green">
              <span>{comboResult.activeDeal?.name} -{comboResult.activeDeal?.discountPercent}%</span>
              <span>-{formatPrice(comboDiscount)}</span>
            </div>
          )}
          {fulfillmentType === "delivery" && (
            <div className="flex justify-between items-center text-sm text-italia-gray">
              <span>Delivery</span>
              <span>{total >= 6000 ? <span className="text-italia-green font-medium">Free</span> : "10,00 PLN"}</span>
            </div>
          )}
          <div className="flex justify-between items-center text-lg font-bold border-t border-gray-100 pt-2">
            <span>Total</span>
            <span className="text-italia-red">{formatPrice(total)}</span>
          </div>
        </div>

        <div className="mt-1.5 flex flex-col gap-1 empty:hidden">
          {selectedSlotTime && (
            <p className="text-xs text-italia-gray text-left">
              {fulfillmentType === "delivery" ? "Delivery" : "Pickup"} at{" "}
              <span className="font-semibold text-italia-dark">{selectedSlotTime}</span>
            </p>
          )}
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
