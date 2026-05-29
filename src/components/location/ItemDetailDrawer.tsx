"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { ALLERGEN_LABELS } from "@/data/types";
import { getItemDetails } from "@/data/kodawari";
import { formatPrice } from "@/lib/utils";
import { useCartStore } from "@/store/cart";
import { useCartUIStore } from "@/store/cart-ui";

/**
 * V8 item-detail drawer. Mounted exactly once at `(public)/layout.tsx`;
 * any menu item's "Details" button opens it via
 * `useCartUIStore.setDetailItem({ item, popularThisWeek })`.
 *
 * Visual vocabulary mirrors the cart drawer's paper sheet (basil sprig
 * sticky header + tricolore strip + parchment scroll + sticky paybar)
 * so the menu → detail → cart flow reads as one editorial spread. The
 * detail-only selectors are namespaced under `.v8-detail-*` so the
 * styling stays scoped.
 *
 * Body sections:
 *   - Hand-drawn dish glyph + italic Cormorant name + italic Lora desc
 *   - Editorial meta row: price (oxblood) + prep time + calories
 *   - Allergens · allergeni — oxblood chip row when present, basil
 *     "no major allergens · senza allergeni maggiori" line when empty
 *   - Valori nutrizionali · nutrition — terracotta / ochre / basil
 *     bars for calories / protein / carbs / fat / fiber / sodium
 *   - Provenienza · sourcing — italic Lora quote in a parchment-deep
 *     paper card
 *   - Sticky paybar: terracotta "Add to cart · aggiungi al carrello"
 *     + tabular price. Tap adds the item via useCartStore.addItem +
 *     closes the drawer (the floating cart pill + add toast take over).
 *
 * The drawer reads the cart's locationSlug from useCartStore so it can
 * call addItem with the right slug — no need for a prop.
 */
export function ItemDetailDrawer() {
  const payload = useCartUIStore((s) => s.detailItem);
  const setDetailItem = useCartUIStore((s) => s.setDetailItem);
  const addItem = useCartStore((s) => s.addItem);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const open = payload !== null;

  useEffect(() => {
    if (open) {
      document.body.classList.add("v8-detail-open");
      document.body.style.overflow = "hidden";
    } else {
      document.body.classList.remove("v8-detail-open");
      document.body.style.overflow = "";
    }
    return () => {
      document.body.classList.remove("v8-detail-open");
      document.body.style.overflow = "";
    };
  }, [open]);

  // Esc key closes the drawer — same UX affordance as the cart sheet.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetailItem(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setDetailItem]);

  if (!mounted) return null;

  const item = payload?.item;
  const locationSlug = payload?.locationSlug ?? null;
  const popularThisWeek = payload?.popularThisWeek ?? false;

  const details = item ? getItemDetails(item.id) : null;
  const allergens = item ? (item.allergens ?? details?.allergens ?? []) : [];
  const nutrition = details?.nutrition;
  const sourcing = details?.sourcing;
  const prepTime = details?.prepTimeMinutes;

  const handleAdd = () => {
    if (!item || !locationSlug) return;
    addItem(item, locationSlug);
    setDetailItem(null);
  };

  return createPortal(
    <>
      <div
        className={`v8-detail-overlay${open ? " is-open" : ""}`}
        onClick={() => setDetailItem(null)}
        aria-hidden="true"
      />
      <aside
        className={`v8-detail-sheet${open ? " is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={item ? `${item.name} details` : "Item details"}
        aria-hidden={!open}
      >
        <div className="v8-detail-grip" aria-hidden="true" />

        {item && (
          <>
            <header className="v8-detail-top">
              <div className="v8-detail-top-row">
                <div className="v8-detail-top-title">
                  <BasilSprig />
                  <div>
                    <h2>{item.name}</h2>
                    <div className="v8-detail-top-sub">— dettagli</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailItem(null)}
                  className="v8-detail-close"
                  aria-label="Close details"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <path d="M2 2 L12 12 M12 2 L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </header>

            <div className="v8-detail-tricolore" aria-hidden="true" />

            <div className="v8-detail-scroll">
              <div className="v8-detail-hero">
                <div className="v8-detail-illus" aria-hidden="true">
                  <DishGlyph category={item.category} name={item.name} size={92} />
                </div>
                <div className="v8-detail-hero-body">
                  <div className="v8-detail-name">{item.name}</div>
                  {item.description && (
                    <div className="v8-detail-desc">{item.description}</div>
                  )}
                  {(item.isLimited || item.limitedUntil) && (
                    <div className="v8-detail-callout is-limited">
                      <em>Sul menù per poco</em> — limited rotation, order before it&apos;s gone.
                    </div>
                  )}
                  {popularThisWeek && (
                    <div className="v8-detail-callout">
                      <em>Richiesto in settimana</em> — ordered often at this location this week.
                    </div>
                  )}
                </div>
              </div>

              <div className="v8-detail-meta">
                <div className="v8-detail-meta-price num">{formatPrice(item.price)}</div>
                {typeof prepTime === "number" && (
                  <div className="v8-detail-meta-item">
                    <span className="v8-detail-meta-num num">{prepTime}</span>
                    <span className="v8-detail-meta-unit">min · in cottura</span>
                  </div>
                )}
                {nutrition && (
                  <div className="v8-detail-meta-item">
                    <span className="v8-detail-meta-num num">{nutrition.calories}</span>
                    <span className="v8-detail-meta-unit">kcal</span>
                  </div>
                )}
              </div>

              <div className="v8-detail-section">
                <div className="v8-detail-section-title">
                  Allergens <span className="v8-detail-section-it">· allergeni</span>
                </div>
                {allergens.length === 0 ? (
                  <div className="v8-detail-no-allergens">
                    <BasilLeaf />
                    <span>
                      <em>Senza allergeni maggiori</em> — no major allergens reported.
                    </span>
                  </div>
                ) : (
                  <div className="v8-detail-allergens">
                    {allergens.map((a) => {
                      const info = ALLERGEN_LABELS[a];
                      return (
                        <span key={a} className="v8-detail-allergen">
                          <span className="v8-detail-allergen-glyph" aria-hidden>{info.emoji}</span>
                          {info.en}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {nutrition && (
                <div className="v8-detail-section">
                  <div className="v8-detail-section-title">
                    Nutrition <span className="v8-detail-section-it">· valori nutrizionali</span>
                  </div>
                  <div className="v8-detail-nutrition">
                    <NutritionBar label="Calories" italian="calorie" value={nutrition.calories} unit=" kcal" max={1000} tint="ochre" />
                    <NutritionBar label="Protein" italian="proteine" value={nutrition.protein} unit="g" max={50} tint="terracotta" />
                    <NutritionBar label="Carbohydrates" italian="carboidrati" value={nutrition.carbs} unit="g" max={100} tint="ochre-light" />
                    <NutritionBar label="Fat" italian="grassi" value={nutrition.fat} unit="g" max={60} tint="oxblood" />
                    {nutrition.fiber !== undefined && (
                      <NutritionBar label="Fiber" italian="fibra" value={nutrition.fiber} unit="g" max={10} tint="basil" />
                    )}
                    {nutrition.sodium !== undefined && (
                      <NutritionBar label="Sodium" italian="sodio" value={nutrition.sodium} unit=" mg" max={2000} tint="espresso" />
                    )}
                  </div>
                </div>
              )}

              {sourcing && (
                <div className="v8-detail-section">
                  <div className="v8-detail-section-title">
                    Sourcing <span className="v8-detail-section-it">· provenienza</span>
                  </div>
                  <div className="v8-detail-sourcing">
                    <SprigMark />
                    <p>{sourcing}</p>
                  </div>
                </div>
              )}

              <div className="v8-detail-foot">
                <em>&ldquo;Un piatto fatto bene · a dish done well.&rdquo;</em>
              </div>

              <div className="v8-detail-paybar">
                <div className="v8-detail-paybar-tricolore" aria-hidden="true" />
                <div className="v8-detail-paybar-inner">
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={!item.available || !locationSlug}
                    className="v8-detail-pay-cta"
                  >
                    <span>Add to cart</span>
                    <span className="it">· aggiungi al carrello</span>
                    <span className="num">{formatPrice(item.price)}</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </aside>
    </>,
    document.body,
  );
}

interface NutritionBarProps {
  label: string;
  italian: string;
  value: number;
  unit: string;
  max: number;
  tint: "ochre" | "ochre-light" | "terracotta" | "oxblood" | "basil" | "espresso";
}

function NutritionBar({ label, italian, value, unit, max, tint }: NutritionBarProps) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="v8-detail-bar">
      <div className="v8-detail-bar-head">
        <span className="v8-detail-bar-label">
          {label} <span className="v8-detail-bar-it">· {italian}</span>
        </span>
        <span className="v8-detail-bar-val num">
          {value}
          {unit}
        </span>
      </div>
      <div className="v8-detail-bar-rail">
        <div className={`v8-detail-bar-fill is-${tint}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function BasilSprig() {
  return (
    <span className="v8-detail-basil" aria-hidden="true">
      <svg width="32" height="32" viewBox="0 0 36 36" fill="none">
        <path d="M18 32 C 18 26, 18 20, 18 12" stroke="#4A7C59" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M18 24 C 14 22, 12 19, 11 16 C 14 17, 17 19, 18 22" fill="#4A7C59" fillOpacity="0.18" stroke="#4A7C59" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M18 19 C 22 17, 24 14, 25 11 C 22 12, 19 14, 18 17" fill="#4A7C59" fillOpacity="0.18" stroke="#4A7C59" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M18 14 C 15 13, 13 10, 13 7 C 16 8, 17 11, 18 13" fill="#4A7C59" fillOpacity="0.18" stroke="#4A7C59" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function BasilLeaf() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M9 16 C 9 12, 9 8, 9 4" stroke="#4A7C59" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M9 12 C 6 11, 4 9, 4 6 C 7 7, 9 9, 9 11" fill="#4A7C59" fillOpacity="0.25" stroke="#4A7C59" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M9 9 C 12 8, 14 6, 14 3 C 11 4, 9 6, 9 8" fill="#4A7C59" fillOpacity="0.25" stroke="#4A7C59" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function SprigMark() {
  return (
    <span className="v8-detail-sourcing-mark" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M11 19 C 11 14, 11 10, 11 6" stroke="#4A7C59" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M11 14 C 8 13, 6 10, 6 7 C 9 8, 11 10, 11 12" fill="#4A7C59" fillOpacity="0.22" stroke="#4A7C59" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M11 11 C 14 10, 16 7, 16 4 C 13 5, 11 7, 11 9" fill="#4A7C59" fillOpacity="0.22" stroke="#4A7C59" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/**
 * Per-category dish glyph. Larger render of the same vocabulary the
 * CartItem row uses, so the menu → detail → cart flow keeps a single
 * illustration language. Kept inline here rather than imported because
 * the two surfaces differ enough (size, stroke weight) that sharing
 * would force an awkward common prop.
 */
function DishGlyph({ category, name, size = 92 }: { category: string; name: string; size?: number }) {
  const c = (category || "").toLowerCase();
  const n = (name || "").toLowerCase();
  if (c.includes("pizza") || n.includes("pizza") || n.includes("margherita") || n.includes("diavola")) {
    return (
      <svg width={size} height={size} viewBox="0 0 42 42" fill="none">
        <path d="M6 32 L21 6 L36 32 Z" fill="#C9A23E" fillOpacity="0.18" stroke="#B85C38" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M6 32 L36 32" stroke="#7A2B2B" strokeWidth="1.5" />
        <circle cx="16" cy="24" r="2" fill="#7A2B2B" />
        <circle cx="25" cy="20" r="2" fill="#7A2B2B" />
        <circle cx="21" cy="27" r="2" fill="#7A2B2B" />
        <circle cx="19" cy="16" r="1.5" fill="#4A7C59" />
      </svg>
    );
  }
  if (c.includes("pasta") || n.includes("carbonara") || n.includes("amatriciana")) {
    return (
      <svg width={size} height={size} viewBox="0 0 42 42" fill="none">
        <circle cx="21" cy="24" r="13" stroke="#C9A23E" strokeWidth="1.5" fill="#F2E2C2" />
        <path d="M14 22 C 16 19, 20 19, 22 22 C 24 25, 28 25, 30 22" stroke="#C9A23E" strokeWidth="1.2" fill="none" />
        <path d="M14 26 C 16 23, 20 23, 22 26 C 24 29, 28 29, 30 26" stroke="#C9A23E" strokeWidth="1.2" fill="none" />
        <path d="M14 24 C 16 21, 20 21, 22 24 C 24 27, 28 27, 30 24" stroke="#B85C38" strokeWidth="1.2" fill="none" />
        <circle cx="19" cy="22" r="1.2" fill="#7A2B2B" />
        <circle cx="26" cy="26" r="1.2" fill="#7A2B2B" />
      </svg>
    );
  }
  if (c.includes("dessert") || n.includes("tiramis") || n.includes("cannol")) {
    return (
      <svg width={size} height={size} viewBox="0 0 42 42" fill="none">
        <rect x="8" y="16" width="26" height="16" rx="1.5" stroke="#3D2817" strokeWidth="1.5" fill="#C9A23E" fillOpacity="0.25" />
        <path d="M8 20 L34 20" stroke="#3D2817" strokeWidth="1.2" />
        <path d="M8 24 L34 24" stroke="#3D2817" strokeWidth="1.2" />
        <path d="M13 16 L13 12 L29 12 L29 16" stroke="#3D2817" strokeWidth="1.5" />
        <circle cx="15" cy="22" r="0.6" fill="#3D2817" />
        <circle cx="21" cy="22" r="0.6" fill="#3D2817" />
        <circle cx="27" cy="22" r="0.6" fill="#3D2817" />
      </svg>
    );
  }
  if (c.includes("drink") || c.includes("bever") || n.includes("limonata") || n.includes("acqua") || n.includes("vino")) {
    return (
      <svg width={size} height={size} viewBox="0 0 42 42" fill="none">
        <rect x="14" y="10" width="14" height="22" rx="2" stroke="#4A7C59" strokeWidth="1.5" fill="#E6C97A" fillOpacity="0.3" />
        <path d="M17 10 L17 6 L25 6 L25 10" stroke="#4A7C59" strokeWidth="1.5" />
        <circle cx="21" cy="22" r="3" stroke="#C9A23E" strokeWidth="1.2" fill="#C9A23E" fillOpacity="0.4" />
        <path d="M21 19 L21 25 M18 22 L24 22" stroke="#C9A23E" strokeWidth="1" />
      </svg>
    );
  }
  if (c.includes("coffee") || c.includes("espresso") || n.includes("espresso") || n.includes("caffè") || n.includes("caffe")) {
    return (
      <svg width={size} height={size} viewBox="0 0 42 42" fill="none">
        <path d="M10 18 L32 18 L30 30 C 30 33, 27 34, 24 34 L18 34 C 15 34, 12 33, 12 30 Z" stroke="#3D2817" strokeWidth="1.5" fill="#3D2817" fillOpacity="0.85" />
        <path d="M32 20 C 36 20, 36 27, 32 27" stroke="#3D2817" strokeWidth="1.5" fill="none" />
        <path d="M16 12 C 16 14, 18 14, 18 12 C 18 10, 20 10, 20 12" stroke="#B85C38" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d="M22 11 C 22 13, 24 13, 24 11" stroke="#B85C38" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 42 42" fill="none">
      <path d="M11 21 C 11 31, 16 36, 21 36 C 26 36, 31 31, 31 21 C 31 16, 28 13, 21 13 C 14 13, 11 16, 11 21 Z"
            fill="#B85C38" fillOpacity="0.2" stroke="#B85C38" strokeWidth="1.5" />
      <path d="M21 13 L21 9" stroke="#4A7C59" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M21 11 C 18 9, 16 8, 14 8 C 15 11, 17 12, 21 13" stroke="#4A7C59" strokeWidth="1.5" fill="#4A7C59" fillOpacity="0.2" strokeLinejoin="round" />
      <path d="M21 11 C 24 9, 26 8, 28 8 C 27 11, 25 12, 21 13" stroke="#4A7C59" strokeWidth="1.5" fill="#4A7C59" fillOpacity="0.2" strokeLinejoin="round" />
    </svg>
  );
}
