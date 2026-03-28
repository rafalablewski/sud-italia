"use client";

import { useState } from "react";
import { Star } from "lucide-react";

interface StarRatingProps {
  rating?: number;
  reviewCount?: number;
  size?: "sm" | "md";
  interactive?: boolean;
  onRate?: (rating: number) => void;
}

export function StarRating({
  rating = 0,
  reviewCount,
  size = "sm",
  interactive = false,
  onRate,
}: StarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const displayRating = hovered ?? selected ?? rating;
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";

  const handleClick = (star: number) => {
    if (!interactive) return;
    setSelected(star);
    onRate?.(star);
  };

  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => handleClick(star)}
            onMouseEnter={() => interactive && setHovered(star)}
            onMouseLeave={() => interactive && setHovered(null)}
            disabled={!interactive}
            className={`${interactive ? "cursor-pointer hover:scale-110" : "cursor-default"} transition-transform`}
          >
            <Star
              className={`${iconSize} ${
                star <= displayRating
                  ? "fill-italia-gold text-italia-gold"
                  : "fill-none text-gray-300"
              } transition-colors`}
            />
          </button>
        ))}
      </div>
      {rating > 0 && (
        <span className="text-xs text-italia-gray font-medium ml-0.5">
          {rating.toFixed(1)}
        </span>
      )}
      {reviewCount !== undefined && reviewCount > 0 && (
        <span className="text-xs text-italia-gray">
          ({reviewCount})
        </span>
      )}
    </div>
  );
}
