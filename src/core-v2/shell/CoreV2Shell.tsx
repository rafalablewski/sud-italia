import Link from "next/link";
import type { ReactNode } from "react";
import { CoreV2Nav } from "./CoreV2Nav";
import { CoreV2Clock, CoreV2ThemeToggle, CoreV2LocationChip } from "./CoreV2Chrome";

export interface CoreV2Tab {
  label: string;
  href?: string;
  active?: boolean;
}

/**
 * The one chrome every Core v2 surface shares — a fixed two-row header over a
 * surface body, no sidebar. Row 1 = brand + the primary surface switcher
 * (CoreV2Nav) + global actions (location · clock · theme · fullscreen). Row 2 =
 * the context subbar (eyebrow + the surface's view tabs + its own controls).
 *
 * Core v2 is a SEPARATE entity from /admin: this renders none of the admin
 * shell. It loads only the core-v2 theme (see src/app/core-v2/layout.tsx).
 */
export function CoreV2Shell({
  eyebrow,
  tabs,
  subRight,
  bleed = false,
  children,
}: {
  eyebrow: string;
  tabs?: CoreV2Tab[];
  subRight?: ReactNode;
  /** Surface paints its own full-bleed background (KDS dark wall). */
  bleed?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <header className="cv-bar">
        <div className="cv-brand">
          <div className="cv-mark">S</div>
          <div>
            <div className="nm">Sud Italia</div>
            <div className="os">Core OS</div>
          </div>
        </div>
        <CoreV2Nav />
        <div className="cv-right">
          <CoreV2LocationChip />
          <CoreV2Clock />
          <CoreV2ThemeToggle />
        </div>
      </header>

      <div className="cv-sub">
        <span className="cv-eyebrow">{eyebrow}</span>
        {tabs && tabs.length > 0 && (
          <div className="cv-tabs">
            {tabs.map((t) =>
              t.href ? (
                <Link key={t.label} href={t.href} className={t.active ? "on" : undefined}>
                  {t.label}
                </Link>
              ) : (
                <button key={t.label} type="button" className={t.active ? "on" : undefined}>
                  {t.label}
                </button>
              ),
            )}
          </div>
        )}
        <div className="cv-sp" />
        {subRight}
      </div>

      <div className={bleed ? "cv-body bleed" : "cv-body"}>{children}</div>
    </>
  );
}
