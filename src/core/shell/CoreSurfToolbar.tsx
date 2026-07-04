import type { ReactNode } from "react";

/**
 * Row 4 of the unified Core header — the surface control strip that sits
 * directly under the {@link CoreSectionHead}, over the stat strip, with FIXED
 * element homes (the unified-header contract):
 *
 *   [ filters · date · search ]   ·····spacer·····   [ utilities · primary action ]
 *          ↑ left                                              ↑ right
 *
 * Same discipline as `CoreCrumb` / `CoreSectionHead`: every surface renders this
 * one row in the same place, so the working controls never move between tabs.
 * `left` holds the things you filter/scope the view WITH (search, date, channel
 * chips); `right` holds the things you DO (refresh, primary create, kiosk).
 * Passing neither renders the explicit empty state rather than collapsing the
 * row — the row height is locked in the theme so the stat strip below never
 * shifts between a surface that has controls and one that doesn't.
 *
 * Replaces the old split where a surface's controls lived three different ways
 * (shell `subLeft`/`subRight` above the crumb, bespoke in-body bars, or the
 * command bar): the toolbar now has ONE home, row 4, on every surface.
 */
export function CoreSurfToolbar({
  left,
  right,
  className,
  ariaLabel,
}: {
  /** Filters / date / search — what you scope the view with. */
  left?: ReactNode;
  /** Utilities + the primary action — what you DO on this surface. */
  right?: ReactNode;
  /** Extra class for surface-specific tuning (kept additive). */
  className?: string;
  ariaLabel?: string;
}) {
  const empty = left == null && right == null;
  return (
    <div
      className={className ? `core-surf-toolbar ${className}` : "core-surf-toolbar"}
      role="toolbar"
      aria-label={ariaLabel ?? "Surface controls"}
    >
      {empty ? (
        <span className="core-surf-empty">— no page controls —</span>
      ) : (
        <>
          {left}
          <div className="core-sp" />
          {right}
        </>
      )}
    </div>
  );
}
