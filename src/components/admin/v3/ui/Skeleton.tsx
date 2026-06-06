"use client";

import type { CSSProperties } from "react";

/**
 * Shimmer placeholder. Prefer over a bare spinner when the loading content has
 * a known shape — mirror the real layout so the page doesn't jump on load.
 * Decorative: marked `aria-hidden`; put `aria-busy` on the region instead.
 */
export function Skeleton({
  className = "",
  width,
  height,
  radius,
  style,
}: {
  className?: string;
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`av3-skeleton ${className}`.trim()}
      style={{ width, height, ...(radius != null ? { borderRadius: radius } : null), ...style }}
      aria-hidden
    />
  );
}

/** A loading stand-in for a `.av3-kpi-rail` — same grid, N shimmer tiles. */
export function SkeletonKpiRail({ count = 4 }: { count?: number }) {
  return (
    <div className="av3-kpi-rail" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="av3-skeleton av3-skel-kpi" aria-hidden />
      ))}
    </div>
  );
}

/** A loading stand-in for a list/table body — N shimmer rows. */
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="av3-skel-rows" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="av3-skeleton av3-skel-row" aria-hidden />
      ))}
    </div>
  );
}
