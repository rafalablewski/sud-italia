"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AdminLocationProvider } from "./LocationContext";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

interface Props {
  children: ReactNode;
}

/**
 * Routes that render outside the shell chrome (no sidebar/topbar).
 * Login is unauthenticated; nothing else qualifies yet.
 */
const BARE_ROUTES = ["/admin/login"];

export function AdminShell({ children }: Props) {
  const pathname = usePathname();
  const isBare = BARE_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile drawer when route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock scroll while drawer is open
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  if (isBare) {
    return <>{children}</>;
  }

  return (
    <AdminLocationProvider>
      <div className="v2-shell">
        <Sidebar />

        {mobileOpen && (
          <div className="v2-mobile-drawer" role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="v2-mobile-scrim" onClick={() => setMobileOpen(false)} aria-hidden />
            <div className="v2-mobile-panel">
              <Sidebar isMobile onCloseMobile={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        <div className="v2-main">
          <Topbar onOpenMobileNav={() => setMobileOpen(true)} />
          <main className="v2-content">{children}</main>
        </div>
      </div>
    </AdminLocationProvider>
  );
}
