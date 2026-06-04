"use client";

import { MapPin, ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getActiveLocations } from "@/data/locations";

interface LocationFilterProps {
  /** Selected location slug. `""` = "all locations" (only meaningful with `includeAll`). */
  value: string;
  onChange: (slug: string) => void;
  /** Prepend an "all locations" pill (slug `""`). Off by default. */
  includeAll?: boolean;
  /** Label for the "all locations" pill. */
  allLabel?: string;
  /** Leading icon on every pill. Defaults to {@link MapPin}; keep it MapPin for cross-page consistency. */
  icon?: LucideIcon;
  className?: string;
}

/**
 * The single location switcher for every `/admin/*` page that filters by site.
 * **One look — a pill row — on every page**, by design: operational views
 * (HACCP, Cash, Schedule…) and selling-rule editors (Upsell, Cross-sell…) all
 * render the same control, so the back office reads as one product.
 *
 * It **scales without changing shape**: the pills live in a horizontal scroller
 * with left/right chevron controls that appear only when the row overflows — so
 * a 2-truck shop sees two pills and a 15-site network sees a tidy left/right
 * scroll, never a cramped wrap or a different widget. There is deliberately **no
 * per-page `variant`** (a dropdown / second mode is exactly how the old
 * `LocationTabs` / inline-`Select` drift started).
 *
 * Controlled (`value` / `onChange`) and sourced from {@link getActiveLocations}.
 * The sidebar's app-wide `LocationSwitcher` is a separate thing (global default,
 * persisted) — don't reach for it per-page.
 */
export function LocationFilter({
  value,
  onChange,
  includeAll = false,
  allLabel = "All",
  icon: Icon = MapPin,
  className = "",
}: LocationFilterProps) {
  const active = getActiveLocations();
  const options = includeAll
    ? [{ slug: "", city: allLabel }, ...active.map((l) => ({ slug: l.slug, city: l.city }))]
    : active.map((l) => ({ slug: l.slug, city: l.city }));

  const trackRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 2);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    sync();
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", sync);
      return () => window.removeEventListener("resize", sync);
    }
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sync, options.length]);

  const scrollBy = (dir: 1 | -1) =>
    trackRef.current?.scrollBy({ left: dir * Math.max(160, (trackRef.current.clientWidth || 200) * 0.7), behavior: "smooth" });

  return (
    <div className={`v2-locscroll ${canLeft ? "is-l" : ""} ${canRight ? "is-r" : ""} ${className}`.trim()}>
      <button
        type="button"
        className="v2-locscroll-arrow v2-locscroll-arrow-l"
        onClick={() => scrollBy(-1)}
        aria-label="Scroll locations left"
        tabIndex={canLeft ? 0 : -1}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div ref={trackRef} className="v2-locscroll-track" onScroll={sync}>
        {options.map((l) => (
          <button
            key={l.slug}
            type="button"
            onClick={() => onChange(l.slug)}
            className={`v2-locpill ${value === l.slug ? "is-active" : ""}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {l.city}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="v2-locscroll-arrow v2-locscroll-arrow-r"
        onClick={() => scrollBy(1)}
        aria-label="Scroll locations right"
        tabIndex={canRight ? 0 : -1}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
