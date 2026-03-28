"use client";

import { cn } from "@/lib/utils";
import { MenuCategory, MENU_CATEGORY_LABELS } from "@/data/types";

interface MenuCategoryNavProps {
  categories: MenuCategory[];
  activeCategory: MenuCategory;
  onSelect: (category: MenuCategory) => void;
}

export function MenuCategoryNav({
  categories,
  activeCategory,
  onSelect,
}: MenuCategoryNavProps) {
  return (
    <div className="sticky top-16 md:top-20 z-20 bg-white border-b border-gray-100 shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <nav className="flex gap-1 overflow-x-auto scrollbar-hide py-3 -mx-4 px-4 sm:mx-0 sm:px-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => onSelect(cat)}
              className={cn(
                "whitespace-nowrap px-5 py-2 rounded-full text-sm font-medium transition-colors flex-shrink-0",
                activeCategory === cat
                  ? "bg-italia-red text-white"
                  : "text-italia-gray hover:bg-gray-100 hover:text-italia-dark"
              )}
            >
              {MENU_CATEGORY_LABELS[cat]}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
