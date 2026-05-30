"use client";

import { useCartStore, cartLineKey } from "@/store/cart";
import { useCartUIStore } from "@/store/cart-ui";
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
import { formatSlotDate } from "@/lib/format";
import { estimatePrepMinutes } from "@/lib/eta";
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
import { Star, Clock, Check, Trash2 } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { SlotPicker } from "./SlotPicker";
import { getMenu } from "@/data/menus/seed";
import { useCustomer } from "@/store/customer";
import { postCartPresenceToServer } from "@/lib/cart-presence-post-client";
import { useLiveMenuAvailability } from "@/lib/useLiveMenuAvailability";
import { fetchPublicSettings, type PublicLoyaltySettings } from "@/lib/public-settings";

const PHONE_PATTERN = /^[\d\s\-()]{7,}$/;

/**
 * V8 cart drawer. Mounted exactly once at `(public)/layout.tsx`. Open
 * state and the active location's menu items both flow through
 * `useCartUIStore` so any trigger (top-nav CartButton, mobile
 * FloatingCartButton, AbandonedCartBanner, future surfaces) can open
 * the drawer without minting a sibling instance.
 */
export function CartDrawer() {
  const open = useCartUIStore((s) => s.drawerOpen);
  const setDrawerOpen = useCartUIStore((s) => s.setDrawerOpen);
  const allMenuItems = useCartUIStore((s) => s.menuItems);
  const onClose = () => setDrawerOpen(false);

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

  // Portal mount + body scroll lock. The mockup also adds .cart-open on
  // <body> so the floating cart pill / nav fade away when the sheet is
  // up — FloatingCartButton and Header read that class. CartDrawer keeps
  // the .v8-cart-open mirror so any future surface (toast, scroll-lock
  // observers) can key off the same signal.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (open) {
      document.body.classList.add("v8-cart-open");
      document.body.style.overflow = "hidden";
    } else {
      document.body.classList.remove("v8-cart-open");
      document.body.style.overflow = "";
    }
    return () => {
      document.body.classList.remove("v8-cart-open");
      document.body.style.overflow = "";
    };
  }, [open]);

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
  // Loyalty programme config (tier ladder) — populated from the same
  // fetchPublicSettings call as deliveryThresholds + compliance below.
  // Until it lands, the delivery segment falls back to null so the bar
  // uses the default threshold instead of guessing a tier.
  const [publicLoyalty, setPublicLoyalty] = useState<PublicLoyaltySettings | null>(null);
  /** Operator-managed flat delivery fee (grosze) from public settings.
   *  Falls back to the code-side seed in computeDeliveryFee until the
   *  fetch resolves. */
  const [publicDeliveryFee, setPublicDeliveryFee] = useState<number | undefined>(undefined);
  const deliverySegment = loyaltyCustomer && publicLoyalty
    ? {
        ordersCount: loyaltyCustomer.ordersCount,
        tier: calculateTier(loyaltyCustomer.points, publicLoyalty.tiers),
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
      if (data.loyalty) setPublicLoyalty(data.loyalty);
      if (typeof data.deliveryFee === "number") setPublicDeliveryFee(data.deliveryFee);
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
    publicDeliveryFee,
  );
  const total = subtotal - comboDiscount + deliveryFee + tipAmount;

  // Pre-pay "Ready by" quote (audit §11.2 — ETA before pay, not only after).
  // When the customer has picked a slot, that slot time IS the kitchen's
  // promised-ready (mirrors store.computePromisedReadyAt for slot orders), so
  // we surface it verbatim. Before a slot is picked we fall back to the shared
  // prep estimate so an ETA is visible from the moment there's a cart.
  const prepMinutes = useMemo(() => estimatePrepMinutes(items), [items]);
  const readyByLabel = useMemo<string | null>(() => {
    if (items.length === 0) return null;
    if (selectedSlotTime) {
      const time = selectedSlotTime.slice(0, 5);
      const today = new Date().toISOString().split("T")[0];
      if (selectedSlotDate && selectedSlotDate !== today) {
        return `${formatSlotDate(selectedSlotDate)} · ${time}`;
      }
      return time;
    }
    return null;
  }, [items.length, selectedSlotTime, selectedSlotDate]);

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

  // Resolve menu items — use prop if available, otherwise fall back to
  // the seed catalogue for the cart's location. A new active truck is
  // picked up automatically via getMenu(slug) instead of a hardcoded
  // {krakow, warszawa} map.
  const resolvedMenuItems = useMemo(() => {
    if (allMenuItems.length > 0) return allMenuItems;
    return locationSlug ? getMenu(locationSlug) : [];
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
            // Server re-validates these ids against the live menu before pricing
            // (createOrder) — a forged option can't lower the price or skip KDS.
            selectedModifiers: i.selectedModifiers,
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

  if (!mounted) return null;

  return createPortal(
    <>
      <div
        className={`v8-cart-overlay${open ? " is-open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`v8-cart-sheet${open ? " is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Your order"
        aria-hidden={!open}
      >
        <div className="v8-cart-grip" aria-hidden="true" />

        <header className="v8-cart-top">
          <div className="v8-cart-top-row">
            <div className="v8-cart-top-title">
              <BasilSprig />
              <div>
                <h2>Your order</h2>
                <div className="v8-cart-top-sub">— il tuo ordine</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="v8-cart-close"
              aria-label="Close cart"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M2 2 L12 12 M12 2 L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </header>

        <div className="v8-cart-tricolore" aria-hidden="true" />

        <div className="v8-cart-scroll">
          {items.length === 0 ? (
            <div className="v8-cart-empty">
              <div className="v8-cart-empty-illus" aria-hidden="true">
                <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                  <path d="M11 22 C 11 32, 16 37, 22 37 C 28 37, 33 32, 33 22 C 33 17, 30 14, 22 14 C 14 14, 11 17, 11 22 Z"
                        fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M22 14 L22 9" stroke="#4A7C59" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M22 12 C 19 10, 17 9, 15 9 C 16 12, 18 13, 22 14" stroke="#4A7C59" strokeWidth="1.5" fill="#4A7C59" fillOpacity="0.2" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="v8-cart-empty-title">Your table is set</div>
              <div className="v8-cart-empty-sub">
                Browse the menu — every dish ferments overnight and is baked the moment you order.
              </div>
              <button type="button" onClick={onClose} className="v8-cart-empty-cta">
                Browse menu <span className="it" style={{ marginLeft: 6, fontStyle: "italic", fontWeight: 500, opacity: 0.9 }}>· il menù</span>
              </button>
            </div>
          ) : (
            <>
              {unavailableItems.length > 0 && (
                <div className="v8-cart-soldout" role="alert">
                  <div aria-hidden="true" style={{ marginTop: 1 }}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M10 6 L10 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      <circle cx="10" cy="14" r="0.9" fill="currentColor" />
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="v8-cart-soldout-title">
                      {unavailableItems.length === 1
                        ? <><em className="it">{unavailableItems[0].menuItem.name}</em> — sold out <span style={{ opacity: 0.7 }}>· esaurita</span></>
                        : <>{unavailableItems.length} items just sold out <span style={{ opacity: 0.7 }}>· esauriti</span></>}
                    </div>
                    <div className="v8-cart-soldout-sub">
                      Remove {unavailableItems.length === 1 ? "it" : "them"} below to continue.
                    </div>
                  </div>
                </div>
              )}

              {/* Audit §3.4 — Sud Italia Corporate. Surfaces above everything so
                  the customer sees who's paying before they scan their cart. */}
              <CorporateOrderBanner />

              {/* Time-of-day banner (audit §2.3) — picks one variant by local hour. */}
              <TodBanner allMenuItems={allMenuItems} upsellConfig={upsellConfig} />

              {/* Items list */}
              <div className="v8-cart-section" style={{ paddingTop: 22, paddingBottom: 0 }}>
                <div className="v8-cart-section-title">
                  The table <span style={{ fontStyle: "italic", color: "var(--color-muted)", letterSpacing: 0, textTransform: "none", fontWeight: 400, fontSize: 12 }}>· il tavolo</span>
                </div>
              </div>
              <div className="v8-cart-items">
                {items.map((item) => {
                  const soldOut = liveAvailability[item.menuItem.id] === false;
                  return (
                    <CartItemRow
                      key={cartLineKey(item)}
                      item={item}
                      soldOut={soldOut}
                    />
                  );
                })}
              </div>

              {/* Loyalty status — earn chip when known, sign-in invite when not. */}
              {loyaltyCustomer ? (
                <div className="v8-cart-loyalty">
                  <span className="v8-cart-loyalty-icon" aria-hidden="true">
                    <Star className="h-4 w-4" fill="currentColor" />
                  </span>
                  <div className="v8-cart-loyalty-body">
                    Earning points as{" "}
                    <span className="v8-cart-loyalty-name">{loyaltyCustomer.name.split(" ")[0]}</span>
                    <span className="v8-cart-loyalty-pts">{loyaltyCustomer.points} pts</span>
                  </div>
                </div>
              ) : (
                <a href="/rewards" className="v8-cart-loyalty is-invite">
                  <span className="v8-cart-loyalty-icon" aria-hidden="true">
                    <Star className="h-4 w-4" />
                  </span>
                  <div className="v8-cart-loyalty-body">
                    <span className="v8-cart-loyalty-name">Soci e amici.</span>{" "}
                    Points follow the phone you enter below — tap to sign in.
                  </div>
                </a>
              )}

              {/* Gold/Platinum perk banner (audit §2.2 row 6). */}
              <TierPerkBanner allMenuItems={allMenuItems} />

              {/* Bundle ladder (audit §3.2). */}
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

              {/* Combo deal banner — see prior comment for the bundle-active gate. */}
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

              {/* Delivery progress bar — per-segment threshold (audit §2.5). */}
              <LayoutGate flag="showDeliveryProgress">
                <DeliveryProgress
                  cartTotal={total}
                  fulfillmentType={fulfillmentType}
                  thresholdGrosze={deliveryThreshold}
                  isPersonalised={isDeliveryPersonalised}
                />
              </LayoutGate>

              {/* Fulfillment type selector */}
              <div className="v8-cart-section" style={{ paddingBottom: 0 }}>
                <div className="v8-cart-section-title">
                  How <span style={{ fontStyle: "italic", color: "var(--color-muted)", letterSpacing: 0, textTransform: "none", fontWeight: 400, fontSize: 12 }}>· come lo vuoi</span>
                </div>
              </div>
              <div className="v8-cart-fulfill" role="radiogroup" aria-label="Fulfillment type">
                <button
                  type="button"
                  role="radio"
                  aria-checked={fulfillmentType === "takeout"}
                  onClick={() => setFulfillmentType("takeout")}
                  className={`v8-cart-fulfill-btn${fulfillmentType === "takeout" ? " is-on" : ""}`}
                >
                  <span>Takeaway</span>
                  <span className="v8-cart-fulfill-it">· asporto</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={fulfillmentType === "delivery"}
                  onClick={() => setFulfillmentType("delivery")}
                  className={`v8-cart-fulfill-btn${fulfillmentType === "delivery" ? " is-on" : ""}`}
                >
                  <span>Delivery</span>
                  <span className="v8-cart-fulfill-it">· consegna</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={fulfillmentType === "dine-in"}
                  onClick={() => setFulfillmentType("dine-in")}
                  className={`v8-cart-fulfill-btn${fulfillmentType === "dine-in" ? " is-on" : ""}`}
                >
                  <span>Dine-in</span>
                  <span className="v8-cart-fulfill-it">· a tavola</span>
                </button>
              </div>

              {/* Delivery address */}
              {fulfillmentType === "delivery" && (
                <div className="v8-cart-field">
                  <label className="v8-cart-field-label" htmlFor="checkout-address">
                    Address <span className="v8-cart-field-label-aside">· indirizzo</span>
                  </label>
                  <input
                    id="checkout-address"
                    type="text"
                    placeholder="Where shall we send it?"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    autoComplete="street-address"
                    className="v8-cart-input"
                  />
                </div>
              )}

              {/* Dine-in reservation — party size + table-time copy. */}
              {fulfillmentType === "dine-in" && (
                <div className="v8-cart-party">
                  <div className="v8-cart-party-head">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden style={{ flexShrink: 0 }}>
                      <circle cx="9" cy="6" r="3" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M3 16 C 3 12.5, 5.5 11, 9 11 C 12.5 11, 15 12.5, 15 16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                    <span>
                      <strong style={{ fontWeight: 600, fontStyle: "normal", color: "var(--color-espresso)" }}>Reserve your table.</strong>{" "}
                      Pick how many are coming and a time below — your food is prepared for when you sit down.
                    </span>
                  </div>
                  <div className="v8-cart-party-row">
                    <span className="v8-cart-party-label">
                      Party size <span style={{ fontFamily: "var(--font-body)", fontStyle: "italic", fontSize: 12.5, color: "var(--color-muted)", marginLeft: 4 }}>· il tavolo</span>
                    </span>
                    <div className="v8-cart-party-stepper">
                      <button
                        type="button"
                        onClick={() => setPartySize(partySize - 1)}
                        disabled={partySize <= 1}
                        aria-label="Fewer guests"
                        className="v8-cart-party-btn"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7 L11 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                      </button>
                      <span className="v8-cart-party-count" aria-live="polite">{partySize}</span>
                      <button
                        type="button"
                        onClick={() => setPartySize(partySize + 1)}
                        disabled={partySize >= 50}
                        aria-label="More guests"
                        className="v8-cart-party-btn"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7 L11 7 M7 3 L7 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Time slot picker */}
              {locationSlug && (
                <>
                  <div className="v8-cart-section" style={{ paddingBottom: 0 }}>
                    <div className="v8-cart-section-title">
                      Time <span style={{ fontStyle: "italic", color: "var(--color-muted)", letterSpacing: 0, textTransform: "none", fontWeight: 400, fontSize: 12 }}>· a che ora</span>
                    </div>
                  </div>
                  <div style={{ padding: "0 20px" }}>
                    <SlotPicker
                      locationSlug={locationSlug}
                      fulfillmentType={fulfillmentType}
                    />
                    {slotFomo &&
                      (() => {
                        if (!selectedSlotId) {
                          if (slotFomo.anyLow) return null;
                          return (
                            <div className="v8-cart-party" style={{ marginTop: 10, background: "rgba(140,111,79,0.06)", borderColor: "var(--color-line)" }} role="status">
                              <div className="v8-cart-party-head" style={{ alignItems: "flex-start" }}>
                                <Clock className="h-4 w-4" style={{ flexShrink: 0, color: "var(--color-terracotta)", marginTop: 2 }} aria-hidden />
                                <span>
                                  <strong style={{ fontWeight: 600, fontStyle: "normal", color: "var(--color-espresso)" }}>
                                    {fulfillmentType === "dine-in"
                                      ? "Pick your table time"
                                      : fulfillmentType === "delivery"
                                        ? "Pick your delivery time"
                                        : "Pick your pickup time"}
                                  </strong>
                                  <span style={{ display: "block", marginTop: 2 }}>Popular times fill up fast — choose yours below.</span>
                                </span>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div className="v8-cart-party" style={{ marginTop: 10, background: "rgba(74,124,89,0.08)", borderColor: "rgba(74,124,89,0.35)" }} role="status">
                            <div className="v8-cart-party-head" style={{ alignItems: "flex-start", color: "var(--color-basil-deep)" }}>
                              <Check className="h-4 w-4" style={{ flexShrink: 0, color: "var(--color-basil-deep)", marginTop: 2 }} aria-hidden />
                              <span>
                                <strong style={{ fontWeight: 600, fontStyle: "normal", color: "var(--color-espresso)" }}>Time selected.</strong>{" "}
                                {fulfillmentType === "dine-in"
                                  ? "Complete checkout to confirm your table."
                                  : fulfillmentType === "delivery"
                                    ? "Complete checkout to confirm your delivery window."
                                    : "Complete checkout to confirm your pickup window."}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                  </div>
                </>
              )}

              {/* Customer details section */}
              <div className="v8-cart-section" style={{ paddingBottom: 0, paddingTop: 22 }}>
                <div className="v8-cart-section-title">
                  Your details <span style={{ fontStyle: "italic", color: "var(--color-muted)", letterSpacing: 0, textTransform: "none", fontWeight: 400, fontSize: 12 }}>· i tuoi dati</span>
                </div>
              </div>

              <div className="v8-cart-field">
                <label className="v8-cart-field-label" htmlFor="checkout-first-name">
                  Name <span className="v8-cart-field-label-aside">· nome</span>
                </label>
                <div className="v8-cart-name-grid">
                  <input
                    id="checkout-first-name"
                    type="text"
                    placeholder="First name"
                    value={customerFirstName}
                    onChange={(e) => setCustomerFirstName(e.target.value)}
                    className="v8-cart-input"
                    autoComplete="given-name"
                  />
                  <input
                    type="text"
                    placeholder="Last name"
                    value={customerLastName}
                    onChange={(e) => setCustomerLastName(e.target.value)}
                    className="v8-cart-input"
                    autoComplete="family-name"
                    aria-label="Last name"
                  />
                </div>
              </div>

              <div className="v8-cart-field">
                <label className="v8-cart-field-label" htmlFor="checkout-phone">
                  Phone <span className="v8-cart-field-label-aside">· cellulare</span>
                </label>
                <div className="v8-cart-phone">
                  <span className="v8-cart-phone-prefix" aria-hidden="true">+48</span>
                  <input
                    id="checkout-phone"
                    type="tel"
                    placeholder="512 ··· ···"
                    value={customerPhone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    autoComplete="tel"
                    className={`v8-cart-input${phoneError ? " is-error" : ""}`}
                  />
                </div>
                {phoneError && (
                  <div className="v8-cart-field-error">Please enter a valid phone number.</div>
                )}
              </div>

              <div className="v8-cart-field">
                <label className="v8-cart-field-label" htmlFor="checkout-email">
                  Email <span className="v8-cart-field-label-aside">(optional, for the receipt)</span>
                </label>
                <input
                  id="checkout-email"
                  type="email"
                  placeholder="ale@esempio.it"
                  autoComplete="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="v8-cart-input"
                />
              </div>

              <div className="v8-cart-field">
                <label className="v8-cart-field-label" htmlFor="checkout-notes">
                  Notes for the kitchen <span className="v8-cart-field-label-aside">· nota per la cucina</span>
                </label>
                <textarea
                  id="checkout-notes"
                  placeholder="Allergies, doorbell code, anything we should know"
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  rows={2}
                  className="v8-cart-textarea"
                />
              </div>

              {/* Tip picker */}
              <TipPicker
                subtotalGrosze={subtotal - comboDiscount}
                valueGrosze={tipAmount}
                onChange={setTipAmount}
              />

              <div className="v8-cart-foot">
                <em>&ldquo;Mangia bene, ridi spesso, ama molto.&rdquo;</em>
                <small>Sud Italia · Kraków · Warszawa</small>
              </div>

              {/* Sticky pay bar */}
              <div className="v8-cart-paybar">
                <div className="v8-cart-paybar-tricolore" aria-hidden="true" />
                <div className="v8-cart-paybar-inner">
                  <div className="v8-cart-totals">
                    <div className="v8-cart-totals-row">
                      <span className="v8-cart-totals-label">
                        Subtotal <span style={{ fontStyle: "italic", color: "var(--color-muted)" }}>· subtotale</span>
                        {isBundleActive && (
                          <span style={{ marginLeft: 6, fontFamily: "var(--font-heading)", fontStyle: "italic", color: "var(--color-basil-deep)", fontSize: 12 }}>
                            · bundle locked
                          </span>
                        )}
                      </span>
                      <span className="v8-cart-totals-val">{formatPrice(subtotal)}</span>
                    </div>
                    {comboDiscount > 0 && comboResult.activeDeal && (
                      <div className="v8-cart-totals-row is-discount">
                        <span className="v8-cart-totals-label">
                          {comboResult.activeDeal.name} · −{comboResult.activeDeal.discountPercent}%
                        </span>
                        <span className="v8-cart-totals-val">−{formatPrice(comboDiscount)}</span>
                      </div>
                    )}
                    {fulfillmentType === "delivery" && (
                      <div className="v8-cart-totals-row">
                        <span className="v8-cart-totals-label">
                          Delivery <span style={{ fontStyle: "italic", color: "var(--color-muted)" }}>· consegna</span>
                        </span>
                        <span className="v8-cart-totals-val">
                          {deliveryFee === 0 ? (
                            <span style={{ color: "var(--color-basil-deep)", fontStyle: "italic" }}>Free</span>
                          ) : (
                            formatPrice(deliveryFee)
                          )}
                        </span>
                      </div>
                    )}
                    {tipAmount > 0 && (
                      <div className="v8-cart-totals-row">
                        <span className="v8-cart-totals-label">
                          Mancia
                        </span>
                        <span className="v8-cart-totals-val">{formatPrice(tipAmount)}</span>
                      </div>
                    )}
                    <div className="v8-cart-totals-row is-total">
                      <span className="v8-cart-totals-label">
                        Total <span className="it" style={{ color: "var(--color-muted)" }}>· totale</span>
                      </span>
                      <span className="v8-cart-totals-val">{formatPrice(total)}</span>
                    </div>
                    {gstAmount > 0 && (
                      <div className="v8-cart-totals-row is-gst">
                        <span className="v8-cart-totals-label">
                          of which GST{compliance?.gstNumber ? ` (${compliance.gstNumber})` : ""} @{" "}
                          {(gstRateBps / 100).toFixed(gstRateBps % 100 === 0 ? 0 : 1)}%
                        </span>
                        <span className="v8-cart-totals-val">{formatPrice(gstAmount)}</span>
                      </div>
                    )}
                    {items.length > 0 && (
                      <div className="v8-cart-totals-row is-ready">
                        <span className="v8-cart-totals-label" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          Ready <span className="it" style={{ color: "var(--color-muted)" }}>· pronto</span>
                        </span>
                        <span className="v8-cart-totals-val">
                          {readyByLabel ? (
                            <>by {readyByLabel}</>
                          ) : (
                            <span style={{ fontStyle: "italic", color: "var(--color-muted)" }}>
                              in ~{prepMinutes} min · pick a time
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="v8-cart-paybar-foot empty:hidden">
                    <LoyaltyEarnPreview cartTotal={total} />
                    {compliance?.zone === "NYC" && compliance.packagingDisclosure && (
                      <p>
                        <strong>Packaging:</strong> {compliance.packagingDisclosure}
                      </p>
                    )}
                    {compliance?.zone === "SG" && compliance.pdpaConsentText && (
                      <p>
                        <strong>PDPA §13 consent:</strong> {compliance.pdpaConsentText} By placing this order you confirm you have read this notice.
                      </p>
                    )}
                  </div>

                  {/* Sprint 9 #2 — weekly-usual opt-in. */}
                  {isBundleActive && (
                    <label className="v8-cart-weekly">
                      <input
                        type="checkbox"
                        checked={scheduleWeekly}
                        onChange={(e) => setScheduleWeekly(e.target.checked)}
                      />
                      <span>
                        Make this my <em>weekly usual</em> — same order, same time, every week.
                      </span>
                    </label>
                  )}

                  {checkoutError && (
                    <div className="v8-cart-checkout-error" role="alert">
                      <span aria-hidden="true" style={{ marginTop: 1 }}>!</span>
                      <div>
                        <p style={{ margin: 0 }}>{checkoutError}</p>
                        <button type="button" onClick={() => setCheckoutError(null)}>Dismiss</button>
                      </div>
                    </div>
                  )}

                  <div className="v8-cart-pay-actions" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      onClick={() => { setCheckoutError(null); handleCheckout(); }}
                      disabled={isSubmitting || !canCheckout}
                      className="v8-cart-pay-cta"
                    >
                      {isSubmitting
                        ? "Processing…"
                        : unavailableItems.length > 0
                          ? "Remove sold-out items"
                          : !selectedSlotId
                            ? "Select a time slot"
                            : canCheckout
                              ? (
                                <>
                                  <span>Pay</span>
                                  <span className="it">· procedi</span>
                                  <span className="num">{formatPrice(total)}</span>
                                </>
                              )
                              : fulfillmentType === "delivery" && !deliveryAddress.trim()
                                ? "Enter delivery address"
                                : "Enter name & phone to order"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Clear your cart?")) clearCart();
                      }}
                      aria-label="Clear cart"
                      title="Clear cart"
                      className="v8-cart-pay-clear"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}

/**
 * Basil sprig SVG — mirrors the V8 mockup's hand-drawn three-leaf
 * marker. Sits in the sticky header next to "Your order".
 */
function BasilSprig() {
  return (
    <span className="v8-cart-basil" aria-hidden="true">
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <path d="M18 32 C 18 26, 18 20, 18 12" stroke="#4A7C59" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M18 24 C 14 22, 12 19, 11 16 C 14 17, 17 19, 18 22" fill="#4A7C59" fillOpacity="0.18" stroke="#4A7C59" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M18 19 C 22 17, 24 14, 25 11 C 22 12, 19 14, 18 17" fill="#4A7C59" fillOpacity="0.18" stroke="#4A7C59" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M18 14 C 15 13, 13 10, 13 7 C 16 8, 17 11, 18 13" fill="#4A7C59" fillOpacity="0.18" stroke="#4A7C59" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/**
 * Tip presets (10 / 15 / 20%) plus a custom-zł input. Stored in grosze on the
 * Zustand cart so it survives a refresh and gets cleared on checkout. The
 * picker computes preset percentages off `subtotalGrosze` (post-discount,
 * pre-tip) so toggling between presets feels stable.
 *
 * V8 styling: terracotta pill buttons (.v8-cart-tip), active = darker
 * terracotta + ochre inset, 4-up grid (None / 10 / 15 / 20), custom-zł
 * input appears below when "None" is held + the customer types in.
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

  const labels = ["no thanks", "kind", "generous", "family"];

  return (
    <>
      <div className="v8-cart-section" style={{ paddingBottom: 0, paddingTop: 22 }}>
        <div className="v8-cart-section-title">
          A tip for the crew <span style={{ fontStyle: "italic", color: "var(--color-muted)", letterSpacing: 0, textTransform: "none", fontWeight: 400, fontSize: 12 }}>· una mancia</span>
        </div>
      </div>
      <div className="v8-cart-tips" role="radiogroup" aria-label="Tip amount">
        <button
          type="button"
          role="radio"
          aria-checked={valueGrosze === 0 && !customMode}
          onClick={() => {
            setCustomMode(false);
            onChange(0);
          }}
          className={`v8-cart-tip${valueGrosze === 0 && !customMode ? " is-on" : ""}`}
        >
          <span>0%</span>
          <span className="v8-cart-tip-label">{labels[0]}</span>
        </button>
        {presets.map((p, i) => {
          const g = presetValues[i];
          const selected = !customMode && valueGrosze === g && g > 0;
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setCustomMode(false);
                onChange(g);
              }}
              className={`v8-cart-tip${selected ? " is-on" : ""}`}
            >
              <span>{Math.round(p * 100)}%</span>
              <span className="v8-cart-tip-label">{labels[i + 1]}</span>
            </button>
          );
        })}
      </div>
      <div className="v8-cart-tip-custom">
        <span className="v8-cart-tip-custom-prefix">Custom</span>
        <input
          type="number"
          min="0"
          step="0.50"
          inputMode="decimal"
          value={customStr}
          onChange={(e) => {
            const v = e.target.value;
            setCustomStr(v);
            setCustomMode(true);
            onChange(Math.round(parseFloat(v || "0") * 100));
          }}
          onFocus={() => setCustomMode(true)}
          placeholder={formatPrice(0)}
          aria-label="Custom tip amount"
          className="v8-cart-input"
          style={{ flex: 1, padding: "10px 14px" }}
        />
      </div>
    </>
  );
}
