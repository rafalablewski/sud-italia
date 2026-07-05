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
 * `CoreSectionHead` title + this toolbar): the breadcrumb, the section-head title
 * AND the context sub-line were all dropped — the command bar's `core ❯
 * surface:tab` prompt already names the surface and the stat strip below carries
 * the live figures, so the bar carries only the WORKING controls.
 *
 * `left` holds what you scope the view WITH (the view/scope switch, search, date,
 * channel chips); `right` holds what you DO (refresh, filter menu, the primary
 * create). Every surface renders this in the same place so the controls never
 * move between tabs, and the row height is locked in the theme so the stat strip
 * never shifts.
 *
 * See `docs/design-system/core/theme/README.md` → `.core-surf-toolbar`.
 */
export function CoreSurfToolbar({
  left,
  right,
  className,
  ariaLabel,
}: {
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
      {left}
      <div className="core-sp" />
      {right}
    </div>
  );
}
