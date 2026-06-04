import type { ReactNode } from "react";

export interface PageHeroStat {
  label: ReactNode;
  value: ReactNode;
}

interface Props {
  /** Page title — rendered as the serif display h1. */
  title: ReactNode;
  /** Optional one-line description under the title. */
  subtitle?: ReactNode;
  /** Location filter (e.g. `<LocationFilter />`). Sits under the title. */
  locations?: ReactNode;
  /** Centered headline stats (1–3). Omit and the centre collapses. */
  stats?: PageHeroStat[];
  /** Right-aligned actions — icon-only secondary + a (compressed) primary. */
  actions?: ReactNode;
  /** Search control — fills the left of the folded second tier. */
  search?: ReactNode;
  /** Segmented status filters — sit on the right of the second tier. */
  filters?: ReactNode;
}

/**
 * The one shared subpage hero (design V5.1). A raised panel with a platinum
 * left rail: title + location on the left, centered headline stats, actions on
 * the right; an optional second tier folds in search + status filters. Every
 * slot is optional and collapses gracefully — a title-only page just renders a
 * clean panel. Used by every `/admin` page so controls live in the same place
 * everywhere. See `docs/design-system/admin/theme/components.md` (Page hero).
 */
export function PageHero({ title, subtitle, locations, stats, actions, search, filters }: Props) {
  const hasStats = !!stats?.length;
  const hasTier2 = !!(search || filters);
  return (
    <header className="v2-page-header v2-hero">
      <div className="v2-hero-top">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">{title}</h1>
          {subtitle && <p className="v2-page-subtitle">{subtitle}</p>}
          {locations && <div className="v2-hero-loc">{locations}</div>}
        </div>
        {hasStats && (
          <div className="v2-hero-stats">
            {stats!.map((s, i) => (
              <div className="v2-hero-stat" key={i}>
                <span className="v2-hero-stat-k">{s.label}</span>
                <span className="v2-hero-stat-v tabular">{s.value}</span>
              </div>
            ))}
          </div>
        )}
        {actions && <div className="v2-page-actions">{actions}</div>}
      </div>
      {hasTier2 && (
        <div className="v2-hero-tier2">
          {search && <div className="v2-hero-search">{search}</div>}
          {filters && <div className="v2-hero-filters">{filters}</div>}
        </div>
      )}
    </header>
  );
}
