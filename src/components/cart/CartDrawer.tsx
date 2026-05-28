"use client";

import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { useCartStore } from "@/store/cart";
import { CartItemRow } from "./CartItem";
import { CartUpsell } from "./CartUpsell";
import { DeliveryProgress } from "./DeliveryProgress";
import { LayoutGate } from "@/components/layout/LayoutGate";
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
  Utensils,
  Users,
  Minus,
  Plus,
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
import { fetchPublicSettings } from "@/lib/public-settings";

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
  const partySize = useCartStore((s) => s.partySize);
  const setPartySize = useCartStore((s) => s.setPartySize);

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
  // Sprint 9 #2 — Pret-style "weekly usual" opt-in. Only surfaces when a
  // bundle is applied (otherwise scheduling à-la-carte is awkward).
  // Stored client-side and POSTed after checkout success.
  const [scheduleWeekly, setScheduleWeekly] = useState(false);
  // Fetch location-specific upsell config from admin settings. The drawer
  // is rendered unconditionally by FloatingCartButton so it stays mounted
  // across opens — if we don't aggressively refetch, an admin edit (rename
  // a combo, add required items) never reaches the customer's cart for
  // the rest of the session. Three triggers cover the realistic flows:
  //
  //   1) Drawer transitions to open (admin tweaks config → customer opens
  //      cart afterwards).
  //   2) Tab regains focus (admin tweaks config in one tab while the cart
  //      tab sits open, then switches back to verify).
  //   3) locationSlug changes (customer flips between Kraków / Warszawa).
  //
  // `cache: "no-store"` plus the route's `force-dynamic` + no-store headers
  // make sure neither the browser nor a CDN serves a stale payload.
  const [upsellConfig, setUpsellConfig] = useState<UpsellConfig | null>(null);
  useEffect(() => {
    if (!locationSlug) return;
    let cancelled = false;
    const load = () => {
      fetch(`/api/settings/upsell?location=${locationSlug}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => { if (!cancelled && data) setUpsellConfig(data); })
        .catch(() => {});
    };
    if (open) load();
    const onFocus = () => { if (open) load(); };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [locationSlug, open]);

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
  // Channel-aware: dine-in carts won't see delivery-only combos and vice
  // versa (audit §3 — channel economics).
  const comboResult = useMemo(
    () => getActiveComboDeals(items, upsellConfig, fulfillmentType),
    [items, upsellConfig, fulfillmentType],
  );
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
  // Admin-tunable per-segment thresholds (audit §3) — fetched from the
  // public settings endpoint so the bar reflects whatever the operator
  // last saved in /admin/settings. Falls back to defaults when unset or
  // when the fetch hasn't returned yet.
  const [deliveryThresholdsOverride, setDeliveryThresholdsOverride] = useState<{
    firstTime?: number;
    growing?: number;
    regular?: number;
    vip?: number;
  } | null>(null);
  // Audit §11.1 — per-location regulatory disclosure surfaced in the
  // cart: GST line for SG, FRESH Act packaging text for NYC, PDPA §13
  // consent dialog gating the customer's phone collection.
  const [compliance, setCompliance] = useState<{
    zone: "EU" | "NYC" | "SG";
    gstRegistered?: boolean;
    gstRateBps?: number;
    gstNumber?: string | null;
    packagingDisclosure?: string | null;
    pdpaConsentText?: string | null;
  } | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchPublicSettings(locationSlug).then((data) => {
      if (cancelled || !data) return;
      const t = data.deliveryThresholds;
      if (t && typeof t === "object") setDeliveryThresholdsOverride(t);
      if (data.compliance && typeof data.compliance === "object") {
        setCompliance(data.compliance);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, locationSlug]);

  // GST line surfaces only when the truck is SG GST-registered. We compute
  // the GST owed as a back-out from the inclusive total (IRAS practice for
  // GST-inclusive pricing in F&B). 9% inclusive → GST = total × 9/109.
  const gstRateBps = compliance?.gstRegistered ? compliance.gstRateBps ?? 900 : 0;
  const gstAmount = gstRateBps > 0
    ? Math.round((subtotal * gstRateBps) / (10_000 + gstRateBps))
    : 0;
  const deliveryThreshold = getDeliveryThresholdForCustomer(
    deliverySegment,
    deliveryThresholdsOverride,
  );
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
    (fulfillmentType !== "delivery" || deliveryAddress.trim().length > 0) &&
    (fulfillmentType !== "dine-in" || partySize >= 1);

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
          partySize: fulfillmentType === "dine-in" ? partySize : undefined,
          customerEmail: customerEmail.trim() || undefined,
          specialInstructions: specialInstructions.trim() || undefined,
          tipAmount: tipAmount > 0 ? tipAmount : undefined,
          appliedBundleId: appliedBundleId || undefined,
          appliedBundlePriceGrosze: appliedBundleId && bundlePriceGrosze > 0 ? bundlePriceGrosze : undefined,
        }),
      });

      const data = await res.json();

      // Sprint 9 #2 — capture weekly-usual intent fire-and-forget once
      // the checkout request has returned a Stripe URL or orderId.
      // We do this BEFORE redirect so the intent persists even if the
      // customer leaves the success page.
      if (scheduleWeekly && isBundleActive && appliedBundleId && (data.url || data.orderId)) {
        const phoneE164 = `+48${customerPhone.trim()}`;
        const weekdayNames = [
          "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
        ];
        const weekday = weekdayNames[new Date().getDay()];
        const readyAt = (selectedSlotTime || "12:00").slice(0, 5);
        // Resolve bundle name from the upsell config (defaults are fine if
        // missing — server validation only requires the id + a label).
        const bundleName = appliedBundleId.replace(/-/g, " ");
        const cartSnapshot = items.map((i) => ({
          menuItemId: i.menuItem.id,
          quantity: i.quantity,
        }));
        try {
          void fetch("/api/customer/schedule-bundle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customerPhone: phoneE164,
              locationSlug,
              bundleId: appliedBundleId,
              bundleName,
              weekday,
              readyAt,
              cartSnapshot,
            }),
            keepalive: true,
          });
        } catch {
          // Best-effort; intent capture failure shouldn't block checkout.
        }
      }

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
        configExperiment={
          (upsellConfig as { experiment?: import("@/lib/experiments").Experiment | null } | null)?.experiment ?? null
        }
        fulfillmentType={fulfillmentType}
        activeComboSavings={comboResult.isComplete ? comboResult.savings : 0}
        activeComboName={comboResult.isComplete ? comboResult.activeDeal?.name ?? null : null}
      />

      {/* Combo deal banner — suppressed only when a bundle is actually
          LOCKED into the cart. The previous gate (hide whenever the
          bundle ladder was merely showable) was too aggressive: a
          customer who locked Make-it-a-Lunch and then removed the
          dessert would see neither the bundle savings nor the smaller
          pasta-combo fallback, so the cart silently dropped both
          discounts. With no bundle applied, both promos can coexist —
          the bundle card pitches the bigger save, the combo banner
          delivers the smaller one on what's already in the cart. When
          a bundle IS locked, `comboDiscount` is already zeroed above,
          so showing the banner would be misleading. */}
      {!isBundleActive && (
        <ComboDealBanner
          cartItems={items}
          fulfillmentType={fulfillmentType}
          allMenuItems={resolvedMenuItems}
          locationSlug={locationSlug}
          upsellConfig={upsellConfig}
        />
      )}

      {/* Cross-sell suggestions */}
      <LayoutGate flag="showCartUpsell">
        <CartUpsell suggestions={suggestions} />
      </LayoutGate>

      {/* Delivery progress bar */}
      {/* Per-segment threshold (audit §2.5 Uber Eats): first-timers see 39 PLN,
          regulars 60 PLN, Gold/Platinum 0 (already free). */}
      <LayoutGate flag="showDeliveryProgress">
        <DeliveryProgress
          cartTotal={total}
          fulfillmentType={fulfillmentType}
          thresholdGrosze={deliveryThreshold}
          isPersonalised={isDeliveryPersonalised}
        />
      </LayoutGate>

      {/* Fulfillment type selector */}
      <div className="px-5 mt-4 mb-3">
        <p className="text-xs font-semibold text-italia-gray uppercase tracking-wide mb-2">
          How would you like your order?
        </p>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setFulfillmentType("takeout")}
            className={`flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
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
            className={`flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
              fulfillmentType === "delivery"
                ? "border-italia-red bg-italia-red/5 text-italia-red"
                : "border-gray-200 text-italia-gray hover:border-gray-300"
            }`}
          >
            <Truck className="h-4 w-4" />
            Delivery
          </button>
          <button
            onClick={() => setFulfillmentType("dine-in")}
            className={`flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
              fulfillmentType === "dine-in"
                ? "border-italia-gold bg-italia-gold/5 text-italia-gold-dark"
                : "border-gray-200 text-italia-gray hover:border-gray-300"
            }`}
          >
            <Utensils className="h-4 w-4" />
            Dine-in
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

      {/* Dine-in reservation — reserve a table and pre-choose the food.
           The time slot picker below doubles as the booking time. */}
      {fulfillmentType === "dine-in" && (
        <div className="px-5 mb-3">
          <div className="flex items-start gap-2.5 rounded-xl border border-italia-gold/25 bg-italia-gold/5 px-3 py-2.5">
            <Utensils className="h-4 w-4 flex-shrink-0 text-italia-gold-dark mt-0.5" aria-hidden />
            <p className="text-[11px] leading-relaxed text-italia-dark">
              <span className="font-semibold">Reserve your table.</span>{" "}
              Pick how many are coming and a time below — your food is prepared
              for when you sit down.
            </p>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <label htmlFor="checkout-party-size" className="flex items-center gap-1.5 text-sm font-medium text-italia-dark">
              <Users className="h-4 w-4 text-italia-gray" />
              Party size
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPartySize(partySize - 1)}
                disabled={partySize <= 1}
                aria-label="Fewer guests"
                className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 text-italia-dark disabled:opacity-40 hover:border-gray-300 active:scale-95 transition"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span
                id="checkout-party-size"
                className="min-w-[2ch] text-center text-base font-bold text-italia-dark tabular-nums"
                aria-live="polite"
              >
                {partySize}
              </span>
              <button
                type="button"
                onClick={() => setPartySize(partySize + 1)}
                disabled={partySize >= 50}
                aria-label="More guests"
                className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 text-italia-dark disabled:opacity-40 hover:border-gray-300 active:scale-95 transition"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
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
                        {fulfillmentType === "dine-in"
                          ? "Pick your table time"
                          : fulfillmentType === "delivery"
                            ? "Pick your delivery time"
                            : "Pick your pickup time"}
                      </p>
                      <p className="text-[11px] text-italia-gray mt-1 leading-relaxed">
                        Popular times fill up fast — choose yours below.
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
                      {fulfillmentType === "dine-in"
                        ? "Complete checkout to confirm your table."
                        : fulfillmentType === "delivery"
                          ? "Complete checkout to confirm your delivery window."
                          : "Complete checkout to confirm your pickup window."}
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
          {gstAmount > 0 && (
            <div className="flex justify-between items-center text-xs text-italia-gray">
              <span>
                of which GST{compliance?.gstNumber ? ` (${compliance.gstNumber})` : ""} @{" "}
                {(gstRateBps / 100).toFixed(gstRateBps % 100 === 0 ? 0 : 1)}%
              </span>
              <span>{formatPrice(gstAmount)}</span>
            </div>
          )}
          <div className="flex justify-between items-center text-lg font-bold border-t border-gray-100 pt-2">
            <span>Total</span>
            <span className="text-italia-red">{formatPrice(total)}</span>
          </div>
        </div>

        {compliance?.zone === "NYC" && compliance.packagingDisclosure && (
          <p className="mt-2 text-[10px] leading-relaxed text-italia-gray border-t border-gray-100 pt-2">
            <span className="font-semibold">Packaging:</span>{" "}
            {compliance.packagingDisclosure}
          </p>
        )}

        {compliance?.zone === "SG" && compliance.pdpaConsentText && (
          <p className="mt-2 text-[10px] leading-relaxed text-italia-gray border-t border-gray-100 pt-2">
            <span className="font-semibold">PDPA §13 consent:</span>{" "}
            {compliance.pdpaConsentText} By placing this order you confirm
            you have read this notice.
          </p>
        )}

        <div className="mt-1.5 flex flex-col gap-1 empty:hidden">
          <LoyaltyEarnPreview cartTotal={total} />
        </div>

        {/* Sprint 9 #2 — weekly-usual opt-in. Only when a bundle is
            applied so the scheduled meal has a clear composition. */}
        {isBundleActive && (
          <label className="mt-2 flex items-center gap-2 text-xs text-italia-gray cursor-pointer select-none">
            <input
              type="checkbox"
              checked={scheduleWeekly}
              onChange={(e) => setScheduleWeekly(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span>
              🗓️ Make this my <span className="font-semibold">weekly usual</span>
              {" "}— same order, same time, every week
            </span>
          </label>
        )}

        {checkoutError && (
          <div className="mt-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700 flex items-start gap-2">
            <span className="text-red-500 mt-0.5 flex-shrink-0">!</span>
            <div>
              <p>{checkoutError}</p>
              <button onClick={() => setCheckoutError(null)} className="text-xs text-red-500 underline mt-1">Dismiss</button>
            </div>
          </div>
        )}

        <div className="mt-3 flex items-stretch gap-2">
          <Button
            onClick={() => { setCheckoutError(null); handleCheckout(); }}
            disabled={isSubmitting || !canCheckout}
            className="flex-1 min-h-[48px]"
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
            onClick={() => {
              if (window.confirm("Clear your cart?")) clearCart();
            }}
            aria-label="Clear cart"
            title="Clear cart"
            className="flex-shrink-0 w-12 min-h-[48px] flex items-center justify-center rounded-xl border border-gray-200 text-italia-gray hover:text-italia-red hover:border-italia-red/40 active:scale-[0.97] transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
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
    <div className="px-5 pt-3 pb-4">
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
