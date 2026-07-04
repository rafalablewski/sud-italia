import type { ReactNode } from "react";

/**
 * The unified Core surface **ActionBar** — the ONE control row every Core surface
 * renders directly under the command bar, over the stat strip, with FIXED
 * element homes (the unified-header contract):
 *
 *   {SECTION · PAGE}     [ view/scope · filters · date ]  ·····  [ utilities · primary ]
 *      ↑ identity                ↑ left (controls)                     ↑ right (actions)
 *
 * This single row **replaces the old three-row stack** (`CoreCrumb` breadcrumb +
 * `CoreSectionHead` title + this toolbar): the breadcrumb duplicated the command
 * bar's own `core ❯ surface:tab` prompt, and the oversized section head repeated
 * it a second time — so both were dropped. What was worth keeping — a slim
 * identity, the working controls, and the actions — collapses here.
 *
 * `left` holds what you scope the view WITH (the view/scope switch that used to
 * ride the section-head right, plus search / date / channel chips); `right` holds
 * what you DO (refresh, the primary create). Same discipline as before: every
 * surface renders this in the same place so the controls never move between tabs,
 * and the row height is locked in the theme so the stat strip never shifts.
 *
 * See `docs/design-system/core/theme/README.md` → `.core-surf-toolbar`.
 */
export function CoreSurfToolbar({
  section,
  page,
  sub,
  left,
  right,
  className,
  ariaLabel,
}: {
  /** Title-case surface family, e.g. `Service`, `Guest`, `POS`, `Orders`. */
  section: string;
  /** Title-case page within the surface, e.g. `Tables`. Omit for single-page surfaces (Orders). */
  page?: string;
  /** The uppercase-mono context line under the title. */
  sub?: ReactNode;
  /** The view/scope switch + filters / date / search — what you scope the view with. */
  left?: ReactNode;
  /** Utilities + the primary action — what you DO on this surface. */
  right?: ReactNode;
  /** Extra class for surface-specific tuning (kept additive). */
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      className={className ? `core-surf-toolbar ${className}` : "core-surf-toolbar"}
      role="toolbar"
      aria-label={ariaLabel ?? "Surface controls"}
    >
      {/* Identity — the slim page anchor that replaces the dropped breadcrumb +
          oversized section head: {Section·Page} over an uppercase-mono context. */}
      <div className="core-surf-id">
        <span className="t">
          {section}
          {page ? (
            <>
              <span className="mid">·</span>
              {page}
            </>
          ) : null}
        </span>
        {sub != null && <span className="s">{sub}</span>}
      </div>
      {left}
      <div className="core-sp" />
      {right}
    </div>
  );
}
