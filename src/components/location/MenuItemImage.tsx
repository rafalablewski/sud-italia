"use client";

import { MenuCategory } from "@/data/types";
import { CATEGORY_EMOJI, CATEGORY_GRADIENTS } from "@/data/menu-images";

interface MenuItemImageProps {
  category: MenuCategory;
  name: string;
}

export function MenuItemImage({ category, name }: MenuItemImageProps) {
  const gradient = CATEGORY_GRADIENTS[category] || "from-gray-400 to-gray-300";
  const emoji = CATEGORY_EMOJI[category] || "🍽️";

  return (
    <div
      className={`flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm overflow-hidden`}
      title={name}
    >
      <span className="text-2xl sm:text-3xl select-none drop-shadow-sm">{emoji}</span>
    </div>
  );
}
