import type { ReactNode } from "react";

interface Props {
  /** Page title — the serif display h1, alone on row 1. */
  title: ReactNode;
  /** One-line description — row 2, left. */
  subtitle?: ReactNode;
  /** Location filter (e.g. `<LocationFilter />`) — row 3, right. */
  locations?: ReactNode;
  /** Icon-only actions (compressed primary + secondary) — row 2, right. */
  actions?: ReactNode;
  /** Search control — row 3, left (grows). */
  search?: ReactNode;
  /** List/status filter (`Tabs variant="pill"`) — row 4. */
  filters?: ReactNode;
  /** Section-navigation tabs / secondary filter row — row 5. */
  tabs?: ReactNode;
}

/**
 * The one shared subpage hero. A raised panel with a platinum left rail, laid
 * out as fixed stacked rows so every admin page reads identically:
 *
 *   1. title
 *   2. description (left) ⟷ actions (right)
 *   3. search (left) ⟷ location (right)
 *   4. filters (list/status pill)
 *   5. tabs (section navigation / secondary filters)
 *
 * Every row is optional and collapses gracefully; all controls live INSIDE the
 * panel — nothing floats below. Used by every `/admin` page (Core-shell surfaces
 * excepted). See `docs/design-system/admin/theme/components.md` (Page hero).
 */
export function PageHero({ title, subtitle, locations, actions, search, filters, tabs }: Props) {
  const hasMeta = !!(subtitle || actions);
  const hasFind = !!(search || locations);
  return (
    <header className="v2-page-header v2-hero">
      <h1 className="v2-page-title">{title}</h1>
      {hasMeta && (
        <div className="v2-hero-row v2-hero-meta">
          {subtitle && <p className="v2-page-subtitle">{subtitle}</p>}
          {actions && <div className="v2-page-actions">{actions}</div>}
        </div>
      )}
      {hasFind && (
        <div className="v2-hero-row v2-hero-find">
          {search && <div className="v2-hero-search">{search}</div>}
          {locations && <div className="v2-hero-loc">{locations}</div>}
        </div>
      )}
      {filters && <div className="v2-hero-filters">{filters}</div>}
      {tabs && <div className="v2-hero-tabs">{tabs}</div>}
    </header>
  );
}
