"use client";

import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { useCartStore } from "@/store/cart";
import { CartItemRow } from "./CartItem";
import { formatPrice } from "@/lib/utils";
import { ShoppingCart, Trash2, Package, Truck } from "lucide-react";
import { useState } from "react";
import { SlotPicker } from "./SlotPicker";

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
}

const PHONE_PATTERN = /^[+]?[\d\s\-()]{7,}$/;

export function CartDrawer({ open, onClose }: CartDrawerProps) {
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

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phoneError, setPhoneError] = useState(false);

  const total = getTotal();
  const isPhoneValid = PHONE_PATTERN.test(customerPhone.trim());
  const canCheckout =
    customerName.trim().length > 0 &&
    isPhoneValid &&
    selectedSlotId !== null &&
    (fulfillmentType !== "delivery" || deliveryAddress.trim().length > 0);

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
          customerPhone: customerPhone.trim(),
          fulfillmentType,
          slotId: selectedSlotId,
          slotDate: selectedSlotDate,
          slotTime: selectedSlotTime,
          deliveryAddress: fulfillmentType === "delivery" ? deliveryAddress.trim() : undefined,
        }),
      });

      const data = await res.json();

      if (data.url) {
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

  return (
    <Sheet open={open} onClose={onClose} title="Your Order">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-italia-gray">
          <ShoppingCart className="h-12 w-12 mb-4 opacity-30" />
          <p className="font-medium text-lg">Your cart is empty</p>
          <p className="text-sm mt-1">Add items from the menu to get started</p>
        </div>
      ) : (
        <div>
          {/* Items list */}
          <div className="px-5">
            {items.map((item) => (
              <CartItemRow key={item.menuItem.id} item={item} />
            ))}
          </div>

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
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Your name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="flex-1 pub-input min-h-[44px] text-base"
              />
              <input
                type="tel"
                placeholder="Phone"
                value={customerPhone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                className={`w-[130px] pub-input min-h-[44px] text-base ${
                  phoneError ? "border-italia-red" : "border-gray-200"
                }`}
              />
            </div>
            {phoneError && (
              <p className="text-xs text-italia-red">
                Please enter a valid phone number
              </p>
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
        </div>
      )}
    </Sheet>
  );
}
