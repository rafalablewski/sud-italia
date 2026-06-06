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

/** A loading stand-in for the Kanban board — N lanes, each with shimmer cards. */
export function SkeletonKanban({ columns = 4, cards = 3 }: { columns?: number; cards?: number }) {
  return (
    <div className="av3-kanban" aria-busy="true">
      {Array.from({ length: columns }, (_, c) => (
        <div className="av3-kcol" key={c}>
          <div className="av3-kcol-head"><Skeleton width={80} height={11} radius={999} /></div>
          <div className="av3-kcol-body">
            {Array.from({ length: cards }, (_, i) => (
              <Skeleton key={i} height={64} radius={8} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Whole-page loading stand-in for the `if (loading) return …` branches: a
 * title strip, an optional KPI rail, and a card of rows. Neutral enough to
 * stand in for most admin pages without a jarring jump when data arrives.
 */
export function SkeletonPage({ kpis = 0, rows = 6 }: { kpis?: number; rows?: number }) {
  return (
    <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Skeleton width={180} height={24} radius={6} />
      {kpis > 0 && <SkeletonKpiRail count={kpis} />}
      <div className="av3-card" style={{ padding: 12 }}>
        <SkeletonRows rows={rows} />
      </div>
    </div>
  );
}
