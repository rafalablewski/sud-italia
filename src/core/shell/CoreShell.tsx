import Link from "next/link";
import type { ReactNode } from "react";
import { CoreNav } from "./CoreNav";
import { CoreClock, CoreThemeToggle, CoreLocationChip } from "./CoreChrome";
import { PressureBadge } from "./PressureBadge";
import { CommandPalette } from "./CommandPalette";
import { CoreHandover } from "./CoreHandover";
import { CoreNotificationsBell } from "./CoreNotificationsBell";
import { CoreDock } from "./CoreDock";

export interface CoreTab {
  label: string;
  href?: string;
  active?: boolean;
  onClick?: () => void;
}

/**
 * The one chrome every Core surface shares — the Service OS three-region IA:
 * a thin Command Bar (top), the Lens Rail (left, `CoreNav`), the surface Canvas
 * (right), and the persistent Context Dock (`CoreDock`, docked bottom). The
 * Command Bar holds global state (location · ⌘K · pressure · clock · user); the
 * Lens Rail switches how you view the room; the selected entity persists across
 * lenses and its check stays docked.
 *
 * Core is a SEPARATE entity from /admin: this renders none of the admin
 * shell. It loads only the core theme (see src/app/core/layout.tsx).
 */
export function CoreShell({
  eyebrow,
  tabs,
  subRight,
  bleed = false,
  children,
}: {
  eyebrow: string;
  tabs?: CoreTab[];
  subRight?: ReactNode;
  /** Surface paints its own full-bleed background (KDS dark wall). */
  bleed?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {/* Single optimised command bar: brand · context (eyebrow + view tabs)
          · the surface's own controls · global controls. The primary surface
          switcher moved to the bottom nav (CoreNav, below). */}
      <header className="core-bar">
        <div className="core-brand">
          <div className="core-mark">S</div>
          <div>
            <div className="nm">Ottaviano</div>
            <div className="os">Core OS</div>
          </div>
        </div>
        {/* contextual strip — pinned brand (left) + global controls (right)
            stay put; this middle scrolls horizontally if it can't all fit */}
        <div className="core-bar-ctx">
          <span className="core-eyebrow">{eyebrow}</span>
          {tabs && tabs.length > 0 && (
            <div className="core-tabs">
              {tabs.map((t) =>
                t.href ? (
                  <Link key={t.label} href={t.href} className={t.active ? "on" : undefined}>
                    {t.label}
                  </Link>
                ) : (
                  <button key={t.label} type="button" className={t.active ? "on" : undefined} onClick={t.onClick}>
                    {t.label}
                  </button>
                ),
              )}
            </div>
          )}
          <div className="core-sp" />
          {subRight}
        </div>
        <div className="core-right">
          <button type="button" className="core-cmdk-trigger" title="Search — tables, lenses, dishes (⌘K)" onClick={() => window.dispatchEvent(new Event("core:cmdk"))}>
            <span className="si">⌕</span><kbd>⌘K</kbd>
          </button>
          <PressureBadge />
          <CoreLocationChip />
          <CoreClock />
          <CoreNotificationsBell />
          <CoreThemeToggle />
        </div>
      </header>

      {/* The Canvas region: the Lens Rail (left) beside the surface body. */}
      <div className="core-main">
        <CoreNav />
        <div className={bleed ? "core-body bleed" : "core-body"}>{children}</div>
      </div>

      {/* Persistent Context Dock — the selected entity's check, following the
          operator across every lens. Renders null until something is selected
          (additive; see SelectionContext / CoreDock). */}
      <CoreDock />
      <CommandPalette />
      <CoreHandover />
    </>
  );
}
