"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { MenuItem } from "@/data/types";
import { MenuCategory, MENU_CATEGORY_LABELS } from "@/data/types";
import { MenuItemCard } from "./MenuItem";
import { MenuFomoMicroLine } from "./MenuFomoMicroLine";
import { SeasonalSpecials } from "./SeasonalSpecials";
import { LayoutGate } from "@/components/layout/LayoutGate";
import { ReorderSection } from "./ReorderSection";
import { DEFAULT_COMBO_DEALS } from "@/lib/upsell";
import { simulateLiveActivity, type LiveActivity } from "@/lib/growth-engine";
import { compareMenuEngineering, type UpsellConfig } from "@/lib/upsell";
import { useLiveMenuAvailability } from "@/lib/useLiveMenuAvailability";

// V8 Trattoria location-menu chrome. Wraps the menu inside a soft
// paper card (`.v8-menu-card`) containing — in order — the section
// header, search input, per-location live-activity strip
// (re-introduced from Step 8's removal but now folded inside the
// menu wrapper as V8 designs), category tabs, the 15-minute
// guarantee banner, the inline combo deals row with wax-seal
// stamps, the surprise-me pill, and the menu items grid.
//
// Data wiring carried over from the pre-V8 MenuSection:
//   - useLiveMenuAvailability — live override of item.available
//   - upsellConfig editorial badges (used by MenuItemCard)
//   - compareMenuEngineering sort (audit §4.4)
//   - hot-this-week popularity overlay
// What changed: the chrome markup (search, tabs, guarantee, combos,
// surprise, live-act) is now inline V8 instead of imported
// SpeedGuarantee / ComboDealsPreview / SurpriseMe / MenuCategoryNav.
// Those components stay in the repo for any other surface that needs
// them; the V8 menu uses bespoke inline blocks to keep the markup
// auditable against the mockup.
//
// Items still render via <MenuItemCard /> — Step 10 ports the per-
// item card to V8.

const MENU_PLACEHOLDER: LiveActivity = {
  ordersInLastHour: 0,
  currentlyPreparing: 0,
  popularItemNow: "—",
  avgPrepTimeMinutes: 0,
};

interface MenuSectionProps {
  items: MenuItem[];
  locationSlug: string;
  /**
   * SSR snapshot of which items are available. The live hook polls
   * /api/menu/availability and overrides this map when admin toggles
   * an item. Defaults to each item's own `available` flag for
   * backward compatibility.
   */
  initialAvailability?: Record<string, boolean>;
  /** Audit §11.1 — per-location regulatory disclosure. */
  compliance?: import("./CompliancePills").PublicCompliance | null;
}

const CATEGORY_ORDER: MenuCategory[] = [
  "pizza",
  "pasta",
  "antipasti",
  "panini",
  "drinks",
  "desserts",
];

// Bilingual subtitles for the V8 category tabs. Falls back to the
// English label for categories not listed (so a new category lands
// without breaking the tab row).
const CAT_IT: Partial<Record<MenuCategory, string>> = {
  antipasti: "antipasti",
  drinks: "bibite",
  desserts: "dolci",
};

export function MenuSection({ items, locationSlug, initialAvailability, compliance }: MenuSectionProps) {
  // Editorial badges from /admin/crosssell.
  const [upsellConfig, setUpsellConfig] = useState<UpsellConfig | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/settings/upsell?location=${locationSlug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled && data) setUpsellConfig(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [locationSlug]);

  // Live availability — override item.available when admin 86's something.
  const fallbackAvailability = useMemo(() => {
    if (initialAvailability) return initialAvailability;
    const map: Record<string, boolean> = {};
    for (const item of items) map[item.id] = item.available;
    return map;
  }, [initialAvailability, items]);
  const liveAvailability = useLiveMenuAvailability(locationSlug, fallbackAvailability);
  const itemsLive: MenuItem[] = useMemo(
    () =>
      items.map((i) => {
        const live = liveAvailability[i.id];
        return live === undefined || live === i.available ? i : { ...i, available: live };
      }),
    [items, liveAvailability],
  );

  // Hot-this-week popularity overlay.
  const [hotThisWeekIds, setHotThisWeekIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/menu/item-popularity?location=${encodeURIComponent(locationSlug)}`)
      .then((r) => r.json())
      .then((data: { itemIds?: string[] }) => {
        if (cancelled) return;
        setHotThisWeekIds(new Set(data.itemIds ?? []));
      })
      .catch(() => { if (!cancelled) setHotThisWeekIds(new Set()); });
    return () => { cancelled = true; };
  }, [locationSlug]);

  // Live activity for the in-menu `.v8-live-act` strip. Same
  // mount-gated pattern as the homepage LiveTicker (the chain-wide
  // strip under the nav) so SSR + client agree.
  const [mounted, setMounted] = useState(false);
  const [activity, setActivity] = useState<LiveActivity>(MENU_PLACEHOLDER);
  useEffect(() => {
    setMounted(true);
    setActivity(simulateLiveActivity(locationSlug));
    const id = setInterval(() => setActivity(simulateLiveActivity(locationSlug)), 30_000);
    return () => clearInterval(id);
  }, [locationSlug]);

  const categories = useMemo(() => {
    const cats = [...new Set(itemsLive.map((i) => i.category))];
    return cats.sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b));
  }, [itemsLive]);

  const itemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of itemsLive.filter((i) => i.available)) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }
    return counts;
  }, [itemsLive]);

  const totalAvailable = useMemo(
    () => itemsLive.filter((i) => i.available).length,
    [itemsLive],
  );

  // null = "All" tab (search-friendly default that shows every category).
  const [activeCategory, setActiveCategory] = useState<MenuCategory | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const isSearching = searchQuery.trim().length > 0;
  const menuGridRef = useRef<HTMLDivElement>(null);

  const filteredItems = useMemo(() => {
    const available = itemsLive.filter((i) => i.available);
    let result: MenuItem[];
    if (isSearching) {
      const q = searchQuery.toLowerCase().trim();
      result = available.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.tags.some((t) => t.toLowerCase().includes(q)),
      );
    } else if (activeCategory) {
      result = available.filter((i) => i.category === activeCategory);
    } else {
      result = available;
    }
    return [...result].sort((a, b) => {
      const eng = compareMenuEngineering(a, b, locationSlug, upsellConfig);
      return eng !== 0 ? eng : a.name.localeCompare(b.name);
    });
  }, [itemsLive, activeCategory, searchQuery, isSearching, locationSlug, upsellConfig]);

  // V8 combos: render the first two DEFAULT_COMBO_DEALS as inline
  // wax-seal cards. The full bundle ladder lives on the homepage
  // BundlesShowcase; this is a curated taster at the menu surface.
  const inlineCombos = DEFAULT_COMBO_DEALS.slice(0, 2);

  const pickSurprise = () => {
    const available = itemsLive.filter((i) => i.available);
    if (available.length === 0) return;
    const random = available[Math.floor(Math.random() * available.length)];
    // Pre-fill the search to scroll the user to the surprise item.
    setSearchQuery(random.name);
    setTimeout(() => menuGridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  return (
    <>
      {/* Reorder rail for returning customers — kept above the V8 menu
       *  card so it doesn't clash with the V8 chrome. V8's mockup
       *  doesn't ship this; we keep it for the returning-customer
       *  flow it supports. */}
      {!isSearching && (
        <div className="mx-auto max-w-[1180px] px-[18px] md:px-[36px] pt-4 md:pt-6">
          <ReorderSection locationSlug={locationSlug} allMenuItems={items} />
        </div>
      )}

      {!isSearching && (
        <LayoutGate flag="showSeasonalSpecials">
          <div className="mx-auto max-w-[1180px] px-[18px] md:px-[36px]">
            <SeasonalSpecials locationSlug={locationSlug} />
          </div>
        </LayoutGate>
      )}

      <section id="menu" className="v8-menu-card">
        <div className="v8-ps-head">
          <div className="v8-ps-eyebrow">
            <span>The menu</span> <span className="bi-sec">· il menù</span>
          </div>
          <h2 className="v8-ps-title">
            What comes out of <span className="it">the oven</span>
          </h2>
          <p className="v8-ps-sub">
            Five pizzas of the day, one chef&apos;s pasta, and an espresso to
            close. Always.
          </p>
        </div>

        {/* Search input */}
        <div className="v8-menu-search">
          <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden>
            <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
            <path d="M14 14 L20 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="Search pizza, pasta, wine…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search menu"
            autoComplete="off"
          />
          {isSearching && (
            <button
              type="button"
              className="v8-menu-search-clear"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Per-location live activity strip */}
        <div className="v8-live-act" aria-label="Live menu activity">
          <span className="v8-live-act-pip" aria-hidden />
          <span>
            <strong className="num">{mounted ? activity.ordersInLastHour : "—"}</strong>{" "}
            <span>orders in the last hour</span>{" "}
            <span className="bi-sec">
              · {mounted ? activity.ordersInLastHour : "—"} ordini nell&apos;ultima
              ora
            </span>
          </span>
          <span className="v8-live-act-dot" aria-hidden>·</span>
          <span>
            Trending<span className="bi-sec"> · in tendenza</span>:{" "}
            <span className="v8-live-act-trend">
              {mounted ? activity.popularItemNow : "—"}
            </span>
          </span>
        </div>

        {/* Category tabs */}
        <div className="v8-cat-tabs" role="tablist" aria-label="Menu categories">
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === null}
            className={`v8-cat-tab ${activeCategory === null ? "is-on" : ""}`}
            onClick={() => { setActiveCategory(null); setSearchQuery(""); }}
          >
            <span>All</span>
            <span className="v8-cat-tab-count">{totalAvailable}</span>
          </button>
          {categories.map((cat) => {
            const it = CAT_IT[cat];
            const label = MENU_CATEGORY_LABELS[cat];
            const count = itemCounts[cat] ?? 0;
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={activeCategory === cat}
                className={`v8-cat-tab ${activeCategory === cat ? "is-on" : ""}`}
                onClick={() => { setActiveCategory(cat); setSearchQuery(""); }}
              >
                <span>{label}</span>
                {it && <span className="bi-sec">· {it}</span>}
                <span className="v8-cat-tab-count">{count}</span>
              </button>
            );
          })}
        </div>

        {/* 15-minute guarantee banner */}
        <div className="v8-guarantee" role="note">
          <span className="v8-guarantee-icon" aria-hidden>
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
              <circle cx="28" cy="28" r="18" stroke="currentColor" strokeWidth="1.8" fill="rgba(184,92,56,0.06)" />
              <path d="M28 12 L28 14 M28 42 L28 44 M12 28 L14 28 M42 28 L44 28" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M28 28 L28 16 M28 28 L36 32" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="28" cy="28" r="1.8" fill="currentColor" />
              <path d="M16 42 C 22 46, 34 46, 40 42" stroke="currentColor" strokeWidth="1.3" fill="none" opacity="0.5" />
            </svg>
          </span>
          <div className="v8-guarantee-text">
            <div className="v8-guarantee-title">
              <span>15 minutes guaranteed</span>{" "}
              <span className="bi-sec">· 15 minuti garantiti</span>
            </div>
            <div className="v8-guarantee-sub">
              Ready in 15 minutes — or your next drink&apos;s on us.
            </div>
          </div>
        </div>

        {/* Inline combo deals row with wax-seal stamps */}
        {!isSearching && (
          <div className="v8-combos">
            {inlineCombos.map((combo) => (
              <div key={combo.id} className="v8-combo-card">
                <div className="v8-combo-card-illus" aria-hidden>
                  {combo.id === "italian-classic" ? <PizzaIcon /> : <PastaIcon />}
                </div>
                <div className="v8-combo-card-body">
                  <div className="v8-combo-card-title">
                    {combo.name}
                  </div>
                  <div className="v8-combo-card-sub">{combo.description}</div>
                </div>
                <div className="v8-wax-seal" aria-label={`${combo.discountPercent} percent discount`}>
                  −{combo.discountPercent}%
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Surprise me pill */}
        {!isSearching && (
          <button
            type="button"
            className="v8-surprise"
            onClick={pickSurprise}
            aria-label="Surprise me — pick a random menu item"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" fill="rgba(201,162,62,0.1)" />
              <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" />
              <circle cx="15.5" cy="15.5" r="1.4" fill="currentColor" />
              <circle cx="12" cy="12" r="1.4" fill="currentColor" />
              <circle cx="15.5" cy="8.5" r="1.4" fill="currentColor" />
              <circle cx="8.5" cy="15.5" r="1.4" fill="currentColor" />
            </svg>
            <span>Surprise me</span>
            <span className="bi-sec">· sorprendimi</span>
          </button>
        )}

        {/* FOMO microline — kept for the existing live-presence pulse;
         *  V8 has no equivalent so it sits between chrome and items
         *  as a quiet bilingual line. */}
        <MenuFomoMicroLine locationSlug={locationSlug} />

        {/* Menu items grid */}
        <div ref={menuGridRef} className="v8-menu-items">
          {filteredItems.map((item, index) => {
            const heroSpan = !isSearching && activeCategory === null && item.menuRole === "hero";
            return (
              <div
                key={item.id}
                className={`menu-item-enter ${heroSpan ? "md:col-span-2" : ""}`}
                style={{ animationDelay: `${Math.min(index * 0.05, 0.3)}s` }}
              >
                <MenuItemCard
                  item={item}
                  locationSlug={locationSlug}
                  popularThisWeek={hotThisWeekIds.has(item.id)}
                  variant={heroSpan ? "hero" : "default"}
                  upsellConfig={upsellConfig}
                  compliance={compliance ?? null}
                />
              </div>
            );
          })}
        </div>

        {filteredItems.length === 0 && (
          <div className="v8-menu-empty">
            {isSearching
              ? `No items match "${searchQuery}"`
              : "No items available in this category right now."}
            {isSearching && (
              <>
                {" "}
                <button type="button" className="v8-menu-empty-clear" onClick={() => setSearchQuery("")}>
                  Clear search · azzera
                </button>
              </>
            )}
          </div>
        )}
      </section>
    </>
  );
}

// Combo card icons — V8's hand-tuned pizza wedge and pasta bowl.
function PizzaIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden>
      <path d="M6 32 L20 6 L34 32 Z" fill="#C9A23E" fillOpacity="0.18" stroke="#B85C38" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6 32 L34 32" stroke="#7A2B2B" strokeWidth="1.5" />
      <circle cx="16" cy="24" r="2" fill="#7A2B2B" />
      <circle cx="24" cy="22" r="2" fill="#7A2B2B" />
      <circle cx="20" cy="28" r="2" fill="#7A2B2B" />
      <circle cx="19" cy="16" r="1.5" fill="#4A7C59" />
    </svg>
  );
}

function PastaIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden>
      <circle cx="20" cy="22" r="13" stroke="#C9A23E" strokeWidth="1.5" fill="#F2E2C2" />
      <path d="M12 20 C 14 17, 18 17, 20 20 C 22 23, 26 23, 28 20" stroke="#C9A23E" strokeWidth="1.2" fill="none" />
      <path d="M12 24 C 14 21, 18 21, 20 24 C 22 27, 26 27, 28 24" stroke="#C9A23E" strokeWidth="1.2" fill="none" />
      <path d="M12 22 C 14 19, 18 19, 20 22 C 22 25, 26 25, 28 22" stroke="#B85C38" strokeWidth="1.2" fill="none" />
      <circle cx="18" cy="20" r="1.2" fill="#7A2B2B" />
      <circle cx="25" cy="24" r="1.2" fill="#7A2B2B" />
    </svg>
  );
}
