"use client";

import { useEffect, useState } from "react";

import { useCartStore } from "@/store/cart";
import {
  getActiveTimeWindow,
  type TimeWindow,
  type TimeWindowVariant,
  type UpsellConfig,
} from "@/lib/upsell";
import type { MenuItem } from "@/data/types";

interface TodBannerProps {
  allMenuItems: MenuItem[];
  upsellConfig?: UpsellConfig | null;
}

/**
 * Time-of-day cart banner — audit §2.3.
 *
 * V8 re-skin: a single `.v8-cart-tod` ochre/espresso paper card with a
 * hand-drawn variant illustration on the left (wine glass for aperitivo,
 * sun for morning, coffee cup for afternoon, plate for dinner, moon for
 * late), italic Cormorant variant title + Italian phrase + italic Lora
 * sub. CTA is the standard terracotta italic text button. The late
 * variant flips to the espresso (.is-late) palette to match the V8
 * mockup's nighttime treatment.
 */
export function TodBanner({ allMenuItems, upsellConfig }: TodBannerProps) {
  const [window, setWindow] = useState<TimeWindow | null>(() =>
    getActiveTimeWindow(new Date(), upsellConfig ?? null),
  );
  const addItem = useCartStore((s) => s.addItem);
  const locationSlug = useCartStore((s) => s.locationSlug);

  useEffect(() => {
    const tick = () => setWindow(getActiveTimeWindow(new Date(), upsellConfig ?? null));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [upsellConfig]);

  if (!window) return null;

  const onCtaClick = () => {
    if (window.addItemId && locationSlug) {
      const candidate = allMenuItems.find(
        (m) => m.available && m.id.endsWith(window.addItemId!),
      );
      if (candidate) addItem(candidate, locationSlug);
    }
  };

  const phrase = ITALIAN_PHRASE_BY_VARIANT[window.variant];

  return (
    <div className={`v8-cart-tod is-${window.variant}`}>
      <span className="v8-cart-tod-illus" aria-hidden="true">
        <VariantGlyph variant={window.variant} />
      </span>
      <div className="v8-cart-tod-body">
        <div className="v8-cart-tod-title">
          {window.title} {phrase && <span className="v8-cart-tod-it">· {phrase}</span>}
        </div>
        <div className="v8-cart-tod-sub">{window.sub}</div>
      </div>
      <button type="button" onClick={onCtaClick} className="v8-cart-tod-cta">
        {window.cta}
      </button>
    </div>
  );
}

const ITALIAN_PHRASE_BY_VARIANT: Record<TimeWindowVariant, string> = {
  morning: "buongiorno",
  lunch: "il pranzo",
  afternoon: "l'aperitivo",
  dinner: "la cena",
  late: "la sera",
};

function VariantGlyph({ variant }: { variant: TimeWindowVariant }) {
  switch (variant) {
    case "morning":
      return (
        <svg width="38" height="44" viewBox="0 0 38 44" fill="none">
          <circle cx="19" cy="22" r="9" stroke="#C9A23E" strokeWidth="1.5" fill="#E6C97A" fillOpacity="0.35" />
          <path d="M19 8 L19 4 M19 40 L19 36 M5 22 L1 22 M37 22 L33 22 M9 12 L6 9 M29 12 L32 9 M9 32 L6 35 M29 32 L32 35"
                stroke="#C9A23E" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "lunch":
      return (
        <svg width="38" height="44" viewBox="0 0 38 44" fill="none">
          <circle cx="19" cy="22" r="14" stroke="#C9A23E" strokeWidth="1.5" fill="#F2E2C2" />
          <path d="M11 16 C 14 13, 24 13, 27 16" stroke="#B85C38" strokeWidth="1.2" fill="none" />
          <path d="M11 22 C 14 19, 24 19, 27 22" stroke="#B85C38" strokeWidth="1.2" fill="none" />
          <path d="M11 28 C 14 25, 24 25, 27 28" stroke="#B85C38" strokeWidth="1.2" fill="none" />
        </svg>
      );
    case "afternoon":
      return (
        <svg width="38" height="44" viewBox="0 0 38 44" fill="none">
          <path d="M8 4 C 8 16, 12 22, 19 22 C 26 22, 30 16, 30 4 Z" stroke="#C9A23E" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M11 8 C 14 12, 24 12, 27 8" stroke="#B85C38" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <path d="M19 22 L19 38" stroke="#C9A23E" strokeWidth="1.5" />
          <path d="M11 40 L27 40" stroke="#C9A23E" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "dinner":
      return (
        <svg width="38" height="44" viewBox="0 0 38 44" fill="none">
          <ellipse cx="19" cy="22" rx="13" ry="4" stroke="#B85C38" strokeWidth="1.5" fill="#E6C97A" fillOpacity="0.4" />
          <path d="M19 26 L19 36" stroke="#B85C38" strokeWidth="1.5" />
          <path d="M14 22 L24 22" stroke="#7A2B2B" strokeWidth="1.5" />
          <path d="M6 36 L32 36" stroke="#3D2817" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "late":
    default:
      return (
        <svg width="38" height="44" viewBox="0 0 38 44" fill="none">
          <path d="M28 26 C 22 28, 14 24, 12 16 C 12 9, 17 4, 24 4 C 19 8, 19 18, 24 22 C 27 24, 30 24, 33 22 C 32 24, 30 25, 28 26 Z"
                fill="#E6C97A" fillOpacity="0.4" stroke="#E6C97A" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="9" cy="30" r="0.8" fill="#E6C97A" />
          <circle cx="32" cy="34" r="0.8" fill="#E6C97A" />
          <circle cx="20" cy="38" r="0.8" fill="#E6C97A" />
        </svg>
      );
  }
}
