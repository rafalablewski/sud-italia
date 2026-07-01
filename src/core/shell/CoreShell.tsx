import Link from "next/link";
import type { ReactNode } from "react";
import { CoreNav } from "./CoreNav";
import { CoreClock, CoreThemeToggle, CoreLocationChip, CorePrompt, CmdkLauncher } from "./CoreChrome";
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
      {/* "Command" — a keyboard-first terminal command bar: traffic-light chrome
          · a live shell prompt (core ❯ surface:tab) + blinking caret · mono
          view-tab chips · the surface's own controls (subRight) · a ⌘K launcher
          · a risk·loc·clock telemetry cluster · the global bell + theme tools.
          The primary surface switcher is the left Lens Rail (CoreNav, below). */}
      <header className="core-bar">
        <div className="cm-lights" aria-hidden>
          <i />
          <i />
          <i />
        </div>
        <div className="cm-div" aria-hidden />
        <CorePrompt tabs={tabs} title={eyebrow} />
        <div className="cm-div" aria-hidden />
        {tabs && tabs.length > 0 && (
          <div className="core-tabs cm-tabs">
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
        <div className="cm-sp" />
        {subRight && <div className="cm-surf">{subRight}</div>}
        <CmdkLauncher />
        <div className="cm-tel">
          <PressureBadge />
          <CoreLocationChip />
          <CoreClock />
        </div>
        <div className="cm-right">
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
