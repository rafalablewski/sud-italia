"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { CoreNav } from "./CoreNav";

/**
 * The Core suite shell — one self-contained chrome shared by **every** Core
 * surface (POS, KDS, Guest, Service). Core is a separate entity from /admin:
 * this shell does NOT render the admin sidebar or import anything from the
 * admin v2 shell. There is no sidebar at all.
 *
 * Layout (identical for all four surfaces, so each subpage's controls sit in
 * the same place):
 *
 *   ┌ header (row 1) ────────────────────────────────────────────┐
 *   │ [brand]   [CoreNav: POS · KDS · Guest · Service]   {right} │
 *   ├ subbar (row 2, only when eyebrow/viewnav/subRight given) ───┤
 *   │ {eyebrow} {viewnav}                            {subRight}  │
 *   └────────────────────────────────────────────────────────────┘
 *   {children}
 *
 * - `right`    — global header actions (location toggle, fullscreen…).
 * - `eyebrow`  — small label at the start of row 2 (e.g. "Guest Engagement").
 * - `viewnav`  — the surface's sub-view tabs (GuestViewNav, ServiceViewNav,
 *                the KDS Fleet/Floor/Chef switch).
 * - `subRight` — the surface's own controls (POS channel/steer, the date
 *                picker, the KDS stage filter + clock…).
 *
 * `bleed` drops the body padding/scroll container so a full-bleed surface
 * (the KDS wall) can own its own layout.
 */

export function CoreShell({
  right,
  eyebrow,
  viewnav,
  subRight,
  bleed = false,
  children,
}: {
  right?: ReactNode;
  eyebrow?: ReactNode;
  viewnav?: ReactNode;
  subRight?: ReactNode;
  bleed?: boolean;
  children: ReactNode;
}) {
  const hasSub = Boolean(eyebrow || viewnav || subRight);
  return (
    <div className="core-suite">
      <div className="core-shell">
        <header className="core-head">
          <Link href="/core/pos" className="brand" aria-label="Ottaviano Core">
            <div className="brand-mark">SI</div>
            <div>
              <div className="brand-name">Ottaviano</div>
              <div className="brand-sub">Core</div>
            </div>
          </Link>
          <CoreNav />
          {right && <div className="core-head-right">{right}</div>}
        </header>

        {hasSub && (
          <div className="subbar">
            <div className="subbar-left">
              {eyebrow && <span className="eyebrow">{eyebrow}</span>}
              {viewnav && <div className="viewnav">{viewnav}</div>}
            </div>
            {subRight && <div className="subbar-right">{subRight}</div>}
          </div>
        )}

        <div className={bleed ? "core-body bleed" : "core-body"}>{children}</div>
      </div>
    </div>
  );
}
