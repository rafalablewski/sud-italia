"use client";

import { MapPin, type LucideIcon } from "lucide-react";
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
 * One look — a pill row — on **every** page, by design: operational views
 * (HACCP, Cash, Schedule…) and selling-rule editors (Upsell, Cross-sell,
 * Scheduled bundles) all render the same control, so the back office reads as
 * one product. There is deliberately **no variant** — a second rendering mode
 * is exactly how the old `LocationTabs` / inline-`Select` drift started.
 *
 * Controlled (`value` / `onChange`) and sourced from {@link getActiveLocations},
 * so a page never hand-builds option arrays. Wire it to page-local state
 * (`pageLoc`) or the sidebar's `useAdminLocation()` context.
 *
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
