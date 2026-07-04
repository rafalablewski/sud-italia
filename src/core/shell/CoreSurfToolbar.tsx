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
 * `CoreSectionHead` title + this toolbar): the breadcrumb AND the section-head
 * title both duplicated the command bar's own `core ❯ surface:tab` prompt, so
 * both were dropped. The bar's far-left anchor is now just the **context** line
 * (`sub` — date · service · location), which the command bar does NOT carry.
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
  sub,
  left,
  right,
  className,
  ariaLabel,
}: {
  /** The uppercase-mono context line anchoring the bar's left (date · service · location). */
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
      {/* Context anchor — the surface's uppercase-mono context line (the command
          bar already carries the `core ❯ surface:tab` identity, so no title). */}
      {sub != null && <div className="core-surf-id">{sub}</div>}
      {left}
      <div className="core-sp" />
      {right}
    </div>
  );
}
