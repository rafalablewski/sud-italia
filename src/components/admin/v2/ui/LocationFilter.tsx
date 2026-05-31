"use client";

import { MapPin, type LucideIcon } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { Select } from "./Select";

export type LocationFilterVariant = "tabs" | "dropdown";

interface LocationFilterProps {
  /** Selected location slug. `""` = "all locations" (only meaningful with `includeAll`). */
  value: string;
  onChange: (slug: string) => void;
  /**
   * `"tabs"`  — pill row, for multi-location *editors* you scan side-by-side
   *             (selling rules: Upsell / Cross-sell / Scheduled bundles).
   * `"dropdown"` — compact header select, for single-location *operational*
   *             views whose data is location-scoped (HACCP, Cash, Schedule…).
   * Defaults to `"dropdown"` — the more common, space-frugal case.
   */
  variant?: LocationFilterVariant;
  /** Prepend an "all locations" option (slug `""`). Off by default. */
  includeAll?: boolean;
  /** Label for the "all locations" option. */
  allLabel?: string;
  /** Accessible label for the `dropdown` variant's `<select>`. */
  ariaLabel?: string;
  /** Leading icon. Defaults to {@link MapPin}; pass a domain icon (Package, Truck) to match the page. */
  icon?: LucideIcon;
  className?: string;
}

/**
 * The single location switcher for every `/admin/*` page that filters by site.
 * Replaces the old hand-rolled `LocationTabs` pills and the inline
 * `v2-field-inline` + `Select` blocks — one controlled component, one source of
 * options ({@link getActiveLocations}), two visual variants. Pick `variant` by
 * intent (edit vs. view), not by taste.
 *
 * It is controlled (`value` / `onChange`) so it works with either page-local
 * state or the sidebar's `useAdminLocation()` context. The sidebar's own
 * global switcher stays `LocationSwitcher` — a different role (app-wide scope).
 */
export function LocationFilter({
  value,
  onChange,
  variant = "dropdown",
  includeAll = false,
  allLabel = "All",
  ariaLabel = "Location",
  icon: Icon = MapPin,
  className = "",
}: LocationFilterProps) {
  const active = getActiveLocations();
  const options = includeAll
    ? [{ slug: "", city: allLabel }, ...active.map((l) => ({ slug: l.slug, city: l.city }))]
    : active.map((l) => ({ slug: l.slug, city: l.city }));

  if (variant === "tabs") {
    return (
      <div className={`flex gap-1 overflow-x-auto scrollbar-hide ${className}`.trim()}>
        {options.map((l) => (
          <button
            key={l.slug}
            onClick={() => onChange(l.slug)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              value === l.slug
                ? "bg-[var(--brand-soft)] text-[var(--brand)] border border-[color-mix(in_oklab,var(--brand)_40%,transparent)]"
                : "text-[var(--fg-subtle)] border border-[var(--border)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)]"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {l.city}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={`v2-field-inline ${className}`.trim()}>
      <Icon className="h-3.5 w-3.5 v2-muted" />
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        options={options.map((l) => ({ value: l.slug, label: l.city }))}
        aria-label={ariaLabel}
      />
    </div>
  );
}
