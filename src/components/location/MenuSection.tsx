"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { MenuItem } from "@/data/types";
import { MenuCategory, MENU_CATEGORY_LABELS } from "@/data/types";
import { MenuItemCard } from "./MenuItem";
import { SeasonalSpecials } from "./SeasonalSpecials";
import { LayoutGate } from "@/components/layout/LayoutGate";
import { ReorderSection } from "./ReorderSection";
import { DEFAULT_COMBO_DEALS } from "@/lib/upsell";
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
// The chrome markup (search, tabs, guarantee, combos, surprise) is
// inline V8 — the pre-V8 SpeedGuarantee / ComboDealsPreview /
// SurpriseMe / MenuCategoryNav components were deleted in Step H.
// Items still render via <MenuItemCard />.

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
  /** SSR seed for the operator-managed speed guarantee (minutes / copy /
   *  on-off). Passed from the server page so the banner renders correctly on
   *  first paint — no flash of a default or disabled banner before the client
   *  settings fetch resolves. The client fetch then keeps it live. */
  speedGuarantee?: import("@/lib/public-settings").PublicSettings["speedGuarantee"];
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

export function MenuSection({ items, locationSlug, initialAvailability, compliance, speedGuarantee: initialSpeedGuarantee }: MenuSectionProps) {
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

  // Speed-guarantee SLA (operator-managed: minutes, copy, on/off). Seeded
  // from the server (SSR prop) so first paint already shows the real value —
  // no layout shift and no flash of a default/disabled banner before a fetch
  // resolves (same SSR-to-avoid-flicker pattern the page uses for compliance).
  // The fetch below only keeps it live if the operator toggles it after the
  // page was rendered/cached.
  const [speedGuarantee, setSpeedGuarantee] =
    useState<import("@/lib/public-settings").PublicSettings["speedGuarantee"]>(initialSpeedGuarantee);
  useEffect(() => {
    let cancelled = false;
    import("@/lib/public-settings")
      .then(({ fetchPublicSettings }) => fetchPublicSettings(locationSlug))
      .then((s) => { if (!cancelled && s) setSpeedGuarantee(s.speedGuarantee); })
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

  // null = "All" tab (V8's design defaults to All-first; the previous
  // pre-V8 site defaulted to the first category — V8 trades a
  // single-category-on-load for a browsing-friendly default).
  const [activeCategory, setActiveCategory] = useState<MenuCategory | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const isSearching = searchQuery.trim().length > 0;
  const menuGridRef = useRef<HTMLDivElement>(null);

  // Sort affordance — V8 mockup omits a user-facing sort dropdown, but
  // the pre-V8 site shipped one (default / price-low / price-high).
  // Removing it would be a real feature regression for visitors who
  // want a price-sorted glance. Restored as a small V8-styled popover
  // sitting inline with the category tabs (the popover row).
  type MenuSortValue = "default" | "price-low" | "price-high";
  const [sortBy, setSortBy] = useState<MenuSortValue>("default");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sortMenuOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const el = sortMenuRef.current;
      if (el && !el.contains(e.target as Node)) setSortMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSortMenuOpen(false); };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [sortMenuOpen]);

  // Surprise-me: pick a random item, scroll its card into view, give
  // it a brief pulse so the visitor can see what was picked WITHOUT
  // filtering everything else out (pre-V8 used a search prefill which
  // hid the rest of the menu until the visitor cleared search).
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
  }, []);

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
    if (sortBy === "price-low") return [...result].sort((a, b) => a.price - b.price);
    if (sortBy === "price-high") return [...result].sort((a, b) => b.price - a.price);
    return [...result].sort((a, b) => {
      const eng = compareMenuEngineering(a, b, locationSlug, upsellConfig);
      return eng !== 0 ? eng : a.name.localeCompare(b.name);
    });
  }, [itemsLive, activeCategory, searchQuery, isSearching, sortBy, locationSlug, upsellConfig]);

  // V8 combos: render the first two DEFAULT_COMBO_DEALS as inline
  // wax-seal cards. The full bundle ladder lives on the homepage
  // BundlesShowcase; this is a curated taster at the menu surface.
  const inlineCombos = DEFAULT_COMBO_DEALS.slice(0, 2);

  const pickSurprise = () => {
    const available = itemsLive.filter((i) => i.available);
    if (available.length === 0) return;
    const random = available[Math.floor(Math.random() * available.length)];
    // Switch to All so the picked item is reachable regardless of which
    // category was active, but don't search-filter — visitor sees the
    // pick in context with the rest of the menu around it.
    setSearchQuery("");
    setActiveCategory(null);
    setHighlightId(random.id);
    // Wait for re-render then scroll + highlight the picked card.
    setTimeout(() => {
      const node = menuGridRef.current?.querySelector<HTMLElement>(`[data-menu-item-id="${random.id}"]`);
      if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightId(null), 2400);
  };

  return (
    <>
      {/* Reorder rail for returning customers — kept above the V8 menu
       *  card so it doesn't clash with the V8 chrome. V8's mockup
       *  doesn't ship this; we keep it for the returning-customer
       *  flow it supports. */}
      {!isSearching && (
        <ReorderSection locationSlug={locationSlug} allMenuItems={items} />
      )}

      {!isSearching && (
        <LayoutGate flag="showSeasonalSpecials">
          <SeasonalSpecials locationSlug={locationSlug} />
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

          {/* Sort popover — sits inline with the category tabs at the
           *  far right. V8 mockup doesn't ship a sort UI; we add a
           *  minimal V8-styled popover so visitors who want a
           *  price-sorted glance keep the pre-V8 feature. */}
          <div className="v8-cat-sort" ref={sortMenuRef}>
            <button
              type="button"
              className={`v8-cat-tab v8-cat-sort-trigger ${sortBy !== "default" ? "is-on" : ""}`}
              onClick={() => setSortMenuOpen((o) => !o)}
              aria-expanded={sortMenuOpen}
              aria-haspopup="listbox"
              aria-label={`Sort by — currently ${
                sortBy === "default" ? "Pizzaiolo's layout" : sortBy === "price-low" ? "price low → high" : "price high → low"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M4 3 L4 13 M4 13 L2 11 M4 13 L6 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 13 L12 3 M12 3 L10 5 M12 3 L14 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Sort</span>
            </button>
            {sortMenuOpen && (
              <div className="v8-cat-sort-menu" role="listbox" aria-label="Sort options">
                {([
                  { value: "default", label: "Pizzaiolo's layout", it: "scelta dello chef" },
                  { value: "price-low", label: "Price: low → high", it: "prezzo crescente" },
                  { value: "price-high", label: "Price: high → low", it: "prezzo decrescente" },
                ] as { value: MenuSortValue; label: string; it: string }[]).map((opt) => {
                  const selected = sortBy === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`v8-cat-sort-opt ${selected ? "is-selected" : ""}`}
                      onClick={() => { setSortBy(opt.value); setSortMenuOpen(false); }}
                    >
                      <span>{opt.label}</span>
                      <span className="bi-sec">· {opt.it}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Speed-guarantee banner — operator-managed minutes + copy + on/off
            (LoyaltySettings.speedGuarantee via /api/settings/public). Hidden
            when the operator switches it off so the page never promises a
            time the kitchen isn't committing to. */}
        {speedGuarantee?.active !== false && (
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
                <span>{speedGuarantee?.maxMinutes ?? 15} minutes guaranteed</span>{" "}
                <span className="bi-sec">· {speedGuarantee?.maxMinutes ?? 15} minuti garantiti</span>
              </div>
              <div className="v8-guarantee-sub">
                {speedGuarantee?.guaranteeText ??
                  `Ready in ${speedGuarantee?.maxMinutes ?? 15} minutes — or your next drink's on us.`}
              </div>
            </div>
          </div>
        )}

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

        {/* Menu items grid */}
        <div ref={menuGridRef} className="v8-menu-items">
          {filteredItems.map((item, index) => {
            const heroSpan = !isSearching && activeCategory === null && item.menuRole === "hero";
            const isHighlighted = highlightId === item.id;
            return (
              <div
                key={item.id}
                data-menu-item-id={item.id}
                className={`menu-item-enter ${heroSpan ? "md:col-span-2" : ""} ${isHighlighted ? "v8-menu-item-highlight" : ""}`}
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
