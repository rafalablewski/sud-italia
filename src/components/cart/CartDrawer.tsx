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
import { ShoppingCart, Trash2, Package, Truck, Star } from "lucide-react";
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

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phoneError, setPhoneError] = useState(false);

  // Fetch location-specific upsell config from admin settings
  const [upsellConfig, setUpsellConfig] = useState<UpsellConfig | null>(null);
  useEffect(() => {
    if (!locationSlug) return;
    fetch(`/api/settings/upsell?location=${locationSlug}`)
      .then((r) => r.json())
      .then((data) => { if (data) setUpsellConfig(data); })
      .catch(() => {});
  }, [locationSlug]);

  const subtotal = getTotal();

  // Apply combo deal discount to actual total
  const comboResult = useMemo(() => getActiveComboDeals(items, upsellConfig), [items, upsellConfig]);
  const comboDiscount = comboResult.missingCategories.length === 0 ? comboResult.savings : 0;
  const total = subtotal - comboDiscount;

  const isPhoneValid = PHONE_PATTERN.test(customerPhone.trim());
  const canCheckout =
    customerName.trim().length > 0 &&
    isPhoneValid &&
    selectedSlotId !== null &&
    (fulfillmentType !== "delivery" || deliveryAddress.trim().length > 0);

  // Pre-fill checkout fields from loyalty identity
  useEffect(() => {
    if (loyaltyCustomer) {
      if (!customerName) setCustomerName(loyaltyCustomer.name);
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
    if (!customerName.trim()) return;
    if (!isPhoneValid) {
      setPhoneError(true);
      return;
    }

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
          customerName: customerName.trim(),
          customerPhone: `+48${customerPhone.trim()}`,
          fulfillmentType,
          slotId: selectedSlotId,
          slotDate: selectedSlotDate,
          slotTime: selectedSlotTime,
          deliveryAddress: fulfillmentType === "delivery" ? deliveryAddress.trim() : undefined,
          customerEmail: customerEmail.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (data.url) {
        // Loyalty auto-enrollment happens server-side via the checkout API
        // (phone number is stored with the order in the database)
        window.location.href = data.url;
      } else if (data.orderId) {
        clearCart();
        setCustomerName("");
        setCustomerPhone("");
        onClose();
        window.location.href = `/order-confirmation?orderId=${data.orderId}&location=${locationSlug}`;
      } else {
        alert(data.error || "Something went wrong");
      }
    } catch (error) {
      console.error("Checkout failed:", error);
      alert("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <Sheet open={open} onClose={onClose} title="Your Order">
        <div className="flex flex-col items-center justify-center py-20 text-italia-gray">
          <ShoppingCart className="h-12 w-12 mb-4 opacity-30" />
          <p className="font-medium text-lg">Your cart is empty</p>
          <p className="text-sm mt-1">Add items from the menu to get started</p>
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
            <p className="text-xs text-italia-gray">
              <span className="font-medium text-italia-dark">Sign in to earn points</span> on this order
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

      {/* Delivery address */}
      {fulfillmentType === "delivery" && (
        <div className="px-5 mb-3">
          <input
            type="text"
            placeholder="Delivery address"
            value={deliveryAddress}
            onChange={(e) => setDeliveryAddress(e.target.value)}
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
        </div>
      )}

      {/* Checkout footer */}
      <div className="border-t border-gray-100 p-5 space-y-3 bg-gray-50 mt-2">
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Your name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="pub-input min-h-[44px] text-base"
          />
          <div className="flex items-center gap-0">
            <span className="inline-flex items-center px-3 min-h-[44px] rounded-l-[0.75rem] border-y-[1.5px] border-l-[1.5px] border-r-0 border-[#e5e7eb] bg-gray-50 text-sm font-medium text-italia-gray select-none">
              +48
            </span>
            <input
              type="tel"
              placeholder="Phone number"
              value={customerPhone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              className={`pub-input min-h-[44px] text-base rounded-l-none ${
                phoneError ? "border-italia-red" : ""
              }`}
            />
          </div>
          {/* Optional email — subtle, not required */}
          <input
            type="email"
            placeholder="Email for exclusive discounts & offers (optional)"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            className="pub-input min-h-[44px] text-sm text-italia-gray"
          />
        </div>
        {phoneError && (
          <p className="text-xs text-italia-red">
            Please enter a valid phone number
          </p>
        )}

        {comboDiscount > 0 && (
          <div className="space-y-1 pt-1">
            <div className="flex justify-between items-center text-sm text-italia-gray">
              <span>Subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center text-sm text-italia-green font-medium">
              <span>Meal Deal -{comboResult.activeDeal?.discountPercent}%</span>
              <span>-{formatPrice(comboDiscount)}</span>
            </div>
          </div>
        )}
        <div className="flex justify-between items-center text-lg font-bold pt-1">
          <span>Total</span>
          <span className="text-italia-red">{formatPrice(total)}</span>
        </div>

        {selectedSlotTime && (
          <p className="text-xs text-italia-gray text-center">
            {fulfillmentType === "delivery" ? "Delivery" : "Pickup"} at{" "}
            <span className="font-semibold text-italia-dark">{selectedSlotTime}</span>
          </p>
        )}

        {/* Loyalty points preview — shows what they'll earn */}
        <LoyaltyEarnPreview cartTotal={total} />

        <Button
          onClick={handleCheckout}
          disabled={isSubmitting || !canCheckout}
          className="w-full min-h-[52px]"
          size="lg"
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
          onClick={() => clearCart()}
          className="w-full flex items-center justify-center gap-2 text-sm py-2 min-h-[44px] text-italia-gray hover:text-italia-red active:text-italia-red transition-colors"
        >
          <Trash2 className="h-4 w-4" />
          Clear cart
        </button>
      </div>
    </Sheet>
  );
}
