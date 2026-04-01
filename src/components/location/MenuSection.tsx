"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { MenuItem } from "@/data/types";
import { MenuCategory, MENU_CATEGORY_LABELS } from "@/data/types";
import { Container } from "@/components/ui/Container";
import { MenuCategoryNav } from "./MenuCategoryNav";
import { MenuItemCard } from "./MenuItem";
import { SurpriseMe } from "./SurpriseMe";
import { SeasonalSpecials } from "./SeasonalSpecials";
import { ReorderSection } from "./ReorderSection";
import { SpeedGuarantee } from "./SpeedGuarantee";
import { ComboDealsPreview } from "./ComboDealsPreview";
import { ReferralCard } from "@/components/referral/ReferralCard";
import { AchievementsPanel } from "@/components/gamification/AchievementsPanel";
import { CustomerGate } from "@/components/loyalty/CustomerGate";
import { getItemBadges } from "@/lib/upsell";
import { getItemRating } from "@/data/ratings";
import { Search, X, ArrowUpDown, Check } from "lucide-react";

type MenuSortValue = "default" | "price-low" | "price-high" | "rating";

const MENU_SORT_OPTIONS: { value: MenuSortValue; label: string }[] = [
  { value: "default", label: "Popular first" },
  { value: "price-low", label: "Price: low → high" },
  { value: "price-high", label: "Price: high → low" },
  { value: "rating", label: "Highest rated" },
];

interface MenuSectionProps {
  items: MenuItem[];
  locationSlug: string;
}

export function MenuSection({ items, locationSlug }: MenuSectionProps) {
  const categories = useMemo(() => {
    const cats = [...new Set(items.map((i) => i.category))];
    const order: MenuCategory[] = [
      "pizza",
      "pasta",
      "antipasti",
      "panini",
      "drinks",
      "desserts",
    ];
    return cats.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }, [items]);

  const itemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items.filter((i) => i.available)) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }
    return counts;
  }, [items]);

  const [activeCategory, setActiveCategory] = useState<MenuCategory | undefined>(
    categories[0]
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<MenuSortValue>("price-low");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

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

  const filteredItems = useMemo(() => {
    const available = items.filter((i) => i.available);
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
    if (sortBy === "rating") return [...result].sort((a, b) => (getItemRating(b.id)?.rating || 0) - (getItemRating(a.id)?.rating || 0));
    // "default" — popular items first, then alphabetical
    return [...result].sort((a, b) => {
      const aPop = getItemBadges(a.id, locationSlug).includes("popular") ? 0 : 1;
      const bPop = getItemBadges(b.id, locationSlug).includes("popular") ? 0 : 1;
      return aPop - bPop || a.name.localeCompare(b.name);
    });
  }, [items, activeCategory, searchQuery, isSearching, sortBy, locationSlug]);

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
            <SurpriseMe items={items.filter((i) => i.available)} locationSlug={locationSlug} />
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
          {filteredItems.map((item, index) => (
            <div
              key={item.id}
              className="menu-item-enter"
              style={{ animationDelay: `${Math.min(index * 0.05, 0.3)}s` }}
            >
              <MenuItemCard
                item={item}
                locationSlug={locationSlug}
              />
            </div>
          ))}
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
        {/* Gamification & Referral — only visible to identified customers */}
        {!isSearching && (
          <div className="mt-10">
            <CustomerGate>
              <div className="space-y-6">
                <AchievementsPanel />
                <ReferralCard />
              </div>
            </CustomerGate>
          </div>
        )}
      </Container>
    </section>
  );
}
