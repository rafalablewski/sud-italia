"use client";

import { Check, ChevronDown, MapPin, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { getActiveLocations } from "@/data/locations";
import { Popover } from "./Popover";

interface Props {
  /** Selected location slug. `""` = all locations (only with `includeAll`). */
  value: string;
  onChange: (slug: string) => void;
  /** Allow an "all locations" scope (slug `""`). */
  includeAll?: boolean;
  allLabel?: string;
  /** Show search regardless of count (search auto-appears past this many). */
  searchThreshold?: number;
  className?: string;
}

/**
 * **Scope** — the one multi-location context selector (blueprint §3.3). It
 * replaces both the per-page `LocationFilter` pill row AND the sidebar
 * `LocationSwitcher`: location is operating *context*, not a per-page filter, so
 * there is one switcher in the product. Crucially it **changes shape with scale,
 * never identity**:
 *
 *   • 1 location  → a static label (nothing to switch)
 *   • 2–N         → a button → searchable popover list (search auto-appears past
 *                   `searchThreshold`, default 7)
 *
 * Selection uses the selection-as-raise language (`--surface-3` + `--border-strong`,
 * never a brand flood). Region/market grouping + multi-select aggregate scopes +
 * saved scopes are the documented next step, gated on adding that metadata to the
 * locations store (it has none today). This Phase-0 primitive is wired into the
 * shell breadcrumb in Phase 2.
 */
export function ScopeSwitcher({ value, onChange, includeAll = false, allLabel = "All locations", searchThreshold = 7, className = "" }: Props) {
  const active = getActiveLocations();
  const options = useMemo(
    () =>
      includeAll
        ? [{ slug: "", city: allLabel }, ...active.map((l) => ({ slug: l.slug, city: l.city }))]
        : active.map((l) => ({ slug: l.slug, city: l.city })),
    [active, includeAll, allLabel],
  );

  const current = options.find((o) => o.slug === value) ?? options[0];

  // Single location, no "all" scope → nothing to switch. Render a static label.
  if (options.length <= 1) {
    return (
      <span className={`v2-scope v2-scope-static ${className}`.trim()}>
        <MapPin className="h-3.5 w-3.5" aria-hidden />
        {current?.city ?? "—"}
      </span>
    );
  }

  return (
    <Popover
      placement="bottom-start"
      trigger={
        <button type="button" className={`v2-scope v2-scope-trigger ${className}`.trim()} aria-label="Switch location scope">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          <span className="v2-scope-label">{current?.city ?? "Select"}</span>
          <ChevronDown className="h-3.5 w-3.5 v2-scope-caret" aria-hidden />
        </button>
      }
    >
      {(close) => (
        <ScopePanel
          options={options}
          value={value}
          showSearch={options.length > searchThreshold}
          onPick={(slug) => {
            onChange(slug);
            close();
          }}
        />
      )}
    </Popover>
  );
}

function ScopePanel({
  options,
  value,
  showSearch,
  onPick,
}: {
  options: { slug: string; city: string }[];
  value: string;
  showSearch: boolean;
  onPick: (slug: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = q.trim() ? options.filter((o) => o.city.toLowerCase().includes(q.trim().toLowerCase())) : options;

  return (
    <div className="v2-scope-panel" role="listbox" aria-label="Locations">
      {showSearch && (
        <div className="v2-scope-search">
          <Search className="h-3.5 w-3.5" aria-hidden />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search locations…"
            aria-label="Search locations"
          />
        </div>
      )}
      <div className="v2-scope-list">
        {filtered.length === 0 ? (
          <div className="v2-scope-empty">No matches</div>
        ) : (
          filtered.map((o) => {
            const selected = o.slug === value;
            return (
              <button
                key={o.slug || "__all__"}
                type="button"
                role="option"
                aria-selected={selected}
                className={`v2-scope-opt ${selected ? "is-active" : ""}`}
                onClick={() => onPick(o.slug)}
              >
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                <span>{o.city}</span>
                {selected && <Check className="h-3.5 w-3.5 v2-scope-check" aria-hidden />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
