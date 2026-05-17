"use client";

import { useRef, useState, type ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface StatItem {
  label: string;
  value: ReactNode;
  /** Optional formatted delta (e.g. "+12%"). The sign drives the tone. */
  delta?: number;
  /** Higher is better — only used to color the delta. Defaults to true. */
  higherIsBetter?: boolean;
  /** Inline hint under the value. */
  hint?: ReactNode;
  /** Optional small chart row (sparkline component). */
  trend?: ReactNode;
  /** Icon at the top-right of the card. */
  icon?: LucideIcon;
  /** Optional tap-through target. */
  href?: string;
  /** Tone of the icon chip. */
  tone?: "brand" | "info" | "success" | "warning" | "danger" | "neutral";
}

interface Props {
  items: StatItem[];
  /** When set, renders the stat at this index as the hero (full-bleed). */
  heroIndex?: number;
}

/**
 * Horizontally swipeable pager of stats. One hero stat per page on mobile.
 * Snap-points and momentum scrolling are CSS-native (`scroll-snap-type`).
 * Position dots reflect the current index.
 */
export function StatRow({ items, heroIndex }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(heroIndex ?? 0);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const w = el.clientWidth;
    const idx = Math.round(el.scrollLeft / Math.max(w, 1));
    setActive(idx);
  };

  return (
    <div className="v2-m-statrow">
      <div
        ref={ref}
        className="v2-m-statrow-track"
        onScroll={onScroll}
        role="region"
        aria-label="Key metrics"
      >
        {items.map((it, i) => (
          <StatCard key={`${it.label}-${i}`} stat={it} />
        ))}
      </div>
      {items.length > 1 && (
        <div className="v2-m-statrow-dots" aria-hidden>
          {items.map((_, i) => (
            <span key={i} className={i === active ? "is-active" : ""} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ stat }: { stat: StatItem }) {
  const Icon = stat.icon;
  const tone = stat.tone ?? "neutral";
  const deltaTone =
    stat.delta == null
      ? "neutral"
      : (stat.higherIsBetter ?? true)
        ? stat.delta >= 0
          ? "positive"
          : "negative"
        : stat.delta >= 0
          ? "negative"
          : "positive";

  const inner = (
    <>
      <div className="v2-m-stat-top">
        <div className="v2-m-stat-label">{stat.label}</div>
        {Icon && (
          <span className={`v2-m-stat-icon v2-m-tone-${tone}`} aria-hidden>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="v2-m-stat-value tabular">{stat.value}</div>
      <div className="v2-m-stat-bottom">
        {stat.delta != null && (
          <span className={`v2-m-stat-delta v2-m-delta-${deltaTone}`}>
            {stat.delta >= 0 ? (
              <TrendingUp className="h-3 w-3" aria-hidden />
            ) : (
              <TrendingDown className="h-3 w-3" aria-hidden />
            )}
            {Math.abs(stat.delta).toFixed(stat.delta % 1 === 0 ? 0 : 1)}%
          </span>
        )}
        {stat.hint && <span className="v2-m-stat-hint">{stat.hint}</span>}
      </div>
      {stat.trend && <div className="v2-m-stat-trend">{stat.trend}</div>}
    </>
  );

  if (stat.href) {
    return (
      <a className="v2-m-stat" href={stat.href}>
        {inner}
      </a>
    );
  }
  return <div className="v2-m-stat">{inner}</div>;
}
