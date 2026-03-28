"use client";

import { MenuCategory, MENU_CATEGORY_LABELS } from "@/data/types";
import {
  Pizza,
  Soup,
  Salad,
  Sandwich,
  Wine,
  IceCreamCone,
} from "lucide-react";

interface MenuCategoryNavProps {
  categories: MenuCategory[];
  activeCategory: MenuCategory;
  onSelect: (category: MenuCategory) => void;
}

const CATEGORY_ICONS: Record<MenuCategory, React.ElementType> = {
  pizza: Pizza,
  pasta: Soup,
  antipasti: Salad,
  panini: Sandwich,
  drinks: Wine,
  desserts: IceCreamCone,
};

export function MenuCategoryNav({
  categories,
  activeCategory,
  onSelect,
}: MenuCategoryNavProps) {
  return (
    <nav className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
      {categories.map((cat) => {
        const Icon = CATEGORY_ICONS[cat];
        const isActive = activeCategory === cat;
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
          </button>
        );
      })}
    </nav>
  );
}
