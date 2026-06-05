"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AdminLocationProviderV3 } from "./LocationContext";
import { SidebarV3 } from "./SidebarV3";
import { TopbarV3 } from "./TopbarV3";

const COLLAPSE_KEY = "sud-admin-v3-collapsed";

export function AdminShellV3({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage may be blocked */
    }
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* non-fatal */
      }
      return next;
    });
  }, []);

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <AdminLocationProviderV3>
      <div className="av3-shell" data-collapsed={collapsed} data-mobile-open={mobileOpen}>
        {mobileOpen && <div className="av3-scrim" onClick={() => setMobileOpen(false)} aria-hidden />}
        <SidebarV3 collapsed={collapsed} onToggleCollapse={toggleCollapse} onNavigate={() => setMobileOpen(false)} />
        <div className="av3-main">
          <TopbarV3 onOpenMobileNav={() => setMobileOpen(true)} />
          <main className="av3-content">{children}</main>
        </div>
      </div>
    </AdminLocationProviderV3>
  );
}
