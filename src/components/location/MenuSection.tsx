"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { MenuItem } from "@/data/types";
import { MenuCategory, MENU_CATEGORY_LABELS } from "@/data/types";
import { Container } from "@/components/ui/Container";
import { MenuCategoryNav } from "./MenuCategoryNav";
import { MenuItemCard } from "./MenuItem";
import { MenuFomoMicroLine } from "./MenuFomoMicroLine";
import { SurpriseMe } from "./SurpriseMe";
import { SeasonalSpecials } from "./SeasonalSpecials";
import { ReorderSection } from "./ReorderSection";
import { SpeedGuarantee } from "./SpeedGuarantee";
import { ComboDealsPreview } from "./ComboDealsPreview";
import { compareMenuEngineering, type UpsellConfig } from "@/lib/upsell";
import { useLiveMenuAvailability } from "@/lib/useLiveMenuAvailability";
import { Search, X, ArrowUpDown, Check } from "lucide-react";

type MenuSortValue = "default" | "price-low" | "price-high";

const MENU_SORT_OPTIONS: { value: MenuSortValue; label: string }[] = [
  // "default" applies the audit §4.4 hierarchy: hero → profit-driver →
  // anchor → standard items by popularity. Falls back to alphabetical
  // inside each band so two equally-rated items resolve deterministically.
  { value: "default", label: "Pizzaiolo's layout" },
  { value: "price-low", label: "Price: low → high" },
  { value: "price-high", label: "Price: high → low" },
];

interface MenuSectionProps {
  items: MenuItem[];
  locationSlug: string;
  /**
   * SSR snapshot of which items are available. The live hook polls
   * /api/menu/availability and overrides this map when admin toggles an item.
   * Defaults to each item's own `available` flag for backward compatibility
   * with callers that don't yet pass it (e.g. tests or older fixtures).
   */
  initialAvailability?: Record<string, boolean>;
}

export function MenuSection({ items, locationSlug, initialAvailability }: MenuSectionProps) {
  // Editorial badges from /admin/crosssell → Menu badges. Fetched once per
  // mount; each MenuItemCard reads from it (no per-item refetch).
  const [upsellConfig, setUpsellConfig] = useState<UpsellConfig | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/settings/upsell?location=${locationSlug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled && data) setUpsellConfig(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [locationSlug]);

  const fallbackAvailability = useMemo(() => {
    if (initialAvailability) return initialAvailability;
    const map: Record<string, boolean> = {};
    for (const item of items) map[item.id] = item.available;
    return map;
  }, [initialAvailability, items]);

  const liveAvailability = useLiveMenuAvailability(locationSlug, fallbackAvailability);

  // Apply live availability on top of each item so downstream renders see the
  // freshest state. This is the single source of truth for "is it 86'd?".
  const itemsLive: MenuItem[] = useMemo(
    () =>
      items.map((i) => {
        const live = liveAvailability[i.id];
        return live === undefined || live === i.available ? i : { ...i, available: live };
      }),
    [items, liveAvailability],
  );

  const categories = useMemo(() => {
    // Categories are derived from the entire menu, not just the available
    // subset — that way "Pizza" doesn't disappear when every pizza is 86'd,
    // it just shows the empty state. Keeps tab positions stable.
    const cats = [...new Set(itemsLive.map((i) => i.category))];
    const order: MenuCategory[] = [
      "pizza",
      "pasta",
      "antipasti",
      "panini",
      "drinks",
      "desserts",
    ];
    return cats.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }, [itemsLive]);

  const itemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of itemsLive.filter((i) => i.available)) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }
    return counts;
  }, [itemsLive]);

  const [activeCategory, setActiveCategory] = useState<MenuCategory | undefined>(
    categories[0]
  );
  const [searchQuery, setSearchQuery] = useState("");
  // Default to the menu-engineering hierarchy (audit §4.4) instead of the
  // historical price-low default. Users can still flip the sort dropdown.
  const [sortBy, setSortBy] = useState<MenuSortValue>("default");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const [hotThisWeekIds, setHotThisWeekIds] = useState<Set<string>>(new Set());

  const isSearching = searchQuery.trim().length > 0;
  const sortLabel =
    MENU_SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? "Price: low → high";

  useEffect(() => {
    if (!sortMenuOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const el = sortMenuRef.current;
      if (el && !el.contains(e.target as Node)) setSortMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSortMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [sortMenuOpen]);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/menu/item-popularity?location=${encodeURIComponent(locationSlug)}`
    )
      .then((r) => r.json())
      .then((data: { itemIds?: string[] }) => {
        if (cancelled) return;
        setHotThisWeekIds(new Set(data.itemIds ?? []));
      })
      .catch(() => {
        if (!cancelled) setHotThisWeekIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [locationSlug]);

  const filteredItems = useMemo(() => {
    const available = itemsLive.filter((i) => i.available);
    let result: MenuItem[];

    if (isSearching) {
      const q = searchQuery.toLowerCase().trim();
      result = available.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.tags.some((t) => t.toLowerCase().includes(q))
      );
    } else {
      result = activeCategory
        ? available.filter((i) => i.category === activeCategory)
        : [];
    }

    if (sortBy === "price-low") return [...result].sort((a, b) => a.price - b.price);
    if (sortBy === "price-high") return [...result].sort((a, b) => b.price - a.price);
    // "default" — Pizzaiolo's layout (audit §4.4):
    //   hero → profit-driver → anchor → standards by popularity → alpha tie-break.
    // compareMenuEngineering already does the popularity tie-break inside
    // its residual band, so we only need an alpha fallback for items that
    // are equally-ranked across both signals.
    return [...result].sort((a, b) => {
      const eng = compareMenuEngineering(a, b, locationSlug, upsellConfig);
      return eng !== 0 ? eng : a.name.localeCompare(b.name);
    });
  }, [itemsLive, activeCategory, searchQuery, isSearching, sortBy, locationSlug, upsellConfig]);

  if (categories.length === 0 || (!activeCategory && !isSearching)) {
    return (
      <section id="menu">
        <Container className="py-12">
          <p className="text-center text-italia-gray">
            No menu items available right now.
          </p>
        </Container>
      </section>
    );
  }

  return (
    <section id="menu">
      {/* Search bar */}
      <div className="sticky top-16 md:top-20 z-20 bg-white border-b border-gray-100 shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
          <div className="menu-search mb-3">
            <Search className="menu-search-icon h-5 w-5" />
            <input
              type="text"
              placeholder="Search for pizza, pasta, drinks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="menu-search-input"
            />
            {isSearching && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="h-4 w-4 text-italia-gray" />
              </button>
            )}
          </div>

          <MenuFomoMicroLine locationSlug={locationSlug} />

          {/* Sort + Category pills */}
          <div
            className={`flex items-center gap-2 mb-1 ${
              isSearching ? "justify-end" : "justify-between"
            }`}
          >
            {!isSearching && (
              <MenuCategoryNav
                categories={categories}
                activeCategory={activeCategory!}
                onSelect={setActiveCategory}
                itemCounts={itemCounts}
              />
            )}
            <div className="relative flex-shrink-0" ref={sortMenuRef}>
              <button
                type="button"
                onClick={() => setSortMenuOpen((o) => !o)}
                className={`category-pill category-pill-inactive !p-0 h-10 w-10 min-w-10 shrink-0 justify-center rounded-full transition-shadow ${
                  sortMenuOpen ? "ring-2 ring-italia-red/25 bg-gray-50" : ""
                }`}
                aria-expanded={sortMenuOpen}
                aria-haspopup="listbox"
                aria-label={`Sort menu: ${sortLabel}`}
              >
                <ArrowUpDown className="h-4 w-4" aria-hidden />
              </button>
              {sortMenuOpen && (
                <div
                  className="absolute right-0 top-[calc(100%+0.35rem)] z-30 min-w-[14.5rem] rounded-xl border border-gray-100 bg-white py-1 shadow-lg shadow-black/[0.06]"
                  role="listbox"
                  aria-label="Sort options"
                >
                  {MENU_SORT_OPTIONS.map((opt) => {
                    const selected = sortBy === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                          selected
                            ? "bg-red-50 font-medium text-italia-red"
                            : "text-italia-dark hover:bg-gray-50"
                        }`}
                        onClick={() => {
                          setSortBy(opt.value);
                          setSortMenuOpen(false);
                        }}
                      >
                        <span>{opt.label}</span>
                        {selected && (
                          <Check className="h-4 w-4 shrink-0 text-italia-red" aria-hidden />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reorder from history — first thing returning customers see */}
      {!isSearching && (
        <Container className="pt-6">
          <ReorderSection locationSlug={locationSlug} allMenuItems={items} />
        </Container>
      )}

      <Container className="py-6">
        {/* Speed guarantee banner */}
        {!isSearching && <SpeedGuarantee />}

        {/* Combo deals discovery (visible before browsing) */}
        {!isSearching && <ComboDealsPreview locationSlug={locationSlug} />}

        {/* Seasonal specials (Kodawari - limited-time) */}
        {!isSearching && <SeasonalSpecials locationSlug={locationSlug} />}

        {/* Surprise Me feature */}
        {!isSearching && (
          <div className="mb-6">
            <SurpriseMe items={itemsLive.filter((i) => i.available)} locationSlug={locationSlug} />
          </div>
        )}

        {isSearching ? (
          <p className="text-sm text-italia-gray mb-4">
            {filteredItems.length} result{filteredItems.length !== 1 ? "s" : ""} for &ldquo;{searchQuery}&rdquo;
          </p>
        ) : (
          <h2 className="text-2xl font-heading font-bold text-italia-dark mb-6">
            {MENU_CATEGORY_LABELS[activeCategory!]}
          </h2>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredItems.map((item, index) => {
            // Only stretch the hero across both columns when the menu-engineering
            // sort is in play and we're not in a search view — otherwise the
            // ordering loses meaning and a stretched card looks arbitrary.
            const heroSpan =
              !isSearching && sortBy === "default" && item.menuRole === "hero";
            return (
              <div
                key={item.id}
                className={`menu-item-enter ${heroSpan ? "lg:col-span-2" : ""}`}
                style={{ animationDelay: `${Math.min(index * 0.05, 0.3)}s` }}
              >
                <MenuItemCard
                  item={item}
                  locationSlug={locationSlug}
                  popularThisWeek={hotThisWeekIds.has(item.id)}
                  variant={heroSpan ? "hero" : "default"}
                  upsellConfig={upsellConfig}
                />
              </div>
            );
          })}
        </div>

        {filteredItems.length === 0 && (
          <div className="text-center py-16">
            <Search className="h-12 w-12 text-gray-200 mx-auto mb-4" />
            <p className="text-italia-gray font-medium">
              {isSearching
                ? "No items match your search"
                : "No items available in this category right now"}
            </p>
            {isSearching && (
              <button
                onClick={() => setSearchQuery("")}
                className="mt-3 text-sm text-italia-red font-medium hover:underline"
              >
                Clear search
              </button>
            )}
          </div>
        )}
      </Container>
    </section>
  );
}
