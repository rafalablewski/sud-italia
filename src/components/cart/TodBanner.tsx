"use client";

import { useEffect, useState } from "react";
import {
  Clock,
  Coffee,
  Moon,
  Users,
  Sunrise,
} from "lucide-react";

import { useCartStore } from "@/store/cart";
import {
  getActiveTimeWindow,
  type TimeWindow,
  type TimeWindowVariant,
} from "@/lib/upsell";
import type { MenuItem } from "@/data/types";

interface TodBannerProps {
  /** Full menu for the active location — needed to resolve `addItemId` to a
   *  real MenuItem when the CTA pushes an item into the cart. */
  allMenuItems: MenuItem[];
}

/**
 * Time-of-day cart banner — audit §2.3.
 *
 * Picks one of five hour-window variants based on the customer's local
 * clock (morning pre-order, lunch combo, afternoon espresso, dinner table,
 * late espresso & dessert). Hardcoded windows for now; admin override via
 * LocationUpsellConfig.timeWindows[] is a follow-up ticket.
 *
 * For the "afternoon espresso" / "late espresso" variants the CTA literally
 * adds the espresso to the cart (one-tap-add per §2.1 — no second screen).
 * For the others it's informational or deep-links into the existing combo
 * deal copy.
 *
 * The banner re-evaluates the active window every minute so the customer
 * doesn't sit at "Lunch combo" past 13:00 if they leave the drawer open.
 */
export function TodBanner({ allMenuItems }: TodBannerProps) {
  const [window, setWindow] = useState<TimeWindow | null>(() =>
    getActiveTimeWindow(),
  );
  const addItem = useCartStore((s) => s.addItem);
  const locationSlug = useCartStore((s) => s.locationSlug);

  useEffect(() => {
    const tick = () => setWindow(getActiveTimeWindow());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!window) return null;

  const skin = SKIN_BY_VARIANT[window.variant];
  const Icon = skin.icon;

  const onCtaClick = () => {
    if (window.addItemId && locationSlug) {
      // Resolve the item via id suffix (e.g. "espresso") against the
      // location's prefixed item ids ("krk-drink-espresso" / "waw-...").
      const candidate = allMenuItems.find(
        (m) => m.available && m.id.endsWith(window.addItemId!),
      );
      if (candidate) addItem(candidate, locationSlug);
    }
    // For windows without addItemId (morning, lunch info, dinner info) the
    // CTA is intentionally a no-op surface today; deep-link wiring is part
    // of the follow-up admin-config ticket.
  };

  return (
    <div className="px-5 mt-3">
      <div
        className={`p-3 rounded-xl border ${skin.shell} flex items-start gap-3`}
      >
        <div
          className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${skin.iconTile}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`font-semibold text-sm ${skin.title}`}>
              {window.title}
            </p>
            <span
              className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${skin.badge}`}
            >
              {window.badge}
            </span>
          </div>
          <p className={`text-xs mt-1 ${skin.sub}`}>{window.sub}</p>
        </div>
        <button
          onClick={onCtaClick}
          className={`flex-shrink-0 self-center text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${skin.cta}`}
        >
          {window.cta}
        </button>
      </div>
    </div>
  );
}

interface VariantSkin {
  icon: React.ComponentType<{ className?: string }>;
  shell: string;
  iconTile: string;
  title: string;
  sub: string;
  badge: string;
  cta: string;
}

/** Per-variant Tailwind chrome — kept in one place so the banner reads
 *  cleanly and the variants can be re-themed without touching JSX. */
const SKIN_BY_VARIANT: Record<TimeWindowVariant, VariantSkin> = {
  morning: {
    icon: Sunrise,
    shell: "bg-italia-green/5 border-italia-green/25",
    iconTile: "bg-italia-green/15 text-italia-green",
    title: "text-italia-dark",
    sub: "text-italia-gray",
    badge: "bg-italia-green/15 text-italia-green-dark",
    cta: "bg-italia-dark text-white hover:bg-black",
  },
  lunch: {
    icon: Clock,
    shell: "bg-italia-gold/5 border-italia-gold/25",
    iconTile: "bg-italia-gold/15 text-italia-gold-dark",
    title: "text-italia-dark",
    sub: "text-italia-gray",
    badge: "bg-italia-gold/15 text-italia-gold-dark",
    cta: "bg-italia-dark text-white hover:bg-black",
  },
  afternoon: {
    icon: Coffee,
    shell: "bg-italia-gold/5 border-italia-gold/25",
    iconTile: "bg-italia-gold/15 text-italia-gold-dark",
    title: "text-italia-dark",
    sub: "text-italia-gray",
    badge: "bg-italia-gold/15 text-italia-gold-dark",
    cta: "bg-italia-dark text-white hover:bg-black",
  },
  dinner: {
    icon: Users,
    shell: "bg-italia-red/5 border-italia-red/20",
    iconTile: "bg-italia-red/10 text-italia-red",
    title: "text-italia-dark",
    sub: "text-italia-gray",
    badge: "bg-italia-red/10 text-italia-red",
    cta: "bg-italia-dark text-white hover:bg-black",
  },
  late: {
    icon: Moon,
    shell: "bg-italia-dark border-[#2C2620]",
    iconTile: "bg-white/10 text-[#E0A93B]",
    title: "text-white",
    sub: "text-white/65",
    badge: "bg-italia-red/30 text-white",
    cta: "bg-italia-red text-white hover:bg-italia-red-dark",
  },
};
