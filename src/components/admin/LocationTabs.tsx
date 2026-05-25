"use client";

import { MapPin } from "lucide-react";
import { locations as allLocations } from "@/data/locations";

const activeLocations = allLocations.filter((l) => l.isActive);

interface LocationTabsProps {
  value: string;
  onChange: (slug: string) => void;
  includeAll?: boolean;
}

export function LocationTabs({ value, onChange, includeAll = false }: LocationTabsProps) {
  const options = includeAll
    ? [{ slug: "", city: "All" }, ...activeLocations.map((l) => ({ slug: l.slug, city: l.city }))]
    : activeLocations.map((l) => ({ slug: l.slug, city: l.city }));

  return (
    <div className="flex gap-1 overflow-x-auto scrollbar-hide">
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
          <MapPin className="h-3.5 w-3.5" />
          {l.city}
        </button>
      ))}
    </div>
  );
}
