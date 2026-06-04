import type { ReactNode } from "react";
import { LocationFilter } from "./LocationFilter";
import { Select } from "./Select";
import { Tabs } from "./Tabs";

interface TabOption {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
}
interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  /** Page title — serif h1, row 1. */
  title: ReactNode;
  /** One-line description — row 2, left. */
  subtitle?: ReactNode;
  /** Icon-only action buttons — row 2, right. The only free-form slot. */
  actions?: ReactNode;
  /** Location filter — row 3. ALWAYS rendered as the pill `LocationFilter`. */
  location?: { value: string; onChange: (slug: string) => void; includeAll?: boolean; allLabel?: string };
  /** Primary list/status filter — row 4. ALWAYS a pill `Tabs`. Use for short option sets. */
  filter?: { value: string; onChange: (value: string) => void; options: TabOption[]; ariaLabel?: string };
  /** Secondary filters with many/long options — row 4, after the pill filter.
   *  ALWAYS rendered as `Select` dropdowns (consistent verbose-filter widget). */
  dropdowns?: { ariaLabel: string; value: string; onChange: (value: string) => void; options: SelectOption[] }[];
  /** Section navigation — row 5. ALWAYS an underline `Tabs`. */
  nav?: { value: string; onChange: (value: string) => void; options: TabOption[]; ariaLabel?: string };
}

/**
 * The one shared subpage hero — a raised panel (platinum left rail) laid out as
 * fixed stacked rows so every `/admin` page reads identically:
 *
 *   1. title
 *   2. subtitle (left) ⟷ actions (right)
 *   3. location
 *   4. filter (pill) + verbose dropdowns
 *   5. nav (underline tabs)
 *
 * **Data-driven and enforced:** every role takes DATA (not JSX) and the hero
 * renders the single canonical widget for it — location is always the pill
 * `LocationFilter`, the primary filter is always a pill `Tabs`, verbose filters
 * are always `Select`s, section nav is always an underline `Tabs`. A page cannot
 * substitute a different widget, so the controls can never drift apart. Every
 * row is optional and collapses; all controls live inside the panel. See
 * `docs/design-system/admin/theme/components.md`.
 */
export function PageHero({ title, subtitle, actions, location, filter, dropdowns, nav }: Props) {
  const hasMeta = !!(subtitle || actions);
  const hasFilters = !!(filter || dropdowns?.length);
  return (
    <header className="v2-page-header v2-hero">
      <h1 className="v2-page-title">{title}</h1>

      {hasMeta && (
        <div className="v2-hero-row v2-hero-meta">
          {subtitle && <p className="v2-page-subtitle">{subtitle}</p>}
          {actions && <div className="v2-page-actions">{actions}</div>}
        </div>
      )}

      {location && (
        <div className="v2-hero-row v2-hero-find">
          <div className="v2-hero-loc">
            <LocationFilter
              value={location.value}
              onChange={location.onChange}
              includeAll={location.includeAll}
              allLabel={location.allLabel}
            />
          </div>
        </div>
      )}

      {hasFilters && (
        <div className="v2-hero-filters">
          {filter && (
            <Tabs
              value={filter.value}
              onChange={filter.onChange}
              tabs={filter.options}
              variant="pill"
              ariaLabel={filter.ariaLabel ?? "Filter"}
            />
          )}
          {dropdowns?.map((d, i) => (
            <Select
              key={i}
              aria-label={d.ariaLabel}
              value={d.value}
              onChange={(e) => d.onChange(e.target.value)}
              options={d.options}
            />
          ))}
        </div>
      )}

      {nav && (
        <div className="v2-hero-tabs">
          <Tabs
            value={nav.value}
            onChange={nav.onChange}
            tabs={nav.options}
            variant="underline"
            ariaLabel={nav.ariaLabel ?? "View"}
          />
        </div>
      )}
    </header>
  );
}
