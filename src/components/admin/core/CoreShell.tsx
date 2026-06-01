"use client";

import { type ReactNode } from "react";
import { Sidebar } from "../v2/Sidebar";

/**
 * The Core suite shell — the mockup's topbar + the shared admin sidebar
 * (`.core-suite` is a fixed full-viewport layer). Replaces the admin chrome on
 * /admin/pos and /admin/guest (AdminShell steps aside for those routes; KDS
 * runs its own `.kds-core` wall with no sidebar).
 *
 * The sidebar is the **same `<Sidebar>` component AdminShell renders** — one
 * source of truth (`.app-sidebar`), full navigation, so POS / Guest and the
 * rest of admin are pixel-identical. CoreShell only owns the topbar + body.
 */

type CoreKey = "pos" | "kds" | "guest";

export function CoreShell({
  crumbs,
  viewnav,
  topbarRight,
  children,
}: {
  /**
   * Legacy: which core surface is active. The shared sidebar highlights by
   * pathname (it lists every route), so this no longer drives the active
   * state — kept optional so existing call sites don't need to change.
   */
  active?: CoreKey;
  /** Breadcrumb content, e.g. <>Core / <b>Guest Engagement</b></>. */
  crumbs: ReactNode;
  /** Optional sub-view switcher (rendered in the topbar `.viewnav` slot). */
  viewnav?: ReactNode;
  /** Optional right-aligned topbar actions. */
  topbarRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="core-suite">
      <div className="shell">
        <Sidebar />

        <div className="main">
          <div className="topbar">
            <div className="crumbs">{crumbs}</div>
            {viewnav && (
              <div className="viewnav" style={{ marginLeft: 10 }}>
                {viewnav}
              </div>
            )}
            {topbarRight && <div className="topbar-right">{topbarRight}</div>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
