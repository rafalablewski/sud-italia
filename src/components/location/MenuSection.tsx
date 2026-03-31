"use client";

import { useState, useMemo } from "react";
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
import { Search, X } from "lucide-react";

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

  const [activeCategory, setActiveCategory] = useState<MenuCategory | undefined>(
    categories[0]
  );
  const [searchQuery, setSearchQuery] = useState("");

  const isSearching = searchQuery.trim().length > 0;

  const filteredItems = useMemo(() => {
    const available = items.filter((i) => i.available);

    if (isSearching) {
      const q = searchQuery.toLowerCase().trim();
      return available.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return activeCategory
      ? available.filter((i) => i.category === activeCategory)
      : [];
  }, [items, activeCategory, searchQuery, isSearching]);

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

          {/* Category pills (hidden when searching) */}
          {!isSearching && (
            <MenuCategoryNav
              categories={categories}
              activeCategory={activeCategory!}
              onSelect={setActiveCategory}
            />
          )}
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
