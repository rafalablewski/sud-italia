"use client";

import { MenuCategory } from "@/data/types";
import { CATEGORY_EMOJI, CATEGORY_GRADIENTS } from "@/data/menu-images";
import { useState } from "react";

interface MenuItemImageProps {
  category: MenuCategory;
  name: string;
  /** Optional photo URL. When provided, displays the photo with emoji fallback on error. */
  imageUrl?: string;
}

/**
 * Menu item image component.
 *
 * Supports real food photography when imageUrl is provided.
 * Falls back to emoji + gradient when no URL or on load error.
 *
 * To add photos:
 * 1. Place images in /public/images/menu/ (e.g., margherita.webp)
 * 2. Add imageUrl field to MenuItem type in src/data/types.ts
 * 3. Set imageUrl in menu data files (krakow.ts, warszawa.ts)
 *
 * Recommended format: WebP, 400x400px, <50KB per image
 */
export function MenuItemImage({ category, name, imageUrl }: MenuItemImageProps) {
  const gradient = CATEGORY_GRADIENTS[category] || "from-gray-400 to-gray-300";
  const emoji = CATEGORY_EMOJI[category] || "🍽️";
  const [imgError, setImgError] = useState(false);

  const showPhoto = imageUrl && !imgError;

  return (
    <div
      className={`flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm overflow-hidden`}
      role="img"
      aria-label={name}
    >
      {showPhoto ? (
        <img
          src={imageUrl}
          alt={name}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="text-2xl sm:text-3xl select-none drop-shadow-sm" aria-hidden="true">{emoji}</span>
      )}
    </div>
  );
}
