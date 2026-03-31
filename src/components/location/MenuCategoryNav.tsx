"use client";

import { MenuCategory, MENU_CATEGORY_LABELS } from "@/data/types";
import { CATEGORY_ICONS } from "@/data/menu-ui";

interface MenuCategoryNavProps {
  categories: MenuCategory[];
  activeCategory: MenuCategory;
  onSelect: (category: MenuCategory) => void;
  itemCounts?: Record<string, number>;
}

export function MenuCategoryNav({
  categories,
  activeCategory,
  onSelect,
  itemCounts,
}: MenuCategoryNavProps) {
  return (
    <nav className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
      {categories.map((cat) => {
        const Icon = CATEGORY_ICONS[cat];
        const isActive = activeCategory === cat;
        const count = itemCounts?.[cat];
        return (
          <button
            key={cat}
            onClick={() => onSelect(cat)}
            className={`category-pill ${
              isActive ? "category-pill-active" : "category-pill-inactive"
            }`}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {MENU_CATEGORY_LABELS[cat]}
            {count !== undefined && (
              <span className={`text-[10px] ${isActive ? "opacity-70" : "opacity-50"}`}>{count}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
