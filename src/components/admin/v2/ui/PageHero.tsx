import type { ReactNode } from "react";
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
  /** Primary list/status filter — row 4. ALWAYS a pill `Tabs`. Use for short option sets. */
  filter?: { value: string; onChange: (value: string) => void; options: TabOption[]; ariaLabel?: string };
  /** Secondary filters with many/long options — row 4, after the pill filter.
   *  ALWAYS rendered as `Select` dropdowns (consistent verbose-filter widget). */
  dropdowns?: { ariaLabel: string; value: string; onChange: (value: string) => void; options: SelectOption[] }[];
  /** Section navigation — row 5. ALWAYS an underline `Tabs`. */
  nav?: { value: string; onChange: (value: string) => void; options: TabOption[]; ariaLabel?: string };
}

/**
 * The legacy subpage hero — a raised panel (platinum left rail) laid out as
 * fixed stacked rows:
 *
 *   1. title
 *   2. subtitle (left) ⟷ actions (right)
 *   3. filter (pill) + verbose dropdowns
 *   4. nav (underline tabs)
 *
 * **Being retired** by the redesign: identity/control split into `PageHeader` +
 * `ViewToolbar` (Phase 3). **Location was removed (Phase 2)** — site context now
 * lives in the shell `ScopeSwitcher`, not in the hero. The primary filter is
 * always a pill `Tabs`, verbose filters are `Select`s, section nav is an
 * underline `Tabs`. See `docs/design-system/admin/theme/components.md`.
 */
export function PageHero({ title, subtitle, actions, filter, dropdowns, nav }: Props) {
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
