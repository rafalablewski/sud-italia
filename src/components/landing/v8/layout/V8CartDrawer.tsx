"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useCartStore } from "@/store/cart";
import { useCustomer } from "@/store/customer";
import {
  computeDeliveryFee,
  DELIVERY_FEE_GROSZE,
  FREE_DELIVERY_THRESHOLD,
  getActiveComboDeals,
  getCartSuggestions,
} from "@/lib/upsell";
import { formatPrice } from "@/lib/utils";
import { krakowMenu } from "@/data/menus/krakow";
import { warszawaMenu } from "@/data/menus/warszawa";
import { postCartPresenceToServer } from "@/lib/cart-presence-post-client";
import type { MenuItem } from "@/data/types";
import { Bi } from "../Bi";

const PHONE_PATTERN = /^[\d\s\-()]{7,}$/;

interface V8CartDrawerProps {
  open: boolean;
  onClose: () => void;
}

interface ClientSlot {
  id: string;
  time: string;
  fulfillmentTypes: string[];
  spotsLeft: number;
}

function getDateString(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0];
}

function getAllMenuItemsFor(slug: string | null): MenuItem[] {
  if (slug === "krakow") return krakowMenu;
  if (slug === "warszawa") return warszawaMenu;
  return [];
}

const tipBands = [
  { pct: 0, label: { en: "no thanks", pl: "nie, dziękuję" } },
  { pct: 10, label: { en: "kind", pl: "miło" } },
  { pct: 15, label: { en: "generous", pl: "hojnie" } },
  { pct: 20, label: { en: "family", pl: "rodzina" } },
];

export function V8CartDrawer({ open, onClose }: V8CartDrawerProps) {
  const items = useCartStore((s) => s.items);
  const getTotal = useCartStore((s) => s.getTotal);
  const locationSlug = useCartStore((s) => s.locationSlug);
  const fulfillmentType = useCartStore((s) => s.fulfillmentType);
  const setFulfillmentType = useCartStore((s) => s.setFulfillmentType);
  const selectedSlotId = useCartStore((s) => s.selectedSlotId);
  const selectedSlotTime = useCartStore((s) => s.selectedSlotTime);
  const selectedSlotDate = useCartStore((s) => s.selectedSlotDate);
  const setSelectedSlot = useCartStore((s) => s.setSelectedSlot);
  const deliveryAddress = useCartStore((s) => s.deliveryAddress);
  const setDeliveryAddress = useCartStore((s) => s.setDeliveryAddress);
  const tipAmount = useCartStore((s) => s.tipAmount);
  const setTipAmount = useCartStore((s) => s.setTipAmount);
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const clearCart = useCartStore((s) => s.clearCart);
  const appliedBundleId = useCartStore((s) => s.appliedBundleId);
  const bundlePriceGrosze = useCartStore((s) => s.bundlePriceGrosze);

  const { customer } = useCustomer();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [phoneError, setPhoneError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!customer) return;
    if (!name && customer.name) setName(customer.name);
    if (!phone && customer.phone) {
      const digits = customer.phone.replace(/^\+48\s*/, "");
      setPhone(digits);
    }
    if (!email && customer.email) setEmail(customer.email);
  }, [customer, name, phone, email]);

  const subtotal = getTotal();
  const allMenuItems = useMemo(() => getAllMenuItemsFor(locationSlug), [locationSlug]);

  // Suggestions (Pairs beautifully with)
  const suggestions = useMemo(() => {
    if (items.length === 0 || allMenuItems.length === 0) return [];
    return getCartSuggestions(items, allMenuItems).slice(0, 3);
  }, [items, allMenuItems]);

  // Combo deal — auto-applied when the cart matches. The helper returns
  // a single ComboDealResult: isComplete + savings already computed.
  const comboResult = useMemo(() => {
    if (items.length === 0) return null;
    return getActiveComboDeals(items, null, fulfillmentType);
  }, [items, fulfillmentType]);
  const activeCombo =
    comboResult && comboResult.isComplete ? comboResult.activeDeal : null;
  const comboDiscount =
    comboResult && comboResult.isComplete ? comboResult.savings : 0;

  // Delivery
  const deliveryFee = computeDeliveryFee(subtotal - comboDiscount, fulfillmentType);
  const toFreeDelivery = Math.max(0, FREE_DELIVERY_THRESHOLD - (subtotal - comboDiscount));
  const freeDeliveryProgress = Math.min(
    100,
    Math.round(((subtotal - comboDiscount) / FREE_DELIVERY_THRESHOLD) * 100),
  );

  // Tip
  const tipBasis = Math.max(0, subtotal - comboDiscount);
  const activeTipPct = useMemo(() => {
    if (tipAmount === 0) return 0;
    const candidates = [10, 15, 20];
    const matching = candidates.find(
      (p) => Math.round(tipBasis * (p / 100)) === tipAmount,
    );
    return matching ?? -1;
  }, [tipAmount, tipBasis]);

  const total = Math.max(0, subtotal - comboDiscount + deliveryFee + tipAmount);

  const isPhoneValid = PHONE_PATTERN.test(phone.trim());
  const canCheckout =
    items.length > 0 &&
    locationSlug !== null &&
    name.trim().length >= 2 &&
    isPhoneValid &&
    selectedSlotId !== null &&
    (fulfillmentType === "takeout" || deliveryAddress.trim().length > 0);

  const handleCheckout = async () => {
    if (!canCheckout) {
      if (!isPhoneValid) setPhoneError(true);
      return;
    }
    setSubmitting(true);
    setCheckoutError(null);
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
          customerName: name.trim(),
          customerPhone: `+48${phone.trim()}`,
          fulfillmentType,
          slotId: selectedSlotId,
          slotDate: selectedSlotDate,
          slotTime: selectedSlotTime,
          deliveryAddress:
            fulfillmentType === "delivery" ? deliveryAddress.trim() : undefined,
          customerEmail: email.trim() || undefined,
          tipAmount: tipAmount > 0 ? tipAmount : undefined,
          appliedBundleId: appliedBundleId || undefined,
          appliedBundlePriceGrosze:
            appliedBundleId && bundlePriceGrosze > 0 ? bundlePriceGrosze : undefined,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.orderId) {
        const slug = locationSlug;
        clearCart();
        if (slug) void postCartPresenceToServer(slug, [], 0);
        onClose();
        window.location.href = `/order-confirmation?orderId=${data.orderId}&location=${slug}`;
      } else {
        setCheckoutError(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setCheckoutError("Connection error. Please check your internet and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!mounted) return null;

  const sheet = (
    <div className={`v8-cart-root${open ? " open" : ""}`} aria-hidden={!open}>
      <div
        className="v8-cart-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="v8-cart-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Your order"
      >
        <span className="v8-cart-grip" aria-hidden="true" />

        <header className="v8-cart-top">
          <div className="v8-cart-top-row">
            <div className="v8-cart-top-title">
              <span className="v8-cart-basil" aria-hidden="true">
                <svg width="32" height="32" viewBox="0 0 36 36" fill="none">
                  <path d="M18 32 C 18 26, 18 20, 18 12" stroke="#4A7C59" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M18 24 C 14 22, 12 19, 11 16 C 14 17, 17 19, 18 22" fill="#4A7C59" fillOpacity="0.2" stroke="#4A7C59" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M18 19 C 22 17, 24 14, 25 11 C 22 12, 19 14, 18 17" fill="#4A7C59" fillOpacity="0.2" stroke="#4A7C59" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M18 14 C 15 13, 13 10, 13 7 C 16 8, 17 11, 18 13" fill="#4A7C59" fillOpacity="0.2" stroke="#4A7C59" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              </span>
              <div>
                <h2 className="v8-cart-h">
                  <Bi en="Your order" pl="Twoje zamówienie" />
                </h2>
                <div className="v8-cart-sub">
                  — <span className="v8-it">il tuo ordine</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="v8-cart-close"
              onClick={onClose}
              aria-label="Close"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2 L12 12 M12 2 L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </header>

        <div className="v8-tricolore" />

        <div className="v8-cart-scroll">
          {items.length === 0 ? (
            <div className="v8-cart-empty">
              <div className="v8-cart-empty-illus" aria-hidden="true">
                <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                  <path d="M14 22 L20 22 L26 60 L66 60 L72 32 L26 32" stroke="#B85C38" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="34" cy="68" r="3" stroke="#B85C38" strokeWidth="1.6" fill="none" />
                  <circle cx="58" cy="68" r="3" stroke="#B85C38" strokeWidth="1.6" fill="none" />
                </svg>
              </div>
              <p className="v8-cart-empty-h">
                <Bi
                  en="Your table is empty"
                  pl="Twój stół jest jeszcze pusty"
                />
                <span className="v8-it"> · il tavolo è vuoto</span>
              </p>
              <p className="v8-cart-empty-sub">
                <Bi
                  en="Pick a truck to start building your order."
                  pl="Wybierz lokal, aby zacząć zamówienie."
                />
              </p>
              <div className="v8-cart-empty-ctas">
                <Link href="/locations/krakow" className="v8-cart-mini-cta" onClick={onClose}>
                  Kraków
                </Link>
                <Link href="/locations/warszawa" className="v8-cart-mini-cta" onClick={onClose}>
                  Warszawa
                </Link>
              </div>
            </div>
          ) : (
            <>
              <section className="v8-cart-section">
                <div className="v8-cart-section-title">
                  <Bi en="The table" pl="Stół" />{" "}
                  <span className="v8-it">· il tavolo</span>
                </div>
                <div className="v8-cart-items">
                  {items.map((item) => (
                    <div key={item.menuItem.id} className="v8-cart-item">
                      <div className="v8-cart-item-illus" aria-hidden="true">
                        <ItemSvg category={item.menuItem.category} />
                      </div>
                      <div className="v8-cart-item-body">
                        <div className="v8-cart-item-head">
                          <div className="v8-cart-item-name">
                            {item.menuItem.name}
                          </div>
                          <div className="v8-cart-item-price v8-num">
                            {formatPrice(item.menuItem.price * item.quantity)}
                          </div>
                        </div>
                        <div className="v8-cart-item-origin">
                          {item.menuItem.description}
                        </div>
                        <div className="v8-cart-item-foot">
                          <div className="v8-cart-qty">
                            <button
                              type="button"
                              onClick={() =>
                                updateQuantity(item.menuItem.id, item.quantity - 1)
                              }
                              aria-label="Decrease quantity"
                            >
                              −
                            </button>
                            <span className="v8-num">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() =>
                                updateQuantity(item.menuItem.id, item.quantity + 1)
                              }
                              aria-label="Increase quantity"
                            >
                              +
                            </button>
                          </div>
                          <button
                            type="button"
                            className="v8-cart-item-remove"
                            onClick={() => removeItem(item.menuItem.id)}
                          >
                            <Bi en="remove" pl="usuń" />{" "}
                            <span className="v8-it">· rimuovi</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {activeCombo && (
                <div className="v8-cart-combo">
                  <div className="v8-cart-combo-icon" aria-hidden="true">
                    <svg width="36" height="36" viewBox="0 0 40 40" fill="none">
                      <path d="M6 30 L6 18 C 6 12, 12 8, 20 8 C 28 8, 34 12, 34 18 L 34 30" stroke="#E6C97A" strokeWidth="1.5" fill="none" />
                      <ellipse cx="20" cy="20" rx="9" ry="7" stroke="#E6C97A" strokeWidth="1.5" fill="none" />
                      <path d="M14 21 C 16 19, 24 19, 26 21" stroke="#CD212A" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                      <path d="M3 32 L37 32" stroke="#E6C97A" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div>
                    <div className="v8-cart-combo-title">{activeCombo.name}</div>
                    <div className="v8-cart-combo-sub">
                      <Bi en="Applied at checkout." pl="Naliczany przy zamówieniu." />
                    </div>
                  </div>
                  <div className="v8-cart-combo-tag">−{activeCombo.discountPercent}%</div>
                </div>
              )}

              {suggestions.length > 0 && (
                <section className="v8-cart-section v8-cart-pairs">
                  <div className="v8-cart-pairs-kicker">
                    <Bi en="Tonight's pairing" pl="Dzisiejszy zestaw" />{" "}
                    <span className="v8-it">· l&apos;abbinamento di stasera</span>
                  </div>
                  <h3 className="v8-cart-pairs-title">
                    <Bi en="Pairs beautifully with —" pl="Pasuje pięknie do —" />
                  </h3>
                  <p className="v8-cart-pairs-hint">
                    <span className="v8-it">
                      <Bi
                        en="Our pizzaiolo suggests, sommelier-style."
                        pl="Nasz pizzaiolo poleca, jak sommelier."
                      />
                    </span>
                  </p>
                  {suggestions.map((s) => (
                    <div key={s.item.id} className="v8-cart-pair">
                      <div className="v8-cart-pair-illus" aria-hidden="true">
                        <ItemSvg category={s.item.category} />
                      </div>
                      <div className="v8-cart-pair-body">
                        <div className="v8-cart-pair-name">{s.item.name}</div>
                        <div className="v8-cart-pair-origin">{s.reason}</div>
                        <div className="v8-cart-pair-meta">
                          <span className="v8-cart-pair-price v8-num">
                            {formatPrice(s.item.price)}
                          </span>
                          <button
                            type="button"
                            className="v8-cart-pair-add"
                            onClick={() => locationSlug && addItem(s.item, locationSlug)}
                            disabled={!locationSlug}
                          >
                            + <Bi en="Add" pl="Dodaj" />{" "}
                            <span className="v8-it">· aggiungi</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {fulfillmentType === "delivery" && (
                <div className="v8-cart-delivery">
                  <div className="v8-cart-delivery-head">
                    <div className="v8-cart-delivery-title">
                      <Bi
                        en={`Delivery — ${freeDeliveryProgress}% to free`}
                        pl={`Dostawa — ${freeDeliveryProgress}% do darmowej`}
                      />{" "}
                      <span className="v8-it">· consegna a casa</span>
                    </div>
                    <div className="v8-cart-delivery-amt v8-num">
                      {toFreeDelivery > 0 ? `+${formatPrice(toFreeDelivery)}` : "✓"}
                    </div>
                  </div>
                  <div className="v8-cart-delivery-track">
                    <div className="v8-cart-delivery-rail">
                      <div
                        className="v8-cart-delivery-fill"
                        style={{ width: `${freeDeliveryProgress}%` }}
                      />
                    </div>
                    <div
                      className="v8-cart-cyclist"
                      style={{ left: `${Math.max(0, freeDeliveryProgress - 6)}%` }}
                      aria-hidden="true"
                    >
                      <svg width="30" height="20" viewBox="0 0 34 22" fill="none">
                        <circle cx="7" cy="16" r="4.5" stroke="#3D2817" strokeWidth="1.4" fill="#F8EFDE" />
                        <circle cx="27" cy="16" r="4.5" stroke="#3D2817" strokeWidth="1.4" fill="#F8EFDE" />
                        <path d="M7 16 L14 8 L20 16 L27 16 L23 8 L14 8" stroke="#B85C38" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
                        <circle cx="14" cy="8" r="1.4" fill="#7A2B2B" />
                      </svg>
                    </div>
                  </div>
                  <div className="v8-cart-delivery-foot">
                    {toFreeDelivery > 0 ? (
                      <Bi
                        en={`Add ${formatPrice(toFreeDelivery)} more and Marco pedals it on the house.`}
                        pl={`Dorzuć jeszcze ${formatPrice(toFreeDelivery)} — Marco przywiezie na koszt domu.`}
                      />
                    ) : (
                      <Bi
                        en="Free delivery unlocked. Marco's on his way."
                        pl="Darmowa dostawa odblokowana. Marco już jedzie."
                      />
                    )}
                  </div>
                </div>
              )}

              <section className="v8-cart-section">
                <div className="v8-cart-section-title">
                  <Bi en="How" pl="Jak" />{" "}
                  <span className="v8-it">· come lo vuoi</span>
                </div>
                <div className="v8-cart-fulfill">
                  <button
                    type="button"
                    className={fulfillmentType === "takeout" ? "on" : ""}
                    onClick={() => setFulfillmentType("takeout")}
                  >
                    <Bi en="Takeaway" pl="Na wynos" />{" "}
                    <span className="v8-it">· asporto</span>
                  </button>
                  <button
                    type="button"
                    className={fulfillmentType === "delivery" ? "on" : ""}
                    onClick={() => setFulfillmentType("delivery")}
                  >
                    <Bi en="Delivery" pl="Dostawa" />{" "}
                    <span className="v8-it">· consegna</span>
                  </button>
                </div>
              </section>

              {fulfillmentType === "delivery" && (
                <div className="v8-cart-field">
                  <label className="v8-cart-field-label">
                    <Bi en="Address" pl="Adres" />{" "}
                    <span className="v8-it">· indirizzo</span>
                  </label>
                  <input
                    type="text"
                    className="v8-cart-field-input"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="ul. Floriańska 27 / 4, Kraków"
                  />
                </div>
              )}

              {locationSlug && (
                <V8SlotPicker
                  locationSlug={locationSlug}
                  fulfillmentType={fulfillmentType}
                  selectedSlotId={selectedSlotId}
                  setSelectedSlot={setSelectedSlot}
                />
              )}

              <section className="v8-cart-section">
                <div className="v8-cart-section-title">
                  <Bi en="Your details" pl="Twoje dane" />{" "}
                  <span className="v8-it">· dettagli</span>
                </div>
                <div className="v8-cart-form-row">
                  <div className="v8-cart-field">
                    <label className="v8-cart-field-label">
                      <Bi en="Name" pl="Imię" />{" "}
                      <span className="v8-it">· nome</span>
                    </label>
                    <input
                      type="text"
                      className="v8-cart-field-input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                    />
                  </div>
                  <div className="v8-cart-field">
                    <label className="v8-cart-field-label">
                      <Bi en="Phone" pl="Telefon" />{" "}
                      <span className="v8-it">· telefono</span>
                    </label>
                    <div className="v8-cart-phone">
                      <span className="v8-cart-phone-prefix">+48</span>
                      <input
                        type="tel"
                        className={`v8-cart-field-input v8-cart-phone-input${phoneError ? " err" : ""}`}
                        value={phone}
                        onChange={(e) => {
                          setPhone(e.target.value);
                          if (phoneError && PHONE_PATTERN.test(e.target.value.trim())) {
                            setPhoneError(false);
                          }
                        }}
                        autoComplete="tel-national"
                      />
                    </div>
                  </div>
                </div>
                <div className="v8-cart-field">
                  <label className="v8-cart-field-label">
                    Email{" "}
                    <span className="v8-cart-field-opt">
                      <Bi en="(optional, for the receipt)" pl="(opcjonalne, do paragonu)" />
                    </span>
                  </label>
                  <input
                    type="email"
                    className="v8-cart-field-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ale@esempio.it"
                    autoComplete="email"
                  />
                </div>
              </section>

              <section className="v8-cart-section">
                <div className="v8-cart-section-title">
                  <Bi en="A tip for the crew" pl="Napiwek dla ekipy" />{" "}
                  <span className="v8-it">· una mancia</span>
                </div>
                <div className="v8-cart-tips">
                  {tipBands.map((band) => {
                    const isActive = activeTipPct === band.pct;
                    return (
                      <button
                        key={band.pct}
                        type="button"
                        className={`v8-cart-tip${isActive ? " on" : ""}`}
                        onClick={() =>
                          setTipAmount(Math.round(tipBasis * (band.pct / 100)))
                        }
                      >
                        <span className="v8-cart-tip-pct">{band.pct}%</span>
                        <span className="v8-cart-tip-label">
                          <Bi en={band.label.en} pl={band.label.pl} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <div className="v8-cart-foot-note">
                <span className="v8-it-em">
                  &ldquo;Mangia bene, ridi spesso, ama molto.&rdquo;
                </span>
                <small>Sud Italia · Kraków · Warszawa</small>
              </div>
            </>
          )}
        </div>

        {items.length > 0 && (
          <div className="v8-cart-paybar">
            <div className="v8-tricolore" />
            <div className="v8-cart-paybar-inner">
              <div className="v8-cart-totals">
                <div className="v8-cart-totals-row">
                  <span>
                    <Bi en="Subtotal" pl="Suma" />{" "}
                    <span className="v8-it">· subtotale</span>
                  </span>
                  <span className="v8-num">{formatPrice(subtotal)}</span>
                </div>
                {activeCombo && comboDiscount > 0 && (
                  <div className="v8-cart-totals-row discount">
                    <span>
                      {activeCombo.name} · −{activeCombo.discountPercent}%
                    </span>
                    <span className="v8-num">−{formatPrice(comboDiscount)}</span>
                  </div>
                )}
                {fulfillmentType === "delivery" && (
                  <div className="v8-cart-totals-row">
                    <span>
                      <Bi en="Delivery" pl="Dostawa" />{" "}
                      <span className="v8-it">· consegna</span>
                    </span>
                    <span className="v8-num">
                      {deliveryFee === 0 ? formatPrice(0) : formatPrice(DELIVERY_FEE_GROSZE)}
                    </span>
                  </div>
                )}
                {tipAmount > 0 && (
                  <div className="v8-cart-totals-row">
                    <span>
                      <span className="v8-it">Mancia</span> · {activeTipPct > 0 ? `${activeTipPct}%` : "—"}
                    </span>
                    <span className="v8-num">{formatPrice(tipAmount)}</span>
                  </div>
                )}
                <div className="v8-cart-totals-row total">
                  <span>
                    <Bi en="Total" pl="Razem" />{" "}
                    <span className="v8-it">· totale</span>
                  </span>
                  <span className="v8-num">{formatPrice(total)}</span>
                </div>
              </div>

              {checkoutError && (
                <p className="v8-cart-err">{checkoutError}</p>
              )}

              <button
                type="button"
                className="v8-cart-pay"
                onClick={handleCheckout}
                disabled={!canCheckout || submitting}
              >
                {submitting ? (
                  <Bi en="Sending to kitchen…" pl="Wysyłanie do kuchni…" />
                ) : (
                  <>
                    <Bi en="Pay & send to kitchen" pl="Zapłać i wyślij do kuchni" />{" "}
                    <span className="v8-it v8-cta-it">· paga e ordina</span>{" "}
                    <span aria-hidden="true">→</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );

  return createPortal(sheet, document.body);
}

// ============================================================
// Per-category illustration. Picks a basic SVG by category so the
// item cards have visual variety without per-item authoring.
// ============================================================
function ItemSvg({ category }: { category: string }) {
  const c = category.toLowerCase();
  if (c.includes("pasta")) {
    return (
      <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
        <circle cx="21" cy="24" r="13" stroke="#C9A23E" strokeWidth="1.5" fill="#F2E2C2" />
        <path d="M14 22 C 16 19, 20 19, 22 22 C 24 25, 28 25, 30 22" stroke="#C9A23E" strokeWidth="1.2" fill="none" />
        <path d="M14 26 C 16 23, 20 23, 22 26 C 24 29, 28 29, 30 26" stroke="#C9A23E" strokeWidth="1.2" fill="none" />
        <circle cx="19" cy="22" r="1.2" fill="#7A2B2B" />
      </svg>
    );
  }
  if (c.includes("dessert") || c.includes("dolc")) {
    return (
      <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
        <rect x="10" y="16" width="22" height="14" rx="1.5" stroke="#3D2817" strokeWidth="1.5" fill="#C9A23E" fillOpacity="0.25" />
        <path d="M10 20 L32 20" stroke="#3D2817" strokeWidth="1.2" />
        <path d="M13 16 L13 12 L29 12 L29 16" stroke="#3D2817" strokeWidth="1.5" />
        <circle cx="15" cy="23" r="0.7" fill="#3D2817" />
        <circle cx="21" cy="23" r="0.7" fill="#3D2817" />
        <circle cx="27" cy="23" r="0.7" fill="#3D2817" />
      </svg>
    );
  }
  if (c.includes("drink") || c.includes("bibit") || c.includes("beverage")) {
    return (
      <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
        <rect x="14" y="10" width="14" height="22" rx="2" stroke="#4A7C59" strokeWidth="1.5" fill="#E6C97A" fillOpacity="0.3" />
        <path d="M17 10 L17 6 L25 6 L25 10" stroke="#4A7C59" strokeWidth="1.5" />
        <circle cx="21" cy="21" r="3" stroke="#C9A23E" strokeWidth="1.2" fill="#C9A23E" fillOpacity="0.4" />
      </svg>
    );
  }
  if (c.includes("antipast") || c.includes("starter") || c.includes("appet")) {
    return (
      <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
        <ellipse cx="21" cy="24" rx="14" ry="6" stroke="#B85C38" strokeWidth="1.5" fill="#F2E2C2" />
        <circle cx="16" cy="22" r="2" fill="#4A7C59" fillOpacity="0.5" />
        <circle cx="21" cy="20" r="2" fill="#CD212A" fillOpacity="0.5" />
        <circle cx="26" cy="22" r="2" fill="#C9A23E" fillOpacity="0.7" />
      </svg>
    );
  }
  // Default: pizza
  return (
    <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
      <circle cx="21" cy="22" r="14" fill="#C9A23E" fillOpacity="0.2" stroke="#B85C38" strokeWidth="1.5" />
      <circle cx="17" cy="19" r="2" fill="#CD212A" fillOpacity="0.7" />
      <circle cx="25" cy="20" r="2" fill="#CD212A" fillOpacity="0.7" />
      <circle cx="21" cy="26" r="2" fill="#CD212A" fillOpacity="0.7" />
      <path d="M16 24 C 18 22, 20 24, 20 26" stroke="#4A7C59" strokeWidth="1.2" fill="#4A7C59" fillOpacity="0.4" />
      <path d="M24 16 C 26 14, 28 16, 28 18" stroke="#4A7C59" strokeWidth="1.2" fill="#4A7C59" fillOpacity="0.4" />
    </svg>
  );
}

// ============================================================
// V8-styled slot picker — hits /api/slots and lets the user
// pick a day + time within that day. Same backend the legacy
// SlotPicker uses.
// ============================================================
function V8SlotPicker({
  locationSlug,
  fulfillmentType,
  selectedSlotId,
  setSelectedSlot,
}: {
  locationSlug: string;
  fulfillmentType: "takeout" | "delivery";
  selectedSlotId: string | null;
  setSelectedSlot: (id: string | null, time: string | null, date: string | null) => void;
}) {
  const [dayOffset, setDayOffset] = useState(0);
  const [slots, setSlots] = useState<ClientSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const date = getDateString(dayOffset);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/slots?location=${locationSlug}&date=${date}&type=${fulfillmentType}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setSlots(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) {
          setSlots([]);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locationSlug, date, fulfillmentType]);

  const dayLabels = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      if (i === 0) return { en: "Today", pl: "Dziś" };
      if (i === 1) return { en: "Tomorrow", pl: "Jutro" };
      const d = new Date();
      d.setDate(d.getDate() + i);
      const label = d.toLocaleDateString(undefined, { weekday: "short" });
      return { en: label, pl: label };
    });
  }, []);

  return (
    <section className="v8-cart-section">
      <div className="v8-cart-section-title">
        <Bi en="Time" pl="Czas" /> <span className="v8-it">· a che ora</span>
      </div>
      <div className="v8-cart-days">
        {dayLabels.map((d, i) => (
          <button
            key={i}
            type="button"
            className={`v8-cart-day${dayOffset === i ? " on" : ""}`}
            onClick={() => setDayOffset(i)}
          >
            <Bi en={d.en} pl={d.pl} />
          </button>
        ))}
      </div>
      <div className="v8-cart-slots">
        {loading ? (
          <div className="v8-cart-slots-msg v8-it">…</div>
        ) : error ? (
          <div className="v8-cart-slots-msg">
            <Bi en="Couldn't load times" pl="Nie udało się załadować godzin" />
          </div>
        ) : slots.length === 0 ? (
          <div className="v8-cart-slots-msg v8-it">
            <Bi en="Fully booked" pl="Wszystko zajęte" /> · pieno
          </div>
        ) : (
          slots.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`v8-cart-slot${s.id === selectedSlotId ? " on" : ""}`}
              onClick={() => setSelectedSlot(s.id, s.time, date)}
              disabled={s.spotsLeft <= 0}
            >
              <span className="v8-num">{s.time.slice(0, 5)}</span>
              <span className="v8-cart-slot-scarce">
                {s.spotsLeft <= 2 ? (
                  <Bi
                    en={`${s.spotsLeft} left`}
                    pl={`zostały ${s.spotsLeft}`}
                  />
                ) : (
                  <Bi en="available" pl="dostępne" />
                )}
              </span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
